/**
 * ROSA Shoulder POC: every automatic step of a ROSA deal, in one place (docs/ROSA_Shoulder_POC_Build_Spec.md, section 8).
 *
 * Who calls it: the six ROSA triggers (ROSA_DealTrigger, ROSA_ChecklistTrigger, ROSA_SurgeonTrigger, ROSA_PriceTrigger,
 * ROSA_CredentialingAnswerTrigger) and ROSAAutomationTest.
 * What it touches:
 * - SalesRisks__Share: the deal shared with its ROSA Deal Lead and Sales Rep (both edit).
 * - SalesRisks__c (ROSA record types only): Stage__c on create and when checklist steps are ticked, Close_Date__c from step 6,
 *   ROSA_Checklist__c, and the ROSA surgeon totals (ROSA_Surgeon_Count__c ... ROSA_Share_Other__c, ROSA_Surgeons_Credentialed__c).
 *   ROSAGrowthDollar__c: the sum of the surgeons' growth $ once the deal has surgeons and prices (Robert, 2026-11-27);
 *   a deal with no surgeons keeps its typed-in value.
 * - Robotics__c (ROSA Checklist): creates one per new ROSA deal (record type ROSA_Deal_Checklist); fills step dates, Done by and
 *   Highest step; ticks step 7c when every surgeon on the deal is credentialed.
 * - Robotics_Surgeons__c (ROSA Surgeons): fills ROSA_Deal__c from an old checklist link, the duplicate key, and the
 *   credentialing (question set from the pathway, status, Questions to answer, Gaps).
 * - ROSA_Price__c: the duplicate key. ROSA_Credentialing_Answer__c: creates one per question for a surgeon's question set,
 *   and fills Answered, Answered by and Answered date. Reads ROSA_Question_Set__c and ROSA_Question__c (ROSA's own question
 *   bank, Robert 2026-11-28: nothing from APAC Events).
 * Runs without sharing: these are system-kept values (totals, keys, stage from the checklist), written whoever saves the record.
 */
public without sharing class ROSAAutomation {
  public static final String CHECKLIST_RT = 'ROSA_Deal_Checklist';
  public static final String DEAL_LOST = 'Deal Lost';
  /** ROSA stages in order. A stage only ever moves forward along this list. */
  public static final List<String> STAGES = new List<String>{
    'Sales Pipeline',
    'Surgeon Engagement',
    'Executive Presentation',
    'Negotiation',
    'Closed Won'
  };
  public static final List<String> STEPS = new List<String>{
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7a',
    '7b',
    '7c',
    '7d'
  };
  public static final List<String> JOINTS = new List<String>{
    'TKA',
    'PKA',
    'THA',
    'TSA_RSA'
  };
  /** Deal total field name part for each surgeon joint. */
  private static final Map<String, String> DEAL_JOINT = new Map<String, String>{
    'TKA' => 'TKA',
    'PKA' => 'PKA',
    'THA' => 'THA',
    'TSA_RSA' => 'Shoulder'
  };
  /** Supplier value => deal share field. */
  private static final Map<String, String> SHARE_FIELD = new Map<String, String>{
    'ZB' => 'ROSA_Share_ZB__c',
    'J&J' => 'ROSA_Share_JJ__c',
    'Stryker' => 'ROSA_Share_Stryker__c',
    'Smith & Nephew' => 'ROSA_Share_SN__c',
    'Other' => 'ROSA_Share_Other__c'
  };

  // ------------------------------------------------------------------ record types

  private static Map<Id, Schema.RecordTypeInfo> dealTypes {
    get {
      if (dealTypes == null) {
        dealTypes = SalesRisks__c.SObjectType.getDescribe()
          .getRecordTypeInfosById();
      }
      return dealTypes;
    }
    set;
  }

  /** True for every ROSA record type of SalesRisks__c (AUROSA ... REGIONALROSA, China_ROSA_Opportunity). */
  public static Boolean isRosaDeal(Id recordTypeId) {
    Schema.RecordTypeInfo info = recordTypeId == null
      ? null
      : dealTypes.get(recordTypeId);
    return info != null &&
      info.getDeveloperName().toUpperCase().contains('ROSA');
  }

  public static Id checklistTypeId() {
    Schema.RecordTypeInfo info = Robotics__c.SObjectType.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(CHECKLIST_RT);
    return info == null ? null : info.getRecordTypeId();
  }

  // ------------------------------------------------------------------ F1: a new ROSA deal

  /** Before insert: a ROSA deal with no stage starts at Sales Pipeline. */
  public static void dealBeforeInsert(List<SalesRisks__c> deals) {
    for (SalesRisks__c d : deals) {
      if (isRosaDeal(d.RecordTypeId) && String.isBlank(d.Stage__c)) {
        d.Stage__c = STAGES[0];
      }
    }
  }

  /** After insert: one ROSA Checklist per new ROSA deal, linked back through ROSA_Checklist__c. */
  public static void dealAfterInsert(List<SalesRisks__c> deals) {
    Schema.RecordTypeInfo info = Robotics__c.SObjectType.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(CHECKLIST_RT);
    if (info == null || !info.isAvailable()) {
      return; // the person has no ROSA Deal Management permission set; the deal saves without a checklist
    }
    Id rt = info.getRecordTypeId();
    List<Robotics__c> lists = new List<Robotics__c>();
    for (SalesRisks__c d : deals) {
      if (isRosaDeal(d.RecordTypeId) && d.ROSA_Checklist__c == null) {
        lists.add(
          new Robotics__c(
            Name = checklistName(d.Name),
            RecordTypeId = rt,
            Sales_Risks__c = d.Id,
            Healthcare_Facility__c = d.Healthcare_Facility__c
          )
        );
      }
    }
    if (lists.isEmpty()) {
      return;
    }
    Database.insert(lists, true, AccessLevel.SYSTEM_MODE);
    List<SalesRisks__c> links = new List<SalesRisks__c>();
    for (Robotics__c c : lists) {
      links.add(
        new SalesRisks__c(Id = c.Sales_Risks__c, ROSA_Checklist__c = c.Id)
      );
    }
    Database.update(links, true, AccessLevel.SYSTEM_MODE);
  }

  /** "ROSA Checklist for ROSA deal 02030" (Robert, 2026-11-27: not the record Id). */
  public static String checklistName(String dealName) {
    return ('ROSA Checklist for ROSA deal ' +
      (dealName == null ? '' : dealName))
      .trim()
      .left(80);
  }

  // ------------------------------------------------------------------ sharing the deal with its lead and sales rep
  // Robert, 2026-11-27: Opportunities & Risks are private, so naming a ROSA Deal Lead or Sales Rep did not let them see the
  // deal. The ROSA Deal Lead and the Sales Rep both get edit (Robert, 2026-11-27: for the time being), as Apex sharing that follows the fields (changed or cleared
  // fields take the old share away). The owner already has access and gets no share.

  public static void shareDeals(
    List<SalesRisks__c> deals,
    Map<Id, SalesRisks__c> oldMap
  ) {
    Map<Id, SalesRisks__c> todo = new Map<Id, SalesRisks__c>();
    for (SalesRisks__c d : deals) {
      SalesRisks__c o = oldMap == null ? null : oldMap.get(d.Id);
      Boolean changed =
        o == null ||
        o.ROSA_Overlord__c != d.ROSA_Overlord__c ||
        o.ROSA_Sales_Rep__c != d.ROSA_Sales_Rep__c ||
        o.OwnerId != d.OwnerId;
      if (changed && isRosaDeal(d.RecordTypeId)) {
        todo.put(d.Id, d);
      }
    }
    syncShares(todo.values());
  }

  /** Rebuilds the two ROSA shares (both edit) on the given deals (also used once to bring existing deals up to date). */
  public static void syncShares(List<SalesRisks__c> deals) {
    if (deals == null || deals.isEmpty()) {
      return;
    }
    String lead = Schema.SalesRisks__Share.RowCause.ROSA_Deal_Lead__c;
    String rep = Schema.SalesRisks__Share.RowCause.ROSA_Sales_Rep__c;
    Set<Id> ids = new Map<Id, SalesRisks__c>(deals).keySet();
    Database.delete(
      [
        SELECT Id
        FROM SalesRisks__Share
        WHERE ParentId IN :ids AND RowCause IN (:lead, :rep)
        WITH SYSTEM_MODE
      ],
      false,
      AccessLevel.SYSTEM_MODE
    );
    Set<Id> users = new Set<Id>();
    for (SalesRisks__c d : deals) {
      users.add(d.ROSA_Overlord__c);
      users.add(d.ROSA_Sales_Rep__c);
    }
    Set<Id> active = new Map<Id, User>(
        [
          SELECT Id
          FROM User
          WHERE Id IN :users AND IsActive = TRUE
          WITH SYSTEM_MODE
        ]
      )
      .keySet();
    List<SalesRisks__Share> shares = new List<SalesRisks__Share>();
    for (SalesRisks__c d : deals) {
      if (
        d.ROSA_Overlord__c != null &&
        d.ROSA_Overlord__c != d.OwnerId &&
        active.contains(d.ROSA_Overlord__c)
      ) {
        shares.add(
          new SalesRisks__Share(
            ParentId = d.Id,
            UserOrGroupId = d.ROSA_Overlord__c,
            AccessLevel = 'Edit',
            RowCause = lead
          )
        );
      }
      if (
        d.ROSA_Sales_Rep__c != null &&
        d.ROSA_Sales_Rep__c != d.OwnerId &&
        d.ROSA_Sales_Rep__c != d.ROSA_Overlord__c &&
        active.contains(d.ROSA_Sales_Rep__c)
      ) {
        shares.add(
          new SalesRisks__Share(
            ParentId = d.Id,
            UserOrGroupId = d.ROSA_Sales_Rep__c,
            AccessLevel = 'Edit',
            RowCause = rep
          )
        );
      }
    }
    Database.insert(shares, false, AccessLevel.SYSTEM_MODE); // a share Salesforce refuses (already has more access) is skipped
  }

  // ------------------------------------------------------------------ F2: checklist before save

  private static Boolean done(SObject r, String s) {
    return r != null && r.get('ROSA_Step_' + s + '_Done__c') == true;
  }

  public static void checklistBeforeSave(
    List<Robotics__c> lists,
    Map<Id, Robotics__c> oldMap
  ) {
    Id rt = checklistTypeId();
    for (Robotics__c c : lists) {
      if (c.RecordTypeId != rt) {
        continue;
      }
      Robotics__c old = oldMap == null ? null : oldMap.get(c.Id);
      Integer highest = 0;
      for (Integer i = 0; i < STEPS.size(); i++) {
        String s = STEPS[i];
        Boolean nowDone = done(c, s);
        Boolean wasDone = done(old, s);
        if (nowDone && !wasDone) {
          if (c.get('ROSA_Step_' + s + '_Date__c') == null) {
            c.put('ROSA_Step_' + s + '_Date__c', Date.today());
          }
          c.put('ROSA_Step_' + s + '_Done_By__c', UserInfo.getUserId());
        } else if (!nowDone && wasDone) {
          c.put('ROSA_Step_' + s + '_Done_By__c', null);
        }
        if (nowDone) {
          highest = Math.max(highest, i < 6 ? i + 1 : 7);
        }
      }
      c.ROSA_Highest_Step__c = highest;
    }
  }

  // ------------------------------------------------------------------ F3: checklist moves the deal's stage

  /** The stage a highest step means (section 2 of the spec). */
  public static String stageFor(Integer highest) {
    if (highest == null || highest <= 0) {
      return STAGES[0];
    }
    if (highest <= 3) {
      return 'Surgeon Engagement';
    }
    if (highest == 4) {
      return 'Executive Presentation';
    }
    if (highest == 5) {
      return 'Negotiation';
    }
    return 'Closed Won';
  }

  public static void checklistAfterUpdate(
    List<Robotics__c> lists,
    Map<Id, Robotics__c> oldMap
  ) {
    Id rt = checklistTypeId();
    Map<Id, Robotics__c> byDeal = new Map<Id, Robotics__c>();
    for (Robotics__c c : lists) {
      Robotics__c old = oldMap.get(c.Id);
      Boolean higher =
        (c.ROSA_Highest_Step__c == null ? 0 : c.ROSA_Highest_Step__c) >
        (old.ROSA_Highest_Step__c == null ? 0 : old.ROSA_Highest_Step__c);
      Boolean step6New = c.ROSA_Step_6_Done__c && !old.ROSA_Step_6_Done__c;
      if (
        c.RecordTypeId == rt &&
        c.Sales_Risks__c != null &&
        (higher || step6New)
      ) {
        byDeal.put(c.Sales_Risks__c, c);
      }
    }
    if (byDeal.isEmpty()) {
      return;
    }
    List<SalesRisks__c> changes = new List<SalesRisks__c>();
    List<Robotics__c> sources = new List<Robotics__c>();
    for (SalesRisks__c d : [
      SELECT Id, Stage__c, Close_Date__c, RecordTypeId
      FROM SalesRisks__c
      WHERE Id IN :byDeal.keySet()
      WITH SYSTEM_MODE
    ]) {
      Robotics__c c = byDeal.get(d.Id);
      if (!isRosaDeal(d.RecordTypeId) || d.Stage__c == DEAL_LOST) {
        continue;
      }
      SalesRisks__c u = new SalesRisks__c(Id = d.Id);
      Boolean changed = false;
      String target = stageFor(
        c.ROSA_Highest_Step__c == null ? 0 : c.ROSA_Highest_Step__c.intValue()
      );
      if (STAGES.indexOf(target) > STAGES.indexOf(d.Stage__c)) {
        u.Stage__c = target;
        changed = true;
      }
      if (
        c.ROSA_Step_6_Done__c &&
        !oldMap.get(c.Id).ROSA_Step_6_Done__c &&
        d.Close_Date__c == null
      ) {
        u.Close_Date__c = c.ROSA_Step_6_Date__c;
        changed = true;
      }
      if (changed) {
        changes.add(u);
        sources.add(c);
      }
    }
    saveAndReport(changes, sources);
  }

  /** Saves the deals; a deal that cannot be saved shows its message on the record that caused the change. */
  private static void saveAndReport(
    List<SalesRisks__c> deals,
    List<SObject> sources
  ) {
    if (deals.isEmpty()) {
      return;
    }
    List<Database.SaveResult> results = Database.update(
      deals,
      false,
      AccessLevel.SYSTEM_MODE
    );
    for (Integer i = 0; i < results.size(); i++) {
      if (!results[i].isSuccess()) {
        String msg = results[i].getErrors().isEmpty()
          ? 'unknown error'
          : results[i].getErrors()[0].getMessage();
        sources[i].addError('The ROSA deal could not be updated: ' + msg);
      }
    }
  }

  // ------------------------------------------------------------------ F5: surgeon before save

  public static void surgeonBeforeSave(List<Robotics_Surgeons__c> surgeons) {
    Set<Id> lists = new Set<Id>();
    for (Robotics_Surgeons__c s : surgeons) {
      if (s.ROSA_Deal__c == null && s.Robotics_Surgeon__c != null) {
        lists.add(s.Robotics_Surgeon__c);
      }
    }
    Map<Id, Robotics__c> listMap = lists.isEmpty()
      ? new Map<Id, Robotics__c>()
      : new Map<Id, Robotics__c>(
          [
            SELECT Id, Sales_Risks__c
            FROM Robotics__c
            WHERE Id IN :lists
            WITH SYSTEM_MODE
          ]
        );
    for (Robotics_Surgeons__c s : surgeons) {
      if (
        s.ROSA_Deal__c == null && listMap.containsKey(s.Robotics_Surgeon__c)
      ) {
        s.ROSA_Deal__c = listMap.get(s.Robotics_Surgeon__c).Sales_Risks__c;
      }
      s.ROSA_Deal_Surgeon_Key__c = (s.ROSA_Deal__c != null &&
        s.Surgeon_Name__c != null)
        ? String.valueOf(s.ROSA_Deal__c) +
          String.valueOf(s.Surgeon_Name__c) // 18-character Ids: the key is not case-sensitive
        : null;
    }
  }

  // ------------------------------------------------------------------ F4: deal totals from its surgeons

  public static void surgeonsChanged(
    List<Robotics_Surgeons__c> rows,
    Map<Id, Robotics_Surgeons__c> oldMap
  ) {
    Set<Id> deals = new Set<Id>();
    if (rows != null) {
      for (Robotics_Surgeons__c s : rows) {
        if (s.ROSA_Deal__c != null) {
          deals.add(s.ROSA_Deal__c);
        }
      }
    }
    if (oldMap != null) {
      for (Robotics_Surgeons__c s : oldMap.values()) {
        if (s.ROSA_Deal__c != null) {
          deals.add(s.ROSA_Deal__c);
        }
      }
    }
    if (inTotals) {
      return; // the totals are writing the surgeons' growth $; nothing else to do
    }
    recalcTotals(deals);
  }

  private static Boolean inTotals = false;
  /** Surgeon joint (field part) => price table item. */
  private static final Map<String, String> PRICE_ITEM = new Map<String, String>{
    'TKA' => 'TKA',
    'PKA' => 'PKA',
    'THA' => 'THA',
    'TSA_RSA' => 'TSA/RSA'
  };

  private static Decimal n(SObject r, String f) {
    Object v = r.get(f);
    return v == null ? 0 : (Decimal) v;
  }

  /** Works out every surgeon total on the given ROSA deals and writes each deal once. */
  public static void recalcTotals(Set<Id> dealIds) {
    if (dealIds == null || dealIds.isEmpty()) {
      return;
    }
    Map<Id, SalesRisks__c> totals = new Map<Id, SalesRisks__c>();
    Map<Id, Decimal> allRosa = new Map<Id, Decimal>();
    Map<Id, Map<String, Decimal>> bySupplier = new Map<Id, Map<String, Decimal>>();
    Map<Id, List<String>> champions = new Map<Id, List<String>>();
    Map<Id, SalesRisks__c> dealInfo = new Map<Id, SalesRisks__c>();
    Set<String> countries = new Set<String>();
    Map<Id, String> dealCountry = new Map<Id, String>();
    for (SalesRisks__c d : [
      SELECT
        Id,
        RecordTypeId,
        CurrencyIsoCode,
        Healthcare_Facility__r.BillingCountryCode
      FROM SalesRisks__c
      WHERE Id IN :dealIds
      WITH SYSTEM_MODE
    ]) {
      if (!isRosaDeal(d.RecordTypeId)) {
        continue;
      }
      dealInfo.put(d.Id, d);
      String c = countryOf(d);
      dealCountry.put(d.Id, c);
      countries.add(c);
      SalesRisks__c t = new SalesRisks__c(
        Id = d.Id,
        ROSA_Surgeon_Count__c = 0,
        ROSA_Growth_Cases__c = 0
      );
      for (String j : DEAL_JOINT.values()) {
        t.put('ROSA_ZB_' + j + '_Users__c', 0);
        t.put('ROSA_Current_ZB_' + j + '__c', 0);
        t.put('ROSA_With_ROSA_ZB_' + j + '__c', 0);
        t.put('ROSA_Growth_' + j + '_Cases__c', 0);
      }
      for (String f : SHARE_FIELD.values()) {
        t.put(f, 0);
      }
      totals.put(d.Id, t);
      allRosa.put(d.Id, 0);
      bySupplier.put(d.Id, new Map<String, Decimal>());
      champions.put(d.Id, new List<String>());
    }
    if (totals.isEmpty()) {
      return;
    }
    // Prices (Robert, 2026-11-27): an average implant price and a disposable price per joint, per country and currency.
    Map<String, Decimal> price = new Map<String, Decimal>();
    for (ROSA_Price__c p : [
      SELECT ROSA_Country__c, ROSA_Joint__c, CurrencyIsoCode, ROSA_Price__c
      FROM ROSA_Price__c
      WHERE ROSA_Active__c = TRUE AND ROSA_Country__c IN :countries
      WITH SYSTEM_MODE
    ]) {
      price.put(
        p.ROSA_Country__c + '|' + p.ROSA_Joint__c + '|' + p.CurrencyIsoCode,
        p.ROSA_Price__c
      );
    }
    Map<Id, Decimal> dealGrowth = new Map<Id, Decimal>();
    Set<Id> priced = new Set<Id>();
    List<Robotics_Surgeons__c> surgeonGrowth = new List<Robotics_Surgeons__c>();
    String q = 'SELECT Id, ROSA_Deal__c, ROSA_Champion__c, Surgeon_Name__r.Name, CurrencyIsoCode, ROSA_Growth_Implants__c, ROSA_Growth_Disposables__c, ROSA_Growth_Value__c';
    for (String j : JOINTS) {
      q +=
        ', ROSA_' +
        j +
        '_Current_Supplier__c, ROSA_' +
        j +
        '_Current_Cases__c' +
        ', ROSA_' +
        j +
        '_ROSA_Supplier__c, ROSA_' +
        j +
        '_ROSA_Cases__c';
    }
    Set<Id> ids = totals.keySet();
    q += ' FROM Robotics_Surgeons__c WHERE ROSA_Deal__c IN :ids ORDER BY Surgeon_Name__r.Name';
    for (Robotics_Surgeons__c s : Database.query(q, AccessLevel.SYSTEM_MODE)) {
      SalesRisks__c t = totals.get(s.ROSA_Deal__c);
      t.ROSA_Surgeon_Count__c += 1;
      if (s.ROSA_Champion__c && s.Surgeon_Name__r != null) {
        champions.get(s.ROSA_Deal__c).add(s.Surgeon_Name__r.Name);
      }
      // Growth $ per surgeon: each joint's implant growth (ZB with ROSA minus ZB now; a competitor now counts as 0) times
      // that joint's implant price, plus its consumable growth times its disposable price. Consumable growth is every case
      // with ROSA when the supplier with ROSA is ZB, since every ROSA case uses the consumables and the robot takes ZB
      // implants only (Robert, 2026-11-28; a non-ZB supplier with ROSA gives 0). Lost implant cases count negative.
      SalesRisks__c di = dealInfo.get(s.ROSA_Deal__c);
      Decimal implants = 0;
      Decimal disposables = 0;
      Boolean anyPrice = false;
      for (String j : JOINTS) {
        Decimal zbWithRosa = (String) s.get(
            'ROSA_' + j + '_ROSA_Supplier__c'
          ) == 'ZB'
          ? n(s, 'ROSA_' + j + '_ROSA_Cases__c')
          : 0;
        Decimal g =
          zbWithRosa -
          ((String) s.get('ROSA_' + j + '_Current_Supplier__c') == 'ZB'
            ? n(s, 'ROSA_' + j + '_Current_Cases__c')
            : 0);
        String key = dealCountry.get(s.ROSA_Deal__c) + '|' + PRICE_ITEM.get(j);
        Decimal ip = price.get(key + '|' + di.CurrencyIsoCode);
        Decimal dp = price.get(key + ' Disposable|' + di.CurrencyIsoCode);
        anyPrice = anyPrice || ip != null || dp != null;
        implants += g * (ip == null ? 0 : ip);
        disposables += zbWithRosa * (dp == null ? 0 : dp);
      }
      Robotics_Surgeons__c sg = new Robotics_Surgeons__c(
        Id = s.Id,
        CurrencyIsoCode = di.CurrencyIsoCode,
        ROSA_Growth_Implants__c = anyPrice ? implants : null,
        ROSA_Growth_Disposables__c = anyPrice ? disposables : null,
        ROSA_Growth_Value__c = anyPrice ? implants + disposables : null
      );
      if (
        sg.CurrencyIsoCode != s.CurrencyIsoCode ||
        sg.ROSA_Growth_Implants__c != s.ROSA_Growth_Implants__c ||
        sg.ROSA_Growth_Disposables__c != s.ROSA_Growth_Disposables__c ||
        sg.ROSA_Growth_Value__c != s.ROSA_Growth_Value__c
      ) {
        surgeonGrowth.add(sg);
      }
      if (anyPrice) {
        priced.add(s.ROSA_Deal__c);
        dealGrowth.put(
          s.ROSA_Deal__c,
          (dealGrowth.containsKey(s.ROSA_Deal__c)
              ? dealGrowth.get(s.ROSA_Deal__c)
              : 0) +
            implants +
            disposables
        );
      }
      for (String j : JOINTS) {
        String dj = DEAL_JOINT.get(j);
        String curSup = (String) s.get('ROSA_' + j + '_Current_Supplier__c');
        String rosaSup = (String) s.get('ROSA_' + j + '_ROSA_Supplier__c');
        Decimal cur = n(s, 'ROSA_' + j + '_Current_Cases__c');
        Decimal withRosa = n(s, 'ROSA_' + j + '_ROSA_Cases__c');
        if (curSup == 'ZB') {
          t.put(
            'ROSA_ZB_' + dj + '_Users__c',
            n(t, 'ROSA_ZB_' + dj + '_Users__c') + 1
          );
          t.put(
            'ROSA_Current_ZB_' + dj + '__c',
            n(t, 'ROSA_Current_ZB_' + dj + '__c') + cur
          );
          t.put(
            'ROSA_Growth_' + dj + '_Cases__c',
            n(t, 'ROSA_Growth_' + dj + '_Cases__c') - cur
          );
          t.ROSA_Growth_Cases__c -= cur;
        }
        if (rosaSup == 'ZB') {
          t.put(
            'ROSA_With_ROSA_ZB_' + dj + '__c',
            n(t, 'ROSA_With_ROSA_ZB_' + dj + '__c') + withRosa
          );
          t.put(
            'ROSA_Growth_' + dj + '_Cases__c',
            n(t, 'ROSA_Growth_' + dj + '_Cases__c') + withRosa
          );
          t.ROSA_Growth_Cases__c += withRosa;
        }
        if (withRosa > 0 && rosaSup != null) {
          allRosa.put(s.ROSA_Deal__c, allRosa.get(s.ROSA_Deal__c) + withRosa);
          Map<String, Decimal> m = bySupplier.get(s.ROSA_Deal__c);
          m.put(
            rosaSup,
            (m.containsKey(rosaSup) ? m.get(rosaSup) : 0) + withRosa
          );
        }
      }
    }
    for (Id d : totals.keySet()) {
      SalesRisks__c t = totals.get(d);
      t.ROSA_Champions__c = String.join(champions.get(d), ', ').left(255);
      Decimal all = allRosa.get(d);
      for (String sup : SHARE_FIELD.keySet()) {
        Decimal part = bySupplier.get(d).get(sup);
        t.put(
          SHARE_FIELD.get(sup),
          all > 0 && part != null ? (part * 100 / all).setScale(1) : 0
        );
      }
      // ROSA Growth $ is the sum of the surgeons' growth $ once the deal has surgeons and a price; a deal with no
      // surgeons keeps its typed-in value (Robert, 2026-11-27).
      if (t.ROSA_Surgeon_Count__c > 0 && priced.contains(d)) {
        t.ROSAGrowthDollar__c = dealGrowth.get(d)
          .setScale(0, System.RoundingMode.HALF_UP);
      }
      t.ROSA_Prices_Used__c = t.ROSA_Surgeon_Count__c > 0
        ? pricesUsed(dealCountry.get(d), dealInfo.get(d).CurrencyIsoCode, price)
        : null;
    }
    Database.update(totals.values(), true, AccessLevel.SYSTEM_MODE);
    if (!surgeonGrowth.isEmpty()) {
      Boolean was = inTotals;
      inTotals = true;
      try {
        Database.update(surgeonGrowth, true, AccessLevel.SYSTEM_MODE);
      } finally {
        inTotals = was;
      }
    }
  }

  /** "AU · AUD: TKA 5,000 + 750, ... (implant + disposables per case)" (Robert, 2026-11-27: show what the growth was worked out from). */
  private static String pricesUsed(
    String country,
    String curr,
    Map<String, Decimal> price
  ) {
    List<String> parts = new List<String>();
    for (String j : JOINTS) {
      String item = PRICE_ITEM.get(j);
      Decimal ip = price.get(country + '|' + item + '|' + curr);
      Decimal dp = price.get(country + '|' + item + ' Disposable|' + curr);
      if (ip != null || dp != null) {
        parts.add(
          item +
            ' ' +
            (ip == null ? '0' : ip.setScale(0).format()) +
            ' + ' +
            (dp == null ? '0' : dp.setScale(0).format())
        );
      }
    }
    String head = country + ' · ' + curr;
    return (parts.isEmpty()
        ? 'No active ' + head + ' prices'
        : head +
          ': ' +
          String.join(parts, ', ') +
          ' (implant + disposables per case)')
      .left(255);
  }

  /**
   * The deal's country for prices: the healthcare facility's billing country, else the ROSA record type's country
   * (AUROSA is AU, China_ROSA_Opportunity is CN).
   */
  public static String countryOf(SalesRisks__c d) {
    if (
      d.Healthcare_Facility__r != null &&
      String.isNotBlank(d.Healthcare_Facility__r.BillingCountryCode)
    ) {
      return d.Healthcare_Facility__r.BillingCountryCode;
    }
    Schema.RecordTypeInfo info = dealTypes.get(d.RecordTypeId);
    String dev = info == null ? '' : info.getDeveloperName().toUpperCase();
    if (dev.startsWith('CHINA')) {
      return 'CN';
    }
    return dev.length() >= 2 ? dev.left(2) : null;
  }

  /** After a price is saved: recalculate the ROSA deals that have surgeons. */
  public static void pricesChanged(List<ROSA_Price__c> prices) {
    Set<Id> deals = new Set<Id>();
    for (SalesRisks__c d : [
      SELECT Id, RecordTypeId
      FROM SalesRisks__c
      WHERE ROSA_Surgeon_Count__c > 0
      WITH SYSTEM_MODE
    ]) {
      if (isRosaDeal(d.RecordTypeId)) {
        deals.add(d.Id);
      }
    }
    recalcTotals(deals);
  }

  // ------------------------------------------------------------------ F6: price key

  public static void priceBeforeSave(List<ROSA_Price__c> prices) {
    for (ROSA_Price__c p : prices) {
      p.ROSA_Key__c = p.ROSA_Active__c
        ? (p.ROSA_Country__c + '|' + p.ROSA_Joint__c + '|' + p.CurrencyIsoCode)
        : null;
    }
  }

  // ------------------------------------------------------------------ F7: credentialing, on the ROSA Surgeon
  // Robert, 2026-11-27: one surgeon on one deal is one credentialing, so it sits on the ROSA Surgeon and the answers hang
  // off the surgeon. Choosing a pathway picks the active question set and adds its questions as answers.

  private static Boolean inCredentialing = false; // stops the surgeon trigger re-entering when the counts are written

  /** Before save: question set from the pathway, and the status rules. */
  public static void surgeonCredentialingBeforeSave(
    List<Robotics_Surgeons__c> surgeons
  ) {
    Map<String, Id> setByPathway = new Map<String, Id>();
    Boolean need = false;
    for (Robotics_Surgeons__c s : surgeons) {
      need =
        need ||
        (s.ROSA_Pathway__c != null &&
        s.ROSA_Question_Set_Used__c == null);
    }
    if (need) {
      for (ROSA_Question_Set__c e : [
        SELECT Id, ROSA_Pathway__c
        FROM ROSA_Question_Set__c
        WHERE ROSA_Active__c = TRUE AND ROSA_Pathway__c != NULL
        WITH SYSTEM_MODE
        ORDER BY CreatedDate ASC
      ]) {
        setByPathway.put(e.ROSA_Pathway__c, e.Id); // the newest active set wins
      }
    }
    for (Robotics_Surgeons__c s : surgeons) {
      if (s.ROSA_Pathway__c != null && s.ROSA_Question_Set_Used__c == null) {
        s.ROSA_Question_Set_Used__c = setByPathway.get(s.ROSA_Pathway__c);
      }
      if (
        s.ROSA_Pathway__c == null &&
        s.ROSA_Question_Set_Used__c == null &&
        s.ROSA_Credentialing_Status__c == null &&
        s.ROSA_Course_Date__c == null &&
        s.ROSA_Credentialed_Date__c == null
      ) {
        continue; // not in credentialing
      }
      // A credentialed date means Credentialed; picking Credentialed fills the date; a course date moves Not started to
      // Booked. The questions are not a condition for credentialing (Robert, 2026-11-27).
      if (
        s.ROSA_Credentialing_Status__c == 'Credentialed' &&
        s.ROSA_Credentialed_Date__c == null
      ) {
        s.ROSA_Credentialed_Date__c = Date.today();
      }
      if (s.ROSA_Credentialed_Date__c != null) {
        s.ROSA_Credentialing_Status__c = 'Credentialed';
      } else if (
        s.ROSA_Course_Date__c != null &&
        (String.isBlank(s.ROSA_Credentialing_Status__c) ||
        s.ROSA_Credentialing_Status__c == 'Not started')
      ) {
        s.ROSA_Credentialing_Status__c = 'Booked';
      } else if (String.isBlank(s.ROSA_Credentialing_Status__c)) {
        s.ROSA_Credentialing_Status__c = 'Not started';
      }
    }
    // A wave only for someone Booked, Attended or Credentialed (Robert, 2026-11-28): otherwise it goes back to none.
    for (Robotics_Surgeons__c s : surgeons) {
      if (
        String.isBlank(s.ROSA_Credentialing_Status__c) ||
        s.ROSA_Credentialing_Status__c == 'Not started'
      ) {
        s.ROSA_Wave__c = null;
      }
    }
  }

  /** After save: answers for a newly chosen question set, the counts, and the deal's credentialed count and step 7c. */
  public static void surgeonCredentialingAfterSave(
    List<Robotics_Surgeons__c> rows,
    Map<Id, Robotics_Surgeons__c> oldMap
  ) {
    if (inCredentialing) {
      return;
    }
    Set<Id> deals = new Set<Id>();
    List<Robotics_Surgeons__c> newSets = new List<Robotics_Surgeons__c>();
    Set<Id> recount = new Set<Id>();
    if (rows == null) {
      for (Robotics_Surgeons__c s : oldMap.values()) {
        if (s.ROSA_Deal__c != null) {
          deals.add(s.ROSA_Deal__c);
        }
      }
    } else {
      for (Robotics_Surgeons__c s : rows) {
        Robotics_Surgeons__c old = oldMap == null ? null : oldMap.get(s.Id);
        if (
          s.ROSA_Question_Set_Used__c != null &&
          (old == null ||
          old.ROSA_Question_Set_Used__c != s.ROSA_Question_Set_Used__c)
        ) {
          newSets.add(s);
        }
        if (
          old == null ||
          old.ROSA_Question_Set_Used__c != s.ROSA_Question_Set_Used__c
        ) {
          recount.add(s.Id);
        }
        if (
          s.ROSA_Deal__c != null &&
          (old == null ||
          old.ROSA_Credentialed_Date__c != s.ROSA_Credentialed_Date__c ||
          old.ROSA_Pathway__c != s.ROSA_Pathway__c)
        ) {
          deals.add(s.ROSA_Deal__c);
        }
      }
    }
    inCredentialing = true;
    try {
      addAnswers(newSets);
      refreshCounts(recount);
      credentialedRecount(deals);
    } finally {
      inCredentialing = false;
    }
  }

  /** One blank answer per active question of each surgeon's question set, in display order (only if it has none yet). */
  private static void addAnswers(List<Robotics_Surgeons__c> surgeons) {
    if (surgeons.isEmpty()) {
      return;
    }
    Set<Id> sets = new Set<Id>();
    Set<Id> ids = new Set<Id>();
    for (Robotics_Surgeons__c s : surgeons) {
      sets.add(s.ROSA_Question_Set_Used__c);
      ids.add(s.Id);
    }
    Set<Id> hasAnswers = new Set<Id>();
    for (AggregateResult r : [
      SELECT ROSA_Surgeon__c sid
      FROM ROSA_Credentialing_Answer__c
      WHERE ROSA_Surgeon__c IN :ids
      WITH SYSTEM_MODE
      GROUP BY ROSA_Surgeon__c
    ]) {
      hasAnswers.add((Id) r.get('sid'));
    }
    Map<Id, List<ROSA_Question__c>> bySet = new Map<Id, List<ROSA_Question__c>>();
    for (ROSA_Question__c q : [
      SELECT
        Id,
        ROSA_Question_Set__c,
        ROSA_Answer_Type__c,
        ROSA_Required__c,
        ROSA_Display_Order__c
      FROM ROSA_Question__c
      WHERE ROSA_Question_Set__c IN :sets AND ROSA_Active__c = TRUE
      WITH SYSTEM_MODE
      ORDER BY ROSA_Display_Order__c ASC NULLS LAST, Name ASC
    ]) {
      if (!bySet.containsKey(q.ROSA_Question_Set__c)) {
        bySet.put(q.ROSA_Question_Set__c, new List<ROSA_Question__c>());
      }
      bySet.get(q.ROSA_Question_Set__c).add(q);
    }
    List<ROSA_Credentialing_Answer__c> answers = new List<ROSA_Credentialing_Answer__c>();
    for (Robotics_Surgeons__c s : surgeons) {
      if (
        hasAnswers.contains(s.Id) ||
        !bySet.containsKey(s.ROSA_Question_Set_Used__c)
      ) {
        continue;
      }
      for (ROSA_Question__c q : bySet.get(s.ROSA_Question_Set_Used__c)) {
        answers.add(
          new ROSA_Credentialing_Answer__c(
            ROSA_Surgeon__c = s.Id,
            ROSA_Set_Question__c = q.Id,
            ROSA_Answer_Type__c = q.ROSA_Answer_Type__c,
            ROSA_Required__c = q.ROSA_Required__c,
            ROSA_Display_Order__c = q.ROSA_Display_Order__c
          )
        );
      }
    }
    Database.insert(answers, true, AccessLevel.SYSTEM_MODE);
  }

  /** Questions to answer (required, unanswered) and Gaps (answered No) on each surgeon. */
  public static void refreshCounts(Set<Id> surgeonIds) {
    if (surgeonIds == null || surgeonIds.isEmpty()) {
      return;
    }
    Map<Id, Robotics_Surgeons__c> updates = new Map<Id, Robotics_Surgeons__c>();
    for (Robotics_Surgeons__c s : [
      SELECT Id, ROSA_Question_Set_Used__c
      FROM Robotics_Surgeons__c
      WHERE Id IN :surgeonIds
      WITH SYSTEM_MODE
    ]) {
      Integer zero = s.ROSA_Question_Set_Used__c == null ? null : 0;
      updates.put(
        s.Id,
        new Robotics_Surgeons__c(
          Id = s.Id,
          ROSA_Questions_To_Answer__c = zero,
          ROSA_Gaps__c = zero
        )
      );
    }
    for (AggregateResult r : [
      SELECT ROSA_Surgeon__c sid, COUNT(Id) n
      FROM ROSA_Credentialing_Answer__c
      WHERE
        ROSA_Surgeon__c IN :surgeonIds
        AND ROSA_Required__c = TRUE
        AND ROSA_Is_Answered__c = FALSE
      WITH SYSTEM_MODE
      GROUP BY ROSA_Surgeon__c
    ]) {
      Robotics_Surgeons__c u = updates.get((Id) r.get('sid'));
      if (u != null) {
        u.ROSA_Questions_To_Answer__c = (Integer) r.get('n');
      }
    }
    for (AggregateResult r : [
      SELECT ROSA_Surgeon__c sid, COUNT(Id) n
      FROM ROSA_Credentialing_Answer__c
      WHERE ROSA_Surgeon__c IN :surgeonIds AND ROSA_Answer_Yes_No__c = 'No'
      WITH SYSTEM_MODE
      GROUP BY ROSA_Surgeon__c
    ]) {
      Robotics_Surgeons__c u = updates.get((Id) r.get('sid'));
      if (u != null) {
        u.ROSA_Gaps__c = (Integer) r.get('n');
      }
    }
    Boolean was = inCredentialing;
    inCredentialing = true;
    try {
      Database.update(updates.values(), true, AccessLevel.SYSTEM_MODE);
    } finally {
      inCredentialing = was;
    }
  }

  // ------------------------------------------------------------------ F9: credentialed count and step 7c

  /** Surgeons credentialed on each deal; tick step 7c once every surgeon in credentialing (with a pathway) has a date. */
  public static void credentialedRecount(Set<Id> deals) {
    if (deals == null || deals.isEmpty()) {
      return;
    }
    Map<Id, Integer> total = new Map<Id, Integer>();
    Map<Id, Integer> credentialed = new Map<Id, Integer>();
    Map<Id, Date> latest = new Map<Id, Date>();
    for (Id d : deals) {
      total.put(d, 0);
      credentialed.put(d, 0);
    }
    for (Robotics_Surgeons__c s : [
      SELECT ROSA_Deal__c, ROSA_Credentialed_Date__c
      FROM Robotics_Surgeons__c
      WHERE ROSA_Deal__c IN :deals AND ROSA_Pathway__c != NULL
      WITH SYSTEM_MODE
    ]) {
      total.put(s.ROSA_Deal__c, total.get(s.ROSA_Deal__c) + 1);
      if (s.ROSA_Credentialed_Date__c != null) {
        credentialed.put(s.ROSA_Deal__c, credentialed.get(s.ROSA_Deal__c) + 1);
        Date l = latest.get(s.ROSA_Deal__c);
        if (l == null || s.ROSA_Credentialed_Date__c > l) {
          latest.put(s.ROSA_Deal__c, s.ROSA_Credentialed_Date__c);
        }
      }
    }
    List<SalesRisks__c> counts = new List<SalesRisks__c>();
    for (Id d : deals) {
      counts.add(
        new SalesRisks__c(
          Id = d,
          ROSA_Surgeons_Credentialed__c = credentialed.get(d)
        )
      );
    }
    Database.update(counts, true, AccessLevel.SYSTEM_MODE);
    // Never unticks; only once the contract is signed (step 6).
    List<Robotics__c> ticks = new List<Robotics__c>();
    Id rt = checklistTypeId();
    for (Robotics__c c : [
      SELECT Id, Sales_Risks__c
      FROM Robotics__c
      WHERE
        Sales_Risks__c IN :deals
        AND RecordTypeId = :rt
        AND ROSA_Step_7c_Done__c = FALSE
        AND ROSA_Step_6_Done__c = TRUE
      WITH SYSTEM_MODE
    ]) {
      Id d = c.Sales_Risks__c;
      if (total.get(d) > 0 && total.get(d) == credentialed.get(d)) {
        ticks.add(
          new Robotics__c(
            Id = c.Id,
            ROSA_Step_7c_Done__c = true,
            ROSA_Step_7c_Date__c = latest.get(d)
          )
        );
      }
    }
    Database.update(ticks, true, AccessLevel.SYSTEM_MODE);
  }

  // ------------------------------------------------------------------ F8: answers

  private static Boolean filled(ROSA_Credentialing_Answer__c a) {
    switch on a.ROSA_Answer_Type__c {
      when 'Yes/No' {
        return String.isNotBlank(a.ROSA_Answer_Yes_No__c); // Yes and No are both answers
      }
      when 'Number' {
        return a.ROSA_Answer_Number__c != null;
      }
      when 'Date' {
        return a.ROSA_Answer_Date__c != null;
      }
      when 'Text' {
        return String.isNotBlank(a.ROSA_Answer_Text__c);
      }
      when else {
        return false;
      }
    }
  }

  /** After an answer is saved or removed: refresh the surgeon's Questions to answer and Gaps. */
  public static void answersChanged(List<ROSA_Credentialing_Answer__c> rows) {
    Set<Id> surgeons = new Set<Id>();
    for (ROSA_Credentialing_Answer__c a : rows) {
      surgeons.add(a.ROSA_Surgeon__c);
    }
    refreshCounts(surgeons);
  }

  public static void answerBeforeSave(
    List<ROSA_Credentialing_Answer__c> rows,
    Map<Id, ROSA_Credentialing_Answer__c> oldMap
  ) {
    for (ROSA_Credentialing_Answer__c a : rows) {
      ROSA_Credentialing_Answer__c o = oldMap == null ? null : oldMap.get(a.Id);
      Boolean touched = o == null
        ? (String.isNotBlank(a.ROSA_Answer_Yes_No__c) ||
          a.ROSA_Answer_Number__c != null ||
          a.ROSA_Answer_Date__c != null ||
          String.isNotBlank(a.ROSA_Answer_Text__c))
        : (a.ROSA_Answer_Yes_No__c != o.ROSA_Answer_Yes_No__c ||
          a.ROSA_Answer_Number__c != o.ROSA_Answer_Number__c ||
          a.ROSA_Answer_Date__c != o.ROSA_Answer_Date__c ||
          a.ROSA_Answer_Text__c != o.ROSA_Answer_Text__c);
      if (touched) {
        a.ROSA_Answered_By__c = UserInfo.getUserId();
        a.ROSA_Answered_Date__c = System.now();
      }
      a.ROSA_Is_Answered__c = filled(a);
    }
  }
}

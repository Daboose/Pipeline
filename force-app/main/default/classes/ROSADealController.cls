/**
 * ROSA deal screen (docs/ROSA_Deal_Modal_Build_Spec.md): reads one ROSA deal with everything the screen shows, and saves
 * what the screen changes.
 *
 * Who calls it: the rosaDeal component (inside the rosaDealModal pop-up, opened from the deal page and from Pipeline), and
 * ROSADealControllerTest.
 * What it touches:
 * - reads SalesRisks__c (the deal and the implant deals linked to it or to a surgeon), Robotics_Surgeons__c (ROSA Deal
 *   Surgeons), ROSA_Credentialing_Answer__c (their Q&A), Robotics__c (the ROSA Checklist), Account (surgeon search), User
 *   (deal lead and sales rep search), and Case__c with myCase_Usage_Item__c (a surgeon's myCase bookings) in the signed-in
 *   person's own access (with sharing, user mode); the person's own UserSettings__c record (remembered choices, system mode);
 * - saves the same records only for people who hold ROSA Deal Management or ROSA Credentialing Admin (decision 2: everyone else
 *   sees the screen read-only), and only the fields listed below; Salesforce's own rules and the ROSA automation run as usual.
 * - Link / Unlink sets an implant deal's Link_To_ROSA_Deal__c in system mode, because the deal lead often cannot edit a rep's
 *   implant deal; the person must still be able to read it and must hold a ROSA permission set.
 */
public with sharing class ROSADealController {
  /** Fields the screen may change, per object. Anything else sent is refused. */
  private static final Map<String, Set<String>> EDITABLE = new Map<String, Set<String>>{
    'SalesRisks__c' => new Set<String>{
      'Stage__c',
      'Account__c',
      'Healthcare_Facility__c',
      'ROSA_Overlord__c',
      'ROSA_Sales_Rep__c',
      'ROSA_Deal_Type__c',
      'ROSA_Sales_Type__c',
      'Expected_Closure_Quarter__c',
      'Expected_Closing_Year__c',
      'Close_Date__c',
      'Install_Date__c',
      'Priority__c',
      'State_Priority__c',
      'ROSAGrowthDollar__c',
      'ROSA_Rep_Trained__c',
      'ROSA_Rep_Case_Cover_Suitable__c',
      'ROSA_Primary_Case_Cover__c',
      'ROSA_Secondary_Case_Cover__c',
      'ROSA_Additional_Support__c',
      'ROSA_Additional_Support_Who__c',
      'ROSA_Trainees__c',
      'ROSA_Fellows__c',
      'ROSA_Exposure_Plan__c',
      'ROSA_Critical_To_Approval__c',
      'ROSA_Existing_Unit__c',
      'ROSA_Unit_Utilisation__c',
      'ROSA_Additional_Unit_Required__c',
      'ROSA_Competitor_Robotics__c',
      'ROSA_Additional_Opportunities__c',
      'ROSA_Identified_Risks__c'
    },
    'Robotics_Surgeons__c' => new Set<String>{
      'Surgeon_Name__c',
      'ROSA_Champion__c',
      'ROSA_Career_Position__c',
      'ROSA_Pathway__c',
      'ROSA_Credentialing_Status__c',
      'ROSA_Wave__c',
      'ROSA_Course_Date__c',
      'ROSA_Credentialed_Date__c',
      'ROSA_First_Case_Date__c',
      'ROSA_TKA_Current_Supplier__c',
      'ROSA_TKA_Current_Cases__c',
      'ROSA_TKA_ROSA_Supplier__c',
      'ROSA_TKA_ROSA_Cases__c',
      'ROSA_PKA_Current_Supplier__c',
      'ROSA_PKA_Current_Cases__c',
      'ROSA_PKA_ROSA_Supplier__c',
      'ROSA_PKA_ROSA_Cases__c',
      'ROSA_THA_Current_Supplier__c',
      'ROSA_THA_Current_Cases__c',
      'ROSA_THA_ROSA_Supplier__c',
      'ROSA_THA_ROSA_Cases__c',
      'ROSA_TSA_RSA_Current_Supplier__c',
      'ROSA_TSA_RSA_Current_Cases__c',
      'ROSA_TSA_RSA_ROSA_Supplier__c',
      'ROSA_TSA_RSA_ROSA_Cases__c'
    },
    'Robotics__c' => new Set<String>{
      'ROSA_Step_1_Done__c',
      'ROSA_Step_2_Done__c',
      'ROSA_Step_3_Done__c',
      'ROSA_Step_4_Done__c',
      'ROSA_Step_5_Done__c',
      'ROSA_Step_6_Done__c',
      'ROSA_Step_7a_Done__c',
      'ROSA_Step_7b_Done__c',
      'ROSA_Step_7c_Done__c',
      'ROSA_Step_7d_Done__c',
      'ROSA_Step_1_Date__c',
      'ROSA_Step_2_Date__c',
      'ROSA_Step_3_Date__c',
      'ROSA_Step_4_Date__c',
      'ROSA_Step_5_Date__c',
      'ROSA_Step_6_Date__c',
      'ROSA_Step_7a_Date__c',
      'ROSA_Step_7b_Date__c',
      'ROSA_Step_7c_Date__c',
      'ROSA_Step_7d_Date__c'
    }
  };

  private static final List<String> STEPS = new List<String>{
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
  private static final List<String> JOINTS = new List<String>{
    'TKA',
    'PKA',
    'THA',
    'TSA_RSA'
  };

  // ------------------------------------------------------------------ what the screen reads

  public class Deal {
    @AuraEnabled
    public SalesRisks__c rec;
    @AuraEnabled
    public Boolean canEdit;
    @AuraEnabled
    public String theme;
    @AuraEnabled
    public String recordTypeName;
    @AuraEnabled
    public List<Robotics_Surgeons__c> surgeons = new List<Robotics_Surgeons__c>();
    @AuraEnabled
    public List<Answer> answers = new List<Answer>();
    @AuraEnabled
    public Robotics__c checklist;
    @AuraEnabled
    public Map<String, String> doneBy = new Map<String, String>();
    @AuraEnabled
    public List<SalesRisks__c> linked = new List<SalesRisks__c>();
  }

  public class Answer {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public String question;
    @AuraEnabled
    public String type;
    @AuraEnabled
    public Boolean required;
    @AuraEnabled
    public Decimal order;
    @AuraEnabled
    public String yesNo;
    @AuraEnabled
    public Decimal num;
    @AuraEnabled
    public Date dt;
    @AuraEnabled
    public String txt;
    @AuraEnabled
    public Boolean answered;
    @AuraEnabled
    public String answeredBy;
    @AuraEnabled
    public Datetime at;
  }

  public class Hit {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String sub;
  }

  /** True when the signed-in person may change things on the screen (decision 2): the custom permission ROSA_Edit_Deals,
   * granted by ROSA Deal Management and ROSA Credentialing Admin. */
  public static Boolean canEdit() {
    return FeatureManagement.checkPermission('ROSA_Edit_Deals');
  }

  private static String surgeonFields() {
    String f =
      'Id, Name, ROSA_Deal__c, Surgeon_Name__c, Surgeon_Name__r.Name, Surgeon_Name__r.FirstName, Surgeon_Name__r.LastName, ' +
      'ROSA_Champion__c, ROSA_Career_Position__c, ROSA_Pathway__c, ROSA_Question_Set_Used__c, ROSA_Credentialing_Status__c, ' +
      'ROSA_Wave__c, ROSA_Course_Date__c, ROSA_Credentialed_Date__c, ROSA_First_Case_Date__c, ROSA_Questions_To_Answer__c, ' +
      'ROSA_Gaps__c, ROSA_Ready__c, ROSA_Credentialing_Summary__c, ROSA_Growth_Implants__c, ROSA_Growth_Disposables__c, ' +
      'ROSA_Growth_Value__c, CurrencyIsoCode';
    for (String j : JOINTS) {
      f +=
        ', ROSA_' +
        j +
        '_Current_Supplier__c, ROSA_' +
        j +
        '_Current_Cases__c, ROSA_' +
        j +
        '_ROSA_Supplier__c, ROSA_' +
        j +
        '_ROSA_Cases__c';
    }
    return f;
  }

  @AuraEnabled
  public static Deal getDeal(Id dealId) {
    Deal out = new Deal();
    out.canEdit = canEdit();
    out.theme = theme();
    List<SalesRisks__c> recs = Database.query(
      'SELECT Id, Name, RecordTypeId, RecordType.Name, OwnerId, Owner.Name, CurrencyIsoCode, Stage__c, ' +
        'Healthcare_Facility__c, Healthcare_Facility__r.Name, Healthcare_Facility__r.BillingCountry, Account__c, Account__r.Name, ' +
        'ROSA_Overlord__c, ROSA_Overlord__r.Name, ROSA_Sales_Rep__c, ROSA_Sales_Rep__r.Name, ROSA_Deal_Type__c, ROSA_Sales_Type__c, ' +
        'Expected_Closure_Quarter__c, Expected_Closing_Year__c, Close_Date__c, Install_Date__c, Priority__c, State_Priority__c, ' +
        'ROSAGrowthDollar__c, ROSA_Has_Surgeons__c, ROSA_Prices_Used__c, ROSA_Checklist__c, ROSA_Surgeon_Count__c, ROSA_Growth_Cases__c, ' +
        'ROSA_Surgeons_Credentialed__c, ROSA_Champions__c, ' +
        'ROSA_ZB_TKA_Users__c, ROSA_ZB_PKA_Users__c, ROSA_ZB_THA_Users__c, ROSA_ZB_Shoulder_Users__c, ' +
        'ROSA_Current_ZB_TKA__c, ROSA_Current_ZB_PKA__c, ROSA_Current_ZB_THA__c, ROSA_Current_ZB_Shoulder__c, ' +
        'ROSA_With_ROSA_ZB_TKA__c, ROSA_With_ROSA_ZB_PKA__c, ROSA_With_ROSA_ZB_THA__c, ROSA_With_ROSA_ZB_Shoulder__c, ' +
        'ROSA_Growth_TKA_Cases__c, ROSA_Growth_PKA_Cases__c, ROSA_Growth_THA_Cases__c, ROSA_Growth_Shoulder_Cases__c, ' +
        'ROSA_Share_ZB__c, ROSA_Share_JJ__c, ROSA_Share_Stryker__c, ROSA_Share_SN__c, ROSA_Share_Other__c, ' +
        'ROSA_Rep_Trained__c, ROSA_Rep_Case_Cover_Suitable__c, ROSA_Primary_Case_Cover__c, ROSA_Primary_Case_Cover__r.Name, ' +
        'ROSA_Secondary_Case_Cover__c, ROSA_Secondary_Case_Cover__r.Name, ROSA_Additional_Support__c, ROSA_Additional_Support_Who__c, ' +
        'ROSA_Trainees__c, ROSA_Fellows__c, ROSA_Exposure_Plan__c, ROSA_Critical_To_Approval__c, ROSA_Existing_Unit__c, ' +
        'ROSA_Unit_Utilisation__c, ROSA_Additional_Unit_Required__c, ROSA_Competitor_Robotics__c, ROSA_Additional_Opportunities__c, ' +
        'ROSA_Identified_Risks__c FROM SalesRisks__c WHERE Id = :dealId',
      AccessLevel.USER_MODE
    );
    if (recs.isEmpty()) {
      throw fail('That ROSA deal could not be found, or you cannot see it.');
    }
    out.rec = recs[0];
    out.recordTypeName = recs[0].RecordType.Name;
    out.surgeons = Database.query(
      'SELECT ' +
        surgeonFields() +
        ' FROM Robotics_Surgeons__c WHERE ROSA_Deal__c = :dealId ORDER BY Surgeon_Name__r.Name, Name',
      AccessLevel.USER_MODE
    );
    Set<Id> ids = new Map<Id, Robotics_Surgeons__c>(out.surgeons).keySet();
    for (ROSA_Credentialing_Answer__c a : [
      SELECT
        Id,
        ROSA_Surgeon__c,
        ROSA_Set_Question__r.ROSA_Question_Text__c,
        ROSA_Answer_Type__c,
        ROSA_Required__c,
        ROSA_Display_Order__c,
        ROSA_Answer_Yes_No__c,
        ROSA_Answer_Number__c,
        ROSA_Answer_Date__c,
        ROSA_Answer_Text__c,
        ROSA_Is_Answered__c,
        ROSA_Answered_By__r.Name,
        ROSA_Answered_Date__c
      FROM ROSA_Credentialing_Answer__c
      WHERE ROSA_Surgeon__c IN :ids
      WITH USER_MODE
      ORDER BY ROSA_Display_Order__c ASC NULLS LAST, Name
    ]) {
      out.answers.add(answer(a));
    }
    if (out.rec.ROSA_Checklist__c != null) {
      String q = 'SELECT Id, Name';
      for (String s : STEPS) {
        q +=
          ', ROSA_Step_' +
          s +
          '_Done__c, ROSA_Step_' +
          s +
          '_Date__c, ROSA_Step_' +
          s +
          '_Done_By__r.Name';
      }
      Id cid = out.rec.ROSA_Checklist__c;
      List<Robotics__c> cl = Database.query(
        q + ' FROM Robotics__c WHERE Id = :cid',
        AccessLevel.USER_MODE
      );
      if (!cl.isEmpty()) {
        out.checklist = cl[0];
        for (String s : STEPS) {
          SObject u = cl[0].getSObject('ROSA_Step_' + s + '_Done_By__r');
          if (u != null) {
            out.doneBy.put(s, (String) u.get('Name'));
          }
        }
      }
    }
    out.linked = [
      SELECT
        Id,
        Name,
        RecordType.Name,
        Stage__c,
        AmountPerYear__c,
        CurrencyIsoCode,
        Account__c,
        Account__r.Name
      FROM SalesRisks__c
      WHERE Link_To_ROSA_Deal__c = :dealId
      WITH USER_MODE
      ORDER BY Name
    ];
    return out;
  }

  private static Answer answer(ROSA_Credentialing_Answer__c a) {
    Answer x = new Answer();
    x.id = a.Id;
    x.surgeonId = a.ROSA_Surgeon__c;
    x.question = a.ROSA_Set_Question__r == null
      ? ''
      : a.ROSA_Set_Question__r.ROSA_Question_Text__c;
    x.type = a.ROSA_Answer_Type__c;
    x.required = a.ROSA_Required__c;
    x.order = a.ROSA_Display_Order__c;
    x.yesNo = a.ROSA_Answer_Yes_No__c;
    x.num = a.ROSA_Answer_Number__c;
    x.dt = a.ROSA_Answer_Date__c;
    x.txt = a.ROSA_Answer_Text__c;
    x.answered = a.ROSA_Is_Answered__c;
    x.answeredBy = a.ROSA_Answered_By__r == null
      ? null
      : a.ROSA_Answered_By__r.Name;
    x.at = a.ROSA_Answered_Date__c;
    return x;
  }

  /** The person's Pipeline theme (light or dark), so the screen matches Pipeline. Dark until they choose. */
  private static String theme() {
    try {
      String json = PipelineUserSettings.read(
        PipelineUserSettings.PIPELINE_FIELD,
        AccessLevel.SYSTEM_MODE
      );
      if (String.isNotBlank(json)) {
        Map<String, Object> m = (Map<String, Object>) System.JSON.deserializeUntyped(
          json
        );
        if (m.get('theme') == 'light') {
          return 'light';
        }
      }
    } catch (Exception e) {
      // no settings yet, or unreadable: dark
    }
    return 'dark';
  }

  /** A surgeon's implant opportunities (Primary HCP = the surgeon's account; not ROSA deals). */
  @AuraEnabled
  public static List<SalesRisks__c> surgeonOpportunities(Id accountId) {
    List<SalesRisks__c> out = new List<SalesRisks__c>();
    for (SalesRisks__c d : [
      SELECT
        Id,
        Name,
        RecordTypeId,
        RecordType.Name,
        Stage__c,
        AmountPerYear__c,
        CurrencyIsoCode,
        Link_To_ROSA_Deal__c
      FROM SalesRisks__c
      WHERE Account__c = :accountId
      WITH USER_MODE
      ORDER BY CreatedDate DESC
      LIMIT 50
    ]) {
      if (!ROSAAutomation.isRosaDeal(d.RecordTypeId)) {
        out.add(d);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ myCase bookings (Robert, 2026-11-28)

  /** One line of a surgeon's myCase bookings: one brand, type of surgery and case Type, by month (12 columns, oldest first). */
  public class BookingLine {
    @AuraEnabled
    public String brand;
    /** Hip, Knee, Shoulder or CMFT. */
    @AuraEnabled
    public String anatomy;
    /** Primary, Revision or Demo (Case__c.Procedure__c A00, A01, Z02). */
    @AuraEnabled
    public String procedure;
    /** True when the cases' usage holds the ROSA robotic unit drape (Robert, 2026-11-28). */
    @AuraEnabled
    public Boolean rosa = false;
    @AuraEnabled
    public List<Integer> months = new List<Integer>();
  }

  /** A surgeon's myCase bookings: the first day of the first column and the lines. */
  public class Bookings {
    @AuraEnabled
    public Date windowStart;
    @AuraEnabled
    public List<BookingLine> lines = new List<BookingLine>();
  }

  private static final Map<String, String> ANATOMY = new Map<String, String>{
    '201' => 'Hip',
    '202' => 'Knee',
    '205' => 'Shoulder',
    '209' => 'CMFT'
  };

  /**
   * BOOKED (Robert, 2026-11-28): the surgeon's bookings at every hospital from today for 12 months (the first column is the current
   * month from today on). No usage is needed; ROSA is the booking's Technology (ROSA or ROSA+PSI); cancelled bookings are left out
   * (PipelineBookingsController.isCancelled). Read in the person's own access.
   */
  @AuraEnabled
  public static Bookings surgeonBooked(Id accountId) {
    Bookings out = new Bookings();
    Date start = Date.today();
    Date endExclusive = start.toStartOfMonth().addMonths(12);
    out.windowStart = start;
    if (accountId == null) {
      return out;
    }
    Set<String> types = ANATOMY.keySet();
    Map<String, BookingLine> byKey = new Map<String, BookingLine>();
    Map<String, Object> binds = new Map<String, Object>{
      'surgeon' => accountId,
      'startDate' => start,
      'endDate' => endExclusive,
      'types' => types
    };
    String q =
      'SELECT Id, Surgery_Date__c, Surgery_Type__c, Procedure__c, toLabel(Brand__c)' +
      PipelineBookingsController.bookingFields() +
      ' FROM Case__c WHERE Physician__c = :surgeon AND Surgery_Date__c >= :startDate' +
      ' AND Surgery_Date__c < :endDate AND Surgery_Type__c IN :types LIMIT 20000';
    for (
      Case__c c : (List<Case__c>) Database.queryWithBinds(
        q,
        binds,
        AccessLevel.USER_MODE
      )
    ) {
      if (PipelineBookingsController.isCancelled(c)) {
        continue;
      }
      addToLine(
        out,
        byKey,
        c,
        start,
        PipelineBookingsController.isRosaBooking(c)
      );
    }
    return out;
  }

  private static void addToLine(
    Bookings out,
    Map<String, BookingLine> byKey,
    Case__c c,
    Date start,
    Boolean rosa
  ) {
    String brand = String.isBlank(c.Brand__c)
      ? 'No brand recorded'
      : c.Brand__c;
    String proc = 'Primary';
    if (c.Procedure__c == 'A01') {
      proc = 'Revision';
    } else if (c.Procedure__c == 'Z02') {
      proc = 'Demo';
    }
    String anatomy = ANATOMY.get(c.Surgery_Type__c);
    String key = brand + '|' + anatomy + '|' + proc + '|' + rosa;
    BookingLine line = byKey.get(key);
    if (line == null) {
      line = new BookingLine();
      line.brand = brand;
      line.anatomy = anatomy;
      line.procedure = proc;
      line.rosa = rosa;
      for (Integer i = 0; i < 12; i++) {
        line.months.add(0);
      }
      byKey.put(key, line);
      out.lines.add(line);
    }
    Integer m =
      (c.Surgery_Date__c.year() - start.year()) * 12 +
      c.Surgery_Date__c.month() -
      start.month();
    line.months[m] = line.months[m] + 1;
  }

  /**
   * The surgeon's myCase cases of the last 12 months up to and including today (the current month is the last column) at every hospital, the same rule as Pipeline's hospital bookings
   * (PipelineBookingsController.getHospitalBookings): a case counts when the surgery has happened and it has at least one usage
   * item; demos with usage items count, as Demo. Read in the person's own access.
   */
  @AuraEnabled
  public static Bookings surgeonBookings(Id accountId) {
    Bookings out = new Bookings();
    Date thisMonth = Date.today().toStartOfMonth();
    Date start = thisMonth.addMonths(-11);
    Date endExclusive = Date.today().addDays(1); // up to and including today (Robert, 2026-11-28)
    out.windowStart = start;
    if (accountId == null) {
      return out;
    }
    Set<String> types = ANATOMY.keySet();
    List<Case__c> cases = [
      SELECT
        Id,
        Surgery_Date__c,
        Surgery_Type__c,
        Procedure__c,
        toLabel(Brand__c)
      FROM Case__c
      WHERE
        Physician__c = :accountId
        AND Surgery_Date__c >= :start
        AND Surgery_Date__c < :endExclusive
        AND Surgery_Type__c IN :types
      WITH USER_MODE
      LIMIT 20000
    ];
    if (cases.isEmpty()) {
      return out;
    }
    Set<Id> withItems = new Set<Id>();
    for (AggregateResult ar : [
      SELECT Usage_Sheet_ID__r.Case__c c
      FROM myCase_Usage_Item__c
      WHERE
        Usage_Sheet_ID__r.Case__r.Physician__c = :accountId
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :start
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :endExclusive
      WITH USER_MODE
      GROUP BY Usage_Sheet_ID__r.Case__c
    ]) {
      withItems.add((Id) ar.get('c'));
    }
    Set<String> drape = PipelineBookingsController.ROSA_DRAPE;
    Set<Id> withDrape = new Set<Id>();
    for (AggregateResult ar : [
      SELECT Usage_Sheet_ID__r.Case__c c
      FROM myCase_Usage_Item__c
      WHERE
        Usage_Sheet_ID__r.Case__r.Physician__c = :accountId
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :start
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :endExclusive
        AND SAP_Material_Number__c IN :drape
      WITH USER_MODE
      GROUP BY Usage_Sheet_ID__r.Case__c
    ]) {
      withDrape.add((Id) ar.get('c'));
    }
    Map<String, BookingLine> byKey = new Map<String, BookingLine>();
    for (Case__c c : cases) {
      if (!withItems.contains(c.Id)) {
        continue;
      }
      addToLine(out, byKey, c, start, withDrape.contains(c.Id));
    }
    return out;
  }

  /**
   * Adds a ROSA Checklist to an older ROSA deal that has none (Robert, 2026-11-28: old deals are brought into the new process
   * by hand). Uses the same code that makes one for every new ROSA deal (ROSAAutomation.dealAfterInsert).
   */
  @AuraEnabled
  public static void addChecklist(Id dealId) {
    mustEdit();
    List<SalesRisks__c> d = [
      SELECT Id, Name, RecordTypeId, Healthcare_Facility__c, ROSA_Checklist__c
      FROM SalesRisks__c
      WHERE Id = :dealId
      WITH USER_MODE
      LIMIT 1
    ];
    if (d.isEmpty() || !ROSAAutomation.isRosaDeal(d[0].RecordTypeId)) {
      throw fail('This is not a ROSA deal.');
    }
    if (d[0].ROSA_Checklist__c != null) {
      throw fail('This deal already has a checklist.');
    }
    try {
      ROSAAutomation.dealAfterInsert(d);
    } catch (Exception e) {
      throw fail(message(e));
    }
    if (
      [
        SELECT ROSA_Checklist__c
        FROM SalesRisks__c
        WHERE Id = :dealId
        WITH SYSTEM_MODE
      ]
      .ROSA_Checklist__c == null
    ) {
      throw fail(
        'The checklist could not be added: it needs the ROSA Deal Management permission set.'
      );
    }
  }

  // ------------------------------------------------------------------ remembered choices (Robert, 2026-11-28)

  private static final Set<String> PREF_KEYS = new Set<String>{
    'hospBook',
    'rosaDeal'
  };

  /**
   * The person's remembered choices for this screen, kept in their Pipeline settings (UserSettings__c.Pipeline_JSON__c) so the
   * hospital MyCase Bookings behave the same here and in Pipeline: hospBook (view, chips switched off, ROSA / non-ROSA) and rosaDeal
   * (zoom, and the surgeon tab's chips and ROSA / non-ROSA). Only the person's own record is read, so system mode is used for
   * people who hold a ROSA permission set but not Pipeline User.
   */
  @AuraEnabled
  public static String getPrefs() {
    Map<String, Object> all = pipelineSettings();
    Map<String, Object> out = new Map<String, Object>();
    for (String k : PREF_KEYS) {
      if (all.containsKey(k)) {
        out.put(k, all.get(k));
      }
    }
    return JSON.serialize(out);
  }

  /** Saves the screen's remembered choices into the person's Pipeline settings, leaving every other setting as it is. */
  @AuraEnabled
  public static void savePrefs(String prefsJson) {
    Map<String, Object> incoming;
    try {
      incoming = (Map<String, Object>) JSON.deserializeUntyped(prefsJson);
    } catch (Exception e) {
      throw fail('The choices could not be read.');
    }
    Map<String, Object> all = pipelineSettings();
    for (String k : PREF_KEYS) {
      if (incoming.containsKey(k)) {
        all.put(k, incoming.get(k));
      }
    }
    PipelineUserSettings.save(
      PipelineUserSettings.PIPELINE_FIELD,
      JSON.serialize(all),
      AccessLevel.SYSTEM_MODE
    );
  }

  private static Map<String, Object> pipelineSettings() {
    String raw = PipelineUserSettings.read(
      PipelineUserSettings.PIPELINE_FIELD,
      AccessLevel.SYSTEM_MODE
    );
    if (String.isBlank(raw)) {
      return new Map<String, Object>();
    }
    try {
      return (Map<String, Object>) JSON.deserializeUntyped(raw);
    } catch (Exception e) {
      return new Map<String, Object>();
    }
  }

  // ------------------------------------------------------------------ saving

  private static void mustEdit() {
    if (!canEdit()) {
      throw fail(
        'Only people with ROSA Deal Management can change a ROSA deal here.'
      );
    }
  }

  /** Turns the screen's values into an sObject of the given type, refusing any field not in the list. */
  private static SObject build(
    String objectName,
    Id recordId,
    Map<String, Object> values
  ) {
    Set<String> allowed = EDITABLE.get(objectName);
    if (allowed == null) {
      throw fail('That record cannot be changed here.');
    }
    Schema.SObjectType t = Schema.getGlobalDescribe().get(objectName);
    SObject rec = t.newSObject(recordId);
    Map<String, Schema.SObjectField> fields = t.getDescribe().fields.getMap();
    for (String k : values.keySet()) {
      if (!allowed.contains(k)) {
        throw fail('The field ' + k + ' cannot be changed here.');
      }
      rec.put(k, convert(fields.get(k).getDescribe().getType(), values.get(k)));
    }
    return rec;
  }

  private static Object convert(Schema.DisplayType type, Object v) {
    if (v == null || (v instanceof String && String.isBlank((String) v))) {
      return type == Schema.DisplayType.BOOLEAN ? (Object) false : null;
    }
    switch on type {
      when BOOLEAN {
        return v instanceof Boolean ? v : Boolean.valueOf(String.valueOf(v));
      }
      when DATE {
        return Date.valueOf(String.valueOf(v));
      }
      when DOUBLE, CURRENCY, PERCENT, INTEGER {
        return Decimal.valueOf(String.valueOf(v));
      }
      when else {
        return String.valueOf(v);
      }
    }
  }

  /** An error the screen can show in words: the message is set twice because Salesforce otherwise sends "Script-thrown exception". */
  private static AuraHandledException fail(String msg) {
    AuraHandledException e = new AuraHandledException(msg);
    e.setMessage(msg);
    return e;
  }

  private static String message(Exception e) {
    String m = e.getMessage();
    Integer i = m.indexOf('FIELD_CUSTOM_VALIDATION_EXCEPTION, ');
    if (i >= 0) {
      m = m.substring(i + 'FIELD_CUSTOM_VALIDATION_EXCEPTION, '.length());
      Integer j = m.lastIndexOf(': [');
      if (j > 0) {
        m = m.substring(0, j);
      }
    }
    return m;
  }

  /** Saves changed fields on the deal, a surgeon or the checklist (only the fields listed above). */
  @AuraEnabled
  public static void saveRecord(
    String objectName,
    Id recordId,
    Map<String, Object> values
  ) {
    mustEdit();
    try {
      update as user build(objectName, recordId, values);
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw fail(message(e));
    }
  }

  /** Adds a ROSA Deal Surgeon to the deal and returns it. */
  @AuraEnabled
  public static Id addSurgeon(Id dealId, Map<String, Object> values) {
    mustEdit();
    Robotics_Surgeons__c s = (Robotics_Surgeons__c) build(
      'Robotics_Surgeons__c',
      null,
      values
    );
    s.ROSA_Deal__c = dealId;
    try {
      insert as user s;
    } catch (Exception e) {
      String m = message(e);
      throw fail(
        m.contains('DUPLICATE_VALUE')
          ? 'That surgeon is already on this deal.'
          : m
      );
    }
    return s.Id;
  }

  /**
   * Deletes a ROSA Deal Surgeon added in error (Robert, 2026-11-28: from the surgeon's Details in Edit, never from the hospital's
   * myCase). Their credentialing answers go with them (master-detail); the deal's totals and credentialed count are recounted by
   * ROSA_SurgeonTrigger (after delete). Needs ROSA Deal Management (delete on ROSA Surgeons) and runs in the person's own access.
   */
  @AuraEnabled
  public static void deleteSurgeon(Id surgeonId) {
    mustEdit();
    if (surgeonId == null) {
      throw fail('No surgeon to delete.');
    }
    try {
      delete as user new Robotics_Surgeons__c(Id = surgeonId);
    } catch (Exception e) {
      throw fail(message(e));
    }
  }

  /** Saves one credentialing answer. The value is Yes, No, a number, a date (yyyy-mm-dd) or text, by the question's type. */
  @AuraEnabled
  public static void saveAnswer(Id answerId, String value) {
    mustEdit();
    ROSA_Credentialing_Answer__c a = [
      SELECT Id, ROSA_Answer_Type__c
      FROM ROSA_Credentialing_Answer__c
      WHERE Id = :answerId
      WITH USER_MODE
    ];
    String v = String.isBlank(value) ? null : value;
    switch on a.ROSA_Answer_Type__c {
      when 'Yes/No' {
        a.ROSA_Answer_Yes_No__c = v;
      }
      when 'Number' {
        a.ROSA_Answer_Number__c = v == null ? null : Decimal.valueOf(v);
      }
      when 'Date' {
        a.ROSA_Answer_Date__c = v == null ? null : Date.valueOf(v);
      }
      when else {
        a.ROSA_Answer_Text__c = v;
      }
    }
    try {
      update as user a;
    } catch (Exception e) {
      throw fail(message(e));
    }
  }

  /** Saves several answers in one go (Robert, 2026-11-28: one Save Now instead of a save on every click). Map: answer Id => value. */
  @AuraEnabled
  public static void saveAnswers(Map<Id, String> answers) {
    mustEdit();
    if (answers == null || answers.isEmpty()) {
      return;
    }
    List<ROSA_Credentialing_Answer__c> rows = [
      SELECT Id, ROSA_Answer_Type__c
      FROM ROSA_Credentialing_Answer__c
      WHERE Id IN :answers.keySet()
      WITH USER_MODE
    ];
    for (ROSA_Credentialing_Answer__c a : rows) {
      setValue(a, answers.get(a.Id));
    }
    try {
      update as user rows;
    } catch (Exception e) {
      throw fail(message(e));
    }
  }

  private static void setValue(ROSA_Credentialing_Answer__c a, String value) {
    String v = String.isBlank(value) ? null : value;
    switch on a.ROSA_Answer_Type__c {
      when 'Yes/No' {
        a.ROSA_Answer_Yes_No__c = v;
      }
      when 'Number' {
        a.ROSA_Answer_Number__c = v == null ? null : Decimal.valueOf(v);
      }
      when 'Date' {
        a.ROSA_Answer_Date__c = v == null ? null : Date.valueOf(v);
      }
      when else {
        a.ROSA_Answer_Text__c = v;
      }
    }
  }

  /** Links (or unlinks) an implant deal to this ROSA deal through its Link To ROSA Deal. */
  @AuraEnabled
  public static void linkOpportunity(
    Id opportunityId,
    Id dealId,
    Boolean link
  ) {
    mustEdit();
    // the person must at least be able to see the implant deal
    if (
      [
        SELECT COUNT()
        FROM SalesRisks__c
        WHERE Id = :opportunityId
        WITH USER_MODE
      ] == 0
    ) {
      throw fail('That opportunity could not be found, or you cannot see it.');
    }
    try {
      Database.update(
        new SalesRisks__c(
          Id = opportunityId,
          Link_To_ROSA_Deal__c = link ? dealId : null
        ),
        true,
        AccessLevel.SYSTEM_MODE
      );
    } catch (Exception e) {
      throw fail(message(e));
    }
  }

  // ------------------------------------------------------------------ searches for the pickers

  private static String clean(String term) {
    String t = term == null ? '' : term.trim();
    return String.escapeSingleQuotes(t).replaceAll('[%_]', ' ').trim();
  }

  /** Surgeons (person accounts) by name, for Add surgeon. */
  @AuraEnabled
  public static List<Hit> searchSurgeons(String term) {
    List<Hit> out = new List<Hit>();
    String t = clean(term);
    if (t.length() < 2) {
      return out;
    }
    String pattern = '%' + t + '%';
    for (Account a : [
      SELECT Id, Name, PersonMailingCity, PersonMailingState
      FROM Account
      WHERE IsPersonAccount = TRUE AND Name LIKE :pattern
      WITH USER_MODE
      ORDER BY Name
      LIMIT 8
    ]) {
      Hit h = new Hit();
      h.id = a.Id;
      h.name = a.Name;
      h.sub = String.join(
          new List<String>{ a.PersonMailingCity, a.PersonMailingState },
          ' '
        )
        .replace('null', '')
        .trim();
      out.add(h);
    }
    return out;
  }

  /** Active, non-portal users by name, for the deal lead, sales rep and case cover. */
  @AuraEnabled
  public static List<Hit> searchUsers(String term) {
    List<Hit> out = new List<Hit>();
    String t = clean(term);
    if (t.length() < 2) {
      return out;
    }
    String pattern = '%' + t + '%';
    for (User u : [
      SELECT Id, Name, Title
      FROM User
      WHERE
        IsActive = TRUE
        AND IsPortalEnabled = FALSE
        AND UserType = 'Standard'
        AND Name LIKE :pattern
      WITH USER_MODE
      ORDER BY Name
      LIMIT 8
    ]) {
      Hit h = new Hit();
      h.id = u.Id;
      h.name = u.Name;
      h.sub = u.Title;
      out.add(h);
    }
    return out;
  }

  /** Healthcare facilities (business accounts) by name, for the deal's hospital. */
  @AuraEnabled
  public static List<Hit> searchFacilities(String term) {
    List<Hit> out = new List<Hit>();
    String t = clean(term);
    if (t.length() < 2) {
      return out;
    }
    String pattern = '%' + t + '%';
    for (Account a : [
      SELECT Id, Name, BillingCity, BillingState
      FROM Account
      WHERE IsPersonAccount = FALSE AND Name LIKE :pattern
      WITH USER_MODE
      ORDER BY Name
      LIMIT 8
    ]) {
      Hit h = new Hit();
      h.id = a.Id;
      h.name = a.Name;
      h.sub = String.join(
          new List<String>{ a.BillingCity, a.BillingState },
          ' '
        )
        .replace('null', '')
        .trim();
      out.add(h);
    }
    return out;
  }
}

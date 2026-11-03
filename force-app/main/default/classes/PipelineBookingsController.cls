/**
 * Pipeline: the My Case Bookings panel in the deal flyout. How a surgeon is tracking: surgeries per month for the last 12
 * whole months (plus this month so far), by type of surgery (Hip, Knee, Shoulder, CMFT), split into primary and revision
 * (CMFT is never split), and by hospital; what the surgeon's usages say at each hospital against what the bookings say; and,
 * for people who may change usages, saving the changes the panel offers for one hospital at a time (add the ZB usage, add,
 * change or delete a competitor's usage, adjust the ZB usage).
 *
 * Who calls it: the pipelineBookings component and the deal flyout's bottom-bar badges, and PipelineBookingsControllerTest.
 * What it touches: reads SalesRisks__c (to find the surgeon), Account, Case__c (surgeries), myCase_Usage_Item__c (to count only
 * surgeries that have usage items, as Pipeline's surgeries count always did) and Usage__c; saveHospital inserts, updates and
 * deletes Usage__c. All in the signed-in person's own access (user mode).
 *
 * Rules (Robert, 2026-11-02 and 2026-11-03): a surgery counts when it has already happened and has at least one usage item;
 * demo and non-billable surgeries (Procedure Z02) are left out; Type A01 is a revision, anything else primary; the anatomy
 * comes from Case__c.Surgery_Type__c (201 Hip, 202 Knee, 205 Shoulder / Elbow, 209 CMFT). Only ZB usages are compared with
 * the bookings, because the competitors' numbers are unknown. A surgeon has one usage per hospital, portfolio AND COMPANY: a
 * ZB usage and a competitor's usage can sit side by side at the same hospital, but never two for the same company. The
 * surgeon's rating roll-ups already add up by company across every usage record, so they stay right. The record type of a
 * usage made here is chosen by PipelineUsageController from the person's country and the portfolio. Shoulder is never
 * changed here: its usages are split into anatomical and reverse, which the bookings do not show.
 */
public with sharing class PipelineBookingsController {
  /** One usage record of the surgeon at a hospital, as one company and its cases a year (a hip shows its stems, else its cups). */
  public class UsageLine {
    @AuraEnabled
    public Id usageId;
    /** ZB, a competitor's name, or blank when the record holds cases but no company. */
    @AuraEnabled
    public String company;
    @AuraEnabled
    public Decimal cases = 0;
  }

  /** One hospital for a type of surgery: the surgeries booked there and the surgeon's usages there. */
  public class HospitalRow {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    /** Surgeries booked there in the last 12 whole months. */
    @AuraEnabled
    public Integer booked = 0;
    @AuraEnabled
    public List<UsageLine> lines = new List<UsageLine>();
  }

  public class BookingType {
    /** Hip, Knee, Shoulder or CMFT (the portfolio of a usage is CMF for CMFT). */
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String portfolio;
    /** False for CMFT: there is no primary and revision split. */
    @AuraEnabled
    public Boolean split = true;
    @AuraEnabled
    public List<Integer> primary = new List<Integer>();
    @AuraEnabled
    public List<Integer> revision = new List<Integer>();
    /** This month so far: primary, revision. Not in the 12-month total. */
    @AuraEnabled
    public List<Integer> partial = new List<Integer>{ 0, 0 };
    @AuraEnabled
    public Integer booked = 0;
    /** zb (the usages list ZB cases for this type), competitor (usages exist but no ZB) or none (no usage for this type). */
    @AuraEnabled
    public String usage = 'none';
    /** The ZB cases a year the usages say, when usage is zb. */
    @AuraEnabled
    public Decimal zb = 0;
    /** Every hospital with bookings or usages for this type, busiest first. A row with no id holds surgeries with no hospital recorded. */
    @AuraEnabled
    public List<HospitalRow> rows = new List<HospitalRow>();
    /** The usage record type this person would use for this type in their country, so the screen can read its company choices. */
    @AuraEnabled
    public Id recordTypeId;
    /** True when Pipeline can change this type's usages from the bookings panel (not shoulder). */
    @AuraEnabled
    public Boolean canAuto = true;
  }

  public class Bookings {
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public String surgeonName;
    /** The first day of the first of the 12 whole months, and today. */
    @AuraEnabled
    public Date windowStart;
    @AuraEnabled
    public Date today;
    @AuraEnabled
    public Boolean noUsagesAtAll = false;
    @AuraEnabled
    public Boolean canCreate = false;
    @AuraEnabled
    public Boolean canEdit = false;
    @AuraEnabled
    public Boolean canDelete = false;
    @AuraEnabled
    public List<BookingType> types = new List<BookingType>();
  }

  /** What the bottom-bar buttons show: the surgeon's usages (how long since the newest change) and the 12-month bookings. */
  public class Badges {
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public Boolean hasUsages = false;
    @AuraEnabled
    public Datetime usagesNewest;
    @AuraEnabled
    public Integer booked = 0;
  }

  public class SaveResult {
    @AuraEnabled
    public Integer created = 0;
    @AuraEnabled
    public Integer updated = 0;
    @AuraEnabled
    public Integer deleted = 0;
  }

  /** One change to a hospital's usages: zb (set the ZB cases, creating the ZB usage if there is none), comp (set a usage's cases), add (a competitor's usage) or del (delete a usage). */
  public class Op {
    public String op;
    public Id usageId;
    public String company;
    public Decimal cases;
  }

  /** Case__c.Surgery_Type__c to [name, portfolio]. */
  private static final Map<String, List<String>> ANATOMY = new Map<String, List<String>>{
    '201' => new List<String>{ 'Hip', 'Hip' },
    '202' => new List<String>{ 'Knee', 'Knee' },
    '205' => new List<String>{ 'Shoulder', 'Shoulder' },
    '209' => new List<String>{ 'CMFT', 'CMF' }
  };
  private static final List<String> ORDER = new List<String>{
    '201',
    '202',
    '205',
    '209'
  };
  private static final String NO_HOSPITAL = 'No hospital recorded';

  private static AuraHandledException fail(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }

  private static Id surgeonOf(Id dealId) {
    List<SalesRisks__c> d = [
      SELECT Account__c
      FROM SalesRisks__c
      WHERE Id = :dealId
      WITH USER_MODE
      LIMIT 1
    ];
    return d.isEmpty() ? null : d[0].Account__c;
  }

  /** One counted surgery. */
  private class Counted {
    String anatomy;
    Boolean revision;
    Integer month; // 0 to 11 for the 12 whole months, -1 for this month so far
    Id hospitalId;
    String hospitalName;
  }

  /** The surgeon's counted surgeries from the start of the 12 whole months up to today. */
  private static List<Counted> countedSurgeries(
    Id surgeon,
    Date start,
    Date today
  ) {
    List<Case__c> cases = [
      SELECT
        Id,
        Surgery_Date__c,
        Surgery_Type__c,
        Procedure__c,
        Healthcare_Facility__c,
        Healthcare_Facility__r.Name
      FROM Case__c
      WHERE
        Physician__c = :surgeon
        AND Surgery_Date__c >= :start
        AND Surgery_Date__c < :today
        AND Surgery_Type__c IN :ORDER
      WITH USER_MODE
      LIMIT 20000
    ];
    List<Counted> out = new List<Counted>();
    if (cases.isEmpty()) {
      return out;
    }
    Set<Id> withItems = new Set<Id>();
    for (AggregateResult ar : [
      SELECT Usage_Sheet_ID__r.Case__c c
      FROM myCase_Usage_Item__c
      WHERE
        Usage_Sheet_ID__r.Case__r.Physician__c = :surgeon
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :start
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :today
      WITH USER_MODE
      GROUP BY Usage_Sheet_ID__r.Case__c
    ]) {
      withItems.add((Id) ar.get('c'));
    }
    Date thisMonth = today.toStartOfMonth();
    for (Case__c c : cases) {
      if (!withItems.contains(c.Id) || c.Procedure__c == 'Z02') {
        continue;
      }
      Counted k = new Counted();
      k.anatomy = c.Surgery_Type__c;
      k.revision = c.Procedure__c == 'A01' && c.Surgery_Type__c != '209';
      k.month = c.Surgery_Date__c >= thisMonth
        ? -1
        : (c.Surgery_Date__c.year() - start.year()) * 12 +
          c.Surgery_Date__c.month() -
          start.month();
      k.hospitalId = c.Healthcare_Facility__c;
      k.hospitalName = c.Healthcare_Facility__r?.Name;
      out.add(k);
    }
    return out;
  }

  /** The usages of a surgeon, with every line the Pipeline screen reads. */
  private static List<Usage__c> usagesOf(Id surgeon) {
    return [
      SELECT
        Id,
        LastModifiedDate,
        Healthcare_Facility__c,
        Healthcare_Facility__r.Name,
        RecordTypeId,
        CompanyHipStems__c,
        CasesPAHipStem__c,
        CompanyHipCups__c,
        CasesPAHipCup__c,
        CompanyTotalKnee__c,
        CasesPATotalKnee__c,
        CompanyAnatomical__c,
        CasesPAAnatomical__c,
        CompanyReverse__c,
        CasesPAReverse__c,
        Company_CMFT__c,
        Cases_PA_CMFT__c
      FROM Usage__c
      WHERE HCP2__c = :surgeon
      WITH USER_MODE
      LIMIT 500
    ];
  }

  private static Decimal n(Decimal v) {
    return v == null ? 0 : v;
  }

  private static Decimal zbIf(String company, Decimal cases) {
    return company == 'ZB' ? n(cases) : 0;
  }

  private static Boolean anyIn(String company, Decimal cases) {
    return !String.isBlank(company) || n(cases) > 0;
  }

  /** A usage record's ZB cases a year for one portfolio (a hip case uses one stem and one cup, so the larger of the two). */
  @TestVisible
  private static Decimal zbOf(Usage__c u, String portfolio) {
    if (portfolio == 'Hip') {
      return Math.max(
        zbIf(u.CompanyHipStems__c, u.CasesPAHipStem__c),
        zbIf(u.CompanyHipCups__c, u.CasesPAHipCup__c)
      );
    }
    if (portfolio == 'Knee') {
      return zbIf(u.CompanyTotalKnee__c, u.CasesPATotalKnee__c);
    }
    if (portfolio == 'Shoulder') {
      return zbIf(u.CompanyAnatomical__c, u.CasesPAAnatomical__c) +
        zbIf(u.CompanyReverse__c, u.CasesPAReverse__c);
    }
    return zbIf(u.Company_CMFT__c, u.Cases_PA_CMFT__c);
  }

  private static Boolean hasData(Usage__c u, String portfolio) {
    if (portfolio == 'Hip') {
      return anyIn(u.CompanyHipStems__c, u.CasesPAHipStem__c) ||
        anyIn(u.CompanyHipCups__c, u.CasesPAHipCup__c);
    }
    if (portfolio == 'Knee') {
      return anyIn(u.CompanyTotalKnee__c, u.CasesPATotalKnee__c);
    }
    if (portfolio == 'Shoulder') {
      return anyIn(u.CompanyAnatomical__c, u.CasesPAAnatomical__c) ||
        anyIn(u.CompanyReverse__c, u.CasesPAReverse__c);
    }
    return anyIn(u.Company_CMFT__c, u.Cases_PA_CMFT__c);
  }

  @AuraEnabled
  public static Bookings getBookings(Id dealId) {
    Bookings out = new Bookings();
    out.surgeonId = surgeonOf(dealId);
    if (out.surgeonId == null) {
      return out;
    }
    Id surgeon = out.surgeonId;
    out.surgeonName = [
      SELECT Name
      FROM Account
      WHERE Id = :surgeon
      WITH USER_MODE
    ]
    .Name;
    Date today = Date.today();
    out.today = today;
    out.windowStart = today.toStartOfMonth().addMonths(-12);
    Schema.DescribeSObjectResult usageInfo = Usage__c.SObjectType.getDescribe();
    out.canCreate = usageInfo.isCreateable();
    out.canEdit = usageInfo.isUpdateable();
    out.canDelete = usageInfo.isDeletable();

    List<Usage__c> usages = usagesOf(surgeon);
    out.noUsagesAtAll = usages.isEmpty();

    Map<String, BookingType> byAnatomy = new Map<String, BookingType>();
    Map<String, Map<String, HospitalRow>> hospitals = new Map<String, Map<String, HospitalRow>>();
    for (Counted k : countedSurgeries(surgeon, out.windowStart, today)) {
      BookingType t = byAnatomy.get(k.anatomy);
      if (t == null) {
        t = new BookingType();
        t.name = ANATOMY.get(k.anatomy)[0];
        t.portfolio = ANATOMY.get(k.anatomy)[1];
        t.split = k.anatomy != '209';
        for (Integer i = 0; i < 12; i++) {
          t.primary.add(0);
          t.revision.add(0);
        }
        t.canAuto = t.portfolio != 'Shoulder';
        byAnatomy.put(k.anatomy, t);
        hospitals.put(k.anatomy, new Map<String, HospitalRow>());
      }
      if (k.month < 0) {
        Integer which = k.revision ? 1 : 0;
        t.partial[which] = t.partial[which] + 1;
        continue;
      }
      if (k.revision) {
        t.revision[k.month] = t.revision[k.month] + 1;
      } else {
        t.primary[k.month] = t.primary[k.month] + 1;
      }
      t.booked++;
      String key = String.valueOf(k.hospitalId);
      HospitalRow h = hospitals.get(k.anatomy).get(key);
      if (h == null) {
        h = new HospitalRow();
        h.id = k.hospitalId;
        h.name = String.isBlank(k.hospitalName) ? NO_HOSPITAL : k.hospitalName;
        hospitals.get(k.anatomy).put(key, h);
      }
      h.booked++;
    }
    for (String a : ORDER) {
      BookingType t = byAnatomy.get(a);
      if (t == null) {
        continue;
      }
      Map<String, HospitalRow> rowsByKey = hospitals.get(a);
      Decimal zb = 0;
      Boolean hasLine = false;
      for (Usage__c u : usages) {
        zb += zbOf(u, t.portfolio);
        Boolean has = hasData(u, t.portfolio);
        hasLine = hasLine || has;
        if (has && u.Healthcare_Facility__c != null) {
          String key = String.valueOf(u.Healthcare_Facility__c);
          HospitalRow h = rowsByKey.get(key);
          if (h == null) {
            h = new HospitalRow();
            h.id = u.Healthcare_Facility__c;
            h.name = u.Healthcare_Facility__r?.Name;
            rowsByKey.put(key, h);
          }
          h.lines.add(lineOf(u, t.portfolio));
        }
      }
      List<HospitalRow> byCount = rowsByKey.values();
      byCount.sort(new HospitalOrder());
      t.rows = byCount;
      Schema.RecordTypeInfo info = PipelineUsageController.recordTypeForPortfolio(
        t.portfolio
      );
      t.recordTypeId = info == null ? null : info.getRecordTypeId();
      t.zb = zb;
      t.usage = zb > 0 ? 'zb' : (hasLine ? 'competitor' : 'none');
      out.types.add(t);
    }
    return out;
  }

  /** Busiest hospital first; hospitals with usages only (no bookings) after them, by name. */
  private class HospitalOrder implements System.Comparator<HospitalRow> {
    public Integer compare(HospitalRow a, HospitalRow b) {
      if (a.booked != b.booked) {
        return b.booked - a.booked;
      }
      return (a.name == null ? '' : a.name)
        .compareTo(b.name == null ? '' : b.name);
    }
  }

  /** A usage record as one company and its cases a year, for the portfolio's first line that holds anything. */
  private static UsageLine lineOf(Usage__c u, String portfolio) {
    UsageLine l = new UsageLine();
    l.usageId = u.Id;
    for (List<String> f : lineFields(portfolio)) {
      String company = (String) u.get(f[0]);
      Decimal cases = (Decimal) u.get(f[1]);
      if (!String.isBlank(company) || n(cases) > 0) {
        l.company = company;
        l.cases = n(cases);
        break;
      }
    }
    return l;
  }

  @AuraEnabled
  public static Badges getBadges(Id dealId) {
    Badges out = new Badges();
    out.surgeonId = surgeonOf(dealId);
    if (out.surgeonId == null) {
      return out;
    }
    Date today = Date.today();
    Date start = today.toStartOfMonth().addMonths(-12);
    for (Usage__c u : usagesOf(out.surgeonId)) {
      out.hasUsages = true;
      if (out.usagesNewest == null || u.LastModifiedDate > out.usagesNewest) {
        out.usagesNewest = u.LastModifiedDate;
      }
    }
    for (Counted k : countedSurgeries(out.surgeonId, start, today)) {
      if (k.month >= 0) {
        out.booked++;
      }
    }
    return out;
  }

  /** The company and cases fields of a usage's lines for a portfolio: [company, cases] for each product line. */
  private static List<List<String>> lineFields(String portfolio) {
    if (portfolio == 'Hip') {
      return new List<List<String>>{
        new List<String>{ 'CompanyHipStems__c', 'CasesPAHipStem__c' },
        new List<String>{ 'CompanyHipCups__c', 'CasesPAHipCup__c' }
      };
    }
    if (portfolio == 'Knee') {
      return new List<List<String>>{
        new List<String>{ 'CompanyTotalKnee__c', 'CasesPATotalKnee__c' }
      };
    }
    return new List<List<String>>{
      new List<String>{ 'Company_CMFT__c', 'Cases_PA_CMFT__c' }
    };
  }

  private static List<Op> parseOps(String opsJson) {
    try {
      return (List<Op>) JSON.deserialize(opsJson, List<Op>.class);
    } catch (Exception e) {
      throw fail('The changes could not be read.');
    }
  }

  /** Sets the cases on every line of a usage that holds this company (a hip's stems and cups both). */
  private static void setCases(
    Usage__c u,
    String portfolio,
    String company,
    Decimal cases
  ) {
    for (List<String> f : lineFields(portfolio)) {
      if ((String) u.get(f[0]) == company) {
        u.put(f[1], cases);
      }
    }
  }

  private static Boolean holdsCompany(
    Usage__c u,
    String portfolio,
    String company
  ) {
    for (List<String> f : lineFields(portfolio)) {
      if ((String) u.get(f[0]) == company) {
        return true;
      }
    }
    return false;
  }

  /** A new usage for one company: every line of the portfolio carries that company and number (a hip's stems and cups each). */
  private static Usage__c newUsage(
    Id surgeon,
    Id hospitalId,
    Id rtId,
    String portfolio,
    String company,
    Decimal cases
  ) {
    Usage__c u = new Usage__c(
      HCP2__c = surgeon,
      Healthcare_Facility__c = hospitalId,
      RecordTypeId = rtId
    );
    for (List<String> f : lineFields(portfolio)) {
      u.put(f[0], company);
      u.put(f[1], cases);
    }
    return u;
  }

  /**
   * Saves the changes the person chose for one hospital and one type of surgery, all or nothing. Each change is one of:
   * zb (set the ZB cases a year, creating the ZB usage when the surgeon has none there), comp (set the cases of a
   * competitor's usage), add (a new usage for a competitor) or del (delete a usage). A surgeon never gets two usages for
   * the same company at a hospital.
   */
  @AuraEnabled
  public static SaveResult saveHospital(
    Id dealId,
    String portfolio,
    Id hospitalId,
    String opsJson
  ) {
    if (portfolio != 'Hip' && portfolio != 'Knee' && portfolio != 'CMF') {
      throw fail(
        'Shoulder usages are split into anatomical and reverse, which the bookings do not show, so enter them in the usages.'
      );
    }
    if (hospitalId == null) {
      throw fail(
        'A usage needs a hospital, and these surgeries have none recorded.'
      );
    }
    Schema.RecordTypeInfo info = PipelineUsageController.recordTypeForPortfolio(
      portfolio
    );
    if (info == null) {
      throw fail(
        'A usage cannot be made for this portfolio with your country\'s record types.'
      );
    }
    Id surgeon = surgeonOf(dealId);
    if (surgeon == null) {
      throw fail('This deal has no Primary HCP.');
    }
    List<Op> ops = parseOps(opsJson);
    if (ops.isEmpty()) {
      throw fail('There is nothing to save.');
    }
    Map<Id, Usage__c> here = new Map<Id, Usage__c>();
    for (Usage__c u : usagesOf(surgeon)) {
      if (u.Healthcare_Facility__c == hospitalId && hasData(u, portfolio)) {
        here.put(u.Id, u);
      }
    }
    Map<Id, Usage__c> toUpdate = new Map<Id, Usage__c>();
    List<Usage__c> toInsert = new List<Usage__c>();
    List<Id> toDelete = new List<Id>();
    for (Op o : ops) {
      if (o.op == 'zb' || o.op == 'comp' || o.op == 'add') {
        if (o.cases == null || o.cases < 0) {
          throw fail('Enter the cases a year as a number, zero or more.');
        }
      }
      if (o.op == 'zb') {
        Usage__c zbUsage;
        for (Usage__c u : here.values()) {
          if (holdsCompany(u, portfolio, 'ZB')) {
            zbUsage = u;
            break;
          }
        }
        if (zbUsage != null) {
          setCases(zbUsage, portfolio, 'ZB', o.cases);
          toUpdate.put(zbUsage.Id, zbUsage);
        } else {
          toInsert.add(
            newUsage(
              surgeon,
              hospitalId,
              info.getRecordTypeId(),
              portfolio,
              'ZB',
              o.cases
            )
          );
        }
      } else if (o.op == 'comp' || o.op == 'del') {
        Usage__c u = here.get(o.usageId);
        if (u == null) {
          throw fail(
            'That usage is not one of this surgeon\'s usages at this hospital.'
          );
        }
        if (o.op == 'del') {
          toDelete.add(u.Id);
        } else {
          String company = lineOf(u, portfolio).company;
          setCases(u, portfolio, company, o.cases);
          toUpdate.put(u.Id, u);
        }
      } else if (o.op == 'add') {
        if (String.isBlank(o.company) || o.company == 'ZB') {
          throw fail('Choose the competitor\'s company.');
        }
        for (Usage__c u : here.values()) {
          if (
            holdsCompany(u, portfolio, o.company) && !toDelete.contains(u.Id)
          ) {
            throw fail(
              'This surgeon already has a usage for ' +
                o.company +
                ' at this hospital. Change that one instead.'
            );
          }
        }
        for (Usage__c u : toInsert) {
          if (holdsCompany(u, portfolio, o.company)) {
            throw fail('Each company can only be added once at a hospital.');
          }
        }
        toInsert.add(
          newUsage(
            surgeon,
            hospitalId,
            info.getRecordTypeId(),
            portfolio,
            o.company,
            o.cases
          )
        );
      } else {
        throw fail('That change is not known.');
      }
    }
    SaveResult r = new SaveResult();
    try {
      if (!toUpdate.isEmpty()) {
        List<Usage__c> changed = toUpdate.values();
        update as user changed;
        r.updated = changed.size();
      }
      if (!toInsert.isEmpty()) {
        insert as user toInsert;
        r.created = toInsert.size();
      }
    } catch (Exception e) {
      throw fail(e.getMessage());
    }
    for (Id usageId : toDelete) {
      // clears the lines first so the surgeon's ratings recalculate, then deletes (the same as the Usages panel)
      PipelineUsageController.deleteUsage(usageId);
      r.deleted++;
    }
    return r;
  }
}

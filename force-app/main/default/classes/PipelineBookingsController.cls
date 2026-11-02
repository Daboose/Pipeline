/**
 * Pipeline: the My Case Bookings panel in the deal flyout. How a surgeon is tracking: surgeries per month for the last 12
 * whole months (plus this month so far), by type of surgery (Hip, Knee, Shoulder, CMFT), split into primary and revision
 * (CMFT is never split), and by hospital; whether the surgeon's usages say what the bookings say; and, for people who may
 * change usages, creating or adjusting the ZB usages from the bookings.
 *
 * Who calls it: the pipelineBookings component and the deal flyout's bottom-bar badges, and PipelineBookingsControllerTest.
 * What it touches: reads SalesRisks__c (to find the surgeon), Account, Case__c (surgeries), myCase_Usage_Item__c (to count only
 * surgeries that have usage items, as Pipeline's surgeries count always did) and Usage__c; createFromBookings and
 * adjustToBookings insert and update Usage__c. All in the signed-in person's own access (user mode).
 *
 * Rules (Robert, 2026-11-02): a surgery counts when it has already happened and has at least one usage item; demo and
 * non-billable surgeries (Procedure Z02) are left out; Type A01 is a revision, anything else primary; the anatomy comes from
 * Case__c.Surgery_Type__c (201 Hip, 202 Knee, 205 Shoulder / Elbow, 209 CMFT). Only ZB usages are compared with the
 * bookings, because the competitors' numbers are unknown. The record type of a usage made here is chosen by
 * PipelineUsageController from the person's country and the portfolio. Shoulder is never created or adjusted here: its
 * usages are split into anatomical and reverse, which the bookings do not show.
 */
public with sharing class PipelineBookingsController {
  public class Hospital {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    /** Surgeries booked there in the last 12 whole months. */
    @AuraEnabled
    public Integer count = 0;
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
    @AuraEnabled
    public List<Hospital> hospitals = new List<Hospital>();
    /** True when Pipeline can create or adjust this type's usages from the bookings (not shoulder). */
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

  public class Result {
    @AuraEnabled
    public Integer created = 0;
    @AuraEnabled
    public Integer updated = 0;
    /** Lines left alone because they hold a competitor, not ZB. */
    @AuraEnabled
    public Integer skipped = 0;
    @AuraEnabled
    public Integer total = 0;
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

    List<Usage__c> usages = usagesOf(surgeon);
    out.noUsagesAtAll = usages.isEmpty();

    Map<String, BookingType> byAnatomy = new Map<String, BookingType>();
    Map<String, Map<String, Hospital>> hospitals = new Map<String, Map<String, Hospital>>();
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
        hospitals.put(k.anatomy, new Map<String, Hospital>());
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
      Hospital h = hospitals.get(k.anatomy).get(key);
      if (h == null) {
        h = new Hospital();
        h.id = k.hospitalId;
        h.name = String.isBlank(k.hospitalName) ? NO_HOSPITAL : k.hospitalName;
        hospitals.get(k.anatomy).put(key, h);
      }
      h.count++;
    }
    for (String a : ORDER) {
      BookingType t = byAnatomy.get(a);
      if (t == null) {
        continue;
      }
      List<Hospital> byCount = hospitals.get(a).values();
      byCount.sort(new HospitalOrder());
      t.hospitals = byCount;
      Decimal zb = 0;
      Boolean hasLine = false;
      for (Usage__c u : usages) {
        zb += zbOf(u, t.portfolio);
        hasLine = hasLine || hasData(u, t.portfolio);
      }
      t.zb = zb;
      t.usage = zb > 0 ? 'zb' : (hasLine ? 'competitor' : 'none');
      out.types.add(t);
    }
    return out;
  }

  /** Busiest hospital first. */
  private class HospitalOrder implements System.Comparator<Hospital> {
    public Integer compare(Hospital a, Hospital b) {
      return b.count - a.count;
    }
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

  /** Makes the ZB usages of one portfolio match the last 12 months of bookings, hospital by hospital. */
  private static Result applyBookings(Id dealId, String portfolio) {
    if (portfolio != 'Hip' && portfolio != 'Knee' && portfolio != 'CMF') {
      throw fail(
        'Shoulder usages are split into anatomical and reverse, which the bookings do not show, so enter them in the usages.'
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
    Date today = Date.today();
    Date start = today.toStartOfMonth().addMonths(-12);
    String anatomy = portfolio == 'CMF'
      ? '209'
      : (portfolio == 'Hip' ? '201' : '202');
    Map<String, Integer> counts = new Map<String, Integer>();
    for (Counted k : countedSurgeries(surgeon, start, today)) {
      if (k.anatomy == anatomy && k.month >= 0) {
        String key = String.valueOf(k.hospitalId);
        counts.put(key, (counts.containsKey(key) ? counts.get(key) : 0) + 1);
      }
    }
    if (counts.isEmpty()) {
      throw fail('There are no bookings in the last 12 months to work from.');
    }
    Id rtId = info.getRecordTypeId();
    List<Usage__c> existing = new List<Usage__c>();
    for (Usage__c u : usagesOf(surgeon)) {
      if (u.RecordTypeId == rtId) {
        existing.add(u);
      }
    }
    Map<String, Usage__c> byHospital = new Map<String, Usage__c>();
    for (Usage__c u : existing) {
      String key = String.valueOf(u.Healthcare_Facility__c);
      if (!byHospital.containsKey(key)) {
        byHospital.put(key, u);
      }
    }
    Result r = new Result();
    List<Usage__c> toInsert = new List<Usage__c>();
    List<Usage__c> toUpdate = new List<Usage__c>();
    List<List<String>> fields = lineFields(portfolio);
    for (String key : counts.keySet()) {
      Integer count = counts.get(key);
      r.total += count;
      Usage__c u = byHospital.get(key);
      Boolean isNew = u == null;
      if (isNew) {
        u = new Usage__c(
          HCP2__c = surgeon,
          RecordTypeId = rtId,
          Healthcare_Facility__c = key == 'null' ? null : (Id) key
        );
      }
      Boolean changed = false;
      for (List<String> f : fields) {
        String company = (String) u.get(f[0]);
        if (String.isBlank(company) || company == 'ZB') {
          u.put(f[0], 'ZB');
          u.put(f[1], count);
          changed = true;
        } else {
          r.skipped++;
        }
      }
      if (changed) {
        if (isNew) {
          toInsert.add(u);
        } else {
          toUpdate.add(u);
        }
      }
    }
    // ZB usages at hospitals with no bookings in the last 12 months are brought down to nothing
    for (Usage__c u : existing) {
      if (counts.containsKey(String.valueOf(u.Healthcare_Facility__c))) {
        continue;
      }
      Boolean changed = false;
      for (List<String> f : fields) {
        if ((String) u.get(f[0]) == 'ZB' && n((Decimal) u.get(f[1])) > 0) {
          u.put(f[1], 0);
          changed = true;
        }
      }
      if (changed) {
        toUpdate.add(u);
      }
    }
    try {
      if (!toInsert.isEmpty()) {
        insert as user toInsert;
      }
      if (!toUpdate.isEmpty()) {
        update as user toUpdate;
      }
    } catch (Exception e) {
      throw fail(e.getMessage());
    }
    r.created = toInsert.size();
    r.updated = toUpdate.size();
    return r;
  }

  /** Makes usages for a portfolio from the last 12 months of bookings: one usage per hospital, ZB, the year's cases. */
  @AuraEnabled
  public static Result createFromBookings(Id dealId, String portfolio) {
    return applyBookings(dealId, portfolio);
  }

  /** Changes the ZB usages of a portfolio to match the last 12 months of bookings. */
  @AuraEnabled
  public static Result adjustToBookings(Id dealId, String portfolio) {
    return applyBookings(dealId, portfolio);
  }
}

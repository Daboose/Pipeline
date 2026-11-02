/**
 * Pipeline: what the deal flyout shows about the deal's surgeon (the Primary HCP): their usages and their surgeries.
 *
 * Who calls it: the pipelineUsages and pipelineSurgeries components in the deal flyout, and PipelineSurgeonControllerTest.
 * What it touches: reads SalesRisks__c (to find the surgeon), Account (the four usage ratings), Usage__c (what the
 * surgeon uses, ZB or a competitor), Case__c (surgeries) and myCase_Usage__c / myCase_Usage_Item__c (to count only
 * surgeries that have usage items). All in the signed-in person's own access. It changes nothing.
 *
 * Surgeries (Robert, 2026-11-01): the last 365 days up to today, by surgery type, counting a surgery only when at least
 * one usage item (myCase_Usage_Item__c) is linked to one of its usage sheets (myCase_Usage__c), the manual usage sheet
 * included. A surgery can go ahead with every item entered by hand in SAP, which lands on the manual sheet, so the sheet
 * count on the case is not used. Surgery records exist for Australia only.
 */
public with sharing class PipelineSurgeonController {
  /** One area's rating (PLATINUM, GOLD, SILVER or BRONZE), stored on the surgeon's account. */
  public class Rating {
    @AuraEnabled
    public String area;
    @AuraEnabled
    public String rating;
  }

  /** One line of the usages list: the hospital, the portfolio, which product, the company and cases per year. */
  public class UsageLine {
    @AuraEnabled
    public String hospital;
    @AuraEnabled
    public String portfolio;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String company;
    @AuraEnabled
    public Decimal cases;
    /** For editing: the usage record this line belongs to, its product line (stems, cups, knee, anatomical, reverse, cmft), the hospital and the record type; empty is true for a line with no data yet. */
    @AuraEnabled
    public Id usageId;
    @AuraEnabled
    public String key;
    @AuraEnabled
    public Id hospitalId;
    @AuraEnabled
    public String recordType;
    @AuraEnabled
    public Id recordTypeId;
    @AuraEnabled
    public Boolean empty = false;
  }

  public class Usages {
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public String surgeonName;
    @AuraEnabled
    public List<Rating> ratings = new List<Rating>();
    /** The most recent change to any of the surgeon's usages, and the oldest. */
    @AuraEnabled
    public Datetime newest;
    @AuraEnabled
    public Datetime oldest;
    @AuraEnabled
    public List<UsageLine> lines = new List<UsageLine>();
    /** What the signed-in person may do with usages (object permissions), and the portfolios they may add (with the record type each would be saved as). */
    @AuraEnabled
    public Boolean canEdit = false;
    @AuraEnabled
    public Boolean canCreate = false;
    @AuraEnabled
    public Boolean canDelete = false;
    @AuraEnabled
    public List<PipelineUsageController.AddOption> addable = new List<PipelineUsageController.AddOption>();
  }

  public class SurgeryCount {
    @AuraEnabled
    public String type;
    @AuraEnabled
    public Integer count = 0;
  }

  public class Surgeries {
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public Integer total = 0;
    @AuraEnabled
    public List<SurgeryCount> byType = new List<SurgeryCount>();
  }

  /** The three types always shown (even at zero); any other type is shown when it has surgeries. */
  private static final List<String> ALWAYS = new List<String>{
    'Hip',
    'Knee',
    'Shoulder / Elbow'
  };

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

  @AuraEnabled
  public static Usages getUsages(Id dealId) {
    Usages out = new Usages();
    out.surgeonId = surgeonOf(dealId);
    if (out.surgeonId == null) {
      return out;
    }
    Id surgeon = out.surgeonId;
    Account a = [
      SELECT
        Name,
        HCPUsageHipRating__c,
        HCPUsageKneeRating__c,
        HCPUsageShoulderRating__c,
        HCPUsageCMFRating__c
      FROM Account
      WHERE Id = :surgeon
      WITH USER_MODE
    ];
    out.surgeonName = a.Name;
    out.ratings = ratingsFrom(
      a.HCPUsageHipRating__c,
      a.HCPUsageKneeRating__c,
      a.HCPUsageShoulderRating__c,
      a.HCPUsageCMFRating__c
    );
    for (Usage__c u : [
      SELECT
        Id,
        LastModifiedDate,
        RecordTypeId,
        RecordType.Name,
        Healthcare_Facility__c,
        Healthcare_Facility__r.Name,
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
      ORDER BY Healthcare_Facility__r.Name NULLS LAST, Id
      LIMIT 200
    ]) {
      if (out.newest == null || u.LastModifiedDate > out.newest) {
        out.newest = u.LastModifiedDate;
      }
      if (out.oldest == null || u.LastModifiedDate < out.oldest) {
        out.oldest = u.LastModifiedDate;
      }
      out.lines.addAll(recordLines(u));
    }
    Schema.DescribeSObjectResult usageInfo = Usage__c.SObjectType.getDescribe();
    out.canEdit = usageInfo.isUpdateable();
    out.canCreate = usageInfo.isCreateable();
    out.canDelete = usageInfo.isDeletable();
    out.addable = out.canCreate
      ? PipelineUsageController.addOptions()
      : new List<PipelineUsageController.AddOption>();
    return out;
  }

  @AuraEnabled
  public static Surgeries getSurgeries(Id dealId) {
    Surgeries out = new Surgeries();
    out.surgeonId = surgeonOf(dealId);
    if (out.surgeonId == null) {
      return out;
    }
    Id surgeon = out.surgeonId;
    Date today = Date.today();
    Date from365 = today.addDays(-365);
    List<Case__c> cases = [
      SELECT Id, Surgery_Type__c
      FROM Case__c
      WHERE
        Physician__c = :surgeon
        AND Surgery_Date__c >= :from365
        AND Surgery_Date__c < :today
      WITH USER_MODE
      LIMIT 5000
    ];
    Set<Id> withItems = new Set<Id>();
    if (!cases.isEmpty()) {
      for (AggregateResult ar : [
        SELECT Usage_Sheet_ID__r.Case__c c
        FROM myCase_Usage_Item__c
        WHERE
          Usage_Sheet_ID__r.Case__r.Physician__c = :surgeon
          AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :from365
          AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :today
        WITH USER_MODE
        GROUP BY Usage_Sheet_ID__r.Case__c
      ]) {
        withItems.add((Id) ar.get('c'));
      }
    }
    Surgeries counted = countByType(cases, withItems, typeLabels());
    counted.surgeonId = surgeon;
    return counted;
  }

  /** The four ratings, in the order Hip, Knee, Shoulder, CMF. A missing rating is blank. */
  @TestVisible
  private static List<Rating> ratingsFrom(
    String hip,
    String knee,
    String shoulder,
    String cmf
  ) {
    return new List<Rating>{
      rating('Hip', hip),
      rating('Knee', knee),
      rating('Shoulder', shoulder),
      rating('CMF', cmf)
    };
  }

  private static Rating rating(String area, String value) {
    Rating r = new Rating();
    r.area = area;
    r.rating = value;
    return r;
  }

  /**
   * All the lines of one usage record for the screen: the lines with data (see linesOf), each tagged with the record, and
   * for a record whose record type names its portfolio, also an empty line for each product line of that portfolio that has
   * no data yet (so a hip usage with only stems can be given cups). A record with no usable record type shows only its lines.
   */
  @TestVisible
  private static List<UsageLine> recordLines(Usage__c u) {
    String hospital = u.Healthcare_Facility__r?.Name;
    String recordType = u.RecordType?.Name;
    String portfolio = PipelineUsageController.portfolioOf(recordType);
    List<UsageLine> lines = linesOf(u, hospital);
    if (portfolio != null) {
      Set<String> have = new Set<String>();
      for (UsageLine l : lines) {
        have.add(l.key);
      }
      for (String key : PipelineUsageController.keysFor(portfolio)) {
        if (!have.contains(key)) {
          UsageLine blank = new UsageLine();
          blank.hospital = hospital;
          blank.portfolio = portfolio;
          blank.label = labelOf(key);
          blank.key = key;
          blank.empty = true;
          lines.add(blank);
        }
      }
      lines.sort(new LineOrder());
    }
    for (UsageLine l : lines) {
      l.usageId = u.Id;
      l.hospitalId = u.Healthcare_Facility__c;
      l.recordType = recordType;
      l.recordTypeId = u.RecordTypeId;
    }
    return lines;
  }

  private static String labelOf(String key) {
    return new Map<String, String>{
        'stems' => 'Stems',
        'cups' => 'Cups',
        'knee' => 'Knee',
        'anatomical' => 'Anatomical',
        'reverse' => 'Reverse',
        'cmft' => 'CMFT'
      }
      .get(key);
  }

  /** Keeps a record's lines in the product order (stems before cups, anatomical before reverse). */
  private class LineOrder implements System.Comparator<UsageLine> {
    public Integer compare(UsageLine a, UsageLine b) {
      List<String> order = new List<String>{
        'stems',
        'cups',
        'knee',
        'anatomical',
        'reverse',
        'cmft'
      };
      return order.indexOf(a.key) - order.indexOf(b.key);
    }
  }

  /**
   * The lines one usage record gives: hip stems and hip cups (each with its own company and cases), knee, shoulder
   * anatomical and reverse, and CMFT. A product with no company and no cases (blank or 0) is left out.
   */
  @TestVisible
  private static List<UsageLine> linesOf(Usage__c u, String hospital) {
    List<UsageLine> out = new List<UsageLine>();
    add(
      out,
      hospital,
      'Hip',
      'Stems',
      'stems',
      u.CompanyHipStems__c,
      u.CasesPAHipStem__c
    );
    add(
      out,
      hospital,
      'Hip',
      'Cups',
      'cups',
      u.CompanyHipCups__c,
      u.CasesPAHipCup__c
    );
    add(
      out,
      hospital,
      'Knee',
      'Knee',
      'knee',
      u.CompanyTotalKnee__c,
      u.CasesPATotalKnee__c
    );
    add(
      out,
      hospital,
      'Shoulder',
      'Anatomical',
      'anatomical',
      u.CompanyAnatomical__c,
      u.CasesPAAnatomical__c
    );
    add(
      out,
      hospital,
      'Shoulder',
      'Reverse',
      'reverse',
      u.CompanyReverse__c,
      u.CasesPAReverse__c
    );
    add(
      out,
      hospital,
      'CMF',
      'CMFT',
      'cmft',
      u.Company_CMFT__c,
      u.Cases_PA_CMFT__c
    );
    return out;
  }

  private static void add(
    List<UsageLine> out,
    String hospital,
    String portfolio,
    String label,
    String key,
    String company,
    Decimal cases
  ) {
    // an unused product holds no company and 0 (or nothing) for cases: it is not a usage
    if (String.isBlank(company) && (cases == null || cases == 0)) {
      return;
    }
    UsageLine l = new UsageLine();
    l.hospital = hospital;
    l.portfolio = portfolio;
    l.label = label;
    l.key = key;
    l.company = company;
    l.cases = cases;
    out.add(l);
  }

  /** The label of each surgery type value (201 is Hip, 202 is Knee and so on), read from the picklist. */
  private static Map<String, String> typeLabels() {
    Map<String, String> out = new Map<String, String>();
    for (
      Schema.PicklistEntry e : Case__c.Surgery_Type__c.getDescribe()
        .getPicklistValues()
    ) {
      out.put(e.getValue(), e.getLabel());
    }
    return out;
  }

  /**
   * Counts the surgeries that have usage items, by type. The three usual types are always listed; any other type is
   * listed only when it has surgeries; the rest follow by count, highest first.
   */
  @TestVisible
  private static Surgeries countByType(
    List<Case__c> cases,
    Set<Id> withItems,
    Map<String, String> labels
  ) {
    Surgeries out = new Surgeries();
    Map<String, Integer> counts = new Map<String, Integer>();
    for (String t : ALWAYS) {
      counts.put(t, 0);
    }
    for (Case__c c : cases) {
      if (!withItems.contains(c.Id)) {
        continue;
      }
      String label = labels.containsKey(c.Surgery_Type__c)
        ? labels.get(c.Surgery_Type__c)
        : (String.isBlank(c.Surgery_Type__c)
            ? 'Not stated'
            : c.Surgery_Type__c);
      counts.put(
        label,
        (counts.containsKey(label) ? counts.get(label) : 0) + 1
      );
      out.total++;
    }
    List<String> extras = new List<String>();
    for (String label : counts.keySet()) {
      if (!ALWAYS.contains(label) && counts.get(label) > 0) {
        extras.add(label);
      }
    }
    extras.sort();
    List<String> order = new List<String>(ALWAYS);
    order.addAll(extras);
    for (String label : order) {
      SurgeryCount sc = new SurgeryCount();
      sc.type = label;
      sc.count = counts.get(label);
      out.byType.add(sc);
    }
    return out;
  }
}

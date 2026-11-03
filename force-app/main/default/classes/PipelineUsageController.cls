/**
 * Pipeline: changes a surgeon's usages from the Surgeon Usages panel in the deal flyout (edit a line, delete a usage, add a usage).
 *
 * Who calls it: the pipelineUsages component, PipelineSurgeonController (for the record types a person may add ) and PipelineUsageControllerTest.
 * What it touches: Usage__c (update, delete, insert). All in the signed-in person's own access (user mode), so object and
 * field permissions and sharing apply exactly as they do on the standard page; a refused change comes back as an error
 * message and nothing is half-saved.
 *
 * What a usage is (Robert, 2026-11-02): one Usage__c record is one surgeon at one hospital for one portfolio. The portfolio is
 * the record type, and a record type is the person's country plus the portfolio ("ANZ HIP", "ANZ KNEE", "ANZ SHOULDERS",
 * "ANZ CMFT"; "SG HIP", "IN KNEE" and so on; Australia and New Zealand share "ANZ"). A surgeon may have usages at the same
 * hospital for different portfolios, and (Robert, 2026-11-03) for different COMPANIES in the same portfolio (ZB and each
 * competitor have their own usage), but never two for the same company: adding one that exists returns the existing one
 * so the person can edit it instead. The record type of a new usage is chosen here from the person's country (their
 * user's Country) and the portfolio, never typed in.
 */
public with sharing class PipelineUsageController {
  /** One line the person typed: which product line (stems, cups, knee, anatomical, reverse, cmft), its company and cases per year. */
  public class LineIn {
    public String key;
    public String company;
    public Decimal cases;
  }

  /** A portfolio the person may add a usage for, and the record type it would be saved as. */
  public class AddOption {
    @AuraEnabled
    public String portfolio;
    @AuraEnabled
    public String recordType;
    /** Its id, so the screen can read that record type's own company choices (they differ by record type) from Salesforce. */
    @AuraEnabled
    public Id recordTypeId;
  }

  public class Result {
    @AuraEnabled
    public Id usageId;
    /** True when the surgeon already had a usage at that hospital for that portfolio, so none was added. */
    @AuraEnabled
    public Boolean existing = false;
  }

  /** Each product line: the company field and the cases-per-year field on Usage__c. */
  private static final Map<String, List<String>> FIELDS = new Map<String, List<String>>{
    'stems' => new List<String>{ 'CompanyHipStems__c', 'CasesPAHipStem__c' },
    'cups' => new List<String>{ 'CompanyHipCups__c', 'CasesPAHipCup__c' },
    'knee' => new List<String>{ 'CompanyTotalKnee__c', 'CasesPATotalKnee__c' },
    'anatomical' => new List<String>{
      'CompanyAnatomical__c',
      'CasesPAAnatomical__c'
    },
    'reverse' => new List<String>{ 'CompanyReverse__c', 'CasesPAReverse__c' },
    'cmft' => new List<String>{ 'Company_CMFT__c', 'Cases_PA_CMFT__c' }
  };

  /** The portfolios, in the order they are offered, and the last word of their record type's name. */
  private static final List<String> PORTFOLIOS = new List<String>{
    'Hip',
    'Knee',
    'Shoulder',
    'CMF'
  };
  private static final Map<String, String> SUFFIX = new Map<String, String>{
    'Hip' => 'HIP',
    'Knee' => 'KNEE',
    'Shoulder' => 'SHOULDERS',
    'CMF' => 'CMFT'
  };
  private static final Map<String, List<String>> KEYS = new Map<String, List<String>>{
    'Hip' => new List<String>{ 'stems', 'cups' },
    'Knee' => new List<String>{ 'knee' },
    'Shoulder' => new List<String>{ 'anatomical', 'reverse' },
    'CMF' => new List<String>{ 'cmft' }
  };

  /** Lets a test pretend to be a person from another country; empty in real use. */
  @TestVisible
  private static String testCountry;

  /** The product lines one portfolio holds (hip: stems and cups), in order. */
  public static List<String> keysFor(String portfolio) {
    return KEYS.containsKey(portfolio)
      ? KEYS.get(portfolio)
      : new List<String>();
  }

  /** The portfolio a record type belongs to ("ANZ HIP" is Hip), or null when its name does not say. */
  public static String portfolioOf(String recordTypeName) {
    if (String.isBlank(recordTypeName)) {
      return null;
    }
    for (String p : PORTFOLIOS) {
      if (recordTypeName.endsWith(' ' + SUFFIX.get(p))) {
        return p;
      }
    }
    return null;
  }

  /** The person's two-letter country code from their user record (AU, NZ, SG ...). */
  private static String countryCode() {
    if (testCountry != null) {
      return testCountry;
    }
    List<User> me = [
      SELECT CountryCode
      FROM User
      WHERE Id = :UserInfo.getUserId()
    ];
    return me.isEmpty() ? null : me[0].CountryCode;
  }

  /** The record type name for a portfolio in a country: AU and NZ share ANZ, every other country uses its own code. */
  @TestVisible
  private static String recordTypeName(String portfolio, String country) {
    if (String.isBlank(country) || !SUFFIX.containsKey(portfolio)) {
      return null;
    }
    String prefix = (country == 'AU' || country == 'NZ') ? 'ANZ' : country;
    return prefix + ' ' + SUFFIX.get(portfolio);
  }

  /** The record type this person may use for a portfolio in their country, or null when there is none. */
  private static Schema.RecordTypeInfo recordTypeFor(String portfolio) {
    String name = recordTypeName(portfolio, countryCode());
    if (name == null) {
      return null;
    }
    Schema.RecordTypeInfo info = Usage__c.SObjectType.getDescribe()
      .getRecordTypeInfosByName()
      .get(name);
    return info != null && info.isActive() && info.isAvailable() ? info : null;
  }

  /** The record type this person may use for a portfolio in their country, or null when there is none (for PipelineBookingsController). */
  public static Schema.RecordTypeInfo recordTypeForPortfolio(String portfolio) {
    return recordTypeFor(portfolio);
  }

  /** The portfolios this person may add a usage for (their country's record types that their profile allows). */
  public static List<AddOption> addOptions() {
    List<AddOption> out = new List<AddOption>();
    for (String p : PORTFOLIOS) {
      Schema.RecordTypeInfo info = recordTypeFor(p);
      if (info != null) {
        AddOption o = new AddOption();
        o.portfolio = p;
        o.recordType = info.getName();
        o.recordTypeId = info.getRecordTypeId();
        out.add(o);
      }
    }
    return out;
  }

  private static void apply(Usage__c u, List<LineIn> lines) {
    for (LineIn l : lines) {
      List<String> f = l.key == null ? null : FIELDS.get(l.key);
      if (f == null) {
        throw fail('That product line is not known.');
      }
      u.put(f[0], String.isBlank(l.company) ? null : l.company);
      u.put(f[1], l.cases);
    }
  }

  private static List<LineIn> parse(String linesJson) {
    try {
      return (List<LineIn>) JSON.deserialize(linesJson, List<LineIn>.class);
    } catch (Exception e) {
      throw fail('The usage lines could not be read.');
    }
  }

  /** An error whose message reaches the screen (Salesforce otherwise shows "Script-thrown exception"). */
  private static AuraHandledException fail(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }

  /** Saves the changed lines of one usage record. */
  @AuraEnabled
  public static void saveUsage(Id usageId, String linesJson) {
    List<LineIn> lines = parse(linesJson);
    try {
      Usage__c u = [
        SELECT Id
        FROM Usage__c
        WHERE Id = :usageId
        WITH USER_MODE
      ];
      apply(u, lines);
      update as user u;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw fail(e.getMessage());
    }
  }

  /** Deletes one usage record (one surgeon, hospital and portfolio), clearing its lines first so the surgeon's ratings recalculate. */
  @AuraEnabled
  public static void deleteUsage(Id usageId) {
    try {
      Usage__c u = [
        SELECT Id
        FROM Usage__c
        WHERE Id = :usageId
        WITH USER_MODE
      ];
      // The roll-ups that keep the surgeon's ratings up to date recalculate when a usage is created or edited, not when one is
      // deleted. So the lines are cleared first (an edit, which recalculates), and the now-empty record is then deleted.
      // If the clearing is refused (no edit access), the record is still deleted.
      for (List<String> f : FIELDS.values()) {
        u.put(f[0], null);
        u.put(f[1], 0);
      }
      Database.update(new List<Usage__c>{ u }, false, AccessLevel.USER_MODE);
      delete as user u;
    } catch (Exception e) {
      throw fail(e.getMessage());
    }
  }

  /** True when any product line of the usage holds this company. */
  private static Boolean holdsCompany(Usage__c u, String company) {
    for (List<String> f : FIELDS.values()) {
      if ((String) u.get(f[0]) == company) {
        return true;
      }
    }
    return false;
  }

  /**
   * Adds a usage for the deal's surgeon at a hospital for a portfolio, with the record type chosen from the person's
   * country. If the surgeon already has one for that hospital, portfolio and company, nothing is added and the existing one is
   * returned, so it can be edited instead.
   */
  @AuraEnabled
  public static Result addUsage(
    Id dealId,
    Id hospitalId,
    String portfolio,
    String linesJson
  ) {
    List<LineIn> lines = parse(linesJson);
    Result out = new Result();
    if (hospitalId == null) {
      throw fail('Choose the hospital first.');
    }
    Schema.RecordTypeInfo info = recordTypeFor(portfolio);
    if (info == null) {
      throw fail(
        'A usage cannot be added for this portfolio with your country\'s record types.'
      );
    }
    try {
      List<SalesRisks__c> deal = [
        SELECT Account__c
        FROM SalesRisks__c
        WHERE Id = :dealId
        WITH USER_MODE
        LIMIT 1
      ];
      Id surgeon = deal.isEmpty() ? null : deal[0].Account__c;
      if (surgeon == null) {
        throw fail(
          'This deal has no Primary HCP, so there is no surgeon to add a usage for.'
        );
      }
      // The company of the new usage is the first company the person chose; with none chosen, any usage there counts.
      String company;
      for (LineIn l : lines) {
        if (company == null && !String.isBlank(l.company)) {
          company = l.company;
        }
      }
      List<Usage__c> found = [
        SELECT
          Id,
          CompanyHipStems__c,
          CompanyHipCups__c,
          CompanyTotalKnee__c,
          CompanyAnatomical__c,
          CompanyReverse__c,
          Company_CMFT__c
        FROM Usage__c
        WHERE
          HCP2__c = :surgeon
          AND Healthcare_Facility__c = :hospitalId
          AND RecordTypeId = :info.getRecordTypeId()
        WITH USER_MODE
        ORDER BY LastModifiedDate DESC
        LIMIT 50
      ];
      for (Usage__c f : found) {
        if (company == null || holdsCompany(f, company)) {
          out.usageId = f.Id;
          out.existing = true;
          return out;
        }
      }
      Usage__c u = new Usage__c(
        HCP2__c = surgeon,
        Healthcare_Facility__c = hospitalId,
        RecordTypeId = info.getRecordTypeId()
      );
      apply(u, lines);
      insert as user u;
      out.usageId = u.Id;
      return out;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw fail(e.getMessage());
    }
  }
}

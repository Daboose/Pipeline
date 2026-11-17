/**
 * Pipeline: saves and adds a surgeon's usage as a WHOLE usage, with every field of its portfolio's layout, for the usage tiles of the
 * Usage card on an Account record page (companies, products, hip stem type, bearing type, CMFT segment, procedure types, supporting
 * technologies and the cases per year). The older PipelineUsageController saves only a company and cases per product line and is left
 * as it is; this class is the one the usage tiles call.
 *
 * Who calls it: the pipelineUsageCard component and PipelineUsageEditControllerTest. What it touches: Usage__c (update, insert) in the
 * signed-in person's own access (user mode), so object and field permissions and sharing apply as on the standard page. Deleting a
 * usage is done by PipelineUsageController.deleteUsage (not changed).
 *
 * Rules (Robert, 2026-11-17, from PROD's ANZ usage layouts, used for every country):
 *  - Hip: the STEM is mandatory (company, product, stem type, cases per year) and drives the cases; the cup (company and product) is
 *    optional and has no cases of its own, so a usage can never be a cup alone; the bearing type, procedure types and supporting
 *    technologies are optional.
 *  - Knee: company, product and cases per year are mandatory; procedure types and supporting technologies optional.
 *  - Shoulder: anatomical and reverse (company, product, cases per year each) are all optional; procedure types and supporting
 *    technologies optional.
 *  - CMFT: segment, company, product and cases per year are mandatory; no procedure types or supporting technologies.
 *  - One usage per surgeon, hospital, portfolio AND company (the stem company for a hip, the knee company, the anatomical or reverse
 *    company for a shoulder, the CMFT company): adding one that exists adds nothing and returns the existing one to edit.
 * The record type of a new usage is chosen from the person's country and the portfolio (PipelineUsageController), never typed in.
 */
public with sharing class PipelineUsageEditController {
  private static final Map<String, List<String>> LAYOUT = new Map<String, List<String>>{
    'Hip' => new List<String>{
      'CompanyHipStems__c',
      'ProductHipStems__c',
      'Hip_Stem_Type__c',
      'CasesPAHipStem__c',
      'CompanyHipCups__c',
      'ProductHipCups__c',
      'HipBearingType__c',
      'Procedure_Types__c',
      'Supporting_Technologies__c'
    },
    'Knee' => new List<String>{
      'CompanyTotalKnee__c',
      'ProductTotalKnee__c',
      'CasesPATotalKnee__c',
      'Procedure_Types__c',
      'Supporting_Technologies__c'
    },
    'Shoulder' => new List<String>{
      'CompanyAnatomical__c',
      'ProductAnatomical__c',
      'CasesPAAnatomical__c',
      'CompanyReverse__c',
      'ProductReverse__c',
      'CasesPAReverse__c',
      'Procedure_Types__c',
      'Supporting_Technologies__c'
    },
    'CMF' => new List<String>{
      'SegmentCMFT__c',
      'Company_CMFT__c',
      'Product_CMFT__c',
      'Cases_PA_CMFT__c'
    }
  };

  private static final Map<String, List<String>> REQUIRED = new Map<String, List<String>>{
    'Hip' => new List<String>{
      'CompanyHipStems__c',
      'ProductHipStems__c',
      'Hip_Stem_Type__c',
      'CasesPAHipStem__c'
    },
    'Knee' => new List<String>{
      'CompanyTotalKnee__c',
      'ProductTotalKnee__c',
      'CasesPATotalKnee__c'
    },
    'Shoulder' => new List<String>(),
    'CMF' => new List<String>{
      'SegmentCMFT__c',
      'Company_CMFT__c',
      'Product_CMFT__c',
      'Cases_PA_CMFT__c'
    }
  };

  /** The company that identifies a usage, in order: the first that is filled (hip stem, knee, anatomical then reverse, CMFT). */
  private static final Map<String, List<String>> COMPANY = new Map<String, List<String>>{
    'Hip' => new List<String>{ 'CompanyHipStems__c' },
    'Knee' => new List<String>{ 'CompanyTotalKnee__c' },
    'Shoulder' => new List<String>{
      'CompanyAnatomical__c',
      'CompanyReverse__c'
    },
    'CMF' => new List<String>{ 'Company_CMFT__c' }
  };

  private static AuraHandledException fail(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }

  /** Reads the screen's { field: value } text; a multi-choice field arrives as a list. Throws a readable error when it cannot. */
  private static Map<String, Object> parse(String fieldsJson) {
    try {
      Object o = JSON.deserializeUntyped(fieldsJson);
      return (Map<String, Object>) o;
    } catch (Exception e) {
      throw fail('The usage could not be read.');
    }
  }

  /** Puts the screen's values on the usage, only for fields of this portfolio's layout. */
  private static void apply(
    Usage__c u,
    String portfolio,
    Map<String, Object> values
  ) {
    Set<String> allowed = new Set<String>(LAYOUT.get(portfolio));
    Map<String, Schema.SObjectField> fields = Schema.SObjectType.Usage__c.fields.getMap();
    for (String f : values.keySet()) {
      if (!allowed.contains(f)) {
        throw fail('That field is not part of a ' + portfolio + ' usage.');
      }
      Object v = values.get(f);
      Schema.DisplayType t = fields.get(f).getDescribe().getType();
      if (v == null || (v instanceof String && String.isBlank((String) v))) {
        u.put(f, null);
      } else if (
        t == Schema.DisplayType.DOUBLE ||
        t == Schema.DisplayType.INTEGER
      ) {
        Decimal n = Decimal.valueOf(String.valueOf(v));
        if (n < 0) {
          throw fail('Cases per year cannot be negative.');
        }
        u.put(f, n);
      } else if (t == Schema.DisplayType.MULTIPICKLIST) {
        List<String> parts = new List<String>();
        if (v instanceof List<Object>) {
          for (Object x : (List<Object>) v) {
            parts.add(String.valueOf(x));
          }
        } else {
          parts.add(String.valueOf(v));
        }
        u.put(f, parts.isEmpty() ? null : String.join(parts, ';'));
      } else {
        u.put(f, String.valueOf(v));
      }
    }
  }

  /** The label of the first mandatory field of the usage that is empty, or null when all are filled. */
  private static String missing(Usage__c u, String portfolio) {
    Map<String, Schema.SObjectField> fields = Schema.SObjectType.Usage__c.fields.getMap();
    for (String f : REQUIRED.get(portfolio)) {
      Object v = u.get(f);
      if (v == null || (v instanceof String && String.isBlank((String) v))) {
        return fields.get(f).getDescribe().getLabel();
      }
    }
    return null;
  }

  private static String companyOf(Usage__c u, String portfolio) {
    for (String f : COMPANY.get(portfolio)) {
      String c = (String) u.get(f);
      if (!String.isBlank(c)) {
        return c;
      }
    }
    return null;
  }

  private static String fieldList() {
    Set<String> all = new Set<String>{ 'Id', 'RecordType.Name' };
    for (List<String> l : LAYOUT.values()) {
      all.addAll(l);
    }
    return String.join(new List<String>(all), ', ');
  }

  /** Saves one whole usage: the values of its layout fields. A mandatory field left empty is refused and nothing is saved. */
  @AuraEnabled
  public static void save(Id usageId, String fieldsJson) {
    Map<String, Object> values = parse(fieldsJson);
    try {
      List<Usage__c> found = (List<Usage__c>) Database.query(
        'SELECT ' +
          fieldList() +
          ' FROM Usage__c WHERE Id = :usageId WITH USER_MODE'
      );
      if (found.isEmpty()) {
        throw fail('That usage could not be found.');
      }
      Usage__c u = found[0];
      String portfolio = PipelineUsageController.portfolioOf(
        u.RecordType?.Name
      );
      if (portfolio == null) {
        throw fail('This kind of usage cannot be changed here.');
      }
      apply(u, portfolio, values);
      String gap = missing(u, portfolio);
      if (gap != null) {
        throw fail(gap + ' is needed.');
      }
      update as user u;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw fail(e.getMessage());
    }
  }

  /**
   * Adds a usage for a surgeon at a hospital for a portfolio. If the surgeon already has one for that hospital, portfolio and
   * company, nothing is added and the existing one is returned (existing = true) so it can be edited instead.
   */
  @AuraEnabled
  public static PipelineUsageController.Result add(
    Id surgeonId,
    Id hospitalId,
    String portfolio,
    String fieldsJson
  ) {
    Map<String, Object> values = parse(fieldsJson);
    if (hospitalId == null) {
      throw fail('Choose the hospital first.');
    }
    if (!LAYOUT.containsKey(portfolio)) {
      throw fail('That portfolio is not known.');
    }
    Schema.RecordTypeInfo info = PipelineUsageController.recordTypeForPortfolio(
      portfolio
    );
    if (info == null) {
      throw fail(
        'A usage cannot be added for this portfolio with your country\'s record types.'
      );
    }
    PipelineUsageController.Result out = new PipelineUsageController.Result();
    try {
      List<Account> surgeon = [
        SELECT Id
        FROM Account
        WHERE Id = :surgeonId AND IsPersonAccount = TRUE
        WITH USER_MODE
        LIMIT 1
      ];
      if (surgeon.isEmpty()) {
        throw fail(
          'This account is not a surgeon, so a usage cannot be added.'
        );
      }
      Id rtId = info.getRecordTypeId();
      Usage__c u = new Usage__c(
        HCP2__c = surgeonId,
        Healthcare_Facility__c = hospitalId,
        RecordTypeId = rtId
      );
      apply(u, portfolio, values);
      String gap = missing(u, portfolio);
      if (gap != null) {
        throw fail(gap + ' is needed.');
      }
      String company = companyOf(u, portfolio);
      for (
        Usage__c f : (List<Usage__c>) Database.query(
          'SELECT ' +
            fieldList() +
            ' FROM Usage__c WHERE HCP2__c = :surgeonId AND Healthcare_Facility__c = :hospitalId ' +
            'AND RecordTypeId = :rtId WITH USER_MODE ORDER BY LastModifiedDate DESC LIMIT 50'
        )
      ) {
        if (company == null || companyOf(f, portfolio) == company) {
          out.usageId = f.Id;
          out.existing = true;
          return out;
        }
      }
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

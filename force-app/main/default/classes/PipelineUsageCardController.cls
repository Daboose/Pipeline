/**
 * Pipeline: what the Usage card on an Account record page shows and changes. One component, two behaviours chosen by the
 * account it sits on: a PERSON account (the surgeon) shows the four usage ratings, the surgeon's usages (add, edit, delete)
 * and, for information only, the surgeon's MyCase bookings of the last 12 months by type; a BUSINESS account (a hospital)
 * shows, for each surgeon who uses or operates there, the cases by type, from MyCase bookings and from the usage records
 * (the usage records split Zimmer Biomet "ZB" from every other company). No ratings and no editing on a hospital.
 *
 * Who calls it: the pipelineUsageCard component and PipelineUsageCardControllerTest. Saving a line and deleting a whole usage
 * are done by PipelineUsageController (saveUsage, deleteUsage), called directly and not changed.
 * What it touches: reads Account (name, person or business, the four ratings), Usage__c, Case__c, myCase_Usage__c and
 * myCase_Usage_Item__c; changes Usage__c only (deleteLine, addUsageFor). Everything is in the signed-in person's own
 * access (user mode), so object and field permissions and sharing apply exactly as on the standard pages.
 *
 * MyCase gate (Robert, 2026-11-05): a person who cannot read the MyCase objects (New Zealand, for one) gets no MyCase data and no
 * error: canMyCase is false, the MyCase objects are never queried, and the screen leaves MyCase out. Decided by the person's
 * own object access, not by country.
 *
 * Rules kept from Pipeline's bookings: a surgery counts when it has already happened and has at least one usage item; Procedure
 * Z02 (demo, non-billable) is left out; Type A01 is a revision (never for CMFT); the type comes from Case__c.Surgery_Type__c
 * (201 Hip, 202 Knee, 205 Shoulder, 209 CMFT). The window is the last 12 months, today not included.
 *
 * Usage records on the hospital view: a usage line counts for the company named on the line; the cases of every product line
 * of a portfolio are added together (a hip's stems and cups both count), as in the mockup Robert reviewed (to confirm).
 */
public with sharing class PipelineUsageCardController {
  /** One area's rating (PLATINUM, GOLD, SILVER or BRONZE), stored on the surgeon's account. */
  public class Rating {
    @AuraEnabled
    public String area;
    @AuraEnabled
    public String rating;
  }

  /** One line of a surgeon's usages: hospital, portfolio, product line, company and cases per year, and what editing needs. */
  public class Line {
    @AuraEnabled
    public Id usageId;
    @AuraEnabled
    public String hospital;
    @AuraEnabled
    public Id hospitalId;
    @AuraEnabled
    public String hospitalCity;
    @AuraEnabled
    public String portfolio;
    @AuraEnabled
    public String label;
    /** The product line: stems, cups, knee, anatomical, reverse or cmft. */
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String company;
    @AuraEnabled
    public Decimal cases;
    @AuraEnabled
    public String recordType;
    @AuraEnabled
    public Id recordTypeId;
    /** True for a product line of the portfolio that has no data yet (shown only while editing, so it can be filled in). */
    @AuraEnabled
    public Boolean empty = false;
  }

  /** The surgeon's MyCase bookings of one type of surgery. */
  public class BookingRow {
    @AuraEnabled
    public String type;
    @AuraEnabled
    public Integer primary = 0;
    @AuraEnabled
    public Integer revision = 0;
    @AuraEnabled
    public Date latest;
  }

  /** One surgeon on a hospital's account: cases by type [Hip, Knee, Shoulder, CMFT] from MyCase, and from usage records for ZB and for every other company. */
  public class SurgeonRow {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public List<Integer> mycase = new List<Integer>{ 0, 0, 0, 0 };
    @AuraEnabled
    public List<Integer> zb = new List<Integer>{ 0, 0, 0, 0 };
    @AuraEnabled
    public List<Integer> other = new List<Integer>{ 0, 0, 0, 0 };
  }

  public class Card {
    @AuraEnabled
    public Id accountId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Boolean isPerson = false;
    /** False when the person cannot read the MyCase objects: the screen then shows nothing about MyCase. */
    @AuraEnabled
    public Boolean canMyCase = false;
    @AuraEnabled
    public List<Rating> ratings = new List<Rating>();
    /** The most recent change to any of the surgeon's usages. */
    @AuraEnabled
    public Datetime newest;
    @AuraEnabled
    public List<Line> lines = new List<Line>();
    @AuraEnabled
    public Boolean canEdit = false;
    @AuraEnabled
    public Boolean canCreate = false;
    @AuraEnabled
    public Boolean canDelete = false;
    @AuraEnabled
    public List<PipelineUsageController.AddOption> addable = new List<PipelineUsageController.AddOption>();
    @AuraEnabled
    public List<BookingRow> bookings = new List<BookingRow>();
    @AuraEnabled
    public List<SurgeonRow> surgeons = new List<SurgeonRow>();
  }

  /** Each product line: portfolio, label, key, company field, cases field. In the order they are shown. */
  private static final List<List<String>> DEFS = new List<List<String>>{
    new List<String>{
      'Hip',
      'Stems',
      'stems',
      'CompanyHipStems__c',
      'CasesPAHipStem__c'
    },
    new List<String>{
      'Hip',
      'Cups',
      'cups',
      'CompanyHipCups__c',
      'CasesPAHipCup__c'
    },
    new List<String>{
      'Knee',
      'Knee',
      'knee',
      'CompanyTotalKnee__c',
      'CasesPATotalKnee__c'
    },
    new List<String>{
      'Shoulder',
      'Anatomical',
      'anatomical',
      'CompanyAnatomical__c',
      'CasesPAAnatomical__c'
    },
    new List<String>{
      'Shoulder',
      'Reverse',
      'reverse',
      'CompanyReverse__c',
      'CasesPAReverse__c'
    },
    new List<String>{
      'CMF',
      'CMFT',
      'cmft',
      'Company_CMFT__c',
      'Cases_PA_CMFT__c'
    }
  };
  /** Place of a portfolio in the four-column lists of the hospital view: Hip, Knee, Shoulder, CMFT. */
  private static final Map<String, Integer> COLUMN = new Map<String, Integer>{
    'Hip' => 0,
    'Knee' => 1,
    'Shoulder' => 2,
    'CMF' => 3
  };
  /** Case__c.Surgery_Type__c to its column and its name. */
  private static final Map<String, Integer> TYPE_COLUMN = new Map<String, Integer>{
    '201' => 0,
    '202' => 1,
    '205' => 2,
    '209' => 3
  };
  private static final List<String> TYPE_NAME = new List<String>{
    'Hip',
    'Knee',
    'Shoulder',
    'CMFT'
  };
  private static final Set<String> SURGERY_TYPES = TYPE_COLUMN.keySet();

  /** Lets a test pretend to be a person who cannot read the MyCase objects; empty in real use. */
  @TestVisible
  private static Boolean testNoMyCase = false;

  /** The Usage__c fields every query here needs. */
  private static final String USAGE_FIELDS =
    'Id, LastModifiedDate, RecordTypeId, RecordType.Name, Healthcare_Facility__c, Healthcare_Facility__r.Name, ' +
    'HCP2__c, HCP2__r.Name, CompanyHipStems__c, CasesPAHipStem__c, CompanyHipCups__c, CasesPAHipCup__c, ' +
    'CompanyTotalKnee__c, CasesPATotalKnee__c, CompanyAnatomical__c, CasesPAAnatomical__c, CompanyReverse__c, ' +
    'CasesPAReverse__c, Company_CMFT__c, Cases_PA_CMFT__c';

  /** An error whose message reaches the screen (Salesforce otherwise shows "Script-thrown exception"). */
  private static AuraHandledException fail(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }

  /** True when the signed-in person may read all three MyCase objects. */
  @TestVisible
  private static Boolean myCaseAllowed() {
    if (testNoMyCase) {
      return false;
    }
    return Case__c.SObjectType.getDescribe().isAccessible() &&
      myCase_Usage__c.SObjectType.getDescribe().isAccessible() &&
      myCase_Usage_Item__c.SObjectType.getDescribe().isAccessible();
  }

  @AuraEnabled
  public static Card getCard(Id accountId) {
    Card c = new Card();
    c.accountId = accountId;
    Account a = [
      SELECT
        Name,
        IsPersonAccount,
        HCPUsageHipRating__c,
        HCPUsageKneeRating__c,
        HCPUsageShoulderRating__c,
        HCPUsageCMFRating__c
      FROM Account
      WHERE Id = :accountId
      WITH USER_MODE
    ];
    c.name = a.Name;
    c.isPerson = a.IsPersonAccount;
    c.canMyCase = myCaseAllowed();
    if (c.isPerson) {
      loadSurgeon(c, a);
    } else {
      loadHospital(c);
    }
    return c;
  }

  /* ---------------------------------------------------------------- the surgeon (person account) */

  private static void loadSurgeon(Card c, Account a) {
    c.ratings = new List<Rating>{
      rating('Hip', a.HCPUsageHipRating__c),
      rating('Knee', a.HCPUsageKneeRating__c),
      rating('Shoulder', a.HCPUsageShoulderRating__c),
      rating('CMF', a.HCPUsageCMFRating__c)
    };
    Id surgeon = c.accountId;
    for (
      Usage__c u : (List<Usage__c>) Database.query(
        'SELECT ' +
          USAGE_FIELDS +
          ' FROM Usage__c WHERE HCP2__c = :surgeon ' +
          'WITH USER_MODE ORDER BY Healthcare_Facility__r.Name NULLS LAST, Id LIMIT 200'
      )
    ) {
      if (c.newest == null || u.LastModifiedDate > c.newest) {
        c.newest = u.LastModifiedDate;
      }
      c.lines.addAll(linesOf(u));
    }
    Schema.DescribeSObjectResult info = Usage__c.SObjectType.getDescribe();
    c.canEdit = info.isUpdateable();
    c.canCreate = info.isCreateable();
    c.canDelete = info.isDeletable();
    c.addable = c.canCreate
      ? PipelineUsageController.addOptions()
      : new List<PipelineUsageController.AddOption>();
    if (c.canMyCase) {
      c.bookings = bookingsOf(surgeon);
    }
  }

  private static Rating rating(String area, String value) {
    Rating r = new Rating();
    r.area = area;
    r.rating = value;
    return r;
  }

  /**
   * The lines of one usage record: those with data and, for a record type that names its portfolio, an empty line for each
   * product line of that portfolio with no data yet (so a hip with only stems can be given cups). A product with no company
   * and no cases (blank or 0) is not a usage.
   */
  @TestVisible
  private static List<Line> linesOf(Usage__c u) {
    List<Line> out = new List<Line>();
    String portfolio = PipelineUsageController.portfolioOf(u.RecordType?.Name);
    Set<String> inPortfolio = portfolio == null
      ? new Set<String>()
      : new Set<String>(PipelineUsageController.keysFor(portfolio));
    for (List<String> d : DEFS) {
      String company = (String) u.get(d[3]);
      Decimal cases = (Decimal) u.get(d[4]);
      Boolean used = !String.isBlank(company) || (cases != null && cases != 0);
      if (!used && !inPortfolio.contains(d[2])) {
        continue;
      }
      Line l = new Line();
      l.usageId = u.Id;
      l.hospital = u.Healthcare_Facility__r?.Name;
      l.hospitalId = u.Healthcare_Facility__c;
      l.portfolio = d[0];
      l.label = d[1];
      l.key = d[2];
      l.company = used ? company : null;
      l.cases = used ? cases : null;
      l.recordType = u.RecordType?.Name;
      l.recordTypeId = u.RecordTypeId;
      l.empty = !used;
      out.add(l);
    }
    return out;
  }

  /** Counted surgeries of the window, by case: [Case__c records that count]. Shared by the surgeon and the hospital view. */
  private static List<Case__c> countedCases(String whoField, Id who) {
    Date today = Date.today();
    Date start = today.addMonths(-12);
    Set<String> types = SURGERY_TYPES;
    List<Case__c> cases = Database.query(
      'SELECT Id, Surgery_Date__c, Surgery_Type__c, Procedure__c, Physician__c, Physician__r.Name ' +
        'FROM Case__c WHERE ' +
        whoField +
        ' = :who AND Surgery_Date__c >= :start AND Surgery_Date__c < :today ' +
        'AND Surgery_Type__c IN :types WITH USER_MODE LIMIT 20000'
    );
    List<Case__c> out = new List<Case__c>();
    if (cases.isEmpty()) {
      return out;
    }
    Set<Id> withItems = new Set<Id>();
    String itemWhere = whoField == 'Physician__c'
      ? 'Usage_Sheet_ID__r.Case__r.Physician__c = :who'
      : 'Usage_Sheet_ID__r.Case__r.Healthcare_Facility__c = :who';
    for (
      AggregateResult ar : Database.query(
        'SELECT Usage_Sheet_ID__r.Case__c c FROM myCase_Usage_Item__c WHERE ' +
          itemWhere +
          ' AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :start AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :today ' +
          'WITH USER_MODE GROUP BY Usage_Sheet_ID__r.Case__c'
      )
    ) {
      withItems.add((Id) ar.get('c'));
    }
    for (Case__c k : cases) {
      if (withItems.contains(k.Id) && k.Procedure__c != 'Z02') {
        out.add(k);
      }
    }
    return out;
  }

  private static Boolean isRevision(Case__c k) {
    return k.Procedure__c == 'A01' && k.Surgery_Type__c != '209';
  }

  /** The surgeon's counted surgeries of the last 12 months by type: primary, revision and the latest booking. */
  private static List<BookingRow> bookingsOf(Id surgeon) {
    List<BookingRow> rows = new List<BookingRow>();
    for (String t : TYPE_NAME) {
      BookingRow r = new BookingRow();
      r.type = t;
      rows.add(r);
    }
    for (Case__c k : countedCases('Physician__c', surgeon)) {
      BookingRow r = rows[TYPE_COLUMN.get(k.Surgery_Type__c)];
      if (isRevision(k)) {
        r.revision++;
      } else {
        r.primary++;
      }
      if (r.latest == null || k.Surgery_Date__c > r.latest) {
        r.latest = k.Surgery_Date__c;
      }
    }
    return rows;
  }

  /* ---------------------------------------------------------------- the hospital (business account) */

  private static void loadHospital(Card c) {
    Id hospital = c.accountId;
    Map<Id, SurgeonRow> byId = new Map<Id, SurgeonRow>();
    for (
      Usage__c u : (List<Usage__c>) Database.query(
        'SELECT ' +
          USAGE_FIELDS +
          ' FROM Usage__c WHERE Healthcare_Facility__c = :hospital AND HCP2__c != null WITH USER_MODE LIMIT 5000'
      )
    ) {
      SurgeonRow s = rowFor(byId, u.HCP2__c, u.HCP2__r?.Name);
      for (List<String> d : DEFS) {
        String company = (String) u.get(d[3]);
        Decimal cases = (Decimal) u.get(d[4]);
        if (String.isBlank(company) && (cases == null || cases == 0)) {
          continue;
        }
        Integer col = COLUMN.get(d[0]);
        Integer n = cases == null ? 0 : cases.intValue();
        if (company == 'ZB') {
          s.zb[col] = s.zb[col] + n;
        } else {
          s.other[col] = s.other[col] + n;
        }
      }
    }
    if (c.canMyCase) {
      for (Case__c k : countedCases('Healthcare_Facility__c', hospital)) {
        if (k.Physician__c == null) {
          continue;
        }
        SurgeonRow s = rowFor(byId, k.Physician__c, k.Physician__r?.Name);
        Integer col = TYPE_COLUMN.get(k.Surgery_Type__c);
        s.mycase[col] = s.mycase[col] + 1;
      }
    }
    c.surgeons = byId.values();
  }

  private static SurgeonRow rowFor(
    Map<Id, SurgeonRow> byId,
    Id surgeon,
    String name
  ) {
    SurgeonRow s = byId.get(surgeon);
    if (s == null) {
      s = new SurgeonRow();
      s.id = surgeon;
      s.name = name;
      byId.put(surgeon, s);
    }
    return s;
  }

  /* ---------------------------------------------------------------- changes (surgeon only) */

  /** The company field and cases field of a product line, or null for a key that is not known. */
  private static List<String> fieldsOf(String key) {
    for (List<String> d : DEFS) {
      if (d[2] == key) {
        return new List<String>{ d[3], d[4] };
      }
    }
    return null;
  }

  /**
   * Takes one product line off a usage (clears its company and sets its cases to 0, an edit, so the surgeon's ratings
   * recalculate), and deletes the usage record when nothing is left on it. The roll-ups behind the ratings do not
   * recalculate on a delete, which is why the line is cleared first.
   */
  @AuraEnabled
  public static void deleteLine(Id usageId, String key) {
    List<String> f = key == null ? null : fieldsOf(key);
    if (f == null) {
      throw fail('That product line is not known.');
    }
    try {
      List<Usage__c> found = (List<Usage__c>) Database.query(
        'SELECT ' +
          USAGE_FIELDS +
          ' FROM Usage__c WHERE Id = :usageId WITH USER_MODE'
      );
      if (found.isEmpty()) {
        throw fail('That usage could not be found.');
      }
      Usage__c u = found[0];
      u.put(f[0], null);
      u.put(f[1], (Decimal) 0);
      update as user u;
      Boolean left = false;
      for (List<String> d : DEFS) {
        Decimal cases = (Decimal) u.get(d[4]);
        if (
          !String.isBlank((String) u.get(d[3])) || (cases != null && cases != 0)
        ) {
          left = true;
        }
      }
      if (!left) {
        delete as user u;
      }
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw fail(e.getMessage());
    }
  }

  /**
   * Adds a usage for a surgeon at a hospital for a portfolio, the record type chosen from the person's country (as
   * PipelineUsageController does for a deal). One usage per surgeon, hospital, portfolio AND company: if one exists, nothing is
   * added and the existing one is returned so it can be edited instead.
   */
  @AuraEnabled
  public static PipelineUsageController.Result addUsageFor(
    Id surgeonId,
    Id hospitalId,
    String portfolio,
    String linesJson
  ) {
    List<PipelineUsageController.LineIn> lines;
    try {
      lines = (List<PipelineUsageController.LineIn>) JSON.deserialize(
        linesJson,
        List<PipelineUsageController.LineIn>.class
      );
    } catch (Exception e) {
      throw fail('The usage lines could not be read.');
    }
    if (hospitalId == null) {
      throw fail('Choose the hospital first.');
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
      String company;
      for (PipelineUsageController.LineIn l : lines) {
        if (company == null && !String.isBlank(l.company)) {
          company = l.company;
        }
      }
      Id rtId = info.getRecordTypeId();
      for (
        Usage__c f : (List<Usage__c>) Database.query(
          'SELECT ' +
            USAGE_FIELDS +
            ' FROM Usage__c WHERE HCP2__c = :surgeonId AND Healthcare_Facility__c = :hospitalId ' +
            'AND RecordTypeId = :rtId WITH USER_MODE ORDER BY LastModifiedDate DESC LIMIT 50'
        )
      ) {
        if (company == null || holdsCompany(f, company)) {
          out.usageId = f.Id;
          out.existing = true;
          return out;
        }
      }
      Usage__c u = new Usage__c(
        HCP2__c = surgeonId,
        Healthcare_Facility__c = hospitalId,
        RecordTypeId = rtId
      );
      for (PipelineUsageController.LineIn l : lines) {
        List<String> f = l.key == null ? null : fieldsOf(l.key);
        if (f == null) {
          throw fail('That product line is not known.');
        }
        u.put(f[0], String.isBlank(l.company) ? null : l.company);
        u.put(f[1], l.cases);
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

  private static Boolean holdsCompany(Usage__c u, String company) {
    for (List<String> d : DEFS) {
      if ((String) u.get(d[3]) == company) {
        return true;
      }
    }
    return false;
  }
}

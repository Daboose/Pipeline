/**
 * Pipeline: everything the Campaign Management screen (the pipelineCampaigns component) reads and saves: the list of Sales
 * Campaigns, one campaign with its members, creating and changing a campaign, switching it on or off, searching for surgeons to
 * add, adding and removing members.
 *
 * Who calls it: the pipelineCampaigns component, and PipelineCampaignControllerTest.
 * What it touches: Sales_Campaign__c, Sales_Campaign_Member__c and Sales_Campaign_Deal__c (read counts only) in the signed-in
 * person's own access (user mode). It reads Account (surgeons) and User (managers) in user mode too. It reads the surgeon's
 * hospitals from Healthcare_Surgeon_Relationship__c and the person's own Pipeline settings in system mode, because those are
 * only used to help choose and to show the person's own theme. It never changes an Account or a deal.
 *
 * Who may be a member: only an Account that is a person account of record type Physician or Emerging Consultant. Staging
 * accounts, demo accounts and clinic contacts are never offered. The surgeon search needs at least two characters, looks in the
 * name and in Preferred_Name__c (the English name), and starts inside the campaign's own countries (the surgeon's mailing
 * country); the person can widen it to every country. A surgeon's country never stops them being added.
 */
public with sharing class PipelineCampaignController {
  /** The record types that may be members (developer names). */
  private static final List<String> MEMBER_TYPES = new List<String>{
    'Physician',
    'Emerging_Consultant'
  };
  private static final Integer MAX_MEMBERS = 2000;

  public class Option {
    @AuraEnabled
    public String value;
    @AuraEnabled
    public String label;
  }

  public class Context {
    @AuraEnabled
    public Id userId;
    @AuraEnabled
    public String userName;
    @AuraEnabled
    public Boolean canManage;
    @AuraEnabled
    public String theme;
    @AuraEnabled
    public String headColour;
    @AuraEnabled
    public List<Option> countries;
    @AuraEnabled
    public List<Option> portfolios;
  }

  public class CampaignRow {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String friendlyName;
    @AuraEnabled
    public List<String> countries;
    @AuraEnabled
    public List<String> portfolios;
    @AuraEnabled
    public Boolean active;
    @AuraEnabled
    public Id managerId;
    @AuraEnabled
    public String managerName;
    @AuraEnabled
    public String startDate;
    @AuraEnabled
    public String endDate;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public Integer memberCount;
    @AuraEnabled
    public Integer dealCount;
  }

  public class MemberRow {
    @AuraEnabled
    public Id memberId;
    @AuraEnabled
    public Id accountId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String preferredName;
    @AuraEnabled
    public String country;
    @AuraEnabled
    public String city;
    @AuraEnabled
    public String type;
    @AuraEnabled
    public String hospitals;
    @AuraEnabled
    public Integer dealCount;
    @AuraEnabled
    public String stages;
    @AuraEnabled
    public String y1Rep; // the surgeon's Y1 Recon Rep (hip and knee): a user, shown as a column at the end
    @AuraEnabled
    public String y6Rep; // the surgeon's Y6 Extremities Rep: a user
    @AuraEnabled
    public List<RatingCell> ratings = new List<RatingCell>(); // one per portfolio the campaign covers
    @AuraEnabled
    public List<MemberDeal> deals = new List<MemberDeal>(); // the surgeon's deals linked to this campaign
  }

  /** A surgeon's usage rating (PLATINUM, GOLD, SILVER, BRONZE or empty) for one of the campaign's portfolios. */
  public class RatingCell {
    @AuraEnabled
    public String portfolio;
    @AuraEnabled
    public String area; // the word the usage ratings use: Hip, Knee, Shoulder, CMF
    @AuraEnabled
    public String rating;
  }

  /** One deal as the members list shows it. */
  public class MemberDeal {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String kind; // opp or risk
    @AuraEnabled
    public String portfolio;
    @AuraEnabled
    public String stage;
    @AuraEnabled
    public Decimal value;
    @AuraEnabled
    public String currencyCode;
    @AuraEnabled
    public String quarter;
    @AuraEnabled
    public String ownerName;
    @AuraEnabled
    public Datetime lastPosted;
    @AuraEnabled
    public Datetime lastStageChange;
    @AuraEnabled
    public Datetime createdDate;
    @AuraEnabled
    public Boolean isClosed;
    @AuraEnabled
    public Boolean onHold;
  }

  public class CampaignDetail {
    @AuraEnabled
    public CampaignRow campaign;
    @AuraEnabled
    public List<MemberRow> members;
    @AuraEnabled
    public Boolean truncated;
  }

  public class SurgeonHit {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String preferredName;
    @AuraEnabled
    public String country;
    @AuraEnabled
    public String city;
    @AuraEnabled
    public String type;
    @AuraEnabled
    public String hospitals;
    @AuraEnabled
    public Boolean alreadyMember;
  }

  public class SurgeonSearch {
    @AuraEnabled
    public List<SurgeonHit> hits;
    @AuraEnabled
    public Integer outside; // matches outside the campaign's countries, not shown (when not widened)
    @AuraEnabled
    public Integer heldBack; // matches that are staging, demo or clinic-contact accounts
    @AuraEnabled
    public String scope; // the countries searched, or ALL
  }

  public class PersonHit {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
  }

  // ---------- context ----------

  @AuraEnabled
  public static Context getContext() {
    Context c = new Context();
    c.userId = UserInfo.getUserId();
    c.userName = UserInfo.getName();
    c.canManage =
      Schema.SObjectType.Sales_Campaign__c.isCreateable() &&
      Schema.SObjectType.Sales_Campaign__c.isUpdateable();
    c.theme = 'dark';
    c.headColour = 'pink';
    // the person's own Pipeline screen settings, for the dark or light theme and the heading colour (read only)
    List<Pipeline_Filter__c> mine = [
      SELECT Settings_Json__c
      FROM Pipeline_Filter__c
      WHERE OwnerId = :UserInfo.getUserId() AND Is_User_Settings__c = TRUE
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    if (!mine.isEmpty() && String.isNotBlank(mine[0].Settings_Json__c)) {
      try {
        Map<String, Object> s = (Map<String, Object>) JSON.deserializeUntyped(
          mine[0].Settings_Json__c
        );
        if (s.get('theme') == 'light') {
          c.theme = 'light';
        }
        if (s.get('headColour') instanceof String) {
          c.headColour = (String) s.get('headColour');
        }
      } catch (Exception e) {
        // unreadable settings: keep the defaults
      }
    }
    c.countries = options(
      Sales_Campaign__c.Countries__c.getDescribe().getPicklistValues()
    );
    c.portfolios = options(
      Sales_Campaign__c.Portfolios__c.getDescribe().getPicklistValues()
    );
    return c;
  }

  private static List<Option> options(List<Schema.PicklistEntry> entries) {
    List<Option> out = new List<Option>();
    for (Schema.PicklistEntry p : entries) {
      if (p.isActive()) {
        Option o = new Option();
        o.value = p.getValue();
        o.label = p.getLabel();
        out.add(o);
      }
    }
    return out;
  }

  // ---------- campaigns ----------

  private static CampaignRow toRow(
    Sales_Campaign__c c,
    Map<Id, Integer> deals
  ) {
    CampaignRow r = new CampaignRow();
    r.id = c.Id;
    r.name = c.Name;
    r.friendlyName = c.Friendly_Name__c;
    r.countries = split(c.Countries__c);
    r.portfolios = split(c.Portfolios__c);
    r.active = c.Active__c;
    r.managerId = c.Campaign_Manager__c;
    r.managerName = c.Campaign_Manager__r == null
      ? null
      : c.Campaign_Manager__r.Name;
    r.startDate = c.Start_Date__c == null
      ? null
      : String.valueOf(c.Start_Date__c);
    r.endDate = c.End_Date__c == null ? null : String.valueOf(c.End_Date__c);
    r.description = c.Description__c;
    r.memberCount = c.Member_Count__c == null
      ? 0
      : Integer.valueOf(c.Member_Count__c);
    r.dealCount = deals.containsKey(c.Id) ? deals.get(c.Id) : 0;
    return r;
  }

  private static List<String> split(String multi) {
    return String.isBlank(multi) ? new List<String>() : multi.split(';');
  }

  private static Map<Id, Integer> dealCounts() {
    Map<Id, Integer> out = new Map<Id, Integer>();
    for (AggregateResult a : [
      SELECT Campaign__c c, COUNT(Id) n
      FROM Sales_Campaign_Deal__c
      GROUP BY Campaign__c
    ]) {
      out.put((Id) a.get('c'), (Integer) a.get('n'));
    }
    return out;
  }

  @AuraEnabled
  public static List<CampaignRow> listCampaigns() {
    Map<Id, Integer> deals = dealCounts();
    List<CampaignRow> out = new List<CampaignRow>();
    for (Sales_Campaign__c c : [
      SELECT
        Name,
        Friendly_Name__c,
        Countries__c,
        Portfolios__c,
        Active__c,
        Campaign_Manager__c,
        Campaign_Manager__r.Name,
        Start_Date__c,
        End_Date__c,
        Description__c,
        Member_Count__c
      FROM Sales_Campaign__c
      WITH USER_MODE
      ORDER BY Active__c DESC, Name
      LIMIT 500
    ]) {
      out.add(toRow(c, deals));
    }
    return out;
  }

  @AuraEnabled
  public static CampaignDetail getCampaign(Id campaignId) {
    List<Sales_Campaign__c> found = [
      SELECT
        Name,
        Friendly_Name__c,
        Countries__c,
        Portfolios__c,
        Active__c,
        Campaign_Manager__c,
        Campaign_Manager__r.Name,
        Start_Date__c,
        End_Date__c,
        Description__c,
        Member_Count__c
      FROM Sales_Campaign__c
      WHERE Id = :campaignId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new AuraHandledException('That campaign cannot be found.');
    }
    CampaignDetail d = new CampaignDetail();
    d.campaign = toRow(found[0], dealCounts());
    d.members = new List<MemberRow>();

    Integer lim = MAX_MEMBERS + 1;
    List<Sales_Campaign_Member__c> ms = [
      SELECT
        Surgeon__c,
        Surgeon__r.Name,
        Surgeon__r.Preferred_Name__c,
        Surgeon__r.PersonMailingCountryCode,
        Surgeon__r.PersonMailingCity,
        Surgeon__r.RecordType.Name
      FROM Sales_Campaign_Member__c
      WHERE Campaign__c = :campaignId AND Surgeon__c != NULL
      WITH USER_MODE
      ORDER BY Surgeon__r.Name
      LIMIT :lim
    ];
    d.truncated = ms.size() > MAX_MEMBERS;
    if (d.truncated) {
      ms.remove(ms.size() - 1);
    }
    Set<Id> surgeonIds = new Set<Id>();
    for (Sales_Campaign_Member__c m : ms) {
      surgeonIds.add(m.Surgeon__c);
    }
    Map<Id, List<String>> hospitals = hospitalsFor(surgeonIds);
    // the stored usage ratings: read without field-level checks (a campaign manager need not hold those fields), sharing still applies
    Map<Id, Account> ratingsOf = new Map<Id, Account>(
      [
        SELECT
          HCPUsageHipRating__c,
          HCPUsageKneeRating__c,
          HCPUsageShoulderRating__c,
          HCPUsageCMFRating__c,
          Y1User__r.Name,
          Y6User__r.Name
        FROM Account
        WHERE Id IN :surgeonIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, Integer> dealCount = new Map<Id, Integer>();
    Map<Id, List<String>> stages = new Map<Id, List<String>>();
    Map<Id, List<MemberDeal>> dealsOf = new Map<Id, List<MemberDeal>>();
    List<Sales_Campaign_Deal__c> links = [
      SELECT
        Deal__c,
        Deal__r.Name,
        Deal__r.Account__c,
        Deal__r.Stage__c,
        Deal__r.AmountPerYear__c,
        Deal__r.CurrencyIsoCode,
        Deal__r.Expected_Closure_Quarter__c,
        Deal__r.Expected_Closing_Year__c,
        Deal__r.Owner.Name,
        Deal__r.Latest_Chatter_Date__c,
        Deal__r.Last_Stage_Change_Date__c,
        Deal__r.CreatedDate,
        Deal__r.IsClosed__c,
        Deal__r.OnHold__c,
        Deal__r.RecordType.DeveloperName,
        Deal__r.Portfolio__c
      FROM Sales_Campaign_Deal__c
      WHERE Campaign__c = :campaignId
      WITH SYSTEM_MODE
      LIMIT 5000
    ];
    for (Sales_Campaign_Deal__c l : links) {
      Id a = l.Deal__r == null ? null : l.Deal__r.Account__c;
      if (a == null) {
        continue;
      }
      dealCount.put(a, (dealCount.containsKey(a) ? dealCount.get(a) : 0) + 1);
      if (!stages.containsKey(a)) {
        stages.put(a, new List<String>());
        dealsOf.put(a, new List<MemberDeal>());
      }
      if (l.Deal__r.Stage__c != null) {
        stages.get(a).add(l.Deal__r.Stage__c);
      }
      dealsOf.get(a).add(memberDeal(l.Deal__r));
    }
    List<String> campaignPortfolios = String.isBlank(found[0].Portfolios__c)
      ? new List<String>()
      : found[0].Portfolios__c.split(';');
    for (Sales_Campaign_Member__c m : ms) {
      MemberRow r = new MemberRow();
      r.memberId = m.Id;
      r.accountId = m.Surgeon__c;
      r.name = m.Surgeon__r.Name;
      r.preferredName = m.Surgeon__r.Preferred_Name__c;
      r.country = m.Surgeon__r.PersonMailingCountryCode;
      r.city = m.Surgeon__r.PersonMailingCity;
      r.type = m.Surgeon__r.RecordType.Name;
      r.hospitals = hospitalText(hospitals.get(m.Surgeon__c));
      r.dealCount = dealCount.containsKey(m.Surgeon__c)
        ? dealCount.get(m.Surgeon__c)
        : 0;
      r.stages = stages.containsKey(m.Surgeon__c)
        ? String.join(stages.get(m.Surgeon__c), ', ')
        : '';
      if (dealsOf.containsKey(m.Surgeon__c)) {
        r.deals = dealsOf.get(m.Surgeon__c);
      }
      if (ratingsOf.containsKey(m.Surgeon__c)) {
        Account ra = ratingsOf.get(m.Surgeon__c);
        r.y1Rep = ra.Y1User__r == null ? null : ra.Y1User__r.Name;
        r.y6Rep = ra.Y6User__r == null ? null : ra.Y6User__r.Name;
      }
      for (String p : campaignPortfolios) {
        RatingCell c = new RatingCell();
        c.portfolio = p.trim();
        c.area = areaOf(c.portfolio);
        c.rating = ratingsOf.containsKey(m.Surgeon__c)
          ? ratingOf(ratingsOf.get(m.Surgeon__c), c.portfolio)
          : null;
        r.ratings.add(c);
      }
      d.members.add(r);
    }
    return d;
  }

  /** The word the usage ratings use for a campaign portfolio. */
  private static String areaOf(String portfolio) {
    return portfolio == 'Extremities'
      ? 'Shoulder'
      : (portfolio == 'CMFT' ? 'CMF' : portfolio);
  }

  /** The surgeon's stored usage rating for a campaign portfolio. */
  private static String ratingOf(Account a, String portfolio) {
    if (portfolio == 'Hip') {
      return a.HCPUsageHipRating__c;
    } else if (portfolio == 'Knee') {
      return a.HCPUsageKneeRating__c;
    } else if (portfolio == 'Extremities') {
      return a.HCPUsageShoulderRating__c;
    } else if (portfolio == 'CMFT') {
      return a.HCPUsageCMFRating__c;
    }
    return null;
  }

  private static MemberDeal memberDeal(SalesRisks__c r) {
    MemberDeal d = new MemberDeal();
    d.id = r.Id;
    d.name = r.Name;
    String rt = r.RecordType == null ||
      r.RecordType.DeveloperName == null
      ? ''
      : r.RecordType.DeveloperName.toUpperCase();
    d.kind = rt.endsWith('RISK') ? 'risk' : 'opp';
    List<String> ports = new List<String>(
      PipelineDealCampaignController.dealPortfolios(
        r.RecordType == null ? null : r.RecordType.DeveloperName,
        r.Portfolio__c
      )
    );
    ports.sort();
    d.portfolio = ports.isEmpty() ? null : ports[0];
    d.stage = r.Stage__c;
    d.value = r.AmountPerYear__c;
    d.currencyCode = r.CurrencyIsoCode;
    d.quarter = String.isBlank(r.Expected_Closure_Quarter__c)
      ? null
      : (String.isBlank(r.Expected_Closing_Year__c)
          ? r.Expected_Closure_Quarter__c
          : r.Expected_Closure_Quarter__c + ' ' + r.Expected_Closing_Year__c);
    d.ownerName = r.Owner == null ? null : r.Owner.Name;
    d.lastPosted = r.Latest_Chatter_Date__c;
    d.lastStageChange = r.Last_Stage_Change_Date__c;
    d.createdDate = r.CreatedDate;
    d.isClosed = r.IsClosed__c;
    d.onHold = r.OnHold__c;
    return d;
  }

  /** The current hospitals of each surgeon, from the Account Relationship records (no end date, neither side inactive). */
  public static Map<Id, List<String>> hospitalsFor(Set<Id> surgeonIds) {
    Map<Id, List<String>> out = new Map<Id, List<String>>();
    if (surgeonIds.isEmpty()) {
      return out;
    }
    for (Healthcare_Surgeon_Relationship__c h : [
      SELECT Surgeon__c, Healthcare_Facility__r.Name
      FROM Healthcare_Surgeon_Relationship__c
      WHERE
        Surgeon__c IN :surgeonIds
        AND Relationship_End_Date__c = NULL
        AND Surgeon_Inactive__c = FALSE
        AND Healthcare_Facility_Inactive__c = FALSE
      WITH SYSTEM_MODE
      ORDER BY Healthcare_Facility__r.Name
      LIMIT 20000
    ]) {
      if (h.Healthcare_Facility__r == null) {
        continue;
      }
      if (!out.containsKey(h.Surgeon__c)) {
        out.put(h.Surgeon__c, new List<String>());
      }
      out.get(h.Surgeon__c).add(h.Healthcare_Facility__r.Name);
    }
    return out;
  }

  /** "A, B and 3 more": at most two hospitals are written out. */
  public static String hospitalText(List<String> names) {
    if (names == null || names.isEmpty()) {
      return '';
    }
    if (names.size() <= 2) {
      return String.join(names, ', ');
    }
    return names[0] + ', ' + names[1] + ' and ' + (names.size() - 2) + ' more';
  }

  @AuraEnabled
  public static Id saveCampaign(String payload) {
    Map<String, Object> p = (Map<String, Object>) JSON.deserializeUntyped(
      payload
    );
    String friendly = p.get('friendlyName') == null
      ? ''
      : String.valueOf(p.get('friendlyName')).trim();
    if (friendly.length() == 0 || friendly.length() > 40) {
      throw new AuraHandledException(
        'The friendly name needs 1 to 40 characters.'
      );
    }
    List<String> countries = strings(p.get('countries'));
    List<String> portfolios = strings(p.get('portfolios'));
    if (countries.isEmpty()) {
      throw new AuraHandledException('Pick at least one country.');
    }
    if (portfolios.isEmpty()) {
      throw new AuraHandledException('Pick at least one portfolio.');
    }
    if (p.get('managerId') == null) {
      throw new AuraHandledException('Choose a campaign manager.');
    }
    Sales_Campaign__c c = new Sales_Campaign__c();
    if (p.get('id') != null && String.isNotBlank(String.valueOf(p.get('id')))) {
      c.Id = (Id) String.valueOf(p.get('id'));
    }
    c.Name = friendly; // the system rewrites it as the friendly name plus the country codes
    c.Friendly_Name__c = friendly;
    c.Countries__c = String.join(countries, ';');
    c.Portfolios__c = String.join(portfolios, ';');
    c.Active__c = p.get('active') == null ? true : (Boolean) p.get('active');
    c.Campaign_Manager__c = (Id) String.valueOf(p.get('managerId'));
    c.Start_Date__c = dateOf(p.get('startDate'));
    c.End_Date__c = dateOf(p.get('endDate'));
    c.Description__c = p.get('description') == null
      ? null
      : String.valueOf(p.get('description'));
    try {
      if (c.Id == null) {
        insert as user c;
      } else {
        update as user c;
      }
    } catch (DmlException e) {
      throw new AuraHandledException(e.getDmlMessage(0));
    }
    return c.Id;
  }

  private static List<String> strings(Object o) {
    List<String> out = new List<String>();
    if (o instanceof List<Object>) {
      for (Object x : (List<Object>) o) {
        if (x != null) {
          out.add(String.valueOf(x));
        }
      }
    }
    return out;
  }

  private static Date dateOf(Object o) {
    return (o == null || String.isBlank(String.valueOf(o)))
      ? null
      : Date.valueOf(String.valueOf(o));
  }

  @AuraEnabled
  public static void setActive(Id campaignId, Boolean active) {
    try {
      update as user new Sales_Campaign__c(Id = campaignId, Active__c = active);
    } catch (DmlException e) {
      throw new AuraHandledException(e.getDmlMessage(0));
    }
  }

  // ---------- finding people ----------

  /** Active people who work for the company (never portal users) whose name matches: the campaign manager picker. */
  @AuraEnabled
  public static List<PersonHit> searchPeople(String term) {
    List<PersonHit> out = new List<PersonHit>();
    String t = term == null ? '' : term.trim();
    if (t.length() < 2) {
      return out;
    }
    String pattern = '%' + String.escapeSingleQuotes(t) + '%';
    for (User u : [
      SELECT Name
      FROM User
      WHERE IsActive = TRUE AND IsPortalEnabled = FALSE AND Name LIKE :pattern
      WITH USER_MODE
      ORDER BY Name
      LIMIT 8
    ]) {
      PersonHit h = new PersonHit();
      h.id = u.Id;
      h.name = u.Name;
      out.add(h);
    }
    return out;
  }

  @AuraEnabled
  public static SurgeonSearch searchSurgeons(
    Id campaignId,
    String term,
    Boolean wide
  ) {
    SurgeonSearch s = new SurgeonSearch();
    s.hits = new List<SurgeonHit>();
    s.outside = 0;
    s.heldBack = 0;
    String t = term == null ? '' : term.trim();
    if (t.length() < 2) {
      return s;
    }
    List<Sales_Campaign__c> cs = [
      SELECT Countries__c
      FROM Sales_Campaign__c
      WHERE Id = :campaignId
      WITH USER_MODE
    ];
    List<String> countries = cs.isEmpty()
      ? new List<String>()
      : split(cs[0].Countries__c);
    Boolean everywhere = wide == true || countries.isEmpty();
    s.scope = everywhere ? 'ALL' : String.join(countries, ', ');
    String pattern = '%' + String.escapeSingleQuotes(t) + '%';

    List<Account> found;
    if (everywhere) {
      found = [
        SELECT
          Name,
          Preferred_Name__c,
          PersonMailingCountryCode,
          PersonMailingCity,
          RecordType.Name
        FROM Account
        WHERE
          IsPersonAccount = TRUE
          AND RecordType.DeveloperName IN :MEMBER_TYPES
          AND (Name LIKE :pattern
          OR Preferred_Name__c LIKE :pattern)
        WITH USER_MODE
        ORDER BY Name
        LIMIT 8
      ];
    } else {
      found = [
        SELECT
          Name,
          Preferred_Name__c,
          PersonMailingCountryCode,
          PersonMailingCity,
          RecordType.Name
        FROM Account
        WHERE
          IsPersonAccount = TRUE
          AND RecordType.DeveloperName IN :MEMBER_TYPES
          AND PersonMailingCountryCode IN :countries
          AND (Name LIKE :pattern
          OR Preferred_Name__c LIKE :pattern)
        WITH USER_MODE
        ORDER BY Name
        LIMIT 8
      ];
      s.outside = [
        SELECT COUNT()
        FROM Account
        WHERE
          IsPersonAccount = TRUE
          AND RecordType.DeveloperName IN :MEMBER_TYPES
          AND PersonMailingCountryCode NOT IN :countries
          AND (Name LIKE :pattern
          OR Preferred_Name__c LIKE :pattern)
        WITH USER_MODE
        LIMIT 50
      ];
    }
    s.heldBack = [
      SELECT COUNT()
      FROM Account
      WHERE
        IsPersonAccount = TRUE
        AND RecordType.DeveloperName NOT IN :MEMBER_TYPES
        AND RecordType.Name LIKE 'Physician%'
        AND (Name LIKE :pattern
        OR Preferred_Name__c LIKE :pattern)
      WITH USER_MODE
      LIMIT 50
    ];
    Set<Id> ids = new Set<Id>();
    for (Account a : found) {
      ids.add(a.Id);
    }
    Map<Id, List<String>> hospitals = hospitalsFor(ids);
    Set<Id> already = new Set<Id>();
    for (Sales_Campaign_Member__c m : [
      SELECT Surgeon__c
      FROM Sales_Campaign_Member__c
      WHERE Campaign__c = :campaignId AND Surgeon__c IN :ids
      WITH USER_MODE
    ]) {
      already.add(m.Surgeon__c);
    }
    for (Account a : found) {
      SurgeonHit h = new SurgeonHit();
      h.id = a.Id;
      h.name = a.Name;
      h.preferredName = a.Preferred_Name__c;
      h.country = a.PersonMailingCountryCode;
      h.city = a.PersonMailingCity;
      h.type = a.RecordType.Name;
      h.hospitals = hospitalText(hospitals.get(a.Id));
      h.alreadyMember = already.contains(a.Id);
      s.hits.add(h);
    }
    return s;
  }

  // ---------- members ----------

  @AuraEnabled
  public static void addMember(Id campaignId, Id surgeonId) {
    try {
      insert as user new Sales_Campaign_Member__c(
        Campaign__c = campaignId,
        Surgeon__c = surgeonId
      );
    } catch (DmlException e) {
      String m = e.getDmlMessage(0);
      throw new AuraHandledException(
        m != null && m.contains('duplicate')
          ? 'That surgeon is already a member of this campaign.'
          : m
      );
    }
  }

  @AuraEnabled
  public static Integer removeMembers(List<Id> memberIds) {
    if (memberIds == null || memberIds.isEmpty()) {
      return 0;
    }
    try {
      delete as user [
        SELECT Id
        FROM Sales_Campaign_Member__c
        WHERE Id IN :memberIds
        WITH USER_MODE
      ];
    } catch (DmlException e) {
      throw new AuraHandledException(e.getDmlMessage(0));
    }
    return memberIds.size();
  }

  /** Deletes a campaign set up in error. Its members and deal links go with it (they belong to it); surgeons and deals are untouched. */
  @AuraEnabled
  public static void deleteCampaign(Id campaignId) {
    if (campaignId == null) {
      return;
    }
    try {
      delete as user [
        SELECT Id
        FROM Sales_Campaign__c
        WHERE Id = :campaignId
        WITH USER_MODE
      ];
    } catch (DmlException e) {
      throw new AuraHandledException(e.getDmlMessage(0));
    }
  }

  // ---------- importing a list of names ----------

  /** One line of the person's list and what it was matched to. status: exact, suggest, many, none or dup. */
  public class ImportRow {
    @AuraEnabled
    public String text;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public Id pickId;
    @AuraEnabled
    public List<SurgeonHit> cands;
  }

  public class ImportResult {
    @AuraEnabled
    public Integer added;
    @AuraEnabled
    public Integer alreadyMembers;
    @AuraEnabled
    public List<String> problems;
  }

  /** Matches each line of a pasted list or file to surgeons. Nothing is saved: the person confirms every row first. */
  @AuraEnabled
  public static List<ImportRow> matchNames(Id campaignId, List<String> lines) {
    return PipelineCampaignImport.match(campaignId, lines);
  }

  /** Adds the confirmed surgeons as members in one go. A surgeon already in the campaign is counted, not an error. */
  @AuraEnabled
  public static ImportResult addMembers(Id campaignId, List<Id> surgeonIds) {
    ImportResult r = new ImportResult();
    r.added = 0;
    r.alreadyMembers = 0;
    r.problems = new List<String>();
    Set<Id> wanted = new Set<Id>(
      surgeonIds == null ? new List<Id>() : surgeonIds
    );
    wanted.remove(null);
    for (Sales_Campaign_Member__c m : [
      SELECT Surgeon__c
      FROM Sales_Campaign_Member__c
      WHERE Campaign__c = :campaignId AND Surgeon__c IN :wanted
      WITH USER_MODE
    ]) {
      if (wanted.remove(m.Surgeon__c)) {
        r.alreadyMembers++;
      }
    }
    List<Sales_Campaign_Member__c> rows = new List<Sales_Campaign_Member__c>();
    for (Id sid : wanted) {
      rows.add(
        new Sales_Campaign_Member__c(Campaign__c = campaignId, Surgeon__c = sid)
      );
    }
    List<Database.SaveResult> saved = Database.insert(
      rows,
      false,
      AccessLevel.USER_MODE
    );
    for (Database.SaveResult sr : saved) {
      if (sr.isSuccess()) {
        r.added++;
      } else if (r.problems.size() < 5) {
        r.problems.add(sr.getErrors()[0].getMessage());
      }
    }
    return r;
  }
}

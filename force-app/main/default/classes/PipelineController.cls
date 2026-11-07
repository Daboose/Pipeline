/**
 * Pipeline: the server side of the Pipeline screen (the pipelineApp Lightning web component).
 *
 * Who calls it: the pipelineApp component and the components inside it.
 * What it touches: reads SalesRisks__c (Opportunities & Risks) in the signed-in person's own access (user mode, so
 * org-wide sharing and field access apply as normal), reads the Teams through PipelineScope, and reads and writes one
 * Pipeline_Filter__c settings record per person (flagged Is_User_Settings__c; their own screen choices as one JSON string). It never changes a deal.
 *
 * The three kinds of deal are kept apart and never added together (Robert, 2026-10-25): opportunities, risks and ROSA.
 * The kind comes from the record type's developer name: ends in RISK is a risk, contains ROSA is ROSA, the rest are
 * implant opportunities (the segment, such as Hip or Knee, is in the record type name too).
 *
 * Link to APAC Event (Robert, 2026-11-06): SalesRisks__c.APAC_Event__c exists only in some orgs and only some people may see
 * it, so it is never named in a way that needs it to exist. canSeeEvent() asks at run time; only when it answers yes is the
 * field read, by name, in the deals query. Everyone else gets deals with no event and no sign that the field exists.
 */
public with sharing class PipelineController {
  private static final Integer MAX_DEALS = 10000;

  /** What the screen needs to know before it asks for deals. */
  public class Context {
    @AuraEnabled
    public Id userId;
    @AuraEnabled
    public String userName;
    @AuraEnabled
    public Boolean isManager;
    @AuraEnabled
    public Boolean hasOwnTeam;
    @AuraEnabled
    public List<PipelineScope.TeamInfo> teams;
    @AuraEnabled
    public String settingsJson;
    @AuraEnabled
    public List<String> stageOrder;
    /** The lists to choose from in the selection panel, read from Salesforce (not from the deals that happen to be loaded). */
    @AuraEnabled
    public List<String> countries;
    @AuraEnabled
    public List<String> stateCodes;
    @AuraEnabled
    public List<String> portfolios;
    @AuraEnabled
    public List<String> brands;
    @AuraEnabled
    public List<String> quarters;
    /** True when this person can see the Link to APAC Event field (and read the events), so the screen offers the Event choice. */
    @AuraEnabled
    public Boolean canEvent;
  }

  /** One deal, flattened for the screen. */
  public class Deal {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String kind;
    @AuraEnabled
    public String segment;
    @AuraEnabled
    public String stage;
    @AuraEnabled
    public Boolean isClosed;
    @AuraEnabled
    public Boolean onHold;
    @AuraEnabled
    public Decimal value;
    @AuraEnabled
    public String currencyCode;
    @AuraEnabled
    public String quarter;
    @AuraEnabled
    public Id ownerId;
    @AuraEnabled
    public String ownerName;
    @AuraEnabled
    public String ownerState;
    @AuraEnabled
    public String ownerCountry;
    @AuraEnabled
    public String hcp;
    @AuraEnabled
    public String facility;
    @AuraEnabled
    public String brands;
    @AuraEnabled
    public Boolean repPriority;
    @AuraEnabled
    public Integer campaignCount; // how many sales campaigns the deal is in (a gold star in the lists, a number on the Campaigns button)
    @AuraEnabled
    public Boolean statePriority;
    @AuraEnabled
    public Datetime lastPosted;
    @AuraEnabled
    public Datetime lastStageChange;
    @AuraEnabled
    public Datetime createdDate;
    @AuraEnabled
    public Date closeDate;
    @AuraEnabled
    public Date installDate;
    @AuraEnabled
    public String rosaDealType;
    /** The APAC event the deal is linked to; blank when none, and always blank for a person who cannot see the field. */
    @AuraEnabled
    public Id eventId;
    @AuraEnabled
    public String eventName;
  }

  /** The deals, and whether there were more than the screen can take. */
  public class DealResult {
    @AuraEnabled
    public List<Deal> deals = new List<Deal>();
    @AuraEnabled
    public Boolean truncated = false;
    /** The team name beside each owner of a deal (managers only; empty for a member). */
    @AuraEnabled
    public Map<Id, String> teamNames = new Map<Id, String>();
  }

  /** What the person has chosen to look at (sent from the screen as JSON). */
  public class Filter {
    public List<String> kinds;
    public List<String> stages; // the stages chosen; open ones are all shown, closed ones only within closedMonths
    public String status; // open, closed or both: used only when no stages are given (older saved filters)
    public Integer closedMonths; // how far back closed deals go; 999 or more means all
    public String teamId;
    public Boolean below;
  }

  @AuraEnabled
  public static Context getContext() {
    Context c = new Context();
    c.userId = UserInfo.getUserId();
    c.userName = UserInfo.getName();
    PipelineScope.Scope s = PipelineScope.resolve(
      c.userId,
      PipelineScope.MINE,
      true
    );
    c.isManager = s.isManager;
    c.hasOwnTeam = s.hasOwnTeam;
    c.teams = s.teams;
    c.stageOrder = new List<String>();
    for (
      Schema.PicklistEntry e : SalesRisks__c.Stage__c.getDescribe()
        .getPicklistValues()
    ) {
      if (e.isActive()) {
        c.stageOrder.add(e.getValue());
      }
    }
    c.countries = activeValues(Team__c.Country__c.getDescribe());
    c.stateCodes = activeValues(Team__c.States__c.getDescribe());
    c.portfolios = activeValues(SalesRisks__c.Portfolio__c.getDescribe());
    Integer rosaAt = c.portfolios.indexOf('ROSA'); // ROSA is a type of deal, not a portfolio to pick
    if (rosaAt >= 0) {
      c.portfolios.remove(rosaAt);
    }
    c.brands = activeValues(SalesRisks__c.Brand__c.getDescribe());
    c.quarters = activeValues(
      SalesRisks__c.Expected_Closure_Quarter__c.getDescribe()
    );
    List<Pipeline_Filter__c> mine = [
      SELECT Settings_Json__c
      FROM Pipeline_Filter__c
      WHERE OwnerId = :c.userId AND Is_User_Settings__c = TRUE
      ORDER BY LastModifiedDate DESC
      LIMIT 1
    ];
    c.settingsJson = mine.isEmpty() ? null : mine[0].Settings_Json__c;
    c.canEvent = canSeeEvent();
    return c;
  }

  /**
   * True when the signed-in person can see the deal's Link to APAC Event field and read the events it points to. The field is
   * found by name at run time (it does not exist in every org), and field and object access are checked for this person,
   * so a person without the permission set simply gets false.
   */
  public static Boolean canSeeEvent() {
    Schema.SObjectField f = Schema.SObjectType.SalesRisks__c.fields.getMap()
      .get('APAC_Event__c');
    if (f == null || !f.getDescribe().isAccessible()) {
      return false;
    }
    List<Schema.SObjectType> targets = f.getDescribe().getReferenceTo();
    return !targets.isEmpty() && targets[0].getDescribe().isAccessible();
  }

  /** The active values of a picklist, in the order Salesforce lists them. */
  private static List<String> activeValues(Schema.DescribeFieldResult d) {
    List<String> out = new List<String>();
    for (Schema.PicklistEntry e : d.getPicklistValues()) {
      if (e.isActive()) {
        out.add(e.getValue());
      }
    }
    return out;
  }

  @AuraEnabled
  public static DealResult getDeals(String filterJson) {
    Filter f = (Filter) JSON.deserialize(filterJson, Filter.class);
    Id me = UserInfo.getUserId();
    PipelineScope.Scope scope = PipelineScope.resolve(me, f.teamId, f.below);
    Set<Id> ownerIds = scope.ownerIds;

    List<String> kindTests = new List<String>();
    Set<String> kinds = new Set<String>(
      f.kinds == null ? new List<String>() : f.kinds
    );
    if (kinds.contains('risk')) {
      kindTests.add('RecordType.DeveloperName LIKE \'%RISK\'');
    }
    if (kinds.contains('rosa')) {
      kindTests.add('RecordType.DeveloperName LIKE \'%ROSA%\'');
    }
    if (kinds.contains('opp')) {
      kindTests.add(
        '((NOT RecordType.DeveloperName LIKE \'%RISK\') AND (NOT RecordType.DeveloperName LIKE \'%ROSA%\'))'
      );
    }
    DealResult out = new DealResult();
    out.teamNames = scope.teamNameByUser;
    if (kindTests.isEmpty()) {
      return out;
    }
    Boolean allClosed = f.closedMonths != null && f.closedMonths >= 999;
    Datetime cutoff = Datetime.now()
      .addMonths(
        -1 * (f.closedMonths == null ? 3 : Math.min(f.closedMonths, 600))
      );
    Set<String> stages = new Set<String>(
      f.stages == null ? new List<String>() : f.stages
    );
    String statusTest;
    if (!stages.isEmpty()) {
      statusTest = allClosed
        ? 'Stage__c IN :stages'
        : '(Stage__c IN :stages AND (IsClosed__c = false OR Last_Stage_Change_Date__c >= :cutoff))';
    } else if (f.status == 'closed') {
      statusTest = allClosed
        ? 'IsClosed__c = true'
        : '(IsClosed__c = true AND Last_Stage_Change_Date__c >= :cutoff)';
    } else if (f.status == 'both') {
      statusTest = allClosed
        ? 'Id != null'
        : '(IsClosed__c = false OR Last_Stage_Change_Date__c >= :cutoff)';
    } else {
      statusTest = 'IsClosed__c = false';
    }
    Boolean withEvent = canSeeEvent();
    String soql =
      'SELECT Id, Name, RecordType.DeveloperName, Stage__c, IsClosed__c, OnHold__c, AmountPerYear__c, ' +
      'ROSAGrowthDollar__c, CurrencyIsoCode, Expected_Closure_Quarter__c, Expected_Closing_Year__c, OwnerId, Owner.Name, Owner_State__c, ' +
      'Owner_Country__c, PrimaryHCPName__c, Healthcare_FacilityName__c, Brand__c, Portfolio__c, ' +
      'Priority__c, State_Priority__c, Latest_Chatter_Date__c, Last_Stage_Change_Date__c, CreatedDate, ' +
      'Close_Date__c, Install_Date__c, ROSA_Deal_Type__c' +
      (withEvent ? ', APAC_Event__c, APAC_Event__r.Name' : '') +
      ' FROM SalesRisks__c ' +
      'WHERE ' +
      (ownerIds == null ? '' : 'OwnerId IN :ownerIds AND ') +
      'RecordType.DeveloperName NOT IN (\'Master\', \'SALE\') AND ' +
      statusTest +
      ' AND (' +
      String.join(kindTests, ' OR ') +
      ') ORDER BY CreatedDate DESC LIMIT ' +
      (MAX_DEALS + 1);
    List<SalesRisks__c> rows = Database.queryWithBinds(
      soql,
      new Map<String, Object>{
        'ownerIds' => ownerIds,
        'cutoff' => cutoff,
        'stages' => stages
      },
      AccessLevel.USER_MODE
    );
    out.truncated = rows.size() > MAX_DEALS;
    for (Integer i = 0; i < rows.size() && i < MAX_DEALS; i++) {
      out.deals.add(toDeal(rows[i], withEvent));
    }
    markCampaignDeals(out.deals);
    return out;
  }

  /**
   * Counts, for each deal, the sales campaigns it is in (Robert, 2026-11-07: a gold star beside the surgeon, and the number on the Campaigns button). One query
   * for the whole list, in the person's own access; a person with no access to campaigns simply sees no stars.
   */
  private static void markCampaignDeals(List<Deal> deals) {
    for (Deal d : deals) {
      d.campaignCount = 0;
    }
    if (
      deals.isEmpty() ||
      !Schema.sObjectType.Sales_Campaign_Deal__c.isAccessible()
    ) {
      return;
    }
    Set<Id> ids = new Set<Id>();
    for (Deal d : deals) {
      ids.add(d.id);
    }
    Map<Id, Integer> counts = new Map<Id, Integer>();
    for (AggregateResult a : [
      SELECT Deal__c, COUNT(Id) n
      FROM Sales_Campaign_Deal__c
      WHERE Deal__c IN :ids
      WITH USER_MODE
      GROUP BY Deal__c
    ]) {
      counts.put((Id) a.get('Deal__c'), (Integer) a.get('n'));
    }
    for (Deal d : deals) {
      d.campaignCount = counts.containsKey(d.id) ? counts.get(d.id) : 0;
    }
  }

  /** Saves the signed-in person's own screen choices (dark or light, columns and so on) as one block of JSON. */
  @AuraEnabled
  public static void saveSettings(String settingsJson) {
    if (settingsJson == null || settingsJson.length() > 30000) {
      throw new AuraHandledException('The settings are too long to save.');
    }
    try {
      JSON.deserializeUntyped(settingsJson);
    } catch (Exception e) {
      throw new AuraHandledException('The settings could not be read.');
    }
    Id me = UserInfo.getUserId();
    List<Pipeline_Filter__c> mine = [
      SELECT Id
      FROM Pipeline_Filter__c
      WHERE OwnerId = :me AND Is_User_Settings__c = TRUE
      ORDER BY LastModifiedDate DESC
      LIMIT 1
    ];
    if (mine.isEmpty()) {
      insert as user new Pipeline_Filter__c(
        Name = 'Pipeline Settings (do not delete)',
        Is_User_Settings__c = true,
        Settings_Json__c = settingsJson
      );
    } else {
      mine[0].Settings_Json__c = settingsJson;
      update as user mine[0];
    }
  }

  private static Deal toDeal(SalesRisks__c r, Boolean withEvent) {
    String rt = r.RecordType.DeveloperName == null
      ? ''
      : r.RecordType.DeveloperName.toUpperCase();
    Deal d = new Deal();
    d.id = r.Id;
    d.name = r.Name;
    d.kind = rt.endsWith('RISK')
      ? 'risk'
      : (rt.contains('ROSA') ? 'rosa' : 'opp');
    d.segment = d.kind == 'risk' ? r.Portfolio__c : segmentOf(rt);
    d.stage = r.Stage__c;
    d.isClosed = r.IsClosed__c;
    d.onHold = r.OnHold__c;
    d.value = d.kind == 'rosa' ? r.ROSAGrowthDollar__c : r.AmountPerYear__c;
    d.currencyCode = r.CurrencyIsoCode;
    d.quarter = closeQuarter(
      r.Expected_Closure_Quarter__c,
      r.Expected_Closing_Year__c
    );
    d.ownerId = r.OwnerId;
    d.ownerName = r.Owner.Name;
    d.ownerState = r.Owner_State__c;
    d.ownerCountry = r.Owner_Country__c;
    d.hcp = r.PrimaryHCPName__c;
    d.facility = r.Healthcare_FacilityName__c;
    d.brands = r.Brand__c;
    d.repPriority = r.Priority__c;
    d.statePriority = r.State_Priority__c;
    d.lastPosted = r.Latest_Chatter_Date__c;
    d.lastStageChange = r.Last_Stage_Change_Date__c;
    d.createdDate = r.CreatedDate;
    d.closeDate = r.Close_Date__c;
    d.installDate = r.Install_Date__c;
    d.rosaDealType = r.ROSA_Deal_Type__c;
    if (withEvent) {
      d.eventId = (Id) r.get('APAC_Event__c');
      SObject event = r.getSObject('APAC_Event__r');
      d.eventName = event == null ? null : (String) event.get('Name');
    }
    return d;
  }

  /** The implant segment named in the record type, such as AUHIP or TH_CMFT. Blank when none is named. */
  /** "Q4 2026" from the quarter and the year; the quarter alone when no year is set; nothing when there is no quarter. */
  @TestVisible
  private static String closeQuarter(String quarter, String closeYear) {
    if (String.isBlank(quarter)) {
      return null;
    }
    return String.isBlank(closeYear) ? quarter : quarter + ' ' + closeYear;
  }

  private static String segmentOf(String rt) {
    if (rt.contains('HIP')) {
      return 'Hip';
    } else if (rt.contains('KNEE')) {
      return 'Knee';
    } else if (rt.contains('EXTREMITIES')) {
      return 'Extremities';
    } else if (rt.contains('CMFT')) {
      return 'CMFT';
    } else if (rt.contains('ZBEDGE')) {
      return 'ZBEdge';
    } else if (rt.contains('SPORTMED')) {
      return 'Sports Medicine';
    } else if (rt.contains('TRAUMA')) {
      return 'Trauma';
    }
    return null;
  }
}

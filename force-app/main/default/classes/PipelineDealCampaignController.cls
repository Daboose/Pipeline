/**
 * Pipeline: the Campaigns control of a deal. It lists the campaigns a deal can be put in, and puts the deal in or takes it out.
 *
 * Who may change the links: only a person who can edit the deal (checked here), and who has access to the link object.
 *
 * Who calls it: the LWC pipelineDealCampaigns (in Pipeline's deal flyout today; later also the record page quick action),
 * and PipelineDealCampaignControllerTest.
 * What it touches: reads the deal (SalesRisks__c, never changed), the campaigns and their members, and creates or deletes
 * Sales_Campaign_Deal__c link rows (the person's own access, so only people with that access can link). Nothing else.
 *
 * A campaign is OFFERED to a deal only when (Robert, 2026-11-06): it is active, it covers the country of the deal's owner, it
 * covers the deal's portfolio, and the deal's Primary HCP (the surgeon) is a member of it. A deal can be in one or many
 * campaigns. A campaign the deal is already in is always shown, so it can be taken out even if it no longer fits.
 */
public with sharing class PipelineDealCampaignController {
  /** One campaign as the control shows it. */
  public class Choice {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String managerName;
    @AuraEnabled
    public String portfolios;
    @AuraEnabled
    public Boolean linked;
    @AuraEnabled
    public String note; // why a campaign that the deal is in no longer fits, or why a campaign is not offered
  }

  /** Everything the control needs for one deal. */
  public class DealCampaigns {
    @AuraEnabled
    public String dealName;
    @AuraEnabled
    public String hcpName;
    @AuraEnabled
    public Boolean hasHcp;
    @AuraEnabled
    public String ownerCountry;
    @AuraEnabled
    public String portfolios;
    @AuraEnabled
    public List<Choice> offered = new List<Choice>();
    @AuraEnabled
    public List<Choice> notOffered = new List<Choice>(); // active campaigns that fit except for the surgeon
  }

  /** The portfolios of a deal: a risk or a ROSA deal carries them in Portfolio__c; an opportunity takes its from its record type. */
  public static Set<String> dealPortfolios(
    String recordTypeDeveloperName,
    String portfolioField
  ) {
    String rt = recordTypeDeveloperName == null
      ? ''
      : recordTypeDeveloperName.toUpperCase();
    Set<String> out = new Set<String>();
    if (rt.endsWith('RISK') || rt.contains('ROSA')) {
      if (String.isNotBlank(portfolioField)) {
        for (String p : portfolioField.split(';')) {
          out.add(p.trim());
        }
      }
    } else if (rt.contains('HIP')) {
      out.add('Hip');
    } else if (rt.contains('KNEE')) {
      out.add('Knee');
    } else if (rt.contains('EXTREMITIES')) {
      out.add('Extremities');
    } else if (rt.contains('CMFT')) {
      out.add('CMFT');
    }
    return out;
  }

  /** The reasons a campaign does not fit a deal; empty when it fits. */
  public static List<String> reasons(
    Sales_Campaign__c c,
    String ownerCountry,
    Set<String> portfolios,
    Boolean surgeonIsMember,
    String hcpName
  ) {
    List<String> out = new List<String>();
    if (c.Active__c != true) {
      out.add('Not active');
    }
    Set<String> countries = String.isBlank(c.Countries__c)
      ? new Set<String>()
      : new Set<String>(c.Countries__c.split(';'));
    if (String.isBlank(ownerCountry) || !countries.contains(ownerCountry)) {
      out.add(
        'Does not cover ' +
        (ownerCountry == null ? 'the owner\'s country' : ownerCountry)
      );
    }
    Boolean overlap = false;
    if (!String.isBlank(c.Portfolios__c)) {
      for (String p : c.Portfolios__c.split(';')) {
        if (portfolios.contains(p.trim())) {
          overlap = true;
        }
      }
    }
    if (!overlap) {
      out.add('Does not cover this portfolio');
    }
    if (!surgeonIsMember) {
      out.add(
        (String.isBlank(hcpName) ? 'The surgeon' : hcpName) + ' is not a member'
      );
    }
    return out;
  }

  private static SalesRisks__c readDeal(Id dealId) {
    List<SalesRisks__c> rows = [
      SELECT
        Name,
        Account__c,
        Account__r.Name,
        RecordType.DeveloperName,
        Portfolio__c,
        Owner_Country__c
      FROM SalesRisks__c
      WHERE Id = :dealId
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('That deal could not be read.');
    }
    return rows[0];
  }

  @AuraEnabled
  public static DealCampaigns getDealCampaigns(Id dealId) {
    SalesRisks__c deal = readDeal(dealId);
    DealCampaigns out = new DealCampaigns();
    out.dealName = deal.Name;
    out.hasHcp = deal.Account__c != null;
    out.hcpName = deal.Account__r == null ? null : deal.Account__r.Name;
    out.ownerCountry = deal.Owner_Country__c;
    Set<String> ports = dealPortfolios(
      deal.RecordType.DeveloperName,
      deal.Portfolio__c
    );
    List<String> sorted = new List<String>(ports);
    sorted.sort();
    out.portfolios = String.join(sorted, ', ');
    if (!out.hasHcp) {
      return out;
    }

    Set<Id> memberOf = new Set<Id>();
    for (Sales_Campaign_Member__c m : [
      SELECT Campaign__c
      FROM Sales_Campaign_Member__c
      WHERE Surgeon__c = :deal.Account__c
      WITH USER_MODE
      LIMIT 2000
    ]) {
      memberOf.add(m.Campaign__c);
    }
    Set<Id> linkedTo = new Set<Id>();
    for (Sales_Campaign_Deal__c l : [
      SELECT Campaign__c
      FROM Sales_Campaign_Deal__c
      WHERE Deal__c = :dealId
      WITH USER_MODE
      LIMIT 200
    ]) {
      linkedTo.add(l.Campaign__c);
    }
    for (Sales_Campaign__c c : [
      SELECT
        Name,
        Active__c,
        Countries__c,
        Portfolios__c,
        Portfolios_Text__c,
        Campaign_Manager__r.Name
      FROM Sales_Campaign__c
      WITH USER_MODE
      ORDER BY Name
      LIMIT 2000
    ]) {
      List<String> why = reasons(
        c,
        out.ownerCountry,
        ports,
        memberOf.contains(c.Id),
        out.hcpName
      );
      Boolean linked = linkedTo.contains(c.Id);
      if (!linked && !why.isEmpty()) {
        // only "active and fits except that the surgeon is not a member" is worth listing; the rest are left out
        if (why.size() == 1 && why[0].endsWith('is not a member')) {
          out.notOffered.add(choice(c, false, why[0]));
        }
        continue;
      }
      out.offered.add(
        choice(c, linked, why.isEmpty() ? null : String.join(why, '; '))
      );
    }
    return out;
  }

  private static Choice choice(
    Sales_Campaign__c c,
    Boolean linked,
    String note
  ) {
    Choice x = new Choice();
    x.id = c.Id;
    x.name = c.Name;
    x.managerName = c.Campaign_Manager__r == null
      ? null
      : c.Campaign_Manager__r.Name;
    x.portfolios = c.Portfolios_Text__c;
    x.linked = linked;
    x.note = note;
    return x;
  }

  /** Puts the deal in a campaign or takes it out. Putting it in is checked again here, so the screen cannot be tricked. */
  @AuraEnabled
  public static void setLink(Id dealId, Id campaignId, Boolean linked) {
    if (dealId == null || campaignId == null) {
      return;
    }
    try {
      // whoever can change the deal can change which campaigns it is in; nobody else
      List<UserRecordAccess> access = [
        SELECT RecordId, HasEditAccess
        FROM UserRecordAccess
        WHERE UserId = :UserInfo.getUserId() AND RecordId = :dealId
      ];
      if (access.isEmpty() || access[0].HasEditAccess != true) {
        throw new AuraHandledException(
          'You cannot change the campaigns of a deal you cannot edit.'
        );
      }
      if (linked == true) {
        SalesRisks__c deal = readDeal(dealId);
        if (deal.Account__c == null) {
          throw new AuraHandledException(
            'This deal has no Primary HCP yet, so it cannot be put in a campaign.'
          );
        }
        Sales_Campaign__c c = [
          SELECT Active__c, Countries__c, Portfolios__c
          FROM Sales_Campaign__c
          WHERE Id = :campaignId
          WITH USER_MODE
          LIMIT 1
        ];
        Boolean member =
          [
            SELECT COUNT()
            FROM Sales_Campaign_Member__c
            WHERE Campaign__c = :campaignId AND Surgeon__c = :deal.Account__c
            WITH USER_MODE
          ] > 0;
        List<String> why = reasons(
          c,
          deal.Owner_Country__c,
          dealPortfolios(deal.RecordType.DeveloperName, deal.Portfolio__c),
          member,
          deal.Account__r == null ? null : deal.Account__r.Name
        );
        if (!why.isEmpty()) {
          throw new AuraHandledException(
            'This deal cannot be put in that campaign: ' +
              String.join(why, '; ') +
              '.'
          );
        }
        if (
          [
            SELECT COUNT()
            FROM Sales_Campaign_Deal__c
            WHERE Campaign__c = :campaignId AND Deal__c = :dealId
            WITH USER_MODE
          ] == 0
        ) {
          insert as user new Sales_Campaign_Deal__c(
            Campaign__c = campaignId,
            Deal__c = dealId
          );
        }
      } else {
        delete as user [
          SELECT Id
          FROM Sales_Campaign_Deal__c
          WHERE Campaign__c = :campaignId AND Deal__c = :dealId
          WITH USER_MODE
        ];
      }
    } catch (DmlException e) {
      throw new AuraHandledException(e.getDmlMessage(0));
    }
  }
}

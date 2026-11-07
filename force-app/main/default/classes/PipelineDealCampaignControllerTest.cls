/**
 * Tests for PipelineDealCampaignController (which campaigns a deal is offered, and putting a deal in or out of a campaign).
 * Uses invented records only. The running user is a copy of the current profile with the Campaign Manager permission set and
 * a country code, because a deal's country is its owner's country.
 */
@IsTest
private class PipelineDealCampaignControllerTest {
  static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  static User manager() {
    User u = new User(
      Alias = 'pdcc',
      Email = 'pdcc@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'DealCampaignTest',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_AU',
      ProfileId = UserInfo.getProfileId(),
      TimeZoneSidKey = 'Australia/Sydney',
      CountryCode = 'SG',
      Username = 'pdcc' +
        String.valueOf(Crypto.getRandomInteger()) +
        '@example.com.test'
    );
    insert u;
    insert new PermissionSetAssignment(
      AssigneeId = u.Id,
      PermissionSetId = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Pipeline_Campaign_Manager'
      ]
      .Id
    );
    // a Pipeline user as well: the list read needs the quarter and year field that Pipeline User gives
    insert new PermissionSetAssignment(
      AssigneeId = u.Id,
      PermissionSetId = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Pipeline_User'
      ]
      .Id
    );
    return u;
  }

  static Account surgeon(String last) {
    Account a = new Account(
      FirstName = 'Test',
      LastName = last,
      PersonMailingCountry = 'Singapore',
      PersonMailingCountryCode = 'SG',
      RecordTypeId = rt(Account.SObjectType, 'Physician')
    );
    Database.DMLOptions opts = new Database.DMLOptions();
    opts.duplicateRuleHeader.allowSave = true;
    Database.insert(a, opts);
    return a;
  }

  static Id campaign(String name, String country, String portfolio) {
    return PipelineCampaignController.saveCampaign(
      JSON.serialize(
        new Map<String, Object>{
          'friendlyName' => name,
          'countries' => new List<String>{ country },
          'portfolios' => new List<String>{ portfolio },
          'active' => true,
          'managerId' => UserInfo.getUserId()
        }
      )
    );
  }

  @IsTest
  static void aDealsPortfoliosComeFromItsRecordTypeOrItsPortfolioField() {
    System.assertEquals(
      new Set<String>{ 'Hip' },
      PipelineDealCampaignController.dealPortfolios('AUHIP', null)
    );
    System.assertEquals(
      new Set<String>{ 'Knee' },
      PipelineDealCampaignController.dealPortfolios('AURISK', 'Knee')
    );
    System.assertEquals(
      new Set<String>{ 'Knee', 'Hip' },
      PipelineDealCampaignController.dealPortfolios('AUROSA', 'Knee;Hip')
    );
    System.assertEquals(
      0,
      PipelineDealCampaignController.dealPortfolios(null, null).size()
    );
  }

  @IsTest
  static void aCampaignFitsOnlyWhenActiveCoveringTheCountryAndPortfolioWithTheSurgeonAMember() {
    Sales_Campaign__c c = new Sales_Campaign__c(
      Active__c = true,
      Countries__c = 'SG;MY',
      Portfolios__c = 'Hip;Knee'
    );
    Set<String> hip = new Set<String>{ 'Hip' };
    System.assertEquals(
      0,
      PipelineDealCampaignController.reasons(c, 'SG', hip, true, 'Dr A').size()
    );
    System.assertEquals(
      1,
      PipelineDealCampaignController.reasons(c, 'AU', hip, true, 'Dr A').size()
    );
    System.assertEquals(
      1,
      PipelineDealCampaignController.reasons(
          c,
          'SG',
          new Set<String>{ 'CMFT' },
          true,
          'Dr A'
        )
        .size()
    );
    List<String> notMember = PipelineDealCampaignController.reasons(
      c,
      'SG',
      hip,
      false,
      'Dr A'
    );
    System.assertEquals('Dr A is not a member', notMember[0]);
    c.Active__c = false;
    System.assertEquals(
      'Not active',
      PipelineDealCampaignController.reasons(c, 'SG', hip, true, 'Dr A')[0]
    );
  }

  @IsTest
  static void aDealIsOfferedTheRightCampaignsAndCanBePutInAndTakenOut() {
    System.runAs(manager()) {
      Account a = surgeon('Offered');
      Account other = surgeon('NotInIt');
      Id fits = campaign('Fits', 'SG', 'Hip');
      Id noSurgeon = campaign('Without surgeon', 'SG', 'Hip');
      Id wrongCountry = campaign('Wrong country', 'AU', 'Hip');
      PipelineCampaignController.addMember(fits, a.Id);
      PipelineCampaignController.addMember(wrongCountry, a.Id);
      PipelineCampaignController.addMember(noSurgeon, other.Id);
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      insert d;

      PipelineDealCampaignController.DealCampaigns dc = PipelineDealCampaignController.getDealCampaigns(
        d.Id
      );
      System.assertEquals(true, dc.hasHcp);
      System.assertEquals('SG', dc.ownerCountry);
      System.assertEquals('Hip', dc.portfolios);
      System.assertEquals(1, dc.offered.size());
      System.assertEquals(fits, dc.offered[0].id);
      System.assertEquals(false, dc.offered[0].linked);
      System.assertEquals(1, dc.notOffered.size()); // fits except that the surgeon is not a member
      System.assertEquals(noSurgeon, dc.notOffered[0].id);

      PipelineDealCampaignController.setLink(d.Id, fits, true);
      PipelineDealCampaignController.setLink(d.Id, fits, true); // twice is the same as once
      System.assertEquals(
        1,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Deal__c = :d.Id]
      );
      System.assertEquals(
        true,
        PipelineDealCampaignController.getDealCampaigns(d.Id).offered[0].linked
      );
      try {
        PipelineDealCampaignController.setLink(d.Id, noSurgeon, true);
        System.assert(false, 'a campaign without the surgeon must be refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      PipelineDealCampaignController.setLink(d.Id, fits, false);
      System.assertEquals(
        0,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Deal__c = :d.Id]
      );
    }
  }

  @IsTest
  static void aDealWithoutAPrimaryHcpHasNothingToMatch() {
    System.runAs(manager()) {
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      insert d;
      PipelineDealCampaignController.DealCampaigns dc = PipelineDealCampaignController.getDealCampaigns(
        d.Id
      );
      System.assertEquals(false, dc.hasHcp);
      System.assertEquals(0, dc.offered.size());
      PipelineDealCampaignController.setLink(null, null, true); // nothing to do
    }
  }

  @IsTest
  static void aDealInACampaignIsMarkedInThePipelineList() {
    System.runAs(manager()) {
      Account a = surgeon('Starred');
      Id c = campaign('Star', 'SG', 'Hip');
      PipelineCampaignController.addMember(c, a.Id);
      SalesRisks__c inOne = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      SalesRisks__c inNone = inOne.clone(false, true);
      insert new List<SalesRisks__c>{ inOne, inNone };
      PipelineDealCampaignController.setLink(inOne.Id, c, true);
      PipelineController.DealResult r = PipelineController.getDeals(
        '{"kinds":["opp"],"status":"open","closedMonths":3,"below":true}'
      );
      Map<Id, Integer> counts = new Map<Id, Integer>();
      for (PipelineController.Deal d : r.deals) {
        counts.put(d.id, d.campaignCount);
      }
      System.assertEquals(1, counts.get(inOne.Id));
      System.assertEquals(0, counts.get(inNone.Id));
    }
  }

  @IsTest
  static void aSurgeonsOwnDealsThatFitCanBeOfferedForLinking() {
    System.runAs(manager()) {
      Account a = surgeon('Linkable');
      Id c = campaign('Linkable', 'SG', 'Hip');
      PipelineCampaignController.addMember(c, a.Id);
      SalesRisks__c fits = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      SalesRisks__c wrongPortfolio = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUKNEE'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      insert new List<SalesRisks__c>{ fits, wrongPortfolio };
      List<PipelineCampaignController.MemberDeal> offered = PipelineCampaignController.linkableDeals(
        c,
        a.Id
      );
      System.assertEquals(1, offered.size());
      System.assertEquals(fits.Id, offered[0].id);
      PipelineDealCampaignController.setLink(fits.Id, c, true);
      System.assertEquals(
        0,
        PipelineCampaignController.linkableDeals(c, a.Id).size()
      ); // now linked, so no longer offered
      System.assertEquals(
        0,
        PipelineCampaignController.linkableDeals(null, null).size()
      );
    }
  }
}

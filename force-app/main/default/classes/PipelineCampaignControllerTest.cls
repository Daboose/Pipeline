/**
 * Tests for PipelineCampaignController (the Campaign Management screen: the list, one campaign with its members, saving a
 * campaign, switching it on or off, the surgeon search with its country scope, and adding and removing members). Uses
 * invented records only.
 */
@IsTest
private class PipelineCampaignControllerTest {
  static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  /** A person with the Campaign Manager permission set, so the tests do not depend on who runs them. */
  static User manager() {
    User u = new User(
      Alias = 'pcmgr',
      Email = 'pcmgr@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'CampaignManagerTest',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_AU',
      ProfileId = UserInfo.getProfileId(),
      TimeZoneSidKey = 'Australia/Sydney',
      Username = 'pcmgr' +
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
    return u;
  }

  static Account surgeon(
    String first,
    String last,
    String country,
    String type
  ) {
    Account a = new Account(
      FirstName = first,
      LastName = last,
      PersonMailingCountry = country == 'SG' ? 'Singapore' : 'Australia',
      PersonMailingCountryCode = country,
      RecordTypeId = rt(Account.SObjectType, type)
    );
    if (country == 'AU') {
      // PROD has an Account rule "State Is Required" for AU that UAT and DEV do not switch on
      a.PersonMailingState = 'New South Wales';
      a.PersonMailingStateCode = 'NSW';
    }
    // an org's duplicate rule must not stop test surgeons being created
    Database.DMLOptions opts = new Database.DMLOptions();
    opts.duplicateRuleHeader.allowSave = true;
    Database.insert(a, opts);
    return a;
  }

  static String payload(String friendly, List<String> countries) {
    return JSON.serialize(
      new Map<String, Object>{
        'friendlyName' => friendly,
        'countries' => countries,
        'portfolios' => new List<String>{ 'Extremities' },
        'active' => true,
        'managerId' => UserInfo.getUserId(),
        'startDate' => '2026-12-01',
        'description' => 'Invented campaign'
      }
    );
  }

  @IsTest
  static void theContextOffersTheCountriesAndPortfoliosFromSalesforce() {
    System.runAs(manager()) {
      PipelineCampaignController.Context c = PipelineCampaignController.getContext();
      System.assert(c.countries.size() >= 9);
      System.assert(c.portfolios.size() >= 4);
      System.assert(c.theme == 'dark' || c.theme == 'light');
      System.assertNotEquals(null, c.canManage);
    }
  }

  @IsTest
  static void aCampaignIsSavedWithItsNameAndShowsInTheList() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Shoulder Symposium', new List<String>{ 'TH', 'SG' })
      );
      List<PipelineCampaignController.CampaignRow> rows = PipelineCampaignController.listCampaigns();
      System.assertEquals(1, rows.size());
      System.assertEquals('Shoulder Symposium SG-TH', rows[0].name);
      System.assertEquals(0, rows[0].memberCount);
      // an edit keeps the same record and re-writes the name
      PipelineCampaignController.saveCampaign(
        JSON.serialize(
          new Map<String, Object>{
            'id' => id,
            'friendlyName' => 'Shoulder Update',
            'countries' => new List<String>{ 'SG' },
            'portfolios' => new List<String>{ 'Extremities', 'Hip' },
            'active' => true,
            'managerId' => UserInfo.getUserId()
          }
        )
      );
      PipelineCampaignController.CampaignDetail d = PipelineCampaignController.getCampaign(
        id
      );
      System.assertEquals('Shoulder Update SG', d.campaign.name);
      System.assertEquals(2, d.campaign.portfolios.size());
    }
  }

  @IsTest
  static void aCampaignNeedsANameACountryAPortfolioAndAManager() {
    System.runAs(manager()) {
      List<String> bad = new List<String>{
        JSON.serialize(new Map<String, Object>{ 'friendlyName' => '' }),
        JSON.serialize(
          new Map<String, Object>{
            'friendlyName' => 'x'.repeat(41),
            'countries' => new List<String>{ 'SG' }
          }
        ),
        JSON.serialize(
          new Map<String, Object>{
            'friendlyName' => 'No country',
            'countries' => new List<String>()
          }
        ),
        JSON.serialize(
          new Map<String, Object>{
            'friendlyName' => 'No portfolio',
            'countries' => new List<String>{ 'SG' },
            'portfolios' => new List<String>()
          }
        ),
        JSON.serialize(
          new Map<String, Object>{
            'friendlyName' => 'No manager',
            'countries' => new List<String>{ 'SG' },
            'portfolios' => new List<String>{ 'Hip' }
          }
        )
      };
      Integer refused = 0;
      for (String b : bad) {
        try {
          PipelineCampaignController.saveCampaign(b);
        } catch (AuraHandledException e) {
          refused++;
        }
      }
      System.assertEquals(5, refused);
    }
  }

  @IsTest
  static void aCampaignCanBeSwitchedOffAndOn() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Switch', new List<String>{ 'SG' })
      );
      PipelineCampaignController.setActive(id, false);
      System.assertEquals(
        false,
        PipelineCampaignController.getCampaign(id).campaign.active
      );
      PipelineCampaignController.setActive(id, true);
      System.assertEquals(
        true,
        PipelineCampaignController.getCampaign(id).campaign.active
      );
    }
  }

  @IsTest
  static void surgeonSearchNeedsTwoCharactersAndStartsInTheCampaignsCountries() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Search', new List<String>{ 'SG' })
      );
      surgeon('Wei', 'Searchable', 'SG', 'Physician');
      surgeon('Anna', 'Searchable', 'AU', 'Physician');
      surgeon('Staging', 'Searchable', 'SG', 'Physician_Processing');
      System.assertEquals(
        0,
        PipelineCampaignController.searchSurgeons(id, 'S', false).hits.size()
      );
      PipelineCampaignController.SurgeonSearch narrow = PipelineCampaignController.searchSurgeons(
        id,
        'Searchable',
        false
      );
      System.assertEquals(1, narrow.hits.size());
      System.assertEquals(1, narrow.outside);
      System.assertEquals(1, narrow.heldBack);
      System.assertEquals('SG', narrow.scope);
      PipelineCampaignController.SurgeonSearch wide = PipelineCampaignController.searchSurgeons(
        id,
        'Searchable',
        true
      );
      System.assertEquals(2, wide.hits.size());
      System.assertEquals('ALL', wide.scope);
    }
  }

  @IsTest
  static void aSurgeonFoundByTheirEnglishNameAndAddedShowsAsAMember() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('English', new List<String>{ 'SG' })
      );
      Account a = surgeon('Local', 'Name', 'SG', 'Physician');
      a.Preferred_Name__c = 'Zebra English';
      update a;
      System.assertEquals(
        1,
        PipelineCampaignController.searchSurgeons(id, 'zebra', false)
          .hits.size()
      );
      PipelineCampaignController.addMember(id, a.Id);
      System.assertEquals(
        true,
        PipelineCampaignController.searchSurgeons(id, 'zebra', false)
          .hits[0]
          .alreadyMember
      );
      PipelineCampaignController.CampaignDetail d = PipelineCampaignController.getCampaign(
        id
      );
      System.assertEquals(1, d.members.size());
      System.assertEquals('Zebra English', d.members[0].preferredName);
      System.assertEquals(0, d.members[0].dealCount);
      try {
        PipelineCampaignController.addMember(id, a.Id);
        System.assert(false, 'the same surgeon twice should be refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      System.assertEquals(
        1,
        PipelineCampaignController.removeMembers(
          new List<Id>{ d.members[0].memberId }
        )
      );
      System.assertEquals(
        0,
        PipelineCampaignController.getCampaign(id).members.size()
      );
      System.assertEquals(0, PipelineCampaignController.removeMembers(null));
    }
  }

  @IsTest
  static void aLinkedDealShowsOnTheMembersRow() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Deals', new List<String>{ 'SG' })
      );
      Account a = surgeon('Linked', 'Surgeon', 'SG', 'Physician');
      PipelineCampaignController.addMember(id, a.Id);
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      insert d;
      insert new Sales_Campaign_Deal__c(Campaign__c = id, Deal__c = d.Id);
      PipelineCampaignController.CampaignDetail detail = PipelineCampaignController.getCampaign(
        id
      );
      System.assertEquals(1, detail.members[0].dealCount);
      System.assertEquals('Plan', detail.members[0].stages);
      System.assertEquals(1, detail.members[0].deals.size());
      System.assertEquals('Plan', detail.members[0].deals[0].stage);
      System.assertEquals('Hip', detail.members[0].deals[0].portfolio);
      System.assertEquals('opp', detail.members[0].deals[0].kind);
      System.assertEquals(null, detail.members[0].y1Rep); // the test surgeon has no Y1 or Y6 rep
      System.assertEquals(null, detail.members[0].y6Rep);
      System.assertEquals(1, detail.members[0].ratings.size()); // one per portfolio the campaign covers
      System.assertEquals(
        'Extremities',
        detail.members[0].ratings[0].portfolio
      ); // the test campaign covers Extremities
      System.assertEquals('Shoulder', detail.members[0].ratings[0].area);
      System.assertEquals(
        1,
        PipelineCampaignController.listCampaigns()[0].dealCount
      );
    }
  }

  @IsTest
  static void peopleSearchOffersOnlyActiveNonPortalPeople() {
    System.runAs(manager()) {
      System.assertEquals(
        0,
        PipelineCampaignController.searchPeople('a').size()
      );
      List<PipelineCampaignController.PersonHit> hits = PipelineCampaignController.searchPeople(
        UserInfo.getLastName().left(3)
      );
      System.assert(hits.size() >= 1);
    }
  }

  @IsTest
  static void aCampaignSetUpInErrorCanBeDeletedWithItsMembers() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('By mistake', new List<String>{ 'SG' })
      );
      Account a = surgeon('Delete', 'Me', 'SG', 'Physician');
      PipelineCampaignController.addMember(id, a.Id);
      System.assertEquals(
        1,
        [SELECT COUNT() FROM Sales_Campaign_Member__c WHERE Campaign__c = :id]
      );
      PipelineCampaignController.deleteCampaign(id);
      System.assertEquals(
        0,
        [SELECT COUNT() FROM Sales_Campaign__c WHERE Id = :id]
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM Sales_Campaign_Member__c WHERE Campaign__c = :id]
      );
      System.assertEquals(1, [SELECT COUNT() FROM Account WHERE Id = :a.Id]); // the surgeon is untouched
      PipelineCampaignController.deleteCampaign(null); // nothing to do
    }
  }
  @IsTest
  static void zoomAndThemeAreSavedInThePersonsOwnSettingsAndKeepTheOtherSettings() {
    System.runAs(manager()) {
      // nothing saved yet: Pipeline's own defaults
      PipelineCampaignController.Context c = PipelineCampaignController.getContext();
      System.assertEquals(80, c.zoom);
      System.assertEquals('dark', c.theme);
      System.assertEquals(false, c.hasTheme);
      // a first save makes the record
      PipelineCampaignController.saveGlobalSettings('light', 80);
      c = PipelineCampaignController.getContext();
      System.assertEquals(80, c.zoom);
      System.assertEquals('light', c.theme);
      System.assertEquals(true, c.hasTheme);
      System.assertEquals(
        1,
        [
          SELECT COUNT()
          FROM Pipeline_Filter__c
          WHERE OwnerId = :UserInfo.getUserId() AND Is_User_Settings__c = TRUE
          WITH SYSTEM_MODE
        ]
      );
      // the Pipeline screen's other settings are kept, and a null leaves a value as it was
      Pipeline_Filter__c mine = [
        SELECT Id
        FROM Pipeline_Filter__c
        WHERE OwnerId = :UserInfo.getUserId() AND Is_User_Settings__c = TRUE
        WITH SYSTEM_MODE
      ];
      mine.Settings_Json__c = '{"theme":"dark","headColour":"sky","zoom":70,"altTint":true}';
      Database.update(mine, AccessLevel.SYSTEM_MODE);
      PipelineCampaignController.saveGlobalSettings(null, 60);
      Map<String, Object> s = (Map<String, Object>) JSON.deserializeUntyped(
        [
          SELECT Settings_Json__c
          FROM Pipeline_Filter__c
          WHERE Id = :mine.Id
          WITH SYSTEM_MODE
        ]
        .Settings_Json__c
      );
      System.assertEquals(60, Integer.valueOf(String.valueOf(s.get('zoom'))));
      System.assertEquals('dark', s.get('theme'));
      System.assertEquals('sky', s.get('headColour'));
      System.assertEquals(true, s.get('altTint'));
      System.assertEquals(
        1,
        [
          SELECT COUNT()
          FROM Pipeline_Filter__c
          WHERE OwnerId = :UserInfo.getUserId() AND Is_User_Settings__c = TRUE
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void aZoomOrThemeThatIsNotOneOfTheChoicesIsRefusedAndASavedOddOneReadsAs80() {
    System.runAs(manager()) {
      try {
        PipelineCampaignController.saveGlobalSettings(null, 55);
        System.assert(false, 'a zoom of 55 should be refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      try {
        PipelineCampaignController.saveGlobalSettings('purple', null);
        System.assert(false, 'a theme of purple should be refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      Database.insert(
        new Pipeline_Filter__c(
          Name = 'Pipeline Settings (do not delete)',
          Is_User_Settings__c = true,
          Settings_Json__c = '{"zoom":55}'
        ),
        AccessLevel.SYSTEM_MODE
      );
      System.assertEquals(80, PipelineCampaignController.getContext().zoom);
    }
  }
  @IsTest
  static void maintainListsTheOpenDealsThatFitAndTheOnesAlreadyInTheCampaign() {
    User u = manager();
    u.CountryCode = 'SG'; // the deals' owner country comes from the owner's country
    update u;
    System.runAs(u) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Maintain', new List<String>{ 'SG' })
      );
      Account a = surgeon('Maint', 'Surgeon', 'SG', 'Physician');
      PipelineCampaignController.addMember(id, a.Id);
      SalesRisks__c ext = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUEXTREMITIES'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4',
        AmountPerYear__c = 1000
      );
      SalesRisks__c risk = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AURISK'),
        Account__c = a.Id,
        Stage__c = 'Unhappy',
        Portfolio__c = 'Extremities',
        AmountPerYear__c = 500
      );
      SalesRisks__c hip = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      SalesRisks__c rosa = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA'),
        Account__c = a.Id,
        Stage__c = 'Sales Pipeline',
        Portfolio__c = 'Extremities',
        ROSAGrowthDollar__c = 2000
      );
      SalesRisks__c hipLinked = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      insert new List<SalesRisks__c>{ ext, risk, hip, rosa, hipLinked };
      insert new Sales_Campaign_Deal__c(
        Campaign__c = id,
        Deal__c = hipLinked.Id
      );
      Map<Id, PipelineCampaignController.MaintainDeal> byId = new Map<Id, PipelineCampaignController.MaintainDeal>();
      for (
        PipelineCampaignController.MaintainDeal d : PipelineCampaignController.maintainDeals(
          id
        )
      ) {
        byId.put(d.id, d);
      }
      // the open Extremities opportunity and risk fit; a Hip deal does not fit an Extremities campaign; ROSA is never offered
      System.assert(
        byId.containsKey(ext.Id),
        'the Extremities deal is offered'
      );
      System.assertEquals('opp', byId.get(ext.Id).kind);
      System.assertEquals(false, byId.get(ext.Id).inCampaign);
      System.assertEquals(true, byId.get(ext.Id).canEdit);
      System.assertEquals(a.Id, byId.get(ext.Id).accountId);
      System.assert(
        byId.containsKey(risk.Id),
        'the Extremities risk is offered'
      );
      System.assertEquals('risk', byId.get(risk.Id).kind);
      System.assertEquals(false, byId.containsKey(hip.Id));
      System.assertEquals(false, byId.containsKey(rosa.Id));
      // a deal already in the campaign is always listed, so it can be taken out
      System.assert(byId.containsKey(hipLinked.Id));
      System.assertEquals(true, byId.get(hipLinked.Id).inCampaign);
      // nothing is offered for a campaign with no members, or none
      System.assertEquals(
        0,
        PipelineCampaignController.maintainDeals(null).size()
      );
    }
  }
}

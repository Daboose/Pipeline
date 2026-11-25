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
      PersonMailingCountry = country == 'SG'
        ? 'Singapore'
        : (country == 'TH' ? 'Thailand' : 'Australia'),
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
        payload('English', new List<String>{ 'TH' })
      );
      // Thailand: an Account rule (ACC_05) refuses an English name for countries that already enter names in English, SG among them
      Account a = surgeon('Local', 'Name', 'TH', 'Physician');
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
  static void removingASurgeonAlsoTakesTheirDealsOutOfThatCampaign() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Both go', new List<String>{ 'SG' })
      );
      Id other = PipelineCampaignController.saveCampaign(
        payload('Stays', new List<String>{ 'SG' })
      );
      Account a = surgeon('Both', 'Go', 'SG', 'Physician');
      PipelineCampaignController.addMember(id, a.Id);
      PipelineCampaignController.addMember(other, a.Id);
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      insert d;
      insert new List<Sales_Campaign_Deal__c>{
        new Sales_Campaign_Deal__c(Campaign__c = id, Deal__c = d.Id),
        new Sales_Campaign_Deal__c(Campaign__c = other, Deal__c = d.Id)
      };
      Id memberId = PipelineCampaignController.getCampaign(id)
        .members[0]
        .memberId;
      System.assertEquals(
        1,
        PipelineCampaignController.removeMemberAndDeals(memberId)
      );
      System.assertEquals(
        0,
        PipelineCampaignController.getCampaign(id).members.size()
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Campaign__c = :id]
      );
      // the other campaign keeps its member and its link, and the deal itself is untouched
      System.assertEquals(
        1,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Campaign__c = :other]
      );
      System.assertEquals(
        1,
        PipelineCampaignController.getCampaign(other).members.size()
      );
      System.assertEquals(
        1,
        [SELECT COUNT() FROM SalesRisks__c WHERE Id = :d.Id]
      );
      System.assertEquals(
        0,
        PipelineCampaignController.removeMemberAndDeals(null)
      );
    }
  }

  @IsTest
  static void removingSeveralMembersAlsoTakesTheirDealsOutOfThatCampaign() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Several go', new List<String>{ 'SG' })
      );
      Id other = PipelineCampaignController.saveCampaign(
        payload('Several stay', new List<String>{ 'SG' })
      );
      Account a = surgeon('Several', 'One', 'SG', 'Physician');
      Account b = surgeon('Several', 'Two', 'SG', 'Physician');
      PipelineCampaignController.addMember(id, a.Id);
      PipelineCampaignController.addMember(id, b.Id);
      PipelineCampaignController.addMember(other, a.Id);
      List<SalesRisks__c> deals = new List<SalesRisks__c>{
        new SalesRisks__c(
          RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
          Account__c = a.Id,
          Stage__c = 'Plan',
          Expected_Closure_Quarter__c = 'Q4'
        ),
        new SalesRisks__c(
          RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
          Account__c = b.Id,
          Stage__c = 'Plan',
          Expected_Closure_Quarter__c = 'Q4'
        )
      };
      insert deals;
      insert new List<Sales_Campaign_Deal__c>{
        new Sales_Campaign_Deal__c(Campaign__c = id, Deal__c = deals[0].Id),
        new Sales_Campaign_Deal__c(Campaign__c = id, Deal__c = deals[1].Id),
        new Sales_Campaign_Deal__c(Campaign__c = other, Deal__c = deals[0].Id)
      };
      List<Id> ids = new List<Id>();
      for (
        PipelineCampaignController.MemberRow m : PipelineCampaignController.getCampaign(
            id
          )
          .members
      ) {
        ids.add(m.memberId);
      }
      System.assertEquals(2, PipelineCampaignController.removeMembers(ids));
      System.assertEquals(
        0,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Campaign__c = :id]
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM Sales_Campaign_Member__c WHERE Campaign__c = :id]
      );
      // the other campaign keeps its member and its link; the deals are untouched
      System.assertEquals(
        1,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Campaign__c = :other]
      );
      System.assertEquals(
        1,
        [
          SELECT COUNT()
          FROM Sales_Campaign_Member__c
          WHERE Campaign__c = :other
        ]
      );
      System.assertEquals(2, [SELECT COUNT() FROM SalesRisks__c]);
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
  static void zoomAndThemeAreSavedInTheCampaignFieldAndNeverTouchThePipelineScreensSettings() {
    System.runAs(manager()) {
      // nothing saved yet: the defaults
      PipelineCampaignController.Context c = PipelineCampaignController.getContext();
      System.assertEquals(80, c.zoom);
      System.assertEquals('dark', c.theme);
      System.assertEquals(false, c.hasTheme);
      // a first save makes the person's one record, keyed by their own Id
      PipelineCampaignController.saveGlobalSettings('light', 80);
      c = PipelineCampaignController.getContext();
      System.assertEquals(80, c.zoom);
      System.assertEquals('light', c.theme);
      System.assertEquals(true, c.hasTheme);
      UserSettings__c mine = [
        SELECT Id, User_Key__c, Pipeline_JSON__c, Campaign_JSON__c
        FROM UserSettings__c
        WHERE OwnerId = :UserInfo.getUserId()
        WITH SYSTEM_MODE
      ];
      System.assertEquals(
        String.valueOf(UserInfo.getUserId()),
        mine.User_Key__c
      );
      System.assertEquals(
        null,
        mine.Pipeline_JSON__c,
        'The Pipeline screen\'s field is not written'
      );
      // the Pipeline screen's own settings are a different field and stay as they are; a null leaves a value as it was
      mine.Pipeline_JSON__c = '{"theme":"dark","headColour":"sky","zoom":70,"altTint":true}';
      Database.update(mine, AccessLevel.SYSTEM_MODE);
      PipelineCampaignController.saveGlobalSettings(null, 60);
      mine = [
        SELECT Pipeline_JSON__c, Campaign_JSON__c
        FROM UserSettings__c
        WHERE OwnerId = :UserInfo.getUserId()
        WITH SYSTEM_MODE
      ];
      Map<String, Object> camp = (Map<String, Object>) JSON.deserializeUntyped(
        mine.Campaign_JSON__c
      );
      System.assertEquals(
        60,
        Integer.valueOf(String.valueOf(camp.get('zoom')))
      );
      System.assertEquals(
        'light',
        camp.get('theme'),
        'The theme saved earlier is kept'
      );
      System.assertEquals(
        '{"theme":"dark","headColour":"sky","zoom":70,"altTint":true}',
        mine.Pipeline_JSON__c,
        'The Pipeline screen\'s settings are untouched'
      );
      System.assertEquals(
        1,
        [
          SELECT COUNT()
          FROM UserSettings__c
          WHERE OwnerId = :UserInfo.getUserId()
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
      UserSettings__c odd = new UserSettings__c(Name = 'UserSettings');
      odd.put('User_Key__c', String.valueOf(UserInfo.getUserId()));
      odd.put('Campaign_JSON__c', '{"zoom":55}');
      Database.insert(odd, AccessLevel.SYSTEM_MODE);
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
      SalesRisks__c won = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUEXTREMITIES'),
        Account__c = a.Id,
        Stage__c = 'Closed Won',
        AmountPerYear__c = 700
      );
      insert new List<SalesRisks__c>{ ext, risk, hip, rosa, hipLinked, won };
      insert new Sales_Campaign_Deal__c(
        Campaign__c = id,
        Deal__c = hipLinked.Id
      );
      Map<Id, PipelineCampaignController.MaintainDeal> byId = new Map<Id, PipelineCampaignController.MaintainDeal>();
      for (
        PipelineCampaignController.MaintainDeal d : PipelineCampaignController.maintainDeals(
          id,
          false
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
      // a closed deal is offered only when Include Closed is on
      System.assertEquals(false, byId.containsKey(won.Id));
      Set<Id> withClosed = new Set<Id>();
      for (
        PipelineCampaignController.MaintainDeal d : PipelineCampaignController.maintainDeals(
          id,
          true
        )
      ) {
        withClosed.add(d.id);
      }
      System.assert(withClosed.contains(won.Id), 'the closed deal is offered');
      System.assert(
        withClosed.contains(ext.Id),
        'open deals are still offered'
      );
      // nothing is offered for a campaign with no members, or none
      System.assertEquals(
        0,
        PipelineCampaignController.maintainDeals(null, false).size()
      );
    }
  }
  @IsTest
  static void currencyRatesComeFromTheOrgsCurrencyTable() {
    System.runAs(manager()) {
      PipelineCampaignController.CurrencyRates r = PipelineCampaignController.currencyRates();
      System.assert(r.corporate != null, 'the org has a corporate currency');
      System.assertEquals(
        1,
        r.rates.get(r.corporate),
        'the corporate currency is worth one of itself'
      );
      System.assert(r.rates.size() >= 1);
      System.assert(r.changed != null);
    }
  }

  /** A healthcare facility, an Account of record type Healthcare_Facility. */
  static Account facility(String name, String country) {
    Account a = new Account(
      Name = name,
      BillingCountryCode = country,
      BillingCity = 'Testville',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    Database.DMLOptions opts = new Database.DMLOptions();
    opts.duplicateRuleHeader.allowSave = true;
    Database.insert(a, opts);
    return a;
  }

  @IsTest
  static void aFacilityMemberFindsItsRosaDealsAndNeverThroughThePhysician() {
    User u = manager();
    u.CountryCode = 'SG'; // the deals' owner country comes from the owner's country
    update u;
    System.runAs(u) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Rosa', new List<String>{ 'SG' })
      );
      Account f = facility('Kareela Test Hospital', 'SG');
      Account physician = surgeon('Rosa', 'Physician', 'SG', 'Physician'); // on the ROSA deal, but not a member
      Account member = surgeon('Rosa', 'Member', 'SG', 'Physician');
      PipelineCampaignController.addMember(id, f.Id);
      PipelineCampaignController.addMember(id, member.Id);
      SalesRisks__c rosa = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA'),
        Account__c = physician.Id,
        Healthcare_Facility__c = f.Id,
        Stage__c = 'Sales Pipeline',
        Portfolio__c = 'Extremities',
        ROSAGrowthDollar__c = 2000
      );
      // a ROSA deal whose physician IS a member but whose facility is not: never offered to the surgeon
      SalesRisks__c rosaViaSurgeon = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA'),
        Account__c = member.Id,
        Stage__c = 'Sales Pipeline',
        Portfolio__c = 'Extremities',
        ROSAGrowthDollar__c = 3000
      );
      SalesRisks__c opp = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUEXTREMITIES'),
        Account__c = member.Id,
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4',
        AmountPerYear__c = 1000
      );
      insert new List<SalesRisks__c>{ rosa, rosaViaSurgeon, opp };

      // Maintain: the facility's ROSA deal sits under the facility; the surgeon's own deal under the surgeon
      Map<Id, PipelineCampaignController.MaintainDeal> byId = new Map<Id, PipelineCampaignController.MaintainDeal>();
      for (
        PipelineCampaignController.MaintainDeal d : PipelineCampaignController.maintainDeals(
          id,
          false
        )
      ) {
        byId.put(d.id, d);
      }
      System.assertEquals('rosa', byId.get(rosa.Id).kind);
      System.assertEquals(f.Id, byId.get(rosa.Id).accountId);
      System.assertEquals(2000, byId.get(rosa.Id).value);
      System.assertEquals(
        'Rosa Physician',
        byId.get(rosa.Id).physician.replace('  ', ' ')
      );
      System.assertEquals(member.Id, byId.get(opp.Id).accountId);
      System.assertEquals(
        false,
        byId.containsKey(rosaViaSurgeon.Id),
        'a ROSA deal is never found through its physician'
      );

      // the deal's own Campaigns control offers the campaign (its facility is a member)
      PipelineDealCampaignController.DealCampaigns dc = PipelineDealCampaignController.getDealCampaigns(
        rosa.Id
      );
      System.assertEquals(1, dc.offered.size());
      System.assertEquals(id, dc.offered[0].id);
      PipelineDealCampaignController.setLink(rosa.Id, id, true);
      System.assertEquals(
        0,
        PipelineDealCampaignController.getDealCampaigns(rosaViaSurgeon.Id)
          .offered.size(),
        'the physician being a member offers nothing for a ROSA deal'
      );

      // the members list: the deal is under the facility, with no ratings and a ROSA kind; the surgeon has none
      PipelineCampaignController.CampaignDetail d = PipelineCampaignController.getCampaign(
        id
      );
      PipelineCampaignController.MemberRow fRow;
      PipelineCampaignController.MemberRow sRow;
      for (PipelineCampaignController.MemberRow m : d.members) {
        if (m.accountId == f.Id) {
          fRow = m;
        } else {
          sRow = m;
        }
      }
      System.assertEquals(true, fRow.isFacility);
      System.assertEquals(0, fRow.ratings.size());
      System.assertEquals('SG', fRow.country);
      System.assertEquals(1, fRow.dealCount);
      System.assertEquals('rosa', fRow.deals[0].kind);
      System.assertEquals(2000, fRow.deals[0].value);
      System.assertEquals(false, sRow.isFacility);
      System.assertEquals(0, sRow.dealCount);

      // taking the facility out also takes its ROSA deal out of the campaign; the deal itself is untouched
      System.assertEquals(
        1,
        PipelineCampaignController.removeMemberAndDeals(fRow.memberId)
      );
      System.assertEquals(
        0,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Campaign__c = :id]
      );
      System.assertEquals(
        1,
        [SELECT COUNT() FROM SalesRisks__c WHERE Id = :rosa.Id]
      );
    }
  }

  @IsTest
  static void removingASurgeonLeavesAFacilitysRosaDealsWhereTheyAre() {
    User u = manager();
    u.CountryCode = 'SG';
    update u;
    System.runAs(u) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Rosa stays', new List<String>{ 'SG' })
      );
      Account f = facility('Kareela Stays Hospital', 'SG');
      Account physician = surgeon('Stays', 'Physician', 'SG', 'Physician');
      PipelineCampaignController.addMember(id, f.Id);
      PipelineCampaignController.addMember(id, physician.Id);
      SalesRisks__c rosa = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA'),
        Account__c = physician.Id,
        Healthcare_Facility__c = f.Id,
        Stage__c = 'Sales Pipeline',
        Portfolio__c = 'Extremities',
        ROSAGrowthDollar__c = 2000
      );
      insert rosa;
      PipelineDealCampaignController.setLink(rosa.Id, id, true);
      List<Id> ids = new List<Id>();
      for (
        PipelineCampaignController.MemberRow m : PipelineCampaignController.getCampaign(
            id
          )
          .members
      ) {
        if (m.accountId == physician.Id) {
          ids.add(m.memberId);
        }
      }
      // removing the physician (a surgeon member) never takes the facility's ROSA deal out, even though they are its Primary HCP
      PipelineCampaignController.removeMembers(ids);
      System.assertEquals(
        1,
        [SELECT COUNT() FROM Sales_Campaign_Deal__c WHERE Campaign__c = :id]
      );
    }
  }

  @IsTest
  static void theSearchOffersMatchingFacilitiesInTheirOwnGroup() {
    System.runAs(manager()) {
      Id id = PipelineCampaignController.saveCampaign(
        payload('Find', new List<String>{ 'SG' })
      );
      Account here = facility('Zanzibar Orthopaedic Centre', 'SG');
      facility('Zanzibar Faraway Clinic', 'AU');
      surgeon('Zanzibar', 'Doctor', 'SG', 'Physician');
      PipelineCampaignController.SurgeonSearch r = PipelineCampaignController.searchSurgeons(
        id,
        'zanzibar',
        false
      );
      System.assertEquals(1, r.hits.size(), 'the surgeon is still found');
      System.assertEquals(
        1,
        r.facilities.size(),
        'inside the campaign countries'
      );
      System.assertEquals(here.Id, r.facilities[0].id);
      System.assertEquals(false, r.facilities[0].alreadyMember);
      System.assertEquals(
        1,
        r.outside,
        'the AU facility is counted as outside'
      );
      System.assertEquals(
        2,
        PipelineCampaignController.searchSurgeons(id, 'zanzibar', true)
          .facilities.size()
      );
      PipelineCampaignController.addMember(id, here.Id);
      System.assertEquals(
        true,
        PipelineCampaignController.searchSurgeons(id, 'zanzibar', false)
          .facilities[0]
          .alreadyMember
      );
      System.assertEquals(
        0,
        PipelineCampaignController.searchSurgeons(id, 'z', false)
          .facilities.size()
      );
    }
  }
}

/**
 * Tests for PipelineCampaignRules and the three triggers that call it (the campaign name and its text fields, and the unique
 * keys that stop a surgeon or a deal being added to a campaign twice). Uses invented records only.
 */
@IsTest
private class PipelineCampaignRulesTest {
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

  static Account surgeon(String last, String type) {
    Account a = new Account(
      FirstName = 'Test',
      LastName = last,
      PersonMailingCountry = 'Singapore',
      PersonMailingCountryCode = 'SG',
      RecordTypeId = rt(Account.SObjectType, type)
    );
    insert a;
    return a;
  }

  static Sales_Campaign__c campaign(String friendly, String countries) {
    Sales_Campaign__c c = new Sales_Campaign__c(
      Name = 'x',
      Friendly_Name__c = friendly,
      Countries__c = countries,
      Portfolios__c = 'Extremities;Hip',
      Active__c = true,
      Campaign_Manager__c = UserInfo.getUserId()
    );
    insert c;
    return c;
  }

  @IsTest
  static void theNameIsTheFriendlyNameWithCountryCodesInAFixedOrder() {
    System.runAs(manager()) {
      Sales_Campaign__c c = campaign('Shoulder Symposium', 'TH;SG;MY');
      c = [
        SELECT Name, Countries_Text__c, Portfolios_Text__c
        FROM Sales_Campaign__c
        WHERE Id = :c.Id
      ];
      System.assertEquals('Shoulder Symposium SG-MY-TH', c.Name);
      System.assertEquals('SG, MY, TH', c.Countries_Text__c);
      System.assertEquals('Hip, Extremities', c.Portfolios_Text__c); // in the order Salesforce lists the portfolios
    }
  }

  @IsTest
  static void theNameFollowsAnEditAndAnUnknownCountryGoesLast() {
    System.runAs(manager()) {
      Sales_Campaign__c c = campaign('Hip Update', 'NZ;AU');
      c.Friendly_Name__c = 'Hip Masterclass';
      c.Countries__c = 'IN;AU';
      update c;
      c = [SELECT Name FROM Sales_Campaign__c WHERE Id = :c.Id];
      System.assertEquals('Hip Masterclass AU-IN', c.Name);
      System.assertEquals('', PipelineCampaignRules.countryCodes(null, '-'));
    }
  }

  @IsTest
  static void aSurgeonCannotBeAddedToTheSameCampaignTwice() {
    System.runAs(manager()) {
      Sales_Campaign__c c = campaign('One', 'SG');
      Account a = surgeon('Surgeon', 'Physician');
      insert new Sales_Campaign_Member__c(
        Campaign__c = c.Id,
        Surgeon__c = a.Id
      );
      Sales_Campaign_Member__c m = [
        SELECT Unique_Key__c
        FROM Sales_Campaign_Member__c
        LIMIT 1
      ];
      System.assertEquals(
        String.valueOf(c.Id) + '-' + String.valueOf(a.Id),
        m.Unique_Key__c
      );
      try {
        insert new Sales_Campaign_Member__c(
          Campaign__c = c.Id,
          Surgeon__c = a.Id
        );
        System.assert(false, 'the second add should be refused');
      } catch (DmlException e) {
        System.assert(e.getMessage().contains('DUPLICATE'));
      }
    }
  }

  @IsTest
  static void onlyPhysiciansAndEmergingConsultantsCanBeMembers() {
    System.runAs(manager()) {
      Sales_Campaign__c c = campaign('Two', 'SG');
      Account ok = surgeon('Consultant', 'Emerging_Consultant');
      insert new Sales_Campaign_Member__c(
        Campaign__c = c.Id,
        Surgeon__c = ok.Id
      );
      Account staging = surgeon('Staging', 'Physician_Processing');
      try {
        insert new Sales_Campaign_Member__c(
          Campaign__c = c.Id,
          Surgeon__c = staging.Id
        );
        System.assert(false, 'a staging account should be refused');
      } catch (DmlException e) {
        System.assert(
          e.getMessage().contains('Physician or Emerging Consultant')
        );
      }
    }
  }

  @IsTest
  static void aDealCannotBeLinkedToTheSameCampaignTwice() {
    System.runAs(manager()) {
      Sales_Campaign__c c = campaign('Three', 'SG');
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4'
      );
      insert d;
      insert new Sales_Campaign_Deal__c(Campaign__c = c.Id, Deal__c = d.Id);
      try {
        insert new Sales_Campaign_Deal__c(Campaign__c = c.Id, Deal__c = d.Id);
        System.assert(false, 'the second link should be refused');
      } catch (DmlException e) {
        System.assert(e.getMessage().contains('DUPLICATE'));
      }
    }
  }

  @IsTest
  static void theEndDateCannotBeBeforeTheStartDate() {
    System.runAs(manager()) {
      Sales_Campaign__c c = new Sales_Campaign__c(
        Name = 'x',
        Friendly_Name__c = 'Dates',
        Countries__c = 'SG',
        Portfolios__c = 'Hip',
        Campaign_Manager__c = UserInfo.getUserId(),
        Start_Date__c = Date.today(),
        End_Date__c = Date.today().addDays(-1)
      );
      try {
        insert c;
        System.assert(false, 'the dates should be refused');
      } catch (DmlException e) {
        System.assert(e.getMessage().contains('end date'));
      }
    }
  }
}

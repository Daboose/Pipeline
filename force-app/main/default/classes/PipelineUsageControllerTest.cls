/**
 * Tests for PipelineUsageController (edit, delete and add a surgeon's usages) and the extra details PipelineSurgeonController
 * now sends with each usage line. Uses invented records only.
 */
@IsTest
private class PipelineUsageControllerTest {
  private static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  private class Setup {
    Account surgeon;
    Account hospital;
    Account otherHospital;
    SalesRisks__c deal;
  }

  private static Setup make() {
    Setup s = new Setup();
    s.surgeon = new Account(
      FirstName = 'Test',
      LastName = 'Surgeon',
      PersonMailingCountry = 'Australia',
      PersonMailingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Physician')
    );
    insert s.surgeon;
    s.hospital = new Account(
      Name = 'Test Hospital',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    s.otherHospital = new Account(
      Name = 'Other Hospital',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    insert new List<Account>{ s.hospital, s.otherHospital };
    s.deal = new SalesRisks__c(
      RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
      Account__c = s.surgeon.Id,
      Stage__c = 'Plan',
      Expected_Closure_Quarter__c = 'Q4'
    );
    insert s.deal;
    return s;
  }

  private static String lines(String key, String company, Decimal cases) {
    return JSON.serialize(
      new List<Map<String, Object>>{
        new Map<String, Object>{
          'key' => key,
          'company' => company,
          'cases' => cases
        }
      }
    );
  }

  @IsTest
  static void theRecordTypeFollowsTheCountryAndThePortfolio() {
    System.assertEquals(
      'ANZ HIP',
      PipelineUsageController.recordTypeName('Hip', 'AU')
    );
    System.assertEquals(
      'ANZ KNEE',
      PipelineUsageController.recordTypeName('Knee', 'NZ'),
      'Australia and New Zealand share ANZ'
    );
    System.assertEquals(
      'ANZ SHOULDERS',
      PipelineUsageController.recordTypeName('Shoulder', 'AU')
    );
    System.assertEquals(
      'ANZ CMFT',
      PipelineUsageController.recordTypeName('CMF', 'AU')
    );
    System.assertEquals(
      'SG HIP',
      PipelineUsageController.recordTypeName('Hip', 'SG')
    );
    System.assertEquals(
      null,
      PipelineUsageController.recordTypeName('Hip', null),
      'A person with no country has none'
    );
    System.assertEquals('Hip', PipelineUsageController.portfolioOf('ANZ HIP'));
    System.assertEquals(
      'Shoulder',
      PipelineUsageController.portfolioOf('IN SHOULDERS')
    );
    System.assertEquals(null, PipelineUsageController.portfolioOf('Master'));
  }

  @IsTest
  static void aPersonOnlyMayAddThePortfoliosOfTheirCountry() {
    PipelineUsageController.testCountry = 'AU';
    List<PipelineUsageController.AddOption> au = PipelineUsageController.addOptions();
    for (PipelineUsageController.AddOption o : au) {
      System.assert(
        o.recordType.startsWith('ANZ '),
        'An Australian is offered ANZ record types only: ' + o.recordType
      );
    }
    PipelineUsageController.testCountry = 'XX';
    System.assert(
      PipelineUsageController.addOptions().isEmpty(),
      'A country with no usage record types is offered nothing'
    );
  }

  @IsTest
  static void addingCreatesOneUsageWithTheRightRecordType() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    PipelineUsageController.Result r = PipelineUsageController.addUsage(
      s.deal.Id,
      s.hospital.Id,
      'Hip',
      lines('stems', 'ZB', 30)
    );
    System.assertEquals(false, r.existing);
    Usage__c u = [
      SELECT
        RecordType.DeveloperName,
        HCP2__c,
        Healthcare_Facility__c,
        CompanyHipStems__c,
        CasesPAHipStem__c
      FROM Usage__c
      WHERE Id = :r.usageId
    ];
    System.assertEquals('PrimaryTotalHip', u.RecordType.DeveloperName);
    System.assertEquals(s.surgeon.Id, u.HCP2__c);
    System.assertEquals(s.hospital.Id, u.Healthcare_Facility__c);
    System.assertEquals('ZB', u.CompanyHipStems__c);
    System.assertEquals(30, u.CasesPAHipStem__c);
  }

  @IsTest
  static void addingTheSameUsageAgainOpensTheExistingOne() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    PipelineUsageController.Result first = PipelineUsageController.addUsage(
      s.deal.Id,
      s.hospital.Id,
      'Hip',
      lines('stems', 'ZB', 30)
    );
    PipelineUsageController.Result again = PipelineUsageController.addUsage(
      s.deal.Id,
      s.hospital.Id,
      'Hip',
      lines('stems', 'ZB', 99)
    );
    System.assertEquals(true, again.existing);
    System.assertEquals(first.usageId, again.usageId);
    System.assertEquals(
      1,
      [SELECT COUNT() FROM Usage__c WHERE HCP2__c = :s.surgeon.Id],
      'No second usage for the same surgeon, hospital and portfolio'
    );
    System.assertEquals(
      30,
      [
        SELECT CasesPAHipStem__c
        FROM Usage__c
        WHERE Id = :first.usageId
      ]
      .CasesPAHipStem__c,
      'The existing usage is left as it was'
    );
    // another portfolio at the same hospital, or the same portfolio at another hospital, is allowed
    PipelineUsageController.addUsage(
      s.deal.Id,
      s.hospital.Id,
      'Knee',
      lines('knee', null, 10)
    );
    PipelineUsageController.addUsage(
      s.deal.Id,
      s.otherHospital.Id,
      'Hip',
      lines('stems', 'ZB', 5)
    );
    System.assertEquals(
      3,
      [SELECT COUNT() FROM Usage__c WHERE HCP2__c = :s.surgeon.Id]
    );
  }

  @IsTest
  static void addingNeedsAHospitalAndAnAllowedPortfolio() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    try {
      PipelineUsageController.addUsage(s.deal.Id, null, 'Hip', '[]');
      System.assert(false, 'A hospital is required');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    PipelineUsageController.testCountry = 'XX';
    try {
      PipelineUsageController.addUsage(s.deal.Id, s.hospital.Id, 'Hip', '[]');
      System.assert(false, 'No record type for that country');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void aLineIsEditedAndAUsageIsDeleted() {
    Setup s = make();
    Usage__c u = new Usage__c(
      RecordTypeId = rt(Usage__c.SObjectType, 'PrimaryTotalHip'),
      HCP2__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospital.Id,
      CompanyHipStems__c = 'ZB',
      CasesPAHipStem__c = 20
    );
    insert u;
    PipelineUsageController.saveUsage(u.Id, lines('cups', 'ZB', 12));
    Usage__c after = [
      SELECT CompanyHipStems__c, CompanyHipCups__c, CasesPAHipCup__c
      FROM Usage__c
      WHERE Id = :u.Id
    ];
    System.assertEquals('ZB', after.CompanyHipStems__c, 'Other lines stay');
    System.assertEquals('ZB', after.CompanyHipCups__c);
    System.assertEquals(12, after.CasesPAHipCup__c);
    try {
      PipelineUsageController.saveUsage(u.Id, lines('nope', 'ZB', 1));
      System.assert(false, 'An unknown product line is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    PipelineUsageController.deleteUsage(u.Id);
    System.assertEquals(0, [SELECT COUNT() FROM Usage__c WHERE Id = :u.Id]);
  }

  @IsTest
  static void theScreenGetsEmptyLinesForTheRestOfThePortfolio() {
    Setup s = make();
    insert new Usage__c(
      RecordTypeId = rt(Usage__c.SObjectType, 'PrimaryTotalHip'),
      HCP2__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospital.Id,
      CompanyHipStems__c = 'ZB',
      CasesPAHipStem__c = 20
    );
    PipelineSurgeonController.Usages u = PipelineSurgeonController.getUsages(
      s.deal.Id
    );
    System.assertEquals(2, u.lines.size(), 'Stems with data, cups empty');
    System.assertEquals('stems', u.lines[0].key);
    System.assertEquals(false, u.lines[0].empty);
    System.assertEquals('cups', u.lines[1].key);
    System.assertEquals(true, u.lines[1].empty);
    System.assertEquals(
      u.lines[0].usageId,
      u.lines[1].usageId,
      'Both lines belong to the one usage record'
    );
    System.assertEquals(s.hospital.Id, u.lines[0].hospitalId);
    System.assertEquals('ANZ HIP', u.lines[0].recordType);
    System.assertNotEquals(null, u.lines[0].recordTypeId);
  }
}

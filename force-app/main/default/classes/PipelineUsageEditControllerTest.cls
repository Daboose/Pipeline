/**
 * Tests for PipelineUsageEditController (saving and adding a whole usage for the usage tiles of the Usage card): the layout fields of
 * each portfolio, the mandatory fields, a usage never being a cup alone, multi-choice chips, and one usage per surgeon, hospital,
 * portfolio and company. Uses invented records only.
 */
@IsTest
private class PipelineUsageEditControllerTest {
  private static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  private static Account surgeon;
  private static Account hospital;

  private static void make() {
    surgeon = new Account(
      FirstName = 'Test',
      LastName = 'Surgeon',
      PersonMailingCountry = 'Australia',
      PersonMailingCountryCode = 'AU',
      PersonMailingState = 'New South Wales',
      PersonMailingStateCode = 'NSW',
      RecordTypeId = rt(Account.SObjectType, 'Physician')
    );
    insert surgeon;
    hospital = new Account(
      Name = 'Hospital A',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    insert hospital;
    PipelineUsageController.testCountry = 'AU';
  }

  private static String hipJson(String stemCompany) {
    return JSON.serialize(
      new Map<String, Object>{
        'CompanyHipStems__c' => stemCompany,
        'ProductHipStems__c' => stemCompany == 'ZB' ? 'Taperloc' : 'Exeter',
        'Hip_Stem_Type__c' => 'Cementless',
        'CasesPAHipStem__c' => 60,
        'CompanyHipCups__c' => 'ZB',
        'ProductHipCups__c' => 'Continuum',
        'HipBearingType__c' => 'Ceramic on Poly',
        'Procedure_Types__c' => new List<String>{ 'Total', 'Revision' },
        'Supporting_Technologies__c' => new List<String>{ 'ROSA', 'myMobility' }
      }
    );
  }

  @IsTest
  static void aHipIsAddedWithEveryFieldOfItsLayoutAndNeverTwiceForTheSameStemCompany() {
    make();
    PipelineUsageController.Result r = PipelineUsageEditController.add(
      surgeon.Id,
      hospital.Id,
      'Hip',
      hipJson('ZB')
    );
    System.assertEquals(false, r.existing);
    Usage__c u = [
      SELECT
        RecordType.DeveloperName,
        CompanyHipStems__c,
        ProductHipStems__c,
        Hip_Stem_Type__c,
        CasesPAHipStem__c,
        CompanyHipCups__c,
        ProductHipCups__c,
        CasesPAHipCup__c,
        HipBearingType__c,
        Procedure_Types__c,
        Supporting_Technologies__c
      FROM Usage__c
      WHERE Id = :r.usageId
    ];
    System.assertEquals('PrimaryTotalHip', u.RecordType.DeveloperName);
    System.assertEquals('ZB', u.CompanyHipStems__c);
    System.assertEquals('Cementless', u.Hip_Stem_Type__c);
    System.assertEquals(60, u.CasesPAHipStem__c);
    System.assertEquals('ZB', u.CompanyHipCups__c);
    System.assert(
      u.CasesPAHipCup__c == null || u.CasesPAHipCup__c == 0,
      'A cup has no cases of its own'
    );
    System.assertEquals('Total;Revision', u.Procedure_Types__c);
    System.assertEquals('ROSA;myMobility', u.Supporting_Technologies__c);
    PipelineUsageController.Result again = PipelineUsageEditController.add(
      surgeon.Id,
      hospital.Id,
      'Hip',
      hipJson('ZB')
    );
    System.assertEquals(
      true,
      again.existing,
      'The same stem company again returns the existing usage'
    );
    System.assertEquals(r.usageId, again.usageId);
    PipelineUsageController.Result rival = PipelineUsageEditController.add(
      surgeon.Id,
      hospital.Id,
      'Hip',
      hipJson('Stryker')
    );
    System.assertEquals(
      false,
      rival.existing,
      'Another stem company has its own usage'
    );
    System.assertEquals(
      2,
      [SELECT COUNT() FROM Usage__c WHERE HCP2__c = :surgeon.Id]
    );
  }

  @IsTest
  static void mandatoryFieldsAreRequiredAndAUsageCanNeverBeACupAlone() {
    make();
    String cupOnly = JSON.serialize(
      new Map<String, Object>{
        'CompanyHipCups__c' => 'ZB',
        'ProductHipCups__c' => 'Continuum'
      }
    );
    try {
      PipelineUsageEditController.add(surgeon.Id, hospital.Id, 'Hip', cupOnly);
      System.assert(false, 'A cup alone is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    String noType = JSON.serialize(
      new Map<String, Object>{
        'CompanyHipStems__c' => 'ZB',
        'ProductHipStems__c' => 'Taperloc',
        'CasesPAHipStem__c' => 10
      }
    );
    try {
      PipelineUsageEditController.add(surgeon.Id, hospital.Id, 'Hip', noType);
      System.assert(false, 'A hip without its stem type is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      PipelineUsageEditController.add(
        surgeon.Id,
        hospital.Id,
        'CMF',
        JSON.serialize(new Map<String, Object>{ 'Company_CMFT__c' => 'ZB' })
      );
      System.assert(
        false,
        'A CMFT without its segment, product and cases is refused'
      );
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    System.assertEquals(
      0,
      [SELECT COUNT() FROM Usage__c WHERE HCP2__c = :surgeon.Id]
    );
  }

  @IsTest
  static void kneeShouldersAndCmftAreAddedAndShouldersNeedNothing() {
    make();
    PipelineUsageController.Result knee = PipelineUsageEditController.add(
      surgeon.Id,
      hospital.Id,
      'Knee',
      JSON.serialize(
        new Map<String, Object>{
          'CompanyTotalKnee__c' => 'Depuy',
          'ProductTotalKnee__c' => 'Attune',
          'CasesPATotalKnee__c' => '40',
          'Procedure_Types__c' => new List<String>{ 'Total' }
        }
      )
    );
    System.assertEquals(
      40,
      [SELECT CasesPATotalKnee__c FROM Usage__c WHERE Id = :knee.usageId]
      .CasesPATotalKnee__c
    );
    PipelineUsageController.Result sh = PipelineUsageEditController.add(
      surgeon.Id,
      hospital.Id,
      'Shoulder',
      JSON.serialize(
        new Map<String, Object>{
          'CompanyReverse__c' => 'Depuy',
          'ProductReverse__c' => 'Delta Xtend',
          'CasesPAReverse__c' => 15
        }
      )
    );
    System.assertEquals(
      'Depuy',
      [SELECT CompanyReverse__c FROM Usage__c WHERE Id = :sh.usageId]
      .CompanyReverse__c
    );
    PipelineUsageController.Result cmft = PipelineUsageEditController.add(
      surgeon.Id,
      hospital.Id,
      'CMF',
      JSON.serialize(
        new Map<String, Object>{
          'SegmentCMFT__c' => 'Thoracic',
          'Company_CMFT__c' => 'ZB',
          'Product_CMFT__c' => 'RibFix Blu',
          'Cases_PA_CMFT__c' => 30
        }
      )
    );
    System.assertEquals(
      'Thoracic',
      [SELECT SegmentCMFT__c FROM Usage__c WHERE Id = :cmft.usageId]
      .SegmentCMFT__c
    );
    try {
      PipelineUsageEditController.add(
        surgeon.Id,
        hospital.Id,
        'CMF',
        JSON.serialize(
          new Map<String, Object>{
            'SegmentCMFT__c' => 'Thoracic',
            'Company_CMFT__c' => 'ZB',
            'Product_CMFT__c' => 'RibFix Blu',
            'Cases_PA_CMFT__c' => 30,
            'Procedure_Types__c' => new List<String>{ 'Total' }
          }
        )
      );
      System.assert(false, 'A CMFT usage has no procedure types');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void saveChangesWholeFieldsClearsChipsAndRefusesAnEmptyMandatoryField() {
    make();
    PipelineUsageController.Result r = PipelineUsageEditController.add(
      surgeon.Id,
      hospital.Id,
      'Hip',
      hipJson('ZB')
    );
    PipelineUsageEditController.save(
      r.usageId,
      JSON.serialize(
        new Map<String, Object>{
          'ProductHipStems__c' => 'CLS',
          'CasesPAHipStem__c' => 75,
          'CompanyHipCups__c' => null,
          'ProductHipCups__c' => null,
          'Supporting_Technologies__c' => new List<String>()
        }
      )
    );
    Usage__c u = [
      SELECT
        ProductHipStems__c,
        CasesPAHipStem__c,
        CompanyHipCups__c,
        Supporting_Technologies__c,
        Procedure_Types__c
      FROM Usage__c
      WHERE Id = :r.usageId
    ];
    System.assertEquals('CLS', u.ProductHipStems__c);
    System.assertEquals(75, u.CasesPAHipStem__c);
    System.assertEquals(null, u.CompanyHipCups__c);
    System.assertEquals(
      null,
      u.Supporting_Technologies__c,
      'A cleared chip list empties the field'
    );
    System.assertEquals(
      'Total;Revision',
      u.Procedure_Types__c,
      'Fields not sent are untouched'
    );
    try {
      PipelineUsageEditController.save(
        r.usageId,
        JSON.serialize(new Map<String, Object>{ 'CompanyHipStems__c' => '' })
      );
      System.assert(false, 'Emptying the stem company is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      PipelineUsageEditController.save(
        r.usageId,
        JSON.serialize(
          new Map<String, Object>{ 'CompanyTotalKnee__c' => 'Depuy' }
        )
      );
      System.assert(false, 'A knee field on a hip is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      PipelineUsageEditController.save(r.usageId, 'not json');
      System.assert(false, 'Unreadable text is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    System.assertEquals(
      'ZB',
      [SELECT CompanyHipStems__c FROM Usage__c WHERE Id = :r.usageId]
      .CompanyHipStems__c
    );
  }

  @IsTest
  static void addingIsRefusedWithNoHospitalNoSurgeonUnknownPortfolioOrNoRecordType() {
    make();
    try {
      PipelineUsageEditController.add(surgeon.Id, null, 'Hip', hipJson('ZB'));
      System.assert(false, 'No hospital is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      PipelineUsageEditController.add(
        hospital.Id,
        hospital.Id,
        'Hip',
        hipJson('ZB')
      );
      System.assert(false, 'A hospital is not a surgeon');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      PipelineUsageEditController.add(
        surgeon.Id,
        hospital.Id,
        'Ankle',
        hipJson('ZB')
      );
      System.assert(false, 'An unknown portfolio is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    PipelineUsageController.testCountry = 'XX';
    try {
      PipelineUsageEditController.add(
        surgeon.Id,
        hospital.Id,
        'Hip',
        hipJson('ZB')
      );
      System.assert(false, 'A country with no record type is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }
}

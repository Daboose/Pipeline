/**
 * Tests for PipelineUsageCardController (the Usage card on an Account record page: the surgeon view, the hospital view, the
 * MyCase gate, taking a line off a usage, and adding a usage). Uses invented records only.
 */
@IsTest
private class PipelineUsageCardControllerTest {
  private static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  private class Setup {
    Account surgeon;
    Account other;
    Account hospital;
  }

  private static Account person(String last) {
    return new Account(
      FirstName = 'Test',
      LastName = last,
      PersonMailingCountry = 'Australia',
      PersonMailingCountryCode = 'AU',
      PersonMailingState = 'New South Wales',
      PersonMailingStateCode = 'NSW',
      RecordTypeId = rt(Account.SObjectType, 'Physician')
    );
  }

  private static Setup make() {
    Setup s = new Setup();
    s.surgeon = person('Surgeon');
    s.other = person('Other');
    insert new List<Account>{ s.surgeon, s.other };
    s.hospital = new Account(
      Name = 'Hospital A',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    insert s.hospital;
    return s;
  }

  private static Usage__c hipUsage(
    Setup s,
    Id surgeon,
    String company,
    Decimal stems,
    Decimal cups
  ) {
    Usage__c u = new Usage__c(
      RecordTypeId = rt(Usage__c.SObjectType, 'PrimaryTotalHip'),
      HCP2__c = surgeon,
      Healthcare_Facility__c = s.hospital.Id,
      CompanyHipStems__c = stems == null ? null : company,
      CasesPAHipStem__c = stems,
      CompanyHipCups__c = cups == null ? null : company,
      CasesPAHipCup__c = cups
    );
    insert u;
    return u;
  }

  /** A surgery in the last 12 months, with or without a usage item. */
  private static void surgery(
    Setup s,
    Id surgeon,
    String type,
    String procedure,
    Boolean withItem,
    Integer daysBack
  ) {
    Case__c c = new Case__c(
      Physician__c = surgeon,
      Surgery_Date__c = Date.today().addDays(-daysBack),
      Surgery_Type__c = type,
      Procedure__c = procedure,
      Healthcare_Facility__c = s.hospital.Id
    );
    insert c;
    if (withItem) {
      myCase_Usage__c sheet = new myCase_Usage__c(
        Case__c = c.Id,
        ManualSheet__c = true,
        Total_Qty_ZB_Implants__c = 1
      );
      insert sheet;
      insert new myCase_Usage_Item__c(Usage_Sheet_ID__c = sheet.Id);
    }
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
  static void theSurgeonCardHasRatingsLinesAndBookings() {
    Setup s = make();
    hipUsage(s, s.surgeon.Id, 'ZB', 20, null);
    surgery(s, s.surgeon.Id, '201', 'A00', true, 30); // hip primary
    surgery(s, s.surgeon.Id, '201', 'A00', true, 10); // hip primary, the latest
    surgery(s, s.surgeon.Id, '201', 'A01', true, 60); // hip revision
    surgery(s, s.surgeon.Id, '201', 'Z02', true, 20); // demo: left out
    surgery(s, s.surgeon.Id, '201', 'A00', false, 20); // no usage item: left out
    surgery(s, s.surgeon.Id, '209', 'A01', true, 40); // CMFT is never a revision
    surgery(s, s.surgeon.Id, '201', 'A00', true, 400); // older than 12 months: left out
    PipelineUsageCardController.Card c = PipelineUsageCardController.getCard(
      s.surgeon.Id
    );
    System.assertEquals(true, c.isPerson);
    System.assertEquals(true, c.canMyCase);
    System.assertEquals(4, c.ratings.size(), 'Hip, Knee, Shoulder, CMF');
    System.assertEquals('Hip', c.ratings[0].area);
    System.assertNotEquals(null, c.newest);
    System.assertEquals(
      2,
      c.lines.size(),
      'Stems with data, cups empty (the rest of the hip portfolio)'
    );
    System.assertEquals('stems', c.lines[0].key);
    System.assertEquals(false, c.lines[0].empty);
    System.assertEquals('ZB', c.lines[0].company);
    System.assertEquals('cups', c.lines[1].key);
    System.assertEquals(true, c.lines[1].empty);
    System.assertEquals(4, c.bookings.size());
    System.assertEquals('Hip', c.bookings[0].type);
    System.assertEquals(2, c.bookings[0].primary);
    System.assertEquals(1, c.bookings[0].revision);
    System.assertEquals(Date.today().addDays(-10), c.bookings[0].latest);
    System.assertEquals('CMFT', c.bookings[3].type);
    System.assertEquals(1, c.bookings[3].primary);
    System.assertEquals(0, c.bookings[3].revision, 'CMFT has no revision');
    System.assertEquals(
      0,
      c.bookings[1].primary + c.bookings[1].revision,
      'Knee has none'
    );
  }

  @IsTest
  static void aPersonWithoutMyCaseAccessGetsNoMyCaseAndNoError() {
    Setup s = make();
    hipUsage(s, s.surgeon.Id, 'ZB', 20, null);
    surgery(s, s.surgeon.Id, '201', 'A00', true, 30);
    PipelineUsageCardController.testNoMyCase = true;
    PipelineUsageCardController.Card c = PipelineUsageCardController.getCard(
      s.surgeon.Id
    );
    System.assertEquals(false, c.canMyCase);
    System.assertEquals(
      0,
      c.bookings.size(),
      'MyCase is never read for this person'
    );
    System.assertEquals(2, c.lines.size(), 'The usages still show');
    PipelineUsageCardController.Card h = PipelineUsageCardController.getCard(
      s.hospital.Id
    );
    System.assertEquals(false, h.canMyCase);
    System.assertEquals(1, h.surgeons.size());
    System.assertEquals(
      0,
      h.surgeons[0].mycase[0],
      'No MyCase cases on the hospital either'
    );
  }

  @IsTest
  static void theHospitalCardTotalsCasesBySurgeonAndType() {
    Setup s = make();
    hipUsage(s, s.surgeon.Id, 'ZB', 60, 55);
    hipUsage(s, s.other.Id, 'Stryker', 30, null);
    insert new Usage__c(
      RecordTypeId = rt(Usage__c.SObjectType, 'PrimaryTotalKnee'),
      HCP2__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospital.Id,
      CompanyTotalKnee__c = 'Stryker',
      CasesPATotalKnee__c = 40
    );
    surgery(s, s.surgeon.Id, '201', 'A00', true, 30);
    surgery(s, s.surgeon.Id, '201', 'A00', true, 31);
    surgery(s, s.surgeon.Id, '202', 'A00', true, 32);
    surgery(s, s.other.Id, '201', 'A00', true, 33);
    PipelineUsageCardController.Card c = PipelineUsageCardController.getCard(
      s.hospital.Id
    );
    System.assertEquals(false, c.isPerson);
    System.assertEquals(0, c.ratings.size(), 'A hospital has no ratings');
    System.assertEquals(2, c.surgeons.size());
    PipelineUsageCardController.SurgeonRow mine;
    PipelineUsageCardController.SurgeonRow theirs;
    for (PipelineUsageCardController.SurgeonRow r : c.surgeons) {
      if (r.id == s.surgeon.Id) {
        mine = r;
      } else {
        theirs = r;
      }
    }
    System.assertEquals(
      115,
      mine.zb[0],
      'Stems and cups for ZB added together'
    );
    System.assertEquals(0, mine.other[0]);
    System.assertEquals(40, mine.other[1], 'Knee for another company');
    System.assertEquals(2, mine.mycase[0]);
    System.assertEquals(1, mine.mycase[1]);
    System.assertEquals(30, theirs.other[0]);
    System.assertEquals(1, theirs.mycase[0]);
    System.assertEquals(0, theirs.zb[0]);
  }

  @IsTest
  static void takingLinesOffAUsageDeletesItWhenNothingIsLeft() {
    Setup s = make();
    Usage__c u = hipUsage(s, s.surgeon.Id, 'ZB', 20, 12);
    PipelineUsageCardController.deleteLine(u.Id, 'stems');
    Usage__c after = [
      SELECT
        CompanyHipStems__c,
        CasesPAHipStem__c,
        CompanyHipCups__c,
        CasesPAHipCup__c
      FROM Usage__c
      WHERE Id = :u.Id
    ];
    System.assertEquals(null, after.CompanyHipStems__c);
    System.assertEquals(0, after.CasesPAHipStem__c);
    System.assertEquals('ZB', after.CompanyHipCups__c, 'The other line stays');
    PipelineUsageCardController.deleteLine(u.Id, 'cups');
    System.assertEquals(
      0,
      [SELECT COUNT() FROM Usage__c WHERE Id = :u.Id],
      'Nothing left: the usage is deleted'
    );
    try {
      PipelineUsageCardController.deleteLine(u.Id, 'nope');
      System.assert(false, 'An unknown product line is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void addingAUsageForASurgeonAndNeverTwiceForTheSameCompany() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    PipelineUsageController.Result r = PipelineUsageCardController.addUsageFor(
      s.surgeon.Id,
      s.hospital.Id,
      'Hip',
      lines('stems', 'ZB', 15)
    );
    System.assertEquals(false, r.existing);
    Usage__c u = [
      SELECT
        RecordType.DeveloperName,
        HCP2__c,
        CompanyHipStems__c,
        CasesPAHipStem__c
      FROM Usage__c
      WHERE Id = :r.usageId
    ];
    System.assertEquals('PrimaryTotalHip', u.RecordType.DeveloperName);
    System.assertEquals(s.surgeon.Id, u.HCP2__c);
    System.assertEquals('ZB', u.CompanyHipStems__c);
    PipelineUsageController.Result again = PipelineUsageCardController.addUsageFor(
      s.surgeon.Id,
      s.hospital.Id,
      'Hip',
      lines('stems', 'ZB', 99)
    );
    System.assertEquals(
      true,
      again.existing,
      'The same company again returns the existing usage'
    );
    System.assertEquals(r.usageId, again.usageId);
    PipelineUsageController.Result rival = PipelineUsageCardController.addUsageFor(
      s.surgeon.Id,
      s.hospital.Id,
      'Hip',
      lines('stems', 'Stryker', 10)
    );
    System.assertEquals(
      false,
      rival.existing,
      'Another company has its own usage'
    );
    System.assertEquals(
      2,
      [SELECT COUNT() FROM Usage__c WHERE HCP2__c = :s.surgeon.Id]
    );
  }

  @IsTest
  static void addingIsRefusedWithNoHospitalNoSurgeonOrNoRecordType() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    try {
      PipelineUsageCardController.addUsageFor(
        s.surgeon.Id,
        null,
        'Hip',
        lines('stems', 'ZB', 1)
      );
      System.assert(false, 'No hospital is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      PipelineUsageCardController.addUsageFor(
        s.hospital.Id,
        s.hospital.Id,
        'Hip',
        lines('stems', 'ZB', 1)
      );
      System.assert(false, 'A hospital is not a surgeon');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    PipelineUsageController.testCountry = 'XX';
    try {
      PipelineUsageCardController.addUsageFor(
        s.surgeon.Id,
        s.hospital.Id,
        'Hip',
        lines('stems', 'ZB', 1)
      );
      System.assert(false, 'A country with no record type is refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      PipelineUsageCardController.addUsageFor(
        s.surgeon.Id,
        s.hospital.Id,
        'Hip',
        'not json'
      );
      System.assert(false, 'Unreadable lines are refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }
}

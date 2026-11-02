/**
 * Tests for PipelineBookingsController (the My Case Bookings panel: bookings by month, primary and revision, hospital, the
 * usages check, and creating or adjusting ZB usages from the bookings). Uses invented records only.
 */
@IsTest
private class PipelineBookingsControllerTest {
  private static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  private class Setup {
    Account surgeon;
    Account hospitalA;
    Account hospitalB;
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
    s.hospitalA = new Account(
      Name = 'Hospital A',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    s.hospitalB = new Account(
      Name = 'Hospital B',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    insert new List<Account>{ s.hospitalA, s.hospitalB };
    s.deal = new SalesRisks__c(
      RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
      Account__c = s.surgeon.Id,
      Stage__c = 'Plan',
      Expected_Closure_Quarter__c = 'Q4'
    );
    insert s.deal;
    return s;
  }

  /** A surgery in the last whole month (so it falls in the last of the 12 columns), with or without a usage item. */
  private static Case__c surgery(
    Setup s,
    String anatomy,
    String procedure,
    Id hospital,
    Boolean withItem,
    Integer monthsBack
  ) {
    Date day = Date.today().toStartOfMonth().addMonths(-monthsBack).addDays(4);
    Case__c c = new Case__c(
      Physician__c = s.surgeon.Id,
      Surgery_Date__c = day,
      Surgery_Type__c = anatomy,
      Procedure__c = procedure,
      Healthcare_Facility__c = hospital
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
    return c;
  }

  @IsTest
  static void bookingsAreCountedByMonthPrimaryRevisionAndHospital() {
    Setup s = make();
    surgery(s, '201', 'A00', s.hospitalA.Id, true, 1); // hip primary, last month
    surgery(s, '201', 'A00', s.hospitalA.Id, true, 1);
    surgery(s, '201', 'A01', s.hospitalB.Id, true, 3); // hip revision, 3 months back
    surgery(s, '201', 'Z02', s.hospitalA.Id, true, 1); // demo: left out
    surgery(s, '201', 'A00', s.hospitalA.Id, false, 1); // no usage item: left out
    surgery(s, '209', 'A01', s.hospitalA.Id, true, 2); // CMFT is never a revision
    PipelineBookingsController.Bookings b = PipelineBookingsController.getBookings(
      s.deal.Id
    );
    System.assertEquals(2, b.types.size(), 'Hip and CMFT only');
    PipelineBookingsController.BookingType hip = b.types[0];
    System.assertEquals('Hip', hip.name);
    System.assertEquals(true, hip.split);
    System.assertEquals(12, hip.primary.size());
    System.assertEquals(
      2,
      hip.primary[11],
      'Last whole month is the last column'
    );
    System.assertEquals(1, hip.revision[9], 'Three months back is column 9');
    System.assertEquals(3, hip.booked);
    System.assertEquals(2, hip.hospitals.size());
    System.assertEquals('Hospital A', hip.hospitals[0].name, 'Busiest first');
    System.assertEquals(2, hip.hospitals[0].count);
    PipelineBookingsController.BookingType cmft = b.types[1];
    System.assertEquals('CMFT', cmft.name);
    System.assertEquals(false, cmft.split);
    System.assertEquals(1, cmft.primary[10]);
    System.assertEquals(0, cmft.revision[10], 'CMFT has no revision');
    System.assertEquals('none', hip.usage, 'No usages yet');
    System.assertEquals(true, b.noUsagesAtAll);
  }

  @IsTest
  static void usageStateSaysZbCompetitorOrNone() {
    Setup s = make();
    surgery(s, '202', 'A00', s.hospitalA.Id, true, 1);
    insert new Usage__c(
      RecordTypeId = rt(Usage__c.SObjectType, 'PrimaryTotalKnee'),
      HCP2__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospitalA.Id,
      CompanyTotalKnee__c = 'Stryker',
      CasesPATotalKnee__c = 40
    );
    PipelineBookingsController.Bookings b = PipelineBookingsController.getBookings(
      s.deal.Id
    );
    System.assertEquals('competitor', b.types[0].usage);
    System.assertEquals(false, b.noUsagesAtAll);
    System.assertEquals(
      80,
      PipelineBookingsController.zbOf(
        new Usage__c(
          CompanyHipStems__c = 'ZB',
          CasesPAHipStem__c = 80,
          CompanyHipCups__c = 'ZB',
          CasesPAHipCup__c = 60
        ),
        'Hip'
      ),
      'A hip case uses a stem and a cup, so the larger of the two'
    );
  }

  @IsTest
  static void creatingUsagesFromBookingsMakesOneZbUsagePerHospital() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    surgery(s, '201', 'A00', s.hospitalA.Id, true, 1);
    surgery(s, '201', 'A00', s.hospitalA.Id, true, 2);
    surgery(s, '201', 'A01', s.hospitalB.Id, true, 3);
    PipelineBookingsController.Result r = PipelineBookingsController.createFromBookings(
      s.deal.Id,
      'Hip'
    );
    System.assertEquals(2, r.created);
    System.assertEquals(3, r.total);
    List<Usage__c> made = [
      SELECT
        RecordType.DeveloperName,
        Healthcare_Facility__c,
        CompanyHipStems__c,
        CasesPAHipStem__c,
        CompanyHipCups__c,
        CasesPAHipCup__c
      FROM Usage__c
      WHERE HCP2__c = :s.surgeon.Id
    ];
    System.assertEquals(2, made.size());
    for (Usage__c u : made) {
      System.assertEquals('PrimaryTotalHip', u.RecordType.DeveloperName);
      System.assertEquals('ZB', u.CompanyHipStems__c);
      System.assertEquals('ZB', u.CompanyHipCups__c);
      System.assertEquals(u.CasesPAHipStem__c, u.CasesPAHipCup__c);
    }
    PipelineBookingsController.Bookings b = PipelineBookingsController.getBookings(
      s.deal.Id
    );
    System.assertEquals('zb', b.types[0].usage);
    System.assertEquals(
      3,
      b.types[0].zb,
      'The usages now say what the bookings say'
    );
  }

  @IsTest
  static void adjustingChangesZbUsagesAndLeavesCompetitorsAlone() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    surgery(s, '201', 'A00', s.hospitalA.Id, true, 1);
    surgery(s, '201', 'A00', s.hospitalA.Id, true, 2);
    Id hipRt = rt(Usage__c.SObjectType, 'PrimaryTotalHip');
    insert new Usage__c(
      RecordTypeId = hipRt,
      HCP2__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospitalA.Id,
      CompanyHipStems__c = 'ZB',
      CasesPAHipStem__c = 50,
      CompanyHipCups__c = 'Stryker',
      CasesPAHipCup__c = 50
    );
    // a ZB usage at a hospital with no bookings is brought down to nothing
    insert new Usage__c(
      RecordTypeId = hipRt,
      HCP2__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospitalB.Id,
      CompanyHipStems__c = 'ZB',
      CasesPAHipStem__c = 10
    );
    PipelineBookingsController.Result r = PipelineBookingsController.adjustToBookings(
      s.deal.Id,
      'Hip'
    );
    System.assertEquals(
      1,
      r.skipped,
      'The Stryker cups line is a competitor and is left alone'
    );
    Usage__c a = [
      SELECT CasesPAHipStem__c, CompanyHipCups__c, CasesPAHipCup__c
      FROM Usage__c
      WHERE HCP2__c = :s.surgeon.Id AND Healthcare_Facility__c = :s.hospitalA.Id
    ];
    System.assertEquals(2, a.CasesPAHipStem__c);
    System.assertEquals('Stryker', a.CompanyHipCups__c);
    System.assertEquals(50, a.CasesPAHipCup__c);
    Usage__c b = [
      SELECT CasesPAHipStem__c
      FROM Usage__c
      WHERE HCP2__c = :s.surgeon.Id AND Healthcare_Facility__c = :s.hospitalB.Id
    ];
    System.assertEquals(0, b.CasesPAHipStem__c);
  }

  @IsTest
  static void aKneeUsageIsMadeWithZbOnTheKneeRecordType() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    surgery(s, '202', 'A00', s.hospitalA.Id, true, 1);
    surgery(s, '202', 'A01', s.hospitalA.Id, true, 2);
    PipelineBookingsController.Result r = PipelineBookingsController.createFromBookings(
      s.deal.Id,
      'Knee'
    );
    System.assertEquals(1, r.created);
    Usage__c u = [
      SELECT RecordType.DeveloperName, CompanyTotalKnee__c, CasesPATotalKnee__c
      FROM Usage__c
      WHERE HCP2__c = :s.surgeon.Id
    ];
    System.assertEquals('PrimaryTotalKnee', u.RecordType.DeveloperName);
    System.assertEquals('ZB', u.CompanyTotalKnee__c);
    System.assertEquals(2, u.CasesPATotalKnee__c);
  }

  @IsTest
  static void shoulderIsNeverMadeAutomaticallyAndNeedsBookings() {
    Setup s = make();
    PipelineUsageController.testCountry = 'AU';
    surgery(s, '205', 'A00', s.hospitalA.Id, true, 1);
    try {
      PipelineBookingsController.createFromBookings(s.deal.Id, 'Shoulder');
      System.assert(false, 'Shoulder is refused');
    } catch (AuraHandledException e) {
      System.assert(e.getMessage().contains('anatomical and reverse'));
    }
    PipelineBookingsController.Bookings b = PipelineBookingsController.getBookings(
      s.deal.Id
    );
    System.assertEquals(false, b.types[0].canAuto);
    try {
      PipelineBookingsController.createFromBookings(s.deal.Id, 'Knee');
      System.assert(false, 'No knee bookings');
    } catch (AuraHandledException e) {
      System.assert(e.getMessage().contains('no bookings'));
    }
  }

  @IsTest
  static void badgesGiveTheBookingsAndTheNewestUsageChange() {
    Setup s = make();
    surgery(s, '202', 'A00', s.hospitalA.Id, true, 1);
    PipelineBookingsController.Badges none = PipelineBookingsController.getBadges(
      s.deal.Id
    );
    System.assertEquals(1, none.booked);
    System.assertEquals(false, none.hasUsages);
    insert new Usage__c(
      RecordTypeId = rt(Usage__c.SObjectType, 'PrimaryTotalKnee'),
      HCP2__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospitalA.Id,
      CompanyTotalKnee__c = 'Stryker',
      CasesPATotalKnee__c = 5
    );
    PipelineBookingsController.Badges some = PipelineBookingsController.getBadges(
      s.deal.Id
    );
    System.assertEquals(true, some.hasUsages);
    System.assertNotEquals(null, some.usagesNewest);
  }
}

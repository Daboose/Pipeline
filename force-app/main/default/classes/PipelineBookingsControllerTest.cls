/**
 * Tests for PipelineBookingsController (the My Case Bookings panel: bookings by month, primary and revision, and by
 * hospital; and the bottom-bar badges). Uses invented records only.
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
      PersonMailingState = 'New South Wales',
      PersonMailingStateCode = 'NSW',
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
    System.assertEquals(2, hip.rows.size());
    System.assertEquals('Hospital A', hip.rows[0].name, 'Busiest first');
    System.assertEquals(2, hip.rows[0].booked);
    System.assertEquals(
      2,
      hip.rows[0].primary[11],
      'Each hospital has its own months'
    );
    System.assertEquals(0, hip.rows[0].revision[9]);
    System.assertEquals(1, hip.rows[1].revision[9]);
    PipelineBookingsController.BookingType cmft = b.types[1];
    System.assertEquals('CMFT', cmft.name);
    System.assertEquals(false, cmft.split);
    System.assertEquals(1, cmft.primary[10]);
    System.assertEquals(0, cmft.revision[10], 'CMFT has no revision');
  }

  @IsTest
  static void surgeriesWithNoHospitalFormTheirOwnRow() {
    Setup s = make();
    surgery(s, '202', 'A00', s.hospitalA.Id, true, 1);
    surgery(s, '202', 'A00', null, true, 2);
    PipelineBookingsController.BookingType knee = PipelineBookingsController.getBookings(
        s.deal.Id
      )
      .types[0];
    System.assertEquals(2, knee.rows.size());
    Boolean found = false;
    for (PipelineBookingsController.HospitalRow r : knee.rows) {
      if (r.id == null) {
        found = true;
        System.assertEquals('No hospital recorded', r.name);
        System.assertEquals(1, r.booked);
      }
    }
    System.assert(found, 'A row for the surgeries with no hospital');
  }

  @IsTest
  static void aSurgeonWithNoSurgeriesHasNoTypes() {
    Setup s = make();
    PipelineBookingsController.Bookings b = PipelineBookingsController.getBookings(
      s.deal.Id
    );
    System.assertEquals(s.surgeon.Id, b.surgeonId);
    System.assertEquals(0, b.types.size());
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

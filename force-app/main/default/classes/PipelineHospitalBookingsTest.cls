/**
 * Tests for PipelineBookingsController.getHospitalBookings (ROSA deals: the hospital's MyCase bookings by month and type of
 * surgery, for the last 12 whole months). Uses invented records only. The deal is a normal deal record type with a Healthcare
 * Facility: the method reads only that field, so the record type does not matter.
 */
@IsTest
private class PipelineHospitalBookingsTest {
  private static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  private class Setup {
    Account surgeon;
    Account hospital;
    Account other;
    SalesRisks__c deal;
  }

  private static Account hospitalNamed(String name) {
    return new Account(
      Name = name,
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
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
    s.hospital = hospitalNamed('Hospital A');
    s.other = hospitalNamed('Hospital B');
    insert new List<Account>{ s.hospital, s.other };
    s.deal = new SalesRisks__c(
      RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
      Account__c = s.surgeon.Id,
      Healthcare_Facility__c = s.hospital.Id,
      Stage__c = 'Plan',
      Expected_Closure_Quarter__c = 'Q4'
    );
    insert s.deal;
    return s;
  }

  /**
   * The surgeries to make are queued and inserted together by flush(): one insert for all the cases, one for their usage sheets and one
   * for the usage items. Inserting them one at a time ran the mycase automations (such as the "mycase - Update Sales Agent Details" flow)
   * once per record, which exceeded PROD's limits when the tests were validated there (Robert, 2026-11-19). Call flush() before reading.
   */
  private static List<Case__c> queued = new List<Case__c>();
  private static List<Boolean> queuedItem = new List<Boolean>();

  private static void flush() {
    if (queued.isEmpty()) {
      return;
    }
    insert queued;
    List<myCase_Usage__c> sheets = new List<myCase_Usage__c>();
    for (Integer i = 0; i < queued.size(); i++) {
      if (queuedItem[i]) {
        sheets.add(
          new myCase_Usage__c(
            Case__c = queued[i].Id,
            ManualSheet__c = true,
            Total_Qty_ZB_Implants__c = 1
          )
        );
      }
    }
    if (!sheets.isEmpty()) {
      insert sheets;
      List<myCase_Usage_Item__c> items = new List<myCase_Usage_Item__c>();
      for (myCase_Usage__c sheet : sheets) {
        items.add(new myCase_Usage_Item__c(Usage_Sheet_ID__c = sheet.Id));
      }
      insert items;
    }
    queued.clear();
    queuedItem.clear();
  }

  /** A surgery `monthsBack` months before this month (1 is the last whole month, the last of the 12 columns); queued, flush() makes it. */
  private static void surgery(
    Setup s,
    String anatomy,
    String procedure,
    Id hospital,
    Boolean withItem,
    Integer monthsBack
  ) {
    Date day = Date.today().toStartOfMonth().addMonths(-monthsBack).addDays(4);
    queued.add(
      new Case__c(
        Physician__c = s.surgeon.Id,
        Surgery_Date__c = day,
        Surgery_Type__c = anatomy,
        Procedure__c = procedure,
        Healthcare_Facility__c = hospital
      )
    );
    queuedItem.add(withItem);
  }

  @IsTest
  static void casesAreCountedByMonthAndTypeForTheDealsHospital() {
    Setup s = make();
    surgery(s, '201', 'A00', s.hospital.Id, true, 1); // hip, last whole month
    surgery(s, '201', 'A01', s.hospital.Id, true, 1); // hip revision: still a case
    surgery(s, '202', 'A00', s.hospital.Id, true, 12); // knee, the first of the 12 months
    surgery(s, '205', 'A00', s.hospital.Id, true, 6); // shoulder
    surgery(s, '209', 'A01', s.hospital.Id, true, 3); // CMFT
    surgery(s, '201', 'A00', s.other.Id, true, 1); // another hospital: left out
    flush();
    PipelineBookingsController.HospitalBookings h = PipelineBookingsController.getHospitalBookings(
      s.deal.Id
    );
    System.assertEquals(s.hospital.Id, h.hospitalId);
    System.assertEquals('Hospital A', h.hospitalName);
    System.assertEquals(
      Date.today().toStartOfMonth().addMonths(-12),
      h.windowStart
    );
    System.assertEquals(Date.today().toStartOfMonth().addDays(-1), h.windowEnd);
    System.assertEquals(true, h.hasBookings);
    System.assertEquals(5, h.booked);
    System.assertEquals(4, h.types.size(), 'Always the four types');
    System.assertEquals('Hip', h.types[0].name);
    System.assertEquals('Knee', h.types[1].name);
    System.assertEquals('Shoulder', h.types[2].name);
    System.assertEquals('CMFT', h.types[3].name);
    System.assertEquals(12, h.types[0].months.size());
    System.assertEquals(
      2,
      h.types[0].months[11],
      'Primary and revision both count'
    );
    System.assertEquals(2, h.types[0].booked);
    System.assertEquals(
      1,
      h.types[1].months[0],
      'Twelve months back is column 0'
    );
    System.assertEquals(1, h.types[2].months[6]);
    System.assertEquals(1, h.types[3].months[9]);
  }

  @IsTest
  static void whatTheSurgeonRulesLeaveOutIsLeftOutHere() {
    Setup s = make();
    surgery(s, '201', 'Z02', s.hospital.Id, true, 1); // demo
    surgery(s, '201', 'A00', s.hospital.Id, false, 1); // no usage item
    surgery(s, '201', 'A00', s.hospital.Id, true, 13); // before the window
    surgery(s, '201', 'A00', s.hospital.Id, true, 0); // this month is not a whole month
    flush();
    PipelineBookingsController.HospitalBookings h = PipelineBookingsController.getHospitalBookings(
      s.deal.Id
    );
    System.assertEquals('Hospital A', h.hospitalName);
    System.assertEquals(false, h.hasBookings);
    System.assertEquals(0, h.booked);
    System.assertEquals(4, h.types.size());
    System.assertEquals(0, h.types[0].booked);
    System.assertEquals(0, h.types[0].months[11]);
    System.assertEquals(0, h.types[0].months[0]);
  }

  @IsTest
  static void aDealWithNoHospitalGivesNoHospitalAndNoError() {
    Setup s = make();
    s.deal.Healthcare_Facility__c = null;
    update s.deal;
    PipelineBookingsController.HospitalBookings h = PipelineBookingsController.getHospitalBookings(
      s.deal.Id
    );
    System.assertEquals(null, h.hospitalId);
    System.assertEquals(null, h.hospitalName);
    System.assertEquals(false, h.hasBookings);
    System.assertEquals(4, h.types.size());
    System.assertEquals(
      Date.today().toStartOfMonth().addMonths(-12),
      h.windowStart
    );
  }
}

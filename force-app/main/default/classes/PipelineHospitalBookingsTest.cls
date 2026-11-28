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

  /**
   * A surgery in the column `monthsBack` from the end (Robert, 2026-11-28: the 12 columns end with the current month, up to today): 1 is the
   * first day of this month (the last column), 12 the first column, 13 before the window, 0 next month (not yet happened). Queued; flush() makes it.
   */
  private static void surgery(
    Setup s,
    String anatomy,
    String procedure,
    Id hospital,
    Boolean withItem,
    Integer monthsBack
  ) {
    Date day = Date.today().toStartOfMonth().addMonths(1 - monthsBack);
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
      Date.today().toStartOfMonth().addMonths(-11),
      h.windowStart
    );
    System.assertEquals(Date.today(), h.windowEnd);
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
  static void whatTheRulesLeaveOutIsLeftOutHere() {
    Setup s = make();
    surgery(s, '201', 'Z02', s.hospital.Id, false, 1); // demo with no usage item
    surgery(s, '201', 'A00', s.hospital.Id, false, 1); // no usage item
    surgery(s, '201', 'A00', s.hospital.Id, true, 13); // before the window
    surgery(s, '201', 'A00', s.hospital.Id, true, 0); // next month: not yet happened
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
    System.assertEquals(0, h.lines.size());
  }

  @IsTest
  static void linesGiveSurgeonBrandTypeAndCaseTypeAndDemosWithItemsCount() {
    Setup s = make();
    surgery(s, '201', 'A00', s.hospital.Id, true, 1);
    surgery(s, '201', 'A00', s.hospital.Id, true, 1); // the same line: adds up
    surgery(s, '201', 'A01', s.hospital.Id, true, 2); // revision: its own line
    surgery(s, '202', 'Z02', s.hospital.Id, true, 3); // demo with a usage item: counts, as Demo
    flush();
    PipelineBookingsController.HospitalBookings h = PipelineBookingsController.getHospitalBookings(
      s.deal.Id
    );
    System.assertEquals(4, h.booked, 'A demo with a usage item counts');
    System.assertEquals(3, h.lines.size());
    Map<String, PipelineBookingsController.HospitalLine> byKey = new Map<String, PipelineBookingsController.HospitalLine>();
    for (PipelineBookingsController.HospitalLine l : h.lines) {
      System.assertEquals(s.surgeon.Id, l.surgeonId);
      System.assertEquals('Test Surgeon', l.surgeon);
      System.assertNotEquals(null, l.brand);
      System.assertEquals(12, l.months.size());
      byKey.put(l.anatomy + ' ' + l.procedure, l);
    }
    System.assertEquals(2, byKey.get('Hip Primary').months[11]);
    System.assertEquals(1, byKey.get('Hip Revision').months[10]);
    System.assertEquals(1, byKey.get('Knee Demo').months[9]);
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
      Date.today().toStartOfMonth().addMonths(-11),
      h.windowStart
    );
  }

  /** BOOKED: bookings from today for 12 months, no usage needed; ROSA from the Technology; cancelled ones and past ones left out. */
  @IsTest
  static void bookedCountsBookingsFromTodayWithoutUsage() {
    Setup s = make();
    Date today = Date.today();
    Date later = today.toStartOfMonth().addMonths(2).addDays(4);
    List<Case__c> cases = new List<Case__c>{
      new Case__c(
        Physician__c = s.surgeon.Id,
        Surgery_Date__c = today,
        Surgery_Type__c = '202',
        Procedure__c = 'A00',
        Healthcare_Facility__c = s.hospital.Id,
        Technology__c = '3'
      ),
      new Case__c(
        Physician__c = s.surgeon.Id,
        Surgery_Date__c = later,
        Surgery_Type__c = '201',
        Procedure__c = 'A00',
        Healthcare_Facility__c = s.hospital.Id,
        Technology__c = '1'
      ),
      new Case__c(
        Physician__c = s.surgeon.Id,
        Surgery_Date__c = later,
        Surgery_Type__c = '201',
        Procedure__c = 'A00',
        Healthcare_Facility__c = s.hospital.Id,
        Status__c = 'R'
      ),
      new Case__c(
        Physician__c = s.surgeon.Id,
        Surgery_Date__c = later,
        Surgery_Type__c = '201',
        Procedure__c = 'A00',
        Healthcare_Facility__c = s.hospital.Id,
        Booking_Status__c = 'C'
      ),
      new Case__c(
        Physician__c = s.surgeon.Id,
        Surgery_Date__c = today.addDays(-1),
        Surgery_Type__c = '201',
        Procedure__c = 'A00',
        Healthcare_Facility__c = s.hospital.Id
      ),
      new Case__c(
        Physician__c = s.surgeon.Id,
        Surgery_Date__c = later,
        Surgery_Type__c = '201',
        Procedure__c = 'A00',
        Healthcare_Facility__c = s.other.Id
      )
    };
    insert cases;
    Test.startTest();
    PipelineBookingsController.HospitalBookings h = PipelineBookingsController.getHospitalBooked(
      s.deal.Id
    );
    Test.stopTest();
    System.assertEquals(today, h.windowStart);
    System.assertEquals(
      today.toStartOfMonth().addMonths(12).addDays(-1),
      h.windowEnd
    );
    System.assertEquals(
      2,
      h.booked,
      'Cancelled, past and other hospitals are left out'
    );
    System.assertEquals(
      1,
      h.types[1].months[0],
      'The knee today is in the first column'
    );
    System.assertEquals(1, h.types[0].months[2], 'The hip is two columns on');
    Integer rosa = 0;
    for (PipelineBookingsController.HospitalLine l : h.lines) {
      if (l.rosa) {
        rosa++;
        System.assertEquals('Knee', l.anatomy);
      }
    }
    System.assertEquals(1, rosa, 'Only the ROSA technology booking is ROSA');
  }
}

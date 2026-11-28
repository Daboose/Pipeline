/**
 * Tests ROSADealController (the ROSA deal screen): reading a deal with its surgeons, answers, checklist and linked deals;
 * saving the deal, a surgeon, the checklist and an answer; adding a surgeon; linking an implant deal; the searches; and that
 * a person without ROSA Deal Management cannot change anything. Creates its own test data; touches no real data.
 */
@IsTest
private class ROSADealControllerTest {
  static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  static Account surgeon(String last) {
    Account a = new Account(
      FirstName = 'Test',
      LastName = last,
      PersonMailingCountryCode = 'AU',
      PersonMailingStateCode = 'NSW',
      RecordTypeId = rt(Account.SObjectType, 'Physician')
    );
    Database.DMLOptions opts = new Database.DMLOptions();
    opts.duplicateRuleHeader.allowSave = true;
    Database.insert(a, opts);
    return a;
  }

  @TestSetup
  static void grant() {
    List<PermissionSetAssignment> psas = new List<PermissionSetAssignment>();
    for (PermissionSet ps : [
      SELECT Id
      FROM PermissionSet
      WHERE Name IN ('ROSA_Deal_Management', 'ROSA_Credentialing_Admin')
    ]) {
      psas.add(
        new PermissionSetAssignment(
          AssigneeId = UserInfo.getUserId(),
          PermissionSetId = ps.Id
        )
      );
    }
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Database.insert(psas, false);
    }
  }

  @IsTest
  static void readsAndSavesADeal() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Event_Category__c qs = new Event_Category__c(
        Name = 'Test set',
        Active__c = true,
        ROSA_Usage__c = 'ROSA Credentialing',
        ROSA_Pathway__c = 'Shoulder'
      );
      insert qs;
      insert new Question__c(
        Event_Category__c = qs.Id,
        Question_Text_2__c = 'Q one',
        Answer_Type__c = 'Yes/No',
        Answer_Required__c = true,
        Active__c = true,
        Display_Order__c = 10
      );
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA')
      );
      insert d;
      Account a = surgeon('Alpha');

      Test.startTest();
      Id sid = ROSADealController.addSurgeon(
        d.Id,
        new Map<String, Object>{
          'Surgeon_Name__c' => a.Id,
          'ROSA_Champion__c' => true,
          'ROSA_Pathway__c' => 'Shoulder',
          'ROSA_TSA_RSA_Current_Supplier__c' => 'J&J',
          'ROSA_TSA_RSA_Current_Cases__c' => '10',
          'ROSA_TSA_RSA_ROSA_Supplier__c' => 'ZB',
          'ROSA_TSA_RSA_ROSA_Cases__c' => 20
        }
      );
      Boolean dup = false;
      try {
        ROSADealController.addSurgeon(
          d.Id,
          new Map<String, Object>{ 'Surgeon_Name__c' => a.Id }
        );
      } catch (AuraHandledException e) {
        dup = true;
      }
      System.assert(dup, 'the same surgeon twice is refused');

      ROSADealController.Deal got = ROSADealController.getDeal(d.Id);
      System.assert(got.canEdit, 'a ROSA Deal Management person can edit');
      System.assertEquals(1, got.surgeons.size(), 'one surgeon');
      System.assertEquals(1, got.answers.size(), 'its question');
      System.assertNotEquals(null, got.checklist, 'the checklist');
      System.assertEquals(20, got.rec.ROSA_Growth_Cases__c, 'totals read');

      ROSADealController.saveAnswers(
        new Map<Id, String>{ got.answers[0].id => 'Yes' }
      );
      ROSADealController.saveAnswer(got.answers[0].id, 'Yes');
      ROSADealController.saveRecord(
        'SalesRisks__c',
        d.Id,
        new Map<String, Object>{
          'Stage__c' => 'Negotiation',
          'Install_Date__c' => '2027-03-01',
          'ROSA_Trainees__c' => '3',
          'Priority__c' => true
        }
      );
      ROSADealController.saveRecord(
        'Robotics_Surgeons__c',
        sid,
        new Map<String, Object>{
          'ROSA_Credentialing_Status__c' => 'Booked',
          'ROSA_Wave__c' => '2',
          'ROSA_Course_Date__c' => ''
        }
      );
      ROSADealController.saveRecord(
        'Robotics__c',
        got.checklist.Id,
        new Map<String, Object>{ 'ROSA_Step_1_Done__c' => true }
      );
      Test.stopTest();

      got = ROSADealController.getDeal(d.Id);
      System.assertEquals(
        'Negotiation',
        got.rec.Stage__c,
        'stage set from the stage bar (it may jump ahead)'
      );
      System.assertEquals(
        Date.newInstance(2027, 3, 1),
        got.rec.Install_Date__c,
        'date saved'
      );
      System.assertEquals('Yes', got.answers[0].yesNo, 'answer saved');
      System.assertNotEquals(null, got.answers[0].answeredBy, 'answered by');
      System.assertEquals('2', got.surgeons[0].ROSA_Wave__c, 'surgeon saved');
      System.assert(got.checklist.ROSA_Step_1_Done__c, 'step ticked');
      System.assertEquals(UserInfo.getName(), got.doneBy.get('1'), 'done by');

      Boolean refused = false;
      try {
        ROSADealController.saveRecord(
          'SalesRisks__c',
          d.Id,
          new Map<String, Object>{ 'OwnerId' => UserInfo.getUserId() }
        );
      } catch (AuraHandledException e) {
        refused = true;
      }
      System.assert(refused, 'a field not on the list is refused');
    }
  }

  @IsTest
  static void linksAnImplantDealAndSearches() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Account a = surgeon('Bravo');
      SalesRisks__c rosa = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA')
      );
      SalesRisks__c hip = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
        Account__c = a.Id,
        Stage__c = 'Plan'
      );
      insert new List<SalesRisks__c>{ rosa, hip };
      List<SalesRisks__c> opps = ROSADealController.surgeonOpportunities(a.Id);
      System.assertEquals(1, opps.size(), 'the implant deal, not ROSA ones');
      ROSADealController.linkOpportunity(hip.Id, rosa.Id, true);
      System.assertEquals(
        1,
        ROSADealController.getDeal(rosa.Id).linked.size(),
        'linked deal listed'
      );
      ROSADealController.linkOpportunity(hip.Id, rosa.Id, false);
      System.assertEquals(
        0,
        ROSADealController.getDeal(rosa.Id).linked.size(),
        'unlinked'
      );
      System.assertEquals(
        0,
        ROSADealController.searchSurgeons('x').size(),
        'too short'
      );
      ROSADealController.searchSurgeons('Bravo');
      ROSADealController.searchUsers(UserInfo.getLastName());
      ROSADealController.searchFacilities('Test');
    }
  }

  @IsTest
  static void withoutTheRosaPermissionNothingCanBeChanged() {
    SalesRisks__c d = new SalesRisks__c(
      RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA')
    );
    insert d;
    User viewer = new User(
      Alias = 'rosaview',
      Email = 'rosa.view@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Viewer',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_AU',
      ProfileId = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1]
      .Id,
      TimeZoneSidKey = 'Australia/Sydney',
      Username = 'rosa.view.' + System.currentTimeMillis() + '@example.com'
    );
    insert viewer;
    System.runAs(viewer) {
      System.assert(!ROSADealController.canEdit(), 'no ROSA permission set');
      Boolean refused = false;
      try {
        ROSADealController.saveRecord(
          'SalesRisks__c',
          d.Id,
          new Map<String, Object>{ 'Stage__c' => 'Negotiation' }
        );
      } catch (AuraHandledException e) {
        refused = true;
      }
      System.assert(refused, 'a viewer cannot save');
    }
  }

  /** myCase bookings: cases with usage items count (demos too), by brand, type and case Type; one without items and this month do not. */
  @IsTest
  static void surgeonBookingsCountCasesWithUsageItems() {
    Account surgeon = new Account(
      FirstName = 'Book',
      LastName = 'Surgeon',
      PersonMailingCountry = 'Australia',
      PersonMailingCountryCode = 'AU',
      PersonMailingState = 'New South Wales',
      PersonMailingStateCode = 'NSW',
      RecordTypeId = Account.SObjectType.getDescribe()
        .getRecordTypeInfosByDeveloperName()
        .get('Physician')
        .getRecordTypeId()
    );
    insert surgeon;
    Date last = Date.today().toStartOfMonth().addMonths(-1).addDays(4);
    List<Case__c> cases = new List<Case__c>{
      new Case__c(
        Physician__c = surgeon.Id,
        Surgery_Date__c = last,
        Surgery_Type__c = '205',
        Procedure__c = 'A00'
      ),
      new Case__c(
        Physician__c = surgeon.Id,
        Surgery_Date__c = last,
        Surgery_Type__c = '205',
        Procedure__c = 'A00'
      ),
      new Case__c(
        Physician__c = surgeon.Id,
        Surgery_Date__c = last,
        Surgery_Type__c = '202',
        Procedure__c = 'Z02'
      ),
      new Case__c(
        Physician__c = surgeon.Id,
        Surgery_Date__c = last,
        Surgery_Type__c = '201',
        Procedure__c = 'A00'
      ),
      new Case__c(
        Physician__c = surgeon.Id,
        Surgery_Date__c = Date.today().toStartOfMonth().addMonths(-12),
        Surgery_Type__c = '201',
        Procedure__c = 'A01'
      )
    };
    insert cases;
    List<myCase_Usage__c> sheets = new List<myCase_Usage__c>();
    for (Integer i = 0; i < cases.size(); i++) {
      if (i != 3) {
        sheets.add(
          new myCase_Usage__c(
            Case__c = cases[i].Id,
            ManualSheet__c = true,
            Total_Qty_ZB_Implants__c = 1
          )
        );
      }
    }
    insert sheets;
    List<myCase_Usage_Item__c> items = new List<myCase_Usage_Item__c>();
    for (myCase_Usage__c sh : sheets) {
      items.add(new myCase_Usage_Item__c(Usage_Sheet_ID__c = sh.Id));
    }
    insert items;
    Test.startTest();
    ROSADealController.Bookings b = ROSADealController.surgeonBookings(
      surgeon.Id
    );
    Test.stopTest();
    System.assertEquals(
      Date.today().toStartOfMonth().addMonths(-12),
      b.windowStart
    );
    Integer total = 0;
    Map<String, Integer> byKey = new Map<String, Integer>();
    for (ROSADealController.BookingLine l : b.lines) {
      Integer n = 0;
      for (Integer v : l.months) {
        n += v;
      }
      total += n;
      byKey.put(l.anatomy + '|' + l.procedure, n);
    }
    System.assertEquals(4, total, 'The case without usage items is left out');
    System.assertEquals(2, byKey.get('Shoulder|Primary'));
    System.assertEquals(1, byKey.get('Knee|Demo'));
    System.assertEquals(1, byKey.get('Hip|Revision'));
    System.assertEquals(
      0,
      ROSADealController.surgeonBookings(null).lines.size()
    );
  }

  /** An older ROSA deal with no checklist gets one from Add checklist; a second press is refused. */
  @IsTest
  static void addsAChecklistToAnOldDeal() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA')
      );
      insert d;
      Id made = [SELECT ROSA_Checklist__c FROM SalesRisks__c WHERE Id = :d.Id]
      .ROSA_Checklist__c;
      if (made != null) {
        // made on insert, as for every new deal: take it away to act like an old deal
        update new SalesRisks__c(Id = d.Id, ROSA_Checklist__c = null);
        delete new Robotics__c(Id = made);
      }
      Test.startTest();
      ROSADealController.addChecklist(d.Id);
      Test.stopTest();
      System.assertNotEquals(
        null,
        [SELECT ROSA_Checklist__c FROM SalesRisks__c WHERE Id = :d.Id]
        .ROSA_Checklist__c,
        'checklist added'
      );
      Boolean refused = false;
      try {
        ROSADealController.addChecklist(d.Id);
      } catch (AuraHandledException e) {
        refused = true;
      }
      System.assert(refused, 'only one checklist');
    }
  }
}

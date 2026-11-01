/**
 * Pipeline: tests for PipelineSurgeonController.
 *
 * Who calls it: the deploy (Apex tests must pass and cover the code before it goes to PROD).
 * What it touches: builds records in memory (nothing saved) for the rules, and runs the two calls against a deal with
 * no surgeon and against a deal whose surgeon has nothing recorded.
 */
@IsTest
private class PipelineSurgeonControllerTest {
  @IsTest
  static void aUsageRecordGivesOneLinePerProductWithData() {
    Usage__c u = new Usage__c(
      CompanyHipStems__c = 'ZB',
      CasesPAHipStem__c = 40,
      CompanyHipCups__c = 'Exactech',
      CasesPAHipCup__c = 35,
      Company_CMFT__c = 'ZB'
    );
    List<PipelineSurgeonController.UsageLine> lines = PipelineSurgeonController.linesOf(
      u,
      'Westfield'
    );
    System.assertEquals(3, lines.size(), 'Stems, cups and CMFT only');
    System.assertEquals('Stems', lines[0].label);
    System.assertEquals('Hip', lines[0].portfolio);
    System.assertEquals('Westfield', lines[0].hospital);
    System.assertEquals(35, lines[1].cases, 'Cups have their own cases');
    System.assertEquals('Exactech', lines[1].company, 'and their own company');
    System.assertEquals('CMF', lines[2].portfolio);
    System.assertEquals(
      0,
      PipelineSurgeonController.linesOf(new Usage__c(), 'X').size()
    );
    System.assertEquals(
      0,
      PipelineSurgeonController.linesOf(
          new Usage__c(CasesPAHipStem__c = 0, CasesPATotalKnee__c = 0),
          'X'
        )
        .size(),
      'A product with no company and 0 cases is not a usage'
    );
  }

  @IsTest
  static void shoulderGivesAnatomicalAndReverse() {
    Usage__c u = new Usage__c(
      CompanyAnatomical__c = 'ZB',
      CasesPAAnatomical__c = 12,
      CompanyReverse__c = 'Lima',
      CasesPAReverse__c = 8
    );
    List<PipelineSurgeonController.UsageLine> lines = PipelineSurgeonController.linesOf(
      u,
      null
    );
    System.assertEquals(2, lines.size());
    System.assertEquals('Anatomical', lines[0].label);
    System.assertEquals('Reverse', lines[1].label);
  }

  @IsTest
  static void ratingsAreInTheFixedOrder() {
    List<PipelineSurgeonController.Rating> r = PipelineSurgeonController.ratingsFrom(
      'GOLD',
      'SILVER',
      null,
      'BRONZE'
    );
    System.assertEquals(4, r.size());
    System.assertEquals('Hip', r[0].area);
    System.assertEquals('GOLD', r[0].rating);
    System.assertEquals(null, r[2].rating, 'No shoulder rating');
    System.assertEquals('CMF', r[3].area);
  }

  @IsTest
  static void onlySurgeriesWithUsageItemsAreCounted() {
    List<Case__c> cases = new List<Case__c>();
    for (Integer i = 0; i < 5; i++) {
      cases.add(
        new Case__c(Id = fakeId(i), Surgery_Type__c = i < 3 ? '201' : '202')
      );
    }
    cases.add(new Case__c(Id = fakeId(9), Surgery_Type__c = '203'));
    Set<Id> withItems = new Set<Id>{
      fakeId(0),
      fakeId(1),
      fakeId(3),
      fakeId(9)
    };
    Map<String, String> labels = new Map<String, String>{
      '201' => 'Hip',
      '202' => 'Knee',
      '203' => 'Spine'
    };
    PipelineSurgeonController.Surgeries s = PipelineSurgeonController.countByType(
      cases,
      withItems,
      labels
    );
    System.assertEquals(
      4,
      s.total,
      'Surgeries with no usage items are not counted'
    );
    System.assertEquals('Hip', s.byType[0].type);
    System.assertEquals(2, s.byType[0].count);
    System.assertEquals(1, s.byType[1].count, 'Knee');
    System.assertEquals(
      0,
      s.byType[2].count,
      'Shoulder / Elbow is always listed'
    );
    System.assertEquals(
      'Spine',
      s.byType[3].type,
      'Another type is listed when it has surgeries'
    );
  }

  @IsTest
  static void aDealWithNoSurgeonGivesNothing() {
    SalesRisks__c d = new SalesRisks__c(
      RecordTypeId = Schema.SObjectType.SalesRisks__c.getRecordTypeInfosByDeveloperName()
        .get('AUHIP')
        .getRecordTypeId(),
      Stage__c = 'Plan',
      Expected_Closure_Quarter__c = 'Q4'
    );
    insert d;
    System.assertEquals(
      null,
      PipelineSurgeonController.getUsages(d.Id).surgeonId
    );
    PipelineSurgeonController.Surgeries s = PipelineSurgeonController.getSurgeries(
      d.Id
    );
    System.assertEquals(0, s.total);
    System.assertEquals(0, s.byType.size());
  }

  private static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  @IsTest
  static void aRealSurgeonGivesUsagesAndOnlySurgeriesWithItems() {
    Account surgeon = new Account(
      FirstName = 'Test',
      LastName = 'Surgeon',
      PersonMailingCountry = 'Australia',
      PersonMailingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Physician')
    );
    insert surgeon;
    Account hospital = new Account(
      Name = 'Test Hospital',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    insert hospital;
    insert new Usage__c(
      RecordTypeId = rt(Usage__c.SObjectType, 'PrimaryTotalHip'),
      HCP2__c = surgeon.Id,
      Healthcare_Facility__c = hospital.Id,
      CompanyHipStems__c = 'ZB',
      CasesPAHipStem__c = 20
    );
    SalesRisks__c deal = new SalesRisks__c(
      RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUHIP'),
      Account__c = surgeon.Id,
      Stage__c = 'Plan',
      Expected_Closure_Quarter__c = 'Q4'
    );
    insert deal;
    Date surgeryDay = Date.today().addDays(-30);
    Case__c withItems = new Case__c(
      Physician__c = surgeon.Id,
      Surgery_Date__c = surgeryDay,
      Surgery_Type__c = '201'
    );
    Case__c noItems = new Case__c(
      Physician__c = surgeon.Id,
      Surgery_Date__c = surgeryDay,
      Surgery_Type__c = '201'
    );
    Case__c future = new Case__c(
      Physician__c = surgeon.Id,
      Surgery_Date__c = Date.today().addDays(10),
      Surgery_Type__c = '202'
    );
    insert new List<Case__c>{ withItems, noItems, future };
    myCase_Usage__c manual = new myCase_Usage__c(
      Case__c = withItems.Id,
      ManualSheet__c = true,
      Total_Qty_ZB_Implants__c = 1
    );
    insert manual;
    insert new myCase_Usage_Item__c(Usage_Sheet_ID__c = manual.Id);

    PipelineSurgeonController.Usages u = PipelineSurgeonController.getUsages(
      deal.Id
    );
    System.assertEquals('Test Surgeon', u.surgeonName);
    System.assertEquals(4, u.ratings.size());
    Boolean found = false;
    for (PipelineSurgeonController.UsageLine l : u.lines) {
      if (
        l.label == 'Stems' &&
        l.company == 'ZB' &&
        l.cases == 20 &&
        l.hospital == 'Test Hospital'
      ) {
        found = true;
      }
    }
    System.assert(
      found,
      'The hip stems line is listed under the hospital: ' +
      JSON.serialize(u.lines)
    );
    System.assertNotEquals(null, u.newest);

    PipelineSurgeonController.Surgeries s = PipelineSurgeonController.getSurgeries(
      deal.Id
    );
    System.assertEquals(
      surgeon.Id,
      s.surgeonId,
      'The surgeon is carried back to the screen'
    );
    System.assertEquals(
      1,
      s.total,
      'Only the past surgery that has an item on a usage sheet counts'
    );
    System.assertEquals('Hip', s.byType[0].type);
    System.assertEquals(1, s.byType[0].count);
  }

  /** A well-formed record Id for a case that is never saved (the key prefix, then zeros, then a counter). */
  private static Id fakeId(Integer n) {
    String counter = String.valueOf(n + 1);
    return Id.valueOf(
      Case__c.SObjectType.getDescribe().getKeyPrefix() +
        '0'.repeat(12 - counter.length()) +
        counter
    );
  }
}

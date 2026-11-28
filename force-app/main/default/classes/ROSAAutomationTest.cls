/**
 * Tests ROSAAutomation and the six ROSA triggers (ROSA Shoulder POC, spec section 13).
 * Creates its own test deals, surgeons, question set and prices; touches no real data.
 */
@IsTest
private class ROSAAutomationTest {
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
      PersonMailingCountry = 'Australia',
      PersonMailingCountryCode = 'AU',
      PersonMailingState = 'New South Wales',
      PersonMailingStateCode = 'NSW',
      RecordTypeId = rt(Account.SObjectType, 'Physician')
    );
    Database.DMLOptions opts = new Database.DMLOptions();
    opts.duplicateRuleHeader.allowSave = true;
    Database.insert(a, opts);
    return a;
  }

  static SalesRisks__c deal() {
    SalesRisks__c d = new SalesRisks__c(
      RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA'),
      ROSAGrowthDollar__c = 1234
    );
    insert d;
    return [
      SELECT
        Id,
        Stage__c,
        ROSA_Checklist__c,
        Close_Date__c,
        ROSAGrowthDollar__c,
        ROSA_Surgeon_Count__c,
        ROSA_Champions__c,
        ROSA_ZB_Shoulder_Users__c,
        ROSA_Current_ZB_Shoulder__c,
        ROSA_With_ROSA_ZB_Shoulder__c,
        ROSA_Growth_Cases__c,
        ROSA_Share_ZB__c,
        ROSA_Share_Stryker__c,
        ROSA_Surgeons_Credentialed__c
      FROM SalesRisks__c
      WHERE Id = :d.Id
    ];
  }

  static SalesRisks__c reload(Id dealId) {
    return [
      SELECT
        Id,
        Stage__c,
        ROSA_Checklist__c,
        Close_Date__c,
        ROSAGrowthDollar__c,
        ROSA_Surgeon_Count__c,
        ROSA_Champions__c,
        ROSA_ZB_Shoulder_Users__c,
        ROSA_Current_ZB_Shoulder__c,
        ROSA_With_ROSA_ZB_Shoulder__c,
        ROSA_Growth_Cases__c,
        ROSA_Share_ZB__c,
        ROSA_Share_Stryker__c,
        ROSA_Surgeons_Credentialed__c,
        Install_Date__c
      FROM SalesRisks__c
      WHERE Id = :dealId
    ];
  }

  static Robotics__c checklist(Id id) {
    return [
      SELECT
        Id,
        ROSA_Highest_Step__c,
        ROSA_Step_1_Done__c,
        ROSA_Step_1_Date__c,
        ROSA_Step_1_Done_By__c,
        ROSA_Step_6_Done_By__c,
        ROSA_Step_7c_Done__c
      FROM Robotics__c
      WHERE Id = :id
    ];
  }

  static Robotics_Surgeons__c addSurgeon(
    Id dealId,
    Account a,
    Boolean champion,
    String curSup,
    Integer cur,
    String rosaSup,
    Integer withRosa
  ) {
    Robotics_Surgeons__c s = new Robotics_Surgeons__c(
      ROSA_Deal__c = dealId,
      Surgeon_Name__c = a.Id,
      ROSA_Champion__c = champion,
      ROSA_TSA_RSA_Current_Supplier__c = curSup,
      ROSA_TSA_RSA_Current_Cases__c = cur,
      ROSA_TSA_RSA_ROSA_Supplier__c = rosaSup,
      ROSA_TSA_RSA_ROSA_Cases__c = withRosa
    );
    insert s;
    return s;
  }

  static ROSA_Question_Set__c questionSet(Integer questions) {
    ROSA_Question_Set__c e = new ROSA_Question_Set__c(
      Name = 'Test ROSA Shoulder Credentialing',
      ROSA_Active__c = true,
      ROSA_Pathway__c = 'Shoulder'
    );
    insert e;
    List<ROSA_Question__c> qs = new List<ROSA_Question__c>();
    for (Integer i = 1; i <= questions; i++) {
      qs.add(
        new ROSA_Question__c(
          ROSA_Question_Set__c = e.Id,
          ROSA_Question_Text__c = 'Question ' + i,
          ROSA_Answer_Type__c = 'Yes/No',
          ROSA_Required__c = true,
          ROSA_Active__c = true,
          ROSA_Display_Order__c = i * 10
        )
      );
    }
    insert qs;
    return e;
  }

  /** Gives the running user both ROSA permission sets, as a deal lead or marketing person would have. */
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
      Database.insert(psas, false); // an existing assignment is fine
    }
  }

  static Boolean fails(SObject r) {
    try {
      update r;
      return false;
    } catch (DmlException e) {
      return true;
    }
  }

  @IsTest
  static void aNewDealGetsSalesPipelineAndOneChecklist() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = deal();
      System.assertEquals('Sales Pipeline', d.Stage__c, 'T1 stage');
      System.assertNotEquals(null, d.ROSA_Checklist__c, 'T1 checklist linked');
      System.assertEquals(
        1,
        [SELECT COUNT() FROM Robotics__c WHERE Sales_Risks__c = :d.Id],
        'T1 exactly one checklist'
      );
      String dealName = [SELECT Name FROM SalesRisks__c WHERE Id = :d.Id].Name;
      System.assertEquals(
        'ROSA Checklist for ROSA deal ' + dealName,
        [SELECT Name FROM Robotics__c WHERE Id = :d.ROSA_Checklist__c].Name,
        'checklist named after the deal'
      );
    }
  }

  @IsTest
  static void surgeonsAddUpOnTheDealAndCannotBeAddedTwice() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = deal();
      Account a = surgeon('Alpha');
      Account b = surgeon('Bravo');
      Account c = surgeon('Charlie');
      Test.startTest();
      addSurgeon(d.Id, a, true, 'ZB', 20, 'ZB', 40);
      addSurgeon(d.Id, b, false, 'Stryker', 30, 'ZB', 30);
      Robotics_Surgeons__c third = addSurgeon(
        d.Id,
        c,
        false,
        'ZB',
        10,
        'Stryker',
        10
      );
      Test.stopTest();
      SalesRisks__c t = reload(d.Id);
      System.assertEquals(3, t.ROSA_Surgeon_Count__c, 'T3 count');
      System.assertEquals('Test Alpha', t.ROSA_Champions__c, 'T3 champion');
      System.assertEquals(2, t.ROSA_ZB_Shoulder_Users__c, 'T3 ZB users');
      System.assertEquals(30, t.ROSA_Current_ZB_Shoulder__c, 'T3 current ZB');
      System.assertEquals(
        70,
        t.ROSA_With_ROSA_ZB_Shoulder__c,
        'T3 with ROSA ZB'
      );
      System.assertEquals(40, t.ROSA_Growth_Cases__c, 'T3 growth cases');
      System.assertEquals(87.5, t.ROSA_Share_ZB__c, 'share ZB');
      System.assertEquals(12.5, t.ROSA_Share_Stryker__c, 'share Stryker');
      System.assertEquals(
        1234,
        t.ROSAGrowthDollar__c,
        'T14 typed-in growth $ is untouched'
      );
      Boolean blocked = false;
      try {
        addSurgeon(d.Id, a, false, null, null, null, null);
      } catch (DmlException e) {
        blocked = true;
      }
      System.assert(blocked, 'T4 the same surgeon twice is blocked');
      delete third;
      System.assertEquals(
        2,
        reload(d.Id).ROSA_Surgeon_Count__c,
        'delete recounts'
      );
    }
  }

  @IsTest
  static void checklistStepsMoveTheStageInOrder() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = deal();
      Robotics__c c = new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_3_Done__c = true,
        ROSA_Step_1_Done__c = true,
        ROSA_Step_2_Done__c = true
      );
      System.assert(fails(c), 'T2 step 3 needs a surgeon');
      addSurgeon(d.Id, surgeon('Delta'), false, 'ZB', 5, 'ZB', 5);

      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_1_Done__c = true
      );
      Robotics__c after1 = checklist(d.ROSA_Checklist__c);
      System.assertEquals(
        'Surgeon Engagement',
        reload(d.Id).Stage__c,
        'T5 stage'
      );
      System.assertEquals(Date.today(), after1.ROSA_Step_1_Date__c, 'T5 date');
      System.assertEquals(
        UserInfo.getUserId(),
        after1.ROSA_Step_1_Done_By__c,
        'T5 done by'
      );
      System.assertEquals(1, after1.ROSA_Highest_Step__c, 'highest step');

      System.assert(
        fails(
          new Robotics__c(Id = d.ROSA_Checklist__c, ROSA_Step_5_Done__c = true)
        ),
        'T6 out of order'
      );
      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_2_Done__c = true,
        ROSA_Step_3_Done__c = true
      );
      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_4_Done__c = true
      );
      System.assertEquals(
        'Executive Presentation',
        reload(d.Id).Stage__c,
        'T7 step 4'
      );
      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_5_Done__c = true
      );
      System.assertEquals('Negotiation', reload(d.Id).Stage__c, 'T7 step 5');
      System.assert(
        fails(
          new Robotics__c(Id = d.ROSA_Checklist__c, ROSA_Step_7b_Done__c = true)
        ),
        '7x needs step 6'
      );
      Date signed = Date.today().addDays(-2);
      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_6_Done__c = true,
        ROSA_Step_6_Date__c = signed
      );
      SalesRisks__c won = reload(d.Id);
      System.assertEquals('Closed Won', won.Stage__c, 'T7 step 6');
      System.assertEquals(
        signed,
        won.Close_Date__c,
        'T7 close date from step 6'
      );
      System.assert(
        fails(
          new Robotics__c(Id = d.ROSA_Checklist__c, ROSA_Step_7a_Done__c = true)
        ),
        '7a needs the install date'
      );

      System.assert(
        fails(
          new Robotics__c(Id = d.ROSA_Checklist__c, ROSA_Step_1_Done__c = false)
        ),
        'cannot untick an earlier step'
      );
      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_6_Done__c = false
      );
      System.assertEquals(
        null,
        checklist(d.ROSA_Checklist__c).ROSA_Step_6_Done_By__c,
        'untick clears Done by'
      );
      System.assertEquals(
        'Closed Won',
        reload(d.Id).Stage__c,
        'the stage never moves back'
      );
    }
  }

  @IsTest
  static void aLostDealStaysLost() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = deal();
      update new SalesRisks__c(Id = d.Id, Stage__c = 'Deal Lost');
      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_1_Done__c = true
      );
      System.assertEquals('Deal Lost', reload(d.Id).Stage__c, 'T8');
    }
  }

  @IsTest
  static void credentialingOnTheSurgeonAsksTheQuestionsAndTicks7c() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = deal();
      Robotics_Surgeons__c s = addSurgeon(
        d.Id,
        surgeon('Echo'),
        true,
        'ZB',
        30,
        'ZB',
        40
      );
      ROSA_Question_Set__c qs = questionSet(4);
      update new SalesRisks__c(Id = d.Id, Install_Date__c = Date.today());
      update new Robotics__c(
        Id = d.ROSA_Checklist__c,
        ROSA_Step_1_Done__c = true,
        ROSA_Step_2_Done__c = true,
        ROSA_Step_3_Done__c = true,
        ROSA_Step_4_Done__c = true,
        ROSA_Step_5_Done__c = true,
        ROSA_Step_6_Done__c = true
      );
      // choosing the pathway on the surgeon brings in the question set and its questions
      update new Robotics_Surgeons__c(Id = s.Id, ROSA_Pathway__c = 'Shoulder');
      Robotics_Surgeons__c got = surgeonRow(s.Id);
      System.assertEquals(
        qs.Id,
        got.ROSA_Question_Set_Used__c,
        'T10 question set'
      );
      System.assertEquals(
        'Not started',
        got.ROSA_Credentialing_Status__c,
        'status starts Not started'
      );
      System.assertEquals(4, got.ROSA_Questions_To_Answer__c, 'four to answer');
      System.assertEquals(false, got.ROSA_Ready__c, 'T10 not ready');
      Date course = Date.today().addDays(14);
      update new Robotics_Surgeons__c(Id = s.Id, ROSA_Course_Date__c = course);
      System.assertEquals(
        'Booked',
        surgeonRow(s.Id).ROSA_Credentialing_Status__c,
        'a course date means Booked'
      );
      List<ROSA_Credentialing_Answer__c> answers = [
        SELECT Id, ROSA_Display_Order__c
        FROM ROSA_Credentialing_Answer__c
        WHERE ROSA_Surgeon__c = :s.Id
        ORDER BY ROSA_Display_Order__c
      ];
      System.assertEquals(4, answers.size(), 'T10 four answers');
      System.assertEquals(10, answers[0].ROSA_Display_Order__c, 'T10 order');

      System.assert(
        fails(
          new ROSA_Credentialing_Answer__c(
            Id = answers[0].Id,
            ROSA_Answer_Text__c = 'x'
          )
        ),
        'wrong answer field blocked'
      );
      for (ROSA_Credentialing_Answer__c a : answers) {
        a.ROSA_Answer_Yes_No__c = 'Yes';
      }
      answers[1].ROSA_Answer_Yes_No__c = 'No'; // a gap: still answered
      update answers;
      got = surgeonRow(s.Id);
      System.assertEquals(1, got.ROSA_Gaps__c, 'one gap');
      System.assertEquals(
        0,
        got.ROSA_Questions_To_Answer__c,
        'none left to answer'
      );
      System.assert(got.ROSA_Ready__c, 'T11 all questions answered');
      System.assertEquals(
        'No',
        [
          SELECT ROSA_Answer__c
          FROM ROSA_Credentialing_Answer__c
          WHERE Id = :answers[1].Id
        ]
        .ROSA_Answer__c,
        'easy answer'
      );
      ROSA_Credentialing_Answer__c one = [
        SELECT ROSA_Is_Answered__c, ROSA_Answered_By__c, ROSA_Answered_Date__c
        FROM ROSA_Credentialing_Answer__c
        WHERE Id = :answers[0].Id
      ];
      System.assert(one.ROSA_Is_Answered__c, 'T11 answered');
      System.assertEquals(
        UserInfo.getUserId(),
        one.ROSA_Answered_By__c,
        'T11 answered by'
      );
      System.assertNotEquals(
        null,
        one.ROSA_Answered_Date__c,
        'T11 answered date'
      );

      Test.startTest();
      update new Robotics_Surgeons__c(
        Id = s.Id,
        ROSA_Credentialed_Date__c = Date.today()
      );
      Test.stopTest();
      System.assertEquals(
        1,
        reload(d.Id).ROSA_Surgeons_Credentialed__c,
        'T12 count'
      );
      System.assert(
        checklist(d.ROSA_Checklist__c).ROSA_Step_7c_Done__c,
        'T12 7c ticked'
      );
      System.assertEquals(
        'Credentialed',
        surgeonRow(s.Id).ROSA_Credentialing_Status__c,
        'credentialed'
      );

      // T16: a fifth question only reaches surgeons put into credentialing after it was added
      insert new ROSA_Question__c(
        ROSA_Question_Set__c = qs.Id,
        ROSA_Question_Text__c = 'Five',
        ROSA_Answer_Type__c = 'Date',
        ROSA_Required__c = true,
        ROSA_Active__c = true,
        ROSA_Display_Order__c = 50
      );
      Robotics_Surgeons__c s2 = addSurgeon(
        d.Id,
        surgeon('Foxtrot'),
        false,
        null,
        null,
        null,
        null
      );
      update new Robotics_Surgeons__c(Id = s2.Id, ROSA_Pathway__c = 'Shoulder');
      System.assertEquals(
        5,
        [
          SELECT COUNT()
          FROM ROSA_Credentialing_Answer__c
          WHERE ROSA_Surgeon__c = :s2.Id
        ],
        'T16 new gets 5'
      );
      System.assertEquals(
        4,
        [
          SELECT COUNT()
          FROM ROSA_Credentialing_Answer__c
          WHERE ROSA_Surgeon__c = :s.Id
        ],
        'T16 earlier keeps 4'
      );
      update new Robotics_Surgeons__c(Id = s2.Id, ROSA_Wave__c = '2');
      System.assertEquals(
        5,
        [
          SELECT COUNT()
          FROM ROSA_Credentialing_Answer__c
          WHERE ROSA_Surgeon__c = :s2.Id
        ],
        'saving again adds no more'
      );
      // a wave only once Booked, Attended or Credentialed (Robert, 2026-11-28)
      System.assertEquals(
        null,
        [SELECT ROSA_Wave__c FROM Robotics_Surgeons__c WHERE Id = :s2.Id]
        .ROSA_Wave__c,
        'Not started has no wave'
      );
      update new Robotics_Surgeons__c(
        Id = s2.Id,
        ROSA_Credentialing_Status__c = 'Booked',
        ROSA_Wave__c = '2'
      );
      System.assertEquals(
        '2',
        [SELECT ROSA_Wave__c FROM Robotics_Surgeons__c WHERE Id = :s2.Id]
        .ROSA_Wave__c,
        'Booked keeps its wave'
      );
      update new Robotics_Surgeons__c(
        Id = s2.Id,
        ROSA_Credentialing_Status__c = 'Not started'
      );
      System.assertEquals(
        null,
        [SELECT ROSA_Wave__c FROM Robotics_Surgeons__c WHERE Id = :s2.Id]
        .ROSA_Wave__c,
        'back to Not started clears the wave'
      );
      delete s2;
      System.assertEquals(
        1,
        reload(d.Id).ROSA_Surgeons_Credentialed__c,
        'a removed surgeon is recounted'
      );
    }
  }

  static Robotics_Surgeons__c surgeonRow(Id id) {
    return [
      SELECT
        ROSA_Question_Set_Used__c,
        ROSA_Credentialing_Status__c,
        ROSA_Questions_To_Answer__c,
        ROSA_Gaps__c,
        ROSA_Ready__c
      FROM Robotics_Surgeons__c
      WHERE Id = :id
    ];
  }

  @IsTest
  static void theDealIsSharedWithItsLeadAndSalesRep() {
    Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
    List<User> people = new List<User>();
    for (String n : new List<String>{ 'Lead', 'Rep', 'Other' }) {
      people.add(
        new User(
          Alias = ('rs' + n).left(8),
          Email = 'rosa' + n + '@example.com',
          EmailEncodingKey = 'UTF-8',
          LastName = 'ROSA ' + n,
          LanguageLocaleKey = 'en_US',
          LocaleSidKey = 'en_AU',
          ProfileId = p.Id,
          TimeZoneSidKey = 'Australia/Sydney',
          Username = 'rosa.share.' +
            n.toLowerCase() +
            '.' +
            System.currentTimeMillis() +
            '@example.com'
        )
      );
    }
    insert people;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = deal();
      update new SalesRisks__c(
        Id = d.Id,
        ROSA_Overlord__c = people[0].Id,
        ROSA_Sales_Rep__c = people[1].Id
      );
      Map<Id, String> got = new Map<Id, String>();
      for (SalesRisks__Share s : [
        SELECT UserOrGroupId, AccessLevel
        FROM SalesRisks__Share
        WHERE
          ParentId = :d.Id
          AND RowCause IN ('ROSA_Deal_Lead__c', 'ROSA_Sales_Rep__c')
      ]) {
        got.put(s.UserOrGroupId, s.AccessLevel);
      }
      System.assertEquals('Edit', got.get(people[0].Id), 'deal lead can edit');
      System.assertEquals('Edit', got.get(people[1].Id), 'sales rep can edit');
      update new SalesRisks__c(Id = d.Id, ROSA_Sales_Rep__c = people[2].Id);
      Set<Id> now = new Set<Id>();
      for (SalesRisks__Share s : [
        SELECT UserOrGroupId
        FROM SalesRisks__Share
        WHERE ParentId = :d.Id AND RowCause = 'ROSA_Sales_Rep__c'
      ]) {
        now.add(s.UserOrGroupId);
      }
      System.assert(
        now.contains(people[2].Id) && !now.contains(people[1].Id),
        'the old rep loses the share'
      );
    }
  }

  @IsTest
  static void growthDollarsComeFromTheSurgeonsAndThePrices() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Account hcp = surgeon('Primary'); // no facility: the AU ROSA record type gives the country
      insert new List<ROSA_Price__c>{
        new ROSA_Price__c(
          ROSA_Country__c = 'AU',
          ROSA_Joint__c = 'TKA',
          ROSA_Price__c = 5000,
          CurrencyIsoCode = 'AUD',
          ROSA_Active__c = true
        ),
        new ROSA_Price__c(
          ROSA_Country__c = 'AU',
          ROSA_Joint__c = 'TKA Disposable',
          ROSA_Price__c = 750,
          CurrencyIsoCode = 'AUD',
          ROSA_Active__c = true
        )
      };
      SalesRisks__c d = new SalesRisks__c(
        RecordTypeId = rt(SalesRisks__c.SObjectType, 'AUROSA'),
        Account__c = hcp.Id,
        CurrencyIsoCode = 'AUD',
        ROSAGrowthDollar__c = 999
      );
      insert d;
      System.assertEquals(
        999,
        reload(d.Id).ROSAGrowthDollar__c,
        'no surgeons: the typed value stays'
      );
      // competitor now, 20 ZB with ROSA: +20 cases
      insert new Robotics_Surgeons__c(
        ROSA_Deal__c = d.Id,
        Surgeon_Name__c = surgeon('Golf').Id,
        ROSA_TKA_Current_Supplier__c = 'J&J',
        ROSA_TKA_Current_Cases__c = 10,
        ROSA_TKA_ROSA_Supplier__c = 'ZB',
        ROSA_TKA_ROSA_Cases__c = 20
      );
      // 10 ZB now, 20 ZB with ROSA: +10 cases
      Robotics_Surgeons__c two = new Robotics_Surgeons__c(
        ROSA_Deal__c = d.Id,
        Surgeon_Name__c = surgeon('Hotel').Id,
        ROSA_TKA_Current_Supplier__c = 'ZB',
        ROSA_TKA_Current_Cases__c = 10,
        ROSA_TKA_ROSA_Supplier__c = 'ZB',
        ROSA_TKA_ROSA_Cases__c = 20
      );
      insert two;
      Robotics_Surgeons__c got = [
        SELECT
          ROSA_Growth_Implants__c,
          ROSA_Growth_Disposables__c,
          ROSA_Growth_Value__c
        FROM Robotics_Surgeons__c
        WHERE Id = :two.Id
      ];
      System.assertEquals(
        50000,
        got.ROSA_Growth_Implants__c,
        '10 cases x 5000'
      );
      System.assertEquals(
        7500,
        got.ROSA_Growth_Disposables__c,
        '10 cases x 750'
      );
      System.assertEquals(57500, got.ROSA_Growth_Value__c, 'surgeon total');
      System.assertEquals(
        172500,
        reload(d.Id).ROSAGrowthDollar__c,
        '30 growth cases x 5750'
      );
      System.assertEquals(
        30,
        [SELECT ROSA_Growth_TKA_Cases__c FROM SalesRisks__c WHERE Id = :d.Id]
        .ROSA_Growth_TKA_Cases__c,
        'TKA growth cases'
      );
      System.assertEquals(
        'AU · AUD: TKA 5,000 + 750 (implant + disposables per case)',
        [SELECT ROSA_Prices_Used__c FROM SalesRisks__c WHERE Id = :d.Id]
        .ROSA_Prices_Used__c,
        'prices used shown'
      );
      Test.startTest();
      update new ROSA_Price__c(
        Id = [
          SELECT Id
          FROM ROSA_Price__c
          WHERE ROSA_Joint__c = 'TKA Disposable'
        ]
        .Id,
        ROSA_Price__c = 1000
      );
      Test.stopTest();
      System.assertEquals(
        180000,
        reload(d.Id).ROSAGrowthDollar__c,
        'a price change recalculates: 30 x 6000'
      );
    }
  }

  @IsTest
  static void activePricesCannotBeDuplicated() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert new ROSA_Price__c(
        ROSA_Country__c = 'AU',
        ROSA_Joint__c = 'TKA Disposable',
        ROSA_Price__c = 750,
        CurrencyIsoCode = 'AUD',
        ROSA_Active__c = true
      );
      Boolean dup = false;
      try {
        insert new ROSA_Price__c(
          ROSA_Country__c = 'AU',
          ROSA_Joint__c = 'TKA Disposable',
          ROSA_Price__c = 800,
          CurrencyIsoCode = 'AUD',
          ROSA_Active__c = true
        );
      } catch (DmlException e) {
        dup = true;
      }
      System.assert(dup, 'second active price blocked');
      insert new ROSA_Price__c(
        ROSA_Country__c = 'AU',
        ROSA_Joint__c = 'TKA Disposable',
        ROSA_Price__c = 700,
        CurrencyIsoCode = 'AUD',
        ROSA_Active__c = false
      );
      System.assertEquals(
        2,
        [SELECT COUNT() FROM ROSA_Price__c],
        'an inactive price is allowed'
      );
    }
  }

  @IsTest
  static void twoHundredSurgeonsLoadInOneGo() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      SalesRisks__c d = deal();
      List<Account> accts = new List<Account>();
      for (Integer i = 0; i < 200; i++) {
        accts.add(
          new Account(
            FirstName = 'Bulk',
            LastName = 'Surgeon ' + i,
            PersonMailingCountryCode = 'AU',
            PersonMailingStateCode = 'NSW',
            RecordTypeId = rt(Account.SObjectType, 'Physician')
          )
        );
      }
      Database.DMLOptions opts = new Database.DMLOptions();
      opts.duplicateRuleHeader.allowSave = true;
      Database.insert(accts, opts);
      List<Robotics_Surgeons__c> rows = new List<Robotics_Surgeons__c>();
      for (Account a : accts) {
        rows.add(
          new Robotics_Surgeons__c(
            ROSA_Deal__c = d.Id,
            Surgeon_Name__c = a.Id,
            ROSA_TKA_Current_Supplier__c = 'ZB',
            ROSA_TKA_Current_Cases__c = 1
          )
        );
      }
      Test.startTest();
      insert rows;
      Test.stopTest();
      System.assertEquals(200, reload(d.Id).ROSA_Surgeon_Count__c, 'T18');
    }
  }
}

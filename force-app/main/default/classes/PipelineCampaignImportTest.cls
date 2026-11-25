/**
 * Tests for PipelineCampaignImport and the importer methods of PipelineCampaignController (matching a pasted list of names to
 * surgeons, and adding the confirmed ones). Uses invented records only.
 */
@IsTest
private class PipelineCampaignImportTest {
  static Id rt(Schema.SObjectType t, String developerName) {
    return t.getDescribe()
      .getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  static User manager() {
    User u = new User(
      Alias = 'pcimp',
      Email = 'pcimp@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'CampaignImportTest',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_AU',
      ProfileId = UserInfo.getProfileId(),
      TimeZoneSidKey = 'Australia/Sydney',
      Username = 'pcimp' +
        String.valueOf(Crypto.getRandomInteger()) +
        '@example.com.test'
    );
    insert u;
    insert new PermissionSetAssignment(
      AssigneeId = u.Id,
      PermissionSetId = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Pipeline_Campaign_Manager'
      ]
      .Id
    );
    return u;
  }

  static Account surgeon(String first, String last, String type) {
    return surgeonIn(first, last, type, 'Singapore', 'SG');
  }

  static Account surgeonIn(
    String first,
    String last,
    String type,
    String country,
    String code
  ) {
    Account a = new Account(
      FirstName = first,
      LastName = last,
      PersonMailingCountry = country,
      PersonMailingCountryCode = code,
      RecordTypeId = rt(Account.SObjectType, type)
    );
    // test surgeons share names on purpose; an org's duplicate rule must not stop them being created
    Database.DMLOptions opts = new Database.DMLOptions();
    opts.duplicateRuleHeader.allowSave = true;
    Database.insert(a, opts);
    return a;
  }

  static Id campaign() {
    return PipelineCampaignController.saveCampaign(
      JSON.serialize(
        new Map<String, Object>{
          'friendlyName' => 'Import',
          'countries' => new List<String>{ 'SG' },
          'portfolios' => new List<String>{ 'Hip' },
          'active' => true,
          'managerId' => UserInfo.getUserId()
        }
      )
    );
  }

  static PipelineCampaignController.ImportRow one(Id c, String line) {
    return PipelineCampaignController.matchNames(
      c,
      new List<String>{ line }
    )[0];
  }

  @IsTest
  static void aNameMatchesInAnyOrderIgnoringTitlesAndCapitals() {
    System.runAs(manager()) {
      Id c = campaign();
      Account a = surgeon('Wei Ming', 'Lim', 'Physician');
      System.assertEquals('exact', one(c, 'Dr Wei Ming Lim').status);
      System.assertEquals(a.Id, one(c, 'LIM wei ming').pickId);
      PipelineCampaignController.ImportRow comma = one(c, 'Lim, Wei Ming');
      System.assertEquals('exact', comma.status);
      System.assertEquals('Wei Ming Lim', comma.cands[0].name);
    }
  }

  @IsTest
  static void anEnglishNameIsMatchedToo() {
    System.runAs(manager()) {
      Id c = campaign();
      // Thailand: an Account rule (ACC_05) refuses an English name for countries that already enter names in English, SG among them
      Account a = surgeonIn('Local', 'Spelling', 'Physician', 'Thailand', 'TH');
      a.Preferred_Name__c = 'Zebra English';
      update a;
      PipelineCampaignController.ImportRow r = one(c, 'Zebra English');
      System.assertEquals('exact', r.status);
      System.assertEquals(a.Id, r.pickId);
    }
  }

  @IsTest
  static void aFirstNameThatOnlyStartsTheSameWayIsOnlyAPossibleMatch() {
    System.runAs(manager()) {
      Id c = campaign();
      Account a = surgeon('Rajesh', 'Kumar', 'Physician');
      PipelineCampaignController.ImportRow r = one(c, 'Raj Kumar');
      System.assertEquals('suggest', r.status);
      System.assertEquals(a.Id, r.pickId);
    }
  }

  @IsTest
  static void severalPeopleWithTheSameNameNeedAChoiceAndAHospitalHintCanPickOne() {
    System.runAs(manager()) {
      Id c = campaign();
      Account a = surgeon('Ah Kow', 'Tan', 'Physician');
      Account b = surgeon('Ah Kow', 'Tan', 'Physician');
      PipelineCampaignController.ImportRow r = one(c, 'Tan Ah Kow');
      System.assertEquals('many', r.status);
      System.assertEquals(2, r.cands.size());
      System.assertEquals(null, r.pickId);
      Account h = new Account(
        Name = 'Mount Elizabeth Hospital',
        BillingCountry = 'Singapore',
        BillingCountryCode = 'SG',
        RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
      );
      insert h;
      insert new Healthcare_Surgeon_Relationship__c(
        Surgeon__c = b.Id,
        Healthcare_Facility__c = h.Id
      );
      System.assertEquals(b.Id, one(c, 'Tan Ah Kow, Mount Elizabeth').pickId);
      System.assertEquals(
        b.Id,
        one(c, 'Tan Ah Kow (ME)').pickId,
        'the initials of the hospital also point at it'
      );
      System.assertEquals(a.Id == b.Id, false);
    }
  }

  @IsTest
  static void aNameWithNoMatchAndNonSurgeonsAreNotMatched() {
    System.runAs(manager()) {
      Id c = campaign();
      surgeon('Staging', 'Person', 'Physician_Processing');
      System.assertEquals('none', one(c, 'Nobody Atall').status);
      System.assertEquals('none', one(c, 'Staging Person').status);
      System.assertEquals(
        0,
        PipelineCampaignController.matchNames(c, null).size()
      );
    }
  }

  @IsTest
  static void aSurgeonAlreadyInTheCampaignIsMarked() {
    System.runAs(manager()) {
      Id c = campaign();
      Account a = surgeon('Already', 'Member', 'Physician');
      PipelineCampaignController.addMember(c, a.Id);
      PipelineCampaignController.ImportRow r = one(c, 'Already Member');
      System.assertEquals('dup', r.status);
      System.assertEquals(true, r.cands[0].alreadyMember);
    }
  }

  @IsTest
  static void confirmedSurgeonsAreAddedTogetherAndRepeatsAreCounted() {
    System.runAs(manager()) {
      Id c = campaign();
      Account a = surgeon('One', 'Added', 'Physician');
      Account b = surgeon('Two', 'Added', 'Emerging_Consultant');
      PipelineCampaignController.ImportResult r = PipelineCampaignController.addMembers(
        c,
        new List<Id>{ a.Id, b.Id, a.Id }
      );
      System.assertEquals(2, r.added);
      System.assertEquals(0, r.alreadyMembers);
      PipelineCampaignController.ImportResult again = PipelineCampaignController.addMembers(
        c,
        new List<Id>{ a.Id }
      );
      System.assertEquals(0, again.added);
      System.assertEquals(1, again.alreadyMembers);
      System.assertEquals(
        2,
        PipelineCampaignController.getCampaign(c).members.size()
      );
      System.assertEquals(
        0,
        PipelineCampaignController.addMembers(c, null).added
      );
    }
  }

  @IsTest
  static void tooLongAListIsRefused() {
    System.runAs(manager()) {
      Id c = campaign();
      List<String> many = new List<String>();
      for (Integer i = 0; i < 301; i++) {
        many.add('Name ' + i);
      }
      try {
        PipelineCampaignController.matchNames(c, many);
        System.assert(false, 'a list of 301 should be refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
    }
  }

  @IsTest
  static void aLineIsReadAsANameAndAHint() {
    PipelineCampaignImport.Parsed p = PipelineCampaignImport.parse(
      'Dr Jonathan Wu (Raffles)'
    );
    System.assertEquals('Dr Jonathan Wu', p.name);
    System.assertEquals('Raffles', p.clue);
    p = PipelineCampaignImport.parse('Priya Nair - Mount Elizabeth');
    System.assertEquals('Mount Elizabeth', p.clue);
    p = PipelineCampaignImport.parse('Siti Abdullah\tPrince Court');
    System.assertEquals('Prince Court', p.clue);
    System.assertEquals(
      'abdullah siti',
      PipelineCampaignImport.key('Dr. Siti ABDULLAH')
    );
  }

  @IsTest
  static void symbolsAreRemovedFromALineBeforeItIsRead() {
    PipelineCampaignImport.Parsed p = PipelineCampaignImport.parse(
      'Stephen Andrews (NZ) \u2605'
    );
    System.assertEquals('Stephen Andrews', p.name);
    System.assertEquals('NZ', p.clue);
    System.assertEquals(
      'Rishi Narasimhan',
      PipelineCampaignImport.clean('\u2605 Rishi  Narasimhan \u2605')
    );
    System.assertEquals(
      'Mary O\'Brien-Smith, SGH',
      PipelineCampaignImport.clean('Mary O\u2019Brien-Smith, SGH')
    );
    // names in other scripts are kept
    System.assertEquals(
      '\u738B\u5C0F\u660E \u53F0\u5317',
      PipelineCampaignImport.clean('\u738B\u5C0F\u660E \u2714 \u53F0\u5317')
    );
  }

  @IsTest
  static void aBracketThatIsPartOfTheSurgeonsNameStillMatches() {
    System.runAs(manager()) {
      Id c = campaign();
      Account a = surgeon('Stephen', 'Andrews (NZ)', 'Physician');
      Account b = surgeon('Anthony', 'Maher', 'Physician');
      PipelineCampaignController.ImportRow r = one(c, 'Stephen Andrews (NZ)');
      System.assertEquals('exact', r.status);
      System.assertEquals(a.Id, r.pickId);
      // a bracket that is only a hint still matches the plain name
      r = one(c, 'Anthony Maher (NZ)');
      System.assertEquals('exact', r.status);
      System.assertEquals(b.Id, r.pickId);
    }
  }

  static Account facility(String name) {
    Account a = new Account(
      Name = name,
      BillingCountry = 'Singapore',
      BillingCountryCode = 'SG',
      BillingCity = 'Testville',
      RecordTypeId = rt(Account.SObjectType, 'Healthcare_Facility')
    );
    Database.DMLOptions opts = new Database.DMLOptions();
    opts.duplicateRuleHeader.allowSave = true;
    Database.insert(a, opts);
    return a;
  }

  @IsTest
  static void aHospitalNameMatchesAFacilityExactlyOrPossibly() {
    System.runAs(manager()) {
      Id c = campaign();
      Account f = facility('ZANZIBAR ORTHO HOSPITAL (VIC)');
      // the whole line read as the name, a bracket counting as words: exact
      PipelineCampaignController.ImportRow r = one(
        c,
        'Zanzibar Ortho Hospital, VIC'
      );
      System.assertEquals('exact', r.status);
      System.assertEquals(f.Id, r.pickId);
      System.assertEquals(true, r.cands[0].isFacility);
      System.assertEquals('SG', r.cands[0].country);
      System.assertEquals(null, r.cands[0].hospitals);
      // every word of the line but the common ones: only a possible match, never chosen for the person without a click
      r = one(c, 'Zanzibar Ortho');
      System.assertEquals('suggest', r.status);
      System.assertEquals(f.Id, r.pickId);
      // not a facility, not a surgeon
      System.assertEquals('none', one(c, 'Qwertyuiop Nowhere').status);
    }
  }

  @IsTest
  static void aLineThatFitsASurgeonAndAFacilityOffersBoth() {
    System.runAs(manager()) {
      Id c = campaign();
      Account s = surgeon('Quirina', 'Mountford', 'Physician');
      Account f1 = facility('QUIRINA MOUNTFORD HOSPITAL');
      Account f2 = facility('QUIRINA MOUNTFORD PRIVATE');
      PipelineCampaignController.ImportRow r = one(c, 'Quirina Mountford');
      System.assertEquals('many', r.status, 'several fit: the person chooses');
      Set<Id> ids = new Set<Id>();
      Integer facilities = 0;
      for (PipelineCampaignController.SurgeonHit h : r.cands) {
        ids.add(h.id);
        if (h.isFacility) {
          facilities++;
        }
      }
      System.assert(ids.contains(s.Id) && ids.contains(f1.Id));
      System.assertEquals(
        2,
        facilities,
        'both facilities, no surgeon marked as one'
      );
      System.assertEquals(null, r.pickId);
    }
  }

  @IsTest
  static void aFacilityAlreadyInTheCampaignIsMarkedAndAFacilityCanBeAdded() {
    System.runAs(manager()) {
      Id c = campaign();
      Account f = facility('YONDER GENERAL HOSPITAL');
      PipelineCampaignController.ImportRow r = one(
        c,
        'Yonder General Hospital'
      );
      System.assertEquals('exact', r.status);
      PipelineCampaignController.ImportResult added = PipelineCampaignController.addMembers(
        c,
        new List<Id>{ f.Id }
      );
      System.assertEquals(1, added.added);
      System.assertEquals('dup', one(c, 'Yonder General Hospital').status);
    }
  }
}

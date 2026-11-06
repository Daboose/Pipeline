/**
 * Pipeline: tests for PipelineLookupController.
 *
 * Who calls it: the deploy (Apex tests must pass and cover the code before it goes to PROD).
 * What it touches: creates a few accounts and one deal in the test only; nothing is kept.
 */
@IsTest
private class PipelineLookupControllerTest {
  @IsTest
  static void aFieldThatIsNotAPickerIsRefusedAndShortTermsFindNothing() {
    try {
      PipelineLookupController.search('OwnerId', 'Smith');
      System.assert(false, 'Should be refused');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    System.assertEquals(
      0,
      PipelineLookupController.search('Account__c', 'S').size()
    );
    System.assertEquals(
      0,
      PipelineLookupController.search('Account__c', null).size()
    );
    System.assertEquals(
      0,
      PipelineLookupController.search('Account__c', '**').size()
    );
  }

  @IsTest
  static void aDoctorPickerOffersPeopleAndAHospitalPickerOffersTheRest() {
    Id physicianRt = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
      .get('Physician')
      .getRecordTypeId();
    Id hospitalRt = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
      .get('Healthcare_Facility')
      .getRecordTypeId();
    Account doctor = new Account(
      FirstName = 'Zelda',
      LastName = 'Zzpickertest',
      PersonMailingCountry = 'Australia',
      PersonMailingCountryCode = 'AU',
      PersonMailingState = 'New South Wales',
      PersonMailingStateCode = 'NSW',
      RecordTypeId = physicianRt
    );
    insert doctor;
    Account hospital = new Account(
      Name = 'Zzpickertest Hospital',
      BillingCountry = 'Australia',
      BillingCountryCode = 'AU',
      RecordTypeId = hospitalRt
    );
    insert hospital;
    Test.setFixedSearchResults(new List<Id>{ doctor.Id, hospital.Id });
    List<PipelineLookupController.Hit> docs = PipelineLookupController.search(
      'Account__c',
      'Zzpickertest'
    );
    System.assertEquals(1, docs.size(), 'Only the person account');
    System.assertEquals(doctor.Id, docs[0].id);
    List<PipelineLookupController.Hit> hosps = PipelineLookupController.search(
      'Healthcare_Facility__c',
      'Zzpickertest'
    );
    System.assertEquals(
      1,
      hosps.size(),
      'Only the account that is not a person'
    );
    System.assertEquals(hospital.Id, hosps[0].id);
  }

  @IsTest
  static void aRosaDealPickerOffersOnlyRosaDeals() {
    insert new SalesRisks__c(
      RecordTypeId = Schema.SObjectType.SalesRisks__c.getRecordTypeInfosByDeveloperName()
        .get('AUHIP')
        .getRecordTypeId(),
      Stage__c = 'Plan',
      Expected_Closure_Quarter__c = 'Q4'
    );
    // no ROSA deal exists in the test, so nothing is offered, and the hip deal is never offered
    System.assertEquals(
      0,
      PipelineLookupController.search('Link_To_ROSA_Deal__c', 'ZzNoSuchDeal')
        .size()
    );
    System.assertEquals(
      0,
      PipelineLookupController.search('Link_To_ROSA_Deal__c', 'Plan').size()
    );
  }

  /** Link to APAC Event: events are offered (newest first) only to a person who can see the field; nothing otherwise. */
  @IsTest
  static void anEventPickerOffersEventsOnlyToSomeoneWhoCanSeeTheField() {
    Event__c event = new Event__c(
      Name = 'Zzpickertest Masterclass',
      Event_Start_Date__c = Datetime.newInstance(2030, 5, 4, 9, 0, 0)
    );
    if (
      Schema.SObjectType.Event__c.fields.getMap().containsKey('Legacy_Event__c')
    ) {
      event.put('Legacy_Event__c', true); // the APAC Events rules (manager, venue and so on) do not apply to a legacy event
    }
    insert event;
    List<PipelineLookupController.Hit> hits = PipelineLookupController.search(
      'APAC_Event__c',
      'Zzpickertest'
    );
    if (PipelineController.canSeeEvent()) {
      System.assertEquals(1, hits.size(), 'The event is offered');
      System.assertEquals(event.Id, hits[0].id);
      System.assertNotEquals('', hits[0].sub, 'Its start date shows');
    } else {
      System.assertEquals(0, hits.size(), 'Nothing without the field');
    }
    System.assertEquals(
      0,
      PipelineLookupController.search('APAC_Event__c', 'Z').size(),
      'Short terms find nothing'
    );
  }
}

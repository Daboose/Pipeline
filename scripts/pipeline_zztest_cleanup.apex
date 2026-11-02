// Pipeline: removes the ZZTEST test data made in UAT on 2026-11-02 to try the My Case Bookings panel.
// Run in UAT only:  sf apex run -o UAT -f scripts/pipeline_zztest_cleanup.apex
// It deletes, in this order, only records tied to accounts whose name starts "ZZTEST ": the usage items, usage sheets and
// surgeries of the five test surgeons, their usages (including any made by the Create and Adjust buttons), their five test
// deals, and then the test surgeons and the seven test hospitals. Nothing else is touched. Check the counts it prints first
// with scripts/pipeline_zztest_count.apex.
delete [SELECT Id FROM myCase_Usage_Item__c WHERE Usage_Sheet_ID__r.Case__r.Physician__r.Name LIKE 'ZZTEST %'];
delete [SELECT Id FROM myCase_Usage__c WHERE Case__r.Physician__r.Name LIKE 'ZZTEST %'];
delete [SELECT Id FROM Case__c WHERE Physician__r.Name LIKE 'ZZTEST %'];
delete [SELECT Id FROM Usage__c WHERE HCP2__r.Name LIKE 'ZZTEST %'];
delete [SELECT Id FROM SalesRisks__c WHERE Account__r.Name LIKE 'ZZTEST %'];
delete [SELECT Id FROM Account WHERE Name LIKE 'ZZTEST %'];
System.debug('ZZTEST cleanup done');

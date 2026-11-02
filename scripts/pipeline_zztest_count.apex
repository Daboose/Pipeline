// Pipeline: counts the ZZTEST test data in UAT (see pipeline_zztest_cleanup.apex). Reads only.
System.debug('ZZTEST accounts=' + [SELECT COUNT() FROM Account WHERE Name LIKE 'ZZTEST %']
  + ' deals=' + [SELECT COUNT() FROM SalesRisks__c WHERE Account__r.Name LIKE 'ZZTEST %']
  + ' surgeries=' + [SELECT COUNT() FROM Case__c WHERE Physician__r.Name LIKE 'ZZTEST %']
  + ' sheets=' + [SELECT COUNT() FROM myCase_Usage__c WHERE Case__r.Physician__r.Name LIKE 'ZZTEST %']
  + ' items=' + [SELECT COUNT() FROM myCase_Usage_Item__c WHERE Usage_Sheet_ID__r.Case__r.Physician__r.Name LIKE 'ZZTEST %']
  + ' usages=' + [SELECT COUNT() FROM Usage__c WHERE HCP2__r.Name LIKE 'ZZTEST %']);

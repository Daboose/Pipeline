// ROSA Shoulder POC: shares every existing ROSA deal with its ROSA Deal Lead and Sales Rep (both edit), as new and changed
// deals now are. Safe to run again. Run in UAT (and once in each org this is released to).
List<SalesRisks__c> deals = new List<SalesRisks__c>();
for (SalesRisks__c d : [
  SELECT Id, OwnerId, RecordTypeId, ROSA_Overlord__c, ROSA_Sales_Rep__c
  FROM SalesRisks__c
  WHERE ROSA_Overlord__c != NULL OR ROSA_Sales_Rep__c != NULL
]) {
  if (ROSAAutomation.isRosaDeal(d.RecordTypeId))
    deals.add(d);
}
ROSAAutomation.syncShares(deals);
System.debug(
  'deals ' +
    deals.size() +
    ', shares ' +
    [
      SELECT COUNT()
      FROM SalesRisks__Share
      WHERE RowCause IN ('ROSA_Deal_Lead__c', 'ROSA_Sales_Rep__c')
    ]
);

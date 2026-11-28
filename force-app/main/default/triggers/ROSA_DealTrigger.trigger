/**
 * ROSA Shoulder POC: a ROSA deal: Sales Pipeline when no stage and its ROSA Checklist (new deals), and the deal shared
 * with its ROSA Deal Lead and Sales Rep (both edit) (new and changed deals).
 * All the logic is in ROSAAutomation (tested by ROSAAutomationTest).
 */
trigger ROSA_DealTrigger on SalesRisks__c(
  before insert,
  after insert,
  after update
) {
  if (Trigger.isBefore) {
    ROSAAutomation.dealBeforeInsert(Trigger.new);
  } else {
    if (Trigger.isInsert) {
      ROSAAutomation.dealAfterInsert(Trigger.new);
    }
    ROSAAutomation.shareDeals(Trigger.new, Trigger.oldMap);
  }
}

/**
 * ROSA Shoulder POC: ROSA Surgeons: deal link, duplicate key, credentialing (question set, status, answers, counts),
 * and the deal's surgeon totals, credentialed count and step 7c.
 * All the logic is in ROSAAutomation (tested by ROSAAutomationTest).
 */
trigger ROSA_SurgeonTrigger on Robotics_Surgeons__c(
  before insert,
  before update,
  after insert,
  after update,
  after delete,
  after undelete
) {
  if (Trigger.isBefore) {
    ROSAAutomation.surgeonBeforeSave(Trigger.new);
    ROSAAutomation.surgeonCredentialingBeforeSave(Trigger.new);
  } else {
    ROSAAutomation.surgeonsChanged(Trigger.new, Trigger.oldMap);
    ROSAAutomation.surgeonCredentialingAfterSave(Trigger.new, Trigger.oldMap);
  }
}

/**
 * ROSA Shoulder POC: ROSA Checklist steps: dates, Done by, highest step, and moving the deal's stage.
 * All the logic is in ROSAAutomation (tested by ROSAAutomationTest).
 */
trigger ROSA_ChecklistTrigger on Robotics__c(
  before insert,
  before update,
  after update
) {
  if (Trigger.isBefore) {
    ROSAAutomation.checklistBeforeSave(Trigger.new, Trigger.oldMap);
  } else {
    ROSAAutomation.checklistAfterUpdate(Trigger.new, Trigger.oldMap);
  }
}

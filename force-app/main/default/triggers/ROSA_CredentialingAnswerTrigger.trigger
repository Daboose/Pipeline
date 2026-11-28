/**
 * ROSA Shoulder POC: ROSA Credentialing Answer: Answered, Answered by and Answered date (before save), and the
 * surgeon's Questions to answer (after save).
 * All the logic is in ROSAAutomation (tested by ROSAAutomationTest).
 */
trigger ROSA_CredentialingAnswerTrigger on ROSA_Credentialing_Answer__c(
  before insert,
  before update,
  after update,
  after delete
) {
  if (Trigger.isBefore) {
    ROSAAutomation.answerBeforeSave(Trigger.new, Trigger.oldMap);
  } else {
    ROSAAutomation.answersChanged(Trigger.isDelete ? Trigger.old : Trigger.new);
  }
}

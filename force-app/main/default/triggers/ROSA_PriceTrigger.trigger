/**
 * ROSA Shoulder POC: ROSA Price: the duplicate key for active prices, and the ROSA Growth $ of deals in that country
 * recalculated when a price changes.
 * All the logic is in ROSAAutomation (tested by ROSAAutomationTest).
 */
trigger ROSA_PriceTrigger on ROSA_Price__c(
  before insert,
  before update,
  after insert,
  after update
) {
  if (Trigger.isBefore) {
    ROSAAutomation.priceBeforeSave(Trigger.new);
  } else {
    ROSAAutomation.pricesChanged(Trigger.new);
  }
}

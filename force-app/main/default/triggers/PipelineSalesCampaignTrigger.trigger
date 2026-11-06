/**
 * Pipeline: runs on a Sales Campaign before it is saved. It only calls PipelineCampaignRules.setCampaignNames, which fills in the
 * system-set fields on the record being saved (see that class). It changes nothing else.
 */
trigger PipelineSalesCampaignTrigger on Sales_Campaign__c(
  before insert,
  before update
) {
  PipelineCampaignRules.setCampaignNames(Trigger.new);
}

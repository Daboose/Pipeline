/**
 * Pipeline: runs on a Sales Campaign Deal before it is saved. It only calls PipelineCampaignRules.setDealKeys, which fills in the
 * system-set fields on the record being saved (see that class). It changes nothing else.
 */
trigger PipelineSalesCampaignDealTrigger on Sales_Campaign_Deal__c(
  before insert,
  before update
) {
  PipelineCampaignRules.setDealKeys(Trigger.new);
}

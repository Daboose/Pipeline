/**
 * Pipeline: runs on a Sales Campaign Member before it is saved. It only calls PipelineCampaignRules.setMemberKeys, which fills in the
 * system-set fields on the record being saved (see that class). It changes nothing else.
 */
trigger PipelineSalesCampaignMemberTrigger on Sales_Campaign_Member__c(
  before insert,
  before update
) {
  PipelineCampaignRules.setMemberKeys(Trigger.new);
}

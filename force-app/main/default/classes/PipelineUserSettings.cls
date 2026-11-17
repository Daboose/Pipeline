/**
 * Pipeline: reads and saves one solution's part of the signed-in person's settings on the shared UserSettings__c object.
 *
 * Who calls it: PipelineController (the Pipeline screen and phone, field Pipeline_JSON__c) and PipelineCampaignController
 * (Campaign Management, field Campaign_JSON__c), and PipelineUserSettingsTest.
 * What it touches: the signed-in person's own UserSettings__c record only (Name 'UserSettings', owned by them; the oldest one if
 * there are ever two). It creates the record the first time a person saves, filling the required unique User_Key__c with the
 * person's own 18-character Id; if two saves race and Salesforce refuses the second as a duplicate, it carries on with the record
 * that now exists. It only ever writes the one field it is given, so another solution's field on the same record is never touched.
 * Rules: see AAADESIGN/user-settings-and-filters.md.
 */
public with sharing class PipelineUserSettings {
  public static final String RECORD_NAME = 'UserSettings';
  public static final String PIPELINE_FIELD = 'Pipeline_JSON__c';
  public static final String CAMPAIGN_FIELD = 'Campaign_JSON__c';

  /** The person's record (the oldest if there are several), holding just the given field; null if they have none. */
  private static UserSettings__c find(
    Id userId,
    String field,
    AccessLevel level
  ) {
    List<UserSettings__c> rows = (List<UserSettings__c>) Database.queryWithBinds(
      'SELECT Id, ' +
        String.escapeSingleQuotes(field) +
        ' FROM UserSettings__c WHERE Name = :name AND OwnerId = :owner ORDER BY CreatedDate, Id LIMIT 1',
      new Map<String, Object>{ 'name' => RECORD_NAME, 'owner' => userId },
      level
    );
    return rows.isEmpty() ? null : rows[0];
  }

  /** The person's saved JSON for one solution, or null if they have none. */
  public static String read(String field, AccessLevel level) {
    UserSettings__c r = find(UserInfo.getUserId(), field, level);
    return r == null ? null : (String) r.get(field);
  }

  /** Saves the JSON into the person's one record, creating it if needed. Leaves every other field of the record alone. */
  public static void save(String field, String json, AccessLevel level) {
    Id me = UserInfo.getUserId();
    UserSettings__c r = find(me, field, level);
    if (r == null) {
      UserSettings__c n = new UserSettings__c(Name = RECORD_NAME);
      n.put('User_Key__c', String.valueOf(me));
      n.put(field, json);
      Database.SaveResult res = Database.insert(n, false, level);
      if (res.isSuccess()) {
        return;
      }
      Database.Error err = res.getErrors()[0];
      if (err.getStatusCode() != StatusCode.DUPLICATE_VALUE) {
        throw new DmlException(err.getMessage());
      }
      // another save created the person's record at the same moment: carry on with that one
      r = find(me, field, level);
      if (r == null) {
        throw new DmlException(err.getMessage());
      }
    }
    r.put(field, json);
    Database.update(r, true, level);
  }
}

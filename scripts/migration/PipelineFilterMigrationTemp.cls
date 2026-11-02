/**
 * Pipeline: ONE-OFF helper (2026-11-03), deleted again after use. Moves saved filters and user settings from the two old objects
 * (Pipeline_Saved_Filter__c and Pipeline_User_Setting__c) into the one new object Pipeline_Filter__c, keeping each record's
 * owner, name, JSON and default flag. Run in UAT or DEV after the new object is deployed and before the old objects are deleted:
 *   sf apex run -o UAT -f scripts/migration/run_migration.apex
 * Safe to run twice (a person who already has a settings record in the new object, or a filter with the same owner, name and
 * JSON, is skipped). Reads the old objects without the person's field access (the permission set no longer grants it).
 * Not part of the project and never deployed to PROD (PROD never had the old objects).
 */
public without sharing class PipelineFilterMigrationTemp {
  public static String run() {
    Set<String> haveFilter = new Set<String>();
    Set<Id> haveSettings = new Set<Id>();
    for (Pipeline_Filter__c f : [
      SELECT OwnerId, Name, Filter_Json__c, Is_User_Settings__c
      FROM Pipeline_Filter__c
    ]) {
      if (f.Is_User_Settings__c) {
        haveSettings.add(f.OwnerId);
      } else {
        haveFilter.add(f.OwnerId + '|' + f.Name + '|' + f.Filter_Json__c);
      }
    }
    List<Pipeline_Filter__c> toInsert = new List<Pipeline_Filter__c>();
    Integer filters = 0;
    for (Pipeline_Saved_Filter__c o : [
      SELECT OwnerId, Name, Filter_Json__c, Is_Default__c
      FROM Pipeline_Saved_Filter__c
    ]) {
      if (
        haveFilter.contains(o.OwnerId + '|' + o.Name + '|' + o.Filter_Json__c)
      ) {
        continue;
      }
      toInsert.add(
        new Pipeline_Filter__c(
          OwnerId = o.OwnerId,
          Name = o.Name,
          Filter_Json__c = o.Filter_Json__c,
          Is_Default__c = o.Is_Default__c,
          Is_User_Settings__c = false
        )
      );
      filters++;
    }
    Integer settings = 0;
    for (Pipeline_User_Setting__c o : [
      SELECT OwnerId, Settings_Json__c
      FROM Pipeline_User_Setting__c
      ORDER BY LastModifiedDate DESC
    ]) {
      if (haveSettings.contains(o.OwnerId)) {
        continue;
      }
      haveSettings.add(o.OwnerId);
      toInsert.add(
        new Pipeline_Filter__c(
          OwnerId = o.OwnerId,
          Name = 'Pipeline Settings (do not delete)',
          Settings_Json__c = o.Settings_Json__c,
          Is_User_Settings__c = true
        )
      );
      settings++;
    }
    insert toInsert;
    return 'MIGRATED filters=' + filters + ' settings=' + settings;
  }
}

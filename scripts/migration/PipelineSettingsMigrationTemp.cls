/**
 * Pipeline: ONE-OFF helper (2026-11-17), deleted from the org again after use. Copies Pipeline's settings and saved filters from
 * Pipeline_Filter__c into the shared objects:
 *   - each person's most recently modified settings record: the whole JSON into UserSettings__c.Pipeline_JSON__c, and its theme,
 *     zoom and headColour keys into UserSettings__c.Campaign_JSON__c (the person's one UserSettings record is created if missing,
 *     owned by them, User_Key__c = their 18-character Id)
 *   - each named filter into UserFilter__c (same owner, name, JSON and default flag; Solution__c = 'Pipeline')
 * Safe to run twice: a field that is already filled is left alone; a filter already copied (owner, name, JSON) is skipped.
 * run(true) shows the counts and rolls everything back; run(false) keeps the copies. Nothing in Pipeline_Filter__c is changed.
 * Run in UAT or DEV only (sf apex run -f scripts/migration/run_settings_migration.apex). Not part of the project; never deployed to PROD.
 */
public without sharing class PipelineSettingsMigrationTemp {
  private static final Set<String> CAMPAIGN_KEYS = new Set<String>{
    'theme',
    'zoom',
    'headColour'
  };

  public static String run(Boolean dryRun) {
    Savepoint sp = Database.setSavepoint();
    List<String> out = new List<String>();

    Map<Id, Pipeline_Filter__c> oldSettings = new Map<Id, Pipeline_Filter__c>();
    Map<Id, Integer> oldCount = new Map<Id, Integer>();
    for (Pipeline_Filter__c f : [
      SELECT Id, OwnerId, Settings_Json__c, LastModifiedDate
      FROM Pipeline_Filter__c
      WHERE Is_User_Settings__c = TRUE
      WITH SYSTEM_MODE
      ORDER BY LastModifiedDate DESC
    ]) {
      oldCount.put(
        f.OwnerId,
        (oldCount.containsKey(f.OwnerId) ? oldCount.get(f.OwnerId) : 0) + 1
      );
      if (!oldSettings.containsKey(f.OwnerId)) {
        oldSettings.put(f.OwnerId, f);
      }
    }

    Map<Id, UserSettings__c> have = new Map<Id, UserSettings__c>();
    for (UserSettings__c u : [
      SELECT Id, OwnerId, Pipeline_JSON__c, Campaign_JSON__c
      FROM UserSettings__c
      WHERE Name = 'UserSettings'
      WITH SYSTEM_MODE
      ORDER BY CreatedDate, Id
    ]) {
      if (!have.containsKey(u.OwnerId)) {
        have.put(u.OwnerId, u);
      }
    }

    List<UserSettings__c> toInsert = new List<UserSettings__c>();
    List<UserSettings__c> toUpdate = new List<UserSettings__c>();
    Integer skipped = 0;
    for (Id owner : oldSettings.keySet()) {
      String whole = oldSettings.get(owner).Settings_Json__c;
      if (String.isBlank(whole)) {
        skipped++;
        continue;
      }
      Map<String, Object> all = (Map<String, Object>) JSON.deserializeUntyped(
        whole
      );
      Map<String, Object> camp = new Map<String, Object>();
      for (String k : CAMPAIGN_KEYS) {
        if (all.containsKey(k)) {
          camp.put(k, all.get(k));
        }
      }
      String campJson = JSON.serialize(camp);
      if (have.containsKey(owner)) {
        UserSettings__c u = have.get(owner);
        Boolean changed = false;
        if (String.isBlank(u.Pipeline_JSON__c)) {
          u.Pipeline_JSON__c = whole;
          changed = true;
        }
        if (String.isBlank(u.Campaign_JSON__c)) {
          u.Campaign_JSON__c = campJson;
          changed = true;
        }
        if (changed) {
          toUpdate.add(u);
        } else {
          skipped++;
        }
      } else {
        toInsert.add(
          new UserSettings__c(
            Name = 'UserSettings',
            OwnerId = owner,
            User_Key__c = String.valueOf(owner),
            Pipeline_JSON__c = whole,
            Campaign_JSON__c = campJson
          )
        );
      }
    }
    Integer errors = 0;
    for (
      Database.SaveResult r : Database.insert(
        toInsert,
        false,
        AccessLevel.SYSTEM_MODE
      )
    ) {
      if (!r.isSuccess()) {
        errors++;
        out.add('settings insert error: ' + r.getErrors()[0].getMessage());
      }
    }
    for (
      Database.SaveResult r : Database.update(
        toUpdate,
        false,
        AccessLevel.SYSTEM_MODE
      )
    ) {
      if (!r.isSuccess()) {
        errors++;
        out.add('settings update error: ' + r.getErrors()[0].getMessage());
      }
    }

    Set<String> haveFilter = new Set<String>();
    for (UserFilter__c f : [
      SELECT OwnerId, Name, Filter_Json__c
      FROM UserFilter__c
      WHERE Solution__c = 'Pipeline'
      WITH SYSTEM_MODE
    ]) {
      haveFilter.add(f.OwnerId + '|' + f.Name + '|' + f.Filter_Json__c);
    }
    List<UserFilter__c> newFilters = new List<UserFilter__c>();
    Integer filtersOld = 0;
    Integer filtersSkipped = 0;
    for (Pipeline_Filter__c f : [
      SELECT OwnerId, Name, Filter_Json__c, Is_Default__c
      FROM Pipeline_Filter__c
      WHERE Is_User_Settings__c = FALSE
      WITH SYSTEM_MODE
    ]) {
      filtersOld++;
      if (
        haveFilter.contains(f.OwnerId + '|' + f.Name + '|' + f.Filter_Json__c)
      ) {
        filtersSkipped++;
        continue;
      }
      newFilters.add(
        new UserFilter__c(
          Name = f.Name,
          OwnerId = f.OwnerId,
          Solution__c = 'Pipeline',
          Filter_Json__c = f.Filter_Json__c,
          Is_Default__c = f.Is_Default__c
        )
      );
    }
    Integer filterErrors = 0;
    for (
      Database.SaveResult r : Database.insert(
        newFilters,
        false,
        AccessLevel.SYSTEM_MODE
      )
    ) {
      if (!r.isSuccess()) {
        filterErrors++;
        out.add('filter insert error: ' + r.getErrors()[0].getMessage());
      }
    }

    Integer moreThanOne = 0;
    for (Integer n : oldCount.values()) {
      if (n > 1) {
        moreThanOne++;
      }
    }
    out.add('dryRun=' + dryRun);
    out.add(
      'old settings records, people: ' +
        oldSettings.size() +
        '; people with more than one: ' +
        moreThanOne
    );
    out.add(
      'UserSettings created: ' +
        toInsert.size() +
        '; updated: ' +
        toUpdate.size() +
        '; skipped: ' +
        skipped +
        '; errors: ' +
        errors
    );
    out.add(
      'old filters: ' +
        filtersOld +
        '; UserFilter created: ' +
        newFilters.size() +
        '; skipped: ' +
        filtersSkipped +
        '; errors: ' +
        filterErrors
    );
    if (dryRun) {
      Database.rollback(sp);
      out.add('rolled back (dry run)');
    }
    return String.join(out, ' || ');
  }

  /** Compares the old records with the new ones; returns one line per person and a summary of the filters. */
  public static String verify() {
    List<String> out = new List<String>();
    Map<Id, UserSettings__c> nu = new Map<Id, UserSettings__c>();
    for (UserSettings__c u : [
      SELECT
        OwnerId,
        Name,
        User_Key__c,
        Pipeline_JSON__c,
        Campaign_JSON__c,
        APAC_Events_JSON__c
      FROM UserSettings__c
      WITH SYSTEM_MODE
    ]) {
      nu.put(u.OwnerId, u);
    }
    out.add('UserSettings records: ' + nu.size());
    for (Pipeline_Filter__c o : [
      SELECT OwnerId, Owner.Name, Settings_Json__c, LastModifiedDate
      FROM Pipeline_Filter__c
      WHERE Is_User_Settings__c = TRUE
      WITH SYSTEM_MODE
      ORDER BY LastModifiedDate DESC
    ]) {
      UserSettings__c n = nu.get(o.OwnerId);
      if (n == null) {
        out.add(o.Owner.Name + ': NO NEW RECORD');
        continue;
      }
      Map<String, Object> whole = (Map<String, Object>) JSON.deserializeUntyped(
        o.Settings_Json__c
      );
      Map<String, Object> pj = (Map<String, Object>) JSON.deserializeUntyped(
        n.Pipeline_JSON__c
      );
      Map<String, Object> cj = (Map<String, Object>) JSON.deserializeUntyped(
        n.Campaign_JSON__c
      );
      Boolean campOk = true;
      for (String k : CAMPAIGN_KEYS) {
        if (
          whole.containsKey(k) != cj.containsKey(k) ||
          (whole.containsKey(k) &&
          JSON.serialize(whole.get(k)) != JSON.serialize(cj.get(k)))
        ) {
          campOk = false;
        }
      }
      out.add(
        o.Owner.Name +
          ': name=' +
          n.Name +
          ' keyOk=' +
          (n.User_Key__c == String.valueOf(o.OwnerId)) +
          ' pipelineJsonIdentical=' +
          (n.Pipeline_JSON__c == o.Settings_Json__c) +
          ' pipelineKeys=' +
          pj.size() +
          ' campaignOk=' +
          campOk +
          ' campaign=' +
          n.Campaign_JSON__c +
          ' apacJson=' +
          n.APAC_Events_JSON__c
      );
    }
    Set<String> oldF = new Set<String>();
    for (Pipeline_Filter__c f : [
      SELECT OwnerId, Name, Filter_Json__c, Is_Default__c
      FROM Pipeline_Filter__c
      WHERE Is_User_Settings__c = FALSE
      WITH SYSTEM_MODE
    ]) {
      oldF.add(
        f.OwnerId +
          '|' +
          f.Name +
          '|' +
          f.Filter_Json__c +
          '|' +
          f.Is_Default__c
      );
    }
    Set<String> newF = new Set<String>();
    Boolean allPipeline = true;
    for (UserFilter__c f : [
      SELECT OwnerId, Name, Filter_Json__c, Is_Default__c, Solution__c
      FROM UserFilter__c
      WITH SYSTEM_MODE
    ]) {
      newF.add(
        f.OwnerId +
          '|' +
          f.Name +
          '|' +
          f.Filter_Json__c +
          '|' +
          f.Is_Default__c
      );
      if (f.Solution__c != 'Pipeline') {
        allPipeline = false;
      }
    }
    out.add(
      'filters old=' +
        oldF.size() +
        ' new=' +
        newF.size() +
        ' identical=' +
        oldF.equals(newF) +
        ' allPipeline=' +
        allPipeline
    );
    return String.join(out, ' || ');
  }
}

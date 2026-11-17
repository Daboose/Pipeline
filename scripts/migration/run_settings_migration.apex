// Pipeline ONE-OFF (2026-11-17). Needs PipelineSettingsMigrationTemp deployed to the org first (and deleted afterwards).
// Change true to false to keep the copies. UAT or DEV only, never PROD.
//   sf apex run -o UAT -f scripts/migration/run_settings_migration.apex
System.debug('MIG|' + PipelineSettingsMigrationTemp.run(true));

/**
 * Pipeline: tests for PipelineUserSettings (one person's settings on the shared UserSettings__c object).
 *
 * Who calls it: the deploy (Apex tests must pass and cover the code before it goes to PROD).
 * What it touches: creates its own user and one settings record in the test only; nothing is kept.
 */
@IsTest
private class PipelineUserSettingsTest {
  /** A person who holds the Pipeline User permission set, like every real Pipeline user. */
  private static User pipelineUser() {
    Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
    String stamp = String.valueOf(Crypto.getRandomInteger()).replace('-', '');
    User u = new User(
      LastName = 'SettingsTest',
      Alias = 'pus' + stamp.left(4),
      Email = 'pus' + stamp + '@example.com',
      Username = 'pus' + stamp + '@example.com.test',
      ProfileId = p.Id,
      TimeZoneSidKey = 'Australia/Sydney',
      LocaleSidKey = 'en_AU',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
    insert u;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert new PermissionSetAssignment(
        AssigneeId = u.Id,
        PermissionSetId = [
          SELECT Id
          FROM PermissionSet
          WHERE Name = 'Pipeline_User'
          LIMIT 1
        ]
        .Id
      );
    }
    return u;
  }

  @IsTest
  static void aPersonWithNothingSavedReadsNull() {
    User u = pipelineUser();
    System.runAs(u) {
      System.assertEquals(
        null,
        PipelineUserSettings.read(
          PipelineUserSettings.PIPELINE_FIELD,
          AccessLevel.USER_MODE
        )
      );
    }
  }

  @IsTest
  static void theFirstSaveMakesTheOneRecordKeyedByThePersonAndLaterSavesReuseIt() {
    User u = pipelineUser();
    System.runAs(u) {
      PipelineUserSettings.save(
        PipelineUserSettings.PIPELINE_FIELD,
        '{"theme":"light"}',
        AccessLevel.USER_MODE
      );
      PipelineUserSettings.save(
        PipelineUserSettings.PIPELINE_FIELD,
        '{"theme":"dark"}',
        AccessLevel.USER_MODE
      );
      System.assertEquals(
        '{"theme":"dark"}',
        PipelineUserSettings.read(
          PipelineUserSettings.PIPELINE_FIELD,
          AccessLevel.USER_MODE
        )
      );
    }
    List<UserSettings__c> rows = [
      SELECT Name, OwnerId, User_Key__c
      FROM UserSettings__c
      WHERE OwnerId = :u.Id
      WITH SYSTEM_MODE
    ];
    System.assertEquals(1, rows.size(), 'One record per person');
    System.assertEquals('UserSettings', rows[0].Name);
    System.assertEquals(String.valueOf(u.Id), rows[0].User_Key__c);
  }

  @IsTest
  static void eachSolutionsFieldIsSavedOnTheSameRecordWithoutTouchingTheOther() {
    User u = pipelineUser();
    System.runAs(u) {
      PipelineUserSettings.save(
        PipelineUserSettings.PIPELINE_FIELD,
        '{"a":1}',
        AccessLevel.USER_MODE
      );
      PipelineUserSettings.save(
        PipelineUserSettings.CAMPAIGN_FIELD,
        '{"b":2}',
        AccessLevel.SYSTEM_MODE
      );
      PipelineUserSettings.save(
        PipelineUserSettings.PIPELINE_FIELD,
        '{"a":3}',
        AccessLevel.USER_MODE
      );
      System.assertEquals(
        '{"a":3}',
        PipelineUserSettings.read(
          PipelineUserSettings.PIPELINE_FIELD,
          AccessLevel.USER_MODE
        )
      );
      System.assertEquals(
        '{"b":2}',
        PipelineUserSettings.read(
          PipelineUserSettings.CAMPAIGN_FIELD,
          AccessLevel.SYSTEM_MODE
        ),
        'The campaign field is as it was'
      );
    }
    System.assertEquals(
      1,
      [
        SELECT COUNT()
        FROM UserSettings__c
        WHERE OwnerId = :u.Id
        WITH SYSTEM_MODE
      ]
    );
  }

  @IsTest
  static void thePlatformRefusesASecondRecordForTheSamePerson() {
    User u = pipelineUser();
    String key = String.valueOf(u.Id);
    UserSettings__c a = new UserSettings__c(
      Name = 'UserSettings',
      OwnerId = u.Id
    );
    a.put('User_Key__c', key);
    insert a;
    UserSettings__c b = new UserSettings__c(
      Name = 'UserSettings',
      OwnerId = u.Id
    );
    b.put('User_Key__c', key);
    Database.SaveResult r = Database.insert(b, false);
    System.assert(
      !r.isSuccess(),
      'A second record for the same person is refused'
    );
    System.assertEquals(
      StatusCode.DUPLICATE_VALUE,
      r.getErrors()[0].getStatusCode()
    );
  }
}

/**
 * Pipeline: tests for PipelineFilterController.
 *
 * Who calls it: the deploy (Apex tests must pass and cover the code before it goes to PROD).
 * What it touches: creates its own users, teams and filters in the test only; nothing is kept.
 */
@IsTest
private class PipelineFilterControllerTest {
  private static final String JSON_A = '{"kinds":["opp"],"status":"open"}';

  /** A person who holds the Pipeline User permission set, like every real Pipeline user. */
  private static User pipelineUser(String last) {
    Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
    String stamp = String.valueOf(Crypto.getRandomInteger()).replace('-', '');
    User u = new User(
      LastName = last,
      Alias = 'plf' + stamp.left(4),
      Email = 'pf' + stamp + '@example.com',
      Username = 'pf' + stamp + '@example.com.test',
      ProfileId = p.Id,
      TimeZoneSidKey = 'Australia/Sydney',
      LocaleSidKey = 'en_AU',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
    insert u;
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
    return u;
  }

  @IsTest
  static void aPersonSavesListsChangesAndDeletesTheirOwnFilters() {
    User me = pipelineUser('FilterOwner');
    System.runAs(me) {
      PipelineFilterController.FilterRow a = PipelineFilterController.saveFilter(
        null,
        'My hips',
        JSON_A
      );
      PipelineFilterController.saveFilter(
        null,
        'Another',
        '{"kinds":["risk"]}'
      );
      System.assertEquals(2, PipelineFilterController.listFilters().size());
      System.assertEquals(
        'Another',
        PipelineFilterController.listFilters()[0].name,
        'By name'
      );

      PipelineFilterController.FilterRow changed = PipelineFilterController.saveFilter(
        a.id,
        'My hips v2',
        '{"kinds":["opp","risk"]}'
      );
      System.assertEquals('My hips v2', changed.name);
      System.assertEquals(
        2,
        PipelineFilterController.listFilters().size(),
        'Updating does not add one'
      );

      PipelineFilterController.FilterRow renamed = PipelineFilterController.renameFilter(
        a.id,
        '  My hips v3  '
      );
      System.assertEquals('My hips v3', renamed.name, 'Trimmed');
      System.assertEquals(
        '{"kinds":["opp","risk"]}',
        renamed.json,
        'Renaming leaves the choices alone'
      );
      try {
        PipelineFilterController.renameFilter(a.id, '   ');
        System.assert(false, 'A blank name is refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }

      PipelineFilterController.setDefault(a.id);
      System.assertEquals(
        1,
        [
          SELECT COUNT()
          FROM Pipeline_Saved_Filter__c
          WHERE Is_Default__c = TRUE AND OwnerId = :me.Id
        ]
      );
      PipelineFilterController.setDefault(null);
      System.assertEquals(
        0,
        [
          SELECT COUNT()
          FROM Pipeline_Saved_Filter__c
          WHERE Is_Default__c = TRUE AND OwnerId = :me.Id
        ]
      );

      PipelineFilterController.deleteFilter(a.id);
      System.assertEquals(1, PipelineFilterController.listFilters().size());
    }
  }

  @IsTest
  static void aBadNameOrBadJsonIsRefused() {
    User me = pipelineUser('Refuser');
    System.runAs(me) {
      for (String name : new List<String>{ null, '   ', 'x'.repeat(81) }) {
        try {
          PipelineFilterController.saveFilter(null, name, JSON_A);
          System.assert(false, 'Should have been refused');
        } catch (AuraHandledException e) {
          System.assert(true);
        }
      }
      try {
        PipelineFilterController.saveFilter(null, 'Ok', 'not json');
        System.assert(false, 'Should have been refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      System.assertEquals(0, PipelineFilterController.listFilters().size());
    }
  }

  @IsTest
  static void sharingGivesTheOtherPersonTheirOwnCopyAndNobodyElsesFilterCanBeTouched() {
    User me = pipelineUser('Sharer');
    User other = pipelineUser('Receiver');
    Id mine;
    System.runAs(me) {
      mine = PipelineFilterController.saveFilter(null, 'To share', JSON_A).id;
      System.assertEquals(
        1,
        PipelineFilterController.shareWithPeople(mine, new List<Id>{ other.Id })
      );
      List<PipelineFilterController.Person> found = PipelineFilterController.searchPeople(
        'Receiv'
      );
      System.assertEquals(1, found.size());
      System.assertEquals(other.Id, found[0].id);
      System.assertEquals(
        0,
        PipelineFilterController.searchPeople('R').size(),
        'Two letters at least'
      );
      System.assertEquals(
        1,
        PipelineFilterController.searchOwners('Sharer').size(),
        'An owner search finds yourself too'
      );
      System.assertEquals(0, PipelineFilterController.searchOwners('S').size());
    }
    List<Pipeline_Saved_Filter__c> copies = [
      SELECT Name, OwnerId, Filter_Json__c, Is_Default__c
      FROM Pipeline_Saved_Filter__c
      WHERE OwnerId = :other.Id
    ];
    System.assertEquals(1, copies.size(), 'The receiver owns a copy');
    System.assertEquals('To share', copies[0].Name);
    System.assertEquals(JSON_A, copies[0].Filter_Json__c);
    System.assertEquals(false, copies[0].Is_Default__c);
    System.runAs(other) {
      try {
        PipelineFilterController.deleteFilter(mine);
        System.assert(false, 'Should not delete someone else\'s filter');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      PipelineFilterController.deleteFilter(copies[0].Id);
      System.assertEquals(
        0,
        PipelineFilterController.listFilters().size(),
        'The receiver can delete their copy'
      );
    }
    System.assertEquals(
      1,
      [SELECT COUNT() FROM Pipeline_Saved_Filter__c WHERE OwnerId = :me.Id],
      'The original is untouched'
    );
  }

  @IsTest
  static void onlyATeamManagerCanShareWithTheirTeam() {
    User boss = pipelineUser('Boss');
    User member = pipelineUser('Member');
    Team__c t = new Team__c(
      Name = 'Share test team',
      Manager__c = boss.Id,
      Country__c = 'AU',
      States__c = 'NSW',
      Active__c = true
    );
    insert t;
    insert new Team_Member__c(
      Team__c = t.Id,
      User__c = member.Id,
      Active__c = true
    );
    System.runAs(boss) {
      Id f = PipelineFilterController.saveFilter(null, 'Team view', JSON_A).id;
      System.assertEquals(
        1,
        PipelineFilterController.shareWithTeam(f),
        'The member gets a copy; the boss does not copy to themself'
      );
    }
    System.assertEquals(
      1,
      [SELECT COUNT() FROM Pipeline_Saved_Filter__c WHERE OwnerId = :member.Id]
    );
    System.runAs(member) {
      Id f = PipelineFilterController.saveFilter(null, 'Not a manager', JSON_A)
        .id;
      try {
        PipelineFilterController.shareWithTeam(f);
        System.assert(false, 'A member may not share with a team');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      try {
        PipelineFilterController.shareWithPeople(f, new List<Id>());
        System.assert(false, 'Nobody chosen');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
    }
  }
}

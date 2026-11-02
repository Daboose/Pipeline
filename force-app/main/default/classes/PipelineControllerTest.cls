/**
 * Pipeline: tests for PipelineScope and PipelineController.
 *
 * Who calls it: the deploy (Apex tests must pass and cover the code before it goes to PROD).
 * What it touches: creates its own teams, team members, one deal and one setting in the test only; nothing is kept.
 */
@IsTest
private class PipelineControllerTest {
  private static Id recordTypeId(String developerName) {
    return Schema.SObjectType.SalesRisks__c.getRecordTypeInfosByDeveloperName()
      .get(developerName)
      .getRecordTypeId();
  }

  /** A root team managed by the test user, with a child team that has one other member. */
  private static Map<String, Team__c> makeTeams(Id managerId, Id memberId) {
    Team__c root = new Team__c(
      Name = 'Test root team',
      Manager__c = managerId,
      Country__c = 'AU',
      States__c = 'NSW',
      Active__c = true
    );
    insert root;
    Team__c child = new Team__c(
      Name = 'Test child team',
      Parent_Team__c = root.Id,
      Manager__c = memberId,
      Country__c = 'AU',
      States__c = 'NSW',
      Active__c = true
    );
    insert child;
    insert new Team_Member__c(
      Team__c = child.Id,
      User__c = memberId,
      Active__c = true
    );
    return new Map<String, Team__c>{ 'root' => root, 'child' => child };
  }

  private static User otherUser() {
    Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
    String stamp = String.valueOf(Crypto.getRandomInteger()).replace('-', '');
    return new User(
      LastName = 'PipelineTest',
      Alias = 'pltest',
      Email = 'pipelinetest' + stamp + '@example.com',
      Username = 'pipelinetest' + stamp + '@example.com.test',
      ProfileId = p.Id,
      TimeZoneSidKey = 'Australia/Sydney',
      LocaleSidKey = 'en_AU',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
  }

  @IsTest
  static void aMemberSeesOnlyTheirOwnDeals() {
    /* a plain user: whoever deploys may hold the Team Viewer permission, which would make them a manager */
    User plain = pipelineUser();
    System.runAs(plain) {
      PipelineScope.Scope s = PipelineScope.resolve(
        plain.Id,
        PipelineScope.MINE,
        true
      );
      System.assertEquals(
        false,
        s.isManager,
        'No team names this person as manager'
      );
      System.assertEquals(
        new Set<Id>{ plain.Id },
        s.ownerIds,
        'A member sees only their own deals'
      );
      System.assert(s.teams.isEmpty(), 'A member has no teams to pick from');
    }
  }

  @IsTest
  static void aManagerSeesTheirTeamAndEveryTeamBelow() {
    User other = otherUser();
    insert other;
    Map<String, Team__c> teams = makeTeams(UserInfo.getUserId(), other.Id);
    PipelineScope.Scope mine = PipelineScope.resolve(
      UserInfo.getUserId(),
      PipelineScope.MINE,
      true
    );
    System.assertEquals(true, mine.isManager);
    System.assertEquals(
      2,
      mine.teams.size(),
      'Every team is offered to pick from'
    );
    System.assert(
      mine.ownerIds.contains(other.Id),
      'The child team member is in My team'
    );
    System.assertEquals(
      'Test child team',
      mine.teamNameByUser.get(other.Id),
      'The team name is carried beside the person'
    );
    System.assertEquals(
      1,
      [SELECT COUNT() FROM Team__c WHERE Manager__c = :UserInfo.getUserId()],
      'Sanity check: one team is managed by the person'
    );
    Integer minecount = 0;
    for (PipelineScope.TeamInfo ti : mine.teams) {
      if (ti.mine) {
        minecount++;
      }
    }
    System.assertEquals(
      1,
      minecount,
      'Only the team they manage is marked as theirs'
    );
    PipelineScope.Scope justRoot = PipelineScope.resolve(
      UserInfo.getUserId(),
      String.valueOf(teams.get('root').Id),
      false
    );
    System.assert(
      !justRoot.ownerIds.contains(other.Id),
      'Without "everyone below" the child team is left out'
    );
    PipelineScope.Scope noTeam = PipelineScope.resolve(
      UserInfo.getUserId(),
      '',
      true
    );
    System.assertEquals(
      null,
      noTeam.ownerIds,
      'No team: nobody is ruled out by team'
    );
    PipelineScope.Scope otherTeam = PipelineScope.resolve(
      other.Id,
      String.valueOf(teams.get('root').Id),
      true
    );
    System.assert(
      otherTeam.ownerIds.contains(UserInfo.getUserId()),
      'A manager may pick any team; sharing still decides what they can open'
    );
    PipelineScope.Scope junk = PipelineScope.resolve(
      UserInfo.getUserId(),
      'not an id',
      true
    );
    System.assertEquals(
      null,
      junk.ownerIds,
      'A team that is not a team is treated as no team'
    );
  }

  /** A person who holds the Pipeline User permission set, like every real Pipeline user. */
  private static User pipelineUser() {
    User u = otherUser();
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
  static void aTeamViewerGetsTheManagerViewWithoutManagingATeam() {
    User viewer = pipelineUser();
    insert new PermissionSetAssignment(
      AssigneeId = viewer.Id,
      PermissionSetId = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Pipeline_Team_Viewer'
        LIMIT 1
      ]
      .Id
    );
    User plain = pipelineUser();
    Team__c t = new Team__c(
      Name = 'Viewer test team',
      Manager__c = plain.Id,
      Country__c = 'AU',
      States__c = 'NSW',
      Active__c = true
    );
    insert t;
    System.runAs(viewer) {
      PipelineScope.Scope s = PipelineScope.resolve(
        viewer.Id,
        PipelineScope.MINE,
        true
      );
      System.assertEquals(
        true,
        s.isManager,
        'The permission gives the manager view'
      );
      System.assertEquals(false, s.hasOwnTeam, 'but they manage no team');
      System.assertEquals(
        null,
        s.ownerIds,
        'My team means no team for them: everything sharing allows'
      );
      System.assertEquals(1, s.teams.size(), 'Every team can be picked');
      PipelineScope.Scope picked = PipelineScope.resolve(
        viewer.Id,
        String.valueOf(t.Id),
        true
      );
      System.assert(picked.ownerIds.contains(plain.Id));
      System.assertEquals(true, PipelineController.getContext().isManager);
      System.assertEquals(false, PipelineController.getContext().hasOwnTeam);
    }
    System.runAs(plain) {
      PipelineScope.Scope s = PipelineScope.resolve(
        plain.Id,
        PipelineScope.MINE,
        true
      );
      System.assertEquals(true, s.hasOwnTeam, 'A named manager has a team');
    }
  }

  @IsTest
  static void aPersonWithNeitherIsAMember() {
    User plain = pipelineUser();
    System.runAs(plain) {
      PipelineScope.Scope s = PipelineScope.resolve(
        plain.Id,
        PipelineScope.MINE,
        true
      );
      System.assertEquals(false, s.isManager);
      System.assertEquals(new Set<Id>{ plain.Id }, s.ownerIds);
    }
  }

  @IsTest
  static void contextCarriesTheStageOrderAndSettings() {
    User u = pipelineUser();
    System.runAs(u) {
      PipelineController.saveSettings('{"theme":"light"}');
      PipelineController.Context c = PipelineController.getContext();
      System.assertEquals('{"theme":"light"}', c.settingsJson);
      System.assert(
        c.stageOrder.contains('Plan'),
        'Stages come from the picklist'
      );
      System.assertEquals(false, c.isManager);
      System.assert(
        c.countries.contains('AU'),
        'Countries come from the Teams picklist'
      );
      System.assert(
        c.stateCodes.contains('NSW'),
        'Australian states come from the Teams picklist'
      );
      System.assert(
        c.portfolios.contains('Hip'),
        'Portfolios come from the deal picklist'
      );
      System.assert(
        !c.portfolios.contains('ROSA'),
        'ROSA is a type, not a portfolio'
      );
      System.assert(c.brands.size() > 0 && c.quarters.contains('Q1'));
      PipelineController.saveSettings('{"theme":"dark"}');
      System.assertEquals(
        '{"theme":"dark"}',
        PipelineController.getContext().settingsJson,
        'A second save changes the same record'
      );
      System.assertEquals(
        1,
        [SELECT COUNT() FROM Pipeline_User_Setting__c WHERE OwnerId = :u.Id]
      );
    }
  }

  @IsTest
  static void badSettingsAreRefused() {
    User u = pipelineUser();
    System.runAs(u) {
      try {
        PipelineController.saveSettings('not json');
        System.assert(false, 'Should have been refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
      try {
        PipelineController.saveSettings(null);
        System.assert(false, 'Should have been refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
    }
  }

  @IsTest
  static void dealsComeBackByKind() {
    List<SalesRisks__c> deals = new List<SalesRisks__c>{
      new SalesRisks__c(
        RecordTypeId = recordTypeId('AUHIP'),
        Stage__c = 'Plan',
        Expected_Closure_Quarter__c = 'Q4',
        Expected_Closing_Year__c = '2033',
        AmountPerYear__c = 1000
      ),
      new SalesRisks__c(
        RecordTypeId = recordTypeId('AURISK'),
        Stage__c = 'Unhappy',
        Expected_Closure_Quarter__c = 'Q4',
        AmountPerYear__c = 500
      ),
      new SalesRisks__c(
        RecordTypeId = recordTypeId('AUROSA'),
        Stage__c = 'Sales Pipeline',
        ROSAGrowthDollar__c = 2000
      )
    };
    insert deals;
    PipelineController.DealResult opp = PipelineController.getDeals(
      '{"kinds":["opp"],"status":"open","closedMonths":3,"below":true}'
    );
    PipelineController.DealResult all = PipelineController.getDeals(
      '{"kinds":["opp","risk","rosa"],"status":"both","closedMonths":3,"below":true}'
    );
    System.assertEquals(1, opp.deals.size(), 'One opportunity');
    PipelineController.DealResult byStage = PipelineController.getDeals(
      '{"kinds":["opp","risk","rosa"],"stages":["Plan","Unhappy"],"closedMonths":3,"below":true}'
    );
    System.assertEquals(
      2,
      byStage.deals.size(),
      'Only the chosen stages come back'
    );
    PipelineController.DealResult allClosedRange = PipelineController.getDeals(
      '{"kinds":["opp"],"stages":["Plan","Conversion"],"closedMonths":999,"below":true}'
    );
    System.assertEquals(1, allClosedRange.deals.size());
    System.assertEquals('opp', opp.deals[0].kind);
    System.assertEquals(3, all.deals.size(), 'All three kinds');
    Map<String, PipelineController.Deal> byKind = new Map<String, PipelineController.Deal>();
    for (PipelineController.Deal d : all.deals) {
      byKind.put(d.kind, d);
    }
    System.assertEquals(500, byKind.get('risk').value);
    System.assertEquals(
      2000,
      byKind.get('rosa').value,
      'ROSA uses ROSA Growth $'
    );
    System.assertEquals('Hip', byKind.get('opp').segment);
    System.assertEquals(
      'Q4 2033',
      byKind.get('opp').quarter,
      'The quarter comes with its year'
    );
    System.assertEquals(
      'Q4',
      byKind.get('risk').quarter,
      'A quarter with no year stays as it is'
    );
    System.assertEquals(
      0,
      PipelineController.getDeals('{"kinds":[],"status":"open","below":true}')
        .deals.size(),
      'No kinds, no deals'
    );
  }

  @IsTest
  static void closeQuarterJoinsQuarterAndYear() {
    System.assertEquals(
      'Q1 2027',
      PipelineController.closeQuarter('Q1', '2027')
    );
    System.assertEquals('Q2', PipelineController.closeQuarter('Q2', null));
    System.assertEquals(null, PipelineController.closeQuarter(null, '2027'));
    System.assertEquals(null, PipelineController.closeQuarter('', '2027'));
  }
}

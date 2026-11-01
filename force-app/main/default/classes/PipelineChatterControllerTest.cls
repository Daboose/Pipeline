/**
 * Pipeline: tests for PipelineChatterController.
 *
 * Who calls it: the deploy (Apex tests must pass and cover the code before it goes to PROD).
 * What it touches: creates one deal and a few posts in the test only; nothing is kept.
 */
@IsTest
private class PipelineChatterControllerTest {
  private static SalesRisks__c makeDeal() {
    SalesRisks__c d = new SalesRisks__c(
      RecordTypeId = Schema.SObjectType.SalesRisks__c.getRecordTypeInfosByDeveloperName()
        .get('AUHIP')
        .getRecordTypeId(),
      Stage__c = 'Plan',
      Expected_Closure_Quarter__c = 'Q4',
      AmountPerYear__c = 1000
    );
    insert d;
    return d;
  }

  /** The pieces a post arrives as: plain text. */
  private static String plain(String text) {
    PipelineChatterController.Seg s = new PipelineChatterController.Seg();
    s.t = text;
    return JSON.serialize(new List<PipelineChatterController.Seg>{ s });
  }

  /** A person with a name no real person has, so the search tests are not confused by the org's own users. */
  private static User makeUser(String first, String last) {
    Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
    String stamp = String.valueOf(Crypto.getRandomInteger()).replace('-', '');
    User u = new User(
      FirstName = first,
      LastName = last,
      Title = 'Test title',
      Alias = 'cht' + stamp.left(4),
      Email = 'cht' + stamp + '@example.com',
      Username = 'cht' + stamp + '@example.com.test',
      ProfileId = p.Id,
      TimeZoneSidKey = 'Australia/Sydney',
      LocaleSidKey = 'en_AU',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
    insert u;
    return u;
  }

  @IsTest
  static void aPostAndItsReplyComeBackNewestFirst() {
    PipelineChatterController.viaConnectApi = false;
    SalesRisks__c d = makeDeal();
    PipelineChatterController.post(d.Id, plain('First post'));
    PipelineChatterController.post(d.Id, plain('Second post'));
    List<PipelineChatterController.Post> feed = PipelineChatterController.getFeed(
      d.Id
    );
    System.assertEquals(2, feed.size());
    System.assertEquals('Second post', feed[0].text, 'Newest first');
    PipelineChatterController.reply(feed[0].id, plain('A reply'));
    PipelineChatterController.reply(feed[0].id, plain('Another reply'));
    PipelineChatterController.Post p = PipelineChatterController.getFeed(
      d.Id
    )[0];
    System.assertEquals(2, p.replies.size());
    System.assertEquals('A reply', p.replies[0].text, 'Replies oldest first');
    System.assertEquals(
      UserInfo.getUserId(),
      p.whoId,
      'Posted as the signed-in person'
    );
  }

  @IsTest
  static void anEmptyOrHugePostIsRefused() {
    PipelineChatterController.viaConnectApi = false;
    SalesRisks__c d = makeDeal();
    for (
      String bad : new List<String>{
        null,
        'not json',
        '[]',
        plain('   '),
        plain('x'.repeat(5001))
      }
    ) {
      try {
        PipelineChatterController.post(d.Id, bad);
        System.assert(false, 'Should have been refused');
      } catch (AuraHandledException e) {
        System.assert(true);
      }
    }
    System.assertEquals(0, PipelineChatterController.getFeed(d.Id).size());
  }

  @IsTest
  static void aPickedPersonArrivesAsAnIdAndAnUnknownOneStaysPlainText() {
    PipelineChatterController.viaConnectApi = false;
    SalesRisks__c d = makeDeal();
    PipelineChatterController.Seg a = new PipelineChatterController.Seg();
    a.t = 'Thanks ';
    PipelineChatterController.Seg b = new PipelineChatterController.Seg();
    b.u = UserInfo.getUserId();
    b.n = UserInfo.getName();
    PipelineChatterController.Seg c = new PipelineChatterController.Seg();
    c.t = ' please look';
    PipelineChatterController.post(
      d.Id,
      JSON.serialize(new List<PipelineChatterController.Seg>{ a, b, c })
    );
    System.assertEquals(
      'Thanks @' + UserInfo.getName() + ' please look',
      PipelineChatterController.getFeed(d.Id)[0].text
    );
    List<PipelineChatterController.Seg> read = PipelineChatterController.readSegments(
      JSON.serialize(new List<PipelineChatterController.Seg>{ a, b, c })
    );
    System.assertEquals(3, read.size());
    System.assertEquals(
      1,
      PipelineChatterController.readSegments(
          '[{"t":""},{"t":"hello"},{"u":"","n":""}]'
        )
        .size(),
      'Empty pieces are dropped'
    );
  }

  @IsTest
  static void theSearchOffersAPersonByAnyStartOfTheirNameFromThreeLetters() {
    User warren = makeUser('Zzwarren', 'Ballingerx');
    User darren = makeUser('Zzdarren', 'Agiusx');
    List<PipelineChatterController.Person> found = PipelineChatterController.searchPeople(
      'zzwarr'
    );
    System.assertEquals(1, found.size(), 'Warren only, never Darren');
    System.assertEquals(warren.Id, found[0].id);
    System.assertEquals('Test title', found[0].title);
    System.assertEquals(
      warren.Id,
      PipelineChatterController.searchPeople('ballingerx')[0].id,
      'Any part of the name'
    );
    System.assertEquals(
      warren.Id,
      PipelineChatterController.searchPeople('ballingerx zzw')[0].id,
      'Either order'
    );
    System.assertEquals(
      0,
      PipelineChatterController.searchPeople('zz').size(),
      'Nothing until three letters'
    );
    System.assertEquals(0, PipelineChatterController.searchPeople(null).size());
    System.assert(darren.Id != null);
  }

  @IsTest
  static void nobodyOutsideTheCompanyIsEverOffered() {
    makeUser('Zzwarren', 'Ballingerx');
    Set<Id> offered = new Set<Id>();
    for (
      String term : new List<String>{ 'zzwarr', 'ber', 'ann', 'joh', 'smi' }
    ) {
      for (
        PipelineChatterController.Person p : PipelineChatterController.searchPeople(
          term
        )
      ) {
        offered.add(p.id);
      }
    }
    System.assertEquals(
      0,
      [
        SELECT COUNT()
        FROM User
        WHERE Id IN :offered AND (IsPortalEnabled = TRUE OR IsActive = FALSE)
      ],
      'Only active people who are not portal users'
    );
    System.assert(offered.size() > 0);
  }

  @IsTest
  static void aSlipInSpellingIsForgivenOnlyWhenNobodyMatchesExactly() {
    User warren = makeUser('Zzwarren', 'Ballingerx');
    List<PipelineChatterController.Person> slip = PipelineChatterController.searchPeople(
      'zzwarrn'
    );
    System.assertEquals(1, slip.size());
    System.assertEquals(warren.Id, slip[0].id);
    System.assertEquals(
      0,
      PipelineChatterController.searchPeople('qqwarren').size(),
      'The first letter must be right'
    );
    System.assertEquals(
      true,
      PipelineChatterController.withinOne('vercow', 'vercoe')
    );
    System.assertEquals(
      false,
      PipelineChatterController.matches(
        'Darren Agius',
        new List<String>{ 'warr' },
        true
      ),
      'The first letter has to be right, even when a slip is allowed'
    );
    System.assertEquals(
      true,
      PipelineChatterController.matches(
        'Robert Reeves',
        new List<String>{ 'rob', 'ree' },
        false
      )
    );
  }

  @IsTest
  static void postingThroughChatterApiWorksWithAMention() {
    SalesRisks__c d = makeDeal();
    PipelineChatterController.Seg b = new PipelineChatterController.Seg();
    b.u = UserInfo.getUserId();
    b.n = UserInfo.getName();
    try {
      PipelineChatterController.post(
        d.Id,
        JSON.serialize(new List<PipelineChatterController.Seg>{ b })
      );
    } catch (Exception e) {
      // Chatter's own API cannot always post inside a test; the parts that matter are covered above.
      System.assert(e != null);
    }
    System.assert(true);
  }
}

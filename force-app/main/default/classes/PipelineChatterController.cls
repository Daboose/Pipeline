/**
 * Pipeline: reads and writes Chatter on a deal, for the deal flyout (the pipelineChatter component).
 *
 * Who calls it: the pipelineChatter component, and PipelineChatterControllerTest.
 * What it touches: reads the deal's own feed (SalesRisks__Feed and its FeedComments) in the signed-in person's own access, and
 * posts a new feed post or a reply as that person. It changes nothing else. A post on a deal is what moves the deal's
 * Latest Chatter Date (an existing Salesforce process does that, not this class), so posting here is the same as posting
 * on the deal page.
 *
 * @mentions: the person picks each name from a list of people (the pipelineMentionBox component), so a mention arrives as
 * the person's Id, never as typed text; it becomes a real Chatter mention and Salesforce's own notification goes to them,
 * the same as the standard feed. A mention whose person cannot be found or is no longer active is kept as plain "@Name".
 * searchPeople finds the people for that list.
 */
public with sharing class PipelineChatterController {
  private static final Integer MAX_POSTS = 50;

  /** True posts through Chatter's own API (mentions, notifications). Tests switch it off to post with plain inserts. */
  @TestVisible
  private static Boolean viaConnectApi = true;

  public class Reply {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String who;
    @AuraEnabled
    public Id whoId;
    @AuraEnabled
    public Datetime posted;
    @AuraEnabled
    public String text;
  }

  public class Post {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String who;
    @AuraEnabled
    public Id whoId;
    @AuraEnabled
    public Datetime posted;
    @AuraEnabled
    public String text;
    @AuraEnabled
    public List<Reply> replies = new List<Reply>();
  }

  /** The newest posts on the deal, each with its replies oldest first. */
  @AuraEnabled
  public static List<Post> getFeed(Id dealId) {
    List<Post> out = new List<Post>();
    // The deal's own feed table is read, not FeedItem: Salesforce refuses a direct FeedItem query from anyone without
    // View All Data ("FeedItem requires a filter by Id"), even when it is filtered by the deal.
    for (SalesRisks__Feed f : [
      SELECT
        Id,
        Body,
        CreatedDate,
        CreatedBy.Name,
        CreatedById,
        Type,
        (
          SELECT Id, CommentBody, CreatedDate, CreatedBy.Name, CreatedById
          FROM FeedComments
          ORDER BY CreatedDate ASC, Id ASC
          LIMIT 50
        )
      FROM SalesRisks__Feed
      WHERE
        ParentId = :dealId
        AND Type IN ('TextPost', 'LinkPost', 'ContentPost')
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT :MAX_POSTS
    ]) {
      Post p = new Post();
      p.id = f.Id;
      p.who = f.CreatedBy.Name;
      p.whoId = f.CreatedById;
      p.posted = f.CreatedDate;
      p.text = String.isBlank(f.Body) ? '(a file or a link)' : f.Body;
      for (FeedComment c : f.FeedComments) {
        Reply r = new Reply();
        r.id = c.Id;
        r.who = c.CreatedBy.Name;
        r.whoId = c.CreatedById;
        r.posted = c.CreatedDate;
        r.text = c.CommentBody;
        p.replies.add(r);
      }
      out.add(p);
    }
    return out;
  }

  /** One piece of a post: plain text (t), or a mention of a person (u = their Id, n = their name as it was picked). */
  public class Seg {
    public String t;
    public String u;
    public String n;
  }

  /** Posts on the deal as the signed-in person. The text arrives as pieces: [{"t":"Thanks "},{"u":"005...","n":"Ann Lee"}]. */
  @AuraEnabled
  public static void post(Id dealId, String segmentsJson) {
    List<Seg> segs = readSegments(segmentsJson);
    if (!viaConnectApi) {
      insert as user new FeedItem(ParentId = dealId, Body = plainText(segs));
      return;
    }
    ConnectApi.FeedItemInput input = new ConnectApi.FeedItemInput();
    input.subjectId = dealId;
    input.body = bodyInput(segs);
    ConnectApi.ChatterFeeds.postFeedElement(null, input);
  }

  /** Replies to a post as the signed-in person (the text arrives as pieces, as for post). */
  @AuraEnabled
  public static void reply(Id feedItemId, String segmentsJson) {
    List<Seg> segs = readSegments(segmentsJson);
    if (!viaConnectApi) {
      insert as user new FeedComment(
        FeedItemId = feedItemId,
        CommentBody = plainText(segs)
      );
      return;
    }
    ConnectApi.CommentInput input = new ConnectApi.CommentInput();
    input.body = bodyInput(segs);
    ConnectApi.ChatterFeeds.postCommentToFeedElement(
      null,
      feedItemId,
      input,
      null
    );
  }

  @TestVisible
  private static List<Seg> readSegments(String segmentsJson) {
    List<Seg> segs;
    try {
      segs = (List<Seg>) JSON.deserialize(segmentsJson, List<Seg>.class);
    } catch (Exception e) {
      throw new AuraHandledException('Write something to post.');
    }
    List<Seg> out = new List<Seg>();
    for (Seg s : segs == null ? new List<Seg>() : segs) {
      if (s != null && (!String.isEmpty(s.t) || !String.isBlank(s.u))) {
        out.add(s);
      }
    }
    String text = plainText(out);
    if (text.trim().length() == 0) {
      throw new AuraHandledException('Write something to post.');
    }
    if (text.length() > 5000) {
      throw new AuraHandledException(
        'That post is too long (the limit is 5000 characters).'
      );
    }
    return out;
  }

  /** The pieces as one line of text, mentions written as @Name (what a plain post would hold). */
  private static String plainText(List<Seg> segs) {
    String out = '';
    for (Seg s : segs) {
      out += String.isBlank(s.u) ? s.t : '@' + (s.n == null ? '' : s.n);
    }
    return out;
  }

  /** The pieces for Chatter: plain text, and a real mention for each person who exists and is active. */
  private static ConnectApi.MessageBodyInput bodyInput(List<Seg> segs) {
    Set<Id> wanted = new Set<Id>();
    for (Seg s : segs) {
      if (!String.isBlank(s.u) && s.u instanceof Id) {
        wanted.add((Id) s.u);
      }
    }
    Set<Id> real = new Set<Id>();
    if (!wanted.isEmpty()) {
      for (User u : [
        SELECT Id
        FROM User
        WHERE IsActive = TRUE AND IsPortalEnabled = FALSE AND Id IN :wanted
        WITH USER_MODE
      ]) {
        real.add(u.Id);
      }
    }
    ConnectApi.MessageBodyInput body = new ConnectApi.MessageBodyInput();
    body.messageSegments = new List<ConnectApi.MessageSegmentInput>();
    for (Seg s : segs) {
      if (
        !String.isBlank(s.u) &&
        s.u instanceof Id &&
        real.contains((Id) s.u)
      ) {
        ConnectApi.MentionSegmentInput m = new ConnectApi.MentionSegmentInput();
        m.id = (Id) s.u;
        body.messageSegments.add(m);
      } else {
        ConnectApi.TextSegmentInput t = new ConnectApi.TextSegmentInput();
        t.text = String.isBlank(s.u) ? s.t : '@' + (s.n == null ? '' : s.n);
        body.messageSegments.add(t);
      }
    }
    return body;
  }

  public class Person {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String title;
  }

  private static final Integer MAX_PEOPLE = 8;

  /**
   * The people to offer when someone types @ and at least three letters. Active, internal people only (never an external
   * portal user, so nobody outside the company is offered or mentioned). A name matches when every
   * word typed begins a word of the name, in any order. Only if nobody matches that way is one slip in spelling
   * forgiven (the first letter must still be right), so "warr" gives Warren and never Darren.
   */
  @AuraEnabled
  public static List<Person> searchPeople(String term) {
    List<String> words = new List<String>();
    for (
      String w : (term == null ? '' : term.trim().toLowerCase()).split('\\s+')
    ) {
      String clean = w.replaceAll('[^\\p{L}\'.\\-]', '');
      if (clean.length() > 0 && words.size() < 3) {
        words.add(clean);
      }
    }
    if (words.isEmpty() || String.join(words, ' ').length() < 3) {
      return new List<Person>();
    }
    String starts = words[0] + '%';
    String after = '% ' + words[0] + '%';
    List<User> exact = new List<User>();
    for (User u : [
      SELECT Id, Name, Title
      FROM User
      WHERE
        IsActive = TRUE
        AND IsPortalEnabled = FALSE
        AND UserType = 'Standard'
        AND (Name LIKE :starts
        OR Name LIKE :after)
      WITH USER_MODE
      ORDER BY Name
      LIMIT 200
    ]) {
      if (matches(u.Name, words, false)) {
        exact.add(u);
      }
    }
    if (exact.isEmpty()) {
      String first = words[0].left(1) + '%';
      String firstAfter = '% ' + words[0].left(1) + '%';
      for (User u : [
        SELECT Id, Name, Title
        FROM User
        WHERE
          IsActive = TRUE
          AND IsPortalEnabled = FALSE
          AND UserType = 'Standard'
          AND (Name LIKE :first
          OR Name LIKE :firstAfter)
        WITH USER_MODE
        ORDER BY Name
        LIMIT 500
      ]) {
        if (matches(u.Name, words, true)) {
          exact.add(u);
        }
      }
    }
    List<Person> out = new List<Person>();
    for (User u : exact) {
      if (u.Name.toLowerCase().startsWith(words[0])) {
        out.add(personOf(u));
      }
    }
    for (User u : exact) {
      if (!u.Name.toLowerCase().startsWith(words[0])) {
        out.add(personOf(u));
      }
    }
    while (out.size() > MAX_PEOPLE) {
      out.remove(out.size() - 1);
    }
    return out;
  }

  private static Person personOf(User u) {
    Person p = new Person();
    p.id = u.Id;
    p.name = u.Name;
    p.title = u.Title;
    return p;
  }

  /** Does every typed word begin a word of the name (or, when slips are allowed, come within one slip of one)? */
  @TestVisible
  private static Boolean matches(
    String name,
    List<String> typed,
    Boolean slips
  ) {
    List<String> nameWords = name.toLowerCase().split('\\s+');
    for (String q : typed) {
      Boolean found = false;
      for (String w : nameWords) {
        if (
          w.startsWith(q) ||
          (slips &&
          q.length() >= 4 &&
          w.left(1) == q.left(1) &&
          withinOne(q, w))
        ) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  }

  /** Is q within one slip (one letter wrong, missing or extra) of the start of w? */
  @TestVisible
  private static Boolean withinOne(String q, String w) {
    for (Integer len = q.length() - 1; len <= q.length() + 1; len++) {
      if (len > 0 && len <= w.length() && distance(q, w.left(len)) <= 1) {
        return true;
      }
    }
    return false;
  }

  private static Integer distance(String a, String b) {
    List<Integer> prev = new List<Integer>();
    for (Integer j = 0; j <= b.length(); j++) {
      prev.add(j);
    }
    for (Integer i = 1; i <= a.length(); i++) {
      List<Integer> cur = new List<Integer>{ i };
      for (Integer j = 1; j <= b.length(); j++) {
        Integer sub =
          prev[j - 1] +
          (a.substring(i - 1, i) == b.substring(j - 1, j) ? 0 : 1);
        cur.add(Math.min(Math.min(prev[j] + 1, cur[j - 1] + 1), sub));
      }
      prev = cur;
    }
    return prev[b.length()];
  }
}

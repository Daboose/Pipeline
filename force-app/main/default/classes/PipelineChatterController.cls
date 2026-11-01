/**
 * Pipeline: reads and writes Chatter on a deal, for the deal flyout (the pipelineChatter component).
 *
 * Who calls it: the pipelineChatter component, and PipelineChatterControllerTest.
 * What it touches: reads FeedItem and FeedComment on one deal (SalesRisks__c) in the signed-in person's own access, and
 * posts a new feed post or a reply as that person. It changes nothing else. A post on a deal is what moves the deal's
 * Latest Chatter Date (an existing Salesforce process does that, not this class), so posting here is the same as posting
 * on the deal page.
 *
 * @Name mentions: a person written as @First Last (an active user, matched by full name) becomes a real Chatter mention,
 * so Salesforce's own notification goes to them, the same as the standard feed.
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
    for (FeedItem f : [
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
      FROM FeedItem
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

  /** Posts on the deal as the signed-in person. */
  @AuraEnabled
  public static void post(Id dealId, String text) {
    String body = clean(text);
    if (!viaConnectApi) {
      insert as user new FeedItem(ParentId = dealId, Body = body);
      return;
    }
    ConnectApi.FeedItemInput input = new ConnectApi.FeedItemInput();
    input.subjectId = dealId;
    input.body = bodyInput(body);
    ConnectApi.ChatterFeeds.postFeedElement(null, input);
  }

  /** Replies to a post as the signed-in person. */
  @AuraEnabled
  public static void reply(Id feedItemId, String text) {
    String body = clean(text);
    if (!viaConnectApi) {
      insert as user new FeedComment(
        FeedItemId = feedItemId,
        CommentBody = body
      );
      return;
    }
    ConnectApi.CommentInput input = new ConnectApi.CommentInput();
    input.body = bodyInput(body);
    ConnectApi.ChatterFeeds.postCommentToFeedElement(
      null,
      feedItemId,
      input,
      null
    );
  }

  private static String clean(String text) {
    String t = text == null ? '' : text.trim();
    if (t.length() == 0) {
      throw new AuraHandledException('Write something to post.');
    }
    if (t.length() > 5000) {
      throw new AuraHandledException(
        'That post is too long (the limit is 5000 characters).'
      );
    }
    return t;
  }

  /** The text split into plain pieces and mentions of real, active people. */
  private static ConnectApi.MessageBodyInput bodyInput(String text) {
    Set<String> candidates = candidateNames(text);
    Map<String, Id> idByName = new Map<String, Id>();
    if (!candidates.isEmpty()) {
      for (User u : [
        SELECT Id, Name
        FROM User
        WHERE IsActive = TRUE AND Name IN :candidates
        LIMIT 200
      ]) {
        idByName.put(u.Name.toLowerCase(), u.Id);
      }
    }
    ConnectApi.MessageBodyInput body = new ConnectApi.MessageBodyInput();
    body.messageSegments = new List<ConnectApi.MessageSegmentInput>();
    for (Piece p : splitMentions(text, idByName)) {
      if (p.userId == null) {
        ConnectApi.TextSegmentInput t = new ConnectApi.TextSegmentInput();
        t.text = p.text;
        body.messageSegments.add(t);
      } else {
        ConnectApi.MentionSegmentInput m = new ConnectApi.MentionSegmentInput();
        m.id = p.userId;
        body.messageSegments.add(m);
      }
    }
    return body;
  }

  /** One piece of a post: plain text, or (when userId is set) a mention of that person. */
  public class Piece {
    public String text;
    public Id userId;
  }

  /** Every one, two or three words that follow an @ in the text: the names that might be people. */
  @TestVisible
  private static Set<String> candidateNames(String text) {
    Set<String> out = new Set<String>();
    Matcher m = Pattern.compile(
        '@([\\p{L}][\\p{L}\'\\-\\.]*(?: [\\p{L}][\\p{L}\'\\-\\.]*){0,2})'
      )
      .matcher(text);
    while (m.find()) {
      List<String> words = m.group(1).split(' ');
      for (Integer n = 1; n <= words.size(); n++) {
        out.add(String.join(slice(words, n), ' '));
      }
    }
    return out;
  }

  /**
   * Splits the text at each @Name that matches a known person (the longest name that matches wins, so "@Tom Becker
   * please" mentions Tom Becker, not "Tom"). An @ that matches nobody stays plain text.
   */
  @TestVisible
  private static List<Piece> splitMentions(
    String text,
    Map<String, Id> idByLowerName
  ) {
    List<Piece> out = new List<Piece>();
    Matcher m = Pattern.compile(
        '@([\\p{L}][\\p{L}\'\\-\\.]*(?: [\\p{L}][\\p{L}\'\\-\\.]*){0,2})'
      )
      .matcher(text);
    Integer at = 0;
    while (m.find()) {
      List<String> words = m.group(1).split(' ');
      for (Integer n = words.size(); n >= 1; n--) {
        String name = String.join(slice(words, n), ' ');
        if (idByLowerName.containsKey(name.toLowerCase())) {
          if (m.start() > at) {
            out.add(plain(text.substring(at, m.start())));
          }
          Piece p = new Piece();
          p.userId = idByLowerName.get(name.toLowerCase());
          out.add(p);
          at = m.start() + 1 + name.length();
          break;
        }
      }
    }
    if (at < text.length()) {
      out.add(plain(text.substring(at)));
    }
    return out;
  }

  private static Piece plain(String s) {
    Piece p = new Piece();
    p.text = s;
    return p;
  }

  private static List<String> slice(List<String> words, Integer n) {
    List<String> out = new List<String>();
    for (Integer i = 0; i < n; i++) {
      out.add(words[i]);
    }
    return out;
  }
}

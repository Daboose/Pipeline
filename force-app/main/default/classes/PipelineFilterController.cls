/**
 * Pipeline: a person's saved filters (the "My filters" part of the Pipeline screen).
 *
 * Who calls it: the pipelineFilters component and the pipelineApp component, and PipelineFilterControllerTest.
 * What it touches: reads, creates, changes and deletes Pipeline_Saved_Filter__c records that the signed-in person owns,
 * reads active users (to find a person to share with), and reads the Teams through PipelineScope (so a team manager can
 * share with their team). It never touches a deal.
 *
 * Rules (Robert, 2026-10-24): a filter is the person's own; one of them may be the default Pipeline opens on; sharing
 * gives the other person their own copy (they own it and may change or delete it), to a named person or, for a team
 * manager, to everyone on their team; never to everybody.
 */
public with sharing class PipelineFilterController {
  private static final Integer MAX_FILTERS = 50;
  private static final Integer MAX_PEOPLE = 25;

  public class FilterRow {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String json;
    @AuraEnabled
    public Boolean isDefault;
  }

  public class Person {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String title;
  }

  private static FilterRow rowOf(Pipeline_Saved_Filter__c f) {
    FilterRow r = new FilterRow();
    r.id = f.Id;
    r.name = f.Name;
    r.json = f.Filter_Json__c;
    r.isDefault = f.Is_Default__c;
    return r;
  }

  /** The signed-in person's filters, by name. */
  @AuraEnabled
  public static List<FilterRow> listFilters() {
    List<FilterRow> out = new List<FilterRow>();
    for (Pipeline_Saved_Filter__c f : [
      SELECT Id, Name, Filter_Json__c, Is_Default__c
      FROM Pipeline_Saved_Filter__c
      WHERE OwnerId = :UserInfo.getUserId()
      WITH USER_MODE
      ORDER BY Name
      LIMIT :MAX_FILTERS
    ]) {
      out.add(rowOf(f));
    }
    return out;
  }

  /** Saves a new filter, or (when existingId is given) replaces what an existing one of the person's holds. */
  @AuraEnabled
  public static FilterRow saveFilter(
    Id existingId,
    String name,
    String filterJson
  ) {
    String nm = name == null ? '' : name.trim();
    if (nm.length() == 0 || nm.length() > 80) {
      throw new AuraHandledException(
        'Give the filter a name of up to 80 characters.'
      );
    }
    checkJson(filterJson);
    Pipeline_Saved_Filter__c f;
    if (existingId != null) {
      f = ownFilter(existingId);
      f.Name = nm;
      f.Filter_Json__c = filterJson;
      update as user f;
    } else {
      if (
        [
          SELECT COUNT()
          FROM Pipeline_Saved_Filter__c
          WHERE OwnerId = :UserInfo.getUserId()
        ] >= MAX_FILTERS
      ) {
        throw new AuraHandledException(
          'You already have ' + MAX_FILTERS + ' filters. Delete one first.'
        );
      }
      f = new Pipeline_Saved_Filter__c(
        Name = nm,
        Filter_Json__c = filterJson,
        Is_Default__c = false
      );
      insert as user f;
    }
    return rowOf(f);
  }

  @AuraEnabled
  public static void deleteFilter(Id filterId) {
    delete as user ownFilter(filterId);
  }

  /** Makes one filter the one Pipeline opens on (every other of the person's filters is cleared). Null clears them all. */
  @AuraEnabled
  public static void setDefault(Id filterId) {
    List<Pipeline_Saved_Filter__c> changed = new List<Pipeline_Saved_Filter__c>();
    for (Pipeline_Saved_Filter__c f : [
      SELECT Id, Is_Default__c
      FROM Pipeline_Saved_Filter__c
      WHERE OwnerId = :UserInfo.getUserId()
      WITH USER_MODE
    ]) {
      Boolean want = f.Id == filterId;
      if (f.Is_Default__c != want) {
        f.Is_Default__c = want;
        changed.add(f);
      }
    }
    update as user changed;
  }

  /** Active people whose name contains the text (at least two letters), for choosing who to share with. */
  @AuraEnabled
  public static List<Person> searchPeople(String term) {
    List<Person> out = new List<Person>();
    String t = term == null ? '' : term.trim();
    if (t.length() < 2) {
      return out;
    }
    String pattern = '%' + String.escapeSingleQuotes(t) + '%';
    for (User u : [
      SELECT Id, Name, Title
      FROM User
      WHERE
        IsActive = TRUE
        AND UserType = 'Standard'
        AND Id != :UserInfo.getUserId()
        AND Name LIKE :pattern
      WITH USER_MODE
      ORDER BY Name
      LIMIT 10
    ]) {
      Person p = new Person();
      p.id = u.Id;
      p.name = u.Name;
      p.title = u.Title;
      out.add(p);
    }
    return out;
  }

  /** Active people (anyone, yourself included) whose name contains the text, for choosing an owner to look at. */
  @AuraEnabled
  public static List<Person> searchOwners(String term) {
    List<Person> out = new List<Person>();
    String t = term == null ? '' : term.trim();
    if (t.length() < 2) {
      return out;
    }
    String pattern = '%' + String.escapeSingleQuotes(t) + '%';
    for (User u : [
      SELECT Id, Name, Title
      FROM User
      WHERE IsActive = TRUE AND UserType = 'Standard' AND Name LIKE :pattern
      WITH USER_MODE
      ORDER BY Name
      LIMIT 8
    ]) {
      Person p = new Person();
      p.id = u.Id;
      p.name = u.Name;
      p.title = u.Title;
      out.add(p);
    }
    return out;
  }

  /** Gives each named person their own copy of the filter. Returns how many copies were made. */
  @AuraEnabled
  public static Integer shareWithPeople(Id filterId, List<Id> userIds) {
    if (userIds == null || userIds.isEmpty()) {
      throw new AuraHandledException('Choose who to share with.');
    }
    if (userIds.size() > MAX_PEOPLE) {
      throw new AuraHandledException(
        'Share with up to ' + MAX_PEOPLE + ' people at a time.'
      );
    }
    return copyTo(ownFilter(filterId), new Set<Id>(userIds));
  }

  /** A team manager gives everyone on their team (and every team below) their own copy. Others are refused. */
  @AuraEnabled
  public static Integer shareWithTeam(Id filterId) {
    PipelineScope.Scope s = PipelineScope.resolve(
      UserInfo.getUserId(),
      PipelineScope.MINE,
      true
    );
    if (!s.hasOwnTeam) {
      throw new AuraHandledException(
        'Only a team manager can share with a team.'
      );
    }
    Set<Id> people = new Set<Id>(
      s.ownerIds == null ? new Set<Id>() : s.ownerIds
    );
    people.remove(UserInfo.getUserId());
    if (people.isEmpty()) {
      throw new AuraHandledException(
        'There is nobody else on your team to share with.'
      );
    }
    return copyTo(ownFilter(filterId), people);
  }

  private static Integer copyTo(
    Pipeline_Saved_Filter__c source,
    Set<Id> userIds
  ) {
    Set<Id> active = new Map<Id, User>(
        [
          SELECT Id
          FROM User
          WHERE IsActive = TRUE AND UserType = 'Standard' AND Id IN :userIds
        ]
      )
      .keySet();
    List<Pipeline_Saved_Filter__c> copies = new List<Pipeline_Saved_Filter__c>();
    for (Id u : active) {
      if (u != UserInfo.getUserId()) {
        copies.add(
          new Pipeline_Saved_Filter__c(
            Name = source.Name,
            Filter_Json__c = source.Filter_Json__c,
            Is_Default__c = false,
            OwnerId = u
          )
        );
      }
    }
    insert as user copies;
    return copies.size();
  }

  private static Pipeline_Saved_Filter__c ownFilter(Id filterId) {
    List<Pipeline_Saved_Filter__c> rows = [
      SELECT Id, Name, Filter_Json__c, Is_Default__c
      FROM Pipeline_Saved_Filter__c
      WHERE Id = :filterId AND OwnerId = :UserInfo.getUserId()
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('That filter is not one of yours.');
    }
    return rows[0];
  }

  private static void checkJson(String filterJson) {
    if (filterJson == null || filterJson.length() > 30000) {
      throw new AuraHandledException('The filter is too long to save.');
    }
    try {
      JSON.deserializeUntyped(filterJson);
    } catch (Exception e) {
      throw new AuraHandledException('The filter could not be read.');
    }
  }
}

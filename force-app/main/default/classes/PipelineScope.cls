/**
 * Pipeline: works out whose deals a signed-in person may look at, from the Teams that Robert maintains.
 *
 * Who calls it: PipelineController (the Pipeline screen), and PipelineControllerTest.
 * What it touches: reads Team__c and Team_Member__c only (read-only, with system access because Teams are set-up data
 * that every Pipeline user needs to read, not data a person is meant to see directly). It changes nothing.
 *
 * The rule (Robert, 2026-11-01): a person named as the Manager of at least one team, or who holds the custom permission
 * Pipeline_View_Any_Team (the Pipeline Team Viewer permission set, for people who are not a team's manager but need to
 * look at teams), is a manager; everyone else is a member and sees only their own deals. A manager can look at "My team" (the teams they manage and every team below them, through
 * Parent_Team__c), at any other team (and the teams below it), or at no team at all (everything sharing lets them see, to be
 * narrowed by country, state, portfolio and so on). Org-wide sharing always decides which deals the person may actually
 * open; this class only narrows the list.
 */
public with sharing class PipelineScope {
  /** The picked team that means "the teams I manage and everyone below". */
  public static final String MINE = 'MINE';

  /** One team, as the screen needs it. */
  public class TeamInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id parentId;
    @AuraEnabled
    public String managerName;
    @AuraEnabled
    public String country;
    /** True for a team the signed-in person manages (the teams "My team" is made of). */
    @AuraEnabled
    public Boolean mine = false;
  }

  /** The answer: is the person a manager, which teams may they pick from, and whose deals are in scope. */
  public class Scope {
    public Boolean isManager = false;
    /** True when the person is named as the manager of at least one team (so "My team" means something for them). */
    public Boolean hasOwnTeam = false;
    public List<TeamInfo> teams = new List<TeamInfo>();
    /** Whose deals are in scope. Null means nobody is ruled out by team: everything sharing allows. */
    public Set<Id> ownerIds = new Set<Id>();
    /** The team name to show beside each person: the team they manage if any, otherwise a team they sit in. */
    public Map<Id, String> teamNameByUser = new Map<Id, String>();
  }

  /**
   * @param userId the signed-in person
   * @param picked MINE for the teams the person manages, a team's Id for that team, or blank for no team (a manager
   *   then sees everything sharing allows); ignored for a member, who always sees only their own deals
   * @param below true to include every team below a picked team, false for just that team
   */
  public static Scope resolve(Id userId, String picked, Boolean below) {
    List<Team__c> all = [
      SELECT Id, Name, Parent_Team__c, Manager__c, Manager__r.Name, Country__c
      FROM Team__c
      WHERE Active__c = TRUE
      WITH SYSTEM_MODE
      ORDER BY Display_Order__c NULLS LAST, Name
    ];
    Map<Id, Team__c> byId = new Map<Id, Team__c>(all);
    Map<Id, List<Id>> kids = new Map<Id, List<Id>>();
    Set<Id> managed = new Set<Id>();
    for (Team__c t : all) {
      if (t.Manager__c == userId) {
        managed.add(t.Id);
      }
      if (t.Parent_Team__c != null) {
        if (!kids.containsKey(t.Parent_Team__c)) {
          kids.put(t.Parent_Team__c, new List<Id>());
        }
        kids.get(t.Parent_Team__c).add(t.Id);
      }
    }
    Scope s = new Scope();
    s.hasOwnTeam = !managed.isEmpty();
    s.isManager =
      s.hasOwnTeam ||
      FeatureManagement.checkPermission('Pipeline_View_Any_Team');
    if (!s.isManager) {
      s.ownerIds.add(userId);
      return s;
    }
    for (Team__c t : all) {
      TeamInfo ti = new TeamInfo();
      ti.id = t.Id;
      ti.name = t.Name;
      ti.parentId = byId.containsKey(t.Parent_Team__c)
        ? t.Parent_Team__c
        : null;
      ti.managerName = t.Manager__r?.Name;
      ti.country = t.Country__c;
      ti.mine = managed.contains(t.Id);
      s.teams.add(ti);
    }
    Set<Id> chosen = null;
    if (picked == MINE && s.hasOwnTeam) {
      chosen = treeOf(managed, kids);
    } else if (String.isNotBlank(picked) && byId.containsKey(asId(picked))) {
      chosen = (below == false)
        ? new Set<Id>{ asId(picked) }
        : treeOf(new Set<Id>{ asId(picked) }, kids);
    }
    if (chosen == null) {
      s.ownerIds = null;
      chosen = byId.keySet();
    } else {
      s.ownerIds.add(userId);
    }
    for (Id teamId : chosen) {
      Id mgr = byId.get(teamId).Manager__c;
      if (mgr != null) {
        if (s.ownerIds != null) {
          s.ownerIds.add(mgr);
        }
        if (!s.teamNameByUser.containsKey(mgr)) {
          s.teamNameByUser.put(mgr, byId.get(teamId).Name);
        }
      }
    }
    for (Team_Member__c m : [
      SELECT User__c, Team__r.Name
      FROM Team_Member__c
      WHERE Team__c IN :chosen AND Active__c = TRUE AND User__c != NULL
      WITH SYSTEM_MODE
    ]) {
      if (s.ownerIds != null) {
        s.ownerIds.add(m.User__c);
      }
      if (!s.teamNameByUser.containsKey(m.User__c)) {
        s.teamNameByUser.put(m.User__c, m.Team__r.Name);
      }
    }
    return s;
  }

  /** The given teams and every team below them. A visited set stops a loop if Parent_Team__c ever points back up. */
  private static Set<Id> treeOf(Set<Id> roots, Map<Id, List<Id>> kids) {
    Set<Id> seen = new Set<Id>();
    List<Id> queue = new List<Id>(roots);
    while (!queue.isEmpty()) {
      Id next = queue.remove(0);
      if (seen.add(next) && kids.containsKey(next)) {
        queue.addAll(kids.get(next));
      }
    }
    return seen;
  }

  /** The text as a record Id, or null when it is not one. */
  private static Id asId(String text) {
    try {
      return Id.valueOf(text);
    } catch (Exception e) {
      return null;
    }
  }
}

/**
 * Pipeline: matches a pasted list (or file) of surgeon names to Salesforce surgeons for Campaign Management's importer.
 *
 * Who calls it: PipelineCampaignController.matchNames, and PipelineCampaignImportTest.
 * What it touches: reads Account (person accounts of record type Physician or Emerging Consultant, in the person's own
 * access), the campaign's members, and the surgeons' current hospitals (Healthcare_Surgeon_Relationship__c, system mode, only
 * to help match and to show). It saves nothing: the person confirms every row on the check screen first.
 *
 * How a line is read: the first part is the name; anything after a tab, a " - ", a comma or in brackets is a clue (usually a
 * hospital). Titles (Dr, Prof ...) are ignored. A name matches exactly when it has the same words in any order as the
 * surgeon's name or English name (Preferred_Name__c). Otherwise a surgeon with the same family name and a first name that
 * starts the same way is offered as a possible match. With several candidates the clue (a hospital name, or its initials such
 * as SGH) is used to pick one when it points at exactly one. A guess is never confirmed for the person.
 */
public with sharing class PipelineCampaignImport {
  private static final Integer MAX_LINES = 300;
  private static final Integer MAX_CANDIDATES = 5;
  private static final List<String> MEMBER_TYPES = new List<String>{
    'Physician',
    'Emerging_Consultant'
  };
  private static final Set<String> GENERIC = new Set<String>{
    'hospital',
    'medical',
    'centre',
    'center',
    'clinic',
    'private',
    'the'
  };
  private static final Set<String> TITLES = new Set<String>{
    'dr',
    'prof',
    'professor',
    'a',
    'assoc',
    'associate',
    'mr',
    'mrs',
    'ms',
    'miss',
    'mdm',
    'dato',
    'datuk',
    'dr.'
  };

  /** A line split into the name and its clue. */
  public class Parsed {
    public String raw;
    public String name;
    public String clue;
    public String bracket; // the text of a bracket at the end of the line, if any
    public List<String> clues = new List<String>(); // each reading of what follows the name
    public List<String> variants = new List<String>(); // name keys to try for an exact match
    public List<String> tokens = new List<String>(); // the words of the name, titles removed
  }

  /**
   * Removes symbols from a pasted line (Robert, 2026-11-07): letters of any language, digits, spaces, tabs, the hyphen, comma,
   * full stop, apostrophe and brackets stay; stars, other symbols and invisible characters go. The screen cleans the same way;
   * this keeps the server correct for any caller.
   */
  public static String clean(String s) {
    if (s == null) {
      return '';
    }
    String t = s.replaceAll('[\\u200B-\\u200D\\uFEFF\\u2060]', '');
    t = t.replaceAll('[\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000]', ' ');
    t = t.replaceAll('[\\u2010-\\u2015\\u2212]', '-');
    t = t.replaceAll('[\\u2018\\u2019]', '\'');
    t = t.replaceAll('[^\\p{L}\\p{M}\\p{N}\\t ,.\\-\'()]', ' ');
    t = t.replaceAll(' {2,}', ' ');
    return t.trim();
  }

  /** Lower case, letters and digits only, words separated by one space. */
  public static String norm(String s) {
    if (String.isBlank(s)) {
      return '';
    }
    String t = s.toLowerCase().replaceAll('[^\\p{L}\\p{N}]+', ' ').trim();
    return t;
  }

  public static List<String> words(String s) {
    List<String> out = new List<String>();
    for (String w : norm(s).split(' ')) {
      if (w.length() > 0 && !TITLES.contains(w)) {
        out.add(w);
      }
    }
    return out;
  }

  /** The words of a name in alphabetical order, so "Lim Wei Ming" and "Wei Ming Lim" give the same key. */
  public static String key(String s) {
    List<String> w = words(s);
    w.sort();
    return String.join(w, ' ');
  }

  public static Parsed parse(String line) {
    Parsed p = new Parsed();
    p.raw = clean(line);
    String name = p.raw;
    List<String> clues = new List<String>();
    String bracket = null;
    // a bracket at the end is a clue: "Dr Jonathan Wu (Raffles)"
    Matcher m = Pattern.compile('^(.*)\\(([^)]*)\\)\\s*$').matcher(name);
    if (m.matches()) {
      name = m.group(1).trim();
      bracket = m.group(2).trim();
      clues.add(bracket);
    }
    String swapped = null;
    if (name.contains('\t')) {
      List<String> parts = name.split('\t');
      name = parts[0];
      if (parts.size() > 1) {
        clues.add(String.join(slice(parts, 1), ' '));
      }
    } else if (name.contains(' - ')) {
      Integer i = name.indexOf(' - ');
      clues.add(name.substring(i + 3));
      name = name.substring(0, i);
    } else if (name.contains(',')) {
      List<String> parts = name.split(',');
      name = parts[0];
      clues.add(String.join(slice(parts, 1), ' ')); // "Wei Ming Lim, SGH": what follows is a clue
      if (parts.size() > 1) {
        // "Lim, Wei Ming" may be a name written family name first; a hospital may follow it
        swapped = parts[1].trim() + ' ' + parts[0].trim();
        if (parts.size() > 2) {
          clues.add(String.join(slice(parts, 2), ' '));
        }
      }
    }
    p.bracket = bracket;
    p.name = name.trim();
    p.clues = clues;
    p.clue = String.join(clues, ' ').trim();
    p.tokens = words(p.name);
    p.variants.add(key(p.name));
    if (swapped != null) {
      p.variants.add(key(swapped));
    }
    // some surgeons carry the bracket in their own name in Salesforce ("Stephen Andrews (NZ)"): the name with the bracket kept is tried too
    if (String.isNotBlank(bracket)) {
      p.variants.add(key(p.name + ' ' + bracket));
    }
    return p;
  }

  private static List<String> slice(List<String> parts, Integer startAt) {
    List<String> out = new List<String>();
    for (Integer i = startAt; i < parts.size(); i++) {
      out.add(parts[i]);
    }
    return out;
  }

  /** True when the clue names the hospital, or is its initials (SGH for Singapore General Hospital). */
  public static Boolean hintHits(String clue, List<String> hospitals) {
    String h = norm(clue);
    if (h.length() < 2 || hospitals == null) {
      return false;
    }
    String squashed = h.replace(' ', '');
    for (String hosp : hospitals) {
      String n = norm(hosp);
      if (n.length() == 0) {
        continue;
      }
      if (n.contains(h) || h.contains(n)) {
        return true;
      }
      String initials = '';
      String coreInitials = ''; // without the words every hospital has
      for (String w : n.split(' ')) {
        if (w.length() > 0) {
          initials += w.substring(0, 1);
          if (!GENERIC.contains(w)) {
            coreInitials += w.substring(0, 1);
          }
        }
      }
      if (initials == squashed || coreInitials == squashed) {
        return true;
      }
    }
    return false;
  }

  /** Whether a surgeon's first-name words fit the other words of the line (a start of the word, or an initial). */
  private static Boolean firstNameFits(
    List<String> others,
    Set<String> surgeonWords
  ) {
    if (others.isEmpty()) {
      return true; // only a family name was given: it fits, but it is only a possible match
    }
    for (String o : others) {
      for (String w : surgeonWords) {
        if (
          w.startsWith(o) ||
          (o.length() >= 3 &&
          o.startsWith(w) &&
          w.length() >= 3)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  public static List<PipelineCampaignController.ImportRow> match(
    Id campaignId,
    List<String> lines
  ) {
    List<PipelineCampaignController.ImportRow> out = new List<PipelineCampaignController.ImportRow>();
    if (lines == null || lines.isEmpty()) {
      return out;
    }
    if (lines.size() > MAX_LINES) {
      throw new AuraHandledException(
        'Please import up to ' + MAX_LINES + ' names at a time.'
      );
    }
    List<Parsed> parsed = new List<Parsed>();
    Set<String> familyNames = new Set<String>();
    Set<String> englishNames = new Set<String>();
    for (String line : lines) {
      Parsed p = parse(line);
      parsed.add(p);
      for (String t : p.tokens) {
        familyNames.add(t);
        // a surgeon whose family name carries the bracket in Salesforce ("Andrews (NZ)") has to be fetched as well
        if (String.isNotBlank(p.bracket)) {
          familyNames.add(t + ' (' + p.bracket + ')');
          familyNames.add(t + ' ' + p.bracket);
        }
      }
      englishNames.add(p.name);
      for (String v : p.variants) {
        englishNames.add(v);
      }
    }
    familyNames.remove('');
    englishNames.remove('');

    List<Account> pool = [
      SELECT
        Name,
        FirstName,
        LastName,
        Preferred_Name__c,
        PersonMailingCountryCode,
        PersonMailingCity,
        RecordType.Name
      FROM Account
      WHERE
        IsPersonAccount = TRUE
        AND RecordType.DeveloperName IN :MEMBER_TYPES
        AND (LastName IN :familyNames
        OR Preferred_Name__c IN :englishNames)
      WITH USER_MODE
      LIMIT 20000
    ];
    Map<String, List<Account>> byKey = new Map<String, List<Account>>();
    Map<String, List<Account>> byWord = new Map<String, List<Account>>();
    Map<Id, Set<String>> firstWords = new Map<Id, Set<String>>();
    for (Account a : pool) {
      for (
        String k : new Set<String>{ key(a.Name), key(a.Preferred_Name__c) }
      ) {
        if (k.length() > 0) {
          if (!byKey.containsKey(k)) {
            byKey.put(k, new List<Account>());
          }
          byKey.get(k).add(a);
        }
      }
      Set<String> fw = new Set<String>(words(a.FirstName));
      fw.addAll(words(a.Preferred_Name__c));
      firstWords.put(a.Id, fw);
      Set<String> surnameWords = new Set<String>(words(a.LastName));
      surnameWords.addAll(words(a.Preferred_Name__c));
      for (String w : surnameWords) {
        if (!byWord.containsKey(w)) {
          byWord.put(w, new List<Account>());
        }
        byWord.get(w).add(a);
      }
    }
    Set<Id> memberIds = new Set<Id>();
    for (Sales_Campaign_Member__c m : [
      SELECT Surgeon__c
      FROM Sales_Campaign_Member__c
      WHERE Campaign__c = :campaignId AND Surgeon__c != NULL
      WITH USER_MODE
      LIMIT 50000
    ]) {
      memberIds.add(m.Surgeon__c);
    }

    // find the candidates of each line, then read the hospitals of every candidate in one query
    Map<Integer, List<Account>> exact = new Map<Integer, List<Account>>();
    Map<Integer, List<Account>> possible = new Map<Integer, List<Account>>();
    Set<Id> candidateIds = new Set<Id>();
    for (Integer i = 0; i < parsed.size(); i++) {
      Parsed p = parsed[i];
      Map<Id, Account> ex = new Map<Id, Account>();
      for (String v : p.variants) {
        if (byKey.containsKey(v)) {
          for (Account a : byKey.get(v)) {
            ex.put(a.Id, a);
          }
        }
      }
      exact.put(i, ex.values());
      if (ex.isEmpty()) {
        Map<Id, Account> fz = new Map<Id, Account>();
        for (String t : p.tokens) {
          if (byWord.containsKey(t)) {
            for (Account a : byWord.get(t)) {
              List<String> others = new List<String>();
              for (String o : p.tokens) {
                if (o != t) {
                  others.add(o);
                }
              }
              if (
                !others.isEmpty() && firstNameFits(others, firstWords.get(a.Id))
              ) {
                fz.put(a.Id, a);
              }
            }
          }
        }
        possible.put(i, fz.values());
      }
      for (Account a : exact.get(i)) {
        candidateIds.add(a.Id);
      }
      if (possible.containsKey(i)) {
        for (Account a : possible.get(i)) {
          candidateIds.add(a.Id);
        }
      }
    }
    Map<Id, List<String>> hospitals = PipelineCampaignController.hospitalsFor(
      candidateIds
    );

    for (Integer i = 0; i < parsed.size(); i++) {
      Parsed p = parsed[i];
      PipelineCampaignController.ImportRow r = new PipelineCampaignController.ImportRow();
      r.text = p.raw;
      r.cands = new List<PipelineCampaignController.SurgeonHit>();
      List<Account> chosenList = exact.get(i);
      Boolean isExact = !chosenList.isEmpty();
      if (!isExact) {
        chosenList = possible.get(i);
      }
      // rank: those the clue points at first
      List<Account> hinted = new List<Account>();
      List<Account> rest = new List<Account>();
      for (Account a : chosenList) {
        Boolean pointed = false;
        for (String c : p.clues) {
          pointed = pointed || hintHits(c, hospitals.get(a.Id));
        }
        if (pointed) {
          hinted.add(a);
        } else {
          rest.add(a);
        }
      }
      List<Account> ranked = new List<Account>(hinted);
      ranked.addAll(rest);
      for (Integer k = 0; k < ranked.size() && k < MAX_CANDIDATES; k++) {
        Account a = ranked[k];
        PipelineCampaignController.SurgeonHit h = new PipelineCampaignController.SurgeonHit();
        h.id = a.Id;
        h.name = a.Name;
        h.preferredName = a.Preferred_Name__c;
        h.country = a.PersonMailingCountryCode;
        h.city = a.PersonMailingCity;
        h.type = a.RecordType.Name;
        h.hospitals = PipelineCampaignController.hospitalText(
          hospitals.get(a.Id)
        );
        h.alreadyMember = memberIds.contains(a.Id);
        r.cands.add(h);
      }
      if (ranked.isEmpty()) {
        r.status = 'none';
      } else if (ranked.size() == 1 || hinted.size() == 1) {
        r.pickId = ranked[0].Id;
        r.status = isExact ? 'exact' : 'suggest';
      } else {
        r.status = 'many';
      }
      if (r.pickId != null && memberIds.contains(r.pickId)) {
        r.status = 'dup';
      }
      out.add(r);
    }
    return out;
  }
}

/**
 * Pipeline: the small rules that run whenever a Sales Campaign, a Sales Campaign Member or a Sales Campaign Deal is saved.
 *
 * Who calls it: the three Pipeline triggers PipelineSalesCampaignTrigger, PipelineSalesCampaignMemberTrigger and
 * PipelineSalesCampaignDealTrigger (before insert and before update), and PipelineCampaignRulesTest.
 * What it touches: only the record being saved, on these three new objects. It reads and changes nothing else.
 *
 * - A campaign's Name is never typed: it is the friendly name followed by the country codes in a fixed order, for example
 *   "Singapore Shoulder Symposium SG-MY-TH". The same save also writes the countries and portfolios as plain text
 *   (Countries_Text__c, Portfolios_Text__c) so the member and deal records can show them in formula fields.
 * - A member's Unique_Key__c is the campaign Id and the surgeon Id together, and a deal link's is the campaign Id and the
 *   deal Id together. The key is marked unique, so the same surgeon cannot be added to a campaign twice and the same deal
 *   cannot be linked to a campaign twice, however the record is created.
 */
public with sharing class PipelineCampaignRules {
  /** The order country codes are written in the campaign name. Any other code is added after these. */
  private static final List<String> COUNTRY_ORDER = new List<String>{
    'AU',
    'NZ',
    'SG',
    'MY',
    'TH',
    'HK',
    'TW',
    'KR',
    'IN'
  };

  /** "TH;SG" becomes "SG-TH" (fixed order, a separator of your choice). */
  public static String countryCodes(String multi, String separator) {
    if (String.isBlank(multi)) {
      return '';
    }
    Set<String> chosen = new Set<String>(multi.split(';'));
    List<String> out = new List<String>();
    for (String c : COUNTRY_ORDER) {
      if (chosen.remove(c)) {
        out.add(c);
      }
    }
    List<String> rest = new List<String>(chosen);
    rest.sort();
    out.addAll(rest);
    return String.join(out, separator);
  }

  /** The Name, Countries_Text__c and Portfolios_Text__c of each campaign. */
  public static void setCampaignNames(List<Sales_Campaign__c> rows) {
    for (Sales_Campaign__c c : rows) {
      String friendly = String.isBlank(c.Friendly_Name__c)
        ? ''
        : c.Friendly_Name__c.trim();
      String codes = countryCodes(c.Countries__c, '-');
      String full = String.isBlank(codes) ? friendly : friendly + ' ' + codes;
      c.Name = full.left(80);
      c.Countries_Text__c = countryCodes(c.Countries__c, ', ').left(80);
      c.Portfolios_Text__c = String.isBlank(c.Portfolios__c)
        ? null
        : c.Portfolios__c.replace(';', ', ').left(80);
    }
  }

  public static void setMemberKeys(List<Sales_Campaign_Member__c> rows) {
    for (Sales_Campaign_Member__c m : rows) {
      m.Unique_Key__c = (m.Campaign__c == null ||
        m.Surgeon__c == null)
        ? null
        : String.valueOf(m.Campaign__c) + '-' + String.valueOf(m.Surgeon__c);
    }
  }

  public static void setDealKeys(List<Sales_Campaign_Deal__c> rows) {
    for (Sales_Campaign_Deal__c d : rows) {
      d.Unique_Key__c = (d.Campaign__c == null ||
        d.Deal__c == null)
        ? null
        : String.valueOf(d.Campaign__c) + '-' + String.valueOf(d.Deal__c);
    }
  }
}

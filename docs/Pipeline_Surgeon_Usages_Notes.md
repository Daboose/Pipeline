# Surgeon Usages: a future component (brain dump, parked)

**Status (2026-11-05, late): BUILT in UAT as `pipelineUsageCard` (Robert said "build"); not in DEV, not placed on an Account page yet, not committed. See Build Spec "Usage Card on the Account page". Earlier status, now superseded: PARKED, nothing built.** Robert's thinking out loud on 2026-11-05, saved so the next session can pick it up cold. He will probably build it **in this repo** because the usage code is already here (the Surgeon Usages and My Case Bookings panels, `PipelineUsageController`, `PipelineSurgeonController`, `PipelineBookingsController`, the models). The reconciliation work (suggestions, the 10% check, Create and Adjust) is kept at git tag `usage-reconciliation-v0.54`. First step when he is ready: mockups (`docs/mockups/`), then his word "build".

## What it is for

Managing what a surgeon is currently using in surgery: which equipment, and above all **which companies' products** (ZB and the competitors). It works on **one surgeon at a time**, not on a team, so none of the team and manager ideas from Pipeline apply.

## Where it lives (Robert's thinking moved during the dictation; both ideas kept)

- **First idea:** its own app that opens full screen, like Pipeline, with the same pipe logo ("Surgeon Usages" on the pipe) and a splash with its own tagline.
- **Where he ended up:** a component on the **Account record page of the surgeon**. He would go into the surgeon's account and open a tab called Usage (the account layout has tabs). It must therefore be **narrower than Pipeline: it has to fit the two-thirds column** of the account page.
- **Hospital account page (the reverse view):** a hospital's account would show the surgeons linked to it through their usages, as an overview of **the volume of cases by surgeon at that hospital**. Hospitals have no ratings (only surgeons do), so no ratings there.
- Open: is it only the account-page component, or also a full-screen app with a splash? If it has a splash it needs its own tagline (about which companies' products the surgeon uses).

## What it shows (surgeon version)

- **Light theme, not dark**, so it does not stand out on the account page.
- **The ratings across the top** (Robert likes this).
- **A table of the surgeon's current usages underneath**, with easy delete of a row and add of a row (today's Surgeon Usages panel does this one usage at a time).
- **At the bottom, a MyCase bookings section that is only information**: an FYI table, not graphs ("did you realise this surgeon is currently doing these types of MyCase bookings?"), summary level, as in the Pipeline project.
- Today the Lightning page just lists all the hospitals, the types of usage and the cases.

## Decisions (Robert, 2026-11-05, after the brain dump) and the mockup

- **What it is: one Lightning web component on the Lightning RECORD PAGE of an Account** (not a tab, not a full-screen app, no splash). It sits in the two-thirds column. Mockup first, "a full mockup so we get this right"; wait for "build".
- **One component, two behaviours, chosen by the account it sits on:**
  - **Person account (`IsPersonAccount = true`; in practice physicians and emerging consultants):** the surgeon view. The four ratings across the top; a table of the surgeon's usages with easy add, edit and delete (the connections between the surgeon and hospitals); a MyCase bookings table underneath for information only.
  - **Business account (a hospital):** the hospital view. A `Usage__c` has two lookups, one to the surgeon and one to the hospital; on a hospital the component shows **the total number of cases by surgeon and by type** (what is currently shown on the hospital account), with **no ratings and no segmentation**, just totals.
- **MyCase gate (Robert, 2026-11-05):** a user who cannot see the MyCase objects (New Zealand, for one) must see no error and no mention of MyCase at all: no bookings table on the surgeon page, no MyCase switch on the hospital page (usage records only). Done by the user's own object access, not by country: Apex reports whether the signed-in user can read `Case__c`, `myCase_Usage__c` and `myCase_Usage_Item__c`; the component leaves MyCase out when not, and the Apex never queries them. Needs a test for a user without access. In the mockup: "Viewer can see MyCase".
- **Hospital view splits ZB from Other (Robert, 2026-11-05):** on the usage records view each surgery type is split into Zimmer Biomet and every other company; MyCase holds ZB surgeries only, so that view has no split (assumption, to confirm).
- **Naming (Robert, 2026-11-05, decided):** the Pipeline prefix stays (hard rule 2). The component is **`pipelineUsageCard`**, its Apex `PipelineUsageCardController` and `PipelineUsageCardControllerTest`, and anything else it needs starts `PipelineUsageCard`. (Robert had first floated a `usage` prefix, then chose this.)
- **Mockup (built 2026-11-05, awaiting Robert's reaction):** `docs/mockups/archive/usage_account_component_v1.html` (light theme, invented data, a record switcher to see a physician, an emerging consultant, a surgeon with no MyCase data and a hospital).

- **Rating graphics (Robert, 2026-11-05):** he wants four unique graphics to make Platinum, Gold, Silver and Bronze obvious (order: Platinum highest, then Gold, Silver, Bronze) in place of the coloured dots. Style page built: `docs/mockups/archive/usage_rating_graphics_v1.html` (medals on ribbons, metal shapes, rank coins with chevrons, trophies; colour and black-and-white switch). He is also looking on the internet for ideas; the choice is open. Option E (badge medals, drawn from the Adobe Stock artwork Robert liked, licensed through his employer's Adobe account; ribbon stripes 4/3/2/1 count the rank) was added on request, and the card mockup now has a "Rating graphic" switch (Dots, A to E; opens on E). The same graphics could later replace the dots in the deal flyout's Surgeon Usages panel (not decided).

- **Rating cards: METAL PLATES chosen (Robert, 2026-11-05, "they look fantastic, I definitely want to use those").** From the brushed-metal Adobe Stock sheet (gold, platinum, bronze, silver; the 46 MB SVG is NOT used or stored, only its colours): each rating is a metal plate (conic-gradient metal sampled from the sheet, bevelled edge, two screws, an embossed star coin, the rank in engraved capitals, stars 4/3/2/1, a sheen sweep on hover, a flat grey plate for "No rating"). Built in CSS only, no image files. Mockups: `docs/mockups/archive/usage_rating_cards_v1.html` (style page; the dark card with a metal rim was the alternative, not chosen) and `usage_account_component_v1.html` (the plates are now the opening choice of the Rating graphic switch). Larger versions not wanted. Platinum is the sheet's champagne, Silver its blue-grey (the two look alike, the stars tell them apart). Replaces the open "which rating graphic" question. Not yet seen in Salesforce or on a phone.

## Still to settle

1. Hospital view: are the cases MyCase bookings (surgeries actually booked, last 12 months) or the usage records' cases per year? The mockup shows both with a switch.
2. Wording and look of the bookings FYI table (summary by surgery type in the mockup).
3. A new object is **not** expected (the data is the existing usage, surgery and case records); if one turns out to be needed, Robert is told plainly and gives his OK first.

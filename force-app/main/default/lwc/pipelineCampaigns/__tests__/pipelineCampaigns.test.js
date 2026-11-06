import { createElement } from "lwc";
import PipelineCampaigns from "c/pipelineCampaigns";
import getContext from "@salesforce/apex/PipelineCampaignController.getContext";
import listCampaigns from "@salesforce/apex/PipelineCampaignController.listCampaigns";
import getCampaign from "@salesforce/apex/PipelineCampaignController.getCampaign";
import saveCampaign from "@salesforce/apex/PipelineCampaignController.saveCampaign";
import searchSurgeons from "@salesforce/apex/PipelineCampaignController.searchSurgeons";
import addMember from "@salesforce/apex/PipelineCampaignController.addMember";
import matchNames from "@salesforce/apex/PipelineCampaignController.matchNames";
import addMembers from "@salesforce/apex/PipelineCampaignController.addMembers";
import removeMembers from "@salesforce/apex/PipelineCampaignController.removeMembers";

jest.mock(
  "@salesforce/apex/PipelineCampaignController.getContext",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.listCampaigns",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.getCampaign",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.saveCampaign",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.setActive",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.searchPeople",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.searchSurgeons",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.addMember",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.matchNames",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.addMembers",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.removeMembers",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const CTX = {
  userId: "005A",
  userName: "Mei Tan",
  canManage: true,
  theme: "dark",
  headColour: "pink",
  countries: ["AU", "SG", "MY"].map((v) => ({ value: v, label: v })),
  portfolios: ["Hip", "Extremities"].map((v) => ({ value: v, label: v }))
};
const CAMP = {
  id: "a01",
  name: "Shoulder Symposium SG-MY",
  friendlyName: "Shoulder Symposium",
  countries: ["SG", "MY"],
  portfolios: ["Extremities"],
  active: true,
  managerId: "005A",
  managerName: "Mei Tan",
  memberCount: 2,
  dealCount: 1
};
const DETAIL = {
  campaign: CAMP,
  truncated: false,
  members: [
    {
      memberId: "m1",
      accountId: "001",
      name: "Dr One",
      preferredName: "One E",
      country: "SG",
      city: "",
      type: "Physician",
      hospitals: "A, B",
      dealCount: 1,
      stages: "Plan"
    },
    {
      memberId: "m2",
      accountId: "002",
      name: "Dr Two",
      country: "MY",
      type: "Physician",
      hospitals: "",
      dealCount: 0,
      stages: ""
    }
  ]
};

function make() {
  const el = createElement("c-pipeline-campaigns", { is: PipelineCampaigns });
  document.body.appendChild(el);
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);
const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, " ");
const click = (el, label) =>
  [...el.shadowRoot.querySelectorAll("button.btn")]
    .find((b) => b.textContent.trim() === label)
    .click();
const typeInto = (input, v) => {
  input.value = v;
  input.dispatchEvent(new CustomEvent("input"));
};

describe("c-pipeline-campaigns", () => {
  beforeEach(() => {
    getContext.mockResolvedValue(CTX);
    listCampaigns.mockResolvedValue([CAMP]);
    getCampaign.mockResolvedValue(DETAIL);
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("lists the campaigns with their members and links", async () => {
    const el = make();
    await flush();
    const t = text(el);
    expect(t).toContain("Shoulder Symposium SG-MY");
    expect(t).toContain("Extremities");
    expect(q(el, "tr.click")).not.toBeNull();
  });

  it("hides inactive campaigns until asked", async () => {
    listCampaigns.mockResolvedValue([{ ...CAMP, active: false }]);
    const el = make();
    await flush();
    expect(text(el)).toContain("No campaigns to show");
    q(el, ".chip").click();
    await flush();
    expect(text(el)).toContain("Inactive");
  });

  it("builds the campaign name on the form and saves the form", async () => {
    saveCampaign.mockResolvedValue("a01");
    const el = make();
    await flush();
    [...el.shadowRoot.querySelectorAll("button.btn")]
      .find((b) => b.textContent.trim() === "New campaign")
      .click();
    await flush();
    typeInto(q(el, "input.wide"), "Hip Update");
    el.shadowRoot
      .querySelectorAll(".chips")[0]
      .querySelectorAll("button")[1]
      .click(); // SG
    el.shadowRoot
      .querySelectorAll(".chips")[0]
      .querySelectorAll("button")[0]
      .click(); // AU
    await flush();
    expect(q(el, ".nameprev").textContent).toContain("Hip Update AU-SG");
    el.shadowRoot
      .querySelectorAll(".chips")[1]
      .querySelectorAll("button")[0]
      .click();
    await flush();
    [...el.shadowRoot.querySelectorAll("button.btn")]
      .find((b) => b.textContent.trim() === "Save campaign")
      .click();
    await flush();
    expect(saveCampaign).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(saveCampaign.mock.calls[0][0].payload);
    expect(sent.friendlyName).toBe("Hip Update");
    expect(sent.countries).toEqual(["SG", "AU"]);
    expect(sent.managerId).toBe("005A");
    expect(text(el)).toContain("Members");
  });

  it("opens a campaign and shows who has a deal and who does not", async () => {
    const el = make();
    await flush();
    q(el, "tr.click").click();
    await flush();
    const t = text(el);
    expect(t).toContain("Dr One (English: One E)");
    expect(t).toContain("1 deal · Plan");
    expect(t).toContain("No deal yet");
    expect(q(el, ".kpis").textContent).toContain("2");
  });

  it('asks "are you sure?" under the Remove button before removing anyone', async () => {
    removeMembers.mockResolvedValue(undefined);
    const el = make();
    await flush();
    q(el, "tr.click").click();
    await flush();
    const boxes = el.shadowRoot.querySelectorAll(
      'td.tick input[type="checkbox"]'
    );
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(text(el)).toContain("Remove 1 campaign member");
    expect(text(el)).not.toContain("ticked");
    click(el, "Remove 1 campaign member");
    await flush();
    expect(removeMembers).not.toHaveBeenCalled();
    expect(text(el)).toContain("Yes, remove 1");
    click(el, "Keep them");
    await flush();
    expect(text(el)).not.toContain("Yes, remove 1");
    click(el, "Remove 1 campaign member");
    await flush();
    click(el, "Yes, remove 1");
    await flush();
    expect(removeMembers).toHaveBeenCalledWith({ memberIds: ["m1"] });
  });

  it("has a Select all box above the member boxes that ticks and clears them all", async () => {
    const el = make();
    await flush();
    q(el, "tr.click").click();
    await flush();
    const all = q(el, "th.tick input.selall");
    all.checked = true;
    all.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(text(el)).toContain("Remove 2 campaign members");
    const one = el.shadowRoot.querySelectorAll(
      'td.tick input[type="checkbox"]'
    )[0];
    one.checked = false;
    one.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(text(el)).toContain("Remove 1 campaign member");
    expect(q(el, "th.tick input.selall").indeterminate).toBe(true);
    const again = q(el, "th.tick input.selall");
    again.checked = false;
    again.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(text(el)).toContain("Remove campaign members");
  });

  it("searches for a surgeon only from two characters, offers widening, and adds one", async () => {
    searchSurgeons.mockResolvedValue({
      hits: [
        {
          id: "001Z",
          name: "Dr New",
          preferredName: "",
          country: "SG",
          city: "",
          type: "Physician",
          hospitals: "H1",
          alreadyMember: false
        }
      ],
      outside: 3,
      heldBack: 0,
      scope: "SG, MY"
    });
    addMember.mockResolvedValue();
    const el = make();
    await flush();
    q(el, "tr.click").click();
    await flush();
    const box = [...el.shadowRoot.querySelectorAll("input.search")].find((i) =>
      i.placeholder.startsWith("Type a surgeon")
    );
    typeInto(box, "d");
    await flush(350);
    expect(searchSurgeons).not.toHaveBeenCalled();
    expect(text(el)).toContain("at least 2 characters");
    typeInto(box, "dr");
    await flush(350);
    expect(searchSurgeons).toHaveBeenCalledTimes(1);
    expect(text(el)).toContain("Searching SG, MY.");
    expect(text(el)).toContain("3 more match outside these countries.");
    q(el, ".pop .opt").click();
    await flush();
    expect(addMember).toHaveBeenCalledWith({
      campaignId: "a01",
      surgeonId: "001Z"
    });
  });

  it("does not offer create or add to a person without the permission", async () => {
    getContext.mockResolvedValue({ ...CTX, canManage: false });
    const el = make();
    await flush();
    expect(text(el)).toContain("needs the Campaign Manager permission");
    expect(
      [...el.shadowRoot.querySelectorAll("button.btn")].some(
        (b) => b.textContent.trim() === "New campaign"
      )
    ).toBe(false);
  });

  it("opens in the light theme and remembers a choice of dark", async () => {
    window.localStorage.removeItem("pipelineCampaignTheme");
    let el = make();
    await flush();
    expect(q(el, ".root").dataset.theme).toBe("light");
    [...el.shadowRoot.querySelectorAll(".seg button")]
      .find((b) => b.textContent.trim() === "Dark")
      .click();
    await flush();
    expect(q(el, ".root").dataset.theme).toBe("dark");
    document.body.removeChild(el);
    el = make();
    await flush();
    expect(q(el, ".root").dataset.theme).toBe("dark");
    window.localStorage.removeItem("pipelineCampaignTheme");
  });

  it("shows where you are and goes back by clicking a step", async () => {
    const el = make();
    await flush();
    expect(q(el, ".trail")).toBeNull(); // the list needs no trail: the app title already says where you are
    q(el, "tr.click").click();
    await flush();
    const crumbs = q(el, ".trail").textContent.replace(/\s+/g, " ");
    expect(crumbs).toContain("Campaigns");
    expect(crumbs).toContain("Shoulder Symposium SG-MY"); // the heading is the trail: Campaigns, then this campaign's name
    expect((text(el).match(/Shoulder Symposium SG-MY/g) || []).length).toBe(1);
    q(el, ".crumblink").click();
    await flush();
    expect(q(el, ".trail")).toBeNull();
    expect(text(el)).toContain("Show inactive");
  });

  it("sorts a table by a heading and flips the order on a second click", async () => {
    listCampaigns.mockResolvedValue([
      { ...CAMP, id: "a1", name: "Bravo", memberCount: 5 },
      { ...CAMP, id: "a2", name: "Alpha", memberCount: 9 },
      { ...CAMP, id: "a3", name: "Charlie", memberCount: 1 }
    ]);
    const el = make();
    await flush();
    const names = () =>
      [...el.shadowRoot.querySelectorAll("tbody tr td.strong")].map((c) =>
        c.textContent.trim()
      );
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);
    const head = (label) =>
      [...el.shadowRoot.querySelectorAll("th .lab2")].find((h) =>
        h.textContent.includes(label)
      );
    head("Campaign").click();
    await flush();
    expect(names()).toEqual(["Charlie", "Bravo", "Alpha"]);
    head("Members").click();
    await flush();
    expect(names()).toEqual(["Charlie", "Bravo", "Alpha"]); // 1, 5, 9
    head("Members").click();
    await flush();
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]); // 9, 5, 1
  });

  it("lets a column be dragged wider and reset by double-clicking its edge", async () => {
    const el = make();
    await flush();
    expect(el.shadowRoot.querySelector("colgroup")).toBeNull();
    const grip = q(el, "th .rz");
    grip.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: 100,
        bubbles: true,
        cancelable: true
      })
    );
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 220 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    await flush();
    const cols = el.shadowRoot.querySelectorAll("colgroup col");
    expect(cols.length).toBe(7);
    expect(cols[0].style.width).toBe("260px"); // 140 (no layout in the test) plus the 120 dragged
    expect(
      JSON.parse(window.localStorage.getItem("pipelineCampaignWidths")).list
        .name
    ).toBe(260);
    q(el, "th .rz").dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true })
    );
    await flush();
    expect(el.shadowRoot.querySelector("colgroup")).toBeNull();
    window.localStorage.removeItem("pipelineCampaignWidths");
  });

  const ROWS = [
    {
      text: "Dr Wei Ming Lim, SGH",
      status: "exact",
      pickId: "001A",
      cands: [
        {
          id: "001A",
          name: "Dr Wei Ming Lim",
          preferredName: "",
          country: "SG",
          city: "",
          type: "Physician",
          hospitals: "Singapore General Hospital",
          alreadyMember: false
        }
      ]
    },
    {
      text: "Tan Ah Kow",
      status: "many",
      pickId: null,
      cands: [
        {
          id: "001B",
          name: "Dr Tan Ah Kow",
          country: "SG",
          hospitals: "Mount Elizabeth",
          alreadyMember: false
        },
        {
          id: "001C",
          name: "Dr Tan Ah Kow",
          country: "MY",
          hospitals: "Gleneagles KL",
          alreadyMember: false
        }
      ]
    },
    { text: "Nobody Atall", status: "none", pickId: null, cands: [] },
    {
      text: "Somchai Prasert",
      status: "dup",
      pickId: "001D",
      cands: [
        {
          id: "001D",
          name: "Dr Somchai Prasert",
          country: "TH",
          hospitals: "Bangkok Hospital",
          alreadyMember: true
        }
      ]
    }
  ];
  const openImport = async () => {
    const el = make();
    await flush();
    q(el, "tr.click").click();
    await flush();
    click(el, "Import members");
    await flush();
    return el;
  };

  it("opens the import page, which needs at least one name, and counts them", async () => {
    const el = await openImport();
    expect(text(el)).toContain("Paste a list of surgeons");
    expect(text(el)).toContain("Import members"); // the last step of the trail
    const check = [...el.shadowRoot.querySelectorAll("button.btn")].find(
      (b) => b.textContent.trim() === "Check names"
    );
    expect(check.disabled).toBe(true);
    const area = q(el, "textarea");
    area.value = "Name,Hospital\nDr A One\nDr B Two\nDr A One";
    area.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(text(el)).toContain("2 names");
    expect(text(el)).not.toContain("Symbols (");
    typeInto(area, "Dr A One ★\nDr B Two ✔\nDr C Three");
    await flush();
    expect(text(el)).toContain(
      "Symbols (★ ✔) are removed from 2 lines, and the names are matched without them."
    );
    expect(text(el)).toContain("3 names");
  });

  it("checks the names, settles every row, and adds only the confirmed surgeons", async () => {
    matchNames.mockResolvedValue(ROWS);
    addMembers.mockResolvedValue({ added: 2, alreadyMembers: 0, problems: [] });
    const el = await openImport();
    const area = q(el, "textarea");
    area.value = "x\ny\nz\nw";
    area.dispatchEvent(new CustomEvent("input"));
    await flush();
    click(el, "Check names");
    await flush();
    expect(matchNames).toHaveBeenCalledTimes(1);
    expect(matchNames.mock.calls[0][0].lines).toEqual(["x", "y", "z", "w"]);
    let t = text(el);
    expect(t).toContain("Exact match");
    expect(t).toContain("Several people share this name");
    expect(t).toContain("Not found");
    expect(t).toContain("Already a member: skipped");
    const add = () =>
      [...el.shadowRoot.querySelectorAll("button.btn")].find((b) =>
        b.textContent.trim().startsWith("Add ")
      );
    expect(text(el)).toContain("NOT SAVED YET");
    // the exact match arrives ticked, so one member is ready straight away
    expect(add().textContent.trim()).toBe("Add 1 member");
    expect(text(el)).not.toContain("Tick all exact matches");
    // the "several people" row: choosing someone does not tick it; Confirm does
    const select = q(el, "select");
    select.value = "001C";
    select.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(add().textContent.trim()).toBe("Add 1 member");
    click(el, "Confirm");
    await flush();
    expect(add().textContent.trim()).toBe("Add 2 members");
    // the "not found" row is left alone: it is simply not added
    expect(text(el)).toContain("1 need a decision");
    expect(add().disabled).toBe(false);
    add().click();
    await flush();
    expect(addMembers).toHaveBeenCalledWith({
      campaignId: "a01",
      surgeonIds: ["001A", "001C"]
    });
    expect(text(el)).toContain("Added 2 members.");
  });

  it("looks a surgeon up when none of the suggestions is right", async () => {
    matchNames.mockResolvedValue([ROWS[1]]);
    searchSurgeons.mockResolvedValue({
      hits: [
        {
          id: "001Z",
          name: "Dr Someone Else",
          preferredName: "",
          country: "SG",
          city: "",
          type: "Physician",
          hospitals: "H9",
          alreadyMember: false
        }
      ],
      outside: 0,
      heldBack: 0,
      scope: "AU, NZ"
    });
    const el = await openImport();
    const area = q(el, "textarea");
    area.value = "Tan Ah Kow";
    area.dispatchEvent(new CustomEvent("input"));
    await flush();
    click(el, "Check names");
    await flush();
    click(el, "None of these? Look up");
    await flush();
    const box = [...el.shadowRoot.querySelectorAll("input.search")].find(
      (i) => i.placeholder === "Look the surgeon up"
    );
    box.value = "else";
    box.dispatchEvent(new CustomEvent("input"));
    await flush(350);
    expect(text(el)).toContain("Dr Someone Else");
    expect(text(el)).toContain("Create this surgeon");
    q(el, ".inlinepop .opt").click();
    await flush();
    expect(text(el)).toContain("Dr Someone Else");
    const add = () =>
      [...el.shadowRoot.querySelectorAll("button.btn")].find((b) =>
        b.textContent.trim().startsWith("Add ")
      );
    expect(add().disabled).toBe(true); // picked, but not confirmed yet
    click(el, "Confirm");
    await flush();
    expect(add().disabled).toBe(false);
  });

  it("gives an existing member no action, and a Skip button with a working Undo to the others", async () => {
    matchNames.mockResolvedValue([ROWS[0], ROWS[3]]);
    const el = await openImport();
    const area = q(el, "textarea");
    area.value = "x\ny";
    area.dispatchEvent(new CustomEvent("input"));
    await flush();
    click(el, "Check names");
    await flush();
    const skips = [...el.shadowRoot.querySelectorAll("button.btn")].filter(
      (b) => b.textContent.trim() === "Skip"
    );
    expect(skips.length).toBe(1); // the already-a-member row has none
    skips[0].click();
    await flush();
    expect(text(el)).toContain("Skipped");
    expect(text(el)).toContain("Add 0 members");
    click(el, "Undo");
    await flush();
    expect(text(el)).toContain("Add 1 member");
  });

  it("asks before leaving the check screen with work that is not added", async () => {
    matchNames.mockResolvedValue([ROWS[0]]);
    const el = await openImport();
    const area = q(el, "textarea");
    area.value = "x";
    area.dispatchEvent(new CustomEvent("input"));
    await flush();
    click(el, "Check names");
    await flush();
    click(el, "Cancel");
    await flush();
    expect(text(el)).toContain("LEAVE WITHOUT ADDING?");
    click(el, "Stay here");
    await flush();
    expect(text(el)).toContain("NOT SAVED YET");
    click(el, "Cancel");
    await flush();
    click(el, "Leave anyway");
    await flush();
    expect(text(el)).not.toContain("NOT SAVED YET");
  });
});

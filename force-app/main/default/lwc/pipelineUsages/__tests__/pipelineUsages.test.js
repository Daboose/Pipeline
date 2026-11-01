import { createElement } from "lwc";
import PipelineUsages from "c/pipelineUsages";
import getUsages from "@salesforce/apex/PipelineSurgeonController.getUsages";

jest.mock(
  "@salesforce/apex/PipelineSurgeonController.getUsages",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));
const yearsAgo = (n) =>
  new Date(Date.now() - n * 365.25 * 86400000).toISOString();

const data = (newest) => ({
  surgeonId: "001",
  surgeonName: "Dr Test",
  newest,
  oldest: newest,
  ratings: [
    { area: "Hip", rating: "GOLD" },
    { area: "Knee", rating: "SILVER" },
    { area: "Shoulder", rating: null },
    { area: "CMF", rating: "BRONZE" }
  ],
  lines: [
    {
      hospital: "North",
      portfolio: "Hip",
      label: "Stems",
      company: "ZB",
      cases: 20
    },
    {
      hospital: "North",
      portfolio: "Hip",
      label: "Cups",
      company: "Exactech",
      cases: 18
    },
    {
      hospital: "North",
      portfolio: "Knee",
      label: "Knee",
      company: "Lima",
      cases: 9
    },
    {
      hospital: "South",
      portfolio: "Shoulder",
      label: "Anatomical",
      company: "ZB",
      cases: 5
    },
    {
      hospital: "South",
      portfolio: "Shoulder",
      label: "Reverse",
      company: "ZB",
      cases: 4
    }
  ]
});

function make(props) {
  const el = createElement("c-pipeline-usages", { is: PipelineUsages });
  Object.assign(el, { area: "Hip", ownerName: "Tom Becker", ...props });
  document.body.appendChild(el);
  return el;
}

describe("c-pipeline-usages", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("groups the usages by hospital with hip and shoulder as headings over their lines", async () => {
    getUsages.mockResolvedValue(data(yearsAgo(0.2)));
    const el = make({ recordId: "a1" });
    await flush();
    const heads = [...el.shadowRoot.querySelectorAll("tr.uh")].map((r) =>
      r.textContent.trim()
    );
    expect(heads).toEqual(["North", "South"]);
    expect(el.shadowRoot.querySelectorAll("tr.up").length).toBe(2); // Hip and Shoulder headings
    expect(el.shadowRoot.querySelectorAll("td.sub").length).toBe(4); // stems, cups, anatomical, reverse
    expect(el.shadowRoot.querySelectorAll("td.zb").length).toBe(3);
    expect(el.shadowRoot.querySelectorAll("tr.mine").length).toBe(3); // the Hip heading and its two lines
  });

  it("outlines the deal's own area among the four ratings", async () => {
    getUsages.mockResolvedValue(data(yearsAgo(0.2)));
    const el = make({ recordId: "a1", area: "Knee" });
    await flush();
    const mine = el.shadowRoot.querySelectorAll(".rate.mine");
    expect(mine.length).toBe(1);
    expect(mine[0].textContent).toContain("SILVER");
  });

  it("warns when the usages are old and lets a manager ask the rep to check", async () => {
    getUsages.mockResolvedValue(data(yearsAgo(3)));
    const el = make({ recordId: "a1", canAsk: true });
    await flush();
    expect(el.shadowRoot.querySelector(".warn.w")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".warn").textContent).toContain(
      "3 years ago"
    );
    const ask = el.shadowRoot.querySelector("button.mini");
    expect(ask.textContent).toContain("Ask Tom");
    const handler = jest.fn();
    el.addEventListener("askcheck", handler);
    ask.click();
    expect(handler).toHaveBeenCalled();
  });

  it("gives a rep a note instead of the ask button", async () => {
    getUsages.mockResolvedValue(data(yearsAgo(3)));
    const el = make({ recordId: "a1", isRep: true });
    await flush();
    expect(el.shadowRoot.querySelector("button.mini")).toBeNull();
    expect(el.shadowRoot.querySelector(".note").textContent).toContain(
      "next time you see this surgeon"
    );
  });

  it("does not warn when the usages are recent", async () => {
    getUsages.mockResolvedValue(data(yearsAgo(0.3)));
    const el = make({ recordId: "a1" });
    await flush();
    expect(el.shadowRoot.querySelector(".warn.w")).toBeNull();
  });

  it("says so when the deal has no surgeon", async () => {
    getUsages.mockResolvedValue({ surgeonId: null, ratings: [], lines: [] });
    const el = make({ recordId: "a1" });
    await flush();
    expect(el.shadowRoot.textContent).toContain("no Primary HCP");
  });
});

import { StickyHeads } from "c/pipelineSticky";

/** A card as the lists draw it: a heading bar and a table inside a box. Sizes and positions are set by the test. */
function makeCard({ headHeight = 55, tableWidth = 500, boxWidth = 800 } = {}) {
  const root = document.createElement("div");
  const card = document.createElement("section");
  card.className = "card";
  const head = document.createElement("div");
  head.className = "lhead";
  const wrap = document.createElement("div");
  wrap.className = "tablewrap";
  const table = document.createElement("table");
  table.className = "tbl";
  wrap.appendChild(table);
  card.appendChild(head);
  card.appendChild(wrap);
  root.appendChild(card);
  Object.defineProperty(head, "offsetHeight", { value: headHeight });
  Object.defineProperty(table, "offsetWidth", { value: tableWidth });
  Object.defineProperty(wrap, "clientWidth", { value: boxWidth });
  const place = (cardTop, headTop) => {
    card.getBoundingClientRect = () => ({ top: cardTop });
    head.getBoundingClientRect = () => ({ top: headTop, height: headHeight });
  };
  place(100, 101);
  return { root, card, head, place };
}

describe("c-pipeline-sticky", () => {
  let sticky;
  afterEach(() => {
    if (sticky) sticky.stop();
    sticky = null;
  });

  it("gives the card the measured height of its heading bar, so the column names sit just under it", () => {
    const { root, card } = makeCard({ headHeight: 61 });
    sticky = new StickyHeads(root);
    sticky.refresh();
    expect(card.style.getPropertyValue("--lh")).toBe("61px");
  });

  it("marks the heading bar stuck only while it has moved down from its resting place in the card", () => {
    const { root, head, place } = makeCard();
    sticky = new StickyHeads(root);
    sticky.refresh();
    expect(head.classList.contains("stuck")).toBe(false);
    place(-300, 59); // the card has scrolled up past the top bar; the bar stays at 59
    sticky.refresh();
    expect(head.classList.contains("stuck")).toBe(true);
    place(100, 101); // scrolled back
    sticky.refresh();
    expect(head.classList.contains("stuck")).toBe(false);
  });

  it("marks the card wide only when the table is wider than its box", () => {
    const narrow = makeCard({ tableWidth: 700, boxWidth: 800 });
    sticky = new StickyHeads(narrow.root);
    sticky.refresh();
    expect(narrow.card.classList.contains("wide")).toBe(false);
    sticky.stop();
    const wide = makeCard({ tableWidth: 1900, boxWidth: 800 });
    sticky = new StickyHeads(wide.root);
    sticky.refresh();
    expect(wide.card.classList.contains("wide")).toBe(true);
  });

  it("stops listening for scrolls when it is stopped", () => {
    const spy = jest.spyOn(window, "removeEventListener");
    const { root } = makeCard();
    sticky = new StickyHeads(root);
    sticky.stop();
    expect(spy).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    spy.mockRestore();
  });
});

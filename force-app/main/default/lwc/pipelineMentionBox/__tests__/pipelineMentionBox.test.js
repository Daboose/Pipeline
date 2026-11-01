import { createElement } from "lwc";
import PipelineMentionBox from "c/pipelineMentionBox";
import searchPeople from "@salesforce/apex/PipelineChatterController.searchPeople";

jest.mock(
  "@salesforce/apex/PipelineChatterController.searchPeople",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PEOPLE = [
  { id: "005A", name: "Robert Reeves", title: "Salesforce Administrator" },
  { id: "005B", name: "Ryan Reeve", title: "ASM (VIC)" }
];

function make() {
  const el = createElement("c-pipeline-mention-box", {
    is: PipelineMentionBox
  });
  document.body.appendChild(el);
  return el;
}
const box = (el) => el.shadowRoot.querySelector(".box");
/** Types text into the box with the caret at its end, the way the browser would, then fires the input event. */
function type(el, text) {
  const b = box(el);
  b.textContent = text;
  const node = b.firstChild;
  const range = document.createRange();
  range.setStart(node, text.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  b.dispatchEvent(new CustomEvent("input", { bubbles: true }));
}
const items = (el) => [...el.shadowRoot.querySelectorAll(".it")];

describe("c-pipeline-mention-box", () => {
  beforeEach(() => {
    searchPeople.mockResolvedValue(PEOPLE);
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("offers nobody until three letters follow the @, and says so", async () => {
    const el = make();
    type(el, "Thanks @re");
    await wait(300);
    expect(searchPeople).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".note").textContent).toContain(
      "three letters"
    );
  });

  it("searches from three letters and lists the people with their titles", async () => {
    const el = make();
    type(el, "Thanks @ree");
    await wait(300);
    expect(searchPeople).toHaveBeenCalledWith({ term: "ree" });
    expect(items(el).map((i) => i.querySelector("span").textContent)).toEqual([
      "Robert Reeves",
      "Ryan Reeve"
    ]);
    expect(items(el).map((i) => i.querySelector("small").textContent)).toEqual([
      "Salesforce Administrator",
      "ASM (VIC)"
    ]);
  });

  it("turns the picked person into a chip carrying their Id, and says who is notified", async () => {
    const el = make();
    const changed = jest.fn();
    el.addEventListener("contentchange", changed);
    type(el, "Thanks @reeves");
    await wait(300);
    items(el)[0].dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
    const chip = box(el).querySelector(".chip");
    expect(chip.dataset.id).toBe("005A");
    expect(chip.textContent).toContain("Robert Reeves");
    expect(box(el).textContent).not.toContain("@reeves");
    expect(el.shadowRoot.querySelector(".notify").textContent).toContain(
      "Notifies: Robert Reeves"
    );
    expect(changed.mock.calls.pop()[0].detail).toEqual({
      empty: false,
      mentions: ["Robert Reeves"]
    });
    expect(el.getSegments()).toEqual([
      { t: "Thanks " },
      { u: "005A", n: "Robert Reeves" }
    ]);
  });

  it("hands text and chips on as pieces in order", async () => {
    const el = make();
    type(el, "Hi @ree");
    await wait(300);
    items(el)[0].dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
    box(el).appendChild(document.createTextNode("is good"));
    expect(el.getSegments()).toEqual([
      { t: "Hi " },
      { u: "005A", n: "Robert Reeves" },
      { t: " is good" }
    ]);
  });

  it("takes the whole chip with one Backspace once the caret is just after it", async () => {
    const el = make();
    type(el, "Hi @ree");
    await wait(300);
    items(el)[0].dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
    const space = box(el).querySelector(".chip").nextSibling;
    const range = document.createRange();
    range.setStart(space, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    box(el).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );
    expect(box(el).querySelector(".chip")).toBeNull();
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".notify").textContent).toContain(
      "Nobody is mentioned yet."
    );
  });

  it("takes a chip off with its cross", async () => {
    const el = make();
    type(el, "Hi @ree");
    await wait(300);
    items(el)[0].dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
    box(el).querySelector(".chip .x").click();
    expect(box(el).querySelector(".chip")).toBeNull();
  });

  it("says when nobody is found, and keeps a name that was never picked as plain text", async () => {
    searchPeople.mockResolvedValue([]);
    const el = make();
    type(el, "cc @zzz and more");
    box(el).firstChild.textContent = "cc @zzz";
    type(el, "cc @zzz");
    await wait(300);
    expect(el.shadowRoot.querySelector(".note").textContent).toContain(
      "Nobody found"
    );
    expect(el.getSegments()).toEqual([{ t: "cc @zzz" }]);
  });

  it("can be cleared and set from outside", async () => {
    const el = make();
    el.setText("Please check the usages");
    expect(el.getSegments()).toEqual([{ t: "Please check the usages" }]);
    el.clear();
    expect(el.getSegments()).toEqual([]);
  });
});

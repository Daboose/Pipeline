import { createElement } from "lwc";
import PipelineLookup from "c/pipelineLookup";
import search from "@salesforce/apex/PipelineLookupController.search";

jest.mock(
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function make(props) {
  const el = createElement("c-pipeline-lookup", { is: PipelineLookup });
  Object.assign(el, {
    fieldName: "Account__c",
    valueId: "",
    valueName: "",
    ...props
  });
  document.body.appendChild(el);
  return el;
}
const type = (el, text) => {
  const input = el.shadowRoot.querySelector("input");
  input.value = text;
  input.dispatchEvent(new CustomEvent("input"));
};

describe("c-pipeline-lookup", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("shows the chosen record and clears it with the cross", () => {
    const el = make({ valueId: "001", valueName: "Dr Test" });
    const handler = jest.fn();
    el.addEventListener("change", handler);
    expect(el.shadowRoot.querySelector(".chosen").textContent).toContain(
      "Dr Test"
    );
    el.shadowRoot.querySelector(".xcirc").click();
    expect(handler.mock.calls[0][0].detail).toEqual({ id: "", name: "" });
  });

  it("is one box: the name with a cross when chosen, the search box when not", async () => {
    const el = make({ valueId: "001", valueName: "Dr Test" });
    expect(el.shadowRoot.querySelector("input")).toBeNull();
    el.shadowRoot.querySelector(".xcirc").click();
    el.valueId = "";
    el.valueName = "";
    await flush(0);
    expect(el.shadowRoot.querySelector(".chosen")).toBeNull();
    expect(el.shadowRoot.querySelector("input")).not.toBeNull();
  });

  it("searches only once two letters are typed, naming the field, and offers what comes back", async () => {
    search.mockResolvedValue([
      { id: "001A", name: "Dr Anne", sub: "Sydney" },
      { id: "001B", name: "Dr Bob" }
    ]);
    const el = make();
    type(el, "D");
    await flush();
    expect(search).not.toHaveBeenCalled();
    type(el, "Dr");
    await flush();
    expect(search).toHaveBeenCalledWith({
      fieldName: "Account__c",
      term: "Dr"
    });
    const opts = [...el.shadowRoot.querySelectorAll(".opt")];
    expect(opts.map((o) => o.textContent.replace(/\s+/g, " ").trim())).toEqual([
      "Dr AnneSydney",
      "Dr Bob"
    ]);
  });

  it("announces the record picked and closes the list", async () => {
    search.mockResolvedValue([{ id: "001A", name: "Dr Anne" }]);
    const el = make();
    const handler = jest.fn();
    el.addEventListener("change", handler);
    type(el, "Dr");
    await flush();
    el.shadowRoot.querySelector(".opt").click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      id: "001A",
      name: "Dr Anne"
    });
    await flush(0);
    expect(el.shadowRoot.querySelector(".list")).toBeNull();
  });

  it("shows a round clear button only while there is text, and it empties the search", async () => {
    const el = make();
    expect(el.shadowRoot.querySelector(".sclear")).toBeNull();
    type(el, "Dr");
    await Promise.resolve();
    const clear = el.shadowRoot.querySelector(".sclear");
    expect(clear).not.toBeNull();
    clear.click();
    await Promise.resolve();
    expect(el.shadowRoot.querySelector("input").value).toBe("");
    expect(el.shadowRoot.querySelector(".sclear")).toBeNull();
  });

  it("says so when nothing is found", async () => {
    search.mockResolvedValue([]);
    const el = make();
    type(el, "Zz");
    await flush();
    expect(el.shadowRoot.textContent).toContain("Nothing found");
  });
});

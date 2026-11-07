import { createElement } from "lwc";
import PipelineStageSlider from "c/pipelineStageSlider";

const STEPS = [
  "Plan",
  "Action",
  "Commit",
  "Conversion",
  "Unsuccessful Conversion"
];
const make = (props) => {
  const el = createElement("c-pipeline-stage-slider", {
    is: PipelineStageSlider
  });
  Object.assign(
    el,
    { steps: STEPS, won: "Conversion", lost: "Unsuccessful Conversion" },
    props
  );
  document.body.appendChild(el);
  return el;
};
const flush = () => Promise.resolve();
const opts = (el) => [...el.shadowRoot.querySelectorAll(".opt")];

describe("c-pipeline-stage-slider", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("shows every stage and highlights only the one the deal is at", async () => {
    const el = make({ value: "Action" });
    await flush();
    expect(opts(el).map((o) => o.textContent.trim())).toEqual(STEPS);
    expect(opts(el).map((o) => o.classList.contains("on"))).toEqual([
      false,
      true,
      false,
      false,
      false
    ]);
    expect(el.shadowRoot.querySelector(".wrap").className).toBe("wrap");
  });

  it("dims the stages still to come and puts a tick after each stage already passed, none after the current one", async () => {
    const el = make({ value: "Commit" });
    await flush();
    expect(opts(el).map((o) => o.classList.contains("ahead"))).toEqual([
      false,
      false,
      false,
      true,
      true
    ]);
    expect(opts(el).map((o) => !!o.querySelector(".tick"))).toEqual([
      true,
      true,
      false,
      false,
      false
    ]);
  });

  it("ticks the working stages at the won stage, but never the won stage itself", async () => {
    const el = make({ value: "Conversion" });
    await flush();
    expect(opts(el).map((o) => !!o.querySelector(".tick"))).toEqual([
      true,
      true,
      true,
      false,
      false
    ]);
    const lost = make({ value: "Unsuccessful Conversion" });
    await flush();
    const ticks = [...lost.shadowRoot.querySelectorAll(".opt")].map(
      (o) => !!o.querySelector(".tick")
    );
    expect(ticks).toEqual([true, true, true, false, false]);
  });

  it("greys the whole slider when read only", async () => {
    const el = make({ value: "Plan", readonly: true });
    await flush();
    expect(el.shadowRoot.querySelector(".wrap").className).toContain("lock");
  });

  it("highlights nothing when no stage is set", async () => {
    const el = make({ value: "" });
    await flush();
    expect(el.shadowRoot.querySelector(".opt.on")).toBeNull();
  });

  it("turns green at the won stage and red at the lost stage", async () => {
    const won = make({ value: "Conversion" });
    await flush();
    expect(won.shadowRoot.querySelector(".wrap").className).toContain("good");
    const lost = make({ value: "Unsuccessful Conversion" });
    await flush();
    expect(lost.shadowRoot.querySelector(".wrap").className).toContain("bad");
  });

  it("tells its parent which stage was clicked, but does nothing when read only", async () => {
    const el = make({ value: "Plan" });
    const picked = [];
    el.addEventListener("change", (e) => picked.push(e.detail.value));
    await flush();
    opts(el)[2].click();
    opts(el)[0].click(); // already chosen
    expect(picked).toEqual(["Commit"]);
    el.readonly = true;
    await flush();
    opts(el)[1].click();
    expect(picked).toEqual(["Commit"]);
  });
});

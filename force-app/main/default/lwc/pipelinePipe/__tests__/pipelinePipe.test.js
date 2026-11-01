import { createElement } from "lwc";
import PipelinePipe from "c/pipelinePipe";

function widthOf(props) {
  const el = createElement("c-pipeline-pipe", { is: PipelinePipe });
  Object.assign(el, props);
  document.body.appendChild(el);
  return el.shadowRoot.querySelector(".wrap").style.width;
}

describe("c-pipeline-pipe", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("keeps one height for every pipe: the logo and a heading differ in length, not in height", () => {
    const logo = parseInt(
      widthOf({ variant: "logo", a: "PIPE", b: "LINE" }),
      10
    );
    const wide = parseInt(
      widthOf({ variant: "wide", a: "YOUR", b: "SETTINGS" }),
      10
    );
    expect(wide).toBeGreaterThan(logo);
    expect(Math.round((logo * 800) / 4770)).toBe(
      Math.round((wide * 800) / 6070)
    );
  });

  it("is taller only when the height is changed on purpose", () => {
    expect(widthOf({ variant: "wide", height: 84 })).toBe("637px");
  });
});

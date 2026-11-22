// Jest cannot see a style sheet working, so this reads the shared plate style sheet and guards the one thing that went wrong in a mockup:
// the Not rated chip must be a clear chip (no fill, a border), not the old near-black fill.
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(
  path.resolve(__dirname, "../pipelineRatingStyles.css"),
  "utf8"
);
const rule = (selector) => {
  const start = css.indexOf(selector + " {");
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
};

describe("pipeline-rating-styles", () => {
  it("draws Not rated as a clear chip: no fill, a hairline border, the words in the theme's colours", () => {
    const none = rule(".rplate.none");
    expect(none).toContain("background: transparent");
    expect(none).toContain("inset 0 0 0 1px");
    expect(none).not.toContain("linear-gradient");
    expect(none).not.toContain("#0c0d10");
    expect(none).toContain("text-shadow: none");
  });

  it("keeps the four metals and the shared plate size", () => {
    ["Platinum", "Gold", "Silver", "Bronze"].forEach((m) =>
      expect(rule(".rplate." + m)).toContain("--sheet")
    );
    expect(rule(".rplate")).toContain("width: 116px");
    expect(rule(".rplate")).toContain("height: 24px");
  });
});

import { createElement } from "lwc";
import PipelineChatter from "c/pipelineChatter";
import getFeed from "@salesforce/apex/PipelineChatterController.getFeed";
import post from "@salesforce/apex/PipelineChatterController.post";
import reply from "@salesforce/apex/PipelineChatterController.reply";

jest.mock(
  "@salesforce/apex/PipelineChatterController.getFeed",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineChatterController.post",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineChatterController.reply",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineChatterController.searchPeople",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));
const FEED = [
  {
    id: "0D5A",
    who: "Ray",
    whoId: "005R",
    posted: new Date().toISOString(),
    text: "Check this",
    replies: []
  }
];

function make() {
  const el = createElement("c-pipeline-chatter", { is: PipelineChatter });
  el.recordId = "a01000000000001";
  document.body.appendChild(el);
  return el;
}
const button = (el, text) =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text
  );

describe("c-pipeline-chatter", () => {
  beforeEach(() => {
    getFeed.mockResolvedValue(FEED);
    post.mockResolvedValue();
    reply.mockResolvedValue();
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("posts the pieces the writing box hands over, as JSON", async () => {
    const el = make();
    await flush();
    el.shadowRoot.querySelector(".postbox").setText("Hello there");
    await Promise.resolve();
    button(el, "Post").click();
    await flush();
    expect(post).toHaveBeenCalledWith({
      dealId: "a01000000000001",
      segmentsJson: JSON.stringify([{ t: "Hello there" }])
    });
  });

  it("replies with the pieces too", async () => {
    const el = make();
    await flush();
    button(el, "Reply").click();
    await Promise.resolve();
    el.shadowRoot.querySelector(".replyfield").setText("Thanks");
    await Promise.resolve();
    el.shadowRoot
      .querySelectorAll("button")
      .forEach(
        (b) => b.textContent.trim() === "Reply" && b.dataset.id && b.click()
      );
    await flush();
    expect(reply).toHaveBeenCalledWith({
      feedItemId: "0D5A",
      segmentsJson: JSON.stringify([{ t: "Thanks" }])
    });
  });

  it("puts a prefilled request in the writing box without posting it", async () => {
    const el = make();
    await flush();
    el.prefill("Please check the usages");
    expect(post).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".postbox").getSegments()).toEqual([
      { t: "Please check the usages" }
    ]);
  });
});

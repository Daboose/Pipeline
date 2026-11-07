import { createElement } from "lwc";
import PipelineMobileChatter from "c/pipelineMobileChatter";
import getFeed from "@salesforce/apex/PipelineChatterController.getFeed";
import post from "@salesforce/apex/PipelineChatterController.post";
import reply from "@salesforce/apex/PipelineChatterController.reply";
import searchPeople from "@salesforce/apex/PipelineChatterController.searchPeople";

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
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const FEED = [
  {
    id: "0D5A",
    who: "Lewis Dawson",
    posted: daysAgo(2),
    text: "Visited Mater. @Priya Nair can we get a loan set?",
    replies: [
      { id: "0D7A", who: "Priya Nair", posted: daysAgo(1), text: "Booked." }
    ]
  },
  {
    id: "0D5B",
    who: "Jordan Reid",
    posted: daysAgo(9),
    text: "<p>Good progress.</p>",
    replies: []
  }
];

const make = async (props = {}) => {
  getFeed.mockResolvedValue(FEED);
  const el = createElement("c-pipeline-mobile-chatter", {
    is: PipelineMobileChatter
  });
  Object.assign(el, {
    dealLabel: "Dr Chris Lee · Opportunity",
    recordId: "a01X",
    ...props
  });
  document.body.appendChild(el);
  await wait();
  return el;
};
const root = (el) => el.shadowRoot;

describe("c-pipeline-mobile-chatter", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("shows the newest posts with their replies, a mention coloured, and tells the screen how many", async () => {
    const heard = [];
    getFeed.mockResolvedValue(FEED);
    const el = createElement("c-pipeline-mobile-chatter", {
      is: PipelineMobileChatter
    });
    el.addEventListener("feed", (e) => heard.push(e.detail));
    el.recordId = "a01X";
    document.body.appendChild(el);
    await wait();
    expect(getFeed).toHaveBeenCalledWith({ dealId: "a01X" });
    expect(root(el).querySelectorAll(".post").length).toBe(2);
    expect(root(el).querySelectorAll(".reply").length).toBe(1);
    expect(root(el).querySelector(".mention").textContent).toBe("@Priya Nair");
    expect(root(el).querySelectorAll(".txt")[2].textContent).toContain(
      "Good progress."
    );
    expect(root(el).querySelector(".meta .when").textContent).toBe("2 d ago");
    expect(heard).toEqual(["2 posts · last yesterday"]);
  });

  it("says so when nobody has posted", async () => {
    getFeed.mockResolvedValue([]);
    const el = createElement("c-pipeline-mobile-chatter", {
      is: PipelineMobileChatter
    });
    el.recordId = "a01X";
    document.body.appendChild(el);
    await wait();
    expect(root(el).querySelector(".none").textContent).toContain(
      "Nobody has posted"
    );
  });

  it("slides in when it is opened, and the Back bar asks the screen to slide it off", async () => {
    const el = await make();
    expect(root(el).querySelector(".chatpage").classList.contains("on")).toBe(
      false
    );
    el.open = true;
    await wait();
    expect(root(el).querySelector(".chatpage").classList.contains("on")).toBe(
      true
    );
    let closed = false;
    el.addEventListener("close", () => (closed = true));
    root(el).querySelector(".chatpage .backbtn").click();
    expect(closed).toBe(true);
  });

  it("writes a new post on the page that slides in, and posts it as pieces", async () => {
    post.mockResolvedValue();
    const el = await make();
    let posted = false;
    el.addEventListener("posted", () => (posted = true));
    root(el).querySelector(".bigbtn").click();
    await wait();
    const page = root(el).querySelector(".writepage");
    expect(page.classList.contains("on")).toBe(true);
    expect(page.querySelector(".sht").textContent).toBe("New post");
    page.querySelector(".postbtn").click(); // nothing written
    await wait();
    expect(page.querySelector(".err").textContent).toBe(
      "Write something to post."
    );
    page.querySelector(".wtext").value = "  Visited again  ";
    page.querySelector(".postbtn").click();
    await wait();
    expect(post).toHaveBeenCalledWith({
      dealId: "a01X",
      segmentsJson: JSON.stringify([{ t: "Visited again" }])
    });
    expect(posted).toBe(true);
    expect(page.classList.contains("on")).toBe(false);
    expect(getFeed.mock.calls.length).toBe(2); // read again after posting
  });

  it("replies to a post, with that post shown above the box", async () => {
    reply.mockResolvedValue();
    const el = await make();
    root(el).querySelector(".rbtn").click();
    await wait();
    const page = root(el).querySelector(".writepage");
    expect(page.querySelector(".sht").textContent).toBe(
      "Reply to Lewis Dawson"
    );
    expect(page.querySelector(".quote").textContent).toContain("Visited Mater");
    page.querySelector(".wtext").value = "Thanks";
    page.querySelector(".postbtn").click();
    await wait();
    expect(reply).toHaveBeenCalledWith({
      feedItemId: "0D5A",
      segmentsJson: JSON.stringify([{ t: "Thanks" }])
    });
  });

  it("offers people after @ and three letters, and a name picked becomes a real mention", async () => {
    post.mockResolvedValue();
    searchPeople.mockResolvedValue([
      { id: "005A", name: "Priya Nair", title: "Product Specialist" }
    ]);
    const el = await make();
    root(el).querySelector(".bigbtn").click();
    await wait();
    const box = root(el).querySelector(".wtext");
    box.value = "Thanks @pr";
    box.setSelectionRange(10, 10);
    box.dispatchEvent(new CustomEvent("input"));
    await wait();
    expect(root(el).querySelector(".people").classList.contains("on")).toBe(
      true
    );
    expect(root(el).querySelector(".hint").textContent).toContain(
      "three letters"
    );
    box.value = "Thanks @pri";
    box.setSelectionRange(11, 11);
    box.dispatchEvent(new CustomEvent("input"));
    await wait(300);
    expect(searchPeople).toHaveBeenCalledWith({ term: "pri" });
    root(el).querySelector(".person").click();
    await wait();
    expect(box.value).toBe("Thanks @Priya Nair ");
    expect(root(el).querySelector(".people").classList.contains("on")).toBe(
      false
    );
    root(el).querySelector(".postbtn").click();
    await wait();
    expect(post).toHaveBeenCalledWith({
      dealId: "a01X",
      segmentsJson: JSON.stringify([
        { t: "Thanks " },
        { u: "005A", n: "Priya Nair" }
      ])
    });
  });

  it("keeps the words and says what Salesforce said when a post is refused", async () => {
    post.mockRejectedValue({ body: { message: "That post is too long." } });
    const el = await make();
    root(el).querySelector(".bigbtn").click();
    await wait();
    root(el).querySelector(".wtext").value = "Something";
    root(el).querySelector(".postbtn").click();
    await wait();
    expect(root(el).querySelector(".writepage .err").textContent).toBe(
      "That post is too long."
    );
    expect(root(el).querySelector(".writepage").classList.contains("on")).toBe(
      true
    );
    expect(root(el).querySelector(".wtext").value).toBe("Something");
  });

  it("Cancel puts the writing page away without posting", async () => {
    const el = await make();
    root(el).querySelector(".bigbtn").click();
    await wait();
    root(el).querySelector(".cancel").click();
    await wait();
    expect(root(el).querySelector(".writepage").classList.contains("on")).toBe(
      false
    );
    expect(post).not.toHaveBeenCalled();
  });
});

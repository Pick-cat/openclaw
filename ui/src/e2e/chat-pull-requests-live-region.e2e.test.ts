import type { Page } from "playwright";
import { expect, it } from "vitest";
import {
  CONTROL_UI_SESSION_PULL_REQUESTS_CHANGED_EVENT,
  type ControlUiSessionPullRequest,
  SESSION_PULL_REQUESTS_SUBSCRIBE_METHOD,
} from "../../../src/gateway/control-ui-contract.js";
import { controlUiSessionUrl, installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { openChatDetails } from "./chat-details.test-support.ts";
import { waitForWatchedSessionKey } from "./chat-github-publication.test-support.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const sessionKey = "agent:main:dashboard:pr-announcement";
const sessionId = "pr-announcement-incarnation";
const headSha = "a".repeat(40);

function pullRequest(
  number: number,
  checks: ControlUiSessionPullRequest["checks"] = {
    state: "pending",
    passed: 4,
    failed: 0,
    running: 1,
    skipped: 0,
  },
): ControlUiSessionPullRequest {
  return {
    owner: "openclaw",
    repo: "openclaw",
    number,
    branch: `feature/pr-${number}`,
    title: `Repair the widget path ${number}`,
    url: `https://github.com/openclaw/openclaw/pull/${number}`,
    state: "open",
    headSha,
    additions: 4,
    deletions: 3,
    checks,
    checksUrl: `https://github.com/openclaw/openclaw/pull/${number}/checks`,
  };
}

const suite = createControlUiE2eSuite({
  name: "chat pull request live region",
  trackBrowserContexts: true,
});

async function setup() {
  const context = await suite.newBrowserContext({
    viewport: { width: 1180, height: 900 },
    colorScheme: "dark",
    locale: "en-US",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const gateway = await installMockGateway(page, {
    sessionKey,
    sessions: [{ key: sessionKey, sessionId, label: "PR review", kind: "direct", updatedAt: 1 }],
    featureMethods: ["chat.metadata", "chat.startup", SESSION_PULL_REQUESTS_SUBSCRIBE_METHOD],
    historyMessages: [
      { role: "assistant", content: "The branch is ready for review.", timestamp: 1 },
    ],
    methodResponses: { [SESSION_PULL_REQUESTS_SUBSCRIBE_METHOD]: { subscribed: true } },
  });
  await page.goto(controlUiSessionUrl(suite.server.baseUrl, sessionKey));
  const watchedKey = await waitForWatchedSessionKey(gateway);
  // With the details panel enabled the pull request list renders there rather than inline in
  // the transcript.
  await openChatDetails(page);
  async function publish(rows: ControlUiSessionPullRequest[]) {
    await gateway.emitGatewayEvent(CONTROL_UI_SESSION_PULL_REQUESTS_CHANGED_EVENT, {
      sessions: { [watchedKey]: { pullRequests: rows, rateLimited: false, status: "ready" } },
    });
    await page.locator(".chat-prs").first().waitFor();
  }
  return { page, gateway, publish };
}

/**
 * The polite live region the chat pull request list exposes. The page can hold other polite
 * regions (the activity/inbox panel among them), so address this one by its announced content.
 */
function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"]', { hasText: /pull requests?\b/ }).first();
}

async function announcedText(page: Page): Promise<string> {
  const region = liveRegion(page);
  await region.waitFor();
  return (await region.textContent())?.replace(/\s+/g, " ").trim() ?? "";
}

/** The polite live regions Chromium reports, for the accessibility trace. */
async function politeRegions(page: Page): Promise<Array<{ role: string; name: string }>> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Accessibility.enable");
    const { nodes } = (await session.send("Accessibility.getFullAXTree")) as {
      nodes: Array<{
        ignored?: boolean;
        role?: { value?: string };
        name?: { value?: string };
        properties?: Array<{ name: string; value?: { value?: unknown } }>;
      }>;
    };
    return nodes
      .filter(
        (node) =>
          !node.ignored &&
          node.properties?.some(
            (property) => property.name === "live" && property.value?.value === "polite",
          ),
      )
      .map((node) => ({
        role: node.role?.value ?? "",
        name: (node.name?.value ?? "").replace(/\s+/g, " ").trim(),
      }));
  } finally {
    await session.detach();
  }
}

suite.define(() => {
  it("announces the count, stays silent through an identical poll, and announces a real CI change once", async () => {
    const { page, publish } = await setup();

    await publish([pullRequest(101), pullRequest(102)]);
    await expect.poll(() => announcedText(page)).toBe("2 pull requests");
    expect(await page.locator(".chat-prs a").count()).toBeGreaterThanOrEqual(2);

    // The live region carries the count and no interactive descendants.
    expect(await liveRegion(page).locator("a, button").count()).toBe(0);

    // Chromium's accessibility tree exposes a polite live region for this surface.
    expect((await politeRegions(page)).some((region) => region.role === "status")).toBe(true);

    // An identical poll re-sends the same snapshot; nothing may be announced.
    const rowsBefore = await page.locator(".chat-prs").innerHTML();
    const announcedBefore = await announcedText(page);
    await publish([pullRequest(101), pullRequest(102)]);
    expect(await announcedText(page)).toBe(announcedBefore);
    expect(await page.locator(".chat-prs").innerHTML()).toBe(rowsBefore);

    // A genuine transition (pending -> failing) is announced once, through the CI region.
    await publish([
      pullRequest(101, { state: "failing", passed: 3, failed: 1, running: 0, skipped: 0 }),
      pullRequest(102, { state: "failing", passed: 3, failed: 1, running: 0, skipped: 0 }),
    ]);
    await expect.poll(() => page.locator(".chat-prs").innerHTML()).not.toBe(rowsBefore);
    await expect
      .poll(() =>
        page
          .locator('[aria-live="polite"]', { hasText: /failing CI/ })
          .first()
          .textContent(),
      )
      .toContain("2 pull requests have failing CI");
    // The count itself did not change.
    expect(await announcedText(page)).toBe("2 pull requests");

    // Completion is announced rather than produced by clearing the region.
    await publish([
      pullRequest(101, { state: "passing", passed: 6, failed: 0, running: 0, skipped: 0 }),
      pullRequest(102, { state: "passing", passed: 6, failed: 0, running: 0, skipped: 0 }),
    ]);
    await expect
      .poll(() =>
        page
          .locator('[aria-live="polite"]', { hasText: /CI passed/ })
          .first()
          .textContent(),
      )
      .toContain("CI passed for 2 pull requests");

    // A count change still updates the count announcement.
    await publish([pullRequest(101)]);
    await expect.poll(() => announcedText(page)).toBe("1 pull request");
  });
});

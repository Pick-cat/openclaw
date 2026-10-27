/* @vitest-environment jsdom */
import { afterEach, expect, it } from "vitest";
import { restoreMocksAndGlobals } from "../../../test-helpers/mock-cleanup.ts";
import { waitForSolid } from "../../../test-helpers/solid-settle.ts";
import {
  clearChatPullRequests,
  paintChatPullRequests,
  pullRequest,
} from "./chat-pull-requests.test-support.ts";

afterEach(() => restoreMocksAndGlobals());

// The CI status poll rewrites the row contents every few seconds. Only the row
// count may reach the live region, and only when that count changes, otherwise
// screen readers re-read the whole card on every poll.
it("keeps CI churn out of the live region and announces only count changes", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const first = pullRequest();
  const second = pullRequest({
    number: 103470,
    url: "https://github.com/openclaw/openclaw/pull/103470",
  });

  // Two rows, everything passing.
  paintChatPullRequests({ pullRequests: [first, second], status: "ready" }, container);
  await waitForSolid(() =>
    expect(container.querySelectorAll(".chat-prs a").length).toBeGreaterThanOrEqual(2),
  );

  const region = container.querySelector('[aria-live="polite"]');
  expect(region).not.toBeNull();
  const announced = () => region?.textContent?.trim() ?? "";
  expect(announced()).toBe("2 pull requests");

  // The count did not change, so the row markup must not be part of the region.
  expect(region?.querySelector("a")).toBeNull();
  expect(region?.querySelectorAll("*").length).toBe(0);

  // A CI-only refresh: same rows, different check totals.
  paintChatPullRequests(
    {
      pullRequests: [
        pullRequest({ checks: { state: "failing", passed: 3, failed: 2, skipped: 1, running: 0 } }),
        second,
      ],
      status: "ready",
    },
    container,
  );
  // The CI badge changed, but the row count did not, so the region is untouched.
  await waitForSolid(() =>
    expect(container.querySelector(".chat-prs")?.textContent).toContain("103469"),
  );
  expect(announced()).toBe("2 pull requests");
  expect(announced()).toBe("2 pull requests");

  // The count changes, so the announcement changes with it.
  paintChatPullRequests({ pullRequests: [first], status: "ready" }, container);
  await waitForSolid(() => expect(announced()).toBe("1 pull request"));

  clearChatPullRequests(container);
  container.remove();
});

it("keeps the renderer's rows interactive while the region stays empty", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  paintChatPullRequests({ pullRequests: [pullRequest()], status: "ready" }, container);
  await waitForSolid(() =>
    expect(container.querySelectorAll(".chat-prs a").length).toBeGreaterThanOrEqual(1),
  );

  const region = container.querySelector('[aria-live="polite"]');
  expect(region?.getAttribute("aria-atomic")).toBe("true");
  expect(region?.querySelectorAll("a, button").length).toBe(0);

  clearChatPullRequests(container);
  container.remove();
});

import { afterEach, expect, it, vi } from "vitest";
import { mountSolid } from "../../../test-helpers/mount-solid.ts";
import { flush } from "../../../test-helpers/solid-settle.ts";
import { ChatPullRequestsContent } from "./chat-pull-requests-content.tsx";
import { pullRequest } from "./chat-pull-requests.test-support.ts";

let mounted: ReturnType<typeof mountSolid> | undefined;
const container = document.createElement("div");

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  container.remove();
  document.head.querySelectorAll("style[data-pr-region]").forEach((node) => node.remove());
});

function paint(pullRequests: ReturnType<typeof pullRequest>[]) {
  mounted?.unmount();
  mounted = mountSolid(
    () => (
      <ChatPullRequestsContent pullRequests={pullRequests} status="ready" onDismiss={vi.fn()} />
    ),
    { container },
  );
  flush();
}

function regions(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[aria-live="polite"]'));
}

it("announces only the pull request count and keeps CI churn out of the region", () => {
  const first = pullRequest();
  const second = pullRequest({
    number: 103470,
    url: "https://github.com/openclaw/openclaw/pull/103470",
  });

  paint([first, second]);
  expect(container.querySelectorAll(".chat-prs a").length).toBeGreaterThanOrEqual(2);

  // The announced payload must be the count alone, never the row markup.
  const region = regions()[0];
  expect(region).toBeTruthy();
  expect((region!.textContent ?? "").trim()).toBe("2 pull requests");
  expect(region!.querySelectorAll("a, button").length).toBe(0);

  // A CI-only refresh keeps the count, so the region keeps its payload.
  const before = region!.textContent;
  paint([
    pullRequest({ checks: { state: "failing", passed: 3, failed: 2, skipped: 1, running: 0 } }),
    second,
  ]);
  expect(container.querySelectorAll(".chat-prs a").length).toBeGreaterThanOrEqual(2);
  expect(regions()[0]!.textContent).toBe(before);

  // A count change updates the announced payload.
  paint([first]);
  expect((regions()[0]!.textContent ?? "").trim()).toBe("1 pull request");
});

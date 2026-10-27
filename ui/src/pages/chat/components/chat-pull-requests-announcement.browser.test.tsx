import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountSolid } from "../../../test-helpers/mount-solid.ts";
import { flush } from "../../../test-helpers/solid-settle.ts";
import { ChatPullRequestsContent } from "./chat-pull-requests-content.tsx";
import { pullRequest } from "./chat-pull-requests.test-support.ts";

let mounted: ReturnType<typeof mountSolid> | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.body.appendChild(document.createElement("div"));
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  container.remove();
});

type Row = ReturnType<typeof pullRequest>;

/**
 * Mounts once and drives the component through its real reactive updates. Re-mounting on each
 * "refresh" would destroy and recreate the live region, which cannot say anything about whether a
 * poll re-announces; only an in-place update can.
 */
function mountWithRows(initial: Row[]) {
  const [rows, setRows] = createSignal(initial);
  mounted = mountSolid(
    () => <ChatPullRequestsContent pullRequests={rows()} status="ready" onDismiss={vi.fn()} />,
    { container },
  );
  flush();
  return setRows;
}

function region(): HTMLElement {
  const found = container.querySelector<HTMLElement>('[aria-live="polite"]');
  if (!found) {
    throw new Error("expected the pull request list to expose a polite live region");
  }
  return found;
}

function rowLinks(): number {
  return container.querySelectorAll(".chat-prs a").length;
}

/** Records every DOM mutation the browser reports inside the live region. */
async function mutationsDuring(target: Node, act: () => void): Promise<MutationRecord[]> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(target, { childList: true, characterData: true, subtree: true });
  act();
  await Promise.resolve();
  observer.disconnect();
  return records;
}

const failingChecks = { state: "failing", passed: 3, failed: 2, skipped: 1, running: 0 } as const;

it("announces only the count and stays silent through a CI-only refresh", async () => {
  const first = pullRequest();
  const second = pullRequest({
    number: 103470,
    url: "https://github.com/openclaw/openclaw/pull/103470",
  });
  const setRows = mountWithRows([first, second]);

  expect(rowLinks()).toBeGreaterThanOrEqual(2);

  // The announced payload is the count alone: no row links, no controls.
  const live = region();
  expect((live.textContent ?? "").trim()).toBe("2 pull requests");
  expect(live.querySelectorAll("a, button").length).toBe(0);

  // A CI-only refresh: the same rows come back with different check totals.
  const rowsBefore = container.querySelector(".chat-prs")!.innerHTML;
  const records = await mutationsDuring(live, () => {
    setRows([
      pullRequest({ checks: failingChecks }),
      pullRequest({
        number: 103470,
        url: "https://github.com/openclaw/openclaw/pull/103470",
        checks: failingChecks,
      }),
    ]);
    flush();
  });

  // The rows really did re-render with the new check state...
  expect(rowLinks()).toBeGreaterThanOrEqual(2);
  expect(container.querySelector(".chat-prs")!.innerHTML).not.toBe(rowsBefore);
  // ...but the live region neither changed nor was replaced, so nothing is re-announced.
  expect(records.filter((record) => record.type !== "attributes")).toEqual([]);
  expect(region()).toBe(live);
  expect(live.isConnected).toBe(true);
  expect((live.textContent ?? "").trim()).toBe("2 pull requests");
});

it("updates the announced count in place when the row count changes", async () => {
  const first = pullRequest();
  const second = pullRequest({
    number: 103470,
    url: "https://github.com/openclaw/openclaw/pull/103470",
  });
  const setRows = mountWithRows([first, second]);
  const live = region();
  expect((live.textContent ?? "").trim()).toBe("2 pull requests");

  const records = await mutationsDuring(live, () => {
    setRows([first]);
    flush();
  });

  // The count changed, so the region did update - and it stayed the same element.
  expect(records.length).toBeGreaterThan(0);
  expect(region()).toBe(live);
  expect((live.textContent ?? "").trim()).toBe("1 pull request");
});

// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUsers } from "../src/components/admin-users";
import type { PasswordReset, User } from "../src/contracts";

const admin: User = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "Administrator",
  email: "admin@example.test",
  role: "global_admin",
  mustChangePassword: false,
};
const member: User = {
  ...admin,
  id: "123e4567-e89b-42d3-a456-426614174001",
  name: "Testperson",
  email: "member@example.test",
  role: "user",
};
const result: PasswordReset = {
  user: { ...member, mustChangePassword: true },
  temporaryPassword: "Synthetic_password_12345",
  expiresAt: "2026-10-13T12:00:00.000Z",
};
let root: Root;
let container: HTMLDivElement;
let fail: boolean;
let requests: string[];
const copy = vi.fn();
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function render() {
  await act(async () =>
    root.render(createElement(AdminUsers, { currentUserId: admin.id })),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fail = false;
  requests = [];
  copy.mockReset().mockResolvedValue(undefined);
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(copy);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        requests.push(path);
        if (fail) throw new TypeError("Connection lost after commit");
        return Response.json(result);
      }
      return Response.json({ users: [admin, member] });
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("administrator one-time passwords", () => {
  it("confirms the named account, shows and copies the secret once, then clears it", async () => {
    await render();
    expect(
      document.querySelector(
        '[aria-label="Återställ lösenord för Administrator"]',
      ),
    ).toBeNull();
    await click("Återställ lösenord");
    expect(document.querySelector("dialog")?.textContent).toContain(
      member.email,
    );
    expect(document.querySelector("dialog")?.textContent).toContain(
      "API-nycklar återkallas",
    );
    expect(requests).toEqual([]);
    await click("Avbryt");
    expect(requests).toEqual([]);
    await click("Återställ lösenord");
    await click("Generera engångslösenord");
    expect(requests).toEqual([`/api/admin/users/${member.id}/reset-password`]);
    const password = document.querySelector("dialog input");
    expect(password).toBeInstanceOf(HTMLInputElement);
    if (!(password instanceof HTMLInputElement))
      throw new Error("Missing password field");
    expect(password.readOnly).toBe(true);
    expect(password.value).toBe(result.temporaryPassword);
    expect(document.querySelector("time")?.dateTime).toBe(result.expiresAt);
    await click("Kopiera lösenord");
    expect(copy).toHaveBeenCalledWith(result.temporaryPassword);
    expect(document.body.textContent).toContain("Lösenordet har kopierats.");
    await click("Klart");
    expect(document.querySelector("dialog input")).toBeNull();
    expect(container.textContent).toContain("Behöver byta lösenord");
    await click("Återställ lösenord");
    expect(document.querySelector("dialog input")).toBeNull();
    expect(requests).toHaveLength(1);
  });
  it("does not retry an uncertain outcome and requires a fresh confirmation", async () => {
    await render();
    await click("Återställ lösenord");
    fail = true;
    await click("Generera engångslösenord");
    expect(document.body.textContent).toContain(
      "Lösenordet kan redan ha ändrats",
    );
    expect(document.querySelector("dialog input")).toBeNull();
    expect(requests).toHaveLength(1);
    await click("Stäng");
    await click("Återställ lösenord");
    expect(requests).toHaveLength(1);
    fail = false;
    await click("Generera engångslösenord");
    expect(requests).toHaveLength(2);
  });
  it("retains the visible password when clipboard access fails", async () => {
    await render();
    await click("Återställ lösenord");
    await click("Generera engångslösenord");
    copy.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    await click("Kopiera lösenord");
    expect(document.body.textContent).toContain(
      "Markera och kopiera det i fältet",
    );
    expect(document.querySelector("dialog input")?.getAttribute("value")).toBe(
      result.temporaryPassword,
    );
  });
});

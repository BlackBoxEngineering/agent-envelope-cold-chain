import { expect, test } from "@playwright/test";

// Never contact live hosted services, even if local .env credentials exist.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const seed = "0x" + "11".repeat(32);
    sessionStorage.setItem("agentenvelope:cold-chain-hosted:v1", JSON.stringify({
      apiKey: "test-api-key", ownerUserId: "test-owner",
      monitorBotKey: seed, monitorMintMaterial: seed,
      dispatchBotKey: seed, dispatchMintMaterial: seed,
      engineerBotKey: seed, engineerMintMaterial: seed,
    }));
  });
  await context.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    if (host === "fonts.googleapis.com") return route.fulfill({ contentType: "text/css", body: "" });
    return ["127.0.0.1", "localhost"].includes(host) ? route.continue() : route.abort();
  });
});


test("rejects the 50C attack and preserves decision evidence", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AgentEnvelope Cold Chain" })).toBeVisible();
  await page.getByRole("button", { name: "Start system" }).click();
  await expect(page.getByText("Simulator ready")).toBeVisible();
  await page.getByRole("button", { name: /50°C attack/i }).click();

  await expect(page.getByRole("heading", { name: "Denied" })).toBeVisible();
  await expect(page.getByText("Command isolated")).toBeVisible();
  await expect(page.locator(".execution-state")).toContainText("Not attempted");
  await expect(page.getByText("authority.not_found", { exact: true })).toBeVisible();
  await expect(page.locator(".decision-id strong")).toHaveText(/AE-[A-F0-9]{8}/);
});

test("separates correct knowledge from control authority", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: /Correct, no authority/i }).click();
  await expect(page.getByRole("heading", { name: "Denied" })).toBeVisible();
  await expect(page.getByText("authority.operation_denied", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Authorised recovery/i }).click();
  await expect(page.getByRole("heading", { name: "Allowed" })).toBeVisible();
  await expect(page.getByText("Completed in simulator")).toBeVisible();
  await expect(page.locator(".temperature-stack > strong")).toHaveText(/^4\.0°C$/);
});

test("fault recovery requires a separately issued command instead of a scripted timer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: /Compressor fault/i }).click();
  await expect(page.locator(".timeline-heading > strong")).toHaveText("1 entries");
  await expect(page.locator(".temperature-stack > strong")).toHaveText("9.2°C");
  await page.getByRole("button", { name: /Authorised recovery/i }).click();
  await expect(page.locator(".timeline-heading > strong")).toHaveText("2 entries");
  await expect(page.locator(".temperature-stack > strong")).toHaveText("4.0°C");
});

test("denies a known signer that attempts to exceed its exact authority", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: /Scope breakout attempt/i }).click();

  await expect(page.getByRole("heading", { name: "Denied" })).toBeVisible();
  await expect(page.locator(".check-list .pass")).toHaveCount(4);
  await expect(page.getByText("authority.parameter_denied", { exact: true })).toBeVisible();
  await expect(page.getByText("8-hour scope breakout blocked")).toBeVisible();
  await expect(page.getByText(/authority cannot expand its own scope/i)).toBeVisible();
  await expect(page.locator(".decision-panel").getByText(/duration:8h.*outside the immutable Action Envelope/i)).toBeVisible();
  await expect(page.locator(".execution-state")).toContainText("Not attempted");
});

test("remains usable on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Refrigeration control boundary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start system" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/cold-chain-mobile.png", fullPage: true });
});

test("exposes the optional portal handoff without blocking the local demo", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Setup guide" }).click();

  await expect(page.getByRole("heading", { name: "Connect portal-created agents" })).toBeVisible();
  await expect(page.getByText("Temperature monitor", { exact: true })).toBeVisible();
  await expect(page.getByText("Maintenance dispatch", { exact: true })).toBeVisible();
  await expect(page.getByText("Site engineer controller", { exact: true })).toBeVisible();
  await expect(page.locator(".hosted-role summary em")).toHaveText(["ready", "ready", "ready"]);
  await expect(page.getByRole("button", { name: "Save session" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

async function configureHosted(page, respond) {
  const seed = "0x" + "11".repeat(32);
  await page.addInitScript(({ seed }) => {
    window.sessionStorage.setItem("agentenvelope:cold-chain-hosted:v1", JSON.stringify({
      apiKey: "test-api-key", ownerUserId: "test-owner",
      monitorBotKey: seed, monitorMintMaterial: seed,
      dispatchBotKey: seed, dispatchMintMaterial: seed,
      engineerBotKey: seed, engineerMintMaterial: seed,
    }));
  }, { seed });
  await page.route("**/sovereign/**", respond);
  await page.goto("/");
  await page.getByLabel("Execution mode").selectOption("hosted");
  await page.getByRole("button", { name: "Start system" }).click();
}

async function effectCount(page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("agentenvelope:cold-chain-executor:v2"));
    return state?.commands[state.order[0]]?.effectCount ?? 0;
  });
}

async function successfulResponse(route) {
  const body = route.request().postDataJSON();
  const path = new URL(route.request().url()).pathname;
  const result = path.endsWith("/mint") ? { valid: true, delegateId: body.delegate.delegateId, requestId: body.request.requestId }
    : path.endsWith("/register-delegated") ? { accepted: true, delegated: true }
    : path.endsWith("/verify") ? { valid: true }
    : { accepted: true };
  await route.fulfill({ json: { statusCode: path.endsWith("/register-delegated") ? 201 : 200, body: JSON.stringify(result) } });
}

test("hosted approval precedes the effect; accepted reporting is not called witnessed", async ({ page }) => {
  const calls = [];
  await configureHosted(page, async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path.split("/").at(-1));
    expect(await effectCount(page)).toBe(path.endsWith("/outcomes") ? 1 : 0);
    await successfulResponse(route);
  });
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.locator(".hosted-state-pill")).toHaveText("recorded");
  expect(calls).toEqual(["mint", "register-delegated", "verify", "outcomes"]);
  await expect(page.locator(".hosted-records-panel")).toContainText("report accepted; no witness proof returned");
  expect(await effectCount(page)).toBe(1);
});

for (const rejectedStage of ["mint", "register-delegated", "verify"]) {
  test("hosted " + rejectedStage + " rejection prevents execution", async ({ page }) => {
    let outcomes = 0;
    await configureHosted(page, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/outcomes")) outcomes++;
      if (path.endsWith("/" + rejectedStage)) {
        await route.fulfill({ status: 403, json: { error: "Test policy denial" } });
      } else await successfulResponse(route);
    });
    await page.getByRole("button", { name: /Authorised recovery/i }).click();
    await expect(page.getByRole("heading", { name: "Denied", exact: true })).toBeVisible();
    await expect(page.locator(".decision-panel")).toContainText("Test policy denial");
    expect(await effectCount(page)).toBe(0);
    await expect(page.locator(".temperature-stack > strong")).toHaveText("9.2°C");
    expect(outcomes).toBe(0);
  });
}

test("offline duplicate delivery is refused and receipt survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.getByText("Completed in simulator", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run selected command", exact: true }).click();
  await expect(page.locator(".decision-panel")).toContainText("already completed");
  expect(await effectCount(page)).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Retrieve receipt / retry report" }).click();
  await expect(page.getByRole("heading", { name: "Receipt recovered", exact: true })).toBeVisible();
  expect(await effectCount(page)).toBe(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/cold-chain-desktop.png", fullPage: true });
});

test("HTTP success with a negative hosted verification verdict still blocks execution", async ({ page }) => {
  let outcomes = 0;
  await configureHosted(page, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/outcomes")) outcomes++;
    if (path.endsWith("/verify")) return route.fulfill({ json: { valid: false, reason: "Hosted legitimacy suspended" } });
    return successfulResponse(route);
  });
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.locator(".decision-panel")).toContainText("Hosted legitimacy suspended");
  expect(await effectCount(page)).toBe(0);
  expect(outcomes).toBe(0);
});

test("unread command survives reload and resumes without a fresh authority", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByLabel("Break point").selectOption("before-read");
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.locator(".execution-state")).toContainText("Not read");
  const id = await page.getByLabel("Stored commands").inputValue();
  await page.reload();
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: "Run selected command", exact: true }).click();
  await expect(page.locator(".execution-state")).toContainText("Completed in simulator");
  expect(await page.getByLabel("Stored commands").inputValue()).toBe(id);
  expect(await effectCount(page)).toBe(1);
});

test("lost reply retrieves the original receipt without replay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByLabel("Break point").selectOption("receipt-lost");
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.locator(".execution-state")).toContainText("Receipt missing");
  await page.getByRole("button", { name: "Retrieve receipt / retry report" }).click();
  await expect(page.getByRole("heading", { name: "Receipt recovered", exact: true })).toBeVisible();
  expect(await effectCount(page)).toBe(1);
});

test("uncertain execution survives restart and blocks new work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByLabel("Break point").selectOption("after-effect");
  await page.getByRole("button", { name: /Authorised recovery/i }).click();
  await expect(page.locator(".execution-state")).toContainText("Outcome unknown");
  await page.reload();
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: "Run selected command", exact: true }).click();
  await expect(page.locator(".execution-state")).toContainText("Outcome unknown");
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.getByRole("alert")).toContainText("uncertain");
  expect(await effectCount(page)).toBe(1);
});

test("local legitimacy suspension halts a valid queued command", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByLabel("Break point").selectOption("after-read");
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await page.getByRole("button", { name: "Suspend local legitimacy" }).click();
  await page.getByRole("button", { name: "Run selected command", exact: true }).click();
  await expect(page.locator(".command-strip")).toContainText("client.legitimacy_denied");
  expect(await effectCount(page)).toBe(0);
});

test("report failure retries only the report, with stable identifiers", async ({ page }) => {
  const calls = [];
  const outcomeBodies = [];
  await configureHosted(page, async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path.split("/").at(-1));
    if (path.endsWith("/outcomes")) {
      outcomeBodies.push(route.request().postDataJSON());
      if (outcomeBodies.length === 1) {
        await route.fulfill({ status: 503, json: { error: "Report unavailable" } });
        return;
      }
    }
    await successfulResponse(route);
  });
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.locator(".hosted-state-pill")).toHaveText("report pending");
  expect(await effectCount(page)).toBe(1);
  await page.getByRole("button", { name: "Retrieve receipt / retry report" }).click();
  await expect(page.locator(".hosted-state-pill")).toHaveText("recorded");
  expect(calls).toEqual(["mint", "register-delegated", "verify", "outcomes", "outcomes"]);
  expect(outcomeBodies[0]).toEqual(outcomeBodies[1]);
  expect(await effectCount(page)).toBe(1);
});

test("lost mint reply then duplicate rejection never generates a replacement nonce", async ({ page }) => {
  const requests = [];
  await configureHosted(page, async route => {
    expect(new URL(route.request().url()).pathname).toMatch(/\/mint$/);
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.abort("connectionreset");
    return route.fulfill({ status: 409, json: { error: "Mint nonce already used", code: "MINT_NONCE_ALREADY_USED" } });
  });
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.getByRole("heading", { name: "Denied", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: "Run selected command", exact: true }).click();
  await expect(page.locator(".decision-panel")).toContainText("Mint nonce already used");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(await effectCount(page)).toBe(0);
});

test("two browser tabs cannot execute the same queued command twice", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByLabel("Break point").selectOption("before-read");
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.locator(".execution-state")).toContainText("Not read");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Start system" }).click();
  await Promise.all([page, other].map(tab => tab.getByRole("button", { name: "Run selected command", exact: true }).click()));
  await expect.poll(() => effectCount(page)).toBe(1);
  await expect(page.locator(".decision-panel")).toContainText("already completed");
  expect(await effectCount(other)).toBe(1);
});

test("expired queued authority halts instead of refreshing its window", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByLabel("Break point").selectOption("before-read");
  await page.getByLabel("Command validity").selectOption("5000");
  await page.getByRole("button", { name: /Normal alert/i }).click();
  await expect(page.locator(".execution-state")).toContainText("Not read");
  const id = await page.getByLabel("Stored commands").inputValue();
  await page.clock.fastForward(10000);
  await page.getByRole("button", { name: "Run selected command", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Denied", exact: true })).toBeVisible();
  expect(await page.getByLabel("Stored commands").inputValue()).toBe(id);
  expect(await effectCount(page)).toBe(0);
  await expect(page.getByLabel("Stored commands").locator("option")).toHaveCount(1);
});

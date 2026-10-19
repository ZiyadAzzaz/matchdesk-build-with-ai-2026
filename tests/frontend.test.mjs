/** DOM interaction tests against a real isolated Python HTTP server. No layout/screenshot claim. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = fileURLToPath(new URL("../", import.meta.url));
let processHandle, base;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, description = "UI state") {
  const until = Date.now() + 7000;
  while (Date.now() < until) {
    if (check()) return;
    await pause(15);
  }
  assert.fail("Timed out waiting for " + description);
}
before(async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  base = "http://127.0.0.1:" + port;
  processHandle = spawn(
    process.env.MATCHDESK_TEST_PYTHON || "python",
    ["-m", "matchdesk", "--port", String(port)],
    { cwd: root, windowsHide: true, stdio: "ignore" },
  );
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      ready = (await fetch(base + "/health")).ok;
      if (ready) break;
    } catch {}
    await pause(40);
  }
  assert.ok(ready, "isolated Python server started");
});
after(() => processHandle?.kill());

async function page() {
  const html = await readFile(
    new URL("../matchdesk/static/index.html", import.meta.url),
    "utf8",
  );
  const js = await readFile(
    new URL("../matchdesk/static/app.js", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../matchdesk/static/styles.css", import.meta.url),
    "utf8",
  );
  const errors = [];
  const dom = new JSDOM(html, {
    url: base,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  let cookie = "";
  const style = w.document.createElement("style");
  style.textContent = css;
  w.document.head.append(style);
  assert.ok(
    style.sheet.cssRules.length > 50,
    "stylesheet parses into CSS rules; this is not a layout check",
  );
  w.TextDecoder = TextDecoder;
  // Model dialog APIs only; jsdom does not paint or implement the native OS file picker.
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.addEventListener("error", (event) => errors.push(event.error));
  w.fetch = async (path, options = {}) => {
    const result = await fetch(new URL(path, base), {
      ...options,
      headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) },
    });
    const set = result.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return result;
  };
  w.eval(js);
  await waitFor(
    () => w.document.querySelectorAll(".payment-row").length === 5,
    "initial payment queue",
  );
  return { w, d: w.document, errors, dispose: () => dom.window.close() };
}
function click(w, selector) {
  const n = w.document.querySelector(selector);
  assert.ok(n, selector + " exists");
  n.click();
}
function input(w, selector, value) {
  const n = w.document.querySelector(selector);
  n.value = value;
  n.dispatchEvent(new w.Event("input", { bubbles: true }));
}
function change(w, selector, value) {
  const n = w.document.querySelector(selector);
  n.value = value;
  n.dispatchEvent(new w.Event("change", { bubbles: true }));
}

test("click through real ambiguity, sample evidence, approval, reservation and undo", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    assert.equal(d.querySelectorAll(".allocation").length, 2);
    assert.ok(d.querySelector("#approve-button").disabled);
    click(w, "#evidence-card button");
    assert.ok(d.querySelector("#remittance-dialog").open);
    click(w, "#apply-remittance");
    await waitFor(
      () => !d.querySelector("#remittance-dialog").open,
      "sample evidence saved",
    );
    assert.ok(
      d
        .querySelector(".evidence-hint")
        .textContent.includes("names these invoice IDs"),
    );
    const pair = [...d.querySelectorAll(".allocation")].find(
      (n) =>
        n.textContent.includes("INV-001") && n.textContent.includes("INV-002"),
    );
    pair.click();
    click(w, "#acknowledge");
    assert.equal(d.querySelector("#approve-button").disabled, false);
    click(w, "#approve-button");
    await waitFor(
      () => d.querySelector("#stat-reviewed").textContent === "1",
      "approved allocation",
    );
    assert.ok(d.querySelector("#approve-button").hidden);
    assert.equal(d.querySelector("#stat-invoices").textContent, "5");
    click(w, "#nav-history");
    assert.ok(
      d
        .querySelector("#history-list")
        .textContent.includes("Proposed allocation reviewed"),
    );
    click(w, "#undo-button");
    await waitFor(
      () => d.querySelector("#stat-reviewed").textContent === "0",
      "undone review",
    );
    assert.equal(d.querySelectorAll(".allocation").length, 2);
    assert.equal(p.errors.length, 0);
  } finally {
    p.dispose();
  }
});

test("search, unknown-customer scope and unsaved evidence have truthful controls", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    input(w, "#payment-search", "PAY-004");
    assert.equal(d.querySelectorAll(".payment-row").length, 1);
    click(w, ".payment-row");
    assert.equal(d.querySelectorAll(".allocation").length, 0);
    change(w, "#scope-customer", "Northstar Studio");
    await waitFor(
      () => d.querySelectorAll(".allocation").length === 1,
      "customer-scoped match",
    );
    input(w, "#evidence-note", "A reviewer note that is not saved yet.");
    click(w, ".allocation");
    assert.equal(
      d.querySelector("#evidence-note").value,
      "A reviewer note that is not saved yet.",
    );
    click(w, "#acknowledge");
    assert.ok(
      d.querySelector("#approve-button").disabled,
      "unsaved note cannot disappear from a confirmation",
    );
    click(w, "#save-note");
    await waitFor(
      () => d.querySelector("#notice").textContent.includes("Evidence saved"),
      "note save",
    );
    click(w, "#acknowledge");
    assert.equal(d.querySelector("#approve-button").disabled, false);
    change(w, "#payment-filter", "unmatched");
    assert.equal(d.querySelectorAll(".payment-row").length, 0);
    assert.ok(
      d.querySelector("#payment-list").textContent.includes("No payments"),
    );
    // Saving evidence starts a fresh preview even when the queue is filtered.
    // Let that real response render before disposing the simulated document.
    await waitFor(
      () =>
        d
          .querySelector("#impact-preview")
          .textContent.includes("If you confirm"),
      "customer-scoped saved-note preview completed",
    );
    assert.equal(p.errors.length, 0);
  } finally {
    p.dispose();
  }
});

async function setFile(p, role, text) {
  const file = {
    size: Buffer.byteLength(text),
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
  Object.defineProperty(p.d.querySelector("#" + role + "-file"), "files", {
    configurable: true,
    value: [file],
  });
  p.d
    .querySelector("#" + role + "-file")
    .dispatchEvent(new p.w.Event("change", { bubbles: true }));
}

test("selecting payment and invoice cards retains focus on the selected control", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    const payment = d.querySelectorAll(".payment-row")[1];
    payment.focus();
    payment.click();
    assert.ok(d.activeElement.classList.contains("payment-row"));
    assert.equal(d.activeElement.getAttribute("aria-pressed"), "true");
    const allocation = d.querySelector(".allocation");
    allocation.focus();
    allocation.click();
    assert.ok(d.activeElement.classList.contains("allocation"));
    assert.equal(d.activeElement.getAttribute("aria-pressed"), "true");
    await waitFor(
      () =>
        d
          .querySelector("#impact-preview")
          .textContent.includes("If you confirm"),
      "focus test preview completed",
    );
    assert.equal(p.errors.length, 0);
  } finally {
    p.dispose();
  }
});

test("editing an evidence note while its older save is pending preserves the new draft", async () => {
  const p = await page();
  let release;
  try {
    const { w, d } = p;
    const realFetch = w.fetch;
    let held = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    w.fetch = async (path, options) => {
      const response = await realFetch(path, options);
      if (path === "/api/evidence") {
        held = true;
        await gate;
      }
      return response;
    };
    click(w, ".allocation");
    input(w, "#evidence-note", "The first saved note.");
    click(w, "#save-note");
    await waitFor(() => held, "older save accepted by server");
    input(w, "#evidence-note", "A newer draft typed while saving.");
    release();
    await waitFor(
      () => !d.querySelector("#notice").hidden,
      "save response rendered",
    );
    assert.equal(
      d.querySelector("#evidence-note").value,
      "A newer draft typed while saving.",
    );
    assert.match(
      d.querySelector("#evidence-card").textContent,
      /The first saved note/,
    );
    click(w, "#acknowledge");
    assert.ok(
      d.querySelector("#approve-button").disabled,
      "newer unsaved draft must be saved before confirmation",
    );
    w.fetch = realFetch;
    click(w, "#save-note");
    await waitFor(
      () =>
        d.querySelector("#evidence-card").textContent.includes("A newer draft"),
      "new draft saved explicitly",
    );
    click(w, "#acknowledge");
    assert.equal(d.querySelector("#approve-button").disabled, false);
    await waitFor(
      () =>
        d
          .querySelector("#impact-preview")
          .textContent.includes("If you confirm"),
      "latest saved-note preview completed",
    );
    assert.equal(p.errors.length, 0);
  } finally {
    release?.();
    p.dispose();
  }
});

test("guided first payment explains the choice without selecting or confirming for the user", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    click(w, "#start-demo");
    assert.equal(d.querySelector("#walkthrough").hidden, false);
    assert.match(
      d.querySelector("#walkthrough-title").textContent,
      /two different explanations/,
    );
    assert.equal(
      d.querySelectorAll('.allocation[aria-pressed="true"]').length,
      0,
    );
    click(w, "#guide-action");
    click(w, "#guide-action");
    assert.ok(d.querySelector("#remittance-dialog").open);
    click(w, "#apply-remittance");
    await waitFor(
      () => !d.querySelector("#remittance-dialog").open,
      "guided evidence saved",
    );
    assert.match(
      d.querySelector("#walkthrough-title").textContent,
      /You choose/,
    );
    assert.equal(
      d.querySelectorAll('.allocation[aria-pressed="true"]').length,
      0,
    );
    const pair = [...d.querySelectorAll(".allocation")].find(
      (n) =>
        n.textContent.includes("INV-001") && n.textContent.includes("INV-002"),
    );
    pair.click();
    await waitFor(
      () => d.querySelector("#impact-preview").textContent.includes("PAY-005"),
      "real impact preview",
    );
    assert.match(d.querySelector("#allocation-flow").textContent, /INV-002/);
    assert.match(d.querySelector("#choice-checks").textContent, /2 of 2/);
    assert.match(d.querySelector("#impact-preview").textContent, /1 → 0/);
    const before = await (await w.fetch("/api/state")).json();
    assert.equal(
      before.history.length,
      1,
      "only saving evidence is recorded; preview never writes",
    );
    assert.ok(before.invoices.every((i) => !i.reserved));
    click(w, "#guide-action");
    assert.equal(d.activeElement.id, "acknowledge");
    assert.ok(d.querySelector("#approve-button").disabled);
    click(w, "#acknowledge");
    click(w, "#approve-button");
    await waitFor(
      () => d.querySelector("#stat-reviewed").textContent === "1",
      "guided confirmation",
    );
    assert.match(
      d.querySelector(".review-result").textContent,
      /PAY-005: Unmatched/,
    );
    assert.match(
      d.querySelector("#walkthrough-title").textContent,
      /remain available/,
    );
    click(w, "#guide-action");
    assert.match(d.querySelector("#payment-detail").textContent, /PAY-005/);
    assert.match(
      d.querySelector("#candidate-list").textContent,
      /Keep this one unresolved/,
    );
    click(w, "#exit-guide");
    assert.ok(d.querySelector("#walkthrough").hidden);
    assert.equal(
      d.querySelector("#stat-reviewed").textContent,
      "1",
      "exiting never resets decisions",
    );
    assert.equal(p.errors.length, 0);
  } finally {
    p.dispose();
  }
});

test("switching alternatives recomputes consequences and never invents evidence", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    const choose = (ids) =>
      [...d.querySelectorAll(".allocation")]
        .find((n) =>
          ids.every((id) => n.getAttribute("aria-label").includes(id)),
        )
        .click();
    choose(["INV-001", "INV-002"]);
    choose(["INV-003"]);
    await waitFor(
      () =>
        d
          .querySelector("#impact-preview")
          .textContent.includes("No other payment"),
      "single-invoice preview replaces pair preview",
    );
    assert.ok(
      !d.querySelector("#impact-preview").textContent.includes("PAY-005"),
    );
    assert.match(
      d.querySelector("#choice-checks").textContent,
      /No saved note/,
    );
    assert.match(d.querySelector("#allocation-flow").textContent, /INV-003/);
    const state = await (await w.fetch("/api/state")).json();
    assert.equal(state.version, 0);
    assert.equal(state.history.length, 0);
    assert.ok(state.invoices.every((i) => !i.reserved));
    assert.equal(p.errors.length, 0);
  } finally {
    p.dispose();
  }
});

test("a delayed consequence response cannot overwrite a newer selection", async () => {
  const p = await page();
  let release;
  try {
    const { w, d } = p;
    const realFetch = w.fetch;
    let held = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    w.fetch = async (path, options) => {
      const response = await realFetch(path, options);
      if (
        path === "/api/impact" &&
        JSON.parse(options.body).invoice_ids.includes("INV-001")
      ) {
        held = true;
        await gate;
      }
      return response;
    };
    [...d.querySelectorAll(".allocation")]
      .find((n) => n.textContent.includes("INV-001"))
      .click();
    await waitFor(() => held, "hold pair preview response");
    [...d.querySelectorAll(".allocation")]
      .find((n) => n.textContent.includes("INV-003"))
      .click();
    await waitFor(
      () =>
        d
          .querySelector("#impact-preview")
          .textContent.includes("No other payment"),
      "newer selection preview",
    );
    release();
    await pause(80);
    assert.ok(
      !d.querySelector("#impact-preview").textContent.includes("PAY-005"),
    );
    assert.match(d.querySelector("#allocation-flow").textContent, /INV-003/);
    assert.equal(
      d.querySelectorAll('.allocation[aria-pressed="true"]').length,
      1,
    );
    assert.equal(p.errors.length, 0);
  } finally {
    release?.();
    p.dispose();
  }
});

test("a late stale-preview error cannot clear a newer choice or unsaved evidence", async () => {
  const p = await page();
  let release;
  try {
    const { w, d } = p;
    const realFetch = w.fetch;
    let held = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    w.fetch = async (path, options) => {
      const isOld =
        path === "/api/impact" &&
        JSON.parse(options.body).invoice_ids.includes("INV-001");
      const sent = isOld
        ? {
            ...options,
            body: JSON.stringify({ ...JSON.parse(options.body), version: -1 }),
          }
        : options;
      const response = await realFetch(path, sent);
      if (isOld) {
        assert.equal(response.status, 409);
        held = true;
        await gate;
      }
      return response;
    };
    [...d.querySelectorAll(".allocation")]
      .find((n) => n.textContent.includes("INV-001"))
      .click();
    await waitFor(() => held, "hold real stale-preview error");
    [...d.querySelectorAll(".allocation")]
      .find((n) => n.textContent.includes("INV-003"))
      .click();
    input(w, "#evidence-note", "Keep my unsaved evidence.");
    await waitFor(
      () =>
        d
          .querySelector("#impact-preview")
          .textContent.includes("No other payment"),
      "current preview",
    );
    release();
    await pause(80);
    assert.equal(
      d.querySelector("#evidence-note").value,
      "Keep my unsaved evidence.",
    );
    assert.equal(
      d.querySelectorAll('.allocation[aria-pressed="true"]').length,
      1,
    );
    assert.ok(!d.querySelector("#decision-lab").hidden);
    assert.match(d.querySelector("#allocation-flow").textContent, /INV-003/);
    assert.equal(p.errors.length, 0);
  } finally {
    release?.();
    p.dispose();
  }
});
test("file preview, column mapping and import render untrusted values as text", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    click(w, "#import-button");
    const customer = "<img src=x onerror=alert(1)>";
    await setFile(
      p,
      "invoices",
      `Code,Client,Value,Unit\n001,${customer},25.00,USD\n`,
    );
    await setFile(
      p,
      "payments",
      "payment_id,currency,amount\nP-NEW,USD,25.00\n",
    );
    await waitFor(
      () => !d.querySelector("#preview-button").disabled,
      "selected files",
    );
    click(w, "#preview-button");
    await waitFor(() => !d.querySelector("#mapping-area").hidden, "preview");
    for (const [field, header] of Object.entries({
      id: "Code",
      customer: "Client",
      amount: "Value",
      currency: "Unit",
    }))
      change(w, "#map-invoices-" + field, header);
    click(w, "#replace-confirm");
    click(w, "#commit-import");
    await waitFor(
      () => d.querySelector("#stat-payments").textContent === "1",
      "imported dataset",
    );
    assert.ok(d.querySelector("#demo-strip").hidden);
    change(w, "#scope-customer", customer);
    await waitFor(
      () => d.querySelectorAll(".allocation").length === 1,
      "imported match",
    );
    assert.equal(
      d.querySelectorAll("img").length,
      0,
      "imported markup never becomes DOM markup",
    );
    assert.ok(
      d.querySelector("#payment-detail").textContent.includes(customer),
    );
    click(w, "#nav-sources");
    assert.ok(d.querySelector("#source-table").textContent.includes("001"));
    assert.equal(p.errors.length, 0);
  } finally {
    p.dispose();
  }
});

test("bad files leave the workspace intact and a changed file invalidates its preview", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    click(w, "#import-button");
    await setFile(
      p,
      "invoices",
      "invoice_id,customer,currency,amount\nA,Example,USD,1.00\n",
    );
    await setFile(p, "payments", "payment_id,currency,amount\nP,USD,1.00\n");
    await waitFor(
      () => !d.querySelector("#preview-button").disabled,
      "file controls",
    );
    click(w, "#preview-button");
    await waitFor(
      () => !d.querySelector("#mapping-area").hidden,
      "first preview",
    );
    await setFile(
      p,
      "payments",
      "payment_id,currency,amount\nP,USD,1.00,extra\n",
    );
    assert.ok(d.querySelector("#mapping-area").hidden);
    assert.ok(d.querySelector("#import-confirm-area").hidden);
    await waitFor(
      () => !d.querySelector("#preview-button").disabled,
      "replacement file read",
    );
    click(w, "#preview-button");
    await waitFor(
      () => !d.querySelector("#import-error").hidden,
      "bad CSV message",
    );
    assert.match(d.querySelector("#import-error").textContent, /expected/);
    assert.equal(d.querySelector("#stat-payments").textContent, "5");
    assert.equal(p.errors.length, 0);
  } finally {
    p.dispose();
  }
});

test("manual entry supports empty start, validation, safe text and a complete review", async () => {
  const p = await page();
  try {
    const { w, d } = p;
    click(w, "#empty-button");
    click(w, '[data-close="empty-dialog"]');
    assert.equal(d.querySelector("#stat-payments").textContent, "5");
    click(w, "#empty-button");
    click(w, "#confirm-empty");
    await waitFor(() => d.querySelector("#stat-payments").textContent === "0", "empty workspace");
    assert.ok(d.querySelector("#approve-button").disabled);
    assert.ok(d.querySelector("#evidence-note").disabled);
    const customer = '<img src=x onerror="alert(1)">';
    async function add(role, id, amount) {
      click(w, "#add-button");
      change(w, "#add-role", role);
      input(w, "#add-id", id);
      input(w, "#add-customer", customer);
      input(w, "#add-amount", amount);
      d.querySelector("#add-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    }
    await add("invoices", "I-001", "10.00");
    await waitFor(() => !d.querySelector("#add-dialog").open, "saved invoice");
    assert.equal(d.querySelector("#stat-invoices").textContent, "1");
    await add("invoices", "I-001", "10.00");
    await waitFor(() => !d.querySelector("#add-error").hidden, "duplicate validation");
    assert.match(d.querySelector("#add-error").textContent, /already exists/);
    assert.equal(d.querySelector("#add-id").value, "I-001", "invalid entry is retained");
    click(w, '[data-close="add-dialog"]');
    await add("payments", "P-001", "10.00");
    await waitFor(() => d.querySelectorAll(".allocation").length === 1, "manual matching");
    assert.match(d.querySelector("#payment-detail").textContent, /Manual entry/);
    assert.equal(d.querySelectorAll("img").length, 0);
    click(w, ".allocation");
    await waitFor(() => !d.querySelector("#impact-preview").textContent.includes("Checking"), "preview");
    change(w, "#acknowledge", "on");
    d.querySelector("#acknowledge").checked = true;
    d.querySelector("#acknowledge").dispatchEvent(new w.Event("change", { bubbles: true }));
    click(w, "#approve-button");
    await waitFor(() => d.querySelector("#stat-reviewed").textContent === "1", "manual review");
    click(w, "#nav-sources");
    assert.match(d.querySelector("#source-table").textContent, /Manual entry/);
    assert.match(d.querySelector("#source-hash").textContent, /No CSV imported/);
    click(w, '[data-close="source-dialog"]');
    click(w, "#nav-history");
    assert.match(d.querySelector("#history-list").textContent, /Manual record added/);
    assert.equal(p.errors.length, 0);
  } finally { p.dispose(); }
});

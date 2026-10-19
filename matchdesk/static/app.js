"use strict";

const $ = (id) => document.getElementById(id);
const labels = {
  ambiguous: "Ambiguous",
  suggested: "One candidate",
  unmatched: "Unmatched",
  needs_customer: "Choose customer",
  needs_review: "Needs review",
  reviewed: "Reviewed here",
};
let state = null;
let selectedId = null;
let selectedGroup = null;
let importing = {};
let preview = null;
let busy = false;
let guideActive = false;
let guideCompared = false;
let impactSequence = 0;
let lastOutcome = null;
const noteDrafts = new Map();
const importReads = new Map();
const pendingImports = new Set();
let importRevision = 0;

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function append(parent, ...children) {
  for (const child of children) parent.append(child);
  return parent;
}
function current() {
  return state?.payments.find((p) => p.id === selectedId);
}
function money(cents) {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function sourceLabel(row) {
  return row.origin === "manual" ? "Manual entry" : `CSV record ${row.source_row}`;
}
function pill(status) {
  return node("span", "status " + status, labels[status] || status);
}
function notify(message) {
  $("notice").textContent = message;
  $("notice").hidden = false;
}
function failure(message) {
  $("error-text").textContent = message;
  $("error").hidden = false;
}
function close(id) {
  $(id).close();
}
function open(id) {
  if (!$(id).open) $(id).showModal();
}
function equalGroup(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    [...a].sort().every((id, i) => id === [...b].sort()[i])
  );
}

async function request(path, body) {
  const options =
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        };
  const response = await fetch("/api/" + path, {
    ...options,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 409 && path !== "impact") {
      state = await request("state");
      selectedGroup = null;
      noteDrafts.clear();
      if (!current()) selectedId = state.payments[0]?.id || null;
      $("acknowledge").checked = false;
      lastOutcome = null;
      render();
    }
    throw new Error(data.error || "The request could not be completed.");
  }
  return data;
}
async function mutation(action, body = {}, message = "") {
  if (busy || !state) return false;
  busy = true;
  $("error").hidden = true;
  $("approve-button").disabled = true;
  try {
    const before = state;
    state = await request(action, { version: state.version, ...body });
    if (action === "approve") {
      lastOutcome = {
        paymentId: body.payment_id,
        changes: state.payments.filter((p) => {
          const previous = before.payments.find((old) => old.id === p.id);
          return (
            p.id !== body.payment_id &&
            previous &&
            (p.status !== previous.status || p.count !== previous.count)
          );
        }),
      };
    }
    if (["undo", "import", "demo", "empty", "add"].includes(action)) lastOutcome = null;
    if (action === "add") selectedGroup = null;
    if (["import", "demo", "empty"].includes(action)) {
      guideActive = false;
      guideCompared = false;
      noteDrafts.clear();
      selectedGroup = null;
      selectedId = state.payments[0]?.id || null;
    }
    if (action === "evidence" && noteDrafts.get(body.payment_id) === body.note)
      noteDrafts.delete(body.payment_id);
    $("acknowledge").checked = false;
    if (!current()) selectedId = state.payments[0]?.id || null;
    render();
    if (message) notify(message);
    return true;
  } catch (error) {
    failure(error.message);
    return false;
  } finally {
    busy = false;
    updateApproval();
  }
}
async function refresh() {
  try {
    state = await request("state");
    if (!current()) selectedId = state.payments[0]?.id || null;
    selectedGroup = null;
    $("acknowledge").checked = false;
    $("error").hidden = true;
    render();
  } catch (error) {
    failure("Could not reach the local app. " + error.message);
  }
}

function renderQueue() {
  const query = $("payment-search").value.toLowerCase();
  const filter = $("payment-filter").value;
  const visible = state.payments.filter((p) => {
    const matchesText = [
      p.id,
      p.customer,
      p.scope_customer,
      p.reference,
      p.amount,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesFilter =
      filter === "all" ||
      (filter === "attention"
        ? !["suggested", "reviewed"].includes(p.status)
        : p.status === filter);
    return matchesText && matchesFilter;
  });
  $("payment-list").replaceChildren();
  $("queue-count").textContent = String(visible.length);
  for (const payment of visible) {
    const button = node(
      "button",
      "payment-row" + (payment.id === selectedId ? " selected" : ""),
    );
    button.type = "button";
    button.setAttribute("aria-pressed", String(payment.id === selectedId));
    button.setAttribute(
      "aria-label",
      `${payment.id}, ${payment.currency} ${payment.amount}, ${labels[payment.status]}`,
    );
    const value = append(
      node("strong"),
      node("span", "small-currency", payment.currency),
      document.createTextNode(money(payment.cents)),
    );
    append(
      button,
      append(node("span", "row-top"), value, pill(payment.status)),
      node(
        "span",
        "row-customer",
        payment.scope_customer || payment.customer || "Customer not identified",
      ),
      node("span", "row-id", payment.id),
    );
    button.addEventListener("click", () => {
      if (selectedId === payment.id) return;
      selectedId = payment.id;
      selectedGroup = null;
      $("acknowledge").checked = false;
      $("notice").hidden = true;
      render();
      document
        .querySelector('.payment-row[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
    });
    $("payment-list").append(button);
  }
  if (!visible.length)
    $("payment-list").append(
      node("p", "empty", "No payments match this search. Try another filter."),
    );
}

function evidenceNames(group, text) {
  if (!text) return false;
  return group.every((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      "(^|[^A-Za-z0-9_-])" + escaped + "(?=$|[^A-Za-z0-9_-])",
    ).test(text);
  });
}

function renderPayment() {
  impactSequence += 1;
  $("decision-lab").hidden = true;
  const payment = current();
  $("payment-detail").replaceChildren();
  $("candidate-list").replaceChildren();
  $("evidence-card").replaceChildren();
  if (!payment) {
    $("candidate-explanation").textContent = "Add an invoice and a payment using the button above, or import CSVs.";
    $("candidate-count").textContent = "0 groups";
    $("evidence-card").hidden = true;
    $("payment-detail").append(
      node("p", "empty", "Your workspace is ready. Add your first invoice, then a payment."),
    );
    return;
  }
  append(
    $("payment-detail"),
    append(
      node("div", "detail-top"),
      node(
        "span",
        "detail-customer",
        payment.scope_customer || "Who made this payment?",
      ),
      pill(payment.status),
    ),
    append(
      node("div", "detail-amount"),
      node("small", "", payment.currency),
      document.createTextNode(money(payment.cents)),
    ),
    node(
      "p",
      "detail-meta",
      `${payment.id} · ${sourceLabel(payment)}`,
    ),
    node(
      "p",
      "reference",
      "Reference: " + (payment.reference || "No reference supplied"),
    ),
  );
  $("candidate-explanation").textContent = payment.message;
  $("candidate-count").textContent =
    payment.status === "reviewed"
      ? "Reviewed"
      : payment.complete
        ? `${payment.count} group${payment.count === 1 ? "" : "s"}`
        : "Review needed";
  const hasSample =
    state.demo && state.sample_remittance?.payment_id === payment.id;
  $("evidence-card").hidden = !hasSample && !payment.note;
  if (!$("evidence-card").hidden) {
    append(
      $("evidence-card"),
      node(
        "h3",
        "",
        payment.note
          ? "Supporting context saved"
          : "The amount isn’t the whole story.",
      ),
    );
    if (payment.note) $("evidence-card").append(node("p", "", payment.note));
    else
      $("evidence-card").append(
        node(
          "p",
          "",
          "A fictional remittance can tell us which invoice group the sender intended. Open it before making your decision.",
        ),
      );
    if (hasSample && payment.status !== "reviewed") {
      const b = node("button", "text-button", "Read sample remittance ↗");
      b.addEventListener("click", () => {
        $("remittance-text").textContent = state.sample_remittance.note;
        open("remittance-dialog");
      });
      $("evidence-card").append(b);
    }
  }
  const groups = payment.candidates;
  if (
    selectedGroup &&
    !groups.some((g) => equalGroup(g.invoice_ids, selectedGroup))
  )
    selectedGroup = null;
  if (payment.status === "reviewed") {
    const box = node("div", "empty large");
    append(
      box,
      node("strong", "", "Proposed allocation reviewed."),
      node("span", "", payment.decision.invoice_ids.join(" + ")),
      node(
        "p",
        "",
        "These invoices are reserved here. You can undo the review to release them.",
      ),
    );
    $("candidate-list").append(box);
    if (lastOutcome?.paymentId === payment.id) {
      const result = node("div", "review-result");
      result.append(node("h3", "", "What changed in this batch"));
      result.append(
        node(
          "p",
          "",
          `${payment.decision.invoice_ids.length} invoice(s) reserved here. No accounting entry was posted.`,
        ),
      );
      for (const changed of lastOutcome.changes) {
        const inspect = node(
          "button",
          "button small",
          `${changed.id}: ${labels[changed.status]} · ${changed.count} available group(s)`,
        );
        inspect.addEventListener("click", () => selectPayment(changed.id));
        result.append(inspect);
      }
      if (!lastOutcome.changes.length)
        result.append(
          node(
            "p",
            "",
            "No other payment's status or candidate count changed.",
          ),
        );
      $("candidate-list").append(result);
    }
  } else if (!groups.length) {
    const headings = {
      unmatched: "Keep this one unresolved.",
      needs_customer: "Start with a customer.",
      needs_review: "This scope needs a closer look.",
    };
    const box = node("div", "empty large");
    append(
      box,
      node("strong", "", headings[payment.status] || "No allocation to show."),
      node(
        "span",
        "",
        payment.status === "needs_customer"
          ? "Select a customer in Your review. An amount is not a payer identity."
          : payment.message,
      ),
    );
    $("candidate-list").append(box);
  }
  groups.forEach((group, index) => {
    const button = node(
      "button",
      "allocation" +
        (equalGroup(group.invoice_ids, selectedGroup) ? " selected" : ""),
    );
    button.type = "button";
    button.setAttribute(
      "aria-pressed",
      String(equalGroup(group.invoice_ids, selectedGroup)),
    );
    button.setAttribute(
      "aria-label",
      "Select allocation " + group.invoice_ids.join(" plus "),
    );
    append(
      button,
      append(
        node("span", "allocation-top"),
        node(
          "span",
          "",
          `OPTION ${index + 1} · ${group.invoice_ids.length} INVOICE${group.invoice_ids.length === 1 ? "" : "S"}`,
        ),
        node("span", "choice-dot"),
      ),
    );
    for (const id of group.invoice_ids) {
      const invoice = state.invoices.find((i) => i.id === id);
      const info = append(
        node("span"),
        node("strong", "", invoice.id),
        node(
          "small",
          "",
          `${sourceLabel(invoice)} · ${invoice.customer}`,
        ),
      );
      button.append(
        append(
          node("span", "allocation-row"),
          info,
          node(
            "span",
            "invoice-amount",
            `${invoice.currency} ${money(invoice.cents)}`,
          ),
        ),
      );
    }
    button.append(
      append(
        node("span", "allocation-total"),
        node("span", "", "Exact total"),
        node(
          "strong",
          "",
          `${payment.currency} ${money(group.cents)} · no difference`,
        ),
      ),
    );
    button.append(
      node(
        "span",
        "allocation-equation",
        group.invoice_ids
          .map((id) => money(state.invoices.find((i) => i.id === id).cents))
          .join(" + ") +
          " = " +
          money(payment.cents) +
          " " +
          payment.currency,
      ),
    );
    if (evidenceNames(group.invoice_ids, payment.note))
      button.append(
        node(
          "span",
          "evidence-hint",
          "Evidence note names these invoice IDs · review the original context",
        ),
      );
    button.addEventListener("click", () => {
      selectedGroup = [...group.invoice_ids];
      $("acknowledge").checked = false;
      renderPayment();
      renderInspector();
      document
        .querySelector('.allocation[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
    });
    $("candidate-list").append(button);
  });
  if (payment.count > groups.length)
    $("candidate-list").append(
      node(
        "p",
        "muted",
        `Showing ${groups.length} of ${payment.count} exact groups. Narrow the invoice source file for a more manageable review.`,
      ),
    );
  renderChoice(payment);
}

function selectPayment(id) {
  if (busy || !state?.payments.some((p) => p.id === id)) return;
  selectedId = id;
  selectedGroup = null;
  $("acknowledge").checked = false;
  $("payment-filter").value = "all";
  $("payment-search").value = "";
  render();
  $("payment-detail").scrollIntoView({ block: "center", behavior: "smooth" });
}

function renderChoice(payment) {
  if (!selectedGroup || payment.status === "reviewed") return;
  $("decision-lab").hidden = false;
  const invoices = selectedGroup.map((id) =>
    state.invoices.find((i) => i.id === id),
  );
  const flow = $("allocation-flow");
  flow.replaceChildren();
  append(
    flow,
    append(
      node("div", "flow-payment"),
      node("small", "", "INCOMING PAYMENT"),
      node("strong", "", `${payment.currency} ${money(payment.cents)}`),
      node("span", "", payment.id),
    ),
    node("span", "flow-arrow", "→"),
    append(
      node("div", "flow-invoices"),
      ...invoices.map((i) =>
        append(
          node("div", "flow-invoice"),
          node("strong", "", i.id),
          node("span", "", `${i.currency} ${money(i.cents)}`),
        ),
      ),
    ),
  );
  const checks = $("choice-checks");
  checks.replaceChildren();
  const named = selectedGroup.filter((id) => evidenceNames([id], payment.note));
  for (const [label, value] of [
    [
      "Exact total",
      `${invoices.map((i) => money(i.cents)).join(" + ")} = ${money(payment.cents)} ${payment.currency}`,
    ],
    ["Customer scope", payment.scope_customer + " · reviewer-selected scope"],
    ["Currency", payment.currency + " throughout · no conversion"],
    [
      "Saved evidence",
      !payment.note
        ? "No saved note. Check the sender's information before deciding."
        : `${named.length} of ${selectedGroup.length} selected invoice IDs appear in the note. References are context, not verification.`,
    ],
    [
      "Source records",
      invoices
        .map((i) => `${i.id}: ${sourceLabel(i)}`)
        .join("; "),
    ],
  ])
    append(checks, node("dt", "", label), node("dd", "", value));
  const target = $("impact-preview");
  target.replaceChildren(
    node("p", "", "Checking what this choice would change…"),
  );
  const sequence = ++impactSequence;
  const version = state.version;
  const group = [...selectedGroup];
  request("impact", { version, payment_id: payment.id, invoice_ids: group })
    .then((result) => {
      if (
        sequence !== impactSequence ||
        state.version !== version ||
        selectedId !== payment.id ||
        !equalGroup(selectedGroup, group)
      )
        return;
      target.replaceChildren(node("h3", "", "If you confirm this choice"));
      target.append(
        node(
          "p",
          "",
          `${result.reserved_count} invoice(s) would become unavailable to other payments in this workspace.`,
        ),
      );
      for (const change of result.changes)
        target.append(
          node(
            "p",
            "impact-change",
            `${change.payment_id} · ${change.currency} ${change.amount}: ${change.before_count} → ${change.after_count} available group(s). ${labels[change.before_status]} → ${labels[change.after_status]}.`,
          ),
        );
      if (!result.changes.length)
        target.append(
          node(
            "p",
            "",
            "No other payment's status or candidate count would change.",
          ),
        );
      target.append(
        node(
          "small",
          "",
          "Computed using the same rules as confirmation. Nothing has been reserved yet.",
        ),
      );
    })
    .catch((error) => {
      if (sequence === impactSequence) {
        target.replaceChildren(
          node("p", "", "Preview unavailable: " + error.message),
        );
        const retry = node(
          "button",
          "text-button",
          "Refresh workspace and compare again",
        );
        retry.addEventListener("click", refresh);
        target.append(retry);
      }
    });
}

function guideStep() {
  const example = state?.payments.find(
    (p) => p.id === state.sample_remittance?.payment_id,
  );
  if (example?.status === "reviewed") return 4;
  if (!guideCompared) return 0;
  if (!example?.note) return 1;
  return selectedId === example.id && selectedGroup ? 3 : 2;
}

function renderGuide() {
  $("walkthrough").hidden = !guideActive || !state?.demo;
  if ($("walkthrough").hidden) return;
  const step = guideStep();
  const steps = [
    "Compare",
    "Read evidence",
    "Choose",
    "Confirm",
    "See the effect",
  ];
  $("guide-steps").replaceChildren(
    ...steps.map((title, i) => {
      const item = node(
        "li",
        i < step ? "done" : i === step ? "current" : "",
        `${i + 1}. ${title}`,
      );
      if (i === step) item.setAttribute("aria-current", "step");
      return item;
    }),
  );
  const content = [
    [
      "The same $200 fits two different explanations.",
      "An invoice is a request for payment. This customer's $200 could cover INV-003 alone, or INV-001 + INV-002. Both totals fit; neither tells us the sender's intent.",
      "Compare the choices",
    ],
    [
      "Find out what the sender intended.",
      "A remittance is the sender's explanation of a payment. Open the fictional note, read its invoice references, then save it as evidence. This does not select an answer.",
      "Read sample remittance",
    ],
    [
      "You choose the explanation supported by the note.",
      "Compare the saved invoice references with both cards. Select a card to inspect its calculation, source records and effect on other payments. The app keeps both alternatives visible.",
      "Show invoice choices",
    ],
    [
      "Check the consequences before confirming.",
      "Read “Understand this choice” below the cards. Then check the review acknowledgment and confirm in Your review. An exact amount does not prove that a payment belongs to these invoices.",
      "Go to my review",
    ],
    [
      "Your decision changes which invoices remain available.",
      "The selected invoices are reserved locally. Inspect PAY-005 to see its current possibilities, then return to PAY-001 to undo if needed. No real invoice was marked paid.",
      "Inspect the $75 payment",
    ],
  ][step];
  $("walkthrough-title").textContent = content[0];
  $("guide-description").textContent = content[1];
  $("guide-action").textContent = content[2];
}

function renderInspector() {
  const payment = current();
  if (!payment) {
    $("scope-customer").replaceChildren(new Option("Add a payment to begin", ""));
    $("scope-customer").disabled = true;
    $("evidence-note").value = "";
    $("evidence-note").disabled = true;
    $("save-note").disabled = true;
    $("selection-summary").textContent = "Add your invoices and a payment to compare them.";
    $("acknowledge").checked = false;
    $("acknowledge").disabled = true;
    $("approve-button").hidden = false;
    $("approve-button").disabled = true;
    $("undo-button").hidden = true;
    return;
  }
  $("scope-customer").replaceChildren(new Option("Choose a customer…", ""));
  for (const customer of state.customers)
    $("scope-customer").add(new Option(customer, customer));
  $("scope-customer").value = payment.scope_customer;
  $("scope-customer").disabled = payment.status === "reviewed";
  $("evidence-note").value = noteDrafts.get(payment.id) ?? payment.note;
  $("evidence-note").disabled = payment.status === "reviewed";
  $("save-note").disabled = payment.status === "reviewed";
  const summary = $("selection-summary");
  summary.replaceChildren();
  if (payment.status === "reviewed")
    append(
      summary,
      node("strong", "", "Reviewed in this workspace"),
      node("span", "", payment.decision.invoice_ids.join(" + ")),
    );
  else if (selectedGroup)
    append(
      summary,
      node("strong", "", selectedGroup.join(" + ")),
      node(
        "span",
        "",
        `${payment.currency} ${money(payment.cents)} · exact amount`,
      ),
    );
  else
    summary.append(
      node("span", "", "Choose an invoice group from the possibilities."),
    );
  $("acknowledge").disabled = payment.status === "reviewed" || !selectedGroup;
  $("approve-button").hidden = payment.status === "reviewed";
  $("undo-button").hidden = payment.status !== "reviewed";
  updateApproval();
}
function updateApproval() {
  $("approve-button").disabled =
    busy ||
    !selectedGroup ||
    !$("acknowledge").checked ||
    current()?.status === "reviewed" ||
    $("evidence-note").value !== (current()?.note ?? "");
  renderGuide();
}
function render() {
  if (!state) return;
  $("demo-strip").hidden = !state.demo;
  const manualCount = state.invoices.concat(state.payments).filter((r) => r.origin === "manual").length;
  $("demo-strip").querySelector(".sample-tag").textContent = manualCount ? "EXAMPLE + YOUR ENTRIES" : "SAMPLE WORKSPACE";
  $("rail-count").textContent = String(state.payments.length);
  $("stat-payments").textContent = String(state.payments.length);
  $("stat-reviewed").textContent = String(
    state.payments.filter((p) => p.status === "reviewed").length,
  );
  $("stat-attention").textContent = String(
    state.payments.filter((p) => !["suggested", "reviewed"].includes(p.status))
      .length,
  );
  $("stat-invoices").textContent = String(
    state.invoices.filter((i) => !i.reserved).length,
  );
  renderQueue();
  renderPayment();
  renderInspector();
  $("limitations-list").replaceChildren(
    ...state.limitations.map((l) => node("p", "", l)),
  );
}

function table(headers, rows) {
  const result = node("table");
  const head = node("thead");
  head.append(append(node("tr"), ...headers.map((h) => node("th", "", h))));
  result.append(head);
  const body = node("tbody");
  for (const values of rows)
    body.append(
      append(node("tr"), ...values.map((v) => node("td", "", String(v ?? "")))),
    );
  result.append(body);
  return result;
}
function sources(role) {
  if (!state) return;
  const rows = state[role];
  const headers =
    role === "invoices"
      ? [
          "Source",
          "Invoice ID",
          "Customer",
          "Currency",
          "Amount",
          "Review reservation",
        ]
      : [
          "Source",
          "Payment ID",
          "Customer supplied",
          "Currency",
          "Amount",
          "Reference",
        ];
  const values = rows.map((r) =>
    role === "invoices"
      ? [
          sourceLabel(r),
          r.id,
          r.customer,
          r.currency,
          r.amount,
          r.reserved ? "Reserved by reviewed proposal" : "Available",
        ]
      : [sourceLabel(r), r.id, r.customer, r.currency, r.amount, r.reference],
  );
  $("source-table").replaceChildren(table(headers, values));
  $("source-hash").textContent =
    `${rows.length} ${role} records · ${rows.filter((r) => r.origin === "manual").length} manual entries. ` +
    (state.sources[role].sha256 ? `Original CSV SHA256 ${state.sources[role].sha256}. Hash covers the imported file only; manual additions are recorded in the decision trail.` : "No CSV imported. Manual entries are recorded in the decision trail.");
  $("source-title").textContent =
    role === "invoices" ? "Outstanding invoices" : "Incoming payments";
  open("source-dialog");
}
function history() {
  const names = {
    dataset_loaded: "Workspace loaded",
    customer_scope_selected: "Customer scope selected",
    evidence_noted: "Evidence note saved",
    allocation_reviewed: "Proposed allocation reviewed",
    review_undone: "Review undone",
    manual_record_added: "Manual record added",
  };
  $("history-list").replaceChildren();
  for (const event of [...state.history].reverse()) {
    const item = node("article", "history-item");
    append(
      item,
      node(
        "strong",
        "",
        `${names[event.action] || event.action}${event.payment_id ? " · " + event.payment_id : ""}`,
      ),
      node(
        "p",
        "",
        event.invoice_ids?.join(" + ") ||
          event.previous_invoice_ids?.join(" + ") ||
          event.customer ||
          event.note ||
          (event.record ? `${event.record.id} · ${event.record.customer || "Customer not supplied"} · ${event.record.currency} ${event.record.amount}` : "") ||
          "Dataset loaded into session memory.",
      ),
      node(
        "small",
        "",
        `Revision ${event.sequence} · ${new Date(event.at).toLocaleString()}`,
      ),
    );
    $("history-list").append(item);
  }
  if (!state.history.length)
    $("history-list").append(
      node(
        "p",
        "empty",
        "No decisions yet. Review a payment to start its trail.",
      ),
    );
  open("history-dialog");
}

async function readImport(role) {
  const revision = (importReads.get(role) || 0) + 1;
  importReads.set(role, revision);
  pendingImports.add(role);
  importRevision += 1;
  $("preview-button").disabled = true;
  preview = null;
  $("mapping-area").hidden = true;
  $("import-confirm-area").hidden = true;
  $("replace-confirm").checked = false;
  $("import-error").hidden = true;
  delete importing[role];
  const file = $(role + "-file").files[0];
  try {
    if (file) {
      if (file.size > 256000)
        throw new Error("Each CSV must be no larger than 256 KB.");
      const data = await file.arrayBuffer();
      if (importReads.get(role) !== revision) return;
      importing[role] = new TextDecoder("utf-8", { fatal: true }).decode(data);
    }
  } catch (error) {
    if (importReads.get(role) === revision) {
      $("import-error").textContent = error.message;
      $("import-error").hidden = false;
    }
  } finally {
    if (importReads.get(role) === revision) pendingImports.delete(role);
  }
  $("preview-button").disabled =
    pendingImports.size > 0 || !(importing.invoices && importing.payments);
}
function mappingSelect(role, field, headers) {
  const label = node(
    "label",
    "",
    field === "id"
      ? role === "invoices"
        ? "Invoice ID"
        : "Payment ID"
      : field.charAt(0).toUpperCase() + field.slice(1),
  );
  const select = node("select");
  select.id = `map-${role}-${field}`;
  const optional =
    role === "payments" && ["customer", "reference"].includes(field);
  select.add(
    new Option(optional ? "Not supplied (optional)" : "Choose column…", ""),
  );
  for (const header of headers) select.add(new Option(header, header));
  const aliases = {
    id: [role === "invoices" ? "invoice_id" : "payment_id", "id"],
    customer: ["customer", "client"],
    currency: ["currency"],
    amount: ["amount", "balance"],
    reference: ["reference", "description"],
  };
  const suggested = headers.find((h) =>
    aliases[field].includes(h.toLowerCase()),
  );
  if (suggested) select.value = suggested;
  label.append(select);
  return label;
}
async function previewImport() {
  const revision = importRevision;
  $("preview-button").disabled = true;
  $("import-error").hidden = true;
  try {
    const result = await request("preview", importing);
    if (revision !== importRevision) return;
    preview = result;
    $("mapping-area").replaceChildren();
    for (const role of ["invoices", "payments"]) {
      const group = node("section", "mapping-group");
      group.append(
        node(
          "h3",
          "",
          `${role === "invoices" ? "01 · Invoices" : "02 · Payments"} · ${preview[role].records} records`,
        ),
      );
      const fields = node("div", "mapping-fields");
      for (const field of role === "invoices"
        ? ["id", "customer", "currency", "amount"]
        : ["id", "currency", "amount", "customer", "reference"])
        fields.append(mappingSelect(role, field, preview[role].headers));
      const scroll = node("div", "table-scroll");
      scroll.append(table(preview[role].headers, preview[role].rows));
      append(group, fields, scroll);
      $("mapping-area").append(group);
    }
    $("mapping-area").hidden = false;
    $("import-confirm-area").hidden = false;
    $("replace-confirm").checked = false;
    $("commit-import").disabled = true;
  } catch (error) {
    $("import-error").textContent = error.message;
    $("import-error").hidden = false;
  } finally {
    $("preview-button").disabled =
      pendingImports.size > 0 || !(importing.invoices && importing.payments);
  }
}
async function commitImport() {
  if (!preview || !$("replace-confirm").checked) return;
  const mappings = { invoices: {}, payments: {} };
  for (const role of ["invoices", "payments"])
    for (const field of role === "invoices"
      ? ["id", "customer", "currency", "amount"]
      : ["id", "currency", "amount", "customer", "reference"])
      mappings[role][field] = $(`map-${role}-${field}`).value || null;
  $("commit-import").disabled = true;
  const success = await mutation(
    "import",
    { ...importing, mappings },
    "Your files are ready. Select a payment and review the possibilities.",
  );
  if (success) {
    selectedId = state.payments[0]?.id;
    selectedGroup = null;
    render();
    close("import-dialog");
  } else {
    $("import-error").textContent = $("error-text").textContent;
    $("import-error").hidden = false;
    $("commit-import").disabled = false;
  }
}

for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => close(button.dataset.close));
$("payment-search").addEventListener("input", () => state && renderQueue());
$("payment-filter").addEventListener("change", () => state && renderQueue());
$("acknowledge").addEventListener("change", updateApproval);
$("evidence-note").addEventListener("input", () => {
  if (selectedId) noteDrafts.set(selectedId, $("evidence-note").value);
  $("acknowledge").checked = false;
  updateApproval();
});
$("nav-review").addEventListener("click", () => {
  $("payment-filter").value = "all";
  $("payment-search").value = "";
  if (state) renderQueue();
  $("workspace").scrollIntoView();
});
$("nav-sources").addEventListener("click", () => sources("invoices"));
$("source-invoices").addEventListener("click", () => sources("invoices"));
$("source-payments").addEventListener("click", () => sources("payments"));
$("nav-history").addEventListener("click", () => state && history());
for (const id of ["about-button", "limits-button"])
  $(id).addEventListener("click", () => open("about-dialog"));
$("retry-button").addEventListener("click", refresh);
$("start-demo").addEventListener("click", () => {
  if (!state?.demo) return;
  guideActive = true;
  guideCompared = false;
  selectPayment(state.sample_remittance.payment_id);
  $("walkthrough").scrollIntoView({ block: "center" });
});
$("exit-guide").addEventListener("click", () => {
  guideActive = false;
  renderGuide();
});
$("guide-action").addEventListener("click", () => {
  const step = guideStep();
  if (step === 0) {
    guideCompared = true;
    renderGuide();
    $("candidate-list").scrollIntoView({ block: "center" });
  }
  if (step === 1) {
    $("remittance-text").textContent = state.sample_remittance.note;
    open("remittance-dialog");
  }
  if (step === 2) selectPayment(state.sample_remittance.payment_id);
  if (step === 3) {
    $("inspector-heading").scrollIntoView({ block: "center" });
    $("acknowledge").focus();
  }
  if (step === 4) selectPayment("PAY-005");
});
$("scope-customer").addEventListener("change", async () => {
  if (!$("scope-customer").value) return;
  selectedGroup = null;
  await mutation(
    "scope",
    { payment_id: selectedId, customer: $("scope-customer").value },
    "Customer scope updated. Review the alternatives.",
  );
});
$("save-note").addEventListener("click", () =>
  mutation(
    "evidence",
    { payment_id: selectedId, note: $("evidence-note").value },
    "Evidence saved. Choose an allocation, then confirm your review.",
  ),
);
$("approve-button").addEventListener("click", async () => {
  if (!selectedGroup || !$("acknowledge").checked) return;
  const group = [...selectedGroup];
  if (
    await mutation(
      "approve",
      { payment_id: selectedId, invoice_ids: group, acknowledged: true },
      "Proposed allocation reviewed. These invoices are reserved here; nothing was posted externally.",
    )
  ) {
    selectedGroup = null;
    render();
  }
});
$("undo-button").addEventListener("click", async () => {
  selectedGroup = null;
  await mutation(
    "undo",
    { payment_id: selectedId },
    "Review undone. Its invoices are available again.",
  );
});
$("apply-remittance").addEventListener("click", async () => {
  if (
    await mutation(
      "evidence",
      {
        payment_id: state.sample_remittance.payment_id,
        note: state.sample_remittance.note,
      },
      "Fictional remittance saved. Select the invoice group it names.",
    )
  )
    close("remittance-dialog");
});
$("restart-button").addEventListener("click", () => open("reset-dialog"));
$("confirm-reset").addEventListener("click", async () => {
  if (await mutation("demo", {}, "Fresh fictional workspace loaded.")) {
    selectedId = state.payments[0].id;
    selectedGroup = null;
    $("payment-filter").value = "all";
    $("payment-search").value = "";
    render();
    close("reset-dialog");
  }
});
$("import-button").addEventListener("click", () => open("import-dialog"));
for (const role of ["invoices", "payments"])
  $(role + "-file").addEventListener("change", () => readImport(role));
$("preview-button").addEventListener("click", previewImport);
$("replace-confirm").addEventListener("change", () => {
  $("commit-import").disabled = !$("replace-confirm").checked;
});
$("commit-import").addEventListener("click", commitImport);

function configureAddForm() {
  const payment = $("add-role").value === "payments";
  $("add-customer").required = !payment;
  $("add-customer-optional").hidden = !payment;
  $("add-reference-field").hidden = !payment;
  $("add-id").placeholder = payment ? "e.g. PAY-101" : "e.g. INV-101";
  $("save-record").textContent = payment ? "Add payment" : "Add invoice";
  $("add-title").textContent = payment ? "Add an incoming payment" : "Add an outstanding invoice";
  $("add-error").hidden = true;
}
$("add-role").addEventListener("change", configureAddForm);
$("add-button").addEventListener("click", () => {
  if (!state || busy) return;
  $("add-form").reset();
  $("customer-suggestions").replaceChildren(...state.customers.map((name) => new Option(name, name)));
  $("add-sample-note").hidden = !state.demo;
  configureAddForm();
  open("add-dialog");
});
$("add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !$("add-form").reportValidity()) return;
  const role = $("add-role").value;
  const record = {
    id: $("add-id").value,
    customer: $("add-customer").value,
    currency: $("add-currency").value,
    amount: $("add-amount").value,
    reference: role === "payments" ? $("add-reference").value : "",
  };
  // Preserve drafts while the request runs and prevent a second submission.
  const controls = [...$("add-form").querySelectorAll("input, select, button")];
  controls.forEach((control) => { control.disabled = true; });
  const added = await mutation("add", { role, record }, `${role === "payments" ? "Payment" : "Invoice"} added. Existing reviews were kept.`);
  controls.forEach((control) => { control.disabled = false; });
  if (added) {
    $("payment-search").value = "";
    $("payment-filter").value = "all";
    if (role === "payments") selectedId = record.id;
    render();
    close("add-dialog");
    if (role === "payments") $("payment-detail").scrollIntoView({ block: "center" });
  } else {
    $("add-error").textContent = $("error-text").textContent;
    $("add-error").hidden = false;
  }
});
$("empty-button").addEventListener("click", () => open("empty-dialog"));
$("confirm-empty").addEventListener("click", async () => {
  if (await mutation("empty", { acknowledged: true }, "Empty workspace ready. Add an invoice, then a payment.")) {
    $("payment-search").value = "";
    $("payment-filter").value = "all";
    render();
    close("empty-dialog");
    $("add-button").focus();
  }
});

refresh();

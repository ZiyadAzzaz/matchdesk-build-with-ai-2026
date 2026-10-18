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
    if (response.status === 409) {
      state = await request("state");
      selectedGroup = null;
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
    state = await request(action, { version: state.version, ...body });
    if (["import", "demo"].includes(action)) {
      noteDrafts.clear();
      selectedGroup = null;
      selectedId = state.payments[0]?.id || null;
    }
    if (action === "evidence") noteDrafts.delete(body.payment_id);
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
  const payment = current();
  $("payment-detail").replaceChildren();
  $("candidate-list").replaceChildren();
  $("evidence-card").replaceChildren();
  if (!payment) {
    $("payment-detail").append(
      node("p", "empty", "Choose a payment to begin."),
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
      `${payment.id} · Original CSV record ${payment.source_row}`,
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
          `CSV record ${invoice.source_row} · ${invoice.customer}`,
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
}

function renderInspector() {
  const payment = current();
  if (!payment) return;
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
}
function render() {
  if (!state) return;
  $("demo-strip").hidden = !state.demo;
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
          "CSV record",
          "Invoice ID",
          "Customer",
          "Currency",
          "Amount",
          "Review reservation",
        ]
      : [
          "CSV record",
          "Payment ID",
          "Customer in file",
          "Currency",
          "Amount",
          "Reference",
        ];
  const values = rows.map((r) =>
    role === "invoices"
      ? [
          r.source_row,
          r.id,
          r.customer,
          r.currency,
          r.amount,
          r.reserved ? "Reserved by reviewed proposal" : "Available",
        ]
      : [r.source_row, r.id, r.customer, r.currency, r.amount, r.reference],
  );
  $("source-table").replaceChildren(table(headers, values));
  $("source-hash").textContent =
    `${rows.length} ${role} records · SHA256 ${state.sources[role].sha256}. CSV record numbers include the header; they are not PDF page or physical line numbers.`;
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
  selectedId = state.payments[0].id;
  selectedGroup = null;
  $("payment-search").value = "";
  $("payment-filter").value = "all";
  render();
  $("payment-detail").scrollIntoView({ block: "center" });
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

refresh();

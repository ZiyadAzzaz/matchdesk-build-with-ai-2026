"""In-memory proposed allocations with revision checks, reservations and provenance."""

import csv
import io
import json
from copy import deepcopy
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path

from matchdesk.engine import (
    FIELDS,
    MAX_ROWS,
    Dataset,
    amount,
    find_candidates,
    import_dataset,
    parse_rows,
    read_table,
)

DATA = Path(__file__).parent / "data"
DEMO_MAPS = {
    "invoices": {
        "id": "invoice_id",
        "customer": "customer",
        "currency": "currency",
        "amount": "amount",
    },
    "payments": {
        "id": "payment_id",
        "customer": "customer",
        "currency": "currency",
        "amount": "amount",
        "reference": "reference",
    },
}
LIMITATIONS = [
    "Reviewed means a person confirmed a proposed allocation in this workspace. No bank or accounting system is updated.",
    "Exact positive two-decimal amounts only. No fees, partials, credits, refunds or FX allocation.",
    "Customer scope and remittance are reviewer-supplied evidence, not independently authenticated.",
    "At most 16 eligible invoices per payment; up to 30 displayed alternatives. No unproved uniqueness claims.",
    "Session data lives in server memory and expires; downloads intentionally persist.",
]


class Conflict(ValueError):
    pass


def demo_dataset():
    return import_dataset(
        (DATA / "invoices.csv").read_text(encoding="utf-8"),
        (DATA / "payments.csv").read_text(encoding="utf-8"),
        DEMO_MAPS,
        demo=True,
    )


@dataclass
class Review:
    dataset: Dataset = field(default_factory=demo_dataset)
    version: int = 0
    decisions: dict = field(default_factory=dict)
    scopes: dict = field(default_factory=dict)
    notes: dict = field(default_factory=dict)
    history: list = field(default_factory=list)

    def check_version(self, value):
        if type(value) is not int or value != self.version:
            raise Conflict("This workspace changed. Refresh before applying this decision.")

    def payment(self, identity):
        if not isinstance(identity, str):
            raise ValueError("Choose a payment.")
        item = next((r for r in self.dataset.payments if r.id == identity), None)
        if item is None:
            raise ValueError("Payment was not found in this workspace.")
        return item

    def customer(self, payment):
        original = (
            payment.customer
            if payment.customer in {r.customer for r in self.dataset.invoices}
            else ""
        )
        return self.scopes.get(payment.id, original)

    def reserved(self):
        return {
            identity for decision in self.decisions.values() for identity in decision["invoice_ids"]
        }

    def record(self, action, payment_id="", **values):
        self.version += 1
        self.history.append(
            {
                "sequence": self.version,
                "at": datetime.now(UTC).isoformat(),
                "action": action,
                "payment_id": payment_id,
                **values,
            }
        )

    def state(self):
        reserved = self.reserved()
        invoices = [
            {**row.to_dict(), "reserved": row.id in reserved} for row in self.dataset.invoices
        ]
        payments = []
        for row in self.dataset.payments:
            decision = self.decisions.get(row.id)
            result = (
                {
                    "status": "reviewed",
                    "candidates": [],
                    "count": 0,
                    "complete": True,
                    "message": "Proposed allocation reviewed in this workspace only.",
                }
                if decision
                else find_candidates(self.dataset, row, self.customer(row), reserved)
            )
            payments.append(
                {
                    **row.to_dict(),
                    **result,
                    "scope_customer": self.customer(row),
                    "decision": decision,
                    "note": self.notes.get(row.id, ""),
                }
            )
        return {
            "version": self.version,
            "demo": self.dataset.demo,
            "engine": "exact-subsets-v1",
            "invoices": invoices,
            "payments": payments,
            "customers": sorted({r.customer for r in self.dataset.invoices}),
            "sources": self.dataset.sources,
            "history": self.history,
            "limitations": LIMITATIONS,
            "sample_remittance": json.loads((DATA / "remittance.json").read_text(encoding="utf-8"))
            if self.dataset.demo
            else None,
        }

    def set_scope(self, payment_id, customer):
        self.payment(payment_id)
        if payment_id in self.decisions:
            raise Conflict("Undo this payment's review before changing its customer scope.")
        if customer not in {r.customer for r in self.dataset.invoices}:
            raise ValueError("Choose a customer from the invoice file.")
        self.scopes[payment_id] = customer
        self.record("customer_scope_selected", payment_id, customer=customer)

    def add_record(self, role, values):
        """Append validated manual input without discarding reviews or CSV provenance."""
        if role not in FIELDS or not isinstance(values, dict):
            raise ValueError("Choose an invoice or a payment and complete its fields.")
        rows = getattr(self.dataset, role)
        if len(rows) >= MAX_ROWS[role]:
            raise ValueError(f"This workspace supports at most {MAX_ROWS[role]} {role}.")
        fields = FIELDS[role]
        if any(not isinstance(values.get(key, ""), str) for key in fields):
            raise ValueError("Enter text values in each field.")
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer)
        writer.writerow(fields)
        writer.writerow([values.get(key, "") for key in fields])
        table = read_table(buffer.getvalue(), role)
        row = parse_rows(table, role, {key: key for key in fields})[0]
        if any(existing.id == row.id for existing in rows):
            raise ValueError("That ID already exists. Choose a different ID.")
        row = replace(row, source_row=0, origin="manual")
        sources = deepcopy(self.dataset.sources)
        sources[role]["manual_records"] = sources[role].get("manual_records", 0) + 1
        self.dataset = replace(self.dataset, **{role: (*rows, row)}, sources=sources)
        self.record(
            "manual_record_added",
            row.id if role == "payments" else "",
            role=role,
            record=row.to_dict(),
        )

    def start_empty(self):
        sources = {
            role: {"sha256": None, "records": 0, "mapping": {}, "manual_records": 0}
            for role in FIELDS
        }
        self.replace(Dataset((), (), sources))

    def set_note(self, payment_id, note):
        self.payment(payment_id)
        if payment_id in self.decisions:
            raise Conflict("Undo this payment's review before changing its evidence.")
        if not isinstance(note, str) or len(note) > 2000:
            raise ValueError("Evidence note must be text of at most 2,000 characters.")
        self.notes[payment_id] = note
        self.record("evidence_noted", payment_id, note=note)

    def preview_impact(self, payment_id, invoice_ids):
        """Run the real allocation rules on a copy; never reserve or record a decision."""
        before = self.state()
        scenario = deepcopy(self)
        scenario.approve(payment_id, invoice_ids, True)
        after = scenario.state()
        changes = []
        for original, proposed in zip(before["payments"], after["payments"], strict=True):
            if original["id"] == payment_id:
                continue
            if (original["status"], original["count"]) != (proposed["status"], proposed["count"]):
                changes.append(
                    {
                        "payment_id": original["id"],
                        "currency": original["currency"],
                        "amount": original["amount"],
                        "before_status": original["status"],
                        "after_status": proposed["status"],
                        "before_count": original["count"],
                        "after_count": proposed["count"],
                    }
                )
        return {
            "version": self.version,
            "payment_id": payment_id,
            "invoice_ids": sorted(invoice_ids),
            "changes": changes,
            "reserved_count": len(invoice_ids),
            "preview_only": True,
        }

    def approve(self, payment_id, invoice_ids, acknowledged):
        payment = self.payment(payment_id)
        if payment_id in self.decisions:
            raise Conflict(
                "This payment is already reviewed. Undo it before making another decision."
            )
        if acknowledged is not True:
            raise ValueError("Confirm that you checked the payer and remittance evidence.")
        if (
            not isinstance(invoice_ids, list)
            or not invoice_ids
            or len(invoice_ids) > 16
            or any(not isinstance(i, str) for i in invoice_ids)
        ):
            raise ValueError("Choose a valid candidate allocation.")
        if len(set(invoice_ids)) != len(invoice_ids):
            raise ValueError("An invoice cannot appear twice in an allocation.")
        known = {row.id: row for row in self.dataset.invoices}
        if any(identity not in known for identity in invoice_ids):
            raise ValueError("An invoice is not present in this dataset.")
        if set(invoice_ids) & self.reserved():
            raise Conflict("One of these invoices is already allocated. Refresh the candidates.")
        rows = [known[identity] for identity in invoice_ids]
        customer = self.customer(payment)
        if not customer or any(
            row.customer != customer or row.currency != payment.currency for row in rows
        ):
            raise ValueError("Allocation must match the selected customer and payment currency.")
        result = find_candidates(self.dataset, payment, customer, self.reserved())
        if not result["complete"]:
            raise ValueError(
                "The search scope needs review; narrow the imported invoice file first."
            )
        if sum(row.cents for row in rows) != payment.cents:
            raise ValueError("The selected invoice amounts do not equal the payment exactly.")
        decision = {
            "invoice_ids": sorted(invoice_ids),
            "customer": customer,
            "currency": payment.currency,
            "cents": payment.cents,
            "note": self.notes.get(payment_id, ""),
            "acknowledged": True,
        }
        self.decisions[payment_id] = decision
        self.record("allocation_reviewed", payment_id, **decision)

    def undo(self, payment_id):
        self.payment(payment_id)
        if payment_id not in self.decisions:
            raise ValueError("This payment has no reviewed allocation to undo.")
        old = self.decisions.pop(payment_id)
        self.record("review_undone", payment_id, previous_invoice_ids=old["invoice_ids"])

    def replace(self, dataset):
        self.dataset = dataset
        self.decisions.clear()
        self.scopes.clear()
        self.notes.clear()
        self.history.clear()
        self.record("dataset_loaded", demo=dataset.demo, sources=dataset.sources)

    def export_json(self):
        return json.dumps(self.state(), ensure_ascii=False, indent=2) + "\n"

    def export_csv(self):
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerow(
            [
                "payment_id",
                "customer",
                "currency",
                "payment_amount",
                "invoice_ids",
                "review_status",
                "reviewer_evidence",
            ]
        )
        for payment in self.dataset.payments:
            decision = self.decisions.get(payment.id)
            values = [
                payment.id,
                self.customer(payment),
                payment.currency,
                amount(payment.cents),
                "; ".join(decision["invoice_ids"]) if decision else "",
                "reviewed_proposal" if decision else "unresolved",
                self.notes.get(payment.id, ""),
            ]
            writer.writerow(
                [
                    "'" + value
                    if value.lstrip().startswith(("=", "+", "-", "@"))
                    or value.startswith(("\t", "\r", "\n"))
                    else value
                    for value in values
                ]
            )
        return buffer.getvalue()

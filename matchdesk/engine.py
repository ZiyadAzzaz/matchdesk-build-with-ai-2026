"""Strict input boundaries and exhaustive, bounded exact-amount candidates."""

import csv
import hashlib
import io
import itertools
import re
from dataclasses import asdict, dataclass
from decimal import Decimal

MAX_FILE_BYTES = 256_000
MAX_ROWS = {"invoices": 200, "payments": 60}
CURRENCIES = {"USD", "EUR", "GBP", "EGP", "CAD", "AUD"}
FIELDS = {
    "invoices": ("id", "customer", "currency", "amount"),
    "payments": ("id", "currency", "amount", "customer", "reference"),
}


def money(value: str) -> int:
    if not isinstance(value, str) or not re.fullmatch(
        r"(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?", value
    ):
        raise ValueError(
            "Use an unsigned decimal amount, at most 9 whole digits and 2 decimal places; no separators or exponent."
        )
    result = int(Decimal(value) * 100)
    if result <= 0:
        raise ValueError("Only positive outstanding amounts and incoming payments are supported.")
    return result


def amount(cents: int) -> str:
    return f"{cents // 100}.{cents % 100:02d}"


@dataclass(frozen=True)
class Row:
    id: str
    customer: str
    currency: str
    cents: int
    reference: str
    source_row: int
    origin: str = "csv"

    def to_dict(self):
        return {**asdict(self), "amount": amount(self.cents)}


@dataclass(frozen=True)
class Table:
    headers: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]
    sha256: str


@dataclass(frozen=True)
class Dataset:
    invoices: tuple[Row, ...]
    payments: tuple[Row, ...]
    sources: dict
    demo: bool = False


def read_table(text: str, role: str) -> Table:
    if role not in MAX_ROWS:
        raise ValueError("Choose invoices or payments.")
    if not isinstance(text, str) or not text.strip() or len(text.encode("utf-8")) > MAX_FILE_BYTES:
        raise ValueError("Each CSV must be non-empty UTF-8 text no larger than 256 KB.")
    if "\x00" in text:
        raise ValueError("NUL bytes are not supported. Export a UTF-8 CSV.")
    try:
        reader = csv.reader(io.StringIO(text.lstrip("\ufeff"), newline=""), strict=True)
        records = list(reader)
    except csv.Error as exc:
        raise ValueError(
            "CSV syntax could not be read. Check quoting and use a comma separator."
        ) from exc
    if len(records) < 2 or not 1 <= len(records[0]) <= 30:
        raise ValueError("Include a header and at least one data record, with at most 30 columns.")
    headers = records[0]
    if any(not h.strip() or len(h) > 100 for h in headers) or len(set(headers)) != len(headers):
        raise ValueError("CSV headers must be non-empty, unique and at most 100 characters.")
    rows = records[1:]
    if len(rows) > MAX_ROWS[role]:
        raise ValueError(f"This prototype supports at most {MAX_ROWS[role]} {role} records.")
    for number, row in enumerate(rows, start=2):
        if len(row) != len(headers):
            raise ValueError(
                f"CSV record {number} has {len(row)} fields; expected {len(headers)}. No rows were imported."
            )
        if any(len(value) > 2000 for value in row):
            raise ValueError(f"CSV record {number} has a field longer than 2,000 characters.")
    return Table(
        tuple(headers),
        tuple(tuple(r) for r in rows),
        hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )


def parse_rows(table: Table, role: str, mapping: dict) -> tuple[Row, ...]:
    if not isinstance(mapping, dict):
        raise ValueError("Confirm the column mapping first.")
    required = {"id", "currency", "amount"} | ({"customer"} if role == "invoices" else set())
    indices = {}
    for field in FIELDS[role]:
        header = mapping.get(field)
        if header is None or header == "":
            if field in required:
                raise ValueError(f"Map the {field} column for {role}.")
            continue
        if not isinstance(header, str) or header not in table.headers:
            raise ValueError(f"Unknown mapped column for {field} in {role}.")
        indices[field] = table.headers.index(header)
    if len(set(indices.values())) != len(indices):
        raise ValueError("Use a different source column for each field.")
    rows = []
    ids = set()
    for number, values in enumerate(table.rows, start=2):
        fields = {name: values[index] for name, index in indices.items()}
        for name in required:
            value = fields[name]
            if not value or value != value.strip() or len(value) > 150:
                raise ValueError(
                    f"{role.title()} record {number}: {name} is empty, too long or has surrounding whitespace."
                )
        if fields["id"] in ids:
            raise ValueError(f"{role.title()} record {number}: duplicate ID {fields['id']!r}.")
        ids.add(fields["id"])
        if fields["currency"] not in CURRENCIES:
            raise ValueError(
                f"{role.title()} record {number}: supported currencies are {', '.join(sorted(CURRENCIES))}; no FX conversion is performed."
            )
        try:
            cents = money(fields["amount"])
        except ValueError as exc:
            raise ValueError(f"{role.title()} record {number}: {exc}") from exc
        rows.append(
            Row(
                fields["id"],
                fields.get("customer", ""),
                fields["currency"],
                cents,
                fields.get("reference", ""),
                number,
            )
        )
    return tuple(rows)


def import_dataset(invoice_csv: str, payment_csv: str, mappings: dict, *, demo=False) -> Dataset:
    tables = {
        "invoices": read_table(invoice_csv, "invoices"),
        "payments": read_table(payment_csv, "payments"),
    }
    invoice_rows = parse_rows(tables["invoices"], "invoices", mappings.get("invoices", {}))
    payment_rows = parse_rows(tables["payments"], "payments", mappings.get("payments", {}))
    sources = {
        role: {"sha256": table.sha256, "records": len(table.rows), "mapping": mappings[role]}
        for role, table in tables.items()
    }
    return Dataset(invoice_rows, payment_rows, sources, demo)


def find_candidates(dataset: Dataset, payment: Row, customer: str, reserved: set[str]) -> dict:
    if not customer:
        return {
            "status": "needs_customer",
            "candidates": [],
            "count": 0,
            "complete": False,
            "message": "Choose which customer's invoices to review. We never infer the payer from an amount.",
        }
    eligible = [
        row
        for row in dataset.invoices
        if row.customer == customer and row.currency == payment.currency and row.id not in reserved
    ]
    if len(eligible) > 16:
        return {
            "status": "needs_review",
            "candidates": [],
            "count": 0,
            "complete": False,
            "message": "More than 16 available invoices in this customer/currency scope. Narrow the source file; uniqueness was not established.",
        }
    groups = []
    count = 0
    for length in range(1, len(eligible) + 1):
        for combination in itertools.combinations(eligible, length):
            if sum(row.cents for row in combination) == payment.cents:
                count += 1
                if len(groups) < 30:
                    groups.append(
                        {"invoice_ids": [row.id for row in combination], "cents": payment.cents}
                    )
    status = "unmatched" if count == 0 else ("suggested" if count == 1 else "ambiguous")
    messages = {
        "unmatched": "No exact allocation found. Fees, partial payments and currency conversion are not inferred.",
        "suggested": "One exact arithmetic candidate. Confirm payer and remittance before reviewing it.",
        "ambiguous": "Several invoice groups equal this payment. An amount alone cannot tell us which is right.",
    }
    return {
        "status": status,
        "candidates": groups,
        "count": count,
        "complete": True,
        "message": messages[status],
        "display_limit": 30,
    }

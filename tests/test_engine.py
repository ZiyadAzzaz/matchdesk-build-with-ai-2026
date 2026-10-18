import pytest

from matchdesk.engine import Dataset, Row, find_candidates, import_dataset, money, read_table
from matchdesk.review import DEMO_MAPS, Conflict, Review, demo_dataset


def test_actual_csv_has_real_ambiguity_and_unique_pair():
    dataset = demo_dataset()
    first, second = dataset.payments[:2]
    result = find_candidates(dataset, first, first.customer, set())
    assert result["status"] == "ambiguous" and result["count"] == 2
    assert {tuple(c["invoice_ids"]) for c in result["candidates"]} == {
        ("INV-003",),
        ("INV-001", "INV-002"),
    }
    assert find_candidates(dataset, second, second.customer, set())["status"] == "suggested"
    assert (
        find_candidates(dataset, dataset.payments[2], "Harbor Works", set())["status"]
        == "unmatched"
    )


@pytest.mark.parametrize("value", ["0", "-1", "NaN", "Infinity", "1.001", "1,000", " 1", "1e2"])
def test_money_rejects_unsupported_inputs(value):
    with pytest.raises(ValueError):
        money(value)


def test_exact_money_scope_and_limits():
    rows = (
        Row("a", "A", "USD", 10, "", 2),
        Row("b", "A", "USD", 20, "", 3),
        Row("c", "B", "USD", 30, "", 4),
        Row("d", "A", "EUR", 30, "", 5),
    )
    pay = Row("p", "", "USD", 30, "", 2)
    data = Dataset(rows, (pay,), {})
    assert money("0.10") + money("0.20") == money("0.30")
    assert find_candidates(data, pay, "A", set())["candidates"][0]["invoice_ids"] == ["a", "b"]
    assert find_candidates(data, pay, "", set())["status"] == "needs_customer"
    big = Dataset(tuple(Row(str(i), "A", "USD", 1, "", i) for i in range(17)), (pay,), {})
    assert not find_candidates(big, pay, "A", set())["complete"]


def test_display_cap_does_not_turn_many_solutions_into_unique_match():
    invoices = tuple(Row(str(i), "A", "USD", 100, "", i + 2) for i in range(16))
    payment = Row("p", "A", "USD", 800, "", 2)
    result = find_candidates(Dataset(invoices, (payment,), {}), payment, "A", set())
    assert result["complete"] and result["status"] == "ambiguous"
    assert result["count"] == 12870 and len(result["candidates"]) == 30


@pytest.mark.parametrize(
    "text", ["", "id,id\na,b\n", "id,value\na,b,c\n", 'id,value\na,"broken', "id,value\na,\x00\n"]
)
def test_bad_csv_not_silently_partially_imported(text):
    with pytest.raises(ValueError):
        read_table(text, "invoices")


def test_quoted_csv_bom_and_mapping():
    invoice = '\ufeffCustomer,Code,Money,Unit\n"A, Studio",0001,0.30,USD\n'
    payment = "id,currency,amount\np,USD,0.30\n"
    maps = {
        "invoices": {"id": "Code", "customer": "Customer", "amount": "Money", "currency": "Unit"},
        "payments": {"id": "id", "amount": "amount", "currency": "currency"},
    }
    data = import_dataset(invoice, payment, maps)
    assert data.invoices[0].id == "0001" and data.invoices[0].customer == "A, Studio"
    assert data.sources["invoices"]["records"] == 1


def test_duplicate_id_and_overprecision_rejected():
    for invoice in (
        "invoice_id,customer,currency,amount\na,A,USD,1\na,A,USD,2\n",
        "invoice_id,customer,currency,amount\na,A,USD,1.001\n",
    ):
        with pytest.raises(ValueError):
            import_dataset(invoice, "payment_id,currency,amount\np,USD,1\n", DEMO_MAPS)


def test_reservation_undo_and_evidence_are_one_consistent_loop():
    review = Review()
    review.set_note("PAY-001", "Remittance names INV-001 and INV-002")
    review.approve("PAY-001", ["INV-001", "INV-002"], True)
    state = review.state()
    assert state["payments"][0]["status"] == "reviewed"
    assert next(p for p in state["payments"] if p["id"] == "PAY-005")["status"] == "unmatched"
    with pytest.raises(Conflict):
        review.approve("PAY-005", ["INV-001"], True)
    review.undo("PAY-001")
    assert not review.reserved()
    assert review.state()["payments"][0]["status"] == "ambiguous"
    assert review.history[-1]["action"] == "review_undone"


def test_approval_checks_ack_scope_sum_ids_and_revision():
    review = Review()
    for ids, ack in (
        (["INV-003"], False),
        (["INV-001"], True),
        (["INV-003", "INV-003"], True),
        (["unknown"], True),
        (["INV-004"], True),
    ):
        with pytest.raises(ValueError):
            review.approve("PAY-001", ids, ack)
    with pytest.raises(Conflict):
        review.check_version(True)
    review.set_scope("PAY-004", "Northstar Studio")
    review.approve("PAY-004", ["INV-007"], True)
    with pytest.raises(Conflict):
        review.set_scope("PAY-004", "Willow Design")


def test_export_contains_proposals_and_neutralizes_formula_notes():
    review = Review()
    review.set_note("PAY-001", '=HYPERLINK("https://example.invalid")')
    review.approve("PAY-001", ["INV-003"], True)
    output = review.export_csv()
    assert "reviewed_proposal" in output and "'=HYPERLINK" in output
    assert "sha256" in review.export_json() and '"acknowledged": true' in review.export_json()


def test_what_if_preview_uses_real_rules_without_changing_review():
    review = Review()
    before = review.export_json()
    pair = review.preview_impact("PAY-001", ["INV-001", "INV-002"])
    assert pair["preview_only"] is True and pair["reserved_count"] == 2
    change = next(p for p in pair["changes"] if p["payment_id"] == "PAY-005")
    assert (change["before_count"], change["after_count"]) == (1, 0)
    assert change["after_status"] == "unmatched"
    assert review.preview_impact("PAY-001", ["INV-003"])["changes"] == []
    assert review.export_json() == before
    review.approve("PAY-001", ["INV-001", "INV-002"], True)
    actual = next(p for p in review.state()["payments"] if p["id"] == "PAY-005")
    assert (actual["count"], actual["status"]) == (change["after_count"], change["after_status"])


def test_what_if_rejects_invalid_and_reserved_allocations_without_writes():
    review = Review()
    for ids in (["INV-001"], ["missing"], ["INV-003", "INV-003"]):
        with pytest.raises(ValueError):
            review.preview_impact("PAY-001", ids)
    assert review.version == 0 and not review.reserved() and not review.history
    review.approve("PAY-005", ["INV-001"], True)
    before = review.export_json()
    with pytest.raises(Conflict):
        review.preview_impact("PAY-001", ["INV-001", "INV-002"])
    assert review.export_json() == before

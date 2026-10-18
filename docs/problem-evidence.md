# Problem evidence and existing solutions

Reviewed on 18 October 2026. This is a small, targeted qualitative review of public discussions and product documentation. It is not a representative survey, customer validation or a prediction of competition results. No poster was contacted and no real financial record was used.

## The specific problem

A person reviewing invoice and payment exports may have several mathematically valid allocations, incomplete payer details or missing references. The amount alone may not identify the intended invoices. MatchDesk explores a bounded review workflow: show possible groups, retain source/evidence context, preview consequences, require a human decision, and prevent local invoice reuse.

## What the sources support

| Source | What is reported or documented | Relevance and limit |
|---|---|---|
| [Reddit: Dealing with messy payment reconciliation](https://www.reddit.com/r/smallbusiness/comments/1sergd6/dealing_with_messy_payment_reconciliation_how_do/) | The original poster describes absent invoice references, inconsistent names, equal amounts and manual spreadsheet cross-checking. | Supports a concrete reported review problem. Identity, business scale and claimed outcomes are not independently verified. The thread also discusses partial payments, which MatchDesk does not support. |
| [Reddit: Matching QB payments? help!](https://www.reddit.com/r/QuickBooks/comments/1ksckhr/) | A user asks which customer paid when several invoices have the same amount. Replies point to existing payment details and matching workflows. | Supports ambiguity as a user question and shows that information or workflow knowledge can resolve it. It does not prove a missing product feature. Indexed thread text was available; direct access was intermittent. |
| [Intuit support: Matching deposits to invoices](https://quickbooks.intuit.com/learn-support/en-uk/banking/re-matching-deposits-to-invoices/01/158376) | A support response describes selecting multiple open invoices against a payment and using Find Match. | Counterevidence to any claim that one payment covering multiple invoices is a new or universally unsupported task. This is a historical support answer, not a current cross-plan feature audit. |
| [Xero: Reconcile your bank account](https://central.xero.com/0/article/Reconcile-your-bank-account) | Official documentation describes suggested matches, other possible matches and Find & Match. | Counterevidence to broad novelty claims about displaying alternatives. The indexed official text was readable; the direct page did not expose its article body in this research tool. |
| [Reconcile Locally: invoice payment reconciliation](https://usereconly.com/invoice-payment-reconciliation/) | A vendor page targets invoice-to-payment matching, combined payments and unclear references. | Shows directly overlapping positioning. A vendor claim is not an independently tested capability or proof that MatchDesk is better. |

A [recent lump-sum cash-application thread](https://www.reddit.com/r/smallbusiness/comments/1wtgysm/how_are_you_handling_cash_application_when/) also describes a builder's prototype. It is useful for seeing overlap but is discounted as independent demand evidence because the author is actively developing a solution.

## Claims this evidence does not establish

- That reconciliation is Reddit's most common problem, a top-ranked small-business problem, or a measured market opportunity.
- That MatchDesk is the first matcher, uniquely solves the task, outperforms established tools or has validated product-market fit.
- That the prototype has saved time/money, prevented real accounting errors, gained users or earned endorsements.
- That community complaints translate into a high probability of winning a hackathon.

The accurate description is a recurring reported workflow problem illustrated by specific public discussions. Search selection, promotional comments and unknown poster context limit the evidence. We use original questions to understand the task and existing solutions to challenge our assumptions, rather than treating every reply as validation.

## Why build this bounded prototype?

The proposed value is an understandable review experience for modest CSV batches: exact alternatives, source records, human-supplied evidence, a read-only preview using the real confirmation rules, visible downstream changes, and reversible decisions. These are implemented behaviors, not claims of category-level innovation. No bank integration or AI API is needed to demonstrate the complete task.

The next useful evaluation is to observe a person who performs invoice review using the same fictional task with their usual method and with MatchDesk. Record task completion, assistance, mistakes and whether they can explain the decision and consequences. Measure comparable baselines before making savings claims. The [usability protocol](../devpost/usability-check.md) is ready; no completed study is claimed.

## Competitive implications

Under the [official hackathon rules](https://learn-ai-basics.devpost.com/rules), Design, Potential Impact, Innovation/Idea and Presentation are equally weighted. Design is the first tie-break. Current technical checks support correctness; a real visual review, observed user benefit and an independently understandable working demo are still needed. The [project gallery](https://learn-ai-basics.devpost.com/project-gallery) is unpublished, so the competitive field cannot be ranked from this review.

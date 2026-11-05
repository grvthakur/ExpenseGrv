# GrvExp Transaction Parsing — Current Implementation (A–Z)

> **Purpose:** This document records the transaction-parsing behaviour currently present in the `main` branch. It is a documentation snapshot, not a proposed redesign.
>
> **Scope inspected:** `frontend/ai-entry.js`, `backend/shared/ai.gs`, `backend/ai-sheet/grv-ai-learning.gs`, `backend/shared/code.gs`, and the relevant parser tests in `tests/run-all.js`.
>
> **Important:** No parsing code is changed by this document. The earlier performance patch is not assumed to be applied. Where the implementation and the user's intended field meaning may differ, the difference is called out instead of silently rewriting the current behaviour.

---

## 1. Parsing entry points

The app has two ways to start transaction parsing:

1. **AI Transaction Entry modal**
   - User pastes a bank SMS/email or types a short transaction.
   - The `Parse` button runs the transaction parser.
   - The result opens a review/preview form.
   - The user confirms with **OK — Save**; the parser itself does not directly write the transaction row.

2. **AI Assistant chat**
   - The chat has a separate `Parse` button.
   - It forwards the text into the same AI Transaction Entry parser by setting the input and triggering the modal's Parse action.
   - The chat's `Ask` path is for questions about existing finance data, not transaction entry.

The parser supports three transaction kinds:
- `card`
- `expense`
- `sweetie`

The preview form fields are mapped to the existing app forms:
- Card: card, used by, description, remarks, amount, date.
- Expense: category, description, amount, date.
- Sweetie: type, amount, date, description.

## 2. High-level decision flow

When the user presses Parse:

1. Read and trim the complete input.
2. Decide whether the text is a finance question or a transaction.
   - Questions can be routed to the data assistant.
   - A strong bank-SMS signal prevents the text from being treated as a question.
   - Explicit Parse action forces parsing.
3. Save the original input transiently in memory for the learning feedback payload.
4. Extract explicit labels or unlabelled trailing hints (`labelHint` / `tailLab`).
5. Try the short deterministic parser (`localParse`).
6. If that does not match, try the deterministic bank-SMS parser (`smsParse`).
7. If the bank-SMS parser returns a sufficiently complete result, show preview without calling the AI endpoint.
8. Otherwise call the Apps Script endpoint `action=aiParse`.
9. If the AI endpoint fails, try offline fallback (`splitHint` + `smsParse` or `localParse`).
10. Apply client-side field guards and user hints.
11. Show the review preview.
12. Only after explicit preview confirmation does the app populate the existing form and trigger its existing Add button.

The main parser is therefore a **hybrid parser**: deterministic local rules first where possible, AI extraction for ambiguous inputs, and deterministic fallback if the AI endpoint is unavailable.

## 3. Question detection versus transaction parsing

The frontend uses `isBankSms`, `isQuestion`, and additional question-like keyword checks.

### Strong bank-SMS signal

`isBankSms(text)` requires:
- a money marker and amount (`INR`, `Rs`, or `₹` followed by digits); and
- at least one transaction word (`spent`, `debited`, `purchase`, `txn`, `transaction`, `paid`, `payment`, `charged`, `merchant`, `towards`, `credited`) or a card/account number pattern.

A strong bank-SMS signal is treated as transaction input, not an analytics question.

### Question detection

`isQuestion(text)`:
- immediately returns false for bank SMS;
- treats short text without digits as question-like;
- recognises `?`, month phrases, common Hindi question words and English question words;
- recognises terms such as `kitna`, `total`, `show`, `list`, `compare`, `highest`, `lowest`, etc.;
- does not treat text longer than 300 characters as a question.

The Parse button can be explicitly forced from chat using `forceParse`.

## 4. Explicit labels and trailing-line parsing

The parser supports explicit field labels and shorthand lines appended to a bank SMS.

### 4.1 `labelHint(text)`

Recognised labels include:
- `Used by`, `UsedBy`, `User`, `Person`, `By`
- `Desc`, `Description`, `Merchant`
- `Remark`, `Remarks`, `Note`, `Notes`

Examples:
- `Used by: GRV`
- `Description: Toothpaste`
- `Remarks: Already paid in Kotak`

The function separates labelled lines from the remaining SMS body and returns `who`, `desc`, and `rem` values. Explicit labels are intended to take priority over heuristic guessing.

### 4.2 `tailLab(text)`

This handles unlabelled trailing lines under a recognised bank SMS, such as:
- `GRV`
- `Toothpaste`
- or comma-separated variants.

It:
- only runs when the input is recognised as a bank SMS;
- scans backwards for short trailing lines;
- rejects likely SMS boilerplate, amounts, URLs, times, and transaction/system words;
- accepts the tail only when the first part is a known person or an allowed known alias;
- supports two to four parts;
- maps the first part to the person (`who`), the second to the description/item hint (`desc`), and later parts to the remainder (`rem`).

For the example:
```text
INR 199.00 spent using ICICI Bank Card XX7008 on 04-Nov-26 on AMAZON PAY IN G.
Grv
Toothpaste
```
`tailLab` can identify `Grv` as the person and `Toothpaste` as the description/item hint. `applyLab` then combines that item with the SMS merchant when the transaction is a card SMS and a merchant description already exists.

### 4.3 `splitHint(text)`

Used by the offline fallback when AI parsing fails. It first tries `labelHint`. Otherwise it searches for a plausible final hint line, then heuristically separates person, description-like text, and remark-like text using keyword rules.

**Important implementation note:** `splitHint` is a fallback heuristic. The code explicitly avoids treating its guessed `rem` as a confirmed Remarks value; only explicit `Remarks:` labels are allowed to populate Remarks in that fallback path.

## 5. Short offline parser — `localParse(text)`

This parser handles short, compact entries without a network call.

### Input constraints and amount
- Maximum input length: 80 characters.
- Removes rupee symbols, commas, and `Rs` before token analysis.
- Recognises `today` and `yesterday`.
- Recognises day + month-name dates (for example `9 Oct`) and numeric day/month dates.
- Requires exactly one numeric amount token after date removal.
- If there are zero or multiple numeric tokens, it returns `null`.

### Card matching
- Reads configured card names from `cardConfig`.
- Splits configured names into tokens longer than two characters.
- Uses `wm()` for exact or consonant-skeleton/phonetic matching.
- Requires one unique best card match; a tie prevents the card match.

### Card output
If a card is matched:
- `kind = card`
- `card = matched configured card`
- known person words can populate `usedBy`
- words before a payment-status keyword become description text
- words from the payment-status keyword onwards become `remarks`
- aliases include mom/mommy/mumma/mum/maa/mother → mummy and dad/daddy → papa.

The current `KWX` list includes terms such as `already`, `paid`, `kotak`, `pending`, `due`, `settled`, `refund`, `upi`, `gpay`, `phonepe`, `note`, and `reminder`.

### Sweetie output
If no card is matched but the words include `sweetie`, the parser looks for:
- `saving` / `save` → `SAVING`
- `debit` / `borrow` → `DEBIT`
- `credit` → `CREDIT`

It removes those control words from the remaining description. If it cannot determine a Sweetie type, it returns `null`.

## 6. Bank SMS parser — `smsParse(text)`

This is the deterministic parser for bank SMS/email notifications. It is asynchronous in signature, but its extraction is local and does not itself call an AI model.

### 6.1 Recognition and amount
- Rejects text longer than 3,000 characters.
- Requires `isBankSms(text)`.
- Uses `bankAmount(text)` to extract the transaction amount.
- Requires a positive amount.

`bankAmount` searches currency-marked values (`INR`, `Rs`, `₹`), skips values associated with available/AVL limit, balance, outstanding, minimum due, total due, or rewards, and prefers an amount with a nearby transaction label such as `spent`, `debited`, `transaction`, `purchase`, `paid`, `payment`, `charged`, `towards`, or `of`.

### 6.2 Date
Recognised formats include:
- `Nov 4, 2026`
- `04-Nov-26`
- `2026-11-04`
- `04-11-2026` and slash-separated equivalents.

If no valid date is found, the current date is used.

### 6.3 Card resolution
Card resolution is synchronous and uses:
1. a learned last-four-to-card map in local storage (`ai_last4_v1`);
2. the in-memory Credit Card Master cache (`ccMasterCache`);
3. the saved local `cc_master_cache_v1` cache.

The last four digits can be extracted from patterns around `card`, `a/c`, `acct`, `xx`, or `**`.

If last-four matching does not resolve the card:
- the parser looks for a bank name (ICICI, HDFC, Axis, SBI, Kotak, IDFC, PNB, HSBC, IndusInd, RBL, BOB);
- if exactly one configured card begins with that bank name, it selects that card.

It also tries merchant + issuer matching against configured card names. A complete bank SMS can still be returned with an empty card if a bank or last-four indicator exists; the user can choose the card in preview.

### 6.4 Merchant / Description extraction
Priority:
1. `Merchant:` / `Merchant Name:` label;
2. `for MERCHANT` pattern, subject to the existing guard;
3. `at MERCHANT`, `towards MERCHANT`, or `@ MERCHANT`.

The merchant text is cleaned by `cleanM`:
- strips leading issuer-style prefixes such as `ABC*`;
- removes legal/business suffix and noise words such as `private`, `pvt`, `ltd`, `limited`, `internet`, `india`, `technologies`, `services`;
- collapses whitespace;
- uppercases;
- removes a trailing `IN`.

A standalone merchant-like line and an `Info:` line are additional fallbacks.

Flipkart-like truncated descriptors are normalised to `FLIPKART`.

**Current-code limitation:** the merchant regex in the inspected `frontend/ai-entry.js` recognises `at`, `towards`, and `@`; it does not include a general `on MERCHANT` introducer. Thus SMS formats that place the merchant only after `on` may fail merchant extraction and miss the deterministic fast path. This is a documented observation, not a change made here.

### 6.5 Returned shape
The normal result contains:
- `kind: "card"`
- `card` (resolved card or empty string)
- `usedBy` initially empty
- `desc` (merchant)
- `amount`
- `date`

## 7. Merchant normalisation and aliases

`normDesc()` applies:
1. user-learned aliases from local storage key `ai_alias_v1`;
2. built-in brand recognition;
3. uppercase raw text if no known brand matches.

Built-in normalisations include:
- IRCTC
- AMAZON
- FLIPKART
- SWIGGY
- ZOMATO
- BLINKIT
- ZEPTO
- BIGBASKET
- MYNTRA
- UBER
- OLA
- NETFLIX
- SPOTIFY
- BOOKMYSHOW
- MAKEMYTRIP
- DMART
- JIO
- AIRTEL
- TANISHQ

If Description contains `SOURCE - ITEM`, the source is normalised recursively and the item suffix is retained in uppercase.

`learnAlias(original, corrected)` stores a user-corrected Description alias locally, with a maximum of 300 entries. It is invoked when the user edits the Description in preview and confirms.

## 8. User shorthand parsing

### 8.1 `userLine(text)`

Looks for a short user-supplied line in a multi-line SMS input. It rejects lines that look like bank/system content, amounts, URLs, card numbers, times, or security/boilerplate text.

It supports:
- explicit compact format such as `Grv Grocery: dudh dahi egg`;
- person-prefixed shorthand such as `Grv Chaypatti and Pyaj`;
- date extraction from the hint line;
- known-person detection;
- payment-status keyword detection.

The function returns a person, hint text, optional date, and confidence marker (`sure`).

### 8.2 `shorthandHint(text, base)`

Handles comma-separated shorthand, for example:
```text
Grv, flpkrt axs, meethae from swiggy
```

It:
- requires a known person in the first comma-separated part;
- tries to match the card from configured cards using exact/consonant-skeleton matching;
- separates an item from a source using `item from source`;
- detects a separate payment note using phrases such as `already paid`, `paid in`, `will get refund`, `refund`, `split with`, `pending`, `settled`, and `due`;
- can combine the source and item into `SOURCE - ITEM`;
- returns `usedBy`, optional `card`, `desc`, and `remarks`.

### 8.3 Description-hint merge

`appendDescriptionHint()`:
- uppercases and normalises the item hint;
- avoids adding the same item twice;
- if a known brand exists in the current merchant text, keeps the brand and replaces the noisy suffix with the item;
- otherwise appends ` - ITEM`.

`hintToRemarks()` merges a parsed user-line hint into the transaction object. Its exact branch behaviour depends on whether the note was explicitly labelled and whether a shorthand Description already exists. The current implementation should be treated as authoritative when documenting existing behaviour; it should not be casually rewritten.

## 9. Remarks versus Description — field meaning and current safeguards

### Intended field contract recorded for this project

- **Description:** payment source/merchant plus the purchased item or purpose, in `SOURCE - ITEM` format where both are known.
  - Examples: `AMAZON - TOOTHPASTE`, `SWIGGY - MEETHAE`, `FLIPKART - SHOES`, `UBER - AIRPORT`.
- **Remarks:** a separate payment-related personal note explicitly supplied by the user.
  - Examples: `ALREADY PAID IN KOTAK`, `ALREADY PAID IN SBI`, `WILL GET REFUND`, `SPLIT WITH ANUKARAN`.
- **Used By:** the person who used the card, e.g. `GRV`, `TANYA`, `MUMMY`.

Item/purpose words such as `TOOTHPASTE` belong in Description, not Remarks. Payment-status or settlement notes belong in Remarks.

### Current implementation safeguards
- The preview keeps `desc` and `remarks` as separate fields.
- The preview comment explicitly says not to silently merge Remarks into Description.
- `applyLab()` handles labelled Description and Remarks separately.
- Bank SMS boilerplate/security messages are removed from `desc` or `remarks` if they match `BOILER`.
- The AI prompt explicitly says item/purpose belongs in Description and a separate user-supplied payment note belongs in Remarks.

The heuristic hint functions have multiple formats and branches. Their outputs must be tested against the field contract above; the comments alone are not proof that every shorthand shape behaves identically.

## 10. AI fallback — frontend to Apps Script

When deterministic parsing does not produce a sufficiently complete result, the frontend calls:
```text
action=aiParse
```
with:
- full input text (URL-encoded);
- configured cards;
- configured expense categories;
- known people.

The active Apps Script router in `backend/shared/code.gs` calls `aiHandle(action, e)` before the other handlers. The active transaction parser is `aiParse_()` in `backend/shared/ai.gs`.

### 10.1 AI extraction prompt

The prompt asks for one transaction and a JSON object with:
- `kind`
- `card`
- `usedBy`
- `desc`
- `remarks`
- `amount`
- `date`
- `category`
- `type`

It includes detailed rules:
- read the entire SMS/email and the user's own lines;
- explicit labels win;
- bank SMS amount must exclude OTP, available limit/balance and card last-four;
- merchant/source is Description;
- item/purpose is appended as `SOURCE - ITEM`;
- Remarks are only separate personal/payment notes;
- sums such as `214+163` are added for non-bank-SMS text;
- card/expense/Sweetie kind selection;
- card selection from configured card list;
- Used By selection from known people and names in the user's own line;
- expense category selection from configured categories;
- date handling including today/yesterday/kal;
- Sweetie type selection.

### 10.2 Personal Learning context

Before calling the model, `aiParse_()` calls `grvAiLearningContext_(text)`.

If learning is enabled and relevant patterns are found, up to 12 matching patterns are added to the prompt. Correction patterns are ranked ahead of generic historical patterns. Learning is advisory and must not override explicit text or deterministic bank-SMS fields.

### 10.3 Deterministic server-side bank fields

`aiBankFields_(text)` independently detects:
- whether the text has a bank-SMS shape;
- transaction amount, excluding limit/balance values;
- a merchant when a `Merchant:` label exists;
- numeric `dd-mm-yyyy` / `dd/mm/yyyy` / `dd.mm.yyyy` date.

After the model responds:
- bank amount overrides the model amount when found;
- bank merchant overrides the model Description when found;
- bank date overrides the model date when found;
- a bank SMS forces kind to `card`, unless the plan is `sweetie`.

If AI returns invalid output or fails, a recognised bank SMS can still create a minimal card plan using the deterministic bank fields.

### 10.4 Server-side validation and normalisation

After extraction:
- amount strings are parsed; `+` sums are supported;
- non-bank SMS sums are extracted from the original text;
- card names are matched against the configured card list;
- card kind is inferred when card/CC wording is present;
- unresolved cards are matched using bank aliases, configured card tokens, and recent card usage;
- a final phonetic/substring token fallback is attempted;
- expense with no category defaults to `Miscellaneous`;
- invalid/missing date defaults to today;
- Description and Remarks are uppercased;
- Used By is title-cased.

The server returns the resulting JSON plan to the frontend.

## 11. Offline fallback when AI is unavailable

If the AI request fails or returns no usable result:
1. `splitHint()` tries to separate the bank body from a user hint.
2. The parser tries `smsParse()` on the bank body.
3. If that fails, it tries `localParse()`.
4. If a split hint exists, its Description/person hints are applied with the current safeguards.
5. The result is shown in preview if a usable local parse exists; otherwise an error is shown.

This makes bank-SMS parsing resilient to AI/provider outages, provided the deterministic parser can recognise the SMS structure.

## 12. Preview, user edits, and save boundary

The parser does not directly append a transaction.

### Preview
- `preview(r)` selects the matching existing form based on `kind`.
- Description is normalised with `normDesc()`.
- The parser's original suggestion is captured before the user edits the preview.
- The user can edit the preview fields.
- Amount must be greater than zero.
- Required select fields (for example, card) must have a selection.
- Corrected Description can be saved as a local merchant alias.
- Corrected last-four/card association can be saved locally.

### Confirm
Only when the user clicks **OK — Save**:
- the app creates a pending learning payload containing the original input and original suggested fields;
- the raw source text remains transient and is sent with the save request;
- the existing form is populated;
- the existing Add button is triggered.

The existing transaction-write path remains responsible for writing the transaction. Learning is only recorded after a successful write/recalculation, not merely because the parser produced a preview.

## 13. Personal Data Learning sidecar

File: `backend/ai-sheet/grv-ai-learning.gs`

### Configuration
- Learning is enabled only when Script Property `GRV_AI_LEARNING_SPREADSHEET_ID` is configured.
- A separate spreadsheet is used.
- Tabs:
  - `LearningPatterns`
  - `LearningEvents`

### Privacy / source fingerprint
- Raw SMS text is not stored in the learning sheet.
- The source is normalised into a short fingerprint.
- Long digit sequences and phone numbers are replaced.
- The fingerprint can include bank, merchant hint and whether the input has a bank-SMS shape.

### Context retrieval
- Reads `LearningPatterns`.
- Normalises the current input.
- Finds patterns whose source matches one or more input tokens.
- Sorts correction patterns first, then confidence and count.
- Returns up to 12 patterns.

### Save timing
`grvAiLearnSaved_()` is intended to run only after a successful transaction write and existing recalculation. It fails open: a learning failure must not undo a saved transaction.

### What is learned
The sidecar stores:
- event metadata and a safe source fingerprint;
- final approved transaction snapshot;
- original parser suggestion snapshot;
- detected field corrections;
- patterns for merchant, bank-card, person-card, person, description, remarks, card, and merchant-category;
- context-anchored correction rules such as `correction:description` or `correction:remarks`.

Repeated consistent outcomes increase confidence; conflicting outcomes reduce confidence. Duplicate identical save events for the same transaction are guarded against.

### Feedback summary
`grvAiLearningFeedbackSummary_()` reads the Events tab and counts total events, corrected events and corrected fields. The current `grvAiLearningContext_()` also calls this summary when building inference context.

## 14. Separate AI finance-query engine (not transaction parsing)

`backend/shared/ai.gs` also contains `aiQuery_()` and `aiAsk` / `aiMatch` support for questions about existing records.

This is separate from `aiParse_()`:
- `aiQuery_()` builds a data profile and asks the model to produce a read-only JavaScript query plan.
- `aiRun_()` executes that plan against already-loaded finance rows with guarded helpers.
- A self-check model pass may audit the generated result.
- The frontend has a local data loader/cache and a `runPlan()` function for classic query-plan results.
- This engine answers questions about expenses/cards/Sweetie/salary/summary; it does not create a new transaction.

It is included here only to distinguish the similarly named AI data assistant from the transaction parser.

## 15. Existing test coverage observed

`tests/run-all.js` includes parser-related checks such as:
- client `smsParse()` amount/date/merchant/kind for an Axis/Swiggy example;
- OTP/non-transaction text should not parse as a transaction;
- server `aiBankFields_()` extraction;
- non-SMS text should not be marked as bank SMS;
- client/server bank amount parity for a set of SMS fixtures.

There are also separate regression scripts for issuer detection and shorthand parsing. The test suite itself notes a known issue in one shorthand regression script where the script can exit successfully while a case reports `pass:false`.

The exact ICICI example with merchant introduced by the second `on` is not shown as an existing test in the inspected test excerpt.

## 16. Current limitations and behaviour to preserve during future work

These are observations about the inspected code, not fixes:

1. The frontend merchant regex does not generally recognise `on MERCHANT`; it recognises `at`, `towards`, and `@` plus the explicit Merchant/For patterns. This can cause an otherwise parseable bank SMS to miss the deterministic fast path.
2. Some shorthand paths are heuristic and depend on known people/card configuration.
3. The short parser requires exactly one numeric token after date cleanup.
4. A bank SMS can be parsed without resolving its exact card; preview allows user selection.
5. Missing SMS date defaults to today.
6. Brand aliases and last-four mappings are stored locally in browser local storage.
7. Learning is optional and requires the Script Property and learning spreadsheet.
8. Learning is recorded after successful transaction save, not on preview alone.
9. The deterministic parser and AI parser have overlapping responsibilities; field-level precedence and fallback order matter.
10. The parser's actual output must be checked against the project's Description/Remarks contract for each shorthand format before any refactor.

## 17. Files that own the current parsing behaviour

| File | Responsibility |
|---|---|
| `frontend/ai-entry.js` | Main UI entry, local parser, SMS parser, hints/shorthand, merchant normalisation, preview, AI request, offline fallback |
| `backend/shared/ai.gs` | Server bank-SMS field extraction, AI transaction prompt, AI extraction, validation, card matching; also separate finance-query engine |
| `backend/shared/code.gs` | Apps Script `doGet()` routing; calls `aiHandle()` early |
| `backend/ai-sheet/grv-ai-learning.gs` | Personal Data Learning context, privacy-safe fingerprints, approved-save learning and correction patterns |
| `tests/run-all.js` | Parser and client/server parity regression checks |
| `tests/issuer_detection_regression_test.js` | Issuer/card detection regression checks |
| `tests/shorthand-regression-test.js` | Shorthand parsing regression checks |

---

## 18. Change-control rule for future parser work

Before changing parsing behaviour:
1. Read this document and the live implementation.
2. Add a test for the exact input shape being changed.
3. Preserve the existing fallback order unless a deliberate change is approved.
4. Preserve the field contract:
   - Description = merchant/source + item/purpose.
   - Remarks = payment-related personal note only.
   - Used By = person who used the card.
5. Do not change financial calculations or transaction write paths as part of a parser-only change.
6. Update this document only after the implementation and tests have been reviewed.

**This file is a current-state record. It is not a claim that every heuristic is correct for every possible SMS format.**

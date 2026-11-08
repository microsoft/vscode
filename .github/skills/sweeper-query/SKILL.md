---
name: sweeper-query
description: Answer natural-language questions about the VS Code Sweeper's published issue index (index-<name>.json for microsoft/vscode and the enrolled family repos) — which issues are agent-ready to implement or plan, what the sweeper proposed for an assignee or area, whether a report is a known duplicate, the highest-value open bugs in a lane. Use when the user asks about sweeper verdicts, agent-ready issues, duplicates, value ranking, needs-info asks or anything else "the sweeper knows". Read-only; discovery only.
---

# Query the sweeper's index

The sweeper reviews every open issue of microsoft/vscode and a family of enrolled
repos nightly and publishes one JSON index per repo. Each row carries the review's
verdict, a value score, an agent-readiness tier, a duplicate canonical, the
assignee, labels and lifecycle stamps. This skill turns a question in plain language
into a `jq` query over that file and answers with a short table.

**You write the jq.** There is no query language to learn and no helper script: read
the field reference at the end of this file, map the question onto fields, run `jq`
against the cached index, answer. When the question is ambiguous (which repo? which
assignee? open only?), prefer the defaults below and say which you used — ask only
when the answer would be useless under every default.

**Read-only, discovery only.** Never comment on, label, close, react to or edit any
issue, and never write to the state repo. Do not hand the result to another skill or
start implementing an issue from here; the deliverable is the list. If the user wants
to act on a row, they say so in their own words and that is a separate task.

## 1. Pick the repository

One repo per question. Default: microsoft/vscode (`index-vscode.json`). Resolve any
other repo through the roster, never from memory:

```bash
STATE=egamma/vscodesweeper-state
gh api "repos/$STATE/contents/targets.json?ref=main" -H "Accept: application/vnd.github.raw" \
  | jq -r '.targets[] | select(.sandbox != true) | "\(.name)\t\(.repo)\tfixLane=\(.fixLane)"'
```

`name` picks the file (`index-<name>.json`); `fixLane: false` means the repo's rows
never carry `agentReadiness`. Entries flagged `sandbox: true` are the operator's test
repo — show them only when asked for by name. A repo not in the roster is not swept;
say so instead of guessing a file name.

## 2. Get the index (cached, validated on every question)

The file is 10–15 MB for vscode and changes only when the sweeper publishes (nightly,
plus the occasional hand run). Cache it once per target and re-validate the cache
against the file's latest commit before each question — one small request, no
re-download unless it changed:

```bash
STATE=egamma/vscodesweeper-state
NAME=vscode                                   # from targets.json .targets[].name
DIR="${TMPDIR:-/tmp}/sweeper-query"; mkdir -p "$DIR"
FILE="index-$NAME.json"
SHA=$(gh api "repos/$STATE/commits?path=$FILE&sha=main&per_page=1" --jq '.[0].sha')
if [ ! -s "$DIR/$FILE" ] || [ "$(cat "$DIR/$FILE.sha" 2>/dev/null)" != "$SHA" ]; then
  gh api "repos/$STATE/contents/$FILE?ref=main" -H "Accept: application/vnd.github.raw" > "$DIR/$FILE.tmp" \
    && mv "$DIR/$FILE.tmp" "$DIR/$FILE" && printf '%s' "$SHA" > "$DIR/$FILE.sha"
fi
jq -r '"\(.target) · \(.rows | length) rows · generated \(.generatedAt) · schema \(.schema)"' "$DIR/$FILE"
```

`gh api` works whether the state repo is public or private (it will move into the
org); `gh auth status` must pass. While the repo is public,
`curl -s https://raw.githubusercontent.com/$STATE/main/$FILE` is an equivalent
fallback for the download step. Refuse an index whose `schema` major is not the one
documented below.

## 3. Write the query — the idioms that matter

- **Open issues have no `currentState`.** Default to open rows unless the question is
  about closes: `select(.currentState == null)`.
- **Sparse keys.** A missing key is the default, so write `(.valueRaw // 0)`,
  `.linkedPr == null`, `.dismissed != true`, not `.dismissed == false`.
- **Labels are one comma-joined string.** Exact label match:
  `((.labels // "") | split(", ") | index("terminal"))`. The same for `areaLabels`.
  A bare `test("terminal")` also matches `terminal-tabs` and `integrated-terminal`;
  say so if you use it.
- **"My issues" = `owner`**, the assignee login at review time. If the user's login
  is unknown, `gh api user --jq .login`. Call it "assignee" in the answer, not "owner".
- **Ready to implement** (the default meaning of "agent-ready" / "ready to fix"):
  `.currentState == null and .agentReadiness == "implement" and .linkedPr == null and .skillPr == null and .dismissed != true`.
  **Ready to plan**: the same with `"plan"` — the brief lists open decisions; an
  agent can start there too. Offer both tiers when the user does not specify. Say
  that readiness is a review-time snapshot: re-check the live issue (open, no
  `security` label, no open PR) before anyone starts.
- **Ranking.** Sort laned rows by `-(.valueRaw // 0)`; compare values only within one
  assignee × lane, never across the whole corpus. `lane == "bugs"` has `severity`,
  `lane == "features"` has `signal`.
- **Time windows.** `reviewedAt`, `createdAt`, `closedAt`, `lastCommentAt` are ISO
  strings: `.reviewedAt >= (now - 7*86400 | todate)` for "this week".
- **Duplicates.** A duplicate proposal is `closeReason == "duplicate"` with the target
  in `canonical` (`"12345"` or `"owner/repo#12345"`); `verifyVerdict` says whether the
  blinded second review confirmed it.
- **Hide dismissed rows** (`.dismissed != true`) unless asked about them.

## 4. Answer format

- TSV from jq, `number` first, then `title`, then only the fields the question asked
  for. Render it as a Markdown table in the answer; link numbers as
  `https://github.com/<repo>/issues/<n>` (the repo is the envelope's `target`).
- At most 50 rows, and always the total matched (`length` on the filtered array).
  Offer to narrow rather than print more.
- Always state the snapshot: the envelope's `generatedAt`, and that `owner`, labels,
  readiness and open state are as of the review, not live.
- Never print `proposedComment` for more than one issue, and never dump rows the
  question did not ask for.

## Worked examples

**"What did the sweeper propose in my area this week?"** (area = the `terminal`
label; proposals = rows with a `triageAction`, i.e. not keep-open)

```bash
jq -r '[.rows[] | select(.currentState == null and .triageAction != null
        and ((.labels // "") | split(", ") | index("terminal"))
        and .reviewedAt >= (now - 7*86400 | todate))]
  | sort_by(.reviewedAt) | reverse
  | .[:50][] | [.number, .triageAction, (.closeReason // .proposedLabel // ""), .title] | @tsv' "$DIR/$FILE"
```

**"Is this a known duplicate before I file?"** (the report: minimap renders blurry
on a scaled display) — search open titles by the symptom's keywords, then show
whether each hit is itself a confirmed duplicate of something older:

```bash
jq -r '[.rows[] | select(.currentState == null
        and (.title | test("minimap"; "i")) and (.title | test("blur|scal|dpi|zoom"; "i")))]
  | sort_by(-(.upvotes // 0))
  | .[:20][] | [.number, (.upvotes // 0), (.canonical // ""), (.verifyVerdict // ""), .title] | @tsv' "$DIR/$FILE"
```

Read the result for the user: a hit with a `canonical` points at the issue the
family already tracks; no hit means the index knows no open report with those words
(it is a title search, not a semantic one — suggest one more phrasing before
concluding).

**"Pick me three implementable papercuts in terminal."**

```bash
jq -r '[.rows[] | select(.currentState == null and .agentReadiness == "implement"
        and .linkedPr == null and .skillPr == null and .dismissed != true
        and .severity == "papercut"
        and ((.labels // "") | split(", ") | index("terminal")))]
  | sort_by(-(.valueRaw // 0))
  | .[:3][] | [.number, (.valueRaw // 0), (.owner // "unassigned"), .title] | @tsv' "$DIR/$FILE"
```

If fewer than three match, say so and widen one axis at a time (drop `papercut`, then
offer `plan`-tier rows), naming the widening.

**"alexdima's open minimap bugs, by value"** — the one-liner that seeded this skill:

```bash
jq -r '[.rows[] | select(.currentState == null and .owner == "alexdima" and .lane == "bugs"
        and ((.labels // "") | split(", ") | index("editor-minimap")))]
  | sort_by(-(.valueRaw // 0))
  | .[:50][] | [.number, (.valueRaw // 0), (.severity // ""), .title] | @tsv' "$DIR/$FILE"
```

## Field reference

<!-- index-schema:start -->
_Generated from `src/index-schema.ts` — index schema 2. Do not edit by hand; run `npm run sync-skills`._

**Source.** State repo `egamma/vscodesweeper-state`, branch `main`: `targets.json` (the roster — one entry per enrolled repo, `name` picks the file) and `index-<name>.json` per repo (`index-vscode.json` for microsoft/vscode).

**Envelope.** `{ schema, target, generatedAt, site: { stateRepo, stateBranch }, rows }` — `schema` is the shape version (refuse a major you don't know), `target` the `owner/repo`, `generatedAt` when the index was built, `rows` the records below.

**Rows are sparse.** A key is omitted when it would hold its default: an open issue has no `currentState`, an unassigned one no `owner`, a non-agent-ready one no `agentReadiness`. Always write `(.x // default)` or `.x == null` checks. `labels` and `areaLabels` are comma-joined strings, not arrays.

| Field | Type | Present | Meaning |
|---|---|---|---|
| `number` | number | always | The issue number. Link: `https://github.com/<repo>/issues/<number>`. |
| `title` | string | always | The issue title at review time. |
| `url` | string | only when the issue URL is not the canonical `https://github.com/<repo>/issues/<number>` | Safety valve; derive the link from `number` otherwise. |
| `reviewUrl` | string | only when the record lives off the canonical path | The review record's URL. Canonical: `https://github.com/<stateRepo>/blob/state/records/<repo>/items/<number>.md`. |
| `owner` | string | when the issue had an assignee at review time | The assignee's GitHub login (a review-time snapshot, not the live assignee). Say "assignee" to users. |
| `createdAt` | string | always (ISO 8601) | When the issue was opened — the issue's age. |
| `reviewedAt` | string | always (ISO 8601) | When the sweeper last reviewed the issue. |
| `labels` | string | when the issue had labels at review time | The issue's labels, COMMA-JOINED into one string (`"bug, terminal, help wanted"`). Split before matching: `(.labels // "") \| split(", ") \| index("terminal")`. |
| `areaLabels` | string | when the review suggested area labels | Area labels the review proposed (or found), comma-joined like `labels`. Informational — nothing applies them. |
| `itemType` | string | always | What kind of item the review judged this to be. Values: `bug`, `feature-request`, `debt`, `polish`, `upstream`, `question`, `under-discussion`. |
| `triageAction` | string | when NOT `keep-open` (the absent default; route-to-area is folded into keep-open) | What the sweeper proposes. A proposal is never applied by the sweeper itself. Values: `propose-close`, `needs-info`. |
| `proposedLabel` | string | when the verdict proposes a label (absent = `none`) | A real label of the repo the verdict proposes (`*duplicate`, `info-needed`, `bug`, …). |
| `closeReason` | string | on close proposals | Why the close is proposed. Values: `duplicate`, `implemented-on-main`, `as-designed`, `not-reproducible`, `out-of-scope`, `question`, `invalid`. |
| `canonical` | string | on duplicate close proposals | The issue this one duplicates: `"12345"` (same repo) or `"owner/repo#12345"` (cross-repo). |
| `confidence` | number | always (0–1) | The review's confidence in its verdict. |
| `proposedComment` | string | when the verdict drafted a comment | The full proposed comment (long). Print it for ONE issue when asked, never in bulk. |
| `verification` | string | on bugs the review assessed | Reproduction strength tier, best → worst. Values: `Confirmed`, `Source-confirmed`, `Traced`, `Plausible`, `Unverified`, `Inconclusive`, `not applicable`. |
| `agentReadiness` | string | when not `none` (the absent default) | `implement`: diagnosis done, bounded change, named validation — an agent can go straight to code. `plan`: goal clear, but a design/diagnosis decision is open first. A review-time snapshot: the issue may have gained a PR or a `security` label since. Values: `implement`, `plan`. |
| `autoFixable` | string | always, as the STRING `"true"`/`"false"` | Legacy boolean = `agentReadiness == "implement"`. Prefer `agentReadiness`. |
| `linkedPr` | string | on agent-ready rows an OPEN contributor PR already references | That PR's URL. Treat the issue as taken. |
| `skillPr` | string | when a sweeper-implement skill PR exists for the issue | That PR's URL. |
| `skillPrState` | string | beside `skillPr` | Its state when last seen. Values: `open`, `merged`, `closed`. |
| `fixPr` | string | historical rows only (retired fork lane) | URL of a draft fix PR from the retired fork lane. |
| `implementPr` | string | historical rows only (retired implement lane) | URL of a draft PR from the retired implement lane. |
| `lane` | string | on open keep-open rows of the two ranked types | Which ranking the row belongs to. Rows without a lane are not ranked (closed, close proposals, needs-info, other item types). Values: `bugs`, `features`. |
| `valueRaw` | number | beside `lane` | The UN-normalized value score (demand × severity/breadth, age-damped). Compare only within one assignee × lane; sort with `sort_by(-(.valueRaw // 0))`. |
| `upvotes` | number | beside `lane` | 👍 reactions at review time. |
| `comments` | number | beside `lane` | Comment count at review time. |
| `severity` | string | bugs lane | The bug's severity class. Values: `crash`, `data-loss`, `freeze`, `perf`, `correctness`, `visual`, `papercut`, `none`. |
| `signal` | string | features lane | Demand signal: `backlog-candidate` (milestoned Backlog), `active` (recent demand), `dormant`. Values: `backlog-candidate`, `active`, `dormant`. |
| `infoRequestedAt` | string | on a needs-info row whose request still stands (ISO, or `unknown`) | When the repo's needs-info label was applied. |
| `infoAnsweredAt` | string | beside `infoRequestedAt`, when the reporter answered but the label is still on | The reporter's first reply after the ask — the issue now waits on the maintainer. |
| `infoAnsweredBy` | string | beside `infoAnsweredAt` | Who answered. Values: `reporter`. |
| `infoRequestedBy` | string | on needs-info rows with a post-review request | Login that applied the label. |
| `infoCommentUsed` | string | on needs-info rows with a post-review request | Whether the proposed question was posted. Values: `verbatim`, `embedded`, `edited`, `none`, `not-proposed`. |
| `infoActedBy` | string | beside `infoCommentUsed` | Login that posted the question. |
| `currentState` | string | when CLOSED (absent = open) | Open issues carry no `currentState`. Filter open rows with `select(.currentState == null)`. Values: `closed`. |
| `closedAt` | string | closed rows (ISO) | When the issue was closed. |
| `stateReason` | string | closed rows | GitHub's close reason. Values: `completed`, `not_planned`, `duplicate`, `not_found`. |
| `closedBy` | string | closed rows | Login that closed the issue. |
| `proposedCommentUsed` | string | closed close-proposal rows | Whether the sweeper's proposed closing comment was posted. Values: `verbatim`, `embedded`, `edited`, `none`, `not-proposed`. |
| `actedBy` | string | beside `proposedCommentUsed` | Login that posted it. |
| `autoClosedAt` | string | rows the sweeper-close action closed (ISO) | An automatic close — never a maintainer action. |
| `autoLane` | string | beside `autoClosedAt` | Which auto-close lane closed it. Values: `duplicate`, `implemented`. |
| `autoObjectedAt` | string | auto-closed rows someone replied to afterwards (ISO) | A possible objection the assignee should look at. |
| `lastCommentAt` | string | open rows with a non-bot comment (ISO) | The newest human comment. |
| `lastCommentBy` | string | beside `lastCommentAt` | `reporter` for the issue author, else the login. |
| `assigneeActedAt` | string | open rows where a live assignee acted (ISO) | The assignee's latest action. |
| `previousTriageAction` | string | open rows re-reviewed after a comment | The verdict this review replaced (e.g. `needs-info` → now keep-open). |
| `previousCloseReason` | string | beside `previousTriageAction` | The replaced verdict's close reason. |
| `previousCanonical` | string | beside `previousTriageAction` | The replaced verdict's duplicate canonical. |
| `verifyVerdict` | string | close/needs-info proposals a blinded second review checked | The second review's verdict on the proposal. Values: `confirmed`, `refuted`, `unverifiable`. |
| `verifyEvidence` | string | beside `verifyVerdict` | Its one-line rationale. |
| `verifyKind` | string | beside `verifyVerdict`, where the lane classifies | Duplicate lane: canonical kind; implemented lane: `bug-fix` \| `feature`. |
| `verifyCanonical` | string | duplicate lane | The canonical the verifier found. |
| `verifyCanonicalRepo` | string | when the verifier's canonical is in another repo | That repo (`owner/name`). |
| `verifyStale` | boolean | when the row was re-reviewed after its verification | The verification no longer matches the current review. |
| `verifyUnreleased` | boolean | implemented lane | Fixed on main but in no stable release yet. |
| `disputedAgain` | boolean | refuted twice | A refuted proposal whose automatic re-review is spent — for a person. |
| `verifiedUpdatedAt` | string | when set | Issue `updatedAt` as the verifier saw it. |
| `dismissed` | boolean | when a maintainer removed the proposal | Hide by default: `select(.dismissed != true)`. |
| `dismissedIssue` | string | beside `dismissed` | The state-repo issue that recorded the dismissal. |
| `dismissedAt` | string | beside `dismissed` (ISO) | When. |
| `dismissedBy` | string | beside `dismissed` | Who. |
| `dismissedReason` | string | when a reason was given | The maintainer's one-line reason. |
| `dismissedKind` | string | when classified | Why it was dismissed. Values: `disagree`, `other-direction`, `already-handled`, `keep-open-anyway`, `other`. |
| `contentStale` | boolean | when the issue changed since its review | The verdict may be out of date. |
<!-- index-schema:end -->

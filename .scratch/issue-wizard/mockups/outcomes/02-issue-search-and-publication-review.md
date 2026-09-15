# Issue search and publication review

## State and purpose

Resolve → issue route, publication review after a completed duplicate search. The selected destination is an existing `microsoft/vscode` issue; the final approval covers the exact sanitized payload and all three attachments together. A search failure must leave the query and evidence intact and offer retry/edit recovery.

## Exact intended copy

- `Issue Wizard`; `Understand`; `Investigate`; `Resolve`; `Issue / existing-issue comment`
- `Review before publication`; `Confirm the destination, content, and attachments before publishing.`
- `Duplicate search — microsoft/vscode`; query `editor.wordWrap does not apply to markdown preview`
- `#184221 Word wrap setting ignored in Markdown preview`; `Likely match · 82%`
- `#172908 Markdown preview ignores editor.wordWrap`; `Possible match · 61%`
- `Search completed — 2 possible matches`; `Comment on #184221`
- Title: `Word wrap setting ignored in Markdown preview`
- Body: `When editor.wordWrap is set to on, long lines wrap in the text editor but remain unwrapped in the Markdown preview. Reproduced in VS Code 1.96.2 with the default Markdown extension.`
- `Edit title`; `Edit body`; `Attachments (3)`
- `repro-editor.png  PNG  184 KB`; `markdown-preview.png  PNG  221 KB`; `issue-wizard-log.txt  TXT  6 KB`
- `I reviewed the exact text and all 3 attachments`; `Ready for final approval`; `Approve and publish`; `Back to edit`; `Open browser handoff`; `No labels or assignee will be added`

## Actions and events

- Search/retry emits `searchExistingIssues({ repository: "microsoft/vscode", query })`; success records results, while failure emits `recordRecoverableSearchFailure({ query, error })` without dropping attachments.
- Selecting the issue emits `selectIssueDestination({ issueNumber: 184221, mode: "comment" })`; new-issue selection emits the analogous `selectIssueDestination({ mode: "new" })`.
- `Edit title` / `Edit body` emit `editPublicationPayload({ field, value })`.
- `Approve and publish` emits `approvePublication({ payloadHash, attachmentIds })` only when the checkbox is checked; host then emits `publishIssueOrComment({ destination, payload, attachments })` or opens the authenticated browser handoff.
- `Back to edit` returns to the payload editor; `Open browser handoff` emits `openPublicationHandoff({ preservePayload: true })`.

## Keyboard, focus, and accessibility

Tab order is search field → results → destination → title/body editors → attachment rows → approval checkbox → actions. Arrow keys move among duplicate results; Enter selects the focused result. Accessible names include `Search microsoft/vscode issues`, `Select issue 184221`, `Edit publication title`, `Edit publication body`, `Review exact text and all 3 attachments`, and attachment filename plus type and size. Announce result count or `Search failed. Your query and evidence are preserved; retry or edit the query.` The approval button remains disabled until the review checkbox is checked.


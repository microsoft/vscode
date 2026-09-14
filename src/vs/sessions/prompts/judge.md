# Judge implementation attempts

Judge implementation comparison `{{comparisonId}}`.

1. Call `#readAttemptComparison` exactly once with this comparison ID.
2. Review every attempt's code changes and validation evidence. Terminal commands start in the Judge worktree, not an attempt worktree, so explicitly `cd` to the exact `worktree.workingDirectory` from the manifest in every command that inspects or validates an attempt.
3. Run missing targeted tests, build, lint, or diagnostics when needed to make a reliable recommendation.
4. Record whether each validation result came from the attempt report, your own Judge run, or unavailable evidence. When a validation category genuinely does not apply, use `notApplicable` for both its result and source.
5. Explain why the winning attempt is strongest using specific code and validation evidence. For every other attempt, record its strongest reusable points in `notableDifferences`.
6. Identify semantic `decisionSections` where attempts make meaningfully different implementation choices. Give each section a stable ID, short title, description, affected repository-relative files, one concise option per relevant `attemptNumber`, and a recommended `attemptNumber`. Return an empty array when there are no meaningful choices. Do not use raw line numbers as section identity.
7. Do not modify, merge, apply, or delete any attempt.
8. Call `#completeAttemptComparison` with the recommendation and supporting evidence. Refer to attempts only by the `attemptNumber` values returned by `#readAttemptComparison`; do not copy participant or session UUIDs. If it rejects invalid input, correct the reported fields and retry; do not submit again after success.
9. After the tool returns, respond concisely with the winning attempt, specific code and validation evidence for why it won, and the strongest reusable points from every other attempt.

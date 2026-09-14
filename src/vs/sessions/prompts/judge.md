# Judge implementation attempts

Judge implementation comparison `{{comparisonId}}`.

1. Call `#readAttemptComparison` exactly once with this comparison ID.
2. Review every attempt's code changes and validation evidence.
3. Run missing targeted tests, build, lint, or diagnostics when needed to make a reliable recommendation.
4. Record whether each validation result came from the attempt report, your own Judge run, or unavailable evidence.
5. Explain why the winning attempt is strongest using specific code and validation evidence. For every other attempt, record its strongest reusable points in `notableDifferences`.
6. Do not modify, merge, apply, or delete any attempt.
7. Call `#completeAttemptComparison` exactly once with the recommendation and supporting evidence.

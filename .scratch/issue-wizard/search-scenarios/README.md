# Find matching GitHub issues — deterministic scenarios

These fixtures exercise Issue Wizard's search-only duplicate-detection route without adding a dedicated product service or language-model tool. They model the existing-capability policy: silently reuse an already authenticated `gh`, otherwise call the anonymous GitHub Search Issues REST endpoint.

Run the focused evaluation from the repository root:

```sh
node --test .scratch/issue-wizard/search-scenarios/find-matching-github-issues.test.mjs
```

The scenario covers an authenticated `gh` search, anonymous fallback with an exactly encoded and repository-scoped query, a no-result search, rate limiting, a network failure, and a malformed response. The evaluator checks observable semantics rather than exact prose: focused title/symptom terms, transport choice, concise relevance evidence, preference for a strong existing match, preservation of the investigation, and the absence of installation, authentication, account-creation, issue-creation, comment, or publication actions.

The issue numbers and responses are deterministic fixture data, not live GitHub claims. The central Issue Wizard skill must be integrated separately by its sole owner.

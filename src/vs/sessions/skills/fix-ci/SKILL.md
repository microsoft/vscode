---
name: fix-ci
description: Fix the failed CI checks for the current session. Use when the user requests a CI fix via the Fix Checks button in the Changes toolbar.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Fix CI

Please fix the failed CI checks for this session immediately.

Use the failed check information provided with this message, including annotations and check output, to identify the root causes and make the necessary code changes.

## Workflow

1. Read the failed check information attached to this message. It includes a link to the pull request, and for each failed check the check name, status, conclusion, a details URL, and any annotations or output.
2. Use the annotations and output to identify the root cause of each failure (e.g. compile errors, lint/hygiene violations, failing tests).
3. Make the necessary code changes to resolve the failures. Focus on resolving these CI failures and avoid unrelated changes unless they are required to fix the checks.
4. Validate your changes locally where possible (e.g. compile, lint, run the relevant tests) to confirm the failures are addressed.

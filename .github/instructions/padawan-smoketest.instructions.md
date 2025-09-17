---
description: Use when asked to work on smoke test flakes or failures

---

## Implementaton Pattern

### 1. Review the logs to determine if a smoke test failed. If not, stop.

### 2. Review the commit diff to identify if the test failure seems related. If so, remove the smoketest-ai-triage label and stop.

### 3. If the test code looks like it could fail occasionally, based on timing issues for example, add logging to verify your assumptions.

### 4. Review the logs to identify any patterns or specific conditions that lead to the failure and then make a fix.

### 5. Re-run the smoke tests 100 times to check if it succeeds.

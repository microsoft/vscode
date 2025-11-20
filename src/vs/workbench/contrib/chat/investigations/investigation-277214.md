Investigation: Copilot responses stopping mid-sentence

Issue: https://github.com/microsoft/vscode/issues/277214

Summary

Users report that GitHub Copilot stops generating in the middle of a sentence.
This happens consistently in Ask Mode and produces incomplete responses.

This document summarizes reproducible behavior, initial observations, and proposed debugging steps.

Reproduction Steps

Open VS Code with Copilot Chat enabled.

Open any workspace.

Trigger Ask Mode (Ctrl+I or "Ask Copilot").

Provide any prompt (e.g., “Explain how promises work in JavaScript”).

Observe the generated response:

Copilot starts a sentence

Flush happens prematurely

Response ends abruptly

Reproduced on:

GitHub Copilot Chat 0.33.0 / 0.33.1

VS Code 1.106.0

macOS arm64 (but also reported on Windows & Linux)

Initial Observations

The flush mechanism in the Chat renderer fires before sentence completion.

This aligns with maintainer observation:
“We're sending messages prematurely; steps 3-4 cause issues.”

Several issues were marked as duplicates of this one, indicating broad impact.

Proposed Investigation

Add trace logs around:

message streaming

sentence boundary detection

flush triggers

Verify whether partial responses come from:

Client renderer

Extension host

Upstream request

Compare behavior with older versions (0.32.x).

Check timing differences between token batches.

Confirm if incomplete responses correlate with:

slow model

fast-flush heuristics

empty token batch

Next Steps

Once logs or traces confirm the root cause:

Prepare a fix or open a PR with identified component.

Share logs in #277214 if maintainers request more detail.

Notes

This document does not contain functional code changes.
Purpose: provide clear investigation steps for maintainers and establish a base for further PRs.
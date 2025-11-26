---
name: "Chat request failed — 'Sorry, your request failed'"
about: "Report instances where Copilot Chat or preview models fail with 'Sorry, your request failed'. Please attach logs and reproduction steps."
title: "Chat request failed: 'Sorry, your request failed. Please try again.'"
labels: ["bug", "triage"]
assignees: []
---

**Describe the issue**
A clear and concise description of the problem — e.g. requests to Copilot Chat fail with the following message:

> Sorry, your request failed. Please try again. …


**Steps to reproduce**
1. Describe the exact steps you took (commands, UI actions, model used, whether it's a preview model).
2. Include any code or prompt text (if applicable).
3. Note time (UTC) when the failure occurred.


**Expected behavior**
Describe what you expected to happen.


**Actual behavior**
Describe what happened instead, including the exact error message shown.


**Workarounds you already tried**
- Retry the request (🔄).
- Retry the request with a different model.
- Start a new chat (➕).
- Check Copilot Chat output logs: open `Output: Show Output Channels…` (Ctrl+Shift+U), then select `GitHub Copilot Chat` and attach the relevant log excerpt.


**Logs & attachments (required for investigation)**
Please attach or paste the relevant log lines from the `GitHub Copilot Chat` output channel. To collect logs:

- Open the Output panel: `View` → `Output` (or press `Ctrl+Shift+U`).
- From the dropdown at the top-right of the Output panel, select `GitHub Copilot Chat`.
- Reproduce the issue (if possible) and copy the log lines, or attach the output file.

Include any other relevant files or screenshots. If the issue is intermittent, a series of logs showing the failure helps.


**Environment**
- OS (e.g., Linux, macOS, Windows) and version
- VS Code / Codespaces / editor variant and version
- `GitHub Copilot Chat` extension version
- Model used (e.g., `copilot-chat-preview`, `gpt-4o-preview`, etc.)
- Network environment (home/office, VPN/proxy) — if known


**Additional context**
Any other details that might help (rate limits observed, recent changes to settings, corporate network restrictions, proxies, or firewalls).


---

Maintainers: please triage and request additional information if logs or environment details are missing. Continuous monitoring of service reliability is ongoing; user-provided logs are essential for root-cause analysis.

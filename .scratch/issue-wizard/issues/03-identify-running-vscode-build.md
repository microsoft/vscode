# 03 — Identify the running VS Code build with approval

**What to build:** Let the Issue Wizard session securely identify the exact VS Code product the user is running, even when no VS Code command-line launcher is installed or available on PATH.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] A dedicated language-model tool returns only the running product's version, quality, and commit from VS Code-owned product services.
- [ ] The tool works for Stable, Insiders, and Code OSS without invoking code, code-insiders, or another shell launcher.
- [ ] The tool requires normal Agent Host approval before any metadata is returned.
- [ ] Denying approval exposes no metadata and leaves the support conversation able to continue.
- [ ] The tool never returns workspace contents, logs, account details, or unrelated environment data.
- [ ] The Issue Wizard skill requests the metadata only when it is relevant and never attaches it automatically to a public artifact.
- [ ] Contract tests cover approval, denial, supported product qualities, missing values, and the exact minimal response shape.

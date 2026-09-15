# Extension problem demo

This macOS demo gives Issue Wizard a deterministic extension-owned symptom: saving `issue-wizard-extension-symptom.txt` causes **Issue Wizard Known Problem** (`vscode-extension-samples.issue-wizard-known-problem`) to replace its first line. The fixture declares the extension maintainer's repository and issue tracker in its manifest.

## Facilitator setup

Package the transparent JavaScript fixture as a local VSIX, install it into an isolated extensions directory, and launch the macOS VS Code build used for the demo with the matching isolated user-data directory. This setup is performed before handing the window to the demo user. Do not install or sign in to Git, the GitHub CLI, or a GitHub authentication provider in the isolated profile.

From the repository root, the setup helper uses `/usr/bin/zip`, the selected app bundle's own CLI with `--install-extension`, and its macOS executable. It does not use a launcher from `PATH`, Git, authentication, or the network. Pass `/Applications/Visual Studio Code.app` to use Stable instead of Insiders.

```bash
node .scratch/issue-wizard/extension-scenarios/setup-extension-demo.mjs
# Stable:
node .scratch/issue-wizard/extension-scenarios/setup-extension-demo.mjs "/Applications/Visual Studio Code.app"
```

The helper prints the generated profile directory. Remove that directory after closing the isolated window.

The extension activates after startup and listens only for saves of the exact demo filename. To establish the symptom, edit the first line of `issue-wizard-extension-symptom.txt` and save it. The extension replaces that line and shows a warning notification.

## Support scenario

Start Issue Wizard and say:

> Every time I save issue-wizard-extension-symptom.txt, its first line is replaced. I expect saving to preserve my text. It happens every time in this workspace.

The support path should:

1. Narrow the cause to `vscode-extension-samples.issue-wizard-known-problem` without disabling other extensions or requesting a source checkout.
2. Explain that disabling this extension changes workspace extension state, then obtain approval before doing so.
3. Ask the user to restore the first line, save the same document, and report whether it remains unchanged.
4. After the user confirms it remains unchanged, identify the extension as the owner and explicitly avoid a `microsoft/vscode` issue.
5. If a report is useful, show an unpublished, reviewable draft targeting `https://github.com/microsoft/vscode-extension-samples/issues`.

The user-facing route must not invoke Git, the GitHub CLI, authentication, a source checkout, or automatic publication. Those capabilities are intentionally absent from the scenario data.

## Evaluation and reset

Run both deterministic checks:

```bash
node --test .scratch/issue-wizard/extension-scenarios/known-problem-extension/knownProblem.test.cjs
node --test .scratch/issue-wizard/extension-scenarios/resolve-extension-problem.test.mjs
```

The first check proves that the fixture affects only the named demo document. The second evaluates the support outcome rather than an internal reasoning sequence: targeted approval, post-disable user verification, extension ownership, correct issue-tracker handoff, no automatic publication, and no Git or authentication dependency.

To additionally prove that a particular macOS VS Code build accepts the generated VSIX, run the guarded CLI integration check with an explicit app bundle. It uses that bundle's CLI only (no GUI), installs and lists the extension in temporary isolated user-data and extensions directories, and removes them afterward.

```bash
ISSUE_WIZARD_VSCODE_APP_PATH="/Applications/Visual Studio Code - Insiders.app" node --test --test-name-pattern="selected VS Code app CLI" .scratch/issue-wizard/extension-scenarios/resolve-extension-problem.test.mjs
```

Before another run, enable **Issue Wizard Known Problem** for the workspace, restore the sample's original first line, and reload the window if VS Code requests it.

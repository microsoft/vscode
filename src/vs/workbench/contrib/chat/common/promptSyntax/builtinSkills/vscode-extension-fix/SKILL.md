---
name: vscode-extension-fix
description: Create and run a local VS Code extension that provides a safe workaround for a reported problem. Use when Issue Wizard determines that a documented extension API can implement the fix without changing VS Code itself.
---

<!-- Copyright (c) Microsoft Corporation. All rights reserved.
     Licensed under the MIT License. See License.txt in the project root for license information. -->

# VS Code Extension Fix

**Goal:** Generate a dedicated extension project, implement a narrowly scoped fix using supported VS Code APIs, run it in an Extension Development Host, and let the user verify the original problem.

## Before you start

- **Require a concrete handoff:** Retain the actual behavior, expected behavior, relevant evidence, and original acceptance scenario supplied by Issue Wizard. Ask only for missing information that affects the implementation.
- **Use supported APIs:** Confirm that the fix is possible through documented, stable VS Code extension APIs. Do not use private APIs, patch product files, monkey-patch VS Code internals, depend on undocumented commands, or enable proposed APIs for a user-facing workaround.
- **Choose the right path:** If a supported extension cannot provide the required behavior, stop before generating a project and return the evidence to Issue Wizard with a recommendation to file an issue or try a VS Code source fix.
- **Protect the user's environment:** Generate the extension in a new dedicated folder. Do not add it to the user's project, an existing extension, or a VS Code source checkout unless the user explicitly chooses that location.
- **Keep publication gated:** Do not install the extension into the user's normal profile, package or publish it, initialize or push a Git repository, or create a marketplace publisher without explicit approval.
- **Ask interactively:** Use `ask_user` for missing information and decisions, one question at a time. If interactive questions are unavailable, report the pending decision and stop rather than assuming approval.

## Step 1: Confirm the extension design

1. Restate the behavior the extension will provide and the public VS Code API that makes it feasible.
2. Define the smallest activation scope and permissions needed. Avoid broad activation events, unnecessary workspace reads, external services, telemetry, and persistent state.
3. Preserve normal VS Code behavior when the workaround does not apply, when required capabilities are unavailable, or when the extension is disabled.
4. Record the original acceptance scenario and any neighboring behavior that must remain unchanged.

If the design would require unsupported behavior, do not scaffold a placeholder extension. Return to Issue Wizard with the exact missing API or product change.

## Step 2: Select a destination and check prerequisites

1. Ask the user where to create the extension if no destination was supplied. Default to a new folder outside the affected workspace and any VS Code source checkout.
2. Derive a short extension display name and identifier from the confirmed fix. Show both before generation, and ask only when naming cannot be inferred safely.
3. Resolve the absolute destination and verify that it does not already contain files. Never overwrite or merge into an existing folder without explicit approval.
4. Check for compatible versions of Node.js and npm using `node --version` and `npm --version`.
5. Check whether the official Yeoman generator and `generator-code` are already available. If required tools are missing, explain what will be downloaded and obtain approval before installing system tools or fetching npm packages.

Stop and report any prerequisite or destination conflict before continuing.

## Step 3: Generate the extension

1. Use the official [VS Code Extension Generator](https://code.visualstudio.com/api/get-started/your-first-extension) rather than creating the initial project structure by hand.
2. Generate a TypeScript extension with npm in the confirmed empty destination. Prefer the generator's standard defaults unless the fix requires a different supported option.
3. If invoking the generator non-interactively, inspect its current help first and use only supported options. Do not guess flags from an older generator version.
4. Do not initialize Git unless the user requested it. Do not create a publisher or marketplace configuration.
5. Verify that generation completed successfully and inspect the generated `package.json`, TypeScript entry point, build scripts, test setup, and `.vscode/launch.json` before editing.
6. Record the extension root, generated identifier, installed dependency versions, and launch configuration.

If generation fails, surface the generator error and repair or retry the failed step. Do not replace a failed official generation with an untracked hand-written scaffold.

## Step 4: Implement the fix

1. Read the generated project instructions and the current VS Code extension API documentation for the APIs being used.
2. Remove generated sample behavior that is unrelated to the fix.
3. Implement the smallest supported workaround:
   - Use precise activation events and contribution points.
   - Operate on the resource or editor supplied to the action instead of assuming the active editor.
   - Register every command, listener, provider, and other disposable in the extension context.
   - Externalize user-visible messages through the extension's established localization setup when localization is present.
   - Surface unexpected failures through an appropriate user-visible error or output channel; do not silently claim success.
4. Add focused tests for logic that can be exercised without the Extension Development Host. Preserve generated test and build conventions.
5. Update the generated README with the problem the extension addresses, how to exercise the fix, limitations, required VS Code version, and how to disable or remove the workaround.

Do not collect user content or add telemetry for this local fix. Do not broaden workspace trust or command/link execution privileges.

## Step 5: Build and validate

1. Install only the dependencies declared by the generated project, using its selected package manager and lockfile.
2. Run the smallest generated compile, lint, and test commands that cover the change. Resolve failures introduced by the implementation.
3. Inspect the extension manifest and final project diff for unnecessary permissions, broad activation, sample code, debug probes, secrets, machine-specific paths, and unrelated generated files.
4. Record the checks that passed and any validation gap. Do not treat compilation alone as proof that the user-visible fix works.

## Step 6: Run the extension

1. Use the generated **Run Extension** launch configuration to start a new Extension Development Host from the extension root. If launch-configuration automation is unavailable, use the installed VS Code CLI with `--extensionDevelopmentPath` and the confirmed reproduction workspace.
2. Keep the development host separate from the VS Code window hosting this conversation. Do not reload or terminate unrelated windows.
3. Record enough process or window identity to interact with the same development host throughout verification.
4. Verify that the development host is responsive and that the generated extension loads without activation errors. Surface errors from the extension host log or debug console.
5. Reproduce the original acceptance scenario in that development host and check the relevant neighboring behavior before asking for the user's verdict.

If the extension changes code after launch, rebuild it and restart or reload only the tracked Extension Development Host before verification.

## Step 7: Ask the user to verify

Summarize the implemented workaround and checks that actually ran. Identify the extension root and the Extension Development Host, then provide the original reproduction steps and expected result.

Use `ask_user` to ask whether the workaround fixes the problem in that development host. Offer these choices:

- **Yes, the extension fixes the problem**
- **No, the problem is still present**
- **I cannot verify yet**

Handle the answer explicitly:

- **Fixed:** Keep the generated project local and ask separately whether the user wants help packaging and installing it into their normal VS Code profile.
- **Still present:** Gather the observed behavior, return to Step 4 in the same project, then rebuild, relaunch, and ask again.
- **Cannot verify or no answer:** Pause with verification pending and provide the extension root, launch instructions, and acceptance scenario for resuming.

Confirmation applies only to the implementation the user tested. After any functional change, rebuild, relaunch, and obtain fresh confirmation.

## Step 8: Optional local installation

Proceed only after the user confirms the workaround and explicitly asks to install it.

1. Use the official VS Code extension packaging tool. If it is not already available, explain the npm package that will be downloaded and obtain approval first.
2. Inspect the package contents before installation. Exclude source maps, test fixtures, logs, credentials, machine-specific files, and unrelated workspace content.
3. Package a VSIX without publishing it, then show its path and version.
4. Obtain approval before installing the VSIX into a named VS Code profile. Do not uninstall or replace unrelated extensions.
5. Reload or restart that profile as required and ask the user to repeat the acceptance scenario.

Do not publish the extension to the Marketplace or a repository unless the user makes a separate explicit request.

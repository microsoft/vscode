---
name: vscode-extension-fix
description: Create and run a local VS Code extension that provides a safe workaround for a reported problem. Use when Issue Wizard determines that a documented extension API can implement the fix without changing VS Code itself.
---

<!-- Copyright (c) Microsoft Corporation. All rights reserved.
     Licensed under the MIT License. See License.txt in the project root for license information. -->

# VS Code Extension Fix

**Goal:** Generate a dedicated extension project, implement a narrowly scoped fix using supported VS Code APIs, run it in an Extension Development Host, and let the user verify the original problem. Then offer local installation or guided Visual Studio Marketplace publication.

## Before you start

- **Require a concrete handoff:** Retain the actual behavior, expected behavior, relevant evidence, and original acceptance scenario supplied by Issue Wizard. Ask only for missing information that affects the implementation.
- **Use supported APIs:** Confirm that the fix is possible through documented, stable VS Code extension APIs. Do not use private APIs, patch product files, monkey-patch VS Code internals, depend on undocumented commands, or enable proposed APIs for a user-facing workaround.
- **Choose the right path:** If a supported extension cannot provide the required behavior, stop before generating a project and return the evidence to Issue Wizard with a recommendation to file an issue or try a VS Code source fix.
- **Protect the user's environment:** Generate the extension in a new dedicated folder. Do not add it to the user's project, an existing extension, or a VS Code source checkout unless the user explicitly chooses that location.
- **Keep distribution gated:** Verification alone does not authorize installation or publication. Obtain approval for packaging, profile installation, publisher creation, and public upload in the distribution steps below. Publishing an extension does not authorize initializing or pushing a Git repository.
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

- **Fixed:** Proceed to Step 8 to ask whether the user wants local installation or Marketplace publication.
- **Still present:** Gather the observed behavior, return to Step 4 in the same project, then rebuild, relaunch, and ask again.
- **Cannot verify or no answer:** Pause with verification pending and provide the extension root, launch instructions, and acceptance scenario for resuming.

Confirmation applies only to the implementation the user tested. After any functional change, rebuild, relaunch, and obtain fresh confirmation.

## Step 8: Choose installation or publication

After the user confirms the workaround, use `ask_user` to ask whether they want to install the extension locally or publish it to the Visual Studio Marketplace. Explain that local installation affects only the selected VS Code profile without uploading the package, while Marketplace publication makes the extension and its packaged files publicly available. Selecting either path authorizes preparing a local VSIX, not creating accounts or uploading it.

Offer these choices:

- **Install locally**
- **Publish to the Visual Studio Marketplace**
- **Keep development-only**

Handle the answer explicitly:

- **Install locally:** Follow Step 9. Do not require a Marketplace account or publisher.
- **Publish:** Guide the user through Step 10, one step at a time. Do not treat this choice as final upload approval.
- **Keep development-only or no answer:** Keep the project local, provide its location and launch instructions, and stop without packaging, installing, or publishing.

### Prepare the approved VSIX

Use this shared procedure from Step 9 or Step 10 after the manifest is ready for that path.

1. Use the official `@vscode/vsce` packaging tool. Reuse an existing installation; if it is missing, explain the package that will be downloaded and obtain approval first.
2. Inspect the files selected by `vsce ls` and adjust `.vscodeignore` as needed. Exclude source maps, test fixtures, logs, credentials, machine-specific files, and unrelated workspace content. Keep required runtime code, dependencies, assets, and license notices.
3. Run the relevant build and checks, then `vsce package` using the approved installation. Do not bypass packaging errors or use publishing commands to produce a local package.
4. Inspect the resulting archive and record its absolute path, full extension identifier, and version. If packaging or its build hooks change the tested implementation, repeat Steps 5-7 before continuing.

## Step 9: Install locally

1. Prepare the VSIX using the shared procedure above.
2. Identify the user's intended VS Code installation and profile. Show the VSIX path, extension identifier, version, and target profile, then obtain approval before installation.
3. In that profile, use **Extensions: Install from VSIX...** and select the reviewed package, or use the installed VS Code CLI targeting the same profile. Do not uninstall or replace unrelated extensions.
4. Reload or restart that profile as required. Verify that the packaged extension, rather than the development copy, is active and ask the user to repeat the acceptance scenario.
5. Report the installed identifier and version, the retained project and VSIX paths, and how to disable or uninstall the extension. Stop without proceeding to Marketplace publication.

## Step 10: Guide Marketplace publication

Guide the user through these steps interactively instead of handing them a checklist and stopping. Follow the current [Publishing Extensions guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension). Prefer the browser upload flow for this one-off release; it does not require the user to give the agent a publishing token or set up CI.

1. **Select or create a publisher.**
   - Direct the user to the [Marketplace publisher management page](https://marketplace.visualstudio.com/manage) and have them sign in themselves with their Microsoft account.
   - Ask which existing publisher they are authorized to use. If they need a new one, obtain approval, then guide them through **Create publisher**, choosing its unique **ID** and display **Name**, and completing any required verification. Explain that the publisher ID cannot be changed after creation.
   - Record the confirmed publisher ID. Never ask for passwords or access tokens in chat, or put credentials in commands, logs, or project files.
2. **Prepare the public listing.**
   - Set `package.json`'s `publisher` to the confirmed ID. Review `name`, `displayName`, `description`, `version`, and `engines.vscode`; confirm the resulting `<publisher>.<name>` identifier with the user.
   - Prepare the README, changelog, license, and any listing images or links. Describe the workaround and its limitations honestly. Ask the user to choose a license if one has not been established; do not invent a repository URL or claim Microsoft endorsement.
   - Include only code and assets the user is authorized to distribute. Remove private reproduction details, screenshots, paths, and other sensitive content from the listing and package.
3. **Package and verify the release.**
   - Use the shared VSIX procedure after the publishing metadata is finalized. For an existing listing, use a new version rather than overwriting a published version or changing the identifier to create a duplicate.
   - Obtain approval to install the exact VSIX into a separate test profile, without the development copy active. Repeat the acceptance scenario and obtain the user's confirmation that the packaged extension works. Resolve failures before continuing.
4. **Obtain final publication approval.**
   - Show the publisher, full extension identifier, version, exact VSIX path, reviewed package contents, and public listing text and assets together.
   - Use `ask_user` to obtain explicit approval to upload this package publicly. Earlier verification and the choice to prepare a Marketplace release are not upload approval. If the package or listing changes afterward, review it and obtain fresh approval.
5. **Guide the upload.**
   - After approval, have the user select the confirmed publisher on the management page, choose **New extension > Visual Studio Code**, select the reviewed VSIX, and complete the upload.
   - If updating an existing extension, use that listing's update action instead. Never upload to another publisher or create a duplicate listing as a fallback.
6. **Verify the result.**
   - Check the management page's processing or validation result. If validation is pending or fails, report that state rather than claiming the extension is published.
   - Once available, verify the public listing at `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>` and confirm its identifier and version. Report the listing URL and retain the project and VSIX for future updates.
   - If an upload's outcome is unclear, check the existing listing before retrying. Preserve the local work and report any account, permission, or validation blocker.

Marketplace publication does not automatically install the extension into the user's normal profile. Offer that separately if desired; do not create or push a repository as part of this flow.

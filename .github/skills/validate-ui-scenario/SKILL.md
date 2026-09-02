---
name: validate-ui-scenario
description: Use when reproducing a UI bug or verifying a fix by driving a real VS Code window end to end and capturing evidence. Writes a scenario file, runs it against a dev build or installed Insiders, and produces a captioned video, per-step screenshots, a Playwright trace, and an HTML report to attach to an issue or pull request.
---

# Validate UI Scenario

Drives a real VS Code instance through a scenario and records reproducible evidence.

Use this to reproduce a reported bug, to show that a fix works, or to attach a recording to a
test-plan item. For deterministic regression coverage that runs on every build, write a smoke test
instead (see the `smoke-tests` skill) — this skill is for one-off, issue-derived validation.

A scenario is a small JavaScript file run by `test/scenario/out/runScenario.js`. Nothing else has to be
configured: the runner launches VS Code, records video and a trace, captures a screenshot at every
step boundary, writes the report, and captions the recording with each step and its result.

## Prepare

```bash
npm install                             # once
npm --prefix test/scenario run compile  # after any change under test/scenario
```

**Check `ffmpeg` and `ffprobe` are available before running.** The runner looks on `PATH` and in the
usual install locations, so an ffmpeg installed after the editor started is still found. Without them
the scenario still runs and keeps the raw recording, but the video is not captioned with step titles.
The runner warns at startup; if they are missing, tell the user how to install them rather than
silently returning an unannotated video:

| Platform | Install |
|----------|---------|
| Windows | `winget install Gyan.FFmpeg` |
| macOS | `brew install ffmpeg` |
| Linux | `sudo apt install ffmpeg` |

A new terminal may be needed for `PATH` to pick them up, or set `FFMPEG_PATH` and `FFPROBE_PATH`. An
existing run can be annotated afterwards with
`node test/scenario/out/renderEvidenceChapters.js <run-dir>`.

| Target | Flags | Also required | Use for |
|--------|-------|---------------|---------|
| Installed Insiders, else Stable | *(none — the default)* | nothing | Reproducing a report against shipped behavior |
| Dev build from this checkout | `--dev` | `npm run electron`, `npm run transpile-client` | Verifying an unmerged change |
| A specific install | `--build <app-root>` | nothing | Pinning an exact build |
| Web | `--web --headless` | `npm run transpile-client` | Browser-only behavior |

With no target flag the runner finds an installed VS Code Insiders (falling back to Stable) and logs
which one it chose. `--build` takes the application root — the install directory on Windows and
Linux, or the `.app` bundle on macOS:

```bash
# Windows
--build "C:/Users/<you>/AppData/Local/Programs/Microsoft VS Code Insiders"
# macOS
--build "/Applications/Visual Studio Code - Insiders.app"
```

Every target runs with its own profile and extensions directory, so your extensions and settings
never leak into the recording, and the window is sized to the recording canvas so the capture has no
empty margins. The evidence records the quality of the build that actually ran (`Insiders`,
`Stable`, `Dev`), so a report always names the product it validated. An installed build only
reproduces **shipped** behavior — to validate an unmerged change, use `--dev` in a checkout that
contains it.

## Write the scenario

Save the file next to the run it produces, for example
`.build/vscode-playwright-mcp/<issue>.cjs`. The **`.cjs`** extension matters: this package is an
ES module package, so a CommonJS scenario named `.js` fails to load. An ES module scenario with a
default export works too.

```js
const os = require('os');
const path = require('path');
const fs = require('fs');

const workspacePath = path.join(os.tmpdir(), 'issue-250159-workspace');
fs.mkdirSync(workspacePath, { recursive: true });

// The settings tree is virtualized, so only the rows near the viewport exist in
// the DOM. Scroll the whole list, otherwise "the setting is absent" cannot be
// told apart from "the setting is below the fold".
const COLLECT_TITLES = `(async () => {
	const editor = document.querySelector('.settings-editor');
	const scrollable = editor.querySelector('.settings-tree-container .monaco-scrollable-element');
	const titles = new Set();
	const collect = () => editor.querySelectorAll('.setting-item-label')
		.forEach(node => titles.add(node.textContent.trim()));
	collect();
	for (let previous = -1; scrollable && scrollable.scrollTop !== previous;) {
		previous = scrollable.scrollTop;
		scrollable.scrollTop = previous + scrollable.clientHeight;
		await new Promise(resolve => setTimeout(resolve, 180));
		collect();
	}
	return [...titles];
})()`;

module.exports = {
	id: 'vscode-250159-settings-search',
	title: 'Settings search matches across title and description',
	source: 'https://github.com/microsoft/vscode/issues/250159',
	workspacePath,
	steps: [
		{
			id: 'SS-01',
			title: 'Open the Settings editor',
			async run(context) {
				await context.workbench.quickaccess.runCommand('workbench.action.openSettings2');
				await context.page.waitForSelector('.settings-editor', { state: 'visible', timeout: 20000 });
				return 'The Settings editor is visible.';
			}
		},
		{
			id: 'SS-02',
			title: 'Search across title and description',
			async run(context) {
				await context.workbench.settingsEditor.searchSettingsUI('chat confirm');
				const titles = await context.page.evaluate(COLLECT_TITLES);
				if (!titles.some(title => /max\s*requests/iu.test(title))) {
					throw new Error(`Max Requests is absent. Found: ${titles.join(', ')}`);
				}
				return 'Max Requests is present in the results.';
			}
		}
	]
};
```

| Field | Meaning |
|-------|---------|
| `id`, `title` | Identify the run; `id` names the evidence directory |
| `source` | Issue or test-plan item the scenario came from |
| `workspacePath` | Disposable folder to open |
| `userSettings` | Settings seeded into the profile before launch |
| `extraArgs` | Extra VS Code command-line arguments |
| `stepPauseMs` | How long to hold each finished step so its caption is readable. Defaults to `1000`; set `0` when the scenario is timing-sensitive |

Each step receives a `context` with `app`, `workbench`, `code`, `page`, and `skip(reason, options)`.
`workbench` exposes the feature helpers (`settingsEditor`, `quickaccess`, `editors`, `terminal`,
`chat`, …); `page` is the Playwright page for anything they do not cover.

- **Return a string** describing how the step was validated. It appears in the report.
- **Throw** to fail the step. The message is recorded, and the run stops.
- **Call `skip(reason, { needs })`** when the step cannot be validated automatically. The run stops
  and is reported as `aborted`, never as passed.

## Steps that cannot be automated

Decide this while planning, before writing the scenario, and classify each one — the two kinds have
different consequences:

| `needs` | Meaning | What to do |
|---------|---------|------------|
| `human` | A person is required: physical hardware, a subjective judgement, a sign-in that cannot be scripted | Report the step so someone can check it by hand |
| `infrastructure` | Automatable in principle, but the harness cannot do it yet | Report it as an **enhancement to this skill**, naming the missing capability |

```js
ctx.skip('Comparing physical print output requires a person with a printer.', { needs: 'human' });
ctx.skip('The harness cannot drive native OS file dialogs.', { needs: 'infrastructure' });
```

Blocked steps are recorded in `manifest.json`, highlighted in a **Needs attention** section of
`report.html`, marked on the video caption (`SKIPPED - NEEDS HUMAN`), and printed at the end of the
run. Surface them in your summary — never quietly drop a step you could not perform, and never
weaken an assertion so that it passes.

## Run it

```bash
node test/scenario/out/runScenario.js <scenario.cjs>
```

Exit code `0` means every step passed, `1` means the run failed or was aborted, `2` a usage error.

Evidence is written to `.build/vscode-playwright-mcp/evidence/<run-id>/`:

| File | Contents |
|------|----------|
| `report.html` | Step table, outcome, embedded video |
| `manifest.json` | Step timestamps, statuses, artifact paths, environment |
| `videos/annotated.mp4` | Recording with a caption band showing each step and its validation result |
| `videos/*.webm` | The raw recording |
| `*.png` | Per-step screenshots |
| `logs/` | Playwright trace, window and server logs |

The caption band is added **above** the recorded frame rather than drawn over it, so no recorded
pixel is hidden and the recording keeps its original length. Each caption carries the step number
and id, its status, the step title, and the validation detail the step reported. Re-render after
editing a manifest with `node test/scenario/out/renderEvidenceChapters.js <run-dir>`.

## What makes evidence trustworthy

- Assert on DOM state, accessibility, focus, or text — screenshots support a claim, they do not
  establish one.
- Validate through a signal separate from the action. An automation call returning successfully is
  not a result.
- Beware virtualized lists. The settings tree and long lists render only the rows near the viewport,
  so scroll the whole list before concluding that something is absent.
- If the bug is a race, make the timing explicit — a forced delay or a repeated loop — so the
  recording shows the window in which it occurs rather than relying on luck.
- Record the failing behavior before the fix when you can. A passing run alone does not show that
  the scenario would have caught the bug.

## Report back

Summarize the outcome, list failed or skipped steps, link `report.html`, and state the OS, the
VS Code version and quality (both are in `manifest.json`), and the source issue. Attach the video to
the issue or pull request by dragging it into the comment box.

Always call out, separately from the pass/fail result:

- **steps that need a person**, so someone knows what is still unverified;
- **steps blocked on a missing harness capability**, named as a concrete enhancement to this skill;
- **anything that degraded the evidence**, such as a missing ffmpeg leaving the video uncaptioned.

## Related

- **Interactive exploration.** `test/mcp` also serves these tools over MCP (`vscode_automation_*`),
  which helps when you need to inspect the UI before knowing what to assert. Configure it as an MCP
  server with `cwd` `test/mcp` and command `npm run start-stdio`.
- **Automated validation on a pull request.** `microsoft/vscode-engineering` runs the same harness
  in CI: labelling a pull request `~requires-ui-validation` researches the change, runs a scenario
  against the exact merge candidate, and posts the per-step result with captioned video. Use this
  skill when a scenario is not yet covered there, or to iterate locally before proposing one.

<example>
User: "/validate-ui-scenario reproduce https://github.com/microsoft/vscode/issues/250159"

1. Confirm `ffmpeg`/`ffprobe` are available; if not, say so and give the install command before
   running, so the user is not surprised by a video without step titles.
2. Read the issue and identify the observable claim: searching `chat confirm` in the Settings editor
   should match **Max Requests**, whose description mentions confirmation.
3. Add a baseline step (`max requests` finds the setting) so a failure cannot be explained by the
   setting being missing from the build.
4. Write `.build/vscode-playwright-mcp/issue-250159.cjs` and run it with no target flag, which uses
   the installed Insiders; read the printed report path.
5. Report the outcome per step, link `report.html`, and attach `videos/annotated.mp4`.

The run fails at the search step, and that is the answer: the issue reproduces. Report it as a
successful reproduction, not as a broken scenario.
</example>

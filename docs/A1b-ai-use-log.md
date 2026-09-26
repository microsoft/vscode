# AI Use Log — A1b: Requirements and Use Cases

**Project:** Visual Studio Code repository

**Assignment:** Requirements and Use Cases

**AI assistance used:** Codex

## What I asked the AI to do

I asked the AI to prepare a requirements-and-use-cases submission for this repository, including FURPS+ requirements with evidence, actors, brief and fully-dressed use cases, a PlantUML use-case diagram source, and this log.

## What the AI produced

The AI proposed three user-goal use cases: **Search Workspace**, **Start Debug Session**, and **Commit Source Changes**. It drafted requirement statements, actors, main success scenarios, extensions, and a PlantUML diagram.

## What I checked against the code

I verified the generated content against the following implementation and test evidence:

- `src/vs/workbench/contrib/search/browser/searchView.ts`: query validation, query construction, result presentation, ARIA status, and cancellation when a new query starts.
- `src/vs/workbench/contrib/search/browser/searchTreeModel/searchModel.ts`: cancellation tokens, streaming result handling, and search timing telemetry.
- `src/vs/workbench/contrib/search/browser/search.common.contribution.ts` and `src/vs/workbench/contrib/search/test/browser/searchConfiguration.test.ts`: documented/default search settings and configuration tests.
- `src/vs/workbench/services/search/test/node/fileSearch.test.ts`: cancellation kills a spawned search process and missing ripgrep spawn errors are handled.
- `src/vs/workbench/contrib/debug/browser/debugCommands.ts` and `src/vs/workbench/contrib/debug/browser/debugService.ts`: the Start Debugging command, workspace-trust check, extension activation, save-before-start, configuration resolution, session creation, and error path.
- `extensions/git/src/commands.ts`, `extensions/git/src/repository.ts`, and `extensions/git/src/git.ts`: Source Control commit input, smart-commit choices, staging, Git commit execution, and post-commit cleanup.

## Changes after checking

I retained only behavior represented by those files. In particular, the use cases do not claim that VS Code pushes to a remote, authenticates a user, creates a pull request, or guarantees a Git commit will succeed; those are plausible Git features but are not part of the modeled success scenarios here.

## Second code-only audit (2026-09-18)

I rechecked every requirement, actor statement, brief use case, main-success step, extension, and special requirement against the named source/tests. I made these corrections after the audit:

- The Search Workspace success guarantee now says results are subject to the configured maximum-results limit. `SearchView.onSearchComplete` explicitly warns that a `limitHit` result is only a subset of all matches.
- Start Debug Session now says the debugger may **launch or attach**, because `DebugService.launchOrAttachToSession` supports both configuration requests. It no longer claims that every session starts a new program.
- The Git failure extension now describes the direct implementation: `Repository.run` updates the repository model on an error and rethrows it; `commitOperationCleanup` is reached only after `repository.commit` succeeds. It no longer makes an unsupported promise about a particular error-reporting UI.
- The Supportability requirement no longer says every search setting is resource-scoped; only `search.useIgnoreFiles` is explicitly registered with `ConfigurationScope.RESOURCE`. The new-branch extension now includes its required protected-branch condition.
- I confirmed result navigation from the Search view’s accessibility help: pressing Enter on a result shows the match in the editor. I confirmed debug session creation, model registration, launch/attach, and the new-session event in `DebugService.doCreateSession`. I confirmed that `CommandCenter.stage` calls `repository.add`, `Repository.commit` calls the Git wrapper’s commit operation, and its `run` wrapper refreshes model state after both success and failure.

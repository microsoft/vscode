# Planning Middleware Checkpoint

Date: 2026-04-18

Repository: `C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode`

Branch: `planning-dynamic-controls`

Underlying committed HEAD before this checkpoint work: `f0ed8a2148ff18ad3d1c2207da541e900adca9e1`

Status: this markdown documents the current planning-mode checkpoint that is intended to be kept as a real restore point in Git history.

## What is working at this checkpoint

- Planning mode uses dynamic pre-planning middleware, but Goal Clarity now renders with the regular ask-questions carousel design instead of the heavier middleware chrome.
- Goal Clarity is the only question phase before the first plan is built.
- The first planning request is sent immediately after Goal Clarity answers are captured and narrowed into planning context.
- Task Decomposition is now fully decoupled from Goal Clarity and appears only after the first plan completes.
- After Task Decomposition answers are captured, the plan is rebuilt with the refined planning context.
- After the rebuilt plan completes, an optional Plan Focus prompt appears. If the user names a specific aspect to zoom in on, a new dynamic control set is generated for that focus area and a further refinement request is sent.
- User-facing copy is intentionally lightweight. The UI explains what the step is for, but does not expose internal readiness scoring or confidence jargon.
- Goal Clarity and Task Decomposition widgets are more scrollable and readable. Taller containers and larger scroll regions make long forms and explanations usable without clipping.
- Planning context narrows between stages. Newer repo context replaces stale broad context rather than unioning everything forever.
- Context awareness is richer than the original checkpoint:
  - active file and selection
  - recent planning conversation
  - prior planning answers
  - inferred or confirmed planning target
  - workspace folders
  - workspace top-level entries
  - working-set files from open editors
  - active document symbols
  - workspace symbol matches
  - nearby files
  - relevant snippets
- Context narrowing now works better for file-centric requests, including data files such as `.csv` and `.tsv`, not just source-code files.
- Filenames mentioned in answers, such as `orders.csv`, `customers.csv`, or `schema.json`, can become explicit narrowing queries for later planning stages.
- Planning readiness now decides how many questions to ask dynamically instead of always forcing a fixed count.
- A new `plan-focus` stage exists in the planning stage model and question generator.

## Current expected planning flow

1. User switches to `Plan` or `Planner`.
2. User submits the first planning request.
3. The request is shown in the transcript immediately.
4. A lightweight captured/pre-planning turn appears immediately.
5. Repository and planning context are collected in the background.
6. Goal Clarity questions appear.
7. User answers Goal Clarity.
8. Goal Clarity answers are merged into planning context, and repo context is recollected with the narrowed answers.
9. The first planning request is sent to the planning agent with the merged planning context attached.
10. The first plan completes.
11. Task Decomposition questions appear.
12. User answers Task Decomposition.
13. Task Decomposition answers are merged into planning context, and repo context is recollected again for the narrowed plan slice.
14. The planning request is rebuilt and sent again with the refined planning context attached.
15. The rebuilt plan completes.
16. An optional Plan Focus prompt appears.
17. If the user leaves it blank or skips it, the flow stops and the rebuilt plan remains as-is.
18. If the user names a focus area, dynamic Plan Focus controls are generated.
19. User answers the Plan Focus controls.
20. The planning request is rebuilt again with the focused planning context attached.

## Main files touched for this checkpoint

- `PLANNING_MIDDLEWARE_CHECKPOINT.md`
- `src/vs/workbench/contrib/chat/browser/planning/chatPlanningContextCollector.ts`
- `src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts`
- `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.ts`
- `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/media/chatQuestionCarousel.css`
- `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`
- `src/vs/workbench/contrib/chat/common/planning/chatPlanningReadiness.ts`
- `src/vs/workbench/contrib/chat/common/planning/chatPlanningTransition.ts`
- `src/vs/workbench/contrib/chat/test/browser/planning/chatPlanningQuestionGenerator.test.ts`
- `src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatQuestionCarouselPart.test.ts`
- `src/vs/workbench/contrib/chat/test/common/planning/chatPlanningReadiness.test.ts`
- `src/vs/workbench/contrib/chat/test/common/planning/chatPlanningTransition.test.ts`

## Core implementation notes

### Goal Clarity

- Goal Clarity still uses dynamic middleware question generation.
- Goal Clarity now piggy-backs on the ask-questions carousel component and standard chrome rather than the heavier middleware visual treatment.
- Goal Clarity is the only question phase before the first plan is created.
- The number of Goal Clarity questions is dynamic and depends on request specificity and planning readiness.

### Task Decomposition

- Task Decomposition no longer runs before the first plan.
- It now runs only after the first plan response completes.
- It uses the settled Goal Clarity answers plus the narrowed repo context from the first phase.
- It is still visually marked as a refinement/middleware step rather than a plain ask-questions step.

### Plan Focus

- Plan Focus is a new post-rebuild phase.
- It begins with a lightweight optional prompt asking the user whether there is one specific aspect of the revised plan they want to sharpen.
- If the user provides a focus area, a new dynamic question set is generated for that aspect.
- If the user skips it or leaves it blank, no extra rebuild is triggered.

### Repo and context narrowing

- Planning context is refreshed between stages instead of staying frozen at the broad initial context.
- Narrowed repo signals from the latest stage replace older broad signals for:
  - focus queries
  - working-set files
  - active document symbols
  - workspace symbol matches
  - nearby files
  - relevant snippets
- This makes later stages better at staying anchored to the exact file, directory, or related-file slice the user clarified.

### Scroll and readability behavior

- The carousel container height budget is larger for planning stages.
- The input area is allowed to take more of the flex height and scroll independently.
- The carousel-level explanation message can also scroll with a larger height budget.

## Validation used for this checkpoint

Typecheck:

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
cmd /c npm run compile-check-ts-native
```

Transpile `src -> out`:

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
cmd /c npm run transpile-client
```

Selfhost launch:

```cmd
cd /d "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
set VSCODE_SKIP_PRELAUNCH=1 && scripts\code.bat
```

## Known local validation issues

- The renderer/unit test harness is currently blocked by an unrelated `@parcel/watcher` module-resolution issue in this local environment.
- Some local test/build flows can also fail because of Windows or OneDrive file locks under `.build` or generated extension output.
- Those issues are environmental and were not introduced by the planning middleware changes documented here.

## How to restore this checkpoint later

Preferred restore path:

1. Check out branch `planning-dynamic-controls`.
2. Find the checkpoint commit in history.
3. Check out that commit directly or branch from it.

Useful commands:

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
git checkout planning-dynamic-controls
git log --oneline --decorate --grep "checkpoint planning middleware"
```

Then restore by commit:

```powershell
git checkout <checkpoint-commit-sha>
```

Or create a recovery branch from it:

```powershell
git checkout -b restore-planning-checkpoint <checkpoint-commit-sha>
```

## Short reminder for future debugging

- If Goal Clarity starts showing middleware chrome again instead of ask-questions styling, inspect `chatQuestionCarouselPart.ts` and `chatQuestionCarousel.css`.
- If Task Decomposition starts appearing before the first plan finishes, inspect `chatWidget.ts`.
- If the optional Plan Focus pass disappears or triggers at the wrong time, inspect `chatWidget.ts` and `chatPlanningQuestionGenerator.ts`.
- If later planning stages stop narrowing around related files such as CSVs or sibling files, inspect `chatPlanningContextCollector.ts` and `chatPlanningTransition.ts`.

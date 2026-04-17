# Planning Middleware Checkpoint

Date: 2026-04-17

Repository: `C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode`

Branch: `main`

Underlying committed HEAD before these working-tree changes: `6a12c4553b4fa16d6ff344682b3bdca0ce0fcbf2`

Status: this is a documented working-tree checkpoint. The behavior below exists in the current local checkout, but it is not yet protected by a commit or tag.

## What is working at this checkpoint

- Planning mode uses explicit pre-planning middleware before the planning agent receives the real request.
- The first planning submit appears in chat immediately.
- A lightweight pre-planning transcript turn with spinner-style copy appears immediately with that first submit.
- Goal Clarity runs first.
- Task Decomposition runs second.
- The real planning request is sent only after both middleware stages complete.
- Goal Clarity and Task Decomposition are intentionally separated.
- Task Decomposition receives the settled Goal Clarity answers and filters out overlapping goal, scope, non-goal, and definition-of-done questions.
- Each middleware stage now guarantees at least 3 questions. If model output is too thin or overlap filtering removes too much, stage-appropriate fallback questions are added.
- Planning question generation uses richer context: active file, selection, broader recent conversation, planner notes, workspace symbols, nearby files, and snippets.
- Context narrows by stage and phase so later questions are more concrete and implementation-facing.
- Middleware UI is lighter than the main planning response and is visually treated as a pre-planning checkpoint rather than the planner itself.

## Main files touched for this checkpoint

- `build/lib/tsgo.ts`
- `build/npm/preinstall.ts`
- `build/package-lock.json`
- `src/vs/base/browser/performance.ts`
- `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts`
- `src/vs/workbench/contrib/chat/browser/chat.ts`
- `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupController.ts`
- `src/vs/workbench/contrib/chat/browser/planning/chatPlanningContextCollector.ts`
- `src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts`
- `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.ts`
- `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/media/chatQuestionCarousel.css`
- `src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts`
- `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`
- `src/vs/workbench/contrib/chat/common/planning/chatPlanningQuestionHeuristics.ts`
- `src/vs/workbench/contrib/chat/common/planning/chatPlanningTransition.ts`
- `src/vs/workbench/contrib/chat/test/browser/planning/chatPlanningQuestionGenerator.test.ts`
- `src/vs/workbench/contrib/chat/test/common/planning/chatPlanningQuestionHeuristics.test.ts`
- `src/vs/workbench/contrib/chat/test/common/planning/chatPlanningTransition.test.ts`

## Current expected planning flow

1. User switches to `Plan` or `Planner`.
2. User submits the first planning request.
3. The request is shown in the transcript immediately.
4. A lightweight pre-planning turn appears immediately and makes it clear the request has been captured but not yet sent to Planner.
5. Rich context is collected in the background.
6. Goal Clarity questions appear.
7. User answers Goal Clarity.
8. Task Decomposition questions appear.
9. User answers Task Decomposition.
10. The final planning request is sent to the planning agent with merged planning context attached.

## Validation commands used at this checkpoint

Typecheck:

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
node --max-old-space-size=8192 .\node_modules\typescript\lib\tsc.js -p .\src\tsconfig.json --noEmit --pretty false --skipLibCheck
```

Selfhost:

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
npm.cmd run watch
```

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
.\scripts\code.bat
```

## Important limitation

This markdown is a precise description of the checkpoint, but it is not itself a rollback artifact. If later work breaks something, this file tells us what to restore, but it does not automatically restore the code.

## How to make this a real restore point

Preferred option: create a checkpoint commit now.

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
git add PLANNING_MIDDLEWARE_CHECKPOINT.md
git add build/lib/tsgo.ts build/npm/preinstall.ts build/package-lock.json
git add src/vs/base/browser/performance.ts
git add src/vs/workbench/contrib/chat/browser/actions/chatActions.ts
git add src/vs/workbench/contrib/chat/browser/chat.ts
git add src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupController.ts
git add src/vs/workbench/contrib/chat/browser/planning
git add src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.ts
git add src/vs/workbench/contrib/chat/browser/widget/chatContentParts/media/chatQuestionCarousel.css
git add src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts
git add src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts
git add src/vs/workbench/contrib/chat/common/planning
git add src/vs/workbench/contrib/chat/test/browser/planning
git add src/vs/workbench/contrib/chat/test/common/planning
git commit -m "Checkpoint planning middleware state"
```

Alternative option: export a patch now.

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
git diff --binary > planning-middleware-checkpoint.patch
```

Later restore from that patch:

```powershell
cd "C:\Users\t-vkewenig\OneDrive - Microsoft\Desktop\vscode\vscode"
git apply --3way planning-middleware-checkpoint.patch
```

## Short reminder for future debugging

- If planning mode stops showing the immediate pre-planning turn, inspect `chatWidget.ts`.
- If Goal Clarity and Task Decomposition start overlapping again, inspect `chatPlanningQuestionGenerator.ts`.
- If the middleware styling stops looking lighter than the planner response, inspect `chatQuestionCarouselPart.ts` and `chatQuestionCarousel.css`.
- If planning context feels too broad or too weak, inspect `chatPlanningContextCollector.ts`.

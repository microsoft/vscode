---
name: feature-tryouts
description: Use when adding, reviewing, or troubleshooting an interactive release-note Try This experience, including commands, views, editor samples, Chat drafts, guided spotlights, prerequisites, scoped targets, or Agents-window handoff.
---

# Feature tryouts

Feature tryouts connect release-note links to trusted product interactions. Use this skill to choose the least invasive useful experience, keep behavior feature-owned, bind guidance to the correct UI instance, fail closed, and validate the real journey.

The authoritative contributor contract is [src/vs/workbench/contrib/onboarding/README.md](../../../src/vs/workbench/contrib/onboarding/README.md). Read it before implementation. This skill owns the execution workflow and must not duplicate a catalogue of current tryouts.

## 1. Classify the experience

Choose the least invasive level that provides value:

| Level | Use when |
|---|---|
| **Try it** | Behavior can be prepared safely with isolated data |
| **Guide me** | Opening and highlighting a real control is sufficient |
| **Help me get ready** | The user must perform a prerequisite |
| **Use my context** | The action must bind to an exact editor, session, or widget |
| **Explain only** | Interaction would be unsafe, misleading, or impossible |

A spotlight alone can be useful. A tryout does not need to reproduce the complete feature.

## 2. Establish ownership and side effects

Before editing, answer:

1. What useful state should the user reach?
2. Which component owns that behavior?
3. What may the tryout change?
4. What must remain an explicit user action?
5. What prerequisites can be missing?
6. Can several matching controls be visible?
7. Does preparation need an exact editor, session, or widget?
8. Does execution cross into the Agents window?
9. Is this an AI feature subject to Chat, provider, model, workspace, or managed-policy gates?
10. How will cancellation suppress late asynchronous effects?

Prefer feature-owned contributions and commands. Shared onboarding code should provide reusable lifecycle and presentation primitives, not feature policy.

## 3. Choose a presentation

| Need | Presentation |
|---|---|
| Run an existing product command with installed-code arguments | `command` |
| Open a contributed view or view container | `openView` |
| Show deterministic, read-only text or a comparison | `editorSample` |
| Prepare an exact Chat widget, prompt, mode, model, or attachment | Chat draft presentation |
| Launch a surface and guide one or more controls | Guided presentation |

Add a feature-owned presentation only when the built-in types cannot express the required lifecycle safely.

Canonical implementations:

- [diffEditorTryout.contribution.ts](../../../src/vs/workbench/contrib/codeEditor/browser/diffEditorTryout.contribution.ts) — isolated editor sample.
- [automationTryout.contribution.ts](../../../src/vs/workbench/contrib/chat/browser/automations/automationTryout.contribution.ts) — Agents-window prerequisite sequence.
- [modelPickerTryout.contribution.ts](../../../src/vs/workbench/contrib/chat/browser/onboarding/modelPickerTryout.contribution.ts) — scoped multi-instance target.
- [workspacePickerTryout.contribution.ts](../../../src/vs/workbench/contrib/chat/browser/onboarding/workspacePickerTryout.contribution.ts) — setting-gated, scoped control discovery.

## 4. Preserve the trust boundary

Release notes are fetched content. They may identify a tryout, but they never define executable behavior.

Requirements:

- Markdown contains only one stable, registered tryout ID.
- Installed product code owns titles, descriptions, commands, arguments, prompts, paths, samples, setup actions, and availability checks.
- Unknown, malformed, unavailable, and stale IDs fail closed.
- Commands retain their normal preconditions, confirmation, permission, and undo behavior.
- Availability is rechecked after asynchronous preparation and immediately before execution.
- Setup actions are offered explicitly and never run while rendering release notes.

Never automatically:

- trust a workspace;
- enable a setting;
- install an extension;
- accept a confirmation;
- select a model or provider;
- submit Chat input;
- save, create, or modify a user resource unless the described command normally does so after a user action.

Use stable, namespaced IDs. Do not repurpose an existing ID because old release notes remain available.

## 5. Own and scope spotlight targets

The component that renders a control owns its target registration through `markOnboardingTarget`. Never query another component's classes or DOM structure.

### Unique targets

Use an unscoped target only when at most one matching control can be visible in the target window.

### Multi-instance targets

Editors, Chat widgets, split panes, and repeated controls require a run scope:

1. The target owner registers `scope`, usually from its model, editor, session, or widget identity.
2. The launch command returns `{ targetScope }`.
3. The command payload sets `captureTargetScope: true`.
4. The sequence resolves targets only within that scope.
5. Missing or stale scope fails closed instead of falling back to another visible instance.

Scopes are opaque run identities. They are not selectors, persisted state, release-note input, or authorization tokens.

See [onboardingTarget.ts](../../../src/vs/workbench/contrib/onboarding/browser/spotlight/onboardingTarget.ts), [guidedTryoutPresentation.ts](../../../src/vs/workbench/contrib/onboarding/browser/guidedTryoutPresentation.ts), and [spotlightPresentation.ts](../../../src/vs/workbench/contrib/onboarding/browser/spotlight/spotlightPresentation.ts).

## 6. Handle prerequisites through real product actions

Use:

- `createOnboardingClickStep` when activating the real target should advance;
- `createOnboardingContextStep` when the requested user action produces a context-key state;
- a plain spotlight step when Next or Done is the appropriate acknowledgment.

Do not manufacture diagnostics, sessions, browser navigation, selections, or saved configuration merely to make the example look complete. Explain what the user must do and let the owning feature perform it.

## 7. Handle Chat and AI examples

Use `isAI: true` and include the feature's normal Chat visibility and enablement conditions.

Chat examples must:

- prepare an isolated draft or bind to an exact existing widget;
- never call `acceptInput`;
- preserve other drafts and running conversations;
- recheck provider, model, mode, extension, entitlement, workspace, and managed-policy state;
- dispose acquired models, modes, attachments, and listeners with the run;
- suppress late attachments or state changes after cancellation.

For model, provider, permission, policy, or managed-setting changes, invoke the `policy-and-managed-settings` skill.

## 8. Handle Agents-window examples

Use `targetWindow: 'agents'` when implementation belongs in the Agents window.

- Keep shared IDs and metadata in a layer both windows can load.
- Keep the implementation in its owning Sessions contribution.
- Import it from the appropriate `sessions.*.main.ts` entry point.
- Preserve the `vs/sessions` → `vs/workbench` layer direction.
- Rely on the request-scoped native handoff; do not persist or replay the request.
- A newer request must supersede and dispose the active destination run.

Invoke the `sessions` skill for changes under `src/vs/sessions/**`.

## 9. Apply specialist guidance

Invoke:

- `accessibility` for every interactive tryout;
- `design-philosophy` when changing visual or spotlight behavior;
- `integrated-browser` for Integrated Browser targets;
- `sessions` for Agents-window implementation;
- `policy-and-managed-settings` for AI controls, permissions, models, providers, or managed settings;
- `memory-leak-audit` for new listeners, target registrations, repeated rendering, or asynchronous lifecycles.

Reuse the existing spotlight presentation. Do not create a release-note-specific overlay.

## 10. Add release-note markup

Use **Developer: Copy Feature Example Link** to produce the encoded link. Markdown contains only the stable ID:

```md
<!-- %IF TRYOUTS %
[Try My Feature](command:workbench.action.onboarding.tryFeature?%5B%22myFeature.guide%22%5D)
%ENDIF % -->
```

The surrounding prose should explain:

- what opens;
- what the user should do;
- what the example will not change;
- any prerequisite or unavailable fallback.

Use [releaseNotesTryouts.md](../../../src/vs/workbench/contrib/onboarding/test/browser/fixtures/releaseNotesTryouts.md) for manual validation, not as another source of feature contracts.

## 11. Test the contract

Add the smallest applicable coverage:

| Capability | Required coverage |
|---|---|
| Registration | Exact ID, metadata, payload, and availability |
| Preparation | No execution during availability or preparation |
| Cancellation | No late effects after cancellation |
| Setup | Offered but never automatically executed |
| Guided target | Owner callback and missing-target behavior |
| Scoped target | Two visible instances; prepared instance wins |
| Command | Missing command fails closed |
| Chat | No send, no draft replacement, exact widget binding |
| Agents handoff | Cancellation, acknowledgment, rejection, and supersession |
| Integrated Browser | Native view hides behind the overlay |
| Release notes | Unknown and malformed links remain inert |

Framework references:

- [onboardingTryoutService.test.ts](../../../src/vs/workbench/contrib/onboarding/test/browser/onboardingTryoutService.test.ts)
- [onboardingTryoutActions.test.ts](../../../src/vs/workbench/contrib/onboarding/test/browser/onboardingTryoutActions.test.ts)
- [guidedTryoutPresentation.test.ts](../../../src/vs/workbench/contrib/onboarding/test/browser/guidedTryoutPresentation.test.ts)
- [spotlightPresentation.test.ts](../../../src/vs/workbench/contrib/onboarding/test/browser/spotlightPresentation.test.ts)
- [onboardingTryoutWindow.test.ts](../../../src/vs/workbench/contrib/onboarding/test/electron-browser/onboardingTryoutWindow.test.ts)

## 12. Validate and report

Run:

1. Focused unit tests.
2. Scoped ESLint.
3. `npm run valid-layers-check` when imports or ownership change.
4. `npm run typecheck-client` when TypeScript scope warrants it.
5. `npm run build-fast` whenever possible.
6. A real UI flow for cross-window, scoped-target, or native-browser behavior.

Clean temporary profiles, samples, logs, and processes.

The completion report should state:

- tryout ID and interaction level;
- selected presentation;
- permitted and explicitly avoided side effects;
- target scope strategy;
- prerequisites and fallback;
- files changed;
- tests and builds run;
- remaining manual validation.

## Stop and redesign when

- Markdown contains a command payload, prompt, path, or arguments.
- A tryout reaches into another feature's DOM.
- A multi-instance control uses the first visible target.
- An AI example submits input or silently selects a model/provider.
- Setup silently changes configuration.
- Cancellation returns success or permits late effects.
- An Agents request is persisted for reload.
- A custom overlay duplicates Spotlight.
- Feature-local documentation copies the onboarding contributor guide.

<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Feature tryouts

Feature tryouts connect release-note links to trusted product interactions. A tryout can open a view or editor, prepare an isolated sample, create an unsent Chat draft, or guide the user through existing controls with onboarding spotlights.

Tryouts reuse the onboarding scenario and sequence primitives, but have a separate presentation registry and runtime lifecycle. They do not participate in automatic scheduling, experiment assignment, or shown-state persistence.

## Trust model

Release notes are fetched content. They may identify a tryout, but they never define executable behavior.

- Markdown contains one registered, namespaced tryout ID.
- Installed product code owns the title, description, payload, commands, arguments, samples, setup actions, and availability checks.
- Unknown, malformed, unavailable, and stale IDs fail closed.
- Commands retain their normal preconditions, confirmation, permission, and undo behavior.
- AI examples respect Chat visibility, setup, provider, model, workspace, and managed-policy state.
- A tryout must not trust a workspace, enable a setting, install an extension, accept a confirmation, select a provider, or submit input on the user's behalf.

Use stable IDs containing letters, digits, periods, underscores, or hyphens. IDs begin with a letter or digit and are at most 128 characters. Do not repurpose an existing ID for unrelated behavior because old release notes remain available.

### External links

Websites can request an installed tryout with a product-protocol link containing only its ID:

```text
vscode://tryout/myFeature.guide
```

External launch is allowed by default. Set `allowExternalLaunch: false` on registrations that should remain in-product only. Every accepted external link shows a VS Code confirmation using the installed title and description before the existing tryout runner executes. Unknown IDs, opted-out registrations, malformed paths, query parameters, and fragments fail closed.

External links do not carry a trustworthy website origin. Never add commands, arguments, prompts, paths, settings, or other behavior to the URL, and never bypass the in-product confirmation based on an asserted source domain.

## Register a tryout

Register from the owning feature contribution and dispose the registration with that contribution:

```ts
this._register(registerOnboardingTryout<ICommandTryoutPayload>({
	id: 'myFeature.open',
	title: localize('myFeature.tryout.title', "Try My Feature"),
	description: localize('myFeature.tryout.description', "Open My Feature without changing its configuration."),
	presentation: {
		kind: 'command',
		payload: {
			commandId: 'myFeature.open',
		},
	},
}));
```

The contribution must be imported by every workbench entry point where the tryout is available. Shared routing metadata must live in a layer loaded by both the source and destination windows; implementation stays with the owning feature.

## Availability and setup

Use the tryout metadata to describe when an example can run:

```ts
this._register(registerOnboardingTryout<ICommandTryoutPayload>({
	id: 'myFeature.configure',
	title: localize('myFeature.configureTryout.title', "Try Configuring My Feature"),
	description: localize('myFeature.configureTryout.description', "Review My Feature configuration."),
	when: MyFeatureContext.Enabled,
	unavailableMessage: localize('myFeature.configureTryout.unavailable', "Enable My Feature before opening this example."),
	setup: {
		label: localize('myFeature.configureTryout.setup', "Open My Feature Setting"),
		command: {
			id: 'workbench.action.openSettings',
			arguments: ['@id:myFeature.enabled'],
		},
	},
	presentation: {
		kind: 'command',
		payload: {
			commandId: 'myFeature.openConfiguration',
		},
	},
}));
```

Availability is checked before preparation and again before execution. Feature commands must still enforce their own runtime invariants because state can change during asynchronous work.

Use `isAI: true` for AI examples. Use `targetWindow: 'agents'` when the implementation belongs in the Agents window. The native handoff is request-scoped, cancellable before destination acceptance, and never persisted or replayed after reload.

## Built-in presentations

### Command

Run an existing command with fixed, installed-code arguments:

```ts
{
	kind: 'command',
	payload: {
		commandId: 'workbench.action.findInFiles',
		arguments: [{ query: 'registerOnboardingTryout' }],
	},
}
```

Do not use a command presentation to bypass an unsent-draft workflow or another feature's safety checks.

### View

Open a contributed view or view container:

```ts
{
	kind: 'openView',
	payload: {
		target: 'view',
		id: MY_FEATURE_VIEW_ID,
		focus: true,
	},
}
```

Use `target: 'container'` only when the ID identifies a view container.

### Editor sample

Open bundled, read-only sample content without reading or modifying workspace files:

```ts
{
	kind: 'editorSample',
	payload: {
		type: 'diff',
		title: localize('myFeature.sample.title', "My Feature Sample"),
		original: 'const enabled = false;\n',
		modified: 'const enabled = true;\n',
		languageId: 'typescript',
	},
}
```

Text samples use `type: 'text'` with a `text` property. Keep samples small and deterministic.

### Chat draft

Use the Chat-owned draft presentation when the example requires an exact Chat widget, mode, model, attachment picker, or prepared prompt.

The presentation:

- creates or targets an isolated draft;
- binds later actions to that exact widget;
- does not call `acceptInput`;
- rechecks provider, model, policy, and session identity after asynchronous preparation;
- disposes models, modes, attachments, and listeners with the run.

See [chatDraftTryoutPresentation.ts](../chat/browser/onboarding/chatDraftTryoutPresentation.ts) and [chatDraftTryout.test.ts](../chat/test/browser/onboarding/chatDraftTryout.test.ts) for the canonical implementation and contract tests.

## Guided tryouts

A guided tryout runs a trusted launch presentation and then passes its onboarding sequence to the existing spotlight engine:

```ts
this._register(registerOnboardingTryout<IGuidedTryoutPayload>({
	id: 'myFeature.guide',
	title: localize('myFeature.guideTryout.title', "Explore My Feature"),
	description: localize('myFeature.guideTryout.description', "Open My Feature and find its primary control."),
	presentation: {
		kind: GUIDED_TRYOUT_PRESENTATION_KIND,
		payload: {
			launch: {
				kind: 'openView',
				payload: {
					target: 'view',
					id: MY_FEATURE_VIEW_ID,
					focus: false,
				},
			},
			steps: [createOnboardingClickStep({
				id: 'primaryControl',
				targetId: MY_FEATURE_ONBOARDING_TARGET,
				title: localize('myFeature.guideTryout.control.title', "Use My Feature"),
				description: localize('myFeature.guideTryout.control.description', "Select this control to continue."),
			})],
		},
	},
}));
```

Use:

- `createOnboardingClickStep` when a real target activation should advance;
- `createOnboardingContextStep` when the requested user action produces a context-key state;
- a plain spotlight step when Next or Done is the appropriate acknowledgment.

Spotlights are keyboard operable, dismissible with Escape, and keep interactive targets available when requested. Important state changes remain the responsibility of the owning feature.

## Own and scope spotlight targets

Components mark their own controls:

```ts
this._register(markOnboardingTarget(element, MY_FEATURE_ONBOARDING_TARGET, {
	open: () => this.openControl(),
}));
```

Do not query another component's classes or DOM structure.

### Unique targets

An unscoped target ID is valid only when at most one matching control can be visible in the target window. Views and singleton sidebar controls commonly meet this requirement.

### Multi-instance targets

Editors, Chat widgets, split panes, and repeated list controls require a run-scoped target:

```ts
this._register(markOnboardingTarget(element, MY_FEATURE_ONBOARDING_TARGET, {
	scope: () => this.model.id,
	open: () => this.openControl(),
}));
```

The launch command returns the same opaque scope:

```ts
return { targetScope: model.id };
```

The guided command payload opts into capturing it:

```ts
{
	kind: 'command',
	payload: {
		commandId: 'myFeature.prepareGuide',
		captureTargetScope: true,
	},
}
```

The sequence engine then resolves every target within that prepared instance. If the command does not return a valid scope, the tryout fails closed instead of highlighting another visible instance.

Scopes identify UI ownership for one run. They are not selectors, persisted state, release-note input, or authorization tokens.

## Lifecycle requirements

Tryout presentations receive a cancellation token and per-run `DisposableStore`.

- Register listeners and prepared resources immediately with the run store.
- Stop work when cancellation is requested.
- Suppress late asynchronous side effects.
- Recheck the exact scenario and presentation before execution.
- Distinct runs are latest-intent-wins; starting a new tryout cancels the active one.
- Duplicate concurrent invocations of the same ID join the active run.
- Cross-window requests remain cancellable until the destination accepts them.
- Never report success when preparation, target resolution, or destination acceptance failed.

## Release-note markup

Release notes use standard conditional comments and command links:

```md
<!-- %IF TRYOUTS %
[Try My Feature](command:workbench.action.onboarding.tryFeature?%5B%22myFeature.guide%22%5D)
%ENDIF % -->
```

Only the stable ID belongs in Markdown. Use **Developer: Copy Feature Example Link** to produce the encoded link. For manual validation, add the link to [releaseNotesTryouts.md](test/browser/fixtures/releaseNotesTryouts.md), open that file, and run **Developer: Open Current File as Release Notes**.

## Choosing the interaction level

Prefer the least invasive useful experience:

1. **Try it** — prepare isolated data and let the user operate the feature.
2. **Guide me** — open the relevant surface and highlight a control.
3. **Help me get ready** — ask the user to perform a prerequisite action.
4. **Use my context** — bind preparation to an exact editor, session, or widget.
5. **Explain only** — keep ordinary prose when interaction would be unsafe or misleading.

A spotlight alone can be valuable. A tryout does not need to reproduce the feature's complete behavior.

## Canonical examples

- [diffEditorTryout.contribution.ts](../codeEditor/browser/diffEditorTryout.contribution.ts): isolated editor sample.
- [automationTryout.contribution.ts](../chat/browser/automations/automationTryout.contribution.ts): Agents-window prerequisite sequence.
- [modelPickerTryout.contribution.ts](../chat/browser/onboarding/modelPickerTryout.contribution.ts): scoped multi-instance target.
- [workspacePickerTryout.contribution.ts](../chat/browser/onboarding/workspacePickerTryout.contribution.ts): setting-gated, scoped control discovery.
- [releaseNotesTryouts.md](test/browser/fixtures/releaseNotesTryouts.md): manual showcase document.

## Validation

At minimum:

1. Test payload validation and unavailable states.
2. Test that preparation alone has no side effects.
3. Test cancellation before and during asynchronous preparation.
4. Test that removed or replaced registrations do not execute.
5. Test scoped targets with two visible matching instances.
6. Test setup actions without executing them automatically.
7. For cross-window examples, test cancellation, supersession, destination validation, and one-shot delivery.
8. For native browser targets, verify the real `WebContentsView` is hidden behind overlays.
9. Run the smallest relevant unit suites, layer validation for import changes, and `npm run build-fast` when broad product validation is appropriate.

Use [onboardingTryoutService.test.ts](test/browser/onboardingTryoutService.test.ts), [guidedTryoutPresentation.test.ts](test/browser/guidedTryoutPresentation.test.ts), [spotlightPresentation.test.ts](test/browser/spotlightPresentation.test.ts), and [onboardingTryoutWindow.test.ts](test/electron-browser/onboardingTryoutWindow.test.ts) as framework references.

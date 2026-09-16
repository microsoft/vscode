<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Feature tryouts

Feature tryouts connect release-note actions to real product interactions. They reuse the [onboarding scenario registry](common/onboardingRegistry.ts) and [presentation registry](common/onboardingPresentation.ts), but run through a separate [guarded service](browser/onboardingTryoutService.ts). They do not participate in automatic tour scheduling, experiment assignment, or shown-state persistence.

## Contributing an example

Register an example from its owning feature contribution and dispose its registration with that contribution:

```ts
this._register(registerOnboardingTryout<ICommandTryoutPayload>({
	id: 'myFeature.open',
	title: localize('myFeature.try.title', "Try My Feature"),
	description: localize('myFeature.try.description', "Open the feature's existing configuration dialog."),
	presentation: {
		kind: 'command',
		payload: { commandId: 'myFeature.openConfiguration' }
	}
}));
```

Use stable, namespaced IDs. IDs contain only letters, digits, periods, underscores, and hyphens, start with a letter or digit, and are at most 128 characters. Do not repurpose an existing ID for an unrelated feature.

The [typed contract](common/onboardingTryout.ts) supports:

- `when`: contextual enablement, checked again before launch.
- `unavailableMessage` and `setup`: a localized explanation and an explicit, locally defined setup action.
- `isAI`: hides the action when AI is hidden and uses the existing Chat setup/enablement checks.
- `targetWindow: 'agents'`: hands off the ID to the Agents window rather than invoking a Sessions-owned command in an editor window.

For AI-specific actions, include the feature's normal Chat visibility/enablement conditions. The owning feature's runtime checks remain authoritative. Do not enable a setting, trust a workspace, install an extension, or accept a confirmation merely because someone opened release notes.

Keep shared routing metadata in a layer both windows can load. The actual implementation can remain Sessions-owned: shared workbench code must not import Sessions implementation modules.

### Complete contribution skeleton

Feature contributions normally register their examples during workbench startup and dispose them with the contribution:

```ts
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { registerOnboardingTryout } from '../../onboarding/common/onboardingTryout.js';
import { ICommandTryoutPayload } from '../../onboarding/common/onboardingTryoutActions.js';

class MyFeatureTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.myFeatureTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout<ICommandTryoutPayload>({
			id: 'myFeature.open',
			title: localize('myFeature.try.title', "Try My Feature"),
			description: localize('myFeature.try.description', "Open the feature's configuration dialog."),
			presentation: {
				kind: 'command',
				payload: { commandId: 'myFeature.openConfiguration' },
			},
		}));
	}
}

registerWorkbenchContribution2(
	MyFeatureTryoutContribution.ID,
	MyFeatureTryoutContribution,
	WorkbenchPhase.BlockRestore,
);
```

Import the contribution from every workbench entry point where the example should be registered. Registration metadata must live in a layer that each target window can load.

## Shared presentations

### Commands and views

The [built-in presentations](browser/onboardingTryoutActions.ts) accept:

```ts
{ kind: 'command', payload: { commandId: 'myFeature.command', arguments: ['fixedArgument'] } }
{ kind: 'openView', payload: { target: 'view', id: 'myFeature.view', focus: true } }
{ kind: 'openView', payload: { target: 'container', id: 'myFeature.container' } }
```

Command arguments belong to the installed contribution, never to fetched Markdown. Commands retain their normal permission, confirmation, activation, and undo behavior. A command can change state when explicitly invoked; describe that effect in the action's title and description. Do not use a command to bypass the unsent-draft behavior of an AI example.

Commands with menu preconditions are checked before dispatch. The command's own runtime guards must still handle changes during asynchronous activation. Missing view targets and failed openings are reported as unavailable, not successful launches.

#### Run an existing command with fixed arguments

```ts
this._register(registerOnboardingTryout<ICommandTryoutPayload>({
	id: 'search.open-text',
	title: localize('search.try.title', "Try Text Search"),
	description: localize('search.try.description', "Open Search with a prepared query."),
	presentation: {
		kind: 'command',
		payload: {
			commandId: 'workbench.action.findInFiles',
			arguments: [{ query: 'registerOnboardingTryout' }],
		},
	},
}));
```

The release-note link contains only `search.open-text`. The query and command ID remain in trusted product code.

#### Open a view directly

```ts
this._register(registerOnboardingTryout<IViewTryoutPayload>({
	id: 'problems.open-view',
	title: localize('problems.try.title', "Open Problems"),
	description: localize('problems.try.description', "Open and focus the Problems view."),
	presentation: {
		kind: 'openView',
		payload: {
			target: 'view',
			id: MARKERS_VIEW_ID,
			focus: true,
		},
	},
}));
```

Use `target: 'container'` when the ID identifies a view container rather than a specific view.

#### Add prerequisites and a setup action

```ts
this._register(registerOnboardingTryout<ICommandTryoutPayload>({
	id: 'automations.create',
	title: localize('automations.tryout.title', "Try Creating an Automation"),
	description: localize(
		'automations.tryout.description',
		"Open the New automation dialog. Nothing is saved until you choose Create."
	),
	isAI: true,
	targetWindow: 'agents',
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
	unavailableMessage: localize(
		'automations.tryout.unavailable',
		"Automations require an enabled Chat agent and the Automations setting."
	),
	setup: {
		label: localize('automations.tryout.setup', "Open Automations Setting"),
		command: {
			id: 'workbench.action.openSettings',
			arguments: [`@id:${CHAT_AUTOMATIONS_ENABLED_SETTING}`],
		},
	},
	presentation: {
		kind: 'command',
		payload: { commandId: 'sessionsView.newAutomation' },
	},
}));
```

The setup action is offered only after availability is rechecked. It is not executed while rendering release notes.

### Launch and spotlight a control

Use the guided presentation to run any existing launch presentation and then show one or more steps through the existing onboarding sequence engine:

```ts
this._register(registerOnboardingTryout<IGuidedTryoutPayload>({
	id: 'problems.filter',
	title: localize('problems.tryout.title', "Try Filtering Problems"),
	description: localize(
		'problems.tryout.description',
		"Open Problems and highlight its filter control."
	),
	presentation: {
		kind: GUIDED_TRYOUT_PRESENTATION_KIND,
		payload: {
			launch: {
				kind: 'openView',
				payload: {
					target: 'view',
					id: Markers.MARKERS_VIEW_ID,
					focus: false,
				},
			},
			steps: [{
				id: 'filter',
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					id: 'filter',
					targetId: Markers.PROBLEMS_FILTER_ONBOARDING_TARGET_ID,
					title: localize(
						'problems.tryout.filter.title',
						"Focus the Problem List"
					),
					description: localize(
						'problems.tryout.filter.description',
						"Type text, a file pattern, or a source filter to narrow the problems shown in the current workspace."
					),
					placement: 'above',
					openTarget: true,
					allowTargetInteraction: true,
					missingTarget: { kind: 'abort' },
				},
			}],
			unavailableMessage: localize(
				'problems.tryout.guidanceUnavailable',
				"Problems opened, but its filter control could not be highlighted."
			),
		},
	},
}));
```

The component that owns the highlighted control must register and dispose its target:

```ts
this._register(markOnboardingTarget(
	this.filterWidget.element,
	Markers.PROBLEMS_FILTER_ONBOARDING_TARGET_ID,
	{
		open: () => this.focusFilter(),
	}
));
```

The guided presentation:

1. Evaluates and prepares the nested launch presentation.
2. Runs the launch and waits for the target UI to open.
3. Runs the existing sequence and spotlight step implementations in the destination window.
4. Returns the launch result after the guidance completes or is dismissed.

If the launch is unavailable, it is not run. If a required sequence kind or target is unavailable, the configured unavailable message is shown. Cancellation between launch and guidance prevents the spotlight from appearing.

The target owner must resolve its `open` callback when the control is ready to receive focus or interaction. When the user should navigate through the real UI, use `advanceOnTargetClick` instead of opening the destination in the launch step.

For example, the Automation experience starts by restoring the sidebar, then lets the user's real click open Automations:

```ts
launch: {
	kind: 'command',
	payload: {
		commandId: PREPARE_AUTOMATIONS_TRYOUT_COMMAND_ID,
	},
},
steps: [{
	id: 'sidebar',
	kind: SPOTLIGHT_PRESENTATION_KIND,
	payload: {
		id: 'sidebar',
		targetId: AutomationOnboardingTarget.Sidebar,
		title: localize('automations.tryout.sidebar.title', "Open Automations"),
		description: localize(
			'automations.tryout.sidebar.description',
			"Select Automations in the sidebar to manage scheduled and on-demand agent tasks."
		),
		allowTargetInteraction: true,
		advanceOnTargetClick: true,
		missingTarget: { kind: 'abort' },
	},
}]
```

The sidebar owner marks the row. The Automations view marks its built-in templates section and every state-specific Create Automation button. Its custom-view header action uses the same Create target ID, so the spotlight finds the visible control whether the catalogue is empty, loading, unavailable, or already contains saved automations.

The [Automation declaration](../chat/browser/automations/automationTryout.contribution.ts) combines these targets into a three-step Sidebar, Built-in Templates, and Create Automation experience.

Use `allowTargetInteraction` only when the user should operate the highlighted control. `advanceOnTargetClick` can advance after activation, and `advanceWhen` can wait for a context-key state change. Otherwise, the spotlight's Next or Done action controls progression.

#### Ask the user to create the required context

A missing workspace, session, provider, file, or other prerequisite does not always make the tryout unavailable. When the user can satisfy it safely in the product, make that action the first spotlight step. Use `createOnboardingContextStep` when completion is represented by a context key:

```ts
createOnboardingContextStep({
	id: 'workspace',
	targetId: 'sessions.newSession.workspacePicker',
	title: localize('myFeature.workspace.title', "Choose a Workspace"),
	description: localize(
		'myFeature.workspace.description',
		"Choose the folder where you want to try this feature."
	),
	completeWhen: ContextKeyExpr.has('sessionHasWorkspace'),
})
```

The helper makes the target interactive, opens it through its owner, waits up to ten seconds for asynchronous rendering, hides Next, and proceeds when the owner updates the context key.

Use `createOnboardingClickStep` when activating the control itself is sufficient:

```ts
createOnboardingClickStep({
	id: 'openSession',
	targetId: 'sessions.list',
	title: localize('myFeature.session.title', "Open a Session"),
	description: localize(
		'myFeature.session.description',
		"Select a session that contains the content you want to explore."
	),
})
```

This helper makes the target interactive, advances on activation, and uses the same bounded target wait. Override `missingTarget`, `openTarget`, `allowTargetInteraction`, or `hideNext` only when the feature requires different behavior.

Prefer a guided prerequisite when:

- the user can complete it safely and understand the choice;
- the selected workspace, session, provider, or resource matters;
- automatic setup would change user data, billing, trust, or credentials;
- the next target appears only after the prerequisite.

Use `unavailable` instead when the prerequisite cannot be satisfied in the current product, host, account, or policy state. Never make a spotlight ask the user to weaken policy or approve an action without understanding its effect.

### Read-only sample editors

The [sample presentation](browser/onboardingSamplePresentation.ts) supports text and diff data:

```ts
this._register(registerOnboardingTryout<EditorSampleTryoutPayload>({
	id: 'myFeature.sample-diff',
	title: localize('myFeature.tryDiff.title', "Try the New Diff Experience"),
	description: localize('myFeature.tryDiff.description', "Open a read-only sample comparison."),
	presentation: {
		kind: 'editorSample',
		payload: {
			type: 'diff',
			title: localize('myFeature.sample.title', "Example Comparison"),
			languageId: 'typescript',
			original: 'const value = 1;',
			modified: 'const value = 2;',
		},
	},
}));
```

For a text sample, use `type: 'text'` and `text` instead of `original` and `modified`.

```ts
this._register(registerOnboardingTryout<EditorSampleTryoutPayload>({
	id: 'markdown.rich-links',
	title: localize('markdown.richLinks.try.title', "Try GitHub Rich Links"),
	description: localize('markdown.richLinks.try.description', "Open a read-only Markdown sample containing GitHub links."),
	presentation: {
		kind: 'editorSample',
		payload: {
			type: 'text',
			title: localize('markdown.richLinks.sample.title', "GitHub Rich Links Example"),
			languageId: 'markdown',
			text: [
				'# Project status',
				'',
				'- microsoft/vscode#1',
				'- https://github.com/microsoft/vscode/pull/1',
			].join('\n'),
		},
	},
}));
```

Samples are resolved from the registered contribution through the `vscode-onboarding-sample` scheme. They are read-only virtual resources, not files written into the user's workspace. Preparation acquires model references; the editor takes its own references when opened. Cancelling preparation releases its references without opening an editor.

Only registered sample data can be resolved. Do not encode arbitrary content, paths, or scripts into sample URI queries. A removed example produces a useful unavailable error instead of resolving unrelated content.

The [smart diff example](../codeEditor/browser/diffEditorTryout.contribution.ts) supplies a comparison and leaves layout selection and resizing to the existing diff editor.

### Context-bound preparation

When an action needs a particular widget or resource, implement a reusable presentation rather than inferring its target from the active release-notes editor.

`registerOnboardingTryoutPresentation<TPayload>` takes a payload guard, a side-effect-free availability function, and an asynchronous `prepare` function. Preparation receives the example ID, a cancellation token, and a per-run disposable store. It returns either an explicit unavailable/cancelled result or a `run` closure bound to its prepared, typed context.

```ts
prepare: async (payload, context) => {
	const target = await prepareTarget(payload, context.token, context.store);
	if (context.token.isCancellationRequested) {
		return { kind: 'cancelled' };
	}
	return {
		kind: 'ready',
		run: async () => {
			await openTargetAction(target);
			return { kind: 'prepared' };
		}
	};
}
```

The service rechecks registration, availability, and cancellation between preparation and execution. It coalesces simultaneous requests for the same ID. Per-run resources are disposed on completion, failure, or cancelled preparation; the destination UI must own anything that outlives the run.

### Registering a custom presentation

Use a custom presentation when a useful example requires selecting or preparing a typed context that the command, view, and sample presentations cannot express:

```ts
interface IOpenResourceTryoutPayload {
	readonly resourceKind: 'file' | 'folder';
}

function isOpenResourceTryoutPayload(value: unknown): value is IOpenResourceTryoutPayload {
	return isObject(value)
		&& hasKey(value, { resourceKind: true })
		&& (value.resourceKind === 'file' || value.resourceKind === 'folder');
}

class OpenResourceTryoutPresentation implements IOnboardingTryoutPresentationDefinition<IOpenResourceTryoutPayload> {
	readonly kind = 'openResource';
	readonly isPayload = isOpenResourceTryoutPayload;

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IEditorService private readonly editorService: IEditorService,
	) { }

	getAvailability(): OnboardingTryoutAvailability {
		return { kind: 'ready' };
	}

	async prepare(
		payload: IOpenResourceTryoutPayload,
		context: IOnboardingTryoutRunContext,
	): Promise<OnboardingTryoutPreparation> {
		const resource = payload.resourceKind === 'folder'
			? (await this.fileDialogService.showOpenDialog({ canSelectFolders: true, canSelectFiles: false }))?.[0]
			: (await this.fileDialogService.showOpenDialog({ canSelectFolders: false, canSelectFiles: true }))?.[0];

		if (context.token.isCancellationRequested || !resource) {
			return { kind: 'cancelled' };
		}

		return {
			kind: 'ready',
			run: async () => {
				if (context.token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				await this.editorService.openEditor({ resource });
				return { kind: 'opened' };
			},
		};
	}
}
```

Register the presentation and examples that use it from a feature contribution:

```ts
const presentation = this._register(
	this.instantiationService.createInstance(OpenResourceTryoutPresentation)
);
this._register(registerOnboardingTryoutPresentation(presentation));

this._register(registerOnboardingTryout<IOpenResourceTryoutPayload>({
	id: 'myFeature.open-resource',
	title: localize('myFeature.openResource.title', "Try Opening a Resource"),
	description: localize('myFeature.openResource.description', "Select a file, then open it in the editor."),
	presentation: {
		kind: presentation.kind,
		payload: { resourceKind: 'file' },
	},
}));
```

`getAvailability` must be side-effect free. Put pickers, model acquisition, and other cancellable preparation in `prepare`; put the final user-visible action in the returned `run` closure.

Chat examples use a separate draft and bind subsequent actions to that draft's widget. Never call `acceptInput`, replace an existing draft, borrow its attachments, or stop a running chat as preparation. Opening a generic Chat view or setting text to a URL is not equivalent to opening a particular context picker or invoking paste behavior.

### Prepare a Chat draft and open a bound context picker

The Chat-owned presentation can create a separate draft and invoke an attachment action against that exact widget:

```ts
this._register(registerOnboardingTryout<IChatDraftTryoutPayload>({
	id: 'chat.github-attachments',
	title: localize('chat.tryout.github.title', "Try GitHub Attachments"),
	description: localize(
		'chat.tryout.github.description',
		"Open a separate Chat draft and choose a GitHub issue or pull request to attach. Nothing is sent."
	),
	isAI: true,
	when: ChatContextKeys.enabled,
	setup: {
		label: localize('chat.tryout.github.setup', "Set Up Chat"),
		command: { id: CHAT_SETUP_ACTION_ID },
	},
	presentation: {
		kind: CHAT_DRAFT_TRYOUT_PRESENTATION,
		payload: {
			sessionType: localChatSessionType,
			mode: ChatModeKind.Agent,
			attachContext: {
				commandIds: [OPEN_GITHUB_ISSUE_COMMAND, OPEN_GITHUB_PULL_REQUEST_COMMAND],
				extensionId: 'GitHub.copilot-chat',
				placeholder: localize(
					'chat.tryout.github.placeholder',
					"Attach a GitHub issue or pull request to this draft"
				),
			},
		},
	},
}));
```

Register `ChatDraftTryoutPresentation` once from the Chat contribution before registering examples that reference `CHAT_DRAFT_TRYOUT_PRESENTATION`.

## Adding the release-note link

Use **Developer: Copy Feature Example Link** to select a registered example and copy its standard Markdown command link. **Developer: Try Feature Example** invokes the same guarded path used by release notes.

Wrap the link using the existing conditional-block syntax:

```md
<!-- %IF TRYOUTS %
[Try Creating an Automation](command:workbench.action.onboarding.tryFeature?%5B%22automations.create%22%5D)

Opens the New automation dialog. Nothing is saved until you choose Create.
%ENDIF % -->
```

The only argument is a registered example ID. The standard command-URI helper may escape the query differently; use the copied link rather than editing encoded JSON by hand.

Product code can also generate the URI using the shared helper:

```ts
const uri = createOnboardingTryoutUri('automations.create');
const markdown = `[Try Creating an Automation](${uri.toString()})`;
```

`TRYOUTS` is a capability condition, not a feature flag that enables AI. Older renderers do not activate that condition and remove the block; ordinary website Markdown keeps it commented out. Keep normal instructions and documentation links outside the block.

Do not insert raw commands, prompts, settings values, or executable recipes in the release-note action. The renderer resolves descriptions, availability, and setup actions from installed contributions and rechecks them when the user activates an action.

Use **Developer: Open Current File as Release Notes** to preview the actual renderer and interaction boundary, rather than a generic Markdown preview.

The [validation document](test/browser/fixtures/releaseNotesTryouts.md) presents the examples as a small showcase:

- **Try it:** safely exercise Smart Diff with isolated sample data.
- **Guide me:** open Problems and explain its interactive filter.
- **Help me get ready:** navigate through the Automations sidebar and catalogue.
- **Use my context:** bind the GitHub attachment picker to a specific new draft.
- **Guide me:** inspect model/provider choices without selecting or sending.
- **Help me get ready:** choose an applicable local browser tab, then find automatic reload.
- **Explain safely:** render an unknown example as unavailable.
- **Compatibility:** preserve existing setting and keybinding syntax.

## Initial validation examples

| ID | Purpose |
| --- | --- |
| `problems.filter` | Opens a real view and spotlights an owner-marked, interactive filter control. |
| `automations.create` | A real command and creation dialog, routed to the Agents window with explicit Create. |
| `chat.github-attachments` | A safe Chat draft and an action bound to the correct context. |
| `chat.model-provider-selection` | Opens an unsent Agents composer and spotlights provider/model details without changing the selection. |
| `browser.auto-reload` | Asks for an existing local HTML browser tab and spotlights its per-tab reload menu without changing it. |
| `editor.smart-diff` | Read-only sample resources and a real editor target. |

The [Automation declaration](../chat/browser/automations/automationTryout.contribution.ts) illustrates how shared metadata can target an existing Sessions command without importing its implementation.

These examples establish reusable mechanisms; they do not by themselves establish majority coverage of release-note features. More context-aware presentations can be added as needed. Performance comparisons, administrative enforcement, and timing-dependent workflows should retain documentation or videos when there is no meaningful immediate tryout.

## Validation checklist

- Rendering, focus, hover, and availability checks execute no launch actions.
- Only an explicitly registered ID reaches preparation; malformed arguments, extra arguments, and private tours cannot execute.
- AI hidden/disabled, setup, unavailable host/provider, and cancelled states are handled explicitly.
- Preparation preserves existing drafts, attachments, running work, workspace files, and settings.
- Commands receive their exact contributed arguments and normal safeguards.
- The target is real: verify the opened view, prepared prompt/widget, or sample content, not just that a command returned.
- Cancellation, registration changes, and failures between asynchronous steps prevent the final action.
- Keyboard navigation, contextual labels, focus handoff/return, and high-contrast behavior work.
- No launch is caused by automatic onboarding, legacy manual replay, or reloading a previously routed window request.
- Existing setting links, release-note conditions, and command restrictions still work.

Focused tests live in [the onboarding test directory](test/browser), [release-note renderer tests](../update/test/browser/releaseNotesRenderer.test.ts), and the owning feature's tests.

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { assert } from '../../../../../base/common/assert.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatEditingSessionState, IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatRequestDisablement } from '../../../../contrib/chat/common/model/chatModel.js';
import { IChatTodo } from '../../../../contrib/chat/common/tools/chatTodoListService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../contrib/chat/common/languageModels.js';
import { ChatAgentLocation } from '../../../../contrib/chat/common/constants.js';
import { SessionType } from '../../../../contrib/chat/common/chatSessionsService.js';
import { ChatInputNotificationSeverity, IChatInputNotification } from '../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget } from '../../../../contrib/chat/browser/widget/input/chatInputNotificationWidget.js';
import { CopilotHarnessIntroductionButtonVariant, copilotHarnessIntroductionButtonVariants, CopilotHarnessIntroductionCopyVariant, copilotHarnessIntroductionCopyVariants, getCopilotHarnessIntroductionContent } from '../../../../contrib/chat/browser/agentSessions/copilotHarnessIntroduction.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';
import { ChatInputFixtureOptions, renderChatInput } from './renderChatInput.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

const sampleArtifacts = [
	{ label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' as const },
	{ label: 'Screenshot', uri: 'file:///tmp/screenshot.png', type: 'screenshot' as const },
	{ label: 'Plan', uri: 'file:///tmp/plan.md', type: 'plan' as const },
];

function createMockEditingSession(files: { uri: string; added: number; removed: number }[]): IChatEditingSession {
	const entries = files.map(f => {
		const entry = new class extends mock<IModifiedFileEntry>() {
			override readonly entryId = f.uri;
			override readonly modifiedURI = URI.parse(f.uri);
			override readonly originalURI = URI.parse(f.uri);
			override readonly state = observableValue('state', ModifiedFileEntryState.Modified);
			override readonly linesAdded = observableValue('linesAdded', f.added);
			override readonly linesRemoved = observableValue('linesRemoved', f.removed);
			override readonly lastModifyingRequestId = 'request-1';
			override readonly changesCount = observableValue('changesCount', 1);
			override readonly isCurrentlyBeingModifiedBy = observableValue('isCurrentlyBeingModifiedBy', undefined);
			override readonly lastModifyingResponse = observableValue('lastModifyingResponse', undefined);
			override readonly rewriteRatio = observableValue('rewriteRatio', 0);
			override readonly waitsForLastEdits = observableValue('waitsForLastEdits', false);
			override readonly reviewMode = observableValue('reviewMode', false);
			override readonly autoAcceptController = observableValue('autoAcceptController', undefined);
		}();
		return entry;
	});

	return new class extends mock<IChatEditingSession>() {
		override readonly isGlobalEditingSession = false;
		override readonly chatSessionResource = URI.parse('chat-session:test-session');
		override readonly onDidDispose = Event.None;
		override readonly state = observableValue('state', ChatEditingSessionState.Idle);
		override readonly entries = observableValue('entries', entries);
		override readonly requestDisablement = observableValue<IChatRequestDisablement[]>('requestDisablement', []);
	}();
}

const sampleTodos: IChatTodo[] = [
	{ id: 1, title: 'Set up project structure', status: 'completed' },
	{ id: 2, title: 'Implement auth service', status: 'in-progress' },
	{ id: 3, title: 'Add unit tests', status: 'not-started' },
];

const sampleModels: ILanguageModelChatMetadataAndIdentifier[] = [
	{
		identifier: 'openai-gpt-5.3-codex',
		metadata: {
			extension: new ExtensionIdentifier('fixture.extension'),
			id: 'gpt-5.3-codex',
			name: 'GPT-5.3-Codex',
			vendor: 'openai',
			family: 'gpt',
			version: '1',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
		},
	},
];

// A short name beside its thinking effort / context readout. The name must keep its
// own width rather than being padded out to the picker's minimum label width.
export const shortNameModels: ILanguageModelChatMetadataAndIdentifier[] = [
	{
		identifier: 'xai-grok-4.7',
		metadata: {
			extension: new ExtensionIdentifier('fixture.extension'),
			id: 'grok-4.7',
			name: 'Grok 4.7',
			vendor: 'xai',
			family: 'grok',
			version: '1',
			maxInputTokens: 256000,
			maxOutputTokens: 8192,
			isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
			configurationSchema: {
				properties: {
					reasoningEffort: { type: 'string', group: 'navigation', enum: ['low', 'medium', 'high'], enumItemLabels: ['Low', 'Medium', 'High'], default: 'high' },
					contextSize: { type: 'number', group: 'tokens', enum: [128000, 256000], enumItemLabels: ['128K', '256K'], default: 256000 },
				},
			},
		},
	},
];

const sampleNotification: IChatInputNotification = {
	id: 'fixture.notification',
	severity: ChatInputNotificationSeverity.Info,
	message: 'You are approaching your monthly limit.',
	description: undefined,
	actions: [],
	dismissible: true,
	autoDismissOnMessage: false,
};

function createCopilotIntroductionNotification(copy: CopilotHarnessIntroductionCopyVariant = 'current', buttons: CopilotHarnessIntroductionButtonVariant = 'dismiss'): IChatInputNotification {
	const content = getCopilotHarnessIntroductionContent(copy, buttons);
	return {
		id: 'chat.agentsParallelWork',
		severity: ChatInputNotificationSeverity.Info,
		message: content.title,
		description: new MarkdownString(content.description),
		actions: content.actions,
		dismissible: content.dismissible,
		autoDismissOnMessage: false,
	};
}

const copilotHarnessSessionConfig: ResolveSessionConfigResult = {
	schema: {
		type: 'object',
		properties: {
			[SessionConfigKey.Mode]: {
				type: 'string',
				title: 'Mode',
				enum: ['interactive', 'autopilot'],
				enumLabels: ['Agent', 'Autopilot'],
				default: 'interactive',
			},
			[SessionConfigKey.AutoApprove]: {
				type: 'string',
				title: 'Permissions',
				enum: ['default', 'autoApprove', 'autopilot'],
				enumLabels: ['Default permissions', 'Allow all', 'Autopilot'],
				default: 'default',
			},
		},
	},
	values: {
		[SessionConfigKey.Mode]: 'interactive',
		[SessionConfigKey.AutoApprove]: 'default',
	},
};

const copilotHarnessModels = sampleModels.map(model => ({ ...model, metadata: { ...model.metadata, targetChatSessionType: SessionType.AgentHostCopilot } }));

const combinedPickerOptions: ChatInputFixtureOptions = {
	agentHostSessionConfig: { ...copilotHarnessSessionConfig, values: { mode: 'autopilot', autoApprove: 'autoApprove' } },
	combinedModePermissionsPicker: true,
	tabbedModelPicker: true,
	models: shortNameModels.map(model => ({ ...model, metadata: { ...model.metadata, targetChatSessionType: SessionType.AgentHostCopilot } })),
};

const copilotIntroductionOptions: ChatInputFixtureOptions = {
	agentHostSessionConfig: copilotHarnessSessionConfig,
	models: copilotHarnessModels,
	notification: createCopilotIntroductionNotification(),
};

function renderCopilotIntroductionComparison(context: ComponentFixtureContext): void {
	const { container, disposableStore } = context;
	const width = 500;
	container.classList.add('monaco-workbench', 'copilot-introduction-comparison');
	container.style.display = 'grid';
	container.style.gridTemplateColumns = `repeat(2, ${width}px)`;
	container.style.width = 'max-content';
	container.style.gap = 'var(--vscode-spacing-size240)';
	container.style.padding = 'var(--vscode-spacing-size160)';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';
	for (const copy of copilotHarnessIntroductionCopyVariants) {
		for (const buttons of copilotHarnessIntroductionButtonVariants) {
			const card = dom.append(container, dom.$('section.copilot-introduction-comparison-card'));
			card.dataset.copy = copy;
			card.dataset.buttons = buttons;
			const heading = dom.append(card, dom.$('h3'));
			heading.textContent = `${copy} / ${buttons === 'dismiss' ? 'X + two buttons' : 'original feedback buttons'}`;
			heading.style.margin = '0 0 var(--vscode-spacing-size80)';
			heading.style.fontSize = 'var(--vscode-fontSize-body1)';
			heading.style.fontWeight = 'var(--vscode-fontWeight-semiBold)';
			const instantiationService = createEditorServices(disposableStore, {
				colorTheme: context.theme,
				additionalServices: reg => registerChatFixtureServices(reg, { notification: createCopilotIntroductionNotification(copy, buttons) }),
			});
			const widget = disposableStore.add(instantiationService.createInstance(ChatInputNotificationWidget, undefined));
			dom.append(card, widget.domNode);
		}
	}
}

export default defineThemedFixtureGroup({ path: 'chat/input/' }, {
	Default: defineComponentFixture({ render: context => renderChatInput(context) }),
	WithSandboxing: defineComponentFixture({ render: context => renderChatInput(context, { sandboxingEnabled: true }) }),
	WithProviderIcon: defineComponentFixture({ render: context => renderChatInput(context, { models: sampleModels }) }),
	WithShortModelName: defineComponentFixture({ render: context => renderChatInput(context, { models: shortNameModels }) }),
	CompactWithProviderIcon: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The editor chat input shows compact picker controls as 12-pixel codicons centered with equal padding inside matching 22-pixel square controls, aligned with the expanded toolbar height.'],
		render: context => renderChatInput(context, { models: sampleModels, width: 180 })
	}),
	CopilotHarnessCompactPickers: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The editor chat input renders the real Copilot Agent Host mode and permissions pickers in compact state. Each compact icon is centered with equal padding inside a 22-pixel square control.'],
		render: context => renderChatInput(context, { agentHostSessionConfig: copilotHarnessSessionConfig, width: 500, resizeWidths: [180] }),
	}),
	CopilotHarnessCombinedPickers: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderChatInput(context, combinedPickerOptions),
	}),
	CopilotHarnessCombinedCompactPickers: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderChatInput(context, {
			...combinedPickerOptions,
			width: 500,
			resizeWidths: [180],
		}),
	}),
	WithArtifacts: defineComponentFixture({ render: context => renderChatInput(context, { artifacts: sampleArtifacts }) }),
	// The notice/input seam, the subject of #330483. Driven through the real
	// notification service so the squared corner comes from the stack.
	WithNotification: defineComponentFixture({
		render: context => renderChatInput(context, { notification: sampleNotification })
	}),
	WithCopilotIntroduction: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderChatInput(context, copilotIntroductionOptions)
	}),
	NarrowWithCopilotIntroduction: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderChatInput(context, { ...copilotIntroductionOptions, width: 320 })
	}),
	NarrowWithCopilotIntroductionFeedback: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderChatInput(context, { ...copilotIntroductionOptions, notification: createCopilotIntroductionNotification('current', 'feedback'), width: 320 })
	}),
	CopilotIntroductionExperiments: defineThemedFixtureGroup(Object.fromEntries(
		copilotHarnessIntroductionCopyVariants.flatMap(copy => copilotHarnessIntroductionButtonVariants.map(buttons => [
			`${copy}-${buttons}`,
			defineComponentFixture({
				render: context => renderChatInput(context, { ...copilotIntroductionOptions, notification: createCopilotIntroductionNotification(copy, buttons) })
			}),
		] as const))
	)),
	AllCopilotIntroductionVariants: defineComponentFixture({
		render: renderCopilotIntroductionComparison,
	}),
	// A run of three: notice, todo list, then the input. Covers a notice docking
	// to a widget rather than straight to the input.
	WithNotificationAndTodos: defineComponentFixture({
		render: context => renderChatInput(context, { notification: sampleNotification, todos: sampleTodos })
	}),
	WithFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	WithTodos: defineComponentFixture({
		render: context => renderChatInput(context, { todos: sampleTodos })
	}),
	WithTodosAndFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { todos: sampleTodos, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	WithArtifactsAndFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { artifacts: sampleArtifacts, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	Full: defineComponentFixture({
		render: context => renderChatInput(context, {
			artifacts: sampleArtifacts,
			editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]),
			todos: sampleTodos,
		})
	}),
	// Standalone dictation / Voice Mode controls, shown when the segmented voice
	// pill isn't active. Each state changes part of the border / color / glow
	// cascade, so they are covered individually.
	VoiceDictationIdle: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'dictationIdle' }) }),
	VoiceDictationRecording: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'dictationRecording' }) }),
	VoiceDictationPreparing: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'dictationPreparing' }) }),
	VoiceModeIdle: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceIdle' }) }),
	VoiceModeConnecting: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceConnecting' }) }),
	VoiceModeListening: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceListening' }) }),
	VoiceModeSpeaking: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceSpeaking' }) }),
	VoiceModeDisconnect: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceDisconnect' }) }),
	// The segmented voice pill at the chat view's minimum width: the pickers
	// collapse into the overflow menu so the send button and the voice pill stay
	// inside the input (#331228).
	NarrowWithVoiceInputMode: defineComponentFixture({
		virtualTime: { enabled: false },
		render: async context => {
			await renderChatInput(context, { voiceInputMode: true, width: 150 });
			const inputContainer = context.container.querySelector<HTMLElement>('.chat-input-container');
			const inputToolbar = context.container.querySelector<HTMLElement>('.chat-input-toolbar');
			const submit = context.container.querySelector<HTMLElement>('.chat-execute-toolbar .chat-submit-button');
			assert(!!inputContainer && !!inputToolbar && !!submit && submit.checkVisibility());
			const submitOverflow = submit.getBoundingClientRect().right - inputContainer.getBoundingClientRect().right;
			assert(submitOverflow <= 0, `The send button must not overflow the chat input, got ${submitOverflow}px of overflow.`);
			const inputToolbarRight = inputToolbar.getBoundingClientRect().right;
			for (const item of inputToolbar.querySelectorAll<HTMLElement>('.action-item')) {
				assert(item.getBoundingClientRect().right <= inputToolbarRight + 1, 'Input toolbar actions must move into the overflow menu instead of being clipped.');
			}
			assert(!!inputToolbar.querySelector('.monaco-action-bar.has-overflow'), 'The collapsed pickers must stay reachable from the overflow menu.');
		},
	}),

	// Where the pet lands, with and without a notice docked above the input (#332570).
	WithPet: defineComponentFixture({ render: context => renderChatInput(context, { pet: true }) }),
	WithPetAndNotification: defineComponentFixture({
		render: context => renderChatInput(context, { pet: true, notification: sampleNotification })
	}),
	// Notification and todo list are separate stack members, so they genuinely coexist.
	WithPetAndNotificationAndTodos: defineComponentFixture({
		render: context => renderChatInput(context, { pet: true, notification: sampleNotification, todos: sampleTodos })
	}),
});

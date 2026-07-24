/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { IHistoryService } from '../../../../../workbench/services/history/common/history.js';
import { IAICustomizationWorkspaceService } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { NewChatInputWidget } from '../../browser/newChatInput.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { IVoiceInputModeService, VoiceInputMode } from '../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js';
import { ITtsPlaybackService } from '../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IMicCaptureService } from '../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { URI } from '../../../../../base/common/uri.js';

// The new-session input box styling lives in these stylesheets; `style.css`
// provides the `--vscode-agentsChatInput-*` theme variables and the
// `.agent-sessions-workbench` scope.
import '../../browser/media/chatInput.css';
import '../../browser/media/newChatInSession.css';
import '../../browser/media/chatWidget.css';
import '../../../../browser/media/style.css';

interface NewChatInputFixtureOptions {
	readonly value?: string;
	readonly selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
}

/**
 * Renders the real {@link NewChatInputWidget} inside the production DOM ancestry
 * (`.new-chat-in-session > .new-chat-widget-container.revealed > .new-chat-widget-content`)
 * so the `chatInput.css` / `newChatInSession.css` rules apply. The sessions-specific
 * services its pickers depend on are mocked here.
 */
async function renderNewChatInput(context: ComponentFixtureContext, fixtureOptions: NewChatInputFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	const { value, selection } = fixtureOptions;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly onShow = Event.None;
				override readonly onHide = Event.None;
			}());
			reg.defineInstance(ISearchService, new class extends mock<ISearchService>() { }());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessionTypes = Event.None;
				override getSessionTypesForFolder() { return []; }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(IHistoryService, new class extends mock<IHistoryService>() { }());
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override async getFilteredPromptSlashCommands() { return []; }
			}());
			reg.defineInstance(IPromptsService, new class extends mock<IPromptsService>() {
				override readonly onDidChangeSlashCommands = Event.None;
			}());
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly onDidChangeSlashCommands = Event.None;
				override async getSlashCommands() { return []; }
			}());
			reg.defineInstance(INewChatVoiceTargetService, disposableStore.add(new NewChatVoiceTargetService()));
			reg.defineInstance(IVoiceInputModeService, new class extends mock<IVoiceInputModeService>() {
				override readonly selectedMode = observableValue<VoiceInputMode>('selectedMode', 'voice');
				override readonly voiceAvailable = observableValue<boolean>('voiceAvailable', false);
				override readonly dictationAvailable = observableValue<boolean>('dictationAvailable', false);
				override readonly handsFree = observableValue<boolean>('handsFree', true);
				override readonly simulatedVoiceState = observableValue<undefined>('simulatedVoiceState', undefined);
				override readonly simulatedHandsFree = observableValue<undefined>('simulatedHandsFree', undefined);
				override readonly simulatedVersion = observableValue<undefined>('simulatedVersion', undefined);
				override readonly simulatedHover = observableValue<boolean>('simulatedHover', false);
			}());
			reg.defineInstance(IVoiceSessionController, new class extends mock<IVoiceSessionController>() {
				override readonly isConnected = observableValue<boolean>('isConnected', false);
				override readonly isConnecting = observableValue<boolean>('isConnecting', false);
				override readonly voiceState = observableValue<'idle' | 'listening' | 'processing' | 'speaking' | 'error'>('voiceState', 'idle');
				override readonly targetSession = observableValue<URI | undefined>('targetSession', undefined);
				override readonly transcriptTurns = observableValue<never[]>('transcriptTurns', []);
			}());
			reg.defineInstance(ITtsPlaybackService, new class extends mock<ITtsPlaybackService>() {
				override readonly analyserNode = undefined;
			}());
			reg.defineInstance(IMicCaptureService, new class extends mock<IMicCaptureService>() {
				override readonly analyserNode = undefined;
			}());
			reg.defineInstance(IChatSpeechToTextService, new class extends mock<IChatSpeechToTextService>() {
				override readonly onDidChangeState = Event.None;
				override readonly onDidChangePreparingModel = Event.None;
				override readonly state = ChatSpeechToTextState.Idle;
				override readonly isConfigured = false;
				override readonly isPreparingModel = false;
			}());
		},
	});

	container.style.width = '600px';
	container.style.height = '160px';
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');

	// `.new-chat-in-session` scopes the layout overrides and
	// `.new-chat-widget-container.revealed` flips `.new-chat-input-container`
	// from `display: none` to visible.
	const root = dom.append(container, dom.$('.new-chat-in-session.sessions-chat-widget'));
	const widgetContainer = dom.append(root, dom.$('.new-chat-widget-container.revealed'));
	const content = dom.append(widgetContainer, dom.$('.new-chat-widget-content'));

	const session = observableValue<IActiveSession | undefined>('session', undefined);
	const widget = disposableStore.add(instantiationService.createInstance(NewChatInputWidget, {
		session,
		getContextFolderUri: () => undefined,
		sendRequest: async () => { },
		canSendRequest: observableValue('canSendRequest', true),
		loading: observableValue('loading', false),
	}));

	widget.render(content, container);

	// The widget lays out its editor on the input container's `animationend`; in the
	// fixture there is no animation, so seed the value and lay out explicitly.
	await new Promise(r => setTimeout(r, 50));
	const editor = widget.inputEditor;
	if (editor) {
		if (value !== undefined) {
			editor.getModel()?.setValue(value);
		}
		editor.layout();
		if (selection) {
			editor.setSelection(selection);
		}
	}
	await new Promise(r => setTimeout(r, 50));
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/newInput/' }, {
	Default: defineComponentFixture({ render: context => renderNewChatInput(context, { value: 'What are you building?' }) }),
	// Partial multi-line selection so the reverse-rounded selection corners are
	// rendered. These cut-out pieces use `.monaco-editor-background`, which the
	// sessions CSS forces transparent — the bug shows here as blocky corners.
	Selection: defineComponentFixture({
		render: context => renderNewChatInput(context, {
			value: 'asdasd asdasd asdasd\nasd\nasdasd asdasd asdasd asdasd',
			selection: { startLineNumber: 1, startColumn: 3, endLineNumber: 3, endColumn: 8 },
		})
	}),
	// A recognized slash command is highlighted (`.sessions-slash-command`) and,
	// since nothing follows it, its description renders as ghost text
	// (`.sessions-slash-placeholder`).
	SlashCommand: defineComponentFixture({ render: context => renderNewChatInput(context, { value: '/models' }) }),
	// A `#file:` reference is highlighted via `.sessions-variable-reference`.
	VariableReference: defineComponentFixture({ render: context => renderNewChatInput(context, { value: 'Explain #file:src/app.ts to me' }) }),
});

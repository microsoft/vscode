/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IChatTipService } from '../../../../../workbench/contrib/chat/browser/chatTipService.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js';
import { IMicCaptureService } from '../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { IVoiceInputModeService, VoiceInputMode } from '../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js';
import { IAICustomizationWorkspaceService } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IHistoryService } from '../../../../../workbench/services/history/common/history.js';
import { ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { activeSessionViewBackground } from '../../../../common/theme.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { IAquariumService } from '../../../aquarium/browser/aquariumOverlay.js';
import { NewChatView } from '../../browser/chatView.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';

import '../../../../browser/media/style.css';
import '../../../../browser/parts/media/sessionView.css';

const WIDTH = 800;
const HEIGHT = 360;

/**
 * Renders the whole new-session composer (`NewChatView` → `NewChatWidget`) inside
 * a `.session-view` so the draft-comments banner sits above the input the way it
 * does in the Agents window.
 *
 * Deliberately a separate file from `newChatInput.fixture.ts`: pulling
 * `NewChatView` into that module would change the order its stylesheets are
 * injected in, and `.new-chat-bottom-container` is styled by two equally
 * specific rules (`chatWidget.css` vs `newChatInSession.css`) that source order
 * decides between.
 */
async function renderNewChatWidget(context: ComponentFixtureContext, commentCount: number, showTip: boolean): Promise<void> {
	const { container, disposableStore } = context;
	const feedbackItems: readonly IAgentFeedback[] = Array.from({ length: commentCount }, (_, index) => ({
		id: `feedback-${index}`,
		text: `Comment ${index + 1}`,
		resourceUri: URI.file(`/workspace/src/file-${index + 1}.ts`),
		range: new Range(index + 1, 1, index + 1, 8),
		sessionResource: AGENT_FEEDBACK_NEW_SESSION_RESOURCE,
		kind: AgentFeedbackKind.UserReview,
		state: AgentFeedbackState.Accepted,
	}));

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IChatTipService, new class extends mock<IChatTipService>() {
				override readonly onDidDismissTip = Event.None;
				override readonly onDidNavigateTip = Event.None;
				override readonly onDidHideTip = Event.None;
				override readonly onDidDisableTips = Event.None;
				override getWelcomeTip() {
					return showTip ? { id: 'fixture-tip', content: new MarkdownString('**Tip:** Reference files or folders with # to give the agent more context.') } : undefined;
				}
				override resetSession(): void { }
				override hasMultipleTips(): boolean { return false; }
			}());
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
			reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
				override readonly onDidChangeRecentWorkspaces = Event.None;
				override getRecentWorkspaces() { return []; }
			}());
			reg.defineInstance(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() { }());
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly onDidChangeDiscovering = Event.None;
				override readonly selectedProviderId = undefined;
				override readonly hosts = [];
				override readonly isDiscovering = false;
				override async rediscover(): Promise<void> { }
			}());
			reg.defineInstance(IAquariumService, new class extends mock<IAquariumService>() {
				override mountToggle() {
					return { dispose() { }, setHostVisible() { } };
				}
			}());
			reg.defineInstance(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
				override readonly onDidChangeFeedback = Event.None;
				override readonly onDidChangeFeedbackScope = Event.None;
				override getFeedback(sessionResource: URI): readonly IAgentFeedback[] {
					return sessionResource.toString() === AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString() ? feedbackItems : [];
				}
				override getFeedbackSessionResource() { return undefined; }
				override async revealFeedback(): Promise<void> { }
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

	container.style.width = `${WIDTH}px`;
	container.style.height = `${HEIGHT}px`;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');

	const sessionView = dom.append(container, dom.$('.session-view.is-active'));
	sessionView.style.width = '100%';
	sessionView.style.height = '100%';
	sessionView.style.backgroundColor = asCssVariable(activeSessionViewBackground);
	sessionView.style.setProperty('--session-view-background', asCssVariable(activeSessionViewBackground));
	const sessionViewContent = dom.append(sessionView, dom.$('.session-view-content'));
	sessionViewContent.style.width = '100%';
	sessionViewContent.style.height = '100%';

	const view = disposableStore.add(instantiationService.createInstance(NewChatView, false, {
		renderSessionTypePickerInControls: constObservable(true),
	}));
	sessionViewContent.appendChild(view.element);
	view.layout(WIDTH, HEIGHT, 0, 0);
	await new Promise(resolve => setTimeout(resolve, 100));
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/newWidget/' }, {
	NewSessionComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, 3, false),
	}),
	NewSessionTip: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, 0, true),
	}),
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatTipService } from '../../../../../workbench/contrib/chat/browser/chatTipService.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js';
import { IMicCaptureService } from '../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
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
import { ChatModelSource, IChat, ISession, ISessionWorkspace, ISessionType, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { IAquariumService } from '../../../aquarium/browser/aquariumOverlay.js';
import { computeIssueIcon, computePullRequestIcon, GitHubIssueState, GitHubPullRequestState } from '../../../github/common/types.js';
import { NewChatView } from '../../browser/chatView.js';
import { INewSessionComposerService, INewSessionPromptOption, NewSessionComposerService, NewSessionPromptOptionsState } from '../../browser/newSessionComposerService.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';

import '../../../../browser/media/style.css';
import '../../../../browser/parts/media/sessionView.css';

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 560;

interface INewChatWidgetFixtureOptions {
	readonly width?: number;
	readonly height?: number;
	readonly commentCount?: number;
	readonly showTip?: boolean;
	readonly promptOptions?: NewSessionPromptOptionsState;
	readonly selectedOptionIndex?: number;
	readonly editedInput?: string;
}

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
async function renderNewChatWidget(context: ComponentFixtureContext, options: INewChatWidgetFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	const {
		width = DEFAULT_WIDTH,
		height = DEFAULT_HEIGHT,
		commentCount = 0,
		showTip = false,
		promptOptions,
		selectedOptionIndex,
		editedInput,
	} = options;
	const feedbackItems: readonly IAgentFeedback[] = Array.from({ length: commentCount }, (_, index) => ({
		id: `feedback-${index}`,
		text: `Comment ${index + 1}`,
		resourceUri: URI.file(`/workspace/src/file-${index + 1}.ts`),
		range: new Range(index + 1, 1, index + 1, 8),
		sessionResource: AGENT_FEEDBACK_NEW_SESSION_RESOURCE,
		kind: AgentFeedbackKind.UserReview,
		state: AgentFeedbackState.Accepted,
	}));
	const workspace = createFixtureWorkspace();
	const sessionTypes = createFixtureSessionTypes();
	const provider = createFixtureProvider(workspace, sessionTypes);
	const activeSession = promptOptions ? createFixtureActiveSession(workspace, sessionTypes[0]) : undefined;
	const activeSessionObservable = observableValue<IActiveSession | undefined>('activeSession', activeSession);
	const composerService = disposableStore.add(new NewSessionComposerService());
	const sessionsService = new class extends mock<ISessionsService>() {
		override readonly activeSession = activeSessionObservable;
	}();

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = extUri;
			}());
			reg.defineInstance(INewSessionComposerService, composerService);
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
				override getSessionTypesForFolder() {
					return activeSession ? sessionTypes.map(sessionType => ({ providerId: provider.id, sessionType })) : [];
				}
			}());
			reg.defineInstance(ISessionsService, sessionsService);
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return activeSession ? [provider] : []; }
				override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
					return (providerId === provider.id ? provider : undefined) as T | undefined;
				}
			}());
			reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
				override readonly onDidChangeRecentWorkspaces = Event.None;
				override getRecentWorkspaces() { return []; }
				override addRecentWorkspace(): void { }
				override removeRecentWorkspace(): void { }
				override clearCheckedWorkspace(): void { }
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
				override readonly onDidChangeFeedbackVisibility = Event.None;
				override readonly onDidChangeFeedbackScope = Event.None;
				override readonly onDidRevealSessionComment = Event.None;
				override getVisibleResolvedFeedbackIds(): ReadonlySet<string> { return new Set(); }
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
			reg.defineInstance(INewChatVoiceTargetService, disposableStore.add(new NewChatVoiceTargetService(
				sessionsService,
				new class extends mock<IChatWidgetService>() {
					override readonly onDidChangeFocusedSession = Event.None;
				}(),
			)));
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
				override readonly hasDraftTarget = observableValue<boolean>('hasDraftTarget', false);
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
				override readonly onDidChangeDownloadingModel = Event.None;
				override readonly state = ChatSpeechToTextState.Idle;
				override readonly isConfigured = false;
				override readonly isPreparingModel = false;
				override readonly isDownloadingModel = false;
			}());
		},
	});

	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
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
		renderSessionTypePickerInControls: constObservable(!promptOptions),
	}));
	sessionViewContent.appendChild(view.element);
	view.layout(width, height, 0, 0);

	if (promptOptions) {
		composerService.activeComposer.get()?.showPromptOptions(promptOptions);
		if (promptOptions.kind === 'resolved' && selectedOptionIndex !== undefined) {
			const buttons = view.element.querySelectorAll<HTMLElement>('.new-session-prompt-option.monaco-button');
			buttons[selectedOptionIndex]?.click();
			await Promise.resolve();
			await Promise.resolve();
		}
		if (editedInput !== undefined) {
			view.prefillInput(editedInput);
		}
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/newWidget/' }, {
	NewSessionComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { commentCount: 3 }),
	}),
	NewSessionTip: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { showTip: true }),
	}),
	PromptOptionsLoading: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { promptOptions: { kind: 'loading' } }),
	}),
	PromptOptionsStandard: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { promptOptions: { kind: 'resolved', options: createStandardPromptOptions() } }),
	}),
	PromptOptionsGitHubMixed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, { promptOptions: { kind: 'resolved', options: createMixedPromptOptions() } }),
	}),
	PromptOptionsSelected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, {
			promptOptions: { kind: 'resolved', options: createStandardPromptOptions() },
			selectedOptionIndex: 0,
		}),
	}),
	PromptOptionsEditedDisabled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			const promptOptions = createStandardPromptOptions();
			return renderNewChatWidget(context, {
				promptOptions: { kind: 'resolved', options: promptOptions },
				selectedOptionIndex: 0,
				editedInput: `${promptOptions[0].prompt} Add a regression test too.`,
			});
		},
	}),
	PromptOptionsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderNewChatWidget(context, {
			width: 420,
			height: 760,
			promptOptions: { kind: 'resolved', options: createMixedPromptOptions() },
		}),
	}),
});

function createFixtureWorkspace(): ISessionWorkspace {
	const resource = URI.file('C:\\Code\\vscode');
	return {
		uri: resource,
		label: 'microsoft/vscode',
		icon: Codicon.repo,
		folders: [{
			root: resource,
			workingDirectory: resource,
			name: 'microsoft/vscode',
			description: undefined,
			gitRepository: {
				uri: resource,
				workTreeUri: undefined,
				baseBranchName: 'main',
				gitHubInfo: constObservable({ owner: 'microsoft', repo: 'vscode' }),
			},
		}],
		requiresWorkspaceTrust: true,
		isVirtualWorkspace: false,
	};
}

function createFixtureSessionTypes(): readonly ISessionType[] {
	return [
		{
			id: 'copilotcli',
			label: 'Copilot CLI',
			icon: Codicon.terminal,
			authRequirement: SessionTypeAuthRequirement.None,
		},
		{
			id: 'claude',
			label: 'Claude',
			icon: Codicon.sparkle,
			authRequirement: SessionTypeAuthRequirement.None,
		},
	];
}

function createFixtureProvider(workspace: ISessionWorkspace, sessionTypes: readonly ISessionType[]): ISessionsProvider {
	return new class extends mock<ISessionsProvider>() {
		override readonly id = 'fixture-provider';
		override readonly label = 'Fixture Provider';
		override readonly icon = Codicon.terminal;
		override readonly order = 0;
		override readonly sessionTypes = sessionTypes;
		override readonly onDidChangeSessionTypes = Event.None;
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidChangeModels = Event.None;
		override readonly browseActions = [];

		override getSessions(): ISession[] {
			return [];
		}

		override resolveWorkspace(folderUri: URI): ISessionWorkspace | undefined {
			return folderUri.toString() === workspace.folders[0].root.toString() ? workspace : undefined;
		}

		override getModelsSnapshot() {
			return {
				models: [],
				desiredModelResolution: { kind: 'notRequested' as const },
				modelTarget: 'agent-host-copilotcli',
			};
		}

		override getModelPickerOptions() {
			return {
				useGroupedModelPicker: true,
				showFeatured: false,
				showUnavailableFeatured: false,
				showManageModelsAction: false,
				showAutoModel: true,
			};
		}

		override setModel(): void { }
	}();
}

function createFixtureActiveSession(workspace: ISessionWorkspace, sessionType: ISessionType): IActiveSession {
	const activeChat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('fixture-chat://new-session');
		// Read by model selection: an untitled chat with no model of its own.
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly modelId = constObservable<string | undefined>(undefined);
		override readonly modelSource = constObservable<ChatModelSource | undefined>(undefined);
	}();
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.from({ scheme: 'fixture-session', path: '/fixture-session' });
		override readonly sessionId = 'fixture-session';
		override readonly providerId = 'fixture-provider';
		override readonly sessionType = sessionType.id;
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly isCreated = constObservable(false);
		override readonly loading = constObservable(false);
		override readonly workspace = constObservable(workspace);
		override readonly modelId = constObservable<string | undefined>(undefined);
		override readonly activeChat = constObservable(activeChat);
	}();
}

function createStandardPromptOptions(): readonly INewSessionPromptOption[] {
	return [
		{
			id: 'standard:implementFeature',
			title: 'Implement a feature',
			description: 'Describe what you want to build',
			prompt: 'Help me implement [describe the feature] in this project. Ask me questions if anything is unclear regarding the intended behaviour.',
			placeholder: '[describe the feature]',
			icon: Codicon.lightbulbSparkleAutofix,
		},
		{
			id: 'standard:fixBug',
			title: 'Fix a bug',
			description: 'Describe the unexpected behavior',
			prompt: 'Help me fix [describe the bug] in this project. Ask me questions if anything is unclear regarding the bug or the intended behaviour.',
			placeholder: '[describe the bug]',
			icon: Codicon.bug,
		},
		{
			id: 'standard:fixCi',
			title: 'Fix CI',
			description: 'Describe a failing check or paste a link',
			prompt: 'Help me fix the failing CI for [describe the CI failure or paste a link] in this project. Ask me questions if anything is unclear regarding the CI failure or how it should be fixed.',
			placeholder: '[describe the CI failure or paste a link]',
			icon: Codicon.runErrors,
		},
	];
}

function createMixedPromptOptions(): readonly INewSessionPromptOption[] {
	return [
		{
			id: 'githubIssue:327101',
			title: 'Tackle issue',
			titleDetail: '#327101',
			description: 'Improve the accessibility of inline chat controls',
			prompt: 'Tackle the following issue and create a pull request for it: "Improve the accessibility of inline chat controls" (https://github.com/microsoft/vscode/issues/327101).',
			placeholder: '',
			icon: computeIssueIcon(GitHubIssueState.Open, undefined),
		},
		{
			id: 'githubIssue:326842',
			title: 'Tackle issue',
			titleDetail: '#326842',
			description: 'Preserve editor state when switching sessions',
			prompt: 'Tackle the following issue and create a pull request for it: "Preserve editor state when switching sessions" (https://github.com/microsoft/vscode/issues/326842).',
			placeholder: '',
			icon: computeIssueIcon(GitHubIssueState.Open, undefined),
		},
		{
			id: 'githubCiFailure:329629',
			title: 'Fix CI',
			titleDetail: '#329629',
			description: 'Add GitHub prompt variation to onboarding',
			prompt: 'The following pull request has failing CI checks: "Add GitHub prompt variation to onboarding" (https://github.com/microsoft/vscode/pull/329629). Investigate the failures and resolve them.',
			placeholder: '',
			icon: computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }),
		},
	];
}

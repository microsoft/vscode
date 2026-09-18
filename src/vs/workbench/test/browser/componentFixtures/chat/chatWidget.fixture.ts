/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { IMenuItem, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { ChatModel, ChatRequestSource } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatListWidget } from '../../../../contrib/chat/browser/widget/chatListWidget.js';
import { chatFloatingPersistentContentClass, chatPersistentContentHeightVariable } from '../../../../contrib/chat/browser/widget/chatWidget.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatWidget, IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ChatMcpServersStarting, ElicitationState, IChatExternalEdit, IChatQuestion, IChatService, IChatSimpleToolInvocationData, IChatSystemNotificationPart, IChatToolInvocation, ToolConfirmKind } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatElicitationRequestPart } from '../../../../contrib/chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatQuestionCarouselData } from '../../../../contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatPlanReviewData } from '../../../../contrib/chat/common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ILanguageModelToolsService, IToolData, IToolResultInputOutputDetails, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../../contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { MockLanguageModelToolsConfirmationService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsConfirmationService.js';
import { MockLanguageModelToolsService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsService.js';
import { IChatToolRiskAssessmentService, IToolRiskAssessment, ToolRiskLevel } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILinkPresentationService } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatProgressAnimation, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { PROMPT_TIMELINE_STICKY_SCROLL_SETTING } from '../../../../contrib/chat/common/promptTimeline.js';
import { SessionType } from '../../../../contrib/chat/common/chatSessionsService.js';
import { IChatEditingService, IChatEditingSession, IEditSessionEntryDiff } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatResponseFileChangesService, IChatResponseFileEdit } from '../../../../contrib/chat/browser/chatResponseFileChangesService.js';
import { MockChatService } from '../../../../contrib/chat/test/common/chatService/mockChatService.js';
import { MockChatEditingSession } from '../../../../contrib/chat/test/common/mockChatEditingSession.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, type ServiceRegistration } from '../fixtureUtils.js';
import { FixtureMenuService, registerChatFixtureServices, registerSubagentFixtureServices } from './chatFixtureUtils.js';
import { IDetachedXTermOptions, ITerminalChatService, ITerminalConfigurationService, ITerminalService } from '../../../../contrib/terminal/browser/terminal.js';
import { createFakeDetachedTerminal } from '../../../../contrib/terminal/test/browser/chatTerminalMirrorTestUtils.js';
import { ChatPetWidget } from '../../../../contrib/chat/browser/widget/chatPetWidget.js';
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../../../contrib/chat/browser/planReviewFeedback/planReviewFeedbackService.js';
import { AgentEditorCommentsBridge, IAgentEditorCommentsBridge } from '../../../../services/agentEditorComments/common/agentEditorComments.js';
import type { IChatRequestVariableEntry } from '../../../../contrib/chat/common/attachments/chatVariableEntries.js';
import { IAutostartResult, IMcpService } from '../../../../contrib/mcp/common/mcpTypes.js';

// Load the bundled xterm module before the fixture's virtual clock starts.
// eslint-disable-next-line local/code-amd-node-module, local/code-import-patterns
import { Terminal as RawTerminal } from '@xterm/xterm';
// eslint-disable-next-line local/code-import-patterns
import '@xterm/xterm/css/xterm.css';
import '../../../../contrib/chat/browser/widget/media/chat.css';

export interface IFixtureFileChange {
	readonly name: string;
	readonly added: number;
	readonly removed: number;
	/** Whether the file was created (vs. edited) during the turn. */
	readonly created: boolean;
	/** Whether the file is outside the owning session workspace. */
	readonly isOutsideWorkspace?: boolean;
}

export interface IFixtureMessage {
	readonly user: string; // user prompt text
	readonly variables?: readonly IChatRequestVariableEntry[];
	readonly timestamp?: number;
	readonly assistant?: ReadonlyArray<
		| { kind: 'markdown'; text: string }
		| { kind: 'progress'; text: string }
		| { kind: 'thinking'; text: string; id?: string }
		| IChatExternalEdit
		| { kind: 'systemNotification'; notification: IChatSystemNotificationPart }
		| { kind: 'tool'; toolId: string; displayName: string; invocationMessage: string; pastTenseMessage?: string; streaming?: boolean; complete?: boolean; source?: ToolDataSource; approval?: 'pre' | 'post'; toolSpecificData?: IChatSimpleToolInvocationData; resultDetails?: IToolResultInputOutputDetails }
		| { kind: 'questionCarousel'; questions: IChatQuestion[]; message?: string; allowSkip?: boolean }
		| { kind: 'planReview'; title: string; content: string }
		| { kind: 'mcpStarting'; servers: readonly string[]; local?: boolean }
		| { kind: 'terminal'; command: string; output?: string; intention?: string; complete?: boolean }
		| { kind: 'subagent'; id: string; description: string; complete?: boolean }
		| { kind: 'terminalConfirmation'; command: string; title?: string; disclaimer?: string; requestUnsandboxedExecution?: boolean; requestUnsandboxedExecutionReason?: string; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean; confirmation?: { commandLine: string; cwdLabel?: string; cdPrefix?: string } }
		| { kind: 'elicitation'; title: string; message: string; confirmation?: { commandLine: string; cwdLabel?: string; cdPrefix?: string }; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean }
	>;
	readonly details?: string;
	readonly responseComplete?: boolean;
	/** Whether the request is a host-initiated turn rendered with its specialized presentation. */
	readonly isSystemInitiated?: boolean;
	readonly requestSource?: ChatRequestSource;
	/** Whether the request half of the turn stays out of the transcript. */
	readonly requestHidden?: boolean;
	/**
	 * Per-turn file changes surfaced via {@link IChatResponseFileChangesService},
	 * used by the turn changes summary. Requires `agentHostSession` on the fixture
	 * options to be rendered.
	 */
	readonly fileChanges?: ReadonlyArray<IFixtureFileChange>;
}

export interface IChatWidgetFixtureOptions {
	readonly messages: ReadonlyArray<IFixtureMessage>;
	readonly width?: number;
	readonly height?: number;
	readonly listHeight?: number;
	/** Total horizontal padding reserved when laying out response content and embedded editors. */
	readonly contentHorizontalPadding?: number;
	/** Whether to render the main chat input. Defaults to `true`. */
	readonly inputVisible?: boolean;
	/** Whether to populate the response footer with an action. */
	readonly responseFooterAction?: boolean;
	/** Whether to show request and response timing details. */
	readonly verbose?: boolean;
	readonly checkpointsEnabled?: boolean;
	/**
	 * When `false`, registers a stub `IChatToolRiskAssessmentService` whose
	 * `isEnabled()` returns `false`, exercising the "feature off" code path.
	 * When omitted, behaves like today (auto-detected from message risk data).
	 */
	readonly riskAssessmentEnabled?: boolean;
	/**
	 * Optional hook invoked after the chat input part renders, e.g. to mount
	 * widgets above the input. Receives the rendered input part and the fixture's
	 * instantiation service so callers can create instances against the same
	 * service graph.
	 */
	readonly decorateInputPart?: (inputPart: ChatInputPart, instantiationService: IInstantiationService) => void;
	/**
	 * When set, renders the chat as an agent host session, so completed turns with
	 * {@link IFixtureMessage.fileChanges} show workspace changes and external
	 * Markdown previews under the response.
	 */
	readonly agentHostSession?: boolean;
	readonly linkPresentationService?: ILinkPresentationService;
	readonly menuItems?: ReadonlyArray<{ readonly menuId: MenuId; readonly item: IMenuItem }>;
	/** Registers fixture-specific services after the shared chat service graph. */
	readonly additionalServices?: (registration: ServiceRegistration) => void;
	readonly onRendered?: (handle: IChatWidgetFixtureHandle) => void;
	/** Selects the input-height consumer used by the ResizeObserver harness. */
	readonly hostLayoutMode?: 'none' | 'listOnly' | 'stackedFull' | 'stackedTargeted';
	/** Mirrors `IChatWidgetViewOptions.persistentContentHeight` for content mounted by {@link IChatWidgetFixtureOptions.decorateInputPart}. */
	readonly persistentContentHeight?: number;
	/** Enables or disables both settings required by the real tree-based sticky-scroll path. */
	readonly stickyScroll?: boolean;
	/** Enables the response-level persistent progress indicator. */
	readonly persistentProgress?: ChatProgressAnimation;
	/** Product quality used to select Stable or Insiders product branding. */
	readonly productQuality?: 'stable' | 'insider';
	readonly thinkingStyle?: ThinkingDisplayMode;
	readonly collapseCompletedResponses?: boolean;
	readonly terminalToolsInThinking?: boolean;
	readonly simpleTerminalCollapsible?: boolean;
	readonly thinkingPhrases?: readonly string[];
	readonly richSubagents?: boolean;
	readonly editingSession?: IChatEditingSession;
}

export interface IChatWidgetFixtureHandle {
	readonly instantiationService: ReturnType<typeof createEditorServices>;
	readonly inputPart: ChatInputPart;
	readonly listWidget: ChatListWidget;
	readonly model: ChatModel;
	readonly viewModel: ChatViewModel;
	readonly width: number;
	readonly addTerminalConfirmation: (request: ReturnType<ChatModel['addRequest']>, command: string) => void;
}

function makeFileDiff(change: IFixtureFileChange): IChatResponseFileEdit {
	// A created file has no before-content, so the agent host provider maps its
	// `originalURI` to the `modifiedURI` (equal URIs); an edited file keeps a
	// distinct original.
	const root = change.isOutsideWorkspace ? '/home/user' : '/repo';
	const modifiedURI = URI.file(`${root}/${change.name}`);
	const originalURI = change.created ? modifiedURI : URI.file(`${root}/.original/${change.name}`);
	return { originalURI, modifiedURI, added: change.added, removed: change.removed, quitEarly: false, identical: false, isFinal: true, isBusy: false, isOutsideWorkspace: change.isOutsideWorkspace ?? false };
}

function makeUserMessage(text: string) {
	return {
		text,
		parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)],
	};
}

export async function renderChatWidget(context: ComponentFixtureContext, options: IChatWidgetFixtureOptions): Promise<void> {
	const { container, disposableStore } = context;

	const widgetHolder: { current: IChatWidget | undefined } = { current: undefined };
	const hasSubagents = options.messages.some(message => message.assistant?.some(part => part.kind === 'subagent'));
	const hasTerminalOutput = options.messages.some(message => message.assistant?.some(part => part.kind === 'terminal' && part.output));

	const fixtureToolData: IToolData = {
		id: 'fixture.terminalTool',
		displayName: 'Terminal',
		modelDescription: 'Run a command in the terminal',
		source: ToolDataSource.Internal,
	};

	// Collect risk assessments from messages so the risk badge service can
	// return them synchronously via getCached().
	const hasRiskAssessment = options.messages.some(m => m.assistant?.some(p => (p.kind === 'terminalConfirmation' || p.kind === 'elicitation') && p.riskAssessment));
	const hasRiskLoading = options.messages.some(m => m.assistant?.some(p => (p.kind === 'terminalConfirmation' || p.kind === 'elicitation') && p.riskLoading));
	const riskFeatureExplicitlyDisabled = options.riskAssessmentEnabled === false;
	const needsRiskService = hasRiskAssessment || hasRiskLoading || riskFeatureExplicitlyDisabled;

	// Maps a completed turn's requestId to its per-turn file diffs, consumed by
	// the turn changes summary via the stubbed IChatResponseFileChangesService.
	const requestDiffs = new Map<string, readonly IEditSessionEntryDiff[]>();
	const requestFileEdits = new Map<string, readonly IChatResponseFileEdit[]>();
	const isAgentHostSession = options.agentHostSession === true;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			registerChatFixtureServices(reg);
			if (options.messages.some(message => message.assistant?.some(part => part.kind === 'tool' && part.approval))) {
				reg.defineInstance(ILanguageModelToolsService, context.disposableStore.add(new MockLanguageModelToolsService()));
				reg.defineInstance(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
			}
			if (hasSubagents) {
				registerSubagentFixtureServices(reg);
			}
			reg.define(IAgentEditorCommentsBridge, AgentEditorCommentsBridge);
			reg.define(IPlanReviewFeedbackService, PlanReviewFeedbackService);
			if (hasLocalMcpAutostart(options.messages)) {
				reg.defineInstance(IMcpService, new class extends mock<IMcpService>() {
					override readonly servers = constObservable([]);
				}());
			}
			if (options.productQuality) {
				reg.defineInstance(IProductService, new class extends mock<IProductService>() {
					override readonly quality = options.productQuality;
				}());
			}
			reg.definePartialInstance(ITerminalChatService, {
				getTerminalInstanceByExecutionId: () => undefined,
				getTerminalInstanceByToolSessionId: async () => undefined,
				registerProgressPart: () => toDisposable(() => { }),
				setFocusedProgressPart: () => { },
				clearFocusedProgressPart: () => { },
			});
			reg.definePartialInstance(ITerminalService, {
				whenConnected: Promise.resolve(),
				...(hasTerminalOutput ? {
					createDetachedTerminal: async (options: IDetachedXTermOptions) => {
						const font = { fontFamily: 'monospace', fontSize: 13, letterSpacing: 0, lineHeight: 1, charWidth: 8, charHeight: 16 };
						const terminal = createFakeDetachedTerminal(RawTerminal, options, font);
						terminal.raw.options.fontFamily = font.fontFamily;
						terminal.raw.options.fontSize = font.fontSize;
						terminal.instance.attachToElement = element => {
							if (!terminal.raw.element) {
								terminal.raw.open(element);
							}
						};
						return terminal.instance;
					},
				} : {}),
			});
			reg.definePartialInstance(ITerminalConfigurationService, {
				getFont: () => ({ fontFamily: 'monospace', fontSize: 13, letterSpacing: 0, lineHeight: 1, charWidth: 8, charHeight: 16 }),
			});
			if (options.linkPresentationService) {
				reg.defineInstance(ILinkPresentationService, options.linkPresentationService);
			}
			// Override widget service so the chat list renderer can route tool
			// confirmations to the carousel attached to our input part.
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override readonly lastFocusedWidget = undefined;
				override readonly onDidAddWidget = Event.None;
				override readonly onDidRemoveWidget = Event.None;
				override readonly onDidBackgroundSession = Event.None;
				override readonly onDidChangeFocusedWidget = Event.None;
				override readonly onDidChangeFocusedSession = Event.None;
				override getAllWidgets() { return widgetHolder.current ? [widgetHolder.current] : []; }
				override getWidgetByInputUri() { return undefined; }
				override getWidgetBySessionResource() { return widgetHolder.current; }
				override getWidgetsByLocations() { return []; }
				override async openSession(resource: URI) {
					container.dataset.openedSubagent = resource.toString();
					return undefined;
				}
				override register() { return { dispose() { } }; }
			}());

			if (isAgentHostSession) {
				reg.defineInstance(IChatResponseFileChangesService, new class extends mock<IChatResponseFileChangesService>() {
					override getChangesForRequest(_sessionResource: URI, requestId: string) {
						return constObservable(requestDiffs.get(requestId) ?? []);
					}
					override getFileEditsForRequest(_sessionResource: URI, requestId: string) {
						return constObservable(requestFileEdits.get(requestId) ?? []);
					}
				}());
			}

			if (needsRiskService) {
				reg.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {
					override onDidChangeTools = Event.None;
					override onDidPrepareToolCallBecomeUnresponsive = Event.None;
					override getTools() { return [fixtureToolData]; }
					override getTool(id: string) { return id === fixtureToolData.id ? fixtureToolData : undefined; }
				}());
				reg.defineInstance(IChatToolRiskAssessmentService, new class extends mock<IChatToolRiskAssessmentService>() {
					override isEnabled() { return !riskFeatureExplicitlyDisabled; }
					override getCached() {
						// Return the first risk assessment found in the fixture messages.
						for (const m of options.messages) {
							for (const p of m.assistant ?? []) {
								if ((p.kind === 'terminalConfirmation' || p.kind === 'elicitation') && p.riskAssessment) {
									return p.riskAssessment;
								}
							}
						}
						return undefined;
					}
					// For riskLoading: assess() never resolves, keeping the badge in loading state.
					override async assess(): Promise<IToolRiskAssessment | undefined> { return new Promise(() => { }); }
				}());
			}
			options.additionalServices?.(reg);
		},
	});

	if (options.menuItems?.length) {
		const menuService = instantiationService.get(IMenuService);
		if (!(menuService instanceof FixtureMenuService)) {
			throw new Error('Fixture menu items require FixtureMenuService');
		}
		for (const { menuId, item } of options.menuItems) {
			menuService.addItem(menuId, item);
		}
	}
	if (hasSubagents) {
		const action = instantiationService.createInstance(MenuItemAction, { id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: 'Open Subagent' }, undefined, { shouldForwardArgs: true }, undefined, undefined);
		instantiationService.stub(IMenuService, instantiationService.get(IMenuService), 'getMenuActions', (id: MenuId): ReturnType<IMenuService['getMenuActions']> =>
			id === MenuId.ChatSubagentContent ? [['navigation', [action]]] : []);
	}

	const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	if (hasSubagents) {
		configService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, options.richSubagents ?? true);
	}
	configService.setUserConfiguration('chat', {
		editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'off' },
	});
	configService.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false });
	instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
	configService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
	if (options.persistentProgress !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.PersistentProgress, options.persistentProgress);
	}
	if (options.thinkingStyle !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.ThinkingStyle, options.thinkingStyle);
	}
	if (options.collapseCompletedResponses !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, options.collapseCompletedResponses);
	}
	if (options.terminalToolsInThinking !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.TerminalToolsInThinking, options.terminalToolsInThinking);
	}
	if (options.simpleTerminalCollapsible !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.SimpleTerminalCollapsible, options.simpleTerminalCollapsible);
	}
	if (options.thinkingPhrases) {
		configService.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: options.thinkingPhrases });
	}
	if (options.checkpointsEnabled !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, options.checkpointsEnabled);
	}
	if (options.verbose !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.Verbose, options.verbose);
	}
	if (options.stickyScroll !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, options.stickyScroll);
		configService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, options.stickyScroll);
	}
	// Build a real ChatModel populated with hand-crafted requests/responses, then drive a
	// real ChatViewModel + ChatListWidget — the same components used in production.
	// The turn changes summary only renders for agent host sessions, whose frontend
	// resource uses the session type as the scheme (e.g. `agent-host-copilotcli:/…`),
	// which is what `getChatSessionType` / `toAgentHostBackendSessionUri` recognize.
	const sessionResource = isAgentHostSession
		? URI.from({ scheme: SessionType.AgentHostCopilot, path: '/turn-pills-session' })
		: undefined;
	const chatService = instantiationService.get(IChatService) as MockChatService;
	const editingSession = options.editingSession;
	if (editingSession) {
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
			override createEditingSession() { return editingSession; }
		}());
	}
	const model = disposableStore.add(instantiationService.createInstance(
		ChatModel,
		undefined,
		{ initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: sessionResource }
	));
	chatService.addSession(model);
	if (editingSession) {
		model.startEditingSession();
	}

	for (const message of options.messages) {
		const request = model.addRequest(
			makeUserMessage(message.user),
			{ variables: message.variables ?? [] },
			0,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			message.isSystemInitiated,
			undefined,
			undefined,
			undefined,
			message.timestamp,
			undefined,
			undefined,
			message.requestHidden,
			message.requestSource,
		);
		const response = request.response!;
		if (message.fileChanges) {
			const fileEdits = message.fileChanges.map(makeFileDiff);
			requestDiffs.set(request.id, fileEdits.filter(diff => !diff.isOutsideWorkspace));
			requestFileEdits.set(request.id, fileEdits);
		}
		for (const part of message.assistant ?? []) {
			if (part.kind === 'markdown') {
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(part.text) });
			} else if (part.kind === 'progress') {
				model.acceptResponseProgress(request, { kind: 'progressMessage', content: new MarkdownString(part.text) });
			} else if (part.kind === 'thinking') {
				model.acceptResponseProgress(request, { kind: 'thinking', id: part.id ?? generateUuid(), value: part.text });
			} else if (part.kind === 'externalEdit') {
				model.acceptResponseProgress(request, part);
			} else if (part.kind === 'systemNotification') {
				model.acceptResponseProgress(request, part.notification);
			} else if (part.kind === 'tool') {
				const toolData: IToolData = {
					id: part.toolId,
					displayName: part.displayName,
					modelDescription: part.displayName,
					source: part.source ?? ToolDataSource.Internal,
				};
				const toolInvocation = part.streaming
					? ChatToolInvocation.createStreaming({ toolData, toolId: part.toolId, toolCallId: generateUuid(), chatRequestId: request.id })
					: new ChatToolInvocation({
						invocationMessage: new MarkdownString(part.invocationMessage),
						pastTenseMessage: new MarkdownString(part.pastTenseMessage ?? part.invocationMessage),
						toolSpecificData: part.toolSpecificData,
					}, toolData, generateUuid(), undefined, {}, {}, request.id);
				if (part.streaming) {
					toolInvocation.updateStreamingMessage(new MarkdownString(part.invocationMessage));
				}
				model.acceptResponseProgress(request, toolInvocation);
				if (part.approval) {
					toolInvocation.requestConfirmation({
						confirmationMessages: { title: 'Approve tool call?', message: new MarkdownString(part.invocationMessage), confirmResults: part.approval === 'post' },
					});
					if (part.approval === 'post') {
						const state = toolInvocation.state.get();
						if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
							throw new Error('Post-approval fixture requires a confirmable tool');
						}
						state.confirm({ type: ToolConfirmKind.ConfirmationNotNeeded });
						await toolInvocation.didExecuteTool({ content: [] });
					}
				} else if (part.complete) {
					await toolInvocation.didExecuteTool(part.resultDetails ? { content: [], toolResultDetails: part.resultDetails } : undefined);
				}
			} else if (part.kind === 'questionCarousel') {
				const carousel = new ChatQuestionCarouselData(part.questions, part.allowSkip ?? true, undefined, undefined, undefined, part.message);
				model.acceptResponseProgress(request, carousel);
			} else if (part.kind === 'planReview') {
				model.acceptResponseProgress(request, new ChatPlanReviewData(part.title, part.content, [{ label: 'Implement', default: true }], true));
			} else if (part.kind === 'subagent') {
				const invocation = new ChatToolInvocation({
					invocationMessage: part.description,
					toolSpecificData: {
						kind: 'subagent',
						description: part.description,
						agentName: 'task',
						modelName: 'Fixture model',
						prompt: 'Compute 1 + 1.',
						hasStarted: true,
						isActive: !part.complete,
						isChatAvailable: true,
						chatResource: `ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/${part.id}`,
						startedAt: Date.now() - 5000,
						duration: part.complete ? 5000 : undefined,
						result: part.complete ? '2' : undefined,
					},
				}, { id: 'task', displayName: 'Delegate task', modelDescription: 'Delegate task', source: ToolDataSource.Internal }, part.id, undefined, {}, {}, request.id);
				model.acceptResponseProgress(request, invocation);
				await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Subagent started in background.' }] });
				const child = new ChatToolInvocation(
					{ invocationMessage: 'Checking the sum' },
					{ id: 'calculate', displayName: 'Calculate', modelDescription: 'Calculate', source: ToolDataSource.Internal },
					`${part.id}-calculation`, part.id, {},
				);
				model.acceptResponseProgress(request, child);
				if (part.complete) {
					await child.didExecuteTool({ content: [{ kind: 'text', value: '2' }] });
				}
			} else if (part.kind === 'mcpStarting') {
				const servers = part.servers.map(name => ({ id: name, name }));
				if (part.local) {
					model.acceptResponseProgress(request, new ChatMcpServersStarting(observableValue<IAutostartResult>('mcpStartup', {
						working: true,
						starting: servers.map(server => ({ id: server.id, label: server.name })),
						serversRequiringInteraction: [],
					})));
				} else {
					model.acceptResponseProgress(request, {
						kind: 'mcpServersStartingSlow',
						sessionResource: model.sessionResource,
						servers: observableValue('mcpStartup', servers),
					});
				}
			} else if (part.kind === 'elicitation') {
				const elicitation = new ChatElicitationRequestPart(
					part.title,
					part.message,
					'',
					'Continue',
					'Cancel',
					async () => ElicitationState.Accepted,
					async () => ElicitationState.Rejected,
					undefined,
					undefined,
					undefined,
					part.riskAssessment || part.riskLoading ? { toolId: fixtureToolData.id, parameters: undefined } : undefined,
				);
				model.acceptResponseProgress(request, elicitation);
			} else if (part.kind === 'terminal' || part.kind === 'terminalConfirmation') {
				const confirmation = part.kind === 'terminalConfirmation' ? part : undefined;
				const title = confirmation?.title ?? 'Run pwsh command?';
				const toolInvocation = new ChatToolInvocation(
					{
						invocationMessage: new MarkdownString(`Running \`${part.command}\``),
						pastTenseMessage: message.responseComplete === false ? undefined : new MarkdownString(`Ran \`${part.command}\``),
						confirmationMessages: confirmation ? { title, message: new MarkdownString(`\`${part.command}\``), disclaimer: confirmation.disclaimer ? new MarkdownString(confirmation.disclaimer, { supportThemeIcons: true }) : undefined } : undefined,
						toolSpecificData: {
							kind: 'terminal',
							commandLine: { original: part.command },
							language: 'pwsh',
							isPty: part.kind === 'terminal' && part.output ? false : undefined,
							terminalCommandOutput: part.kind === 'terminal' && part.output ? { text: part.output } : undefined,
							intention: part.kind === 'terminal' ? part.intention : undefined,
							terminalCommandState: part.kind === 'terminal' && part.complete ? { exitCode: 0 } : undefined,
							requestUnsandboxedExecution: confirmation?.requestUnsandboxedExecution,
							requestUnsandboxedExecutionReason: confirmation?.requestUnsandboxedExecutionReason,
							confirmation: confirmation?.confirmation,
						},
					},
					fixtureToolData,
					generateUuid(),
					undefined,
					{ command: part.command },
				);
				model.acceptResponseProgress(request, toolInvocation);
				if (part.kind === 'terminal' && part.complete) {
					await toolInvocation.didExecuteTool({ content: [] });
				}
			}
		}
		if (message.details) {
			response.setResult({ details: message.details });
		}
		if (message.responseComplete !== false) {
			response.complete();
		}
	}

	const viewModel = disposableStore.add(instantiationService.createInstance(ChatViewModel, model, undefined));

	const width = options.width ?? 720;
	const height = options.height ?? 600;
	const listBackground = 'var(--vscode-editor-background)';
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	container.classList.add('monaco-workbench');

	// Mirror the product DOM ancestry: the chat widget lives inside
	// `.part.auxiliarybar > .content`, where auxiliaryBarPart.css recolors
	// inline editors with `--vscode-sideBar-background` (used by the carousel).
	const auxBar = dom.$('.part.auxiliarybar');
	auxBar.style.width = '100%';
	auxBar.style.height = '100%';
	const auxContent = dom.$('.content');
	auxContent.style.width = '100%';
	auxContent.style.height = '100%';
	auxBar.appendChild(auxContent);
	container.appendChild(auxBar);

	const session = dom.$('.interactive-session');
	session.style.setProperty('--vscode-chat-list-background', listBackground);
	if (options.persistentContentHeight) {
		// Same switch `ChatWidget.render` flips.
		session.classList.add(chatFloatingPersistentContentClass);
		session.style.setProperty(chatPersistentContentHeightVariable, `${options.persistentContentHeight}px`);
	}
	auxContent.appendChild(session);

	// Build the input part FIRST so the widget (with its inputPart) is registered
	// in IChatWidgetService before the list widget renders. The renderer queries
	// the service synchronously when routing tool confirmations to the carousel.
	// In production a chat widget always has an inputPart, so the fixture creates
	// one unconditionally; `withInput` only controls whether it is rendered in DOM.
	const menuService = instantiationService.get(IMenuService) as FixtureMenuService;
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.attachContext', title: '+', icon: Codicon.add }, group: 'navigation', order: -1 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModePicker', title: 'Agent' }, group: 'navigation', order: 1 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModelPicker', title: 'GPT-5.3-Codex' }, group: 'navigation', order: 3 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.configureTools', title: '', icon: Codicon.settingsGear }, group: 'navigation', order: 100 });
	menuService.addItem(MenuId.ChatExecute, { command: { id: 'workbench.action.chat.submit', title: 'Send', icon: Codicon.newLine }, group: 'navigation', order: 4 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openSessionTargetPicker', title: 'Local' }, group: 'navigation', order: 0 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openPermissionPicker', title: 'Default Permissions' }, group: 'navigation', order: 10 });
	if (options.responseFooterAction) {
		menuService.addItem(MenuId.ChatMessageFooter, { command: { id: 'workbench.action.chat.copyResponse', title: 'Copy', icon: Codicon.copy }, group: 'navigation', order: 1 });
	}

	const inputOptions: IChatInputPartOptions = {
		renderFollowups: false,
		renderInputToolbarBelowInput: false,
		renderWorkingSet: false,
		menus: { executeToolbar: MenuId.ChatExecute, telemetrySource: 'fixture' },
		widgetViewKindTag: 'view',
		inputEditorMinLines: 2,
	};
	const inputStyles: IChatInputStyles = {
		overlayBackground: 'var(--vscode-editor-background)',
		listForeground: 'var(--vscode-foreground)',
		listBackground,
	};

	const inputPart = disposableStore.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, inputOptions, inputStyles, false));

	const fixtureWidget = new class extends mock<IChatWidget>() {
		override readonly onDidChangeViewModel = disposableStore.add(new Emitter<never>()).event;
		override readonly viewModel = viewModel;
		override readonly domNode = session;
		override readonly contribs = [];
		override readonly location = ChatAgentLocation.Chat;
		override readonly viewContext = {};
		override readonly input = inputPart;
		override readonly inputPart = inputPart;
		override focusInput(): void { inputPart.focus(); }
		override getInput(): string { return inputPart.inputEditor.getValue(); }
		override reveal(...args: Parameters<IChatWidget['reveal']>): void { listWidget.reveal(...args); }
	}();
	widgetHolder.current = fixtureWidget;

	inputPart.render(session, '', fixtureWidget);
	inputPart.layout(width);

	options.decorateInputPart?.(inputPart, instantiationService);
	inputPart.element.classList.toggle('chat-input-hidden', options.inputVisible === false);

	const listContainer = dom.$('.interactive-list');
	listContainer.style.flex = options.hostLayoutMode ? '0 0 auto' : '1 1 auto';
	listContainer.style.minHeight = '0';
	listContainer.style.position = 'relative';
	// Prepend the list before the input so the visual order matches production.
	session.insertBefore(listContainer, session.firstChild);

	const listWidget = disposableStore.add(instantiationService.createInstance(
		ChatListWidget,
		listContainer,
		{
			currentChatMode: () => ChatModeKind.Agent,
			defaultElementHeight: 120,
			styles: {
				listForeground: 'var(--vscode-foreground)',
				listBackground,
			},
			location: ChatAgentLocation.Chat,
			paddingBottom: options.persistentContentHeight,
			rendererOptions: {
				contentHorizontalPadding: options.contentHorizontalPadding,
				progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
			},
		},
	));

	listWidget.setViewModel(viewModel);
	listWidget.setVisible(true);
	disposableStore.add(Event.runAndSubscribe(Event.accumulate(viewModel.onDidChange), () => listWidget.refresh()));

	const listHeight = options.listHeight ?? 420;
	listWidget.layout(listHeight, width);
	listWidget.scrollTop = 0;

	if (options.hostLayoutMode && options.hostLayoutMode !== 'none') {
		let layouting = false;
		disposableStore.add(autorun(reader => {
			const inputHeight = inputPart.height.read(reader);
			if (layouting) {
				return;
			}

			layouting = true;
			try {
				if (options.hostLayoutMode === 'stackedFull') {
					// Mirrors ChatViewPane's stacked-sessions convergence path:
					// the host synchronously lays out the input again.
					inputPart.setMaxHeight(Math.max(0, height - 50));
					inputPart.layout(width);
				}

				const contentHeight = options.hostLayoutMode === 'stackedFull' || options.hostLayoutMode === 'stackedTargeted'
					? Math.max(0, Math.max(116, inputHeight) - inputHeight)
					: Math.max(0, height - inputHeight);
				listContainer.style.height = `${contentHeight}px`;
				listContainer.dataset.expectedHeight = String(contentHeight);
				listWidget.layout(contentHeight, width);
			} finally {
				layouting = false;
			}
		}));
	}

	options.onRendered?.({
		instantiationService,
		inputPart,
		listWidget,
		model,
		viewModel,
		width,
		addTerminalConfirmation: (request, command) => {
			model.acceptResponseProgress(request, new ChatToolInvocation(
				{
					invocationMessage: new MarkdownString(`Running \`${command}\``),
					confirmationMessages: { title: 'Run diagnostic command?', message: new MarkdownString(`\`${command}\``) },
					toolSpecificData: {
						kind: 'terminal',
						commandLine: { original: command },
						language: 'pwsh',
					},
				},
				fixtureToolData,
				generateUuid(),
				undefined,
				{ command },
			));
		},
	});
}

const SIMPLE_QA: IFixtureMessage[] = [
	{
		user: 'Add a fibonacci function to fibon.ts',
		assistant: [
			{ kind: 'markdown', text: 'I added a recursive `fibonacci(n)` to `fibon.ts`. Note that recursion is exponential — for large `n` consider an iterative version.' },
		],
	},
];

const SCROLL_TO_BOTTOM_ACTION: IFixtureMessage[] = [
	{
		user: [
			'Please investigate why the chat transcript sometimes stops following a long-running agent response after I scroll upward to review an earlier step. Trace the list scroll state, the lock that controls automatic scrolling, and the event that reveals the action for returning to the newest content.',
			'Start by reproducing the behavior with a response that grows over several updates. Record how the rendered height, scroll height, and scroll position change when new markdown, progress messages, and tool output arrive while the transcript is both locked to the bottom and intentionally paused above it.',
			'Then compare mouse-wheel, keyboard, and programmatic scrolling. Make sure each path preserves the user decision to stay in place, but that selecting the return action reliably restores the bottom lock without causing the final response to jump or become obscured.',
			'Review the floating action itself in light and dark themes. It should remain legible over transcript content, use the transcript surface at rest, show the secondary action treatment on hover and focus, and expose a descriptive label to keyboard and screen reader users.',
			'Finally, add focused coverage for the scroll-state calculation and an isolated component fixture that renders enough real chat content to overflow. Position the list away from the bottom so the action is visible over content and future visual regressions are caught.',
		].join('\n\n'),
	},
];

async function renderScrollToBottomAction(context: ComponentFixtureContext): Promise<void> {
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget(context, {
		messages: SCROLL_TO_BOTTOM_ACTION,
		height: 240,
		listHeight: 240,
		inputVisible: false,
		onRendered: value => handle = value,
	});

	if (!handle) {
		throw new Error('Scroll-to-bottom fixture did not initialize');
	}

	const targetWindow = dom.getWindow(context.container);
	const nextFrame = () => new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	await nextFrame();
	await nextFrame();

	const maximumScrollTop = handle.listWidget.scrollHeight - handle.listWidget.renderHeight;
	if (maximumScrollTop <= 0) {
		throw new Error('Scroll-to-bottom fixture content does not overflow');
	}

	handle.listWidget.scrollTop = maximumScrollTop / 2;
	await nextFrame();

	const scrollDownButton = context.container.querySelector<HTMLElement>('.chat-scroll-down');
	if (!scrollDownButton) {
		throw new Error('Scroll-to-bottom button was not rendered');
	}

	const buttonStyle = targetWindow.getComputedStyle(scrollDownButton);
	if (buttonStyle.display !== 'flex') {
		throw new Error(`Scroll-to-bottom button is not visible: ${buttonStyle.display}`);
	}
	if (handle.listWidget.isScrolledToBottom) {
		throw new Error('Scroll-to-bottom fixture unexpectedly remained at the bottom');
	}
	if (!buttonStyle.backgroundColor || buttonStyle.backgroundColor === 'transparent' || buttonStyle.backgroundColor === 'rgba(0, 0, 0, 0)') {
		throw new Error(`Scroll-to-bottom button background is transparent: ${buttonStyle.backgroundColor}`);
	}

	const buttonBounds = scrollDownButton.getBoundingClientRect();
	const contentUnderButton = Array.from(context.container.querySelectorAll<HTMLElement>('.monaco-list-row')).some(row => {
		const rowBounds = row.getBoundingClientRect();
		return rowBounds.left < buttonBounds.right
			&& rowBounds.right > buttonBounds.left
			&& rowBounds.top < buttonBounds.bottom
			&& rowBounds.bottom > buttonBounds.top;
	});
	if (!contentUnderButton) {
		throw new Error('Scroll-to-bottom button does not overlay transcript content');
	}
}

const LAST_RESPONSE_HOVER: IFixtureMessage[] = [
	{
		user: 'Summarize the changes',
		assistant: [
			{ kind: 'markdown', text: 'The response content ends here.' },
		],
		details: 'Claude Opus 4.8 - 2 credits',
	},
];

async function renderLastResponseHover(context: ComponentFixtureContext): Promise<void> {
	await renderChatWidget(context, {
		messages: LAST_RESPONSE_HOVER,
		height: 600,
		inputVisible: false,
		responseFooterAction: true,
	});

	const response = context.container.querySelector<HTMLElement>('.interactive-response.chat-most-recent-response');
	response?.querySelector<HTMLElement>(':scope > .value')?.dispatchEvent(new MouseEvent('mouseenter'));
}

const KEYBOARD_FOCUS: IFixtureMessage[] = [
	{
		user: 'Summarize the changes',
		assistant: [
			{ kind: 'markdown', text: 'The first response has keyboard-accessible actions.' },
		],
		details: 'Claude Opus 4.8 - 2 credits',
	},
	{
		user: 'What should I do next?',
		assistant: [
			{ kind: 'markdown', text: 'Run the tests and review the diff.' },
		],
		details: 'Claude Opus 4.8 - 1 credit',
	},
];

async function renderKeyboardFocus(context: ComponentFixtureContext, target: 'response-action' | 'request-timestamp'): Promise<void> {
	await renderChatWidget(context, {
		messages: KEYBOARD_FOCUS,
		height: 600,
		inputVisible: false,
		responseFooterAction: true,
		verbose: target === 'request-timestamp',
	});

	const selector = target === 'response-action'
		? '.interactive-response:not(.chat-most-recent-response) .chat-footer-toolbar .action-label'
		: '.interactive-request .chat-request-timestamp';
	const focusTarget = context.container.querySelector<HTMLElement>(selector);
	if (!focusTarget) {
		throw new Error(`Missing keyboard focus target: ${target}`);
	}
	context.focus(focusTarget);
	if (context.overrideFocus && focusTarget.ownerDocument.activeElement !== focusTarget) {
		throw new Error(`Could not focus keyboard target: ${target}`);
	}
}

const PENDING_TOOL_APPROVAL: IFixtureMessage[] = [
	{
		user: 'run git init',
		assistant: [
			{
				kind: 'terminalConfirmation',
				command: 'git init',
				riskAssessment: {
					risk: ToolRiskLevel.Orange,
					explanation: 'Initializes a new Git repository in the current directory. Reversible by removing the .git folder.',
				},
			},
		],
		responseComplete: false,
	},
];

// https://github.com/microsoft/vscode/issues/309796
const ISSUE_309796_MISSING_BACKSLASH: IFixtureMessage[] = [
	{
		user: 'install dependencies in the server directory',
		assistant: [
			{
				kind: 'terminalConfirmation',
				command: 'cd packages\\server && npm install',
				title: 'Run `pwsh` command within `packages\\server`?',
				confirmation: {
					commandLine: 'npm install',
					cwdLabel: 'packages\\server',
					cdPrefix: 'cd packages\\server && ',
				},
			},
		],
		responseComplete: false,
	},
];

const STREAMING: IFixtureMessage[] = [
	{
		user: 'Search the workspace for TODO comments',
		assistant: [
			{ kind: 'progress', text: 'Searching workspace for `TODO` comments...' },
		],
		responseComplete: false,
	},
];

const PERSISTENT_PROGRESS_RESPONSE: IFixtureMessage[] = [{
	user: 'Explain how the chat renderer streams a response',
	assistant: [
		{ kind: 'markdown', text: 'The renderer incrementally appends response content while preserving the active turn state.' },
		{ kind: 'progress', text: 'Checking the remaining renderer paths...' },
	],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_QUESTION: IFixtureMessage[] = [{
	user: 'Create a fixture for the new progress indicator',
	assistant: [{
		kind: 'questionCarousel',
		questions: [{
			id: 'fixture-theme',
			type: 'singleSelect',
			title: 'Fixture theme',
			message: 'Which theme should the fixture emphasize?',
			options: [
				{ id: 'dark', label: 'Dark', value: 'dark' },
				{ id: 'light', label: 'Light', value: 'light' },
			],
		}],
	}],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_TERMINAL_TOOL: IFixtureMessage[] = [{
	user: 'Run the focused chat renderer tests',
	assistant: [{
		kind: 'terminal',
		command: 'scripts/test.sh --grep "persistent progress"',
	}],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_TERMINAL_OUTPUT: IFixtureMessage[] = [{
	user: 'Install npm dependencies',
	assistant: [{
		kind: 'terminal',
		command: 'npm install',
		output: 'npm WARN deprecated example-package@1.0.0\r\nResolving dependencies...\r\nDownloading packages...\r\nPreparing the workspace...\r\n',
	}],
	responseComplete: false,
}];

function parallelSubagentMessages(complete = false): IFixtureMessage[] {
	return [{
		user: 'Start five subagents to compute 1 + 1',
		assistant: [
			{ kind: 'thinking', text: '**Coordinating five subagents**\nStarting independent calculations.' },
			...Array.from({ length: 5 }, (_, index) => ({
				kind: 'subagent' as const,
				id: `sum-agent-${index + 1}`,
				description: 'Compute one plus one',
				complete,
			})),
			...(complete ? Array.from({ length: 5 }, (_, index) => ({
				kind: 'systemNotification' as const,
				notification: { kind: 'systemNotification' as const, content: new MarkdownString(`Background agent \`sum-agent-${index + 1}\` is complete`) },
			})) : []),
		],
		responseComplete: false,
	}];
}

const PERSISTENT_PROGRESS_PLAN_REVIEW: IFixtureMessage[] = [{
	user: 'Plan the progress indicator changes',
	assistant: [{
		kind: 'planReview',
		title: 'Review the progress plan',
		content: '1. Keep one active progress indicator.\n2. Use the Weave logo animation.\n3. Verify questions, confirmations, and streaming tools.',
	}],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_TERMINAL_CONFIRMATION: IFixtureMessage[] = [{
	user: 'Install the fixture dependencies',
	assistant: [{
		kind: 'terminalConfirmation',
		command: 'npm install',
		title: 'Run `npm install`?',
	}],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_CONFIRMATION: IFixtureMessage[] = [{
	user: 'Publish the generated fixture artifact',
	assistant: [{
		kind: 'elicitation',
		title: 'Publish fixture artifact?',
		message: 'This will upload the generated screenshot artifact.',
	}],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_WORKTREE: IFixtureMessage[] = [{
	user: 'Create an isolated worktree for this change',
	assistant: [{
		kind: 'tool',
		toolId: 'create_worktree',
		displayName: 'Create worktree',
		invocationMessage: 'Creating isolated worktree for `feature/persistent-progress`...',
	}],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_STREAMING_TOOL: IFixtureMessage[] = [{
	user: 'Find every progress renderer in the workspace',
	assistant: [
		{ kind: 'progress', text: 'Preparing workspace search...' },
		{
			kind: 'tool',
			toolId: 'search_workspace',
			displayName: 'Search workspace',
			invocationMessage: 'Searching 42 files for progress renderers...',
			streaming: true,
		},
	],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_THINKING_AND_TOOL: IFixtureMessage[] = [{
	user: 'Investigate the renderer and verify the proposed fix',
	assistant: [
		{ kind: 'thinking', text: '**Reviewing renderer state**\nTracing how working progress interacts with tool output.' },
		{
			kind: 'tool',
			toolId: 'search_workspace',
			displayName: 'Search workspace',
			invocationMessage: 'Searching renderer tests...',
			streaming: true,
		},
	],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_THINKING: IFixtureMessage[] = [{
	user: 'Investigate the renderer',
	assistant: [{ kind: 'thinking', text: '**Reviewing renderer state**\nTracing the progress pipeline.' }],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_MCP_STARTING: IFixtureMessage[] = [{
	user: 'Use the workspace and documentation MCP servers',
	assistant: [{ kind: 'mcpStarting', servers: ['workspace', 'documentation'] }],
	responseComplete: false,
}];

const PERSISTENT_PROGRESS_MCP_AUTOSTART: IFixtureMessage[] = [{
	user: 'Start the configured MCP servers',
	assistant: [{ kind: 'mcpStarting', servers: ['workspace', 'documentation'], local: true }],
	responseComplete: false,
}];

/** Whether the scenario renders the local MCP autostart part, whose server list only appears after its 2.5s scheduler fires. */
function hasLocalMcpAutostart(messages: readonly IFixtureMessage[]): boolean {
	return messages.some(message => message.assistant?.some(part => part.kind === 'mcpStarting' && part.local));
}

/** Virtual time must run past the MCP autostart scheduler, or the headless harness never sees the scenario finish rendering. */
function persistentProgressVirtualTime(messages: readonly IFixtureMessage[]): { virtualTime: { durationMs: number } } | undefined {
	return hasLocalMcpAutostart(messages) ? { virtualTime: { durationMs: 3000 } } : undefined;
}

interface IPersistentProgressScenarioOptions {
	readonly activityRowSpacing?: boolean;
	readonly reasoningProseSpacing?: boolean;
	readonly width?: number;
	readonly expectedText?: string;
	readonly progressAnimation?: ChatProgressAnimation;
	readonly previousProgressAnimation?: ChatProgressAnimation;
	readonly productQuality?: 'stable' | 'insider';
	readonly reducedMotion?: boolean;
	readonly thinkingStyle?: ThinkingDisplayMode;
	readonly terminalToolsInThinking?: boolean;
	readonly simpleTerminalCollapsible?: boolean;
	readonly expandThinking?: boolean;
	readonly submitInteraction?: 'question' | 'planReview' | 'elicitation';
	readonly activityUpdates?: boolean;
	readonly richSubagents?: boolean;
	readonly expandTerminal?: boolean;
	readonly expandToolDetails?: boolean;
	readonly height?: number;
	readonly listHeight?: number;
}

async function renderPersistentProgressScenario(context: ComponentFixtureContext, messages: readonly IFixtureMessage[], options: IPersistentProgressScenarioOptions = {}): Promise<void> {
	const { expectedText, progressAnimation = ChatProgressAnimation.Weave, productQuality = 'stable', reducedMotion = false, thinkingStyle = ThinkingDisplayMode.Collapsed } = options;
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget(context, {
		messages,
		persistentProgress: options.previousProgressAnimation ?? progressAnimation,
		productQuality,
		thinkingStyle,
		// Keep layout fixtures expanded; completed-response folding has dedicated fixtures.
		collapseCompletedResponses: false,
		terminalToolsInThinking: options.terminalToolsInThinking,
		simpleTerminalCollapsible: options.simpleTerminalCollapsible,
		richSubagents: options.richSubagents,
		agentHostSession: messages.some(message => message.assistant?.some(part => part.kind === 'subagent')),
		thinkingPhrases: options.activityUpdates ? ['Considering', 'Reviewing', 'Connecting the pieces'] : progressAnimation === ChatProgressAnimation.Off ? ['Working'] : undefined,
		width: options.width,
		height: options.height ?? 560,
		listHeight: options.listHeight ?? 340,
		onRendered: rendered => {
			handle = rendered;
			if (!options.activityUpdates || context.container.classList.contains('disable-animations')) {
				return;
			}
			const { model } = rendered;
			const request = model.getRequests().at(-1);
			if (!request) {
				throw new Error('Activity sequence requires an active request');
			}
			const activities = [
				...['Searching progress renderers...', 'Checking progress tests...'].map(invocationMessage => () => model.acceptResponseProgress(request, new ChatToolInvocation(
					{ invocationMessage },
					{ id: 'search_workspace', displayName: 'Search workspace', modelDescription: 'Search workspace', source: ToolDataSource.Internal },
					generateUuid(), undefined, {}, {}, request.id,
				))),
				() => model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('The active progress indicator follows the response as new content arrives.') }),
			];
			let nextActivity = 0;
			const scheduler = context.disposableStore.add(new RunOnceScheduler(() => {
				activities[nextActivity++]();
				if (nextActivity < activities.length) {
					scheduler.schedule();
				}
			}, 2400));
			scheduler.schedule();
		},
	});
	if (options.previousProgressAnimation !== undefined) {
		if (!handle || !context.container.querySelector('.chat-working-progress')) {
			throw new Error('The setting transition requires an initially persistent response');
		}
		const configuration = handle.instantiationService.get(IConfigurationService);
		if (!(configuration instanceof TestConfigurationService)) {
			throw new Error('The setting transition requires TestConfigurationService');
		}
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, progressAnimation);
		configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([ChatConfiguration.PersistentProgress]),
			change: { keys: [ChatConfiguration.PersistentProgress], overrides: [] },
			affectsConfiguration: section => section === ChatConfiguration.PersistentProgress,
		});
	}
	context.container.classList.toggle('monaco-reduce-motion', reducedMotion);

	const targetWindow = dom.getWindow(context.container);
	const mcpStartup = messages.flatMap(message => message.assistant ?? []).find(part => part.kind === 'mcpStarting');
	if (hasLocalMcpAutostart(messages)) {
		await timeout(2600);
	}
	if (options.submitInteraction) {
		const button = context.container.querySelector<HTMLElement>(options.submitInteraction === 'question'
			? '.chat-question-list-item'
			: options.submitInteraction === 'planReview'
				? '.chat-plan-review-footer .monaco-button'
				: '.chat-confirmation-widget-buttons .monaco-button, .chat-confirmation-widget .monaco-button');
		if (!button) {
			throw new Error(`Missing ${options.submitInteraction} submit button`);
		}
		button.click();
	}
	await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));

	const response = context.container.querySelector<HTMLElement>('.interactive-response.chat-most-recent-response');
	const value = response?.querySelector<HTMLElement>(':scope > .value');
	const footer = value?.querySelector<HTMLElement>(':scope > .chat-working-progress');
	if (!response || !value) {
		throw new Error('Progress scenario did not render an active response');
	}
	if (response.textContent?.includes('Failed to render content')) {
		throw new Error('A response part failed to render');
	}
	if (options.expandTerminal) {
		const expandedOutput = response.querySelector('.chat-terminal-output-container.expanded');
		if (!expandedOutput || expandedOutput.closest('.chat-terminal-thinking-collapsible.chat-used-context-collapsed')) {
			const toggle = response.querySelector<HTMLElement>('.chat-terminal-thinking-collapsible.chat-used-context-collapsed > .chat-used-context-label .monaco-button')
				?? response.querySelector<HTMLElement>('.chat-terminal-action-bar .action-label');
			if (!toggle) {
				throw new Error('Terminal output has no expand action');
			}
			toggle.click();
		}
		const output = messages.flatMap(message => message.assistant ?? []).find(part => part.kind === 'terminal')?.output;
		const firstLine = output?.split(/\r?\n/)[0];
		const renderedOutput = () => response.querySelector('.xterm-rows')?.textContent?.replace(/\u00a0/g, ' ');
		for (let attempt = 0; attempt < 25 && !renderedOutput()?.includes(firstLine ?? ''); attempt++) {
			await timeout(20);
		}
		if (!firstLine || !renderedOutput()?.includes(firstLine)) {
			throw new Error('The terminal output did not render');
		}
	}
	const terminalParts = messages.flatMap(message => message.assistant ?? []).filter(part => part.kind === 'terminal');
	const terminalWidgets = [...response.querySelectorAll('.chat-tool-invocation-part')].filter(part => part.querySelector('.chat-terminal-content-part, .chat-terminal-thinking-collapsible'));
	if (terminalWidgets.length !== terminalParts.length) {
		throw new Error('The terminal tool did not use the terminal progress renderer');
	}
	const renderedCommands = [...response.querySelectorAll('.chat-terminal-command-block, .chat-terminal-thinking-collapsible > .chat-used-context-label code')].map(element => element.textContent?.replace(/\u00a0/g, ' ') ?? '');
	if (terminalParts.some(part => !renderedCommands.some(rendered => rendered.includes(part.command)
		|| rendered.length > 3 && rendered.endsWith('...') && part.command.startsWith(rendered.slice(0, -3))))) {
		throw new Error('The terminal command code block is empty or incomplete');
	}
	if (mcpStartup && !response.querySelector('.chat-mcp-servers-interaction')?.textContent?.includes('Starting MCP servers')) {
		throw new Error('MCP startup did not use the real startup progress renderer');
	}

	if (options.expandThinking) {
		const buttons = [...response.querySelectorAll<HTMLElement>('.chat-thinking-box.chat-used-context-collapsed > .chat-used-context-label .monaco-button')].filter(button => button.getAttribute('aria-disabled') !== 'true');
		if (!buttons.length && !response.querySelector('.chat-thinking-box:not(.chat-used-context-collapsed) > .chat-used-context-label .monaco-button')) {
			throw new Error('Thinking progress has no expand button');
		}
		for (const button of buttons) {
			button.click();
		}
	}
	if (options.expandToolDetails) {
		const buttons = response.querySelectorAll<HTMLElement>('.chat-tool-invocation-part > .chat-confirmation-widget-container > .chat-confirmation-widget-collapsible > .chat-confirmation-widget-title');
		if (!buttons.length) {
			throw new Error('Tool details have no expand button');
		}
		for (const button of buttons) {
			if (button.ariaExpanded !== 'true') {
				button.click();
			}
		}
	}
	if (progressAnimation === ChatProgressAnimation.Off) {
		if (response.matches('.chat-persistent-progress, .chat-progress-in-thinking')
			|| response.querySelector('.chat-working-progress, .chat-working-logo, .chat-thinking-progress-owner')) {
			throw new Error('Off must preserve legacy progress without persistent indicators or suppression');
		}
		return;
	}
	if (!response.classList.contains('chat-persistent-progress')) {
		throw new Error('Persistent progress indicator was not rendered in the active response');
	}
	const visibleParts = [...value.children].filter(part => part.getBoundingClientRect().height > 0);
	if (visibleParts.slice(1).some((part, index) => Math.abs(part.getBoundingClientRect().top - visibleParts[index].getBoundingClientRect().bottom - 16) > 0.1)) {
		throw new Error('Visible response parts must use the shared item gap');
	}
	if (response.querySelector('.chat-tool-chain > .chat-used-context-label, .chat-tool-chain.chat-used-context-collapsed, .chat-tool-chain > .monaco-scrollable-element, .chat-tool-chain .chat-persistent-reasoning')) {
		throw new Error('Tool chains must be expanded, headerless, unbounded, and separate from reasoning');
	}
	for (const chain of response.querySelectorAll<HTMLElement>('.chat-tool-chain > .chat-thinking-collapsible')) {
		const style = targetWindow.getComputedStyle(chain);
		if (style.maxHeight !== 'none' || style.overflowY !== 'visible') {
			throw new Error('A tool chain is clipped by an internal scrolling limit');
		}
	}
	for (const tool of response.querySelectorAll('.chat-tool-chain > .chat-thinking-collapsible > .chat-thinking-tool-wrapper')) {
		const visibleIcons = [...tool.querySelectorAll('.chat-thinking-icon, .chat-tool-call-icon')].filter(icon => icon.getClientRects().length > 0);
		if (visibleIcons.length !== 1) {
			throw new Error('A tool-chain row must display exactly one icon');
		}
	}
	for (const tool of value.querySelectorAll(':scope > .chat-tool-invocation-part')) {
		const icon = tool.querySelector<HTMLElement>(':scope > .chat-tool-call-icon[aria-hidden="true"]');
		if (!icon || targetWindow.getComputedStyle(icon).display === 'none') {
			throw new Error('Standalone tools must retain their decorative icons');
		}
	}
	if (messages.at(-1)?.responseComplete === true) {
		if (footer || response.querySelector('.completed-response-disclosure')) {
			throw new Error('Completed persistent responses must keep tool chains visible without a working footer');
		}
		return;
	}
	if (!footer) {
		throw new Error('Persistent progress footer is missing');
	}
	if (value.lastElementChild !== footer) {
		throw new Error('Persistent progress indicator is not the final response part');
	}
	if (targetWindow.getComputedStyle(footer).display === 'none') {
		throw new Error('The persistent footer must remain visible alongside reasoning');
	}
	const iconElement = footer.querySelector<HTMLElement>(':scope > .codicon-vscode[aria-hidden="true"]');
	const logo = iconElement?.querySelector<HTMLElement>(`.chat-working-logo[data-animation="${progressAnimation}"]`);
	const textElement = footer.querySelector<HTMLElement>('.rendered-markdown > p');
	if (!iconElement || !logo || !textElement) {
		throw new Error(`Persistent progress indicator is missing its decorative ${productQuality} VS Code icon`);
	}
	if (logo.getClientRects().length === 0 || textElement.getClientRects().length === 0) {
		throw new Error('The active progress icon or text is hidden');
	}
	const reasoningIcons = response.querySelectorAll<HTMLElement>('.chat-persistent-reasoning > .chat-used-context-label .monaco-button > .codicon-thinking[aria-hidden="true"]');
	if (reasoningIcons.length !== response.querySelectorAll('.chat-persistent-reasoning').length) {
		throw new Error('Collapsible reasoning must retain its thinking icon');
	}
	const progressIconLeft = logo.getBoundingClientRect().left;
	for (const icon of [
		...reasoningIcons,
		...response.querySelectorAll<HTMLElement>('.chat-tool-chain > .chat-thinking-collapsible > .chat-thinking-tool-wrapper > .chat-thinking-icon'),
		...value.querySelectorAll<HTMLElement>(':scope > .chat-tool-invocation-part > .chat-tool-call-icon'),
	]) {
		if (icon.getClientRects().length && Math.abs(icon.getBoundingClientRect().left - progressIconLeft) > 0.1) {
			throw new Error('Thinking and tool icons must share the persistent progress icon column');
		}
	}
	if (options.activityRowSpacing) {
		const labels = [...value.querySelectorAll<HTMLElement>('.chat-tool-chain .progress-container p, .chat-persistent-reasoning > .chat-used-context-label .monaco-button-mdlabel, :scope > .chat-tool-call-with-icon .progress-container p, :scope > .chat-markdown-part > p, .chat-working-progress p')];
		if (labels.slice(1).some((label, index) => Math.abs(label.getBoundingClientRect().top - labels[index].getBoundingClientRect().bottom - 16) > 0.1)) {
			throw new Error('Tools, reasoning, markdown, and working rows must share the same item gap');
		}
	}
	if (options.activityRowSpacing || options.reasoningProseSpacing) {
		const labels = value.querySelectorAll<HTMLElement>('.chat-tool-chain .progress-container p, .chat-persistent-reasoning > .chat-used-context-label .monaco-button-mdlabel, :scope > .chat-tool-call-with-icon .progress-container p, .chat-working-progress p');
		const textLeft = value.getBoundingClientRect().left + 24;
		if ([...labels].some(label => Math.abs(label.getBoundingClientRect().left - textLeft) > 0.1)) {
			throw new Error('Thinking, tool, and working labels must share the same text gutter');
		}
	}
	if (options.reasoningProseSpacing) {
		for (const reasoning of value.querySelectorAll<HTMLElement>(':scope > .chat-persistent-reasoning')) {
			const next = reasoning.nextElementSibling;
			if (next?.classList.contains('chat-markdown-part') && Math.abs(next.getBoundingClientRect().top - reasoning.getBoundingClientRect().bottom - 16) > 0.1) {
				throw new Error('Reasoning must use the shared item gap before the following prose');
			}
		}
	}
	if (expectedText && !footer.textContent?.replace(/\u00a0/g, ' ').includes(expectedText)) {
		throw new Error(`Persistent progress indicator did not include "${expectedText}"`);
	}
	if (expectedText === 'Plan review required' && [...response.querySelectorAll('p')].filter(element => element.textContent?.replace(/\u00a0/g, ' ').trim() === expectedText).length !== 1) {
		throw new Error('Plan review has duplicate progress messages');
	}

	const shouldAnimate = !reducedMotion && !context.container.classList.contains('disable-animations');
	const shimmers = response.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation && animation.animationName === 'chat-thinking-shimmer');
	if (shimmers.length !== (shouldAnimate ? 1 : 0)) {
		throw new Error(`Expected ${shouldAnimate ? 1 : 0} running shimmer, found ${shimmers.length}`);
	}
	const competingSpinners = response.getAnimations({ subtree: true }).filter(animation =>
		animation instanceof CSSAnimation
		&& (animation.animationName.startsWith('monaco-pixel-spinner-') || animation.animationName === 'codicon-spin')
		&& !(animation.effect instanceof KeyframeEffect && animation.effect.target?.closest('.chat-subagent-pill-widget, .chat-terminal-progress-row, .chat-terminal-thinking-collapsible')));
	if (competingSpinners.length) {
		throw new Error(`Persistent progress has ${competingSpinners.length} competing spinner animations`);
	}
	const terminalMotionEnabled = !context.container.classList.contains('disable-animations') && !targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
	for (const [index, terminal] of terminalParts.entries()) {
		const spinner = terminalWidgets[index].querySelector('.monaco-pixel-spinner');
		if (!terminal.complete && !spinner) {
			throw new Error('Persistent progress must preserve the terminal activity spinner');
		}
		const animations = spinner?.getAnimations({ subtree: true }).filter(animation => {
			const duration = animation.effect?.getComputedTiming().activeDuration;
			return animation instanceof CSSAnimation && animation.animationName.startsWith('monaco-pixel-spinner-') && typeof duration === 'number' && duration > 0;
		}).length ?? 0;
		if (animations !== (terminalMotionEnabled && !terminal.complete ? 6 : 0)) {
			throw new Error('The terminal activity animation did not retain its original motion behavior');
		}
	}
	if (logo.getAnimations({ subtree: true }).length !== (shouldAnimate ? 3 : 0)) {
		throw new Error(`${progressAnimation} progress animation did not match reducedMotion=${reducedMotion}`);
	}
	if ((targetWindow.getComputedStyle(textElement).animationName !== 'none') !== shouldAnimate) {
		throw new Error(`Persistent progress text animation did not match reducedMotion=${reducedMotion}`);
	}
	if (shouldAnimate) {
		const style = targetWindow.getComputedStyle(textElement);
		if (style.backgroundClip !== 'text' || style.webkitTextFillColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage === 'none') {
			throw new Error('Progress text is animated without a visible shimmer gradient');
		}
	}
	if (response.querySelector('.chat-thinking-spinner-item')) {
		throw new Error('Footer progress has a duplicate inner working row');
	}
	const expectedSubagents = messages.flatMap(message => message.assistant ?? []).filter(part => part.kind === 'subagent').length;
	if (response.querySelectorAll('.chat-subagent-part').length !== expectedSubagents) {
		throw new Error('Subagent content did not use the subagent renderer');
	}
	if (expectedSubagents && options.richSubagents !== false && response.querySelectorAll('.chat-subagent-pill-widget').length !== expectedSubagents) {
		throw new Error('Subagents did not use the rich pill renderer');
	}
}

function defineThinkingStyleScenarios(thinkingStyle: ThinkingDisplayMode, defaults: IPersistentProgressScenarioOptions = {}): ReturnType<typeof defineThemedFixtureGroup> {
	const scenario = (messages: readonly IFixtureMessage[], options: IPersistentProgressScenarioOptions = {}, prependThinking = true) => defineComponentFixture({
		labels: { kind: 'animated' },
		...persistentProgressVirtualTime(messages),
		render: context => renderPersistentProgressScenario(context, prependThinking ? messages.map(message => ({
			...message,
			assistant: [{ kind: 'thinking', text: '**Preparing the next step**\nReviewing the request before continuing.' }, ...message.assistant ?? []],
		})) : messages, {
			...defaults,
			...options,
			thinkingStyle,
		}),
	});
	return defineThemedFixtureGroup({
		Thinking: scenario(PERSISTENT_PROGRESS_THINKING, {}, false),
		...(thinkingStyle === ThinkingDisplayMode.Collapsed ? {
			ThinkingExpanded: scenario(PERSISTENT_PROGRESS_THINKING, { expandThinking: true }, false),
		} : {}),
		ThinkingAndStreamingTool: scenario(PERSISTENT_PROGRESS_THINKING_AND_TOOL, {}, false),
		ResponseStreaming: scenario(PERSISTENT_PROGRESS_RESPONSE),
		AskQuestions: scenario(PERSISTENT_PROGRESS_QUESTION, { expectedText: 'Waiting for your response' }),
		QuestionAnswered: scenario(PERSISTENT_PROGRESS_QUESTION, { submitInteraction: 'question' }),
		TerminalCommand: scenario(PERSISTENT_PROGRESS_TERMINAL_TOOL),
		TerminalOutput: scenario(PERSISTENT_PROGRESS_TERMINAL_OUTPUT, { expandTerminal: true }),
		TerminalConfirmation: scenario(PERSISTENT_PROGRESS_TERMINAL_CONFIRMATION, { expectedText: '1 confirmation pending' }),
		ConfirmationWidget: scenario(PERSISTENT_PROGRESS_CONFIRMATION, { expectedText: '1 confirmation pending' }),
		ConfirmationAccepted: scenario(PERSISTENT_PROGRESS_CONFIRMATION, { submitInteraction: 'elicitation' }),
		PlanReview: scenario(PERSISTENT_PROGRESS_PLAN_REVIEW, { expectedText: 'Plan review required' }),
		PlanApproved: scenario(PERSISTENT_PROGRESS_PLAN_REVIEW, { submitInteraction: 'planReview' }),
		WorktreeCreation: scenario(PERSISTENT_PROGRESS_WORKTREE),
		ParallelSubagents: scenario(parallelSubagentMessages(), {}, false),
		CompletedSubagentNotices: scenario(parallelSubagentMessages(true), {}, false),
		// The legacy fixed-scrolling thinking container reports a ResizeObserver loop when
		// subagent pills expand inside it (independent of this setting), which the headless
		// harness treats as a fixture error. The enabled variant still covers this scenario.
		...(defaults.progressAnimation === ChatProgressAnimation.Off && thinkingStyle === ThinkingDisplayMode.FixedScrolling ? {} : {
			ExpandedSubagents: scenario(parallelSubagentMessages(), { richSubagents: false, expandThinking: true }, false),
		}),
		McpStarting: scenario(PERSISTENT_PROGRESS_MCP_STARTING, {}, false),
		McpAutostart: scenario(PERSISTENT_PROGRESS_MCP_AUTOSTART, {}, false),
	});
}

function defineProgressAnimationScenarios(progressAnimation: ChatProgressAnimation): ReturnType<typeof defineThemedFixtureGroup> {
	return defineThemedFixtureGroup({
		ThinkingHeader: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { progressAnimation }),
		}),
		ExpandedThinking: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { progressAnimation, expandThinking: true }),
		}),
		ResponseFooter: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { progressAnimation, thinkingStyle: ThinkingDisplayMode.FixedScrolling }),
		}),
		ReducedMotion: defineComponentFixture({
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { progressAnimation, reducedMotion: true }),
		}),
	});
}

function defineToolChainScenarios(progressAnimation = ChatProgressAnimation.Weave): ReturnType<typeof defineThemedFixtureGroup> {
	const tool = (toolId: string, invocationMessage: string, complete = false): NonNullable<IFixtureMessage['assistant']>[number] => ({
		kind: 'tool', toolId, displayName: toolId, invocationMessage, complete,
	});
	const before = [
		tool('read_file', 'Read `src/progress.ts`', true),
		tool('search_workspace', 'Found 12 references to working progress', true),
	];
	const interwoven: IFixtureMessage[] = [{
		user: 'Inspect the progress pipeline, reason about the result, and verify the fix',
		assistant: [
			...before,
			{ kind: 'thinking', text: '**Choosing a rendering strategy**\nSeparate reasoning from tool output so the sequence stays readable.\n\n**Preserving the original behavior**\nKeep the old rendering path when the setting is Off.' },
			tool('read_file', 'Read `src/progress.test.ts`', true),
			tool('apply_patch', 'Updated the progress regression tests', true),
			{ kind: 'thinking', text: '**Verifying the changes**\nNow check rendering and keyboard interactions across all scenarios.' },
			tool('search_workspace', 'Checking the final progress renderers...', false),
		],
		responseComplete: false,
	}];
	const mcpSource: ToolDataSource = { type: 'mcp', label: 'Documentation', serverLabel: 'Documentation', collectionId: 'documentation', definitionId: 'documentation', instructions: '' };
	const mixedPrefix: NonNullable<IFixtureMessage['assistant']> = [
		...before,
		{ kind: 'thinking', text: '**Choosing a rendering strategy**\nCompare the progress paths before changing the implementation.' },
		{ kind: 'markdown', text: 'I found two places that render working progress. The change keeps the **original behavior when Off** and uses one persistent indicator when enabled.\n\nBefore I continue, there is one choice to confirm.' },
	];
	const scenario = (messages: readonly IFixtureMessage[], options: IPersistentProgressScenarioOptions = {}) => defineComponentFixture({
		labels: { kind: 'animated' },
		render: context => renderPersistentProgressScenario(context, messages, { progressAnimation, height: 820, listHeight: 600, ...options }),
	});
	const tools = (assistant: NonNullable<IFixtureMessage['assistant']>, responseComplete = false): IFixtureMessage[] => [{ user: 'Review the working progress implementation', assistant, responseComplete }];
	const sharedItemSpacing = tools([
		{ kind: 'markdown', text: 'I will check the current progress rendering first.\n\nThen I will compare the remaining tool and reasoning paths.' },
		tool('search_workspace', 'Search the current working tree for all rendering, progress, thinking, and confirmation code paths.', true),
		tool('read_file', 'Read the progress renderer and the tests for its expanded tool chains.', true),
		{ kind: 'thinking', text: '**Checking the remaining paths**\nReview the external documentation before finishing.' },
		{ kind: 'markdown', text: 'The local results agree. I am checking the reference documentation next.' },
		{ kind: 'tool', toolId: 'mcp_documentation_lookup', displayName: 'Documentation', invocationMessage: 'Look up the documented progress lifecycle and confirmation rendering behavior.', source: mcpSource },
		{ kind: 'markdown', text: 'Verifying that all content uses the same spacing.' },
	]);
	const terminalSequence = (complete = true, output?: string) => tools([
		{ kind: 'thinking', text: '**Checking the local changes**\nVerify the current branch and working tree before continuing.' },
		{ kind: 'markdown', text: 'Re-checking the local change scope before reviewing the remaining files.' },
		{ kind: 'terminal', intention: 'Re-verify current local change scope', command: 'echo "=== BRANCH ==="; git --no-pager branch --show-current; git status --short', complete, output },
		{ kind: 'thinking', text: '**Reviewing the remaining paths**\nCheck the tool and reasoning renderers against the current changes.' },
		{ kind: 'markdown', text: 'The terminal result is available above. I am checking the remaining rendering paths.' },
	]);
	const collapsibleTerminalOptions: IPersistentProgressScenarioOptions = { terminalToolsInThinking: true, simpleTerminalCollapsible: true };
	const readTerminalDetails = {
		kind: 'tool', toolId: 'mcp_read_terminal', displayName: 'Read Terminal', invocationMessage: 'Read Terminal', complete: true, source: mcpSource,
		resultDetails: { input: '{"shellId":"verification"}', output: [{ type: 'embed', value: 'No matching instances were found.', isText: true }] },
	} satisfies NonNullable<IFixtureMessage['assistant']>[number];
	const standaloneToolDetails = [
		{ kind: 'thinking', text: '**Verifying the search**\nCheck the completed terminal command before reporting the result.' },
		{ kind: 'markdown', text: 'The command has finished. I will read its output before concluding.' },
		readTerminalDetails,
		{ kind: 'thinking', text: '**Finalizing the result**\nConfirm the search covered the expected files.' },
		{ kind: 'markdown', text: 'No matching instances were found in the repository.' },
	] satisfies NonNullable<IFixtureMessage['assistant']>;
	return defineThemedFixtureGroup({
		StandaloneToolDetails: scenario(tools(standaloneToolDetails)),
		StandaloneToolDetailsExpanded: scenario(tools(standaloneToolDetails), { expandToolDetails: true }),
		CompletedStandaloneToolDetails: scenario(tools(standaloneToolDetails, true)),
		StandaloneSimpleToolDetails: scenario(tools([{ ...readTerminalDetails, resultDetails: undefined, toolSpecificData: { kind: 'simpleToolInvocation', input: '{"shellId":"verification"}', output: 'No matching instances were found.' } }])),
		GroupedToolDetails: scenario(tools([...before, { ...readTerminalDetails, toolId: 'read_terminal', source: ToolDataSource.Internal }])),
		SharedItemSpacing: scenario(sharedItemSpacing, { activityRowSpacing: true }),
		SharedItemSpacingNarrow: scenario(sharedItemSpacing, { activityRowSpacing: true, width: 420, height: 1000, listHeight: 780 }),
		TerminalWithIntention: scenario(terminalSequence(), collapsibleTerminalOptions),
		TerminalWithIntentionStandalone: scenario(terminalSequence(), { ...collapsibleTerminalOptions, terminalToolsInThinking: false }),
		TerminalWithIntentionNarrow: scenario(terminalSequence(), { ...collapsibleTerminalOptions, width: 420, height: 1000, listHeight: 780 }),
		TerminalWithIntentionRunning: scenario(terminalSequence(false), collapsibleTerminalOptions),
		TerminalWithIntentionOutput: scenario(terminalSequence(true, '=== BRANCH ===\nfeature/progress\n M src/progress.ts'), { ...collapsibleTerminalOptions, expandTerminal: true }),
		ThinkingAndTerminalChains: scenario(tools([
			{ kind: 'thinking', text: '**Checking the local changes**\nInspect the working tree before running the checks.\n\n**Comparing the results**\nReview the changed files and verify that the patch is limited to the intended behavior.' },
			{ kind: 'markdown', text: 'I will check the working tree and review the patch separately.' },
			tool('read_file', 'Read the progress renderer', true),
			{ kind: 'terminal', intention: 'Find changed files', command: 'git status --short', complete: true },
			{ kind: 'terminal', intention: 'Review the current patch', command: 'git --no-pager diff --stat', complete: true },
		]), { ...collapsibleTerminalOptions, expandThinking: true }),
		ToolChain: scenario(tools([...before, tool('apply_patch', 'Updating the progress renderer...')])),
		CompletedToolChain: scenario(tools([...before, tool('apply_patch', 'Updated the progress renderer', true)], true)),
		LongToolChain: scenario(tools(Array.from({ length: 24 }, (_, index) => tool('read_file', `Read \`src/renderer-${index + 1}.ts\``, index < 23))), { height: 1200, listHeight: 980 }),
		Thinking: scenario(PERSISTENT_PROGRESS_THINKING),
		InterwovenThinking: scenario(interwoven, { activityRowSpacing: true }),
		ExpandedReasoning: scenario(interwoven, { expandThinking: true }),
		ReasoningThenProse: scenario(tools([
			{ kind: 'thinking', text: '**Checking the search scope**\nConfirm the query and search the current working tree.' },
			{ kind: 'markdown', text: 'Re-running the search against the current working tree.' },
			tool('search_workspace', 'Search for `progress|thinking|working`', true),
			tool('run_in_terminal', 'Search tracked source files', true),
			{ kind: 'thinking', text: '**Verifying command flags**\nMake sure the flags match the intended search behavior.' },
			{ kind: 'markdown', text: 'The first scan used the wrong flag. Re-running it with the correct options.' },
			tool('run_in_terminal', 'Search ignored files and filenames', true),
			{ kind: 'thinking', text: '**Confirming the remaining files**\nCheck the last paths before reporting the result.' },
			tool('read_file', 'Read the final search results'),
		]), { reasoningProseSpacing: true, activityRowSpacing: true }),
		ReasoningThenProseExpanded: scenario(tools([
			{ kind: 'thinking', text: '**Checking the search scope**\nConfirm the query and search the current working tree.' },
			{ kind: 'markdown', text: 'Re-running the search against the current working tree.' },
			tool('search_workspace', 'Search for `progress|thinking|working`'),
		]), { expandThinking: true, reasoningProseSpacing: true }),
		MixedQuestions: scenario(tools([
			...mixedPrefix,
			tool('vscode_askQuestions', 'Choose the verification scope'),
			{ kind: 'questionCarousel', questions: [{ id: 'scope', type: 'singleSelect', title: 'Verification scope', message: 'Which scenarios should I verify first?', options: [{ id: 'focused', label: 'Focused progress scenarios', value: 'focused' }, { id: 'all', label: 'All chat scenarios', value: 'all' }] }] },
		]), { expectedText: 'Waiting for your response' }),
		MixedConfirmation: scenario(tools([
			...mixedPrefix,
			{ kind: 'elicitation', title: 'Apply the progress changes?', message: 'The update changes the enabled layout and keeps the existing rendering when the setting is Off.' },
		]), { expectedText: '1 confirmation pending' }),
		MixedToolApproval: scenario(tools([
			...mixedPrefix,
			{ kind: 'tool', toolId: 'apply_patch', displayName: 'Apply patch', invocationMessage: 'Update the progress renderer and its tests', approval: 'pre' },
		]), { expectedText: '1 confirmation pending' }),
		MixedMarkdown: scenario(tools([
			...before,
			{ kind: 'markdown', text: '### What I found\n\nThe existing progress is rendered by several content parts:\n\n- Tool calls keep their own details.\n- Reasoning remains independently collapsible.\n- The response owns a single working indicator.' },
			{ kind: 'thinking', text: '**Checking the implementation**\nVerify that the setting still restores the original rendering.' },
			tool('read_file', 'Read `src/progress.test.ts`', true),
			{ kind: 'markdown', text: 'The configuration remains a single opt-in setting:\n\n```json\n{\n  "chat.experimental.persistentProgress": "weave"\n}\n```\n\nI am checking the remaining rendering scenarios now.' },
		])),
		StreamingToolCall: scenario(PERSISTENT_PROGRESS_STREAMING_TOOL),
		StandaloneMcpTool: scenario(tools([...before, { kind: 'tool', toolId: 'mcp_documentation_lookup', displayName: 'Documentation', invocationMessage: 'Looking up the progress API...', source: mcpSource }]), { activityRowSpacing: true }),
		ToolConfirmation: scenario(tools([...before, { kind: 'tool', toolId: 'apply_patch', displayName: 'Apply patch', invocationMessage: 'Update the working progress implementation', approval: 'pre' }]), { expectedText: '1 confirmation pending' }),
		PostApproval: scenario(tools([...before, { kind: 'tool', toolId: 'read_file', displayName: 'Read file', invocationMessage: 'Review the tool results before sharing them', approval: 'post' }]), { expectedText: '1 confirmation pending' }),
		McpConfirmation: scenario(tools([{ kind: 'tool', toolId: 'mcp_documentation_lookup', displayName: 'Documentation', invocationMessage: 'Read the external documentation', source: mcpSource, approval: 'pre' }]), { expectedText: '1 confirmation pending' }),
		TerminalCommand: scenario(PERSISTENT_PROGRESS_TERMINAL_TOOL),
		TerminalOutput: scenario(PERSISTENT_PROGRESS_TERMINAL_OUTPUT, { expandTerminal: true }),
		TerminalConfirmation: scenario(PERSISTENT_PROGRESS_TERMINAL_CONFIRMATION, { expectedText: '1 confirmation pending' }),
		AskQuestions: scenario(PERSISTENT_PROGRESS_QUESTION.map(message => ({
			...message, assistant: [tool('vscode_askQuestions', 'Choose how to verify the change'), ...message.assistant ?? []],
		})), { expectedText: 'Waiting for your response' }),
		QuestionAnswered: scenario(PERSISTENT_PROGRESS_QUESTION, { submitInteraction: 'question' }),
		Confirmation: scenario(PERSISTENT_PROGRESS_CONFIRMATION, { expectedText: '1 confirmation pending' }),
		PlanReview: scenario(PERSISTENT_PROGRESS_PLAN_REVIEW, { expectedText: 'Plan review required' }),
		PlanApproved: scenario(PERSISTENT_PROGRESS_PLAN_REVIEW, { submitInteraction: 'planReview' }),
		WorktreeCreation: scenario(PERSISTENT_PROGRESS_WORKTREE),
		McpStarting: scenario(PERSISTENT_PROGRESS_MCP_STARTING),
		ParallelSubagents: scenario(parallelSubagentMessages()),
		CompletedSubagentNotices: scenario(parallelSubagentMessages(true)),
		ReducedMotion: scenario(interwoven, { reducedMotion: true }),
	});
}

function defineCompletedProgressScenarios(): ReturnType<typeof defineThemedFixtureGroup> {
	const edits: IChatExternalEdit[] = [{
		kind: 'externalEdit', uri: URI.file('/workspace/progress.ts'), editKind: 'edit',
		diff: { added: 18, removed: 4 }, beforeContentUri: URI.file('/snapshots/before/progress.ts'), afterContentUri: URI.file('/snapshots/after/progress.ts'),
	}, {
		kind: 'externalEdit', uri: URI.file('/workspace/progress.test.ts'), editKind: 'edit',
		diff: { added: 7, removed: 2 }, beforeContentUri: URI.file('/snapshots/before/progress.test.ts'), afterContentUri: URI.file('/snapshots/after/progress.test.ts'),
	}];
	const scenario = (options: {
		progress?: ChatProgressAnimation;
		collapse?: boolean;
		state?: 'restored' | 'live' | 'working';
		expanded?: boolean;
		expandThinking?: boolean;
		toggleCollapse?: boolean;
		edits?: readonly IChatExternalEdit[];
		markdownEdits?: boolean;
		width?: number;
	} = {}) => defineComponentFixture({
		render: async context => {
			const { progress = ChatProgressAnimation.Weave, collapse = true, state = 'restored', expanded = false } = options;
			const editParts = options.edits?.map(edit => options.markdownEdits ? {
				kind: 'markdown' as const,
				text: `\`\`\`typescript\n<vscode_codeblock_uri isEdit>${edit.uri.toString()}</vscode_codeblock_uri>\nexport const enabled = true;\n\`\`\`\n\n`,
			} : edit) ?? [];
			const editingSession = options.markdownEdits ? new MockChatEditingSession((options.edits ?? []).map(edit => ({
				originalURI: edit.beforeContentUri ?? edit.uri,
				modifiedURI: edit.uri,
				modifiedSnapshotURI: edit.afterContentUri,
				added: edit.diff?.added ?? 0,
				removed: edit.diff?.removed ?? 0,
				identical: false, quitEarly: false, isFinal: true, isBusy: false,
			}))) : undefined;
			let handle: IChatWidgetFixtureHandle | undefined;
			await renderChatWidget(context, {
				persistentProgress: progress,
				collapseCompletedResponses: collapse,
				thinkingStyle: ThinkingDisplayMode.CollapsedPreview,
				terminalToolsInThinking: true,
				simpleTerminalCollapsible: true,
				agentHostSession: true,
				editingSession,
				width: options.width,
				height: 1000,
				listHeight: 780,
				messages: [{
					user: 'Review the progress rendering changes',
					responseComplete: state === 'restored',
					assistant: [
						{ kind: 'thinking', text: '**Checking the implementation**\nReview the tool rendering paths.\n\n**Preserving existing behavior**\nCheck the settings before finishing.' },
						{ kind: 'terminal', intention: 'Run focused tests', command: 'npm test -- --grep progress', complete: true },
						...editParts.slice(0, 1),
						...(!options.markdownEdits || state === 'restored' ? [{ kind: 'markdown' as const, text: 'Let me confirm the remaining paths before finalizing.\n\nI will check the patch and the reference documentation.' }] : []),
						{ kind: 'terminal', intention: 'Check the patch', command: 'git diff --check', complete: true },
						...editParts.slice(1),
						{ kind: 'thinking', text: '**Verifying the result**\nCompare the test results with the documented behavior.' },
						{
							kind: 'tool', toolId: 'mcp_read_reference', displayName: 'Read reference', invocationMessage: 'Read the reference documentation', complete: true,
							source: { type: 'mcp', label: 'Documentation', serverLabel: 'Documentation', collectionId: 'docs', definitionId: 'docs', instructions: '' },
							resultDetails: { input: '{"topic":"progress"}', output: [{ type: 'embed', value: 'Completed responses keep their final answer visible.', isText: true }] },
						},
						{ kind: 'markdown', text: '## Review summary\n\nThe checks passed. Progress stays visible while working, and completed work follows your collapse preference.\n\nThe final answer remains outside the completed-steps disclosure.' },
					],
				}],
				onRendered: rendered => handle = rendered,
			});
			if (!handle) {
				throw new Error('Completed response fixture did not initialize');
			}
			const targetWindow = dom.getWindow(context.container);
			const settle = async () => {
				await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
				await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
			};
			await settle();
			if (state === 'live') {
				if (context.container.querySelector('.completed-response-disclosure') || !context.container.querySelector('.chat-working-progress')) {
					throw new Error('Work must remain expanded with persistent progress until completion');
				}
				const response = handle.model.getRequests().at(-1)?.response;
				if (!response) {
					throw new Error('Live completion requires a response');
				}
				response.complete();
				handle.listWidget.refresh();
				await settle();
			}
			if (options.toggleCollapse !== undefined) {
				const configuration = handle.instantiationService.get(IConfigurationService);
				if (!(configuration instanceof TestConfigurationService)) {
					throw new Error('Changing the collapse preference requires TestConfigurationService');
				}
				await configuration.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, options.toggleCollapse);
				configuration.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER,
					affectedKeys: new Set([ChatConfiguration.CollapseCompletedResponses]),
					change: { keys: [ChatConfiguration.CollapseCompletedResponses], overrides: [] },
					affectsConfiguration: section => section === ChatConfiguration.CollapseCompletedResponses,
				});
				await settle();
			}
			const response = context.container.querySelector<HTMLElement>('.interactive-response');
			const value = response?.querySelector<HTMLElement>(':scope > .value');
			if (!response || !value || response.textContent?.includes('Failed to render content')) {
				throw new Error('Completed response content did not render');
			}
			const disclosure = value.querySelector<HTMLDetailsElement>(':scope > .completed-response-disclosure');
			const shouldCollapse = state !== 'working' && (options.toggleCollapse ?? collapse);
			if (!!disclosure !== shouldCollapse || disclosure?.open) {
				throw new Error('Completed response did not respect the collapse preference');
			}
			const finalAnswer = [...value.querySelectorAll(':scope > .chat-markdown-part')].find(part => part.textContent?.includes('Review summary'));
			if (!finalAnswer || !!value.querySelector('.chat-working-progress') !== (state === 'working' && progress !== ChatProgressAnimation.Off)) {
				throw new Error('The final answer or persistent progress has the wrong visibility');
			}
			const added = options.edits?.reduce((sum, edit) => sum + (edit.diff?.added ?? 0), 0) ?? 0;
			const removed = options.edits?.reduce((sum, edit) => sum + (edit.diff?.removed ?? 0), 0) ?? 0;
			const editButton = disclosure?.querySelector('.completed-response-summary > .chat-edit-stats');
			const showEdits = !!disclosure && progress !== ChatProgressAnimation.Off && (added > 0 || removed > 0);
			if (!!editButton !== showEdits || editButton && (editButton.querySelector('.label-added')?.textContent !== `+${added}` || editButton.querySelector('.label-removed')?.textContent !== `-${removed}`)) {
				throw new Error('The completed header does not show the expected edit totals');
			}
			if (disclosure && expanded) {
				const summary = disclosure.querySelector<HTMLElement>('summary');
				if (!summary) {
					throw new Error('Completed steps have no disclosure control');
				}
				summary.click();
				if (options.expandThinking) {
					for (const button of disclosure.querySelectorAll<HTMLElement>('.chat-thinking-box.chat-used-context-collapsed > .chat-used-context-label .monaco-button')) {
						button.click();
					}
				}
				await settle();
				if (progress !== ChatProgressAnimation.Off) {
					const parts = [...disclosure.children].filter(part => !part.matches('summary') && part.getBoundingClientRect().height > 0);
					if (parts.slice(1).some((part, index) => Math.abs(part.getBoundingClientRect().top - parts[index].getBoundingClientRect().bottom - 16) > 0.1)) {
						throw new Error('Expanded completed steps lost the persistent activity spacing');
					}
				}
			}
			if (progress !== ChatProgressAnimation.Off && (!disclosure || disclosure.open)) {
				for (const pill of value.querySelectorAll('.chat-tool-chain .chat-codeblock-pill-container')) {
					const row = pill.closest('.chat-thinking-tool-wrapper');
					const icon = row?.querySelector(':scope > .chat-thinking-icon');
					const status = pill.querySelector('.status-indicator-container');
					if (!row || !icon || !status) {
						throw new Error('Edit progress is missing its activity row, icon, or status');
					}
					const labelBounds = status.getBoundingClientRect();
					const iconBounds = icon.getBoundingClientRect();
					if (Math.abs(labelBounds.top - row.getBoundingClientRect().top) > 0.1
						|| Math.abs(iconBounds.top + iconBounds.height / 2 - labelBounds.top - labelBounds.height / 2) > 0.1) {
						throw new Error('Edit status text and its chain icon are not aligned');
					}
					const markdown = pill.closest('.chat-markdown-part');
					if (markdown) {
						const blocks = [...markdown.children];
						if (blocks.slice(1).some((block, index) => Math.abs(block.getBoundingClientRect().top - blocks[index].getBoundingClientRect().bottom - 16) > 0.1)) {
							throw new Error('Markdown edit blocks lost the shared activity spacing');
						}
					}
				}
			}
		},
	});
	return defineThemedFixtureGroup({
		RestoredCollapsed: scenario(),
		WithEdits: scenario({ edits }),
		WithEditsExpanded: scenario({ edits, expanded: true }),
		WithEditsInProgress: scenario({ edits, state: 'working' }),
		WithEditsLiveCompletion: scenario({ edits, state: 'live' }),
		WithEditsNarrow: scenario({ edits, width: 420 }),
		WithMarkdownEdits: scenario({ edits, markdownEdits: true, expanded: true }),
		WithMarkdownEditsNarrow: scenario({ edits, markdownEdits: true, expanded: true, width: 420 }),
		WithMarkdownEditsLiveCompletion: scenario({ edits, markdownEdits: true, state: 'live', expanded: true }),
		WithMarkdownEditsInProgress: scenario({ edits, markdownEdits: true, state: 'working' }),
		LegacyWithMarkdownEdits: scenario({ edits, markdownEdits: true, progress: ChatProgressAnimation.Off, expanded: true }),
		AdditionsOnly: scenario({ edits: [{ ...edits[0], editKind: 'create', diff: { added: 18, removed: 0 }, beforeContentUri: undefined }] }),
		DeletionsOnly: scenario({ edits: [{ ...edits[0], editKind: 'delete', diff: { added: 0, removed: 4 }, afterContentUri: undefined }] }),
		ZeroEdits: scenario({ edits: [{ ...edits[0], diff: { added: 0, removed: 0 } }] }),
		LegacyWithEdits: scenario({ edits, progress: ChatProgressAnimation.Off }),
		SingleToolChain: defineComponentFixture({
			render: context => renderChatWidget(context, {
				persistentProgress: ChatProgressAnimation.Weave,
				collapseCompletedResponses: true,
				messages: [{
					user: 'Review the progress renderers',
					responseComplete: true,
					assistant: [
						...Array.from({ length: 3 }, (_, index) => ({
							kind: 'tool' as const, toolId: 'read_file', displayName: 'Read file', invocationMessage: `Read progress renderer ${index + 1}`, complete: true,
						})),
						{ kind: 'markdown', text: '## Review summary\n\nThe three progress renderers agree.' },
					],
				}],
			}),
		}),
		LiveCompletion: scenario({ state: 'live' }),
		ExpandedSteps: scenario({ expanded: true }),
		ExpandedReasoning: scenario({ expanded: true, expandThinking: true }),
		InProgress: scenario({ state: 'working' }),
		CollapseDisabled: scenario({ collapse: false }),
		EnabledAfterCompletion: scenario({ collapse: false, toggleCollapse: true }),
		DisabledAfterCompletion: scenario({ toggleCollapse: false }),
		LegacyCollapsed: scenario({ progress: ChatProgressAnimation.Off }),
		LegacyExpanded: scenario({ progress: ChatProgressAnimation.Off, expanded: true }),
	});
}

const MULTI_TURN: IFixtureMessage[] = [
	{
		user: 'What does this project do?',
		assistant: [
			{ kind: 'markdown', text: 'This project is **Visual Studio Code**, a free source-code editor made by Microsoft for Windows, Linux and macOS.' },
		],
	},
	{
		user: 'Where is the entrypoint?',
		assistant: [
			{ kind: 'markdown', text: 'The desktop entrypoint is in `src/vs/code/electron-main/main.ts`. The browser/server entrypoints live under `src/vs/server/`.' },
		],
	},
	{
		user: 'Thanks!',
		assistant: [
			{ kind: 'markdown', text: 'You are welcome — let me know if you have more questions.' },
		],
	},
];

// Code blocks that follow or are nested in list items should have symmetric spacing
// above and below. This also covers tight lists, where prose before a code block is a
// text node and the code block is therefore still the first element child.
const CODE_BLOCK_IN_LIST: IFixtureMessage[] = [
	{
		user: 'Why do the files appear while diffs fail?',
		assistant: [
			{
				kind: 'markdown', text: [
					'## Root cause',
					'',
					'Git is unusable on this Mac because the Xcode license has not been accepted. Both `git --version` and `/usr/bin/git --version` currently exit with code 69 and report:',
					'',
					'> You have not agreed to the Xcode license agreements.',
					'',
					'### Why files appear but diffs fail',
					'',
					'1. The session restores/caches the change-set metadata, so VS Code can display the filenames and change counts.',
					'2. Opening a diff requires loading its original side using a `git-blob:` URI.',
					'3. Agent Host executes roughly:',
					'   ```bash',
					'   git show 1e393d7b352de7927a98d0321e51ae63046c8652:<path>',
					'   ```',
					'4. Git refuses to run because of the Xcode license.',
				].join('\n')
			},
		],
	},
];

async function renderResizeObserverLoopHarness(context: ComponentFixtureContext, hostLayoutMode: IChatWidgetFixtureOptions['hostLayoutMode']): Promise<void> {
	const targetWindow = dom.getWindow(context.container);

	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget(context, {
		messages: [{
			user: [
				'Investigate ResizeObserver re-entry.',
				'',
				'Context (text/plain; no binary upload):',
				'Issue #316501 tracks chat list and input resize-observer loop warnings.',
			].join('\n'),
			assistant: [{
				kind: 'markdown',
				text: 'The mocked chat harness is ready.',
			}],
		}],
		width: 720,
		height: 600,
		hostLayoutMode,
		onRendered: value => handle = value,
	});

	if (!handle) {
		throw new Error('ResizeObserver harness did not initialize');
	}
	const fixtureHandle = handle;

	const controls = dom.$('.resize-observer-loop-harness');
	const runButton = dom.append(controls, dom.$<HTMLButtonElement>('button.resize-observer-loop-run'));
	runButton.type = 'button';
	runButton.textContent = 'Run 20-turn burst';
	const status = dom.append(controls, dom.$('span.resize-observer-loop-status'));
	status.role = 'status';
	status.textContent = 'Ready';
	const warnings = dom.append(controls, dom.$('span.resize-observer-loop-warnings'));
	warnings.textContent = 'Warnings: 0';
	controls.style.position = 'absolute';
	controls.style.top = '8px';
	controls.style.right = '8px';
	controls.style.zIndex = '100';
	controls.style.display = 'flex';
	controls.style.gap = '8px';
	controls.style.alignItems = 'center';
	controls.style.padding = '6px 8px';
	controls.style.background = 'var(--vscode-editorWidget-background)';
	controls.style.border = '1px solid var(--vscode-widget-border)';
	context.container.style.position = 'relative';
	context.container.appendChild(controls);

	let warningCount = 0;
	context.disposableStore.add(dom.addDisposableListener(targetWindow, dom.EventType.ERROR, event => {
		if (event instanceof ErrorEvent && event.message.includes('ResizeObserver loop')) {
			warningCount++;
			warnings.textContent = `Warnings: ${warningCount}`;
			warnings.dataset.observerContext = dom.getRecentDisposableResizeObserverContextForLoopError(event.message, targetWindow) ?? event.message;
			status.textContent = 'Captured ResizeObserver warning';
		}
	}));

	const nextFrame = () => new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	const runBurst = async () => {
		runButton.disabled = true;
		status.textContent = 'Adding queued turns...';
		const responses = [];

		for (let index = 1; index <= 20; index++) {
			const prompt = [
				`Queued prompt ${index}`,
				'',
				'Context (text/plain; no binary upload):',
				...Array.from({ length: 12 }, (_, line) => `Resize stress sample ${index}.${line + 1}: ${'layout '.repeat(index % 5 + 1)}`),
			].join('\n');

			fixtureHandle.inputPart.setValue(prompt, true);
			fixtureHandle.inputPart.layout(fixtureHandle.width);

			const request = fixtureHandle.model.addRequest(makeUserMessage(prompt), { variables: [] }, 0);
			fixtureHandle.model.acceptResponseProgress(request, {
				kind: 'progressMessage',
				content: new MarkdownString(`Processing queued prompt ${index}...`),
			});
			if (index === 1) {
				fixtureHandle.addTerminalConfirmation(request, 'git status --short');
			}
			responses.push(request.response!);

			fixtureHandle.listWidget.refresh();
			await nextFrame();

			fixtureHandle.inputPart.setValue('', true);
			fixtureHandle.inputPart.layout(fixtureHandle.width);
			fixtureHandle.model.acceptResponseProgress(request, {
				kind: 'markdownContent',
				content: new MarkdownString(`Mock streamed output ${index}\n\n${'- response line\n'.repeat(index % 7 + 1)}`),
			});
			fixtureHandle.listWidget.refresh();
			await nextFrame();
		}

		status.textContent = 'Completing mocked responses...';
		for (const response of responses) {
			response.complete();
			fixtureHandle.listWidget.refresh();
			await nextFrame();
		}

		status.textContent = warningCount > 0
			? 'Completed with ResizeObserver warning'
			: 'Completed without warning';
		runButton.disabled = false;
	};

	context.disposableStore.add(dom.addDisposableListener(runButton, dom.EventType.CLICK, () => {
		void runBurst();
	}));
}

async function renderDisabledPetResizeObserverProbe(context: ComponentFixtureContext): Promise<void> {
	const targetWindow = dom.getWindow(context.container);
	const instantiationService = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registerChatFixtureServices,
	});
	context.container.style.width = '720px';
	context.container.style.height = '600px';
	const movementBounds = dom.append(context.container, dom.$('.disabled-pet-movement-bounds'));
	const petHost = dom.append(movementBounds, dom.$('.disabled-pet-host'));
	const dragBounds = dom.append(petHost, dom.$('.disabled-pet-drag-bounds'));
	const trigger = dom.append(dragBounds, dom.$('.disabled-pet-resize-observer-trigger'));
	movementBounds.style.width = '100%';
	movementBounds.style.height = '200px';
	petHost.style.width = '100%';
	petHost.style.height = '100px';
	dragBounds.style.width = '100%';
	dragBounds.style.height = '100%';
	trigger.style.width = '10px';
	trigger.style.height = '10px';
	context.disposableStore.add(instantiationService.createInstance(
		ChatPetWidget,
		{
			parent: petHost,
			dragBounds,
			movementBounds,
			model: constObservable(undefined),
			hasInput: constObservable(false),
			inputChanged: Event.None,
			getPlatformTop: () => undefined,
			onDidChangePlatform: Event.None,
		},
		undefined,
	));

	const status = dom.append(context.container, dom.$('.disabled-pet-resize-observer-status'));
	status.role = 'status';
	status.textContent = 'Running disabled pet observer probe';
	status.dataset.warningCount = '0';
	context.disposableStore.add(dom.addDisposableListener(targetWindow, dom.EventType.ERROR, event => {
		if (event instanceof ErrorEvent && event.message.includes('ResizeObserver loop')) {
			status.dataset.warningCount = String(Number(status.dataset.warningCount) + 1);
			status.dataset.observerContext = dom.getRecentDisposableResizeObserverContextForLoopError(event.message, targetWindow) ?? event.message;
		}
	}));

	let triggerCallbacks = 0;
	const triggerObserver = context.disposableStore.add(new dom.DisposableResizeObserver('DisabledPetFixture.deepTrigger', () => {
		triggerCallbacks++;
		if (triggerCallbacks === 2) {
			dragBounds.style.height = `${dragBounds.getBoundingClientRect().height + 1}px`;
		}
	}, targetWindow));
	context.disposableStore.add(triggerObserver.observe(trigger));

	const nextFrame = () => new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	await nextFrame();
	await nextFrame();
	trigger.style.width = '11px';
	await nextFrame();
	await nextFrame();
	status.textContent = 'Completed disabled pet observer probe';
}

export default defineThemedFixtureGroup({ path: 'chat/widget/' }, {
	SimpleQA: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: SIMPLE_QA }) }),
	ScrollToBottomAction: defineComponentFixture({ render: renderScrollToBottomAction }),
	Streaming: defineComponentFixture({ labels: { kind: 'animated' }, render: ctx => renderChatWidget(ctx, { messages: STREAMING }) }),
	PendingToolApproval: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: PENDING_TOOL_APPROVAL }) }),
	PersistentProgress: defineThemedFixtureGroup({ path: 'persistentProgress/' }, {
		ToolChains: defineToolChainScenarios(),
		LegacyComparison: defineToolChainScenarios(ChatProgressAnimation.Off),
		CompletedResponses: defineCompletedProgressScenarios(),
		DisabledLegacyWorking: defineComponentFixture({
			labels: { kind: 'animated' },
			render: async context => {
				await renderChatWidget(context, {
					messages: [{ user: 'Wait for the next response', responseComplete: false }],
					persistentProgress: ChatProgressAnimation.Off,
				});
				if (context.container.querySelector('.chat-working-logo, .chat-working-progress')) {
					throw new Error('Disabled persistent progress must not render its indicator or logo');
				}
			},
		}),
		AnimationStyles: defineThemedFixtureGroup({
			Off: defineProgressAnimationScenarios(ChatProgressAnimation.Off),
			Weave: defineProgressAnimationScenarios(ChatProgressAnimation.Weave),
			Draw: defineProgressAnimationScenarios(ChatProgressAnimation.Draw),
			OrbitAndLock: defineProgressAnimationScenarios(ChatProgressAnimation.Orbit),
			Accordion: defineProgressAnimationScenarios(ChatProgressAnimation.Accordion),
			DialRotation: defineProgressAnimationScenarios(ChatProgressAnimation.Dial),
		}),
		ByThinkingStyle: defineThemedFixtureGroup({
			Collapsed: defineThinkingStyleScenarios(ThinkingDisplayMode.Collapsed),
			CollapsedPreview: defineThinkingStyleScenarios(ThinkingDisplayMode.CollapsedPreview),
			FixedScrolling: defineThinkingStyleScenarios(ThinkingDisplayMode.FixedScrolling),
		}),
		OffByThinkingStyle: defineThemedFixtureGroup({
			Collapsed: defineThinkingStyleScenarios(ThinkingDisplayMode.Collapsed, { progressAnimation: ChatProgressAnimation.Off }),
			CollapsedPreview: defineThinkingStyleScenarios(ThinkingDisplayMode.CollapsedPreview, { progressAnimation: ChatProgressAnimation.Off }),
			FixedScrolling: defineThinkingStyleScenarios(ThinkingDisplayMode.FixedScrolling, { progressAnimation: ChatProgressAnimation.Off }),
		}),
		OffAfterEnabled: defineThemedFixtureGroup({
			Collapsed: defineThinkingStyleScenarios(ThinkingDisplayMode.Collapsed, { progressAnimation: ChatProgressAnimation.Off, previousProgressAnimation: ChatProgressAnimation.Weave }),
			CollapsedPreview: defineThinkingStyleScenarios(ThinkingDisplayMode.CollapsedPreview, { progressAnimation: ChatProgressAnimation.Off, previousProgressAnimation: ChatProgressAnimation.Weave }),
			FixedScrolling: defineThinkingStyleScenarios(ThinkingDisplayMode.FixedScrolling, { progressAnimation: ChatProgressAnimation.Off, previousProgressAnimation: ChatProgressAnimation.Weave }),
		}),
		ResponseStreaming: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_RESPONSE),
		}),
		ResponseStreamingInsiders: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_RESPONSE, { productQuality: 'insider' }),
		}),
		AskQuestionsTool: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_QUESTION, { expectedText: 'Waiting for your response' }),
		}),
		QuestionAnswered: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_QUESTION, { submitInteraction: 'question' }),
		}),
		PlanReview: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_PLAN_REVIEW, { expectedText: 'Plan review required' }),
		}),
		PlanApproved: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_PLAN_REVIEW, { submitInteraction: 'planReview' }),
		}),
		TerminalTool: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_TERMINAL_TOOL),
		}),
		TerminalConfirmation: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_TERMINAL_CONFIRMATION, { expectedText: '1 confirmation pending' }),
		}),
		Confirmation: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_CONFIRMATION, { expectedText: '1 confirmation pending' }),
		}),
		ConfirmationAccepted: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_CONFIRMATION, { submitInteraction: 'elicitation' }),
		}),
		WorktreeCreation: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_WORKTREE),
		}),
		StreamingToolCall: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_STREAMING_TOOL),
		}),
		ThinkingAndStreamingTool: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL),
		}),
		ThinkingAndStreamingToolLegacy: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderChatWidget(context, {
				messages: PERSISTENT_PROGRESS_THINKING_AND_TOOL,
				persistentProgress: ChatProgressAnimation.Off,
				productQuality: 'stable',
				thinkingStyle: ThinkingDisplayMode.Collapsed,
				height: 560,
				listHeight: 340,
			}),
		}),
		CollapsedThinking: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING),
		}),
		CollapsedThinkingInsiders: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { productQuality: 'insider' }),
		}),
		CollapsedThinkingExpanded: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { expandThinking: true }),
		}),
		ActivityUpdates: defineComponentFixture({
			labels: { kind: 'animated' },
			virtualTime: { enabled: false },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING, { activityUpdates: true }),
		}),
		FixedScrollingThinking: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { thinkingStyle: ThinkingDisplayMode.FixedScrolling }),
		}),
		PreviewThinking: defineComponentFixture({
			labels: { kind: 'animated' },
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { thinkingStyle: ThinkingDisplayMode.CollapsedPreview }),
		}),
		CollapsedThinkingReducedMotion: defineComponentFixture({
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_THINKING_AND_TOOL, { reducedMotion: true }),
		}),
		ReducedMotion: defineComponentFixture({
			render: context => renderPersistentProgressScenario(context, PERSISTENT_PROGRESS_RESPONSE, { reducedMotion: true }),
		}),
	}),
	ResizeObserverLoopHarness: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: context => renderResizeObserverLoopHarness(context, 'stackedFull'),
	}),
	ResizeObserverLoopListOnly: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: context => renderResizeObserverLoopHarness(context, 'listOnly'),
	}),
	ResizeObserverLoopStackedTargeted: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: context => renderResizeObserverLoopHarness(context, 'stackedTargeted'),
	}),
	ResizeObserverLoopNoHostLayout: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: context => renderResizeObserverLoopHarness(context, 'none'),
	}),
	DisabledPetResizeObserverProbe: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: renderDisabledPetResizeObserverProbe,
	}),
	CodeBlockInList: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: CODE_BLOCK_IN_LIST }) }),
	bugs: defineThemedFixtureGroup({
		'issue-309796-missing-backslash': defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: ISSUE_309796_MISSING_BACKSLASH }) }),
	}),
	MultiTurn: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: MULTI_TURN }) }),
	LastResponseContentHover: defineComponentFixture({ render: renderLastResponseHover }),
	ResponseActionKeyboardFocus: defineComponentFixture({ render: ctx => renderKeyboardFocus(ctx, 'response-action') }),
	RequestTimestampKeyboardFocus: defineComponentFixture({ render: ctx => renderKeyboardFocus(ctx, 'request-timestamp') }),
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { autorun, constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { ChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatListWidget } from '../../../../contrib/chat/browser/widget/chatListWidget.js';
import { chatFloatingPersistentContentClass, chatPersistentContentHeightVariable } from '../../../../contrib/chat/browser/widget/chatWidget.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget, IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ElicitationState, IChatQuestion, IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatElicitationRequestPart } from '../../../../contrib/chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IChatToolRiskAssessmentService, IToolRiskAssessment, ToolRiskLevel } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILinkPresentationService } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../../contrib/chat/common/constants.js';
import { SessionType } from '../../../../contrib/chat/common/chatSessionsService.js';
import { IEditSessionEntryDiff } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatResponseFileChangesService, IChatResponseFileEdit } from '../../../../contrib/chat/browser/chatResponseFileChangesService.js';
import { MockChatService } from '../../../../contrib/chat/test/common/chatService/mockChatService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { FixtureMenuService, registerChatFixtureServices } from './chatFixtureUtils.js';
import { ChatTurnStatusPillsSetting, isChatTurnStatusPillsEnabled } from '../../../../contrib/chat/browser/widget/chatTurnPills.js';
import { ITerminalChatService } from '../../../../contrib/terminal/browser/terminal.js';
import { ChatPetWidget } from '../../../../contrib/chat/browser/widget/chatPetWidget.js';

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
	readonly assistant?: ReadonlyArray<
		| { kind: 'markdown'; text: string }
		| { kind: 'progress'; text: string }
		| { kind: 'questionCarousel'; questions: IChatQuestion[]; message?: string; allowSkip?: boolean }
		| { kind: 'terminalConfirmation'; command: string; title?: string; disclaimer?: string; requestUnsandboxedExecution?: boolean; requestUnsandboxedExecutionReason?: string; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean; confirmation?: { commandLine: string; cwdLabel?: string; cdPrefix?: string } }
		| { kind: 'elicitation'; title: string; message: string; confirmation?: { commandLine: string; cwdLabel?: string; cdPrefix?: string }; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean }
	>;
	readonly details?: string;
	readonly responseComplete?: boolean;
	/**
	 * Per-turn file changes surfaced via {@link IChatResponseFileChangesService},
	 * used by the turn changes summary. Requires `turnStatusPills` on the fixture
	 * options to be rendered.
	 */
	readonly fileChanges?: ReadonlyArray<IFixtureFileChange>;
}

export interface IChatWidgetFixtureOptions {
	readonly messages: ReadonlyArray<IFixtureMessage>;
	readonly width?: number;
	readonly height?: number;
	readonly listHeight?: number;
	/** Whether to render the main chat input. Defaults to `true`. */
	readonly inputVisible?: boolean;
	/** Whether to populate the response footer with an action. */
	readonly responseFooterAction?: boolean;
	/** Whether to show request and response timing details. */
	readonly verbose?: boolean;
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
	 * When set, renders the chat as an agent host session and enables the turn
	 * changes summary (`chat.turnStatusPills`), so completed turns with
	 * {@link IFixtureMessage.fileChanges} show workspace changes and external
	 * Markdown previews under the response.
	 */
	readonly turnStatusPills?: ChatTurnStatusPillsSetting;
	readonly linkPresentationService?: ILinkPresentationService;
	readonly onRendered?: (handle: IChatWidgetFixtureHandle) => void;
	/** Selects the input-height consumer used by the ResizeObserver harness. */
	readonly hostLayoutMode?: 'none' | 'listOnly' | 'stackedFull' | 'stackedTargeted';
	/** Mirrors `IChatWidgetViewOptions.persistentContentHeight` for content mounted by {@link IChatWidgetFixtureOptions.decorateInputPart}. */
	readonly persistentContentHeight?: number;
}

interface IChatWidgetFixtureHandle {
	readonly inputPart: ChatInputPart;
	readonly listWidget: ChatListWidget;
	readonly model: ChatModel;
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
	const needsTurnPills = isChatTurnStatusPillsEnabled(options.turnStatusPills);

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			registerChatFixtureServices(reg);
			reg.definePartialInstance(ITerminalChatService, {
				getTerminalInstanceByExecutionId: () => undefined,
			});
			if (options.linkPresentationService) {
				reg.defineInstance(ILinkPresentationService, options.linkPresentationService);
			}
			// Override widget service so the chat list renderer can route tool
			// confirmations to the carousel attached to our input part.
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override readonly lastFocusedWidget = undefined;
				override readonly onDidAddWidget = Event.None;
				override readonly onDidBackgroundSession = Event.None;
				override readonly onDidChangeFocusedWidget = Event.None;
				override readonly onDidChangeFocusedSession = Event.None;
				override getAllWidgets() { return widgetHolder.current ? [widgetHolder.current] : []; }
				override getWidgetByInputUri() { return undefined; }
				override getWidgetBySessionResource() { return widgetHolder.current; }
				override getWidgetsByLocations() { return []; }
				override register() { return { dispose() { } }; }
			}());

			if (needsTurnPills) {
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
		},
	});

	const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configService.setUserConfiguration('chat', {
		editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'off' },
	});
	configService.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false });
	configService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
	if (options.verbose !== undefined) {
		configService.setUserConfiguration(ChatConfiguration.Verbose, options.verbose);
	}
	if (needsTurnPills) {
		configService.setUserConfiguration(ChatConfiguration.TurnStatusPills, options.turnStatusPills);
	}

	// Build a real ChatModel populated with hand-crafted requests/responses, then drive a
	// real ChatViewModel + ChatListWidget — the same components used in production.
	// The turn changes summary only renders for agent host sessions, whose frontend
	// resource uses the session type as the scheme (e.g. `agent-host-copilotcli:/…`),
	// which is what `getChatSessionType` / `toAgentHostBackendSessionUri` recognize.
	const sessionResource = needsTurnPills
		? URI.from({ scheme: SessionType.AgentHostCopilot, path: '/turn-pills-session' })
		: undefined;
	const chatService = instantiationService.get(IChatService) as MockChatService;
	const model = disposableStore.add(instantiationService.createInstance(
		ChatModel,
		undefined,
		{ initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: sessionResource }
	));
	chatService.addSession(model);

	for (const message of options.messages) {
		const request = model.addRequest(makeUserMessage(message.user), { variables: [] }, 0);
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
			} else if (part.kind === 'questionCarousel') {
				model.acceptResponseProgress(request, {
					kind: 'questionCarousel',
					questions: part.questions,
					allowSkip: part.allowSkip ?? true,
					message: part.message,
				});
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
			} else if (part.kind === 'terminalConfirmation') {
				const title = part.title ?? `Run pwsh command?`;
				const toolInvocation = new ChatToolInvocation(
					{
						invocationMessage: new MarkdownString(`Running \`${part.command}\``),
						pastTenseMessage: new MarkdownString(`Ran \`${part.command}\``),
						confirmationMessages: { title, message: new MarkdownString(`\`${part.command}\``), disclaimer: part.disclaimer ? new MarkdownString(part.disclaimer, { supportThemeIcons: true }) : undefined },
						toolSpecificData: {
							kind: 'terminal',
							commandLine: { original: part.command },
							language: 'pwsh',
							requestUnsandboxedExecution: part.requestUnsandboxedExecution,
							requestUnsandboxedExecutionReason: part.requestUnsandboxedExecutionReason,
							confirmation: part.confirmation,
						},
					},
					fixtureToolData,
					generateUuid(),
					undefined,
					{ command: part.command },
				);
				model.acceptResponseProgress(request, toolInvocation);
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
		override readonly onDidChangeViewModel = new Emitter<never>().event;
		override readonly viewModel = viewModel;
		override readonly contribs = [];
		override readonly location = ChatAgentLocation.Chat;
		override readonly viewContext = {};
		override readonly input = inputPart;
		override readonly inputPart = inputPart;
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
				progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
			},
		},
	));

	listWidget.setViewModel(viewModel);
	listWidget.setVisible(true);
	listWidget.refresh();

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
				listContainer.dataset['expectedHeight'] = String(contentHeight);
				listWidget.layout(contentHeight, width);
			} finally {
				layouting = false;
			}
		}));
	}

	options.onRendered?.({
		inputPart,
		listWidget,
		model,
		width,
		addTerminalConfirmation: (request, command) => {
			model.acceptResponseProgress(request, new ChatToolInvocation(
				{
					invocationMessage: new MarkdownString(`Running \`${command}\``),
					pastTenseMessage: new MarkdownString(`Ran \`${command}\``),
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
	focusTarget.focus();
	if (focusTarget.ownerDocument.activeElement !== focusTarget) {
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
			warnings.dataset['observerContext'] = dom.getRecentDisposableResizeObserverContextForLoopError(event.message, targetWindow) ?? event.message;
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
	status.dataset['warningCount'] = '0';
	context.disposableStore.add(dom.addDisposableListener(targetWindow, dom.EventType.ERROR, event => {
		if (event instanceof ErrorEvent && event.message.includes('ResizeObserver loop')) {
			status.dataset['warningCount'] = String(Number(status.dataset['warningCount']) + 1);
			status.dataset['observerContext'] = dom.getRecentDisposableResizeObserverContextForLoopError(event.message, targetWindow) ?? event.message;
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

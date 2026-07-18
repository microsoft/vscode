/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable } from '../../../../../base/common/observable.js';
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
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget, IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ElicitationState, IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatElicitationRequestPart } from '../../../../contrib/chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IChatToolRiskAssessmentService, IToolRiskAssessment, ToolRiskLevel } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../../contrib/chat/common/constants.js';
import { SessionType } from '../../../../contrib/chat/common/chatSessionsService.js';
import { IEditSessionEntryDiff } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatResponseFileChangesService } from '../../../../contrib/chat/browser/chatResponseFileChangesService.js';
import { MockChatService } from '../../../../contrib/chat/test/common/chatService/mockChatService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { FixtureMenuService, registerChatFixtureServices } from './chatFixtureUtils.js';
import { ChatTurnStatusPillsSetting, isChatTurnStatusPillsEnabled } from '../../../../contrib/chat/browser/widget/chatTurnPills.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

export interface IFixtureFileChange {
	readonly name: string;
	readonly added: number;
	readonly removed: number;
	/** Whether the file was created (vs. edited) during the turn. */
	readonly created: boolean;
}

export interface IFixtureMessage {
	readonly user: string; // user prompt text
	readonly assistant?: ReadonlyArray<
		| { kind: 'markdown'; text: string }
		| { kind: 'progress'; text: string }
		| { kind: 'terminalConfirmation'; command: string; title?: string; disclaimer?: string; requestUnsandboxedExecution?: boolean; requestUnsandboxedExecutionReason?: string; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean; confirmation?: { commandLine: string; cwdLabel?: string; cdPrefix?: string } }
		| { kind: 'elicitation'; title: string; message: string; confirmation?: { commandLine: string; cwdLabel?: string; cdPrefix?: string }; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean }
	>;
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
	/** Whether to render the main chat input. Defaults to `true`. */
	readonly inputVisible?: boolean;
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
	 * {@link IFixtureMessage.fileChanges} show the summary/preview under the
	 * response.
	 */
	readonly turnStatusPills?: ChatTurnStatusPillsSetting;
}

function makeFileDiff(change: IFixtureFileChange): IEditSessionEntryDiff {
	// A created file has no before-content, so the agent host provider maps its
	// `originalURI` to the `modifiedURI` (equal URIs); an edited file keeps a
	// distinct original.
	const modifiedURI = URI.file(`/repo/${change.name}`);
	const originalURI = change.created ? modifiedURI : URI.file(`/repo/.original/${change.name}`);
	return { originalURI, modifiedURI, added: change.added, removed: change.removed, quitEarly: false, identical: false, isFinal: true, isBusy: false };
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
	const needsTurnPills = isChatTurnStatusPillsEnabled(options.turnStatusPills);

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			registerChatFixtureServices(reg);
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
			requestDiffs.set(request.id, message.fileChanges.map(makeFileDiff));
		}
		for (const part of message.assistant ?? []) {
			if (part.kind === 'markdown') {
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(part.text) });
			} else if (part.kind === 'progress') {
				model.acceptResponseProgress(request, { kind: 'progressMessage', content: new MarkdownString(part.text) });
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
		if (message.responseComplete !== false) {
			response.complete();
		}
	}

	const viewModel = disposableStore.add(instantiationService.createInstance(ChatViewModel, model, undefined));

	const width = options.width ?? 720;
	const height = options.height ?? 600;
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
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openPermissionPicker', title: 'Default Approvals' }, group: 'navigation', order: 10 });

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
		listBackground: 'var(--vscode-editor-background)',
	};

	const inputPart = disposableStore.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, inputOptions, inputStyles, false));

	const fixtureWidget = new class extends mock<IChatWidget>() {
		override readonly onDidChangeViewModel = new Emitter<never>().event;
		override readonly viewModel = viewModel;
		override readonly contribs = [];
		override readonly location = ChatAgentLocation.Chat;
		override readonly viewContext = {};
		override readonly inputPart = inputPart;
	}();
	widgetHolder.current = fixtureWidget;

	inputPart.render(session, '', fixtureWidget);
	inputPart.layout(width);

	options.decorateInputPart?.(inputPart, instantiationService);
	inputPart.element.classList.toggle('chat-input-hidden', options.inputVisible === false);

	const listContainer = dom.$('.interactive-list');
	listContainer.style.flex = '1 1 auto';
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
			renderStyle: 'compact',
			styles: {
				listForeground: 'var(--vscode-foreground)',
				listBackground: 'var(--vscode-editor-background)',
			},
			location: ChatAgentLocation.Chat,
			rendererOptions: {
				progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
			},
		},
	));
	listWidget.setViewModel(viewModel);
	listWidget.setVisible(true);
	listWidget.refresh();

	const listHeight = 420;
	listWidget.layout(listHeight, width);
	listWidget.scrollTop = 0;
}

const SIMPLE_QA: IFixtureMessage[] = [
	{
		user: 'Add a fibonacci function to fibon.ts',
		assistant: [
			{ kind: 'markdown', text: 'I added a recursive `fibonacci(n)` to `fibon.ts`. Note that recursion is exponential — for large `n` consider an iterative version.' },
		],
	},
];

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
// above and below. Covers the two DOM shapes markdown produces: a code block that is a
// sibling after a list, and a code block nested inside a list item (indented fence).
const CODE_BLOCK_IN_LIST: IFixtureMessage[] = [
	{
		user: 'How do I set up the project?',
		assistant: [
			{
				kind: 'markdown', text: [
					'Follow these steps:',
					'',
					'- Clone the repository',
					'- Install the dependencies',
					'',
					'```bash',
					'npm install',
					'```',
					'',
					'- Then start the build watcher:',
					'',
					'  ```bash',
					'  npm run watch',
					'  ```',
					'',
					'- Finally, launch the app',
				].join('\n')
			},
		],
	},
];

export default defineThemedFixtureGroup({ path: 'chat/widget/' }, {
	SimpleQA: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: SIMPLE_QA }) }),
	Streaming: defineComponentFixture({ labels: { kind: 'animated' }, render: ctx => renderChatWidget(ctx, { messages: STREAMING }) }),
	PendingToolApproval: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: PENDING_TOOL_APPROVAL }) }),
	CodeBlockInList: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: CODE_BLOCK_IN_LIST }) }),
	bugs: defineThemedFixtureGroup({
		'issue-309796-missing-backslash': defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: ISSUE_309796_MISSING_BACKSLASH }) }),
	}),
	MultiTurn: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: MULTI_TURN }) }),
});

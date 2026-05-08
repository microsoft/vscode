/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { ChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatListWidget } from '../../../../contrib/chat/browser/widget/chatListWidget.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IChatWidget, IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ElicitationState, IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatElicitationRequestPart } from '../../../../contrib/chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IChatToolRiskAssessmentService, IToolRiskAssessment, ToolRiskLevel } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../../contrib/chat/common/constants.js';
import { MockChatService } from '../../../../contrib/chat/test/common/chatService/mockChatService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { FixtureMenuService, registerChatFixtureServices } from './chatFixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

export interface IFixtureMessage {
	readonly user: string; // user prompt text
	readonly assistant?: ReadonlyArray<
		| { kind: 'markdown'; text: string }
		| { kind: 'progress'; text: string }
		| { kind: 'terminalConfirmation'; command: string; title?: string; disclaimer?: string; requestUnsandboxedExecution?: boolean; requestUnsandboxedExecutionReason?: string; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean }
		| { kind: 'elicitation'; title: string; message: string; riskAssessment?: { risk: ToolRiskLevel; explanation: string }; riskLoading?: boolean }
	>;
	readonly responseComplete?: boolean;
}

export interface IChatWidgetFixtureOptions {
	readonly messages: ReadonlyArray<IFixtureMessage>;
	readonly width?: number;
	readonly height?: number;
	/**
	 * When `false`, registers a stub `IChatToolRiskAssessmentService` whose
	 * `isEnabled()` returns `false`, exercising the "feature off" code path.
	 * When omitted, behaves like today (auto-detected from message risk data).
	 */
	readonly riskAssessmentEnabled?: boolean;
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

	// Build a real ChatModel populated with hand-crafted requests/responses, then drive a
	// real ChatViewModel + ChatListWidget — the same components used in production.
	const chatService = instantiationService.get(IChatService) as MockChatService;
	const model = disposableStore.add(instantiationService.createInstance(
		ChatModel,
		undefined,
		{ initialLocation: ChatAgentLocation.Chat, canUseTools: true }
	));
	chatService.addSession(model);

	for (const message of options.messages) {
		const request = model.addRequest(makeUserMessage(message.user), { variables: [] }, 0);
		const response = request.response!;
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
	menuService.addItem(MenuId.ChatExecute, { command: { id: 'workbench.action.chat.submit', title: 'Send', icon: Codicon.arrowUp }, group: 'navigation', order: 4 });
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

export default defineThemedFixtureGroup({ path: 'chat/widget/' }, {
	SimpleQA: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: SIMPLE_QA }) }),
	Streaming: defineComponentFixture({ labels: { kind: 'animated' }, render: ctx => renderChatWidget(ctx, { messages: STREAMING }) }),
	PendingToolApproval: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: PENDING_TOOL_APPROVAL }) }),
	MultiTurn: defineComponentFixture({ render: ctx => renderChatWidget(ctx, { messages: MULTI_TURN }) }),
});

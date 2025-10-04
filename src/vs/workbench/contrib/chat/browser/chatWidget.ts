/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ITreeContextMenuEvent, ITreeElement } from '../../../../base/browser/ui/tree/tree.js';
import { disposableTimeout, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow, fromNowByDay } from '../../../../base/common/date.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable, thenIfNotDisposed, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename, extUri, isEqual } from '../../../../base/common/resources.js';
import { MicrotaskDelay } from '../../../../base/common/symbols.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchList, WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor } from '../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { checkModeOption } from '../common/chat.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, inChatEditingSessionContextKey, ModifiedFileEntryState } from '../common/chatEditingService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IChatLayoutService } from '../common/chatLayoutService.js';
import { IChatModel, IChatResponseModel } from '../common/chatModel.js';
import { IChatModeService } from '../common/chatModes.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestSlashPromptPart, ChatRequestToolPart, ChatRequestToolSetPart, chatSubcommandLeader, formatChatQuestion, IParsedChatRequest } from '../common/chatParserTypes.js';
import { ChatRequestParser } from '../common/chatRequestParser.js';
import { IChatLocationData, IChatSendRequestOptions, IChatService } from '../common/chatService.js';
import { IChatSlashCommandService } from '../common/chatSlashCommands.js';
import { IChatTodoListService } from '../common/chatTodoListService.js';
import { ChatRequestVariableSet, IChatRequestVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from '../common/chatVariableEntries.js';
import { ChatViewModel, IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../common/chatViewModel.js';
import { IChatInputState } from '../common/chatWidgetHistoryService.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolSet } from '../common/languageModelToolsService.js';
import { ComputeAutomaticInstructions } from '../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../common/promptSyntax/config/config.js';
import { PromptsType } from '../common/promptSyntax/promptTypes.js';
import { ParsedPromptFile, PromptHeader } from '../common/promptSyntax/service/newPromptsParser.js';
import { IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { handleModeSwitch } from './actions/chatActions.js';
import { ChatTreeItem, ChatViewId, IChatAcceptInputOptions, IChatAccessibilityService, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions, IChatWidget, IChatWidgetService, IChatWidgetViewContext, IChatWidgetViewOptions } from './chat.js';
import { ChatAccessibilityProvider } from './chatAccessibilityProvider.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { ChatTodoListWidget } from './chatContentParts/chatTodoListWidget.js';
import { ChatInputPart, IChatInputStyles } from './chatInputPart.js';
import { ChatListDelegate, ChatListItemRenderer, IChatListItemTemplate, IChatRendererDelegate } from './chatListRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatViewPane } from './chatViewPane.js';
import './media/chat.css';
import './media/chatAgentHover.css';
import './media/chatViewWelcome.css';
import { ChatViewWelcomePart, IChatSuggestedPrompts, IChatViewWelcomeContent } from './viewsWelcome/chatViewWelcomeController.js';

const $ = dom.$;

const defaultChat = {
	provider: product.defaultChatAgent?.provider ?? { default: { id: '', name: '' }, enterprise: { id: '', name: '' }, apple: { id: '', name: '' }, google: { id: '', name: '' } },
	termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};

export interface IChatViewState {
	inputValue?: string;
	inputState?: IChatInputState;
}

export interface IChatWidgetStyles extends IChatInputStyles {
	inputEditorBackground: string;
	resultEditorBackground: string;
}

export interface IChatWidgetContrib extends IDisposable {
	readonly id: string;

	/**
	 * A piece of state which is related to the input editor of the chat widget
	 */
	getInputState?(): any;

	/**
	 * Called with the result of getInputState when navigating input history.
	 */
	setInputState?(s: any): void;
}

interface IChatRequestInputOptions {
	input: string;
	attachedContext: ChatRequestVariableSet;
}

export interface IChatWidgetLocationOptions {
	location: ChatAgentLocation;
	resolveData?(): IChatLocationData | undefined;
}

export function isQuickChat(widget: IChatWidget): boolean {
	return 'viewContext' in widget && 'isQuickChat' in widget.viewContext && Boolean(widget.viewContext.isQuickChat);
}

export function isInlineChat(widget: IChatWidget): boolean {
	return 'viewContext' in widget && 'isInlineChat' in widget.viewContext && Boolean(widget.viewContext.isInlineChat);
}

interface IChatHistoryListItem {
	readonly sessionId: string;
	readonly title: string;
	readonly lastMessageDate: number;
	readonly isActive: boolean;
}

class ChatHistoryListDelegate implements IListVirtualDelegate<IChatHistoryListItem> {
	getHeight(element: IChatHistoryListItem): number {
		return 22;
	}

	getTemplateId(element: IChatHistoryListItem): string {
		return 'chatHistoryItem';
	}
}

interface IChatHistoryTemplate {
	container: HTMLElement;
	title: HTMLElement;
	date: HTMLElement;
	disposables: DisposableStore;
}

class ChatHistoryHoverDelegate extends WorkbenchHoverDelegate {
	constructor(
		private readonly getViewContainerLocation: () => ViewContainerLocation,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,
	) {
		super('element', {
			instantHover: true
		}, () => this.getHoverOptions(), configurationService, hoverService);
	}

	private getHoverOptions(): Partial<IHoverOptions> {
		const sideBarPosition = this.layoutService.getSideBarPosition();
		const viewContainerLocation = this.getViewContainerLocation();

		let hoverPosition: HoverPosition;
		if (viewContainerLocation === ViewContainerLocation.Sidebar) {
			hoverPosition = sideBarPosition === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
		} else if (viewContainerLocation === ViewContainerLocation.AuxiliaryBar) {
			hoverPosition = sideBarPosition === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
		} else {
			hoverPosition = HoverPosition.RIGHT;
		}

		return { additionalClasses: ['chat-history-item-hover'], position: { hoverPosition, forcePosition: true } };
	}
}

class ChatHistoryListRenderer implements IListRenderer<IChatHistoryListItem, IChatHistoryTemplate> {
	readonly templateId = 'chatHistoryItem';

	constructor(
		private readonly onDidClickItem: (item: IChatHistoryListItem) => void,
		private readonly formatHistoryTimestamp: (timestamp: number, todayMidnightMs: number) => string,
		private readonly todayMidnightMs: number
	) { }

	renderTemplate(container: HTMLElement): IChatHistoryTemplate {
		const disposables = new DisposableStore();

		container.classList.add('chat-welcome-history-item');
		const title = dom.append(container, $('.chat-welcome-history-title'));
		const date = dom.append(container, $('.chat-welcome-history-date'));

		container.tabIndex = 0;
		container.setAttribute('role', 'button');

		return { container, title, date, disposables };
	}

	renderElement(element: IChatHistoryListItem, index: number, templateData: IChatHistoryTemplate): void {
		const { container, title, date, disposables } = templateData;

		disposables.clear();

		title.textContent = element.title;
		date.textContent = this.formatHistoryTimestamp(element.lastMessageDate, this.todayMidnightMs);
		container.setAttribute('aria-label', element.title);

		disposables.add(dom.addDisposableListener(container, dom.EventType.CLICK, () => {
			this.onDidClickItem(element);
		}));

		disposables.add(dom.addStandardDisposableListener(container, dom.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				e.preventDefault();
				e.stopPropagation();
				this.onDidClickItem(element);
			}
		}));
	}

	disposeTemplate(templateData: IChatHistoryTemplate): void {
		templateData.disposables.dispose();
	}
}

export class ChatWidget extends Disposable implements IChatWidget {
	public static readonly CONTRIBS: { new(...args: [IChatWidget, ...any]): IChatWidgetContrib }[] = [];

	private readonly _onDidSubmitAgent = this._register(new Emitter<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>());
	public readonly onDidSubmitAgent = this._onDidSubmitAgent.event;

	private _onDidChangeAgent = this._register(new Emitter<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>());
	readonly onDidChangeAgent = this._onDidChangeAgent.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeViewModel = this._register(new Emitter<void>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private _onDidScroll = this._register(new Emitter<void>());
	readonly onDidScroll = this._onDidScroll.event;

	private _onDidClear = this._register(new Emitter<void>());
	readonly onDidClear = this._onDidClear.event;

	private _onDidAcceptInput = this._register(new Emitter<void>());
	readonly onDidAcceptInput = this._onDidAcceptInput.event;

	private _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private _onDidShow = this._register(new Emitter<void>());
	readonly onDidShow = this._onDidShow.event;

	private _onDidChangeParsedInput = this._register(new Emitter<void>());
	readonly onDidChangeParsedInput = this._onDidChangeParsedInput.event;

	private readonly _onWillMaybeChangeHeight = new Emitter<void>();
	readonly onWillMaybeChangeHeight: Event<void> = this._onWillMaybeChangeHeight.event;

	private _onDidChangeHeight = this._register(new Emitter<number>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly _onDidChangeContentHeight = new Emitter<void>();
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	private contribs: ReadonlyArray<IChatWidgetContrib> = [];

	private tree!: WorkbenchObjectTree<ChatTreeItem, FuzzyScore>;
	private renderer!: ChatListItemRenderer;
	private readonly _codeBlockModelCollection: CodeBlockModelCollection;
	private lastItem: ChatTreeItem | undefined;

	private readonly inputPartDisposable: MutableDisposable<ChatInputPart> = this._register(new MutableDisposable());
	private readonly inlineInputPartDisposable: MutableDisposable<ChatInputPart> = this._register(new MutableDisposable());
	private readonly timeoutDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private inputContainer!: HTMLElement;
	private focusedInputDOM!: HTMLElement;
	private editorOptions!: ChatEditorOptions;

	private recentlyRestoredCheckpoint: boolean = false;

	private settingChangeCounter = 0;

	private listContainer!: HTMLElement;
	private container!: HTMLElement;
	private historyListContainer!: HTMLElement;
	get domNode() {
		return this.container;
	}

	private welcomeMessageContainer!: HTMLElement;
	private readonly welcomePart: MutableDisposable<ChatViewWelcomePart> = this._register(new MutableDisposable());
	private readonly historyViewStore = this._register(new DisposableStore());
	private readonly chatTodoListWidget: ChatTodoListWidget;
	private historyList: WorkbenchList<IChatHistoryListItem> | undefined;

	private bodyDimension: dom.Dimension | undefined;
	private visibleChangeCount = 0;
	private requestInProgress: IContextKey<boolean>;
	private agentInInput: IContextKey<boolean>;
	private inEmptyStateWithHistoryEnabledKey: IContextKey<boolean>;
	private currentRequest: Promise<void> | undefined;

	private _visible = false;
	public get visible() {
		return this._visible;
	}

	private previousTreeScrollHeight: number = 0;

	/**
	 * Whether the list is scroll-locked to the bottom. Initialize to true so that we can scroll to the bottom on first render.
	 * The initial render leads to a lot of `onDidChangeTreeContentHeight` as the renderer works out the real heights of rows.
	 */
	private scrollLock = true;

	private _isReady = false;

	private _instructionFilesCheckPromise: Promise<boolean> | undefined;
	private _instructionFilesExist: boolean | undefined;
	private _onDidBecomeReady = this._register(new Emitter<void>());

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: ChatViewModel | undefined;

	// Welcome view rendering scheduler to prevent reentrant calls
	private _welcomeRenderScheduler: RunOnceScheduler;

	// Coding agent locking state
	private _lockedToCodingAgent: string | undefined;
	private _lockedToCodingAgentContextKey!: IContextKey<boolean>;
	private _codingAgentPrefix: string | undefined;
	private _lockedAgentId: string | undefined;

	private lastWelcomeViewChatMode: ChatModeKind | undefined;

	// Cache for prompt file descriptions to avoid async calls during rendering
	private readonly promptDescriptionsCache = new Map<string, string>();
	private _isLoadingPromptDescriptions = false;

	// UI state for temporarily hiding chat history
	private _historyVisible = true;
	private _mostRecentlyFocusedItemIndex: number = -1;

	private set viewModel(viewModel: ChatViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
			this.logService.debug('ChatWidget#setViewModel: have viewModel');

			if (viewModel.model.editingSessionObs) {
				this.logService.debug('ChatWidget#setViewModel: waiting for editing session');
				viewModel.model.editingSessionObs?.promise.then(() => {
					this._isReady = true;
					this._onDidBecomeReady.fire();
				});
			} else {
				this._isReady = true;
				this._onDidBecomeReady.fire();
			}
		} else {
			this.logService.debug('ChatWidget#setViewModel: no viewModel');
		}

		this._onDidChangeViewModel.fire();
	}

	get viewModel() {
		return this._viewModel;
	}

	private readonly _editingSession = observableValue<IChatEditingSession | undefined>(this, undefined);

	private parsedChatRequest: IParsedChatRequest | undefined;
	get parsedInput() {
		if (this.parsedChatRequest === undefined) {
			if (!this.viewModel) {
				return { text: '', parts: [] };
			}

			this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser)
				.parseChatRequest(this.viewModel!.sessionId, this.getInput(), this.location, {
					selectedAgent: this._lastSelectedAgent,
					mode: this.input.currentModeKind,
					forcedAgent: this._lockedAgentId ? this.chatAgentService.getAgent(this._lockedAgentId) : undefined
				});
			this._onDidChangeParsedInput.fire();
		}

		return this.parsedChatRequest;
	}

	get scopedContextKeyService(): IContextKeyService {
		return this.contextKeyService;
	}

	private readonly _location: IChatWidgetLocationOptions;
	get location() {
		return this._location.location;
	}

	readonly viewContext: IChatWidgetViewContext;

	private shouldShowChatSetup(): boolean {
		// Check if chat is not installed OR user can sign up for free
		// Equivalent to: ChatContextKeys.Setup.installed.negate() OR ChatContextKeys.Entitlement.canSignUp
		return !this.chatEntitlementService.sentiment.installed || this.chatEntitlementService.entitlement === ChatEntitlement.Available;
	}

	get supportsChangingModes(): boolean {
		return !!this.viewOptions.supportsChangingModes;
	}

	get chatDisclaimer(): string {
		return localize('chatDisclaimer', "AI responses may be inaccurate.");
	}

	get locationData() {
		return this._location.resolveData?.();
	}

	constructor(
		location: ChatAgentLocation | IChatWidgetLocationOptions,
		_viewContext: IChatWidgetViewContext | undefined,
		private readonly viewOptions: IChatWidgetViewOptions,
		private readonly styles: IChatWidgetStyles,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatAccessibilityService private readonly chatAccessibilityService: IChatAccessibilityService,
		@ILogService private readonly logService: ILogService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@IChatEditingService chatEditingService: IChatEditingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IChatLayoutService private readonly chatLayoutService: IChatLayoutService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this._lockedToCodingAgentContextKey = ChatContextKeys.lockedToCodingAgent.bindTo(this.contextKeyService);

		this.viewContext = _viewContext ?? {};

		const viewModelObs = observableFromEvent(this, this.onDidChangeViewModel, () => this.viewModel);

		if (typeof location === 'object') {
			this._location = location;
		} else {
			this._location = { location };
		}

		ChatContextKeys.inChatSession.bindTo(contextKeyService).set(true);
		ChatContextKeys.location.bindTo(contextKeyService).set(this._location.location);
		ChatContextKeys.inQuickChat.bindTo(contextKeyService).set(isQuickChat(this));
		this.agentInInput = ChatContextKeys.inputHasAgent.bindTo(contextKeyService);
		this.requestInProgress = ChatContextKeys.requestInProgress.bindTo(contextKeyService);

		// Context key for when empty state history is enabled and in empty state
		this.inEmptyStateWithHistoryEnabledKey = ChatContextKeys.inEmptyStateWithHistoryEnabled.bindTo(contextKeyService);
		this._welcomeRenderScheduler = this._register(new RunOnceScheduler(() => this.renderWelcomeViewContentIfNeeded(), 10));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EmptyStateHistoryEnabled)) {
				this.updateEmptyStateWithHistoryContext();
				this._welcomeRenderScheduler.schedule();
			}
		}));
		this.updateEmptyStateWithHistoryContext();

		// Update welcome view content when `anonymous` condition changes
		this._register(this.chatEntitlementService.onDidChangeAnonymous(() => this._welcomeRenderScheduler.schedule()));

		this._register(bindContextKey(decidedChatEditingResourceContextKey, contextKeyService, (reader) => {
			const currentSession = this._editingSession.read(reader);
			if (!currentSession) {
				return;
			}
			const entries = currentSession.entries.read(reader);
			const decidedEntries = entries.filter(entry => entry.state.read(reader) !== ModifiedFileEntryState.Modified);
			return decidedEntries.map(entry => entry.entryId);
		}));
		this._register(bindContextKey(hasUndecidedChatEditingResourceContextKey, contextKeyService, (reader) => {
			const currentSession = this._editingSession.read(reader);
			const entries = currentSession?.entries.read(reader) ?? []; // using currentSession here
			const decidedEntries = entries.filter(entry => entry.state.read(reader) === ModifiedFileEntryState.Modified);
			return decidedEntries.length > 0;
		}));
		this._register(bindContextKey(hasAppliedChatEditsContextKey, contextKeyService, (reader) => {
			const currentSession = this._editingSession.read(reader);
			if (!currentSession) {
				return false;
			}
			const entries = currentSession.entries.read(reader);
			return entries.length > 0;
		}));
		this._register(bindContextKey(inChatEditingSessionContextKey, contextKeyService, (reader) => {
			return this._editingSession.read(reader) !== null;
		}));
		this._register(bindContextKey(ChatContextKeys.chatEditingCanUndo, contextKeyService, (r) => {
			return this._editingSession.read(r)?.canUndo.read(r) || false;
		}));
		this._register(bindContextKey(ChatContextKeys.chatEditingCanRedo, contextKeyService, (r) => {
			return this._editingSession.read(r)?.canRedo.read(r) || false;
		}));
		this._register(bindContextKey(applyingChatEditsFailedContextKey, contextKeyService, (r) => {
			const chatModel = viewModelObs.read(r)?.model;
			const editingSession = this._editingSession.read(r);
			if (!editingSession || !chatModel) {
				return false;
			}
			const lastResponse = observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().at(-1)?.response).read(r);
			return lastResponse?.result?.errorDetails && !lastResponse?.result?.errorDetails.responseIsIncomplete;
		}));

		this._codeBlockModelCollection = this._register(instantiationService.createInstance(CodeBlockModelCollection, undefined));
		this.chatTodoListWidget = this._register(this.instantiationService.createInstance(ChatTodoListWidget));

		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('chat.renderRelatedFiles')) {
				this.renderChatEditingSessionState();
			}

			if (e.affectsConfiguration(ChatConfiguration.EditRequests) || e.affectsConfiguration(ChatConfiguration.CheckpointsEnabled)) {
				this.settingChangeCounter++;
				this.onDidChangeItems();
			}
		}));

		this._register(autorun(r => {

			const viewModel = viewModelObs.read(r);
			const sessions = chatEditingService.editingSessionsObs.read(r);

			const session = sessions.find(candidate => candidate.chatSessionId === viewModel?.sessionId);
			this._editingSession.set(undefined, undefined);
			this.renderChatEditingSessionState(); // this is necessary to make sure we dispose previous buttons, etc.

			if (!session) {
				// none or for a different chat widget
				return;
			}

			const entries = session.entries.read(r);
			for (const entry of entries) {
				entry.state.read(r); // SIGNAL
			}

			this._editingSession.set(session, undefined);

			r.store.add(session.onDidDispose(() => {
				this._editingSession.set(undefined, undefined);
				this.renderChatEditingSessionState();
			}));
			r.store.add(this.onDidChangeParsedInput(() => {
				this.renderChatEditingSessionState();
			}));
			r.store.add(this.inputEditor.onDidChangeModelContent(() => {
				if (this.getInput() === '') {
					this.refreshParsedInput();
					this.renderChatEditingSessionState();
				}
			}));
			this.renderChatEditingSessionState();
		}));

		this._register(codeEditorService.registerCodeEditorOpenHandler(async (input: ITextResourceEditorInput, _source: ICodeEditor | null, _sideBySide?: boolean): Promise<ICodeEditor | null> => {
			const resource = input.resource;
			if (resource.scheme !== Schemas.vscodeChatCodeBlock) {
				return null;
			}

			const responseId = resource.path.split('/').at(1);
			if (!responseId) {
				return null;
			}

			const item = this.viewModel?.getItems().find(item => item.id === responseId);
			if (!item) {
				return null;
			}

			// TODO: needs to reveal the chat view

			this.reveal(item);

			await timeout(0); // wait for list to actually render

			for (const codeBlockPart of this.renderer.editorsInUse()) {
				if (extUri.isEqual(codeBlockPart.uri, resource, true)) {
					const editor = codeBlockPart.editor;

					let relativeTop = 0;
					const editorDomNode = editor.getDomNode();
					if (editorDomNode) {
						const row = dom.findParentWithClass(editorDomNode, 'monaco-list-row');
						if (row) {
							relativeTop = dom.getTopLeftOffset(editorDomNode).top - dom.getTopLeftOffset(row).top;
						}
					}

					if (input.options?.selection) {
						const editorSelectionTopOffset = editor.getTopForPosition(input.options.selection.startLineNumber, input.options.selection.startColumn);
						relativeTop += editorSelectionTopOffset;

						editor.focus();
						editor.setSelection({
							startLineNumber: input.options.selection.startLineNumber,
							startColumn: input.options.selection.startColumn,
							endLineNumber: input.options.selection.endLineNumber ?? input.options.selection.startLineNumber,
							endColumn: input.options.selection.endColumn ?? input.options.selection.startColumn
						});
					}

					this.reveal(item, relativeTop);

					return editor;
				}
			}
			return null;
		}));

		this._register(this.onDidChangeParsedInput(() => this.updateChatInputContext()));

		// Listen to entitlement and sentiment changes instead of context keys
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
			if (!this.shouldShowChatSetup()) {
				this.resetWelcomeViewInput();
			}
		}));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
			if (!this.shouldShowChatSetup()) {
				this.resetWelcomeViewInput();
			}
		}));
	}

	private resetWelcomeViewInput(): void {
		// reset the input in welcome view if it was rendered in experimental mode
		if (this.container.classList.contains('new-welcome-view')) {
			this.container.classList.remove('new-welcome-view');
			const renderFollowups = this.viewOptions.renderFollowups ?? false;
			const renderStyle = this.viewOptions.renderStyle;
			this.createInput(this.container, { renderFollowups, renderStyle });
			this.input.setChatMode(this.lastWelcomeViewChatMode ?? ChatModeKind.Ask);
		}
	}

	private _lastSelectedAgent: IChatAgentData | undefined;
	set lastSelectedAgent(agent: IChatAgentData | undefined) {
		this.parsedChatRequest = undefined;
		this._lastSelectedAgent = agent;
		this._onDidChangeParsedInput.fire();
	}

	get lastSelectedAgent(): IChatAgentData | undefined {
		return this._lastSelectedAgent;
	}

	get supportsFileReferences(): boolean {
		return !!this.viewOptions.supportsFileReferences;
	}

	get input(): ChatInputPart {
		return this.viewModel?.editing && this.configurationService.getValue<string>('chat.editRequests') !== 'input' ? this.inlineInputPart : this.inputPart;
	}

	private get inputPart(): ChatInputPart {
		return this.inputPartDisposable.value!;
	}

	private get inlineInputPart(): ChatInputPart {
		return this.inlineInputPartDisposable.value!;
	}

	get inputEditor(): ICodeEditor {
		return this.input.inputEditor;
	}

	get inputUri(): URI {
		return this.input.inputUri;
	}

	get contentHeight(): number {
		return this.input.contentHeight + this.tree.contentHeight + this.chatTodoListWidget.height;
	}

	get attachmentModel(): ChatAttachmentModel {
		return this.input.attachmentModel;
	}

	async waitForReady(): Promise<void> {
		if (this._isReady) {
			this.logService.debug('ChatWidget#waitForReady: already ready');
			return;
		}

		this.logService.debug('ChatWidget#waitForReady: waiting for ready');
		await Event.toPromise(this._onDidBecomeReady.event);

		if (this.viewModel) {
			this.logService.debug('ChatWidget#waitForReady: ready');
		} else {
			this.logService.debug('ChatWidget#waitForReady: no viewModel');
		}
	}

	render(parent: HTMLElement): void {
		const viewId = 'viewId' in this.viewContext ? this.viewContext.viewId : undefined;
		this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
		const renderInputOnTop = this.viewOptions.renderInputOnTop ?? false;
		const renderFollowups = this.viewOptions.renderFollowups ?? !renderInputOnTop;
		const renderStyle = this.viewOptions.renderStyle;

		this.container = dom.append(parent, $('.interactive-session'));
		this.welcomeMessageContainer = dom.append(this.container, $('.chat-welcome-view-container', { style: 'display: none' }));
		this._register(dom.addStandardDisposableListener(this.welcomeMessageContainer, dom.EventType.CLICK, () => this.focusInput()));

		dom.append(this.container, this.chatTodoListWidget.domNode);
		this._register(this.chatTodoListWidget.onDidChangeHeight(() => {
			if (this.bodyDimension) {
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}
		}));

		if (renderInputOnTop) {
			this.createInput(this.container, { renderFollowups, renderStyle });
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
		} else {
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
			this.createInput(this.container, { renderFollowups, renderStyle });
		}

		this._welcomeRenderScheduler.schedule();
		this.createList(this.listContainer, { editable: !isInlineChat(this) && !isQuickChat(this), ...this.viewOptions.rendererOptions, renderStyle });

		const scrollDownButton = this._register(new Button(this.listContainer, {
			supportIcons: true,
			buttonBackground: asCssVariable(buttonSecondaryBackground),
			buttonForeground: asCssVariable(buttonSecondaryForeground),
			buttonHoverBackground: asCssVariable(buttonSecondaryHoverBackground),
		}));
		scrollDownButton.element.classList.add('chat-scroll-down');
		scrollDownButton.label = `$(${Codicon.chevronDown.id})`;
		scrollDownButton.setTitle(localize('scrollDownButtonLabel', "Scroll down"));
		this._register(scrollDownButton.onDidClick(() => {
			this.scrollLock = true;
			this.scrollToEnd();
		}));

		// Update the font family and size
		this._register(autorun(reader => {
			const fontFamily = this.chatLayoutService.fontFamily.read(reader);
			const fontSize = this.chatLayoutService.fontSize.read(reader);

			this.container.style.setProperty('--vscode-chat-font-family', fontFamily);
			this.container.style.fontSize = `${fontSize}px`;

			this.tree.rerender();
		}));

		this._register(this.editorOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();

		// Do initial render
		if (this.viewModel) {
			this.onDidChangeItems();
			this.scrollToEnd();
		}

		this.contribs = ChatWidget.CONTRIBS.map(contrib => {
			try {
				return this._register(this.instantiationService.createInstance(contrib, this));
			} catch (err) {
				this.logService.error('Failed to instantiate chat widget contrib', toErrorMessage(err));
				return undefined;
			}
		}).filter(isDefined);

		this._register((this.chatWidgetService as ChatWidgetService).register(this));

		const parsedInput = observableFromEvent(this.onDidChangeParsedInput, () => this.parsedInput);
		this._register(autorun(r => {
			const input = parsedInput.read(r);

			const newPromptAttachments = new Map<string, IChatRequestVariableEntry>();
			const oldPromptAttachments = new Set<string>();

			// get all attachments, know those that are prompt-referenced
			for (const attachment of this.attachmentModel.attachments) {
				if (attachment.range) {
					oldPromptAttachments.add(attachment.id);
				}
			}

			// update/insert prompt-referenced attachments
			for (const part of input.parts) {
				if (part instanceof ChatRequestToolPart || part instanceof ChatRequestToolSetPart || part instanceof ChatRequestDynamicVariablePart) {
					const entry = part.toVariableEntry();
					newPromptAttachments.set(entry.id, entry);
					oldPromptAttachments.delete(entry.id);
				}
			}

			this.attachmentModel.updateContext(oldPromptAttachments, newPromptAttachments.values());
		}));

		if (!this.focusedInputDOM) {
			this.focusedInputDOM = this.container.appendChild(dom.$('.focused-input-dom'));
		}
	}

	private scrollToEnd() {
		if (this.lastItem) {
			const offset = Math.max(this.lastItem.currentRenderedHeight ?? 0, 1e6);
			this.tree.reveal(this.lastItem, offset);
		}
	}

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined {
		return this.contribs.find(c => c.id === id) as T;
	}

	focusInput(): void {
		this.input.focus();

		// Sometimes focusing the input part is not possible,
		// but we'd like to be the last focused chat widget,
		// so we emit an optimistic onDidFocus event nonetheless.
		this._onDidFocus.fire();
	}

	hasInputFocus(): boolean {
		return this.input.hasFocus();
	}

	refreshParsedInput() {
		if (!this.viewModel) {
			return;
		}
		this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(this.viewModel.sessionId, this.getInput(), this.location, { selectedAgent: this._lastSelectedAgent, mode: this.input.currentModeKind });
		this._onDidChangeParsedInput.fire();
	}

	getSibling(item: ChatTreeItem, type: 'next' | 'previous'): ChatTreeItem | undefined {
		if (!isResponseVM(item)) {
			return;
		}
		const items = this.viewModel?.getItems();
		if (!items) {
			return;
		}
		const responseItems = items.filter(i => isResponseVM(i));
		const targetIndex = responseItems.indexOf(item);
		if (targetIndex === undefined) {
			return;
		}
		const indexToFocus = type === 'next' ? targetIndex + 1 : targetIndex - 1;
		if (indexToFocus < 0 || indexToFocus > responseItems.length - 1) {
			return;
		}
		return responseItems[indexToFocus];
	}

	clear(): void {
		this.logService.debug('ChatWidget#clear');
		this._isReady = false;
		if (this._dynamicMessageLayoutData) {
			this._dynamicMessageLayoutData.enabled = true;
		}
		// Unlock coding agent when clearing
		this.unlockFromCodingAgent();
		this._onDidClear.fire();
		this.chatTodoListWidget.clear(this.viewModel?.sessionId, true);
	}

	public toggleHistoryVisibility(): void {
		this._historyVisible = !this._historyVisible;
		// Find and hide/show the existing history section via CSS class toggles
		const historyRoot = this.welcomeMessageContainer.querySelector<HTMLElement>('.chat-welcome-history-root');
		if (historyRoot) {
			historyRoot.classList.toggle('chat-welcome-history-hidden', !this._historyVisible);
		}
		const shouldShowHistory = this._historyVisible && !!historyRoot;
		this.welcomeMessageContainer.classList.toggle('has-chat-history', shouldShowHistory);
	}

	private onDidChangeItems(skipDynamicLayout?: boolean) {
		// Update context key when items change
		this.updateEmptyStateWithHistoryContext();

		if (this._visible || !this.viewModel) {
			const treeItems = (this.viewModel?.getItems() ?? [])
				.map((item): ITreeElement<ChatTreeItem> => {
					return {
						element: item,
						collapsed: false,
						collapsible: false
					};
				});


			// reset the input in welcome view if it was rendered in experimental mode
			if (this.viewModel?.getItems().length) {
				this.resetWelcomeViewInput();
				this.focusInput();
			}

			if (treeItems.length > 0) {
				this.updateChatViewVisibility();
				this.renderChatTodoListWidget();
			} else {
				this._welcomeRenderScheduler.schedule();
			}

			this._onWillMaybeChangeHeight.fire();

			this.lastItem = treeItems.at(-1)?.element;
			ChatContextKeys.lastItemId.bindTo(this.contextKeyService).set(this.lastItem ? [this.lastItem.id] : []);
			this.tree.setChildren(null, treeItems, {
				diffIdentityProvider: {
					getId: (element) => {
						return element.dataId +
							// Ensure re-rendering an element once slash commands are loaded, so the colorization can be applied.
							`${(isRequestVM(element)) /* && !!this.lastSlashCommands ? '_scLoaded' : '' */}` +
							// If a response is in the process of progressive rendering, we need to ensure that it will
							// be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
							`${isResponseVM(element) && element.renderData ? `_${this.visibleChangeCount}` : ''}` +
							// Re-render once content references are loaded
							(isResponseVM(element) ? `_${element.contentReferences.length}` : '') +
							// Re-render if element becomes hidden due to undo/redo
							`_${element.shouldBeRemovedOnSend ? `${element.shouldBeRemovedOnSend.afterUndoStop || '1'}` : '0'}` +
							// Re-render if element becomes enabled/disabled due to checkpointing
							`_${element.shouldBeBlocked ? '1' : '0'}` +
							// Re-render if we have an element currently being edited
							`_${this.viewModel?.editing ? '1' : '0'}` +
							// Re-render if we have an element currently being checkpointed
							`_${this.viewModel?.model.checkpoint ? '1' : '0'}` +
							// Re-render all if invoked by setting change
							`_setting${this.settingChangeCounter || '0'}` +
							// Rerender request if we got new content references in the response
							// since this may change how we render the corresponding attachments in the request
							(isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : '');
					},
				}
			});

			if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
				this.layoutDynamicChatTreeItemMode();
			}

			this.renderFollowups();
		}
	}

	/**
	 * Updates the DOM visibility of welcome view and chat list immediately
	 * @internal
	 */
	private updateChatViewVisibility(): void {
		if (!this.viewModel) {
			return;
		}

		const numItems = this.viewModel.getItems().length;
		dom.setVisibility(numItems === 0, this.welcomeMessageContainer);
		dom.setVisibility(numItems !== 0, this.listContainer);
	}

	/**
	 * Renders the welcome view content when needed.
	 *
	 * Note: Do not call this method directly. Instead, use `this._welcomeRenderScheduler.schedule()`
	 * to ensure proper debouncing and avoid potential cyclic calls
	 * @internal
	 */
	private renderWelcomeViewContentIfNeeded() {
		if (this.viewOptions.renderStyle === 'compact' || this.viewOptions.renderStyle === 'minimal') {
			return;
		}

		const numItems = this.viewModel?.getItems().length ?? 0;
		if (!numItems) {
			const expEmptyState = this.configurationService.getValue<boolean>('chat.emptyChatState.enabled');

			let welcomeContent: IChatViewWelcomeContent;
			const defaultAgent = this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind);
			let additionalMessage = defaultAgent?.metadata.additionalWelcomeMessage;
			if (!additionalMessage) {
				additionalMessage = this._getGenerateInstructionsMessage();
			}
			if (this.shouldShowChatSetup()) {
				welcomeContent = this.getNewWelcomeViewContent();
				this.container.classList.add('new-welcome-view');
			} else if (expEmptyState) {
				welcomeContent = this.getWelcomeViewContent(additionalMessage, expEmptyState);
			} else {
				const tips = this.input.currentModeKind === ChatModeKind.Ask
					? new MarkdownString(localize('chatWidget.tips', "{0} or type {1} to attach context\n\n{2} to chat with extensions\n\nType {3} to use commands", '$(attach)', '#', '$(mention)', '/'), { supportThemeIcons: true })
					: new MarkdownString(localize('chatWidget.tips.withoutParticipants', "{0} or type {1} to attach context", '$(attach)', '#'), { supportThemeIcons: true });
				welcomeContent = this.getWelcomeViewContent(additionalMessage);
				welcomeContent.tips = tips;
			}
			if (!this.welcomePart.value || this.welcomePart.value.needsRerender(welcomeContent)) {
				this.historyViewStore.clear();
				dom.clearNode(this.welcomeMessageContainer);

				// Reset history list reference when clearing welcome view
				this.historyList = undefined;

				// Optional: recent chat history above welcome content when enabled
				const showHistory = this.configurationService.getValue<boolean>(ChatConfiguration.EmptyStateHistoryEnabled);
				if (showHistory && !this._lockedToCodingAgent && this._historyVisible) {
					this.renderWelcomeHistorySection();
				}
				this.welcomePart.value = this.instantiationService.createInstance(
					ChatViewWelcomePart,
					welcomeContent,
					{
						location: this.location,
						isWidgetAgentWelcomeViewContent: this.input?.currentModeKind === ChatModeKind.Agent
					}
				);
				dom.append(this.welcomeMessageContainer, this.welcomePart.value.element);

				// Add right-click context menu to the entire welcome container
				this._register(dom.addDisposableListener(this.welcomeMessageContainer, dom.EventType.CONTEXT_MENU, (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.contextMenuService.showContextMenu({
						menuId: MenuId.ChatWelcomeHistoryContext,
						menuActionOptions: { shouldForwardArgs: true },
						contextKeyService: this.contextKeyService.createOverlay([
							['chatHistoryVisible', this._historyVisible]
						]),
						getAnchor: () => ({ x: e.clientX, y: e.clientY }),
						getActionsContext: () => ({})
					});
				}));
			}
		}

		this.updateChatViewVisibility();

		if (numItems === 0) {
			this.refreshHistoryList();
		}
	}

	private updateEmptyStateWithHistoryContext(): void {
		const historyEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.EmptyStateHistoryEnabled);
		const numItems = this.viewModel?.getItems().length ?? 0;
		const shouldHideButtons = historyEnabled && numItems === 0;
		this.inEmptyStateWithHistoryEnabledKey.set(shouldHideButtons);
	}

	private async renderWelcomeHistorySection(): Promise<void> {
		try {
			const historyRoot = dom.append(this.welcomeMessageContainer, $('.chat-welcome-history-root'));
			const container = dom.append(historyRoot, $('.chat-welcome-history'));

			const initialHistoryItems = await this.computeHistoryItems();
			if (initialHistoryItems.length === 0) {
				historyRoot.remove();
				return;
			}

			this.historyListContainer = dom.append(container, $('.chat-welcome-history-list'));
			historyRoot.classList.toggle('chat-welcome-history-hidden', !this._historyVisible);
			this.welcomeMessageContainer.classList.toggle('has-chat-history', this._historyVisible && initialHistoryItems.length > 0);

			// Compute today's midnight once for label decisions
			const todayMidnight = new Date();
			todayMidnight.setHours(0, 0, 0, 0);
			const todayMidnightMs = todayMidnight.getTime();

			// Create hover delegate for proper tooltip positioning
			const getViewContainerLocation = () => {
				const panelLocation = this.contextKeyService.getContextKeyValue<ViewContainerLocation>('chatPanelLocation');
				return panelLocation ?? ViewContainerLocation.AuxiliaryBar;
			};
			const hoverDelegate = this.instantiationService.createInstance(ChatHistoryHoverDelegate, getViewContainerLocation);

			if (!this.historyList) {
				const delegate = new ChatHistoryListDelegate();

				const renderer = this.instantiationService.createInstance(
					ChatHistoryListRenderer,
					async (item) => await this.openHistorySession(item.sessionId),
					(timestamp, todayMs) => this.formatHistoryTimestamp(timestamp, todayMs),
					todayMidnightMs
				);
				this.historyList = this._register(this.instantiationService.createInstance(
					WorkbenchList<IChatHistoryListItem>,
					'ChatHistoryList',
					this.historyListContainer,
					delegate,
					[renderer],
					{
						horizontalScrolling: false,
						keyboardSupport: true,
						mouseSupport: true,
						multipleSelectionSupport: false,
						overrideStyles: {
							listBackground: this.styles.listBackground
						},
						accessibilityProvider: {
							getAriaLabel: (item: IChatHistoryListItem) => item.title,
							getWidgetAriaLabel: () => localize('chat.history.list', 'Chat History')
						}
					}
				));
				this.historyList.getHTMLElement().tabIndex = -1;
			} else {
				const currentHistoryList = this.historyList.getHTMLElement();
				if (currentHistoryList && currentHistoryList.parentElement !== this.historyListContainer) {
					this.historyListContainer.appendChild(currentHistoryList);
				}
			}

			this.renderHistoryItems(initialHistoryItems);

			// Add "Chat history..." link at the end
			const previousChatsLink = dom.append(container, $('.chat-welcome-history-more'));
			previousChatsLink.textContent = localize('chat.history.showMore', 'Chat history...');
			previousChatsLink.setAttribute('role', 'button');
			previousChatsLink.setAttribute('tabindex', '0');
			previousChatsLink.setAttribute('aria-label', localize('chat.history.showMoreAriaLabel', 'Open chat history'));

			// Add hover tooltip for the link at the end of the list
			const hoverContent = localize('chat.history.showMoreHover', 'Show chat history...');
			this._register(this.hoverService.setupManagedHover(hoverDelegate, previousChatsLink, hoverContent));

			this._register(dom.addDisposableListener(previousChatsLink, dom.EventType.CLICK, (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.commandService.executeCommand('workbench.action.chat.history');
			}));
			this._register(dom.addDisposableListener(previousChatsLink, dom.EventType.KEY_DOWN, (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.commandService.executeCommand('workbench.action.chat.history');
				}
			}));
		} catch (err) {
			this.logService.error('Failed to render welcome history', err);
		}
	}

	private async computeHistoryItems(): Promise<IChatHistoryListItem[]> {
		try {
			const items = await this.chatService.getHistory();
			return items
				.filter(i => !i.isActive)
				.sort((a, b) => (b.lastMessageDate ?? 0) - (a.lastMessageDate ?? 0))
				.slice(0, 3)
				.map(item => ({
					sessionId: item.sessionId,
					title: item.title,
					lastMessageDate: typeof item.lastMessageDate === 'number' ? item.lastMessageDate : Date.now(),
					isActive: item.isActive
				}));
		} catch (err) {
			this.logService.error('Failed to compute chat history items', err);
			return [];
		}
	}

	private renderHistoryItems(historyItems: IChatHistoryListItem[]): void {
		if (!this.historyList) {
			return;
		}
		const listHeight = historyItems.length * 22;
		if (this.historyListContainer) {
			this.historyListContainer.style.height = `${listHeight}px`;
			this.historyListContainer.style.minHeight = `${listHeight}px`;
		}
		this.historyList.splice(0, this.historyList.length, historyItems);
		this.historyList.layout(undefined, listHeight);
	}

	private formatHistoryTimestamp(last: number, todayMidnightMs: number): string {
		if (last > todayMidnightMs) {
			const diffMs = Date.now() - last;
			const minMs = 60 * 1000;
			const adjusted = diffMs < minMs ? Date.now() - minMs : last;
			return fromNow(adjusted, true, true);
		}
		return fromNowByDay(last, true, true);
	}

	private async openHistorySession(sessionId: string): Promise<void> {
		try {
			const viewsService = this.instantiationService.invokeFunction(accessor => accessor.get(IViewsService));
			const chatView = await viewsService.openView<ChatViewPane>(ChatViewId);
			await chatView?.loadSession?.(sessionId);
		} catch (e) {
			this.logService.error('Failed to open chat session from history', e);
		}
	}

	private async refreshHistoryList(): Promise<void> {
		const numItems = this.viewModel?.getItems().length ?? 0;
		// Only refresh history list when in empty state (welcome view) and history list exists
		if (numItems !== 0 || !this.historyList) {
			return;
		}
		const historyItems = await this.computeHistoryItems();
		this.renderHistoryItems(historyItems);
	}

	private renderChatTodoListWidget(): void {
		const sessionId = this.viewModel?.sessionId;
		if (!sessionId) {
			this.chatTodoListWidget.render(sessionId);
			return;
		}

		const todoListConfig = this.configurationService.getValue<{ position?: string }>(ChatConfiguration.TodoList);
		const todoListWidgetPosition = todoListConfig?.position || 'default';

		// Handle 'off' - hide the widget and return
		if (todoListWidgetPosition === 'off') {
			this.chatTodoListWidget.domNode.style.display = 'none';
			this._onDidChangeContentHeight.fire();
			return;
		}

		// Handle 'chat-input' - hide the standalone widget to avoid duplication
		if (todoListWidgetPosition === 'chat-input') {
			this.chatTodoListWidget.domNode.style.display = 'none';
			this.inputPart.renderChatTodoListWidget(sessionId);
			this._onDidChangeContentHeight.fire();
			return;
		}

		// Handle 'default' - render the widget if there are todos
		const todos = this.chatTodoListService.getTodos(sessionId);
		if (todos.length > 0) {
			this.chatTodoListWidget.render(sessionId);
		}
	}

	private _getGenerateInstructionsMessage(): IMarkdownString {
		// Start checking for instruction files immediately if not already done
		if (!this._instructionFilesCheckPromise) {
			this._instructionFilesCheckPromise = this._checkForInstructionFiles();
			// Use VS Code's idiomatic pattern for disposal-safe promise callbacks
			this._register(thenIfNotDisposed(this._instructionFilesCheckPromise, hasFiles => {
				this._instructionFilesExist = hasFiles;
				// Only re-render if the current view still doesn't have items and we're showing the welcome message
				const hasViewModelItems = this.viewModel?.getItems().length ?? 0;
				if (hasViewModelItems === 0) {
					this.renderWelcomeViewContentIfNeeded();
				}
			}));
		}

		// If we already know the result, use it
		if (this._instructionFilesExist === true) {
			// Don't show generate instructions message if files exist
			return new MarkdownString('');
		} else if (this._instructionFilesExist === false) {
			// Show generate instructions message if no files exist
			const generateInstructionsCommand = 'workbench.action.chat.generateInstructions';
			return new MarkdownString(localize(
				'chatWidget.instructions',
				"[Generate Agent Instructions]({0}) to onboard AI onto your codebase.",
				`command:${generateInstructionsCommand}`
			), { isTrusted: { enabledCommands: [generateInstructionsCommand] } });
		}

		// While checking, don't show the generate instructions message
		return new MarkdownString('');
	}

	private async _checkForInstructionFiles(): Promise<boolean> {
		try {
			const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, undefined);
			return await computer.hasAgentInstructions(CancellationToken.None);
		} catch (error) {
			// On error, assume no instruction files exist to be safe
			this.logService.warn('[ChatWidget] Error checking for instruction files:', error);
			return false;
		}
	}

	private getWelcomeViewContent(additionalMessage: string | IMarkdownString | undefined, expEmptyState?: boolean): IChatViewWelcomeContent {
		const disclaimerMessage = expEmptyState
			? this.chatDisclaimer
			: localize('chatMessage', "Chat is powered by AI, so mistakes are possible. Review output carefully before use.");
		const icon = Codicon.chatSparkle;


		if (this.isLockedToCodingAgent) {
			// TODO(jospicer): Let extensions contribute this welcome message/docs
			const message = this._codingAgentPrefix === '@copilot '
				? new MarkdownString(localize('copilotCodingAgentMessage', "This chat session will be forwarded to the {0} [coding agent]({1}) where work is completed in the background. ", this._codingAgentPrefix, 'https://aka.ms/coding-agent-docs') + this.chatDisclaimer, { isTrusted: true })
				: new MarkdownString(localize('genericCodingAgentMessage', "This chat session will be forwarded to the {0} coding agent where work is completed in the background. ", this._codingAgentPrefix) + this.chatDisclaimer);

			return {
				title: localize('codingAgentTitle', "Delegate to {0}", this._codingAgentPrefix),
				message,
				icon: Codicon.sendToRemoteAgent,
				additionalMessage,
			};
		}

		const suggestedPrompts = this.getPromptFileSuggestions();

		if (this.input.currentModeKind === ChatModeKind.Ask) {
			return {
				title: localize('chatDescription', "Ask about your code"),
				message: new MarkdownString(disclaimerMessage),
				icon,
				additionalMessage,
				suggestedPrompts
			};
		} else if (this.input.currentModeKind === ChatModeKind.Edit) {
			const editsHelpMessage = localize('editsHelp', "Start your editing session by defining a set of files that you want to work with. Then ask for the changes you want to make.");
			const message = expEmptyState ? disclaimerMessage : `${editsHelpMessage}\n\n${disclaimerMessage}`;

			return {
				title: localize('editsTitle', "Edit in context"),
				message: new MarkdownString(message),
				icon,
				additionalMessage,
				suggestedPrompts
			};
		} else {
			const agentHelpMessage = localize('agentMessage', "Ask to edit your files in [agent mode]({0}). Agent mode will automatically use multiple requests to pick files to edit, run terminal commands, and iterate on errors.", 'https://aka.ms/vscode-copilot-agent');
			const message = expEmptyState ? disclaimerMessage : `${agentHelpMessage}\n\n${disclaimerMessage}`;

			return {
				title: localize('agentTitle', "Build with agent mode"),
				message: new MarkdownString(message),
				icon,
				additionalMessage,
				suggestedPrompts
			};
		}
	}

	private getNewWelcomeViewContent(): IChatViewWelcomeContent {
		let additionalMessage: string | IMarkdownString | undefined = undefined;
		if (this.chatEntitlementService.anonymous) {
			additionalMessage = new MarkdownString(localize({ key: 'settings', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "AI responses may be inaccurate.\nBy continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3}).", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl), { isTrusted: true });
		} else {
			additionalMessage = localize('expChatAdditionalMessage', "AI responses may be inaccurate.");
		}

		const welcomeContent: IChatViewWelcomeContent = {
			title: localize('expChatTitle', 'Build with agent mode'),
			message: new MarkdownString(localize('expchatMessage', "Let's get started")),
			icon: Codicon.chatSparkle,
			inputPart: this.inputPart.element,
			additionalMessage,
			isNew: true,
			suggestedPrompts: this.getNewSuggestedPrompts(),
		};
		return welcomeContent;
	}

	private getNewSuggestedPrompts(): IChatSuggestedPrompts[] {
		// Check if the workbench is empty
		const isEmpty = this.contextService.getWorkbenchState() === WorkbenchState.EMPTY;
		if (isEmpty) {
			return [
				{
					icon: Codicon.vscode,
					label: localize('chatWidget.suggestedPrompts.gettingStarted', "Ask @vscode"),
					prompt: localize('chatWidget.suggestedPrompts.gettingStartedPrompt', "@vscode How do I change the theme to light mode?"),
				},
				{
					icon: Codicon.newFolder,
					label: localize('chatWidget.suggestedPrompts.newProject', "Create Project"),
					prompt: localize('chatWidget.suggestedPrompts.newProjectPrompt', "Create a #new Hello World project in TypeScript"),
				}
			];
		} else {
			return [
				{
					icon: Codicon.debugAlt,
					label: localize('chatWidget.suggestedPrompts.buildWorkspace', "Build Workspace"),
					prompt: localize('chatWidget.suggestedPrompts.buildWorkspacePrompt', "How do I build this workspace?"),
				},
				{
					icon: Codicon.gear,
					label: localize('chatWidget.suggestedPrompts.findConfig', "Show Config"),
					prompt: localize('chatWidget.suggestedPrompts.findConfigPrompt', "Where is the configuration for this project defined?"),
				}
			];
		}
	}

	private getPromptFileSuggestions(): IChatSuggestedPrompts[] {
		// Get the current workspace folder context if available
		const activeEditor = this.editorService.activeEditor;
		const resource = activeEditor ? EditorResourceAccessor.getOriginalUri(activeEditor) : undefined;

		// Get the prompt file suggestions configuration
		const suggestions = PromptsConfig.getPromptFilesRecommendationsValue(this.configurationService, resource);
		if (!suggestions) {
			return [];
		}

		const result: IChatSuggestedPrompts[] = [];
		const promptsToLoad: string[] = [];

		// First, collect all prompts that need loading (regardless of shouldInclude)
		for (const [promptName] of Object.entries(suggestions)) {
			const description = this.promptDescriptionsCache.get(promptName);
			if (description === undefined) {
				promptsToLoad.push(promptName);
			}
		}

		// If we have prompts to load, load them asynchronously and don't return anything yet
		// But only if we're not already loading to prevent infinite loop
		if (promptsToLoad.length > 0 && !this._isLoadingPromptDescriptions) {
			this.loadPromptDescriptions(promptsToLoad);
			return [];
		}

		// Now process the suggestions with loaded descriptions
		const promptsWithScores: { promptName: string; condition: boolean | string; score: number }[] = [];

		for (const [promptName, condition] of Object.entries(suggestions)) {
			let score = 0;

			// Handle boolean conditions
			if (typeof condition === 'boolean') {
				score = condition ? 1 : 0;
			}
			// Handle when clause conditions
			else if (typeof condition === 'string') {
				try {
					const whenClause = ContextKeyExpr.deserialize(condition);
					if (whenClause) {
						// Test against all open code editors
						const allEditors = this.codeEditorService.listCodeEditors();

						if (allEditors.length > 0) {
							// Count how many editors match the when clause
							score = allEditors.reduce((count, editor) => {
								try {
									const editorContext = this.contextKeyService.getContext(editor.getDomNode());
									return count + (whenClause.evaluate(editorContext) ? 1 : 0);
								} catch (error) {
									// Log error for this specific editor but continue with others
									this.logService.warn('Failed to evaluate when clause for editor:', error);
									return count;
								}
							}, 0);
						} else {
							// Fallback to global context if no editors are open
							score = this.contextKeyService.contextMatchesRules(whenClause) ? 1 : 0;
						}
					} else {
						score = 0;
					}
				} catch (error) {
					// Log the error but don't fail completely
					this.logService.warn('Failed to parse when clause for prompt file suggestion:', condition, error);
					score = 0;
				}
			}

			if (score > 0) {
				promptsWithScores.push({ promptName, condition, score });
			}
		}

		// Sort by score (descending) and take top 5
		promptsWithScores.sort((a, b) => b.score - a.score);
		const topPrompts = promptsWithScores.slice(0, 5);

		// Build the final result array
		for (const { promptName } of topPrompts) {
			const description = this.promptDescriptionsCache.get(promptName);
			const commandLabel = localize('chatWidget.promptFile.commandLabel', "/{0}", promptName);
			const descriptionText = description?.trim() ? description : undefined;
			result.push({
				icon: Codicon.run,
				label: commandLabel,
				description: descriptionText,
				prompt: `/${promptName} `
			});
		}

		return result;
	}

	private async loadPromptDescriptions(promptNames: string[]): Promise<void> {
		// Don't start loading if the widget is being disposed
		if (this._store.isDisposed) {
			return;
		}

		// Set loading guard to prevent infinite loop
		this._isLoadingPromptDescriptions = true;
		try {
			// Get all available prompt files with their metadata
			const promptCommands = await this.promptsService.findPromptSlashCommands();

			let cacheUpdated = false;
			// Load descriptions only for the specified prompts
			for (const promptCommand of promptCommands) {
				if (promptNames.includes(promptCommand.command)) {
					try {
						if (promptCommand.promptPath) {
							const parseResult = await this.promptsService.parseNew(
								promptCommand.promptPath.uri,
								CancellationToken.None
							);
							const description = parseResult.header?.description;
							if (description) {
								this.promptDescriptionsCache.set(promptCommand.command, description);
								cacheUpdated = true;
							} else {
								// Set empty string to indicate we've checked this prompt
								this.promptDescriptionsCache.set(promptCommand.command, '');
								cacheUpdated = true;
							}
						}
					} catch (error) {
						// Log the error but continue with other prompts
						this.logService.warn('Failed to parse prompt file for description:', promptCommand.command, error);
						// Set empty string to indicate we've checked this prompt
						this.promptDescriptionsCache.set(promptCommand.command, '');
						cacheUpdated = true;
					}
				}
			}

			// Fire event to trigger a re-render of the welcome view only if cache was updated
			if (cacheUpdated) {
				this._welcomeRenderScheduler.schedule();
			}
		} catch (error) {
			this.logService.warn('Failed to load specific prompt descriptions:', error);
		} finally {
			// Always clear the loading guard, even on error
			this._isLoadingPromptDescriptions = false;
		}
	}

	private async renderChatEditingSessionState() {
		if (!this.input) {
			return;
		}
		this.input.renderChatEditingSessionState(this._editingSession.get() ?? null);

		if (this.bodyDimension) {
			this.layout(this.bodyDimension.height, this.bodyDimension.width);
		}
	}

	private async renderFollowups(): Promise<void> {
		if (this.lastItem && isResponseVM(this.lastItem) && this.lastItem.isComplete && this.input.currentModeKind === ChatModeKind.Ask) {
			this.input.renderFollowups(this.lastItem.replyFollowups, this.lastItem);
		} else {
			this.input.renderFollowups(undefined, undefined);
		}

		if (this.bodyDimension) {
			this.layout(this.bodyDimension.height, this.bodyDimension.width);
		}
	}

	setVisible(visible: boolean): void {
		const wasVisible = this._visible;
		this._visible = visible;
		this.visibleChangeCount++;
		this.renderer.setVisible(visible);
		this.input.setVisible(visible);

		if (visible) {
			this.timeoutDisposable.value = disposableTimeout(() => {
				// Progressive rendering paused while hidden, so start it up again.
				// Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
				if (this._visible) {
					this.onDidChangeItems(true);
				}
			}, 0);

			if (!wasVisible) {
				dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
					this._onDidShow.fire();
				});
			}
		} else if (wasVisible) {
			this._onDidHide.fire();
		}
	}

	private createList(listContainer: HTMLElement, options: IChatListItemRendererOptions): void {
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
		const delegate = scopedInstantiationService.createInstance(ChatListDelegate, this.viewOptions.defaultElementHeight ?? 200);
		const rendererDelegate: IChatRendererDelegate = {
			getListLength: () => this.tree.getNode(null).visibleChildrenCount,
			onDidScroll: this.onDidScroll,
			container: listContainer,
			currentChatMode: () => this.input.currentModeKind,
		};

		// Create a dom element to hold UI from editor widgets embedded in chat messages
		const overflowWidgetsContainer = document.createElement('div');
		overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
		listContainer.append(overflowWidgetsContainer);

		this.renderer = this._register(scopedInstantiationService.createInstance(
			ChatListItemRenderer,
			this.editorOptions,
			options,
			rendererDelegate,
			this._codeBlockModelCollection,
			overflowWidgetsContainer,
			this.viewModel,
		));

		this._register(this.renderer.onDidClickRequest(async item => {
			this.clickedRequest(item);
		}));

		this._register(this.renderer.onDidRerender(item => {
			if (isRequestVM(item.currentElement) && this.configurationService.getValue<string>('chat.editRequests') !== 'input') {
				if (!item.rowContainer.contains(this.inputContainer)) {
					item.rowContainer.appendChild(this.inputContainer);
				}
				this.input.focus();
			}
		}));

		this._register(this.renderer.onDidDispose((item) => {
			this.focusedInputDOM.appendChild(this.inputContainer);
			this.input.focus();
		}));

		this._register(this.renderer.onDidFocusOutside(() => {
			this.finishedEditing();
		}));

		this._register(this.renderer.onDidClickFollowup(item => {
			// is this used anymore?
			this.acceptInput(item.message);
		}));
		this._register(this.renderer.onDidClickRerunWithAgentOrCommandDetection(item => {
			const request = this.chatService.getSession(item.sessionId)?.getRequests().find(candidate => candidate.id === item.requestId);
			if (request) {
				const options: IChatSendRequestOptions = {
					noCommandDetection: true,
					attempt: request.attempt + 1,
					location: this.location,
					userSelectedModelId: this.input.currentLanguageModel,
					modeInfo: this.input.currentModeInfo,
				};
				this.chatService.resendRequest(request, options).catch(e => this.logService.error('FAILED to rerun request', e));
			}
		}));

		this.tree = this._register(scopedInstantiationService.createInstance(
			WorkbenchObjectTree<ChatTreeItem, FuzzyScore>,
			'Chat',
			listContainer,
			delegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: ChatTreeItem) => e.id },
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				supportDynamicHeights: true,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: ChatTreeItem) => isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : '' }, // TODO
				setRowLineHeight: false,
				filter: this.viewOptions.filter ? { filter: this.viewOptions.filter.bind(this.viewOptions), } : undefined,
				scrollToActiveElement: true,
				overrideStyles: {
					listFocusBackground: this.styles.listBackground,
					listInactiveFocusBackground: this.styles.listBackground,
					listActiveSelectionBackground: this.styles.listBackground,
					listFocusAndSelectionBackground: this.styles.listBackground,
					listInactiveSelectionBackground: this.styles.listBackground,
					listHoverBackground: this.styles.listBackground,
					listBackground: this.styles.listBackground,
					listFocusForeground: this.styles.listForeground,
					listHoverForeground: this.styles.listForeground,
					listInactiveFocusForeground: this.styles.listForeground,
					listInactiveSelectionForeground: this.styles.listForeground,
					listActiveSelectionForeground: this.styles.listForeground,
					listFocusAndSelectionForeground: this.styles.listForeground,
					listActiveSelectionIconForeground: undefined,
					listInactiveSelectionIconForeground: undefined,
				}
			}));

		this._register(this.tree.onDidChangeFocus(() => {
			const focused = this.tree.getFocus();
			if (focused && focused.length > 0) {
				const focusedItem = focused[0];
				const items = this.tree.getNode(null).children;
				const idx = items.findIndex(i => i.element === focusedItem);
				if (idx !== -1) {
					this._mostRecentlyFocusedItemIndex = idx;
				}
			}
		}));
		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(this.tree.onDidChangeContentHeight(() => {
			this.onDidChangeTreeContentHeight();
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			if (this.tree.hasElement(e.element)) {
				this.tree.updateElementHeight(e.element, e.height);
			}
		}));
		this._register(this.tree.onDidFocus(() => {
			this._onDidFocus.fire();
		}));
		this._register(this.tree.onDidScroll(() => {
			this._onDidScroll.fire();

			const isScrolledDown = this.tree.scrollTop >= this.tree.scrollHeight - this.tree.renderHeight - 2;
			this.container.classList.toggle('show-scroll-down', !isScrolledDown && !this.scrollLock);
		}));
	}

	startEditing(requestId: string): void {
		const editedRequest = this.renderer.getTemplateDataForRequestId(requestId);
		if (editedRequest) {
			this.clickedRequest(editedRequest);
		}
	}

	private clickedRequest(item: IChatListItemTemplate) {

		// cancel current request before we start editing.
		if (this.viewModel) {
			this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionId);
		}

		const currentElement = item.currentElement;
		if (isRequestVM(currentElement) && !this.viewModel?.editing) {

			const requests = this.viewModel?.model.getRequests();
			if (!requests) {
				return;
			}

			// this will only ever be true if we restored a checkpoint
			if (this.viewModel?.model.checkpoint) {
				this.recentlyRestoredCheckpoint = true;
			}

			this.viewModel?.model.setCheckpoint(currentElement.id);

			// set contexts and request to false
			const currentContext: IChatRequestVariableEntry[] = [];
			for (let i = requests.length - 1; i >= 0; i -= 1) {
				const request = requests[i];
				if (request.id === currentElement.id) {
					request.shouldBeBlocked = false; // unblocking just this request.
					if (request.attachedContext) {
						const context = request.attachedContext.filter(entry => !(isPromptFileVariableEntry(entry) || isPromptTextVariableEntry(entry)) || !entry.automaticallyAdded);
						currentContext.push(...context);
					}
				}
			}

			// set states
			this.viewModel?.setEditing(currentElement);
			if (item?.contextKeyService) {
				ChatContextKeys.currentlyEditing.bindTo(item.contextKeyService).set(true);
			}

			const isInput = this.configurationService.getValue<string>('chat.editRequests') === 'input';
			this.inputPart?.setEditing(!!this.viewModel?.editing && isInput);

			if (!isInput) {
				const rowContainer = item.rowContainer;
				this.inputContainer = dom.$('.chat-edit-input-container');
				rowContainer.appendChild(this.inputContainer);
				this.createInput(this.inputContainer);
				this.input.setChatMode(this.inputPart.currentModeKind);
			} else {
				this.inputPart.element.classList.add('editing');
			}

			this.inputPart.toggleChatInputOverlay(!isInput);
			if (currentContext.length > 0) {
				this.input.attachmentModel.addContext(...currentContext);
			}


			// rerenders
			this.inputPart.dnd.setDisabledOverlay(!isInput);
			this.input.renderAttachedContext();
			this.input.setValue(currentElement.messageText, false);
			this.renderer.updateItemHeightOnRender(currentElement, item);
			this.onDidChangeItems();
			this.input.inputEditor.focus();

			this._register(this.inputPart.onDidClickOverlay(() => {
				if (this.viewModel?.editing && this.configurationService.getValue<string>('chat.editRequests') !== 'input') {
					this.finishedEditing();
				}
			}));

			// listeners
			if (!isInput) {
				this._register(this.inlineInputPart.inputEditor.onDidChangeModelContent(() => {
					this.scrollToCurrentItem(currentElement);
				}));

				this._register(this.inlineInputPart.inputEditor.onDidChangeCursorSelection((e) => {
					this.scrollToCurrentItem(currentElement);
				}));
			}
		}

		type StartRequestEvent = { editRequestType: string };

		type StartRequestEventClassification = {
			owner: 'justschen';
			comment: 'Event used to gain insights into when edits are being pressed.';
			editRequestType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Current entry point for editing a request.' };
		};

		this.telemetryService.publicLog2<StartRequestEvent, StartRequestEventClassification>('chat.startEditingRequests', {
			editRequestType: this.configurationService.getValue<string>('chat.editRequests'),
		});
	}

	finishedEditing(completedEdit?: boolean): void {
		// reset states
		const editedRequest = this.renderer.getTemplateDataForRequestId(this.viewModel?.editing?.id);
		if (this.recentlyRestoredCheckpoint) {
			this.recentlyRestoredCheckpoint = false;
		} else {
			this.viewModel?.model.setCheckpoint(undefined);
		}
		this.inputPart.dnd.setDisabledOverlay(false);
		if (editedRequest?.contextKeyService) {
			ChatContextKeys.currentlyEditing.bindTo(editedRequest.contextKeyService).set(false);
		}

		const isInput = this.configurationService.getValue<string>('chat.editRequests') === 'input';

		if (!isInput) {
			this.inputPart.setChatMode(this.input.currentModeKind);
			const currentModel = this.input.selectedLanguageModel;
			if (currentModel) {
				this.inputPart.switchModel(currentModel.metadata);
			}

			this.inputPart?.toggleChatInputOverlay(false);
			try {
				if (editedRequest?.rowContainer && editedRequest.rowContainer.contains(this.inputContainer)) {
					editedRequest.rowContainer.removeChild(this.inputContainer);
				} else if (this.inputContainer.parentElement) {
					this.inputContainer.parentElement.removeChild(this.inputContainer);
				}
			} catch (e) {
				this.logService.error('Error occurred while finishing editing:', e);
			}
			this.inputContainer = dom.$('.empty-chat-state');

			// only dispose if we know the input is not the bottom input object.
			this.input.dispose();
		}

		if (isInput) {
			this.inputPart.element.classList.remove('editing');
		}
		this.viewModel?.setEditing(undefined);

		this.inputPart?.setEditing(!!this.viewModel?.editing && isInput);

		this.onDidChangeItems();
		if (editedRequest && editedRequest.currentElement) {
			this.renderer.updateItemHeightOnRender(editedRequest.currentElement, editedRequest);
		}

		type CancelRequestEditEvent = {
			editRequestType: string;
			editCanceled: boolean;
		};

		type CancelRequestEventEditClassification = {
			owner: 'justschen';
			editRequestType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Current entry point for editing a request.' };
			editCanceled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates whether the edit was canceled.' };
			comment: 'Event used to gain insights into when edits are being canceled.';
		};

		this.telemetryService.publicLog2<CancelRequestEditEvent, CancelRequestEventEditClassification>('chat.editRequestsFinished', {
			editRequestType: this.configurationService.getValue<string>('chat.editRequests'),
			editCanceled: !completedEdit
		});

		this.inputPart.focus();
	}

	private scrollToCurrentItem(currentElement: IChatRequestViewModel): void {
		if (this.viewModel?.editing && currentElement) {
			const element = currentElement;
			if (!this.tree.hasElement(element)) {
				return;
			}
			const relativeTop = this.tree.getRelativeTop(element);
			if (relativeTop === null || relativeTop < 0 || relativeTop > 1) {
				this.tree.reveal(element, 0);
			}
		}
	}

	private onContextMenu(e: ITreeContextMenuEvent<ChatTreeItem | null>): void {
		e.browserEvent.preventDefault();
		e.browserEvent.stopPropagation();

		const selected = e.element;
		const scopedContextKeyService = this.contextKeyService.createOverlay([
			[ChatContextKeys.responseIsFiltered.key, isResponseVM(selected) && !!selected.errorDetails?.responseIsFiltered]
		]);
		this.contextMenuService.showContextMenu({
			menuId: MenuId.ChatContext,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: scopedContextKeyService,
			getAnchor: () => e.anchor,
			getActionsContext: () => selected,
		});
	}

	private onDidChangeTreeContentHeight(): void {
		// If the list was previously scrolled all the way down, ensure it stays scrolled down, if scroll lock is on
		if (this.tree.scrollHeight !== this.previousTreeScrollHeight) {
			const lastItem = this.viewModel?.getItems().at(-1);
			const lastResponseIsRendering = isResponseVM(lastItem) && lastItem.renderData;
			if (!lastResponseIsRendering || this.scrollLock) {
				// Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
				// Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
				const lastElementWasVisible = this.tree.scrollTop + this.tree.renderHeight >= this.previousTreeScrollHeight - 2;
				if (lastElementWasVisible) {
					dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
						// Can't set scrollTop during this event listener, the list might overwrite the change

						this.scrollToEnd();
					}, 0);
				}
			}
		}

		// TODO@roblourens add `show-scroll-down` class when button should show
		// Show the button when content height changes, the list is not fully scrolled down, and (the latest response is currently rendering OR I haven't yet scrolled all the way down since the last response)
		// So for example it would not reappear if I scroll up and delete a message

		this.previousTreeScrollHeight = this.tree.scrollHeight;
		this._onDidChangeContentHeight.fire();
	}

	private getWidgetViewKindTag(): string {
		if (!this.viewContext) {
			return 'editor';
		} else if ('viewId' in this.viewContext) {
			return 'view';
		} else {
			return 'quick';
		}
	}

	private createInput(container: HTMLElement, options?: { renderFollowups: boolean; renderStyle?: 'compact' | 'minimal' }): void {
		const commonConfig = {
			renderFollowups: options?.renderFollowups ?? true,
			renderStyle: options?.renderStyle === 'minimal' ? 'compact' : options?.renderStyle,
			menus: {
				executeToolbar: MenuId.ChatExecute,
				telemetrySource: 'chatWidget',
				...this.viewOptions.menus
			},
			editorOverflowWidgetsDomNode: this.viewOptions.editorOverflowWidgetsDomNode,
			enableImplicitContext: this.viewOptions.enableImplicitContext,
			renderWorkingSet: this.viewOptions.enableWorkingSet === 'explicit',
			supportsChangingModes: this.viewOptions.supportsChangingModes,
			dndContainer: this.viewOptions.dndContainer,
			widgetViewKindTag: this.getWidgetViewKindTag(),
		};

		if (this.viewModel?.editing) {
			const editedRequest = this.renderer.getTemplateDataForRequestId(this.viewModel?.editing?.id);
			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editedRequest?.contextKeyService])));
			this.inlineInputPartDisposable.value = scopedInstantiationService.createInstance(ChatInputPart,
				this.location,
				commonConfig,
				this.styles,
				() => this.collectInputState(),
				true
			);
		} else {
			this.inputPartDisposable.value = this.instantiationService.createInstance(ChatInputPart,
				this.location,
				commonConfig,
				this.styles,
				() => this.collectInputState(),
				false
			);
		}

		this.input.render(container, '', this);

		this._register(this.input.onDidLoadInputState(state => {
			this.contribs.forEach(c => {
				if (c.setInputState) {
					const contribState = (typeof state === 'object' && state?.[c.id]) ?? {};
					c.setInputState(contribState);
				}
			});
			this.refreshParsedInput();
		}));
		this._register(this.input.onDidFocus(() => this._onDidFocus.fire()));
		this._register(this.input.onDidAcceptFollowup(e => {
			if (!this.viewModel) {
				return;
			}

			let msg = '';
			if (e.followup.agentId && e.followup.agentId !== this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind)?.id) {
				const agent = this.chatAgentService.getAgent(e.followup.agentId);
				if (!agent) {
					return;
				}

				this.lastSelectedAgent = agent;
				msg = `${chatAgentLeader}${agent.name} `;
				if (e.followup.subCommand) {
					msg += `${chatSubcommandLeader}${e.followup.subCommand} `;
				}
			} else if (!e.followup.agentId && e.followup.subCommand && this.chatSlashCommandService.hasCommand(e.followup.subCommand)) {
				msg = `${chatSubcommandLeader}${e.followup.subCommand} `;
			}

			msg += e.followup.message;
			this.acceptInput(msg);

			if (!e.response) {
				// Followups can be shown by the welcome message, then there is no response associated.
				// At some point we probably want telemetry for these too.
				return;
			}

			this.chatService.notifyUserAction({
				sessionId: this.viewModel.sessionId,
				requestId: e.response.requestId,
				agentId: e.response.agent?.id,
				command: e.response.slashCommand?.name,
				result: e.response.result,
				action: {
					kind: 'followUp',
					followup: e.followup
				},
			});
		}));
		this._register(this.input.onDidChangeHeight(() => {
			const editedRequest = this.renderer.getTemplateDataForRequestId(this.viewModel?.editing?.id);
			if (isRequestVM(editedRequest?.currentElement) && this.viewModel?.editing) {
				this.renderer.updateItemHeightOnRender(editedRequest?.currentElement, editedRequest);
			}

			if (this.bodyDimension) {
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}

			this._onDidChangeContentHeight.fire();
		}));
		this._register(this.input.attachmentModel.onDidChange(() => {
			if (this._editingSession) {
				// TODO still needed? Do this inside input part and fire onDidChangeHeight?
				this.renderChatEditingSessionState();
			}
		}));
		this._register(this.inputEditor.onDidChangeModelContent(() => {
			this.parsedChatRequest = undefined;
			this.updateChatInputContext();
		}));
		this._register(this.chatAgentService.onDidChangeAgents(() => {
			this.parsedChatRequest = undefined;
			// Tools agent loads -> welcome content changes
			this._welcomeRenderScheduler.schedule();
		}));
		this._register(this.input.onDidChangeCurrentChatMode(() => {
			this.lastWelcomeViewChatMode = this.input.currentModeKind;
			this._welcomeRenderScheduler.schedule();
			this.refreshParsedInput();
			this.renderFollowups();
		}));

		this._register(autorun(r => {
			const toolSetIds = new Set<string>();
			const toolIds = new Set<string>();
			for (const [entry, enabled] of this.input.selectedToolsModel.entriesMap.read(r)) {
				if (enabled) {
					if (entry instanceof ToolSet) {
						toolSetIds.add(entry.id);
					} else {
						toolIds.add(entry.id);
					}
				}
			}
			const disabledTools = this.input.attachmentModel.attachments
				.filter(a => a.kind === 'tool' && !toolIds.has(a.id) || a.kind === 'toolset' && !toolSetIds.has(a.id))
				.map(a => a.id);

			this.input.attachmentModel.updateContext(disabledTools, Iterable.empty());
			this.refreshParsedInput();
		}));
	}

	private onDidStyleChange(): void {
		this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
		this.container.style.setProperty('--vscode-interactive-session-foreground', this.editorOptions.configuration.foreground?.toString() ?? '');
		this.container.style.setProperty('--vscode-chat-list-background', this.themeService.getColorTheme().getColor(this.styles.listBackground)?.toString() ?? '');
	}


	setModel(model: IChatModel, viewState: IChatViewState): void {
		if (!this.container) {
			throw new Error('Call render() before setModel()');
		}

		if (model.sessionId === this.viewModel?.sessionId) {
			return;
		}

		if (this.historyList) {
			this.historyList.setFocus([]);
			this.historyList.setSelection([]);
		}

		// Clear history view state when switching sessions to ensure fresh rendering
		this.historyViewStore.clear();

		this._codeBlockModelCollection.clear();

		this.container.setAttribute('data-session-id', model.sessionId);
		this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, this._codeBlockModelCollection);

		if (this._lockedToCodingAgent) {
			const placeholder = localize('chat.input.placeholder.lockedToAgent', "Chat with {0}", this._lockedToCodingAgent);
			this.viewModel.setInputPlaceholder(placeholder);
			this.inputEditor.updateOptions({ placeholder });
		} else if (this.viewModel.inputPlaceholder) {
			this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
		}

		const renderImmediately = this.configurationService.getValue<boolean>('chat.experimental.renderMarkdownImmediately');
		const delay = renderImmediately ? MicrotaskDelay : 0;
		this.viewModelDisposables.add(Event.runAndSubscribe(Event.accumulate(this.viewModel.onDidChange, delay), (events => {
			if (!this.viewModel) {
				return;
			}

			this.requestInProgress.set(this.viewModel.requestInProgress);

			// Update the editor's placeholder text when it changes in the view model
			if (events?.some(e => e?.kind === 'changePlaceholder')) {
				this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
			}

			this.onDidChangeItems();
			if (events?.some(e => e?.kind === 'addRequest') && this.visible) {
				this.scrollToEnd();
			}

			if (this._editingSession) {
				this.renderChatEditingSessionState();
			}
		})));
		this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
			// Ensure that view state is saved here, because we will load it again when a new model is assigned
			this.input.saveState();
			if (this.viewModel?.editing) {
				this.finishedEditing();
			}
			// Disposes the viewmodel and listeners
			this.viewModel = undefined;
			this.onDidChangeItems();
		}));
		this.input.initForNewChatModel(viewState, model.getRequests().length === 0);
		this.contribs.forEach(c => {
			if (c.setInputState && viewState.inputState?.[c.id]) {
				c.setInputState(viewState.inputState?.[c.id]);
			}
		});

		this.refreshParsedInput();
		this.viewModelDisposables.add(model.onDidChange((e) => {
			if (e.kind === 'setAgent') {
				this._onDidChangeAgent.fire({ agent: e.agent, slashCommand: e.command });
			}
			if (e.kind === 'addRequest' || e.kind === 'removeRequest') {
				this.chatTodoListWidget.clear(model.sessionId, e.kind === 'removeRequest' /*force*/);
			}
		}));

		if (this.tree && this.visible) {
			this.onDidChangeItems();
			this.scrollToEnd();
		}

		this.renderer.updateViewModel(this.viewModel);
		this.updateChatInputContext();
	}

	getFocus(): ChatTreeItem | undefined {
		return this.tree.getFocus()[0] ?? undefined;
	}

	reveal(item: ChatTreeItem, relativeTop?: number): void {
		this.tree.reveal(item, relativeTop);
	}

	focus(item: ChatTreeItem): void {
		const items = this.tree.getNode(null).children;
		const node = items.find(i => i.element?.id === item.id);
		if (!node) {
			return;
		}

		this._mostRecentlyFocusedItemIndex = items.indexOf(node);
		this.tree.setFocus([node.element]);
		this.tree.domFocus();
	}

	refilter() {
		this.tree.refilter();
	}

	setInputPlaceholder(placeholder: string): void {
		this.viewModel?.setInputPlaceholder(placeholder);
	}

	resetInputPlaceholder(): void {
		this.viewModel?.resetInputPlaceholder();
	}

	setInput(value = ''): void {
		this.input.setValue(value, false);
		this.refreshParsedInput();
	}

	getInput(): string {
		return this.input.inputEditor.getValue();
	}

	// Coding agent locking methods
	public lockToCodingAgent(name: string, displayName: string, agentId: string): void {
		this._lockedToCodingAgent = displayName;
		this._codingAgentPrefix = `@${name} `;
		this._lockedAgentId = agentId;
		this._lockedToCodingAgentContextKey.set(true);
		this._welcomeRenderScheduler.schedule();
		this.renderer.updateOptions({ restorable: false, editable: false, noFooter: true, progressMessageAtBottomOfResponse: true });
		this.tree.rerender();
	}

	public unlockFromCodingAgent(): void {
		// Clear all state related to locking
		this._lockedToCodingAgent = undefined;
		this._codingAgentPrefix = undefined;
		this._lockedAgentId = undefined;
		this._lockedToCodingAgentContextKey.set(false);

		// Explicitly update the DOM to reflect unlocked state
		this._welcomeRenderScheduler.schedule();

		// Reset to default placeholder
		if (this.viewModel) {
			this.viewModel.resetInputPlaceholder();
		}
		this.inputEditor.updateOptions({ placeholder: undefined });
		this.renderer.updateOptions({ restorable: true, editable: true, noFooter: false, progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask });
		this.tree.rerender();
	}

	public get isLockedToCodingAgent(): boolean {
		return !!this._lockedToCodingAgent;
	}

	public get lockedAgentId(): string | undefined {
		return this._lockedAgentId;
	}

	logInputHistory(): void {
		this.input.logInputHistory();
	}

	async acceptInput(query?: string, options?: IChatAcceptInputOptions): Promise<IChatResponseModel | undefined> {
		return this._acceptInput(query ? { query } : undefined, options);
	}

	async rerunLastRequest(): Promise<void> {
		if (!this.viewModel) {
			return;
		}

		const sessionId = this.viewModel.sessionId;
		const lastRequest = this.chatService.getSession(sessionId)?.getRequests().at(-1);
		if (!lastRequest) {
			return;
		}

		const options: IChatSendRequestOptions = {
			attempt: lastRequest.attempt + 1,
			location: this.location,
			userSelectedModelId: this.input.currentLanguageModel
		};
		return await this.chatService.resendRequest(lastRequest, options);
	}

	private collectInputState(): IChatInputState {
		const inputState: IChatInputState = {};
		this.contribs.forEach(c => {
			if (c.getInputState) {
				inputState[c.id] = c.getInputState();
			}
		});

		return inputState;
	}

	private _findPromptFileInContext(attachedContext: ChatRequestVariableSet): URI | undefined {
		for (const item of attachedContext.asArray()) {
			if (isPromptFileVariableEntry(item) && item.isRoot && this.promptsService.getPromptFileType(item.value) === PromptsType.prompt) {
				return item.value;
			}
		}
		return undefined;
	}

	private async _applyPromptFileIfSet(requestInput: IChatRequestInputOptions): Promise<void> {
		if (!PromptsConfig.enabled(this.configurationService)) {
			// if prompts are not enabled, we don't need to do anything
			return undefined;
		}

		let parseResult: ParsedPromptFile | undefined;

		// first check if the input has a prompt slash command
		const agentSlashPromptPart = this.parsedInput.parts.find((r): r is ChatRequestSlashPromptPart => r instanceof ChatRequestSlashPromptPart);
		if (agentSlashPromptPart) {
			parseResult = await this.promptsService.resolvePromptSlashCommand(agentSlashPromptPart.slashPromptCommand, CancellationToken.None);
			if (parseResult) {
				// add the prompt file to the context
				const refs = parseResult.body?.variableReferences.map(({ name, offset }) => ({ name, range: new OffsetRange(offset, offset + name.length + 1) })) ?? [];
				const toolReferences = this.toolsService.toToolReferences(refs);
				requestInput.attachedContext.insertFirst(toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, undefined, true, toolReferences));

				// remove the slash command from the input
				requestInput.input = this.parsedInput.parts.filter(part => !(part instanceof ChatRequestSlashPromptPart)).map(part => part.text).join('').trim();
			}
		} else {
			// if not, check if the context contains a prompt file: This is the old workflow that we still support for legacy reasons
			const uri = this._findPromptFileInContext(requestInput.attachedContext);
			if (uri) {
				try {
					parseResult = await this.promptsService.parseNew(uri, CancellationToken.None);
				} catch (error) {
					this.logService.error(`[_applyPromptFileIfSet] Failed to parse prompt file: ${uri}`, error);
				}
			}
		}

		if (!parseResult) {
			return undefined;
		}

		const input = requestInput.input.trim();
		requestInput.input = `Follow instructions in [${basename(parseResult.uri)}](${parseResult.uri.toString()}).`;
		if (input) {
			// if the input is not empty, append it to the prompt
			requestInput.input += `\n${input}`;
		}
		if (parseResult.header) {
			await this._applyPromptMetadata(parseResult.header, requestInput);
		}
	}

	private async _acceptInput(query: { query: string } | undefined, options?: IChatAcceptInputOptions): Promise<IChatResponseModel | undefined> {
		if (this.viewModel?.requestInProgress) {
			return;
		}

		if (!query && this.input.generating) {
			// if the user submits the input and generation finishes quickly, just submit it for them
			const generatingAutoSubmitWindow = 500;
			const start = Date.now();
			await this.input.generating;
			if (Date.now() - start > generatingAutoSubmitWindow) {
				return;
			}
		}

		if (this.viewModel) {
			this._onDidAcceptInput.fire();
			this.scrollLock = this.isLockedToCodingAgent || !!checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll);

			const editorValue = this.getInput();
			const requestId = this.chatAccessibilityService.acceptRequest();
			const requestInputs: IChatRequestInputOptions = {
				input: !query ? editorValue : query.query,
				attachedContext: options?.enableImplicitContext === false ? this.input.getAttachedContext(this.viewModel.sessionId) : this.input.getAttachedAndImplicitContext(this.viewModel.sessionId),
			};

			const isUserQuery = !query;

			if (!this.viewModel.editing) {
				// process the prompt command
				await this._applyPromptFileIfSet(requestInputs);
				await this._autoAttachInstructions(requestInputs);
			}

			if (this.viewOptions.enableWorkingSet !== undefined && this.input.currentModeKind === ChatModeKind.Edit && !this.chatService.edits2Enabled) {
				const uniqueWorkingSetEntries = new ResourceSet(); // NOTE: this is used for bookkeeping so the UI can avoid rendering references in the UI that are already shown in the working set
				const editingSessionAttachedContext: ChatRequestVariableSet = requestInputs.attachedContext;

				// Collect file variables from previous requests before sending the request
				const previousRequests = this.viewModel.model.getRequests();
				for (const request of previousRequests) {
					for (const variable of request.variableData.variables) {
						if (URI.isUri(variable.value) && variable.kind === 'file') {
							const uri = variable.value;
							if (!uniqueWorkingSetEntries.has(uri)) {
								editingSessionAttachedContext.add(variable);
								uniqueWorkingSetEntries.add(variable.value);
							}
						}
					}
				}
				requestInputs.attachedContext = editingSessionAttachedContext;

				type ChatEditingWorkingSetClassification = {
					owner: 'joyceerhl';
					comment: 'Information about the working set size in a chat editing request';
					originalSize: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of files that the user tried to attach in their editing request.' };
					actualSize: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of files that were actually sent in their editing request.' };
				};
				type ChatEditingWorkingSetEvent = {
					originalSize: number;
					actualSize: number;
				};
				this.telemetryService.publicLog2<ChatEditingWorkingSetEvent, ChatEditingWorkingSetClassification>('chatEditing/workingSetSize', { originalSize: uniqueWorkingSetEntries.size, actualSize: uniqueWorkingSetEntries.size });
			}

			this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionId);
			if (this.currentRequest) {
				// We have to wait the current request to be properly cancelled so that it has a chance to update the model with its result metadata.
				// This is awkward, it's basically a limitation of the chat provider-based agent.
				await Promise.race([this.currentRequest, timeout(1000)]);
			}

			this.input.validateAgentMode();

			if (this.viewModel.model.checkpoint) {
				const requests = this.viewModel.model.getRequests();
				for (let i = requests.length - 1; i >= 0; i -= 1) {
					const request = requests[i];
					if (request.shouldBeBlocked) {
						this.chatService.removeRequest(this.viewModel.sessionId, request.id);
					}
				}
			}

			const result = await this.chatService.sendRequest(this.viewModel.sessionId, requestInputs.input, {
				userSelectedModelId: this.input.currentLanguageModel,
				location: this.location,
				locationData: this._location.resolveData?.(),
				parserContext: { selectedAgent: this._lastSelectedAgent, mode: this.input.currentModeKind },
				attachedContext: requestInputs.attachedContext.asArray(),
				noCommandDetection: options?.noCommandDetection,
				...this.getModeRequestOptions(),
				modeInfo: this.input.currentModeInfo,
				agentIdSilent: this._lockedAgentId
			});

			if (result) {
				this.input.acceptInput(isUserQuery);
				this._onDidSubmitAgent.fire({ agent: result.agent, slashCommand: result.slashCommand });
				this.currentRequest = result.responseCompletePromise.then(() => {
					const responses = this.viewModel?.getItems().filter(isResponseVM);
					const lastResponse = responses?.[responses.length - 1];
					this.chatAccessibilityService.acceptResponse(this, this.container, lastResponse, requestId, options?.isVoiceInput);
					if (lastResponse?.result?.nextQuestion) {
						const { prompt, participant, command } = lastResponse.result.nextQuestion;
						const question = formatChatQuestion(this.chatAgentService, this.location, prompt, participant, command);
						if (question) {
							this.input.setValue(question, false);
						}
					}

					this.currentRequest = undefined;
				});

				if (this.viewModel?.editing) {
					this.finishedEditing(true);
					this.viewModel.model?.setCheckpoint(undefined);
				}
				return result.responseCreatedPromise;
			}
		}
		return undefined;
	}

	getModeRequestOptions(): Partial<IChatSendRequestOptions> {
		return {
			modeInfo: this.input.currentModeInfo,
			userSelectedTools: this.input.selectedToolsModel.userSelectedTools,
		};
	}

	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		return this.renderer.getCodeBlockInfosForResponse(response);
	}

	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this.renderer.getCodeBlockInfoForEditor(uri);
	}

	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[] {
		return this.renderer.getFileTreeInfosForResponse(response);
	}

	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined {
		return this.renderer.getLastFocusedFileTreeForResponse(response);
	}

	focusResponseItem(lastFocused?: boolean): void {
		if (!this.viewModel) {
			return;
		}
		const items = this.tree.getNode(null).children;
		let item;
		if (lastFocused) {
			item = items[this._mostRecentlyFocusedItemIndex] ?? items[items.length - 1];
		} else {
			item = items[items.length - 1];
		}
		if (!item) {
			return;
		}

		this.tree.setFocus([item.element]);
		this.tree.domFocus();
	}

	layout(height: number, width: number): void {
		width = Math.min(width, 950);
		this.bodyDimension = new dom.Dimension(width, height);

		const layoutHeight = this._dynamicMessageLayoutData?.enabled ? this._dynamicMessageLayoutData.maxHeight : height;
		if (this.viewModel?.editing) {
			this.inlineInputPart?.layout(layoutHeight, width);
		}

		if (this.container.classList.contains('new-welcome-view')) {
			this.inputPart.layout(layoutHeight, Math.min(width, 650));
		}
		else {
			this.inputPart.layout(layoutHeight, width);
		}

		const inputHeight = this.inputPart.inputPartHeight;
		const chatTodoListWidgetHeight = this.chatTodoListWidget.height;
		const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight - 2;

		const contentHeight = Math.max(0, height - inputHeight - chatTodoListWidgetHeight);
		if (this.viewOptions.renderStyle === 'compact' || this.viewOptions.renderStyle === 'minimal') {
			this.listContainer.style.removeProperty('--chat-current-response-min-height');
		} else {
			this.listContainer.style.setProperty('--chat-current-response-min-height', contentHeight * .75 + 'px');
		}
		this.tree.layout(contentHeight, width);
		this.tree.getHTMLElement().style.height = `${contentHeight}px`;

		// Push the welcome message down so it doesn't change position
		// when followups, attachments or working set appear
		let welcomeOffset = 100;
		if (this.viewOptions.renderFollowups) {
			welcomeOffset = Math.max(welcomeOffset - this.input.followupsHeight, 0);
		}
		if (this.viewOptions.enableWorkingSet) {
			welcomeOffset = Math.max(welcomeOffset - this.input.editSessionWidgetHeight, 0);
		}
		welcomeOffset = Math.max(welcomeOffset - this.input.attachmentsHeight, 0);
		this.welcomeMessageContainer.style.height = `${contentHeight - welcomeOffset}px`;
		this.welcomeMessageContainer.style.paddingBottom = `${welcomeOffset}px`;

		this.renderer.layout(width);

		const lastItem = this.viewModel?.getItems().at(-1);
		const lastResponseIsRendering = isResponseVM(lastItem) && lastItem.renderData;
		if (lastElementVisible && (!lastResponseIsRendering || checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll))) {
			this.scrollToEnd();
		}
		this.listContainer.style.height = `${contentHeight}px`;

		this._onDidChangeHeight.fire(height);
	}

	private _dynamicMessageLayoutData?: { numOfMessages: number; maxHeight: number; enabled: boolean };

	// An alternative to layout, this allows you to specify the number of ChatTreeItems
	// you want to show, and the max height of the container. It will then layout the
	// tree to show that many items.
	// TODO@TylerLeonhardt: This could use some refactoring to make it clear which layout strategy is being used
	setDynamicChatTreeItemLayout(numOfChatTreeItems: number, maxHeight: number) {
		this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
		this._register(this.renderer.onDidChangeItemHeight(() => this.layoutDynamicChatTreeItemMode()));

		const mutableDisposable = this._register(new MutableDisposable());
		this._register(this.tree.onDidScroll((e) => {
			// TODO@TylerLeonhardt this should probably just be disposed when this is disabled
			// and then set up again when it is enabled again
			if (!this._dynamicMessageLayoutData?.enabled) {
				return;
			}
			mutableDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
				if (!e.scrollTopChanged || e.heightChanged || e.scrollHeightChanged) {
					return;
				}
				const renderHeight = e.height;
				const diff = e.scrollHeight - renderHeight - e.scrollTop;
				if (diff === 0) {
					return;
				}

				const possibleMaxHeight = (this._dynamicMessageLayoutData?.maxHeight ?? maxHeight);
				const width = this.bodyDimension?.width ?? this.container.offsetWidth;
				this.input.layout(possibleMaxHeight, width);
				const inputPartHeight = this.input.inputPartHeight;
				const chatTodoListWidgetHeight = this.chatTodoListWidget.height;
				const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - inputPartHeight - chatTodoListWidgetHeight);
				this.layout(newHeight + inputPartHeight + chatTodoListWidgetHeight, width);
			});
		}));
	}

	updateDynamicChatTreeItemLayout(numOfChatTreeItems: number, maxHeight: number) {
		this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
		let hasChanged = false;
		let height = this.bodyDimension!.height;
		let width = this.bodyDimension!.width;
		if (maxHeight < this.bodyDimension!.height) {
			height = maxHeight;
			hasChanged = true;
		}
		const containerWidth = this.container.offsetWidth;
		if (this.bodyDimension?.width !== containerWidth) {
			width = containerWidth;
			hasChanged = true;
		}
		if (hasChanged) {
			this.layout(height, width);
		}
	}

	get isDynamicChatTreeItemLayoutEnabled(): boolean {
		return this._dynamicMessageLayoutData?.enabled ?? false;
	}

	set isDynamicChatTreeItemLayoutEnabled(value: boolean) {
		if (!this._dynamicMessageLayoutData) {
			return;
		}
		this._dynamicMessageLayoutData.enabled = value;
	}

	layoutDynamicChatTreeItemMode(): void {
		if (!this.viewModel || !this._dynamicMessageLayoutData?.enabled) {
			return;
		}

		const width = this.bodyDimension?.width ?? this.container.offsetWidth;
		this.input.layout(this._dynamicMessageLayoutData.maxHeight, width);
		const inputHeight = this.input.inputPartHeight;
		const chatTodoListWidgetHeight = this.chatTodoListWidget.height;

		const totalMessages = this.viewModel.getItems();
		// grab the last N messages
		const messages = totalMessages.slice(-this._dynamicMessageLayoutData.numOfMessages);

		const needsRerender = messages.some(m => m.currentRenderedHeight === undefined);
		const listHeight = needsRerender
			? this._dynamicMessageLayoutData.maxHeight
			: messages.reduce((acc, message) => acc + message.currentRenderedHeight!, 0);

		this.layout(
			Math.min(
				// we add an additional 18px in order to show that there is scrollable content
				inputHeight + chatTodoListWidgetHeight + listHeight + (totalMessages.length > 2 ? 18 : 0),
				this._dynamicMessageLayoutData.maxHeight
			),
			width
		);

		if (needsRerender || !listHeight) {
			this.scrollToEnd();
		}
	}

	saveState(): void {
		this.input.saveState();
	}

	getViewState(): IChatViewState {
		// Get the input state which includes our locked agent (if any)
		const inputState = this.input.getViewState();
		return {
			inputValue: this.getInput(),
			inputState: inputState
		};
	}

	private updateChatInputContext() {
		const currentAgent = this.parsedInput.parts.find(part => part instanceof ChatRequestAgentPart);
		this.agentInInput.set(!!currentAgent);
	}

	private async _applyPromptMetadata({ mode, tools, model }: PromptHeader, requestInput: IChatRequestInputOptions): Promise<void> {

		const currentMode = this.input.currentModeObs.get();

		if (tools !== undefined && !mode && currentMode.kind !== ChatModeKind.Agent) {
			mode = ChatModeKind.Agent;
		}

		// switch to appropriate chat mode if needed
		if (mode && mode !== currentMode.name) {
			// Find the mode object to get its kind
			const chatMode = this.chatModeService.findModeByName(mode);
			if (chatMode) {
				if (currentMode.kind !== chatMode.kind) {
					const chatModeCheck = await this.instantiationService.invokeFunction(handleModeSwitch, currentMode.kind, chatMode.kind, this.viewModel?.model.getRequests().length ?? 0, this.viewModel?.model.editingSession);
					if (!chatModeCheck) {
						return undefined;
					} else if (chatModeCheck.needToClearSession) {
						this.clear();
						await this.waitForReady();
					}
				}
				this.input.setChatMode(chatMode.id);
			}
		}

		// if not tools to enable are present, we are done
		if (tools !== undefined && this.input.currentModeKind === ChatModeKind.Agent) {
			const enablementMap = this.toolsService.toToolAndToolSetEnablementMap(tools);
			this.input.selectedToolsModel.set(enablementMap, true);
		}

		if (model !== undefined) {
			this.input.switchModelByQualifiedName(model);
		}
	}

	/**
	 * Adds additional instructions to the context
	 * - instructions that have a 'applyTo' pattern that matches the current input
	 * - instructions referenced in the copilot settings 'copilot-instructions'
	 * - instructions referenced in an already included instruction file
	 */
	private async _autoAttachInstructions({ attachedContext }: IChatRequestInputOptions): Promise<void> {
		const promptsConfigEnabled = PromptsConfig.enabled(this.configurationService);
		this.logService.debug(`ChatWidget#_autoAttachInstructions: ${PromptsConfig.KEY}: ${promptsConfigEnabled}`);

		if (promptsConfigEnabled) {
			const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, this._getReadTool());
			await computer.collect(attachedContext, CancellationToken.None);
		} else {
			const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, undefined);
			await computer.collectAgentInstructionsOnly(attachedContext, CancellationToken.None);
		}
	}

	private _getReadTool(): IToolData | undefined {
		if (this.input.currentModeKind !== ChatModeKind.Agent) {
			return undefined;
		}
		const readFileTool = this.toolsService.getToolByName('readFile');
		if (!readFileTool || !this.input.selectedToolsModel.userSelectedTools.get()[readFileTool.id]) {
			return undefined;
		}
		return readFileTool;
	}

	delegateScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent): void {
		this.tree.delegateScrollFromMouseWheelEvent(browserEvent);
	}
}

export class ChatWidgetService extends Disposable implements IChatWidgetService {

	declare readonly _serviceBrand: undefined;

	private _widgets: ChatWidget[] = [];
	private _lastFocusedWidget: ChatWidget | undefined = undefined;

	private readonly _onDidAddWidget = this._register(new Emitter<ChatWidget>());
	readonly onDidAddWidget: Event<IChatWidget> = this._onDidAddWidget.event;

	get lastFocusedWidget(): IChatWidget | undefined {
		return this._lastFocusedWidget;
	}

	getAllWidgets(): ReadonlyArray<IChatWidget> {
		return this._widgets;
	}

	getWidgetsByLocations(location: ChatAgentLocation): ReadonlyArray<IChatWidget> {
		return this._widgets.filter(w => w.location === location);
	}

	getWidgetByInputUri(uri: URI): ChatWidget | undefined {
		return this._widgets.find(w => isEqual(w.inputUri, uri));
	}

	getWidgetBySessionId(sessionId: string): ChatWidget | undefined {
		return this._widgets.find(w => w.viewModel?.sessionId === sessionId);
	}

	private setLastFocusedWidget(widget: ChatWidget | undefined): void {
		if (widget === this._lastFocusedWidget) {
			return;
		}

		this._lastFocusedWidget = widget;
	}

	register(newWidget: ChatWidget): IDisposable {
		if (this._widgets.some(widget => widget === newWidget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		this._widgets.push(newWidget);
		this._onDidAddWidget.fire(newWidget);

		return combinedDisposable(
			newWidget.onDidFocus(() => this.setLastFocusedWidget(newWidget)),
			toDisposable(() => this._widgets.splice(this._widgets.indexOf(newWidget), 1))
		);
	}
}

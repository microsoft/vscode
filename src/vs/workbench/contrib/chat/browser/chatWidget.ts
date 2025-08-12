/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { ITreeContextMenuEvent, ITreeElement } from '../../../../base/browser/ui/tree/tree.js';
import { disposableTimeout, timeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename, extUri, isEqual } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { PromptsType } from '../common/promptSyntax/promptTypes.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { checkModeOption } from '../common/chat.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, inChatEditingSessionContextKey, ModifiedFileEntryState } from '../common/chatEditingService.js';
import { ChatPauseState, IChatModel, IChatResponseModel } from '../common/chatModel.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestSlashPromptPart, ChatRequestToolPart, ChatRequestToolSetPart, chatSubcommandLeader, formatChatQuestion, IParsedChatRequest } from '../common/chatParserTypes.js';
import { ChatRequestParser } from '../common/chatRequestParser.js';
import { IChatLocationData, IChatSendRequestOptions, IChatService } from '../common/chatService.js';
import { IChatSlashCommandService } from '../common/chatSlashCommands.js';
import { ChatViewModel, IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../common/chatViewModel.js';
import { IChatInputState } from '../common/chatWidgetHistoryService.js';
import { CodeBlockModelCollection } from '../common/codeBlockModelCollection.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolSet } from '../common/languageModelToolsService.js';
import { type TPromptMetadata } from '../common/promptSyntax/parsers/promptHeader/promptHeader.js';
import { IPromptParserResult, IPromptsService } from '../common/promptSyntax/service/promptsService.js';
import { handleModeSwitch } from './actions/chatActions.js';
import { ChatTreeItem, IChatAcceptInputOptions, IChatAccessibilityService, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions, IChatWidget, IChatWidgetService, IChatWidgetViewContext, IChatWidgetViewOptions } from './chat.js';
import { ChatAccessibilityProvider } from './chatAccessibilityProvider.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { ChatInputPart, IChatInputStyles } from './chatInputPart.js';
import { ChatListDelegate, ChatListItemRenderer, IChatListItemTemplate, IChatRendererDelegate } from './chatListRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import './media/chat.css';
import './media/chatAgentHover.css';
import './media/chatViewWelcome.css';
import { ChatViewWelcomePart, IChatSuggestedPrompts, IChatViewWelcomeContent } from './viewsWelcome/chatViewWelcomeController.js';
import { MicrotaskDelay } from '../../../../base/common/symbols.js';
import { IChatRequestVariableEntry, ChatRequestVariableSet as ChatRequestVariableSet, isPromptFileVariableEntry, toPromptFileVariableEntry, PromptFileVariableKind, isPromptTextVariableEntry } from '../common/chatVariableEntries.js';
import { ChatTodoListWidget } from './chatContentParts/chatTodoListWidget.js';
import { PromptsConfig } from '../common/promptSyntax/config/config.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ComputeAutomaticInstructions } from '../common/promptSyntax/computeAutomaticInstructions.js';
import { startupExpContext, StartupExperimentGroup } from '../../../services/coreExperimentation/common/coreExperimentationService.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { TodoListToolSettingId as TodoListToolSettingId } from '../common/tools/manageTodoListTool.js';

const $ = dom.$;

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

	private inputPart!: ChatInputPart;
	private inlineInputPart!: ChatInputPart;
	private inputContainer!: HTMLElement;
	private focusedInputDOM!: HTMLElement;
	private editorOptions!: ChatEditorOptions;

	private recentlyRestoredCheckpoint: boolean = false;

	private settingChangeCounter = 0;

	private listContainer!: HTMLElement;
	private container!: HTMLElement;
	get domNode() {
		return this.container;
	}

	private welcomeMessageContainer!: HTMLElement;
	private readonly welcomePart: MutableDisposable<ChatViewWelcomePart> = this._register(new MutableDisposable());
	private readonly chatTodoListWidget: ChatTodoListWidget;

	private bodyDimension: dom.Dimension | undefined;
	private visibleChangeCount = 0;
	private requestInProgress: IContextKey<boolean>;
	private isRequestPaused: IContextKey<boolean>;
	private canRequestBePaused: IContextKey<boolean>;
	private agentInInput: IContextKey<boolean>;
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
	private _onDidBecomeReady = this._register(new Emitter<void>());

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: ChatViewModel | undefined;

	// Coding agent locking state
	private _lockedToCodingAgent: string | undefined;
	private _lockedToCodingAgentContextKey!: IContextKey<boolean>;
	private _codingAgentPrefix: string | undefined;

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

			this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(this.viewModel!.sessionId, this.getInput(), this.location, { selectedAgent: this._lastSelectedAgent, mode: this.input.currentModeKind });
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

	get supportsChangingModes(): boolean {
		return !!this.viewOptions.supportsChangingModes;
	}

	constructor(
		location: ChatAgentLocation | IChatWidgetLocationOptions,
		_viewContext: IChatWidgetViewContext | undefined,
		private readonly viewOptions: IChatWidgetViewOptions,
		private readonly styles: IChatWidgetStyles,
		@ICodeEditorService codeEditorService: ICodeEditorService,
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
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
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
		this.isRequestPaused = ChatContextKeys.isRequestPaused.bindTo(contextKeyService);
		this.canRequestBePaused = ChatContextKeys.canRequestBePaused.bindTo(contextKeyService);

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

		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([
				ChatContextKeys.Setup.installed.key,
				ChatContextKeys.Entitlement.canSignUp.key
			]))) {
				// reset the input in welcome view if it was rendered in experimental mode
				if (this.container.classList.contains('experimental-welcome-view')) {
					this.container.classList.remove('experimental-welcome-view');
					const renderFollowups = this.viewOptions.renderFollowups ?? false;
					const renderStyle = this.viewOptions.renderStyle;
					this.createInput(this.container, { renderFollowups, renderStyle });
				}
			}
		}));
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

		this.renderWelcomeViewContentIfNeeded();
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
	}

	private onDidChangeItems(skipDynamicLayout?: boolean) {
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
			if (this.container.classList.contains('experimental-welcome-view')) {
				this.container.classList.remove('experimental-welcome-view');
				const renderFollowups = this.viewOptions.renderFollowups ?? false;
				const renderStyle = this.viewOptions.renderStyle;
				this.createInput(this.container, { renderFollowups, renderStyle });
			}

			this.renderWelcomeViewContentIfNeeded();
			this.renderChatTodoListWidget();

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
							(isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : '') +
							(isResponseVM(element) && element.model.isPaused.get() ? '_paused' : '');
					},
				}
			});

			if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
				this.layoutDynamicChatTreeItemMode();
			}

			this.renderFollowups();
		}
	}

	private renderWelcomeViewContentIfNeeded() {

		if (this.viewOptions.renderStyle === 'compact' || this.viewOptions.renderStyle === 'minimal') {
			return;
		}

		const numItems = this.viewModel?.getItems().length ?? 0;
		if (!numItems) {
			dom.clearNode(this.welcomeMessageContainer);
			// TODO@bhavyaus remove this startup experiment once settled
			const startupExpValue = startupExpContext.getValue(this.contextKeyService);
			const configuration = this.configurationService.inspect('workbench.secondarySideBar.defaultVisibility');
			const expIsActive = configuration.defaultValue !== 'hidden';

			const expEmptyState = this.configurationService.getValue<boolean>('chat.emptyChatState.enabled');

			const chatSetupTriggerContext = ContextKeyExpr.or(
				ChatContextKeys.Setup.installed.negate(),
				ChatContextKeys.Entitlement.canSignUp
			);

			let welcomeContent: IChatViewWelcomeContent;
			const defaultAgent = this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind);
			const additionalMessage = defaultAgent?.metadata.additionalWelcomeMessage;
			if ((startupExpValue === StartupExperimentGroup.MaximizedChat
				|| startupExpValue === StartupExperimentGroup.SplitEmptyEditorChat
				|| startupExpValue === StartupExperimentGroup.SplitWelcomeChat
				|| expIsActive) && this.contextKeyService.contextMatchesRules(chatSetupTriggerContext)) {
				welcomeContent = this.getExpWelcomeViewContent();
				this.container.classList.add('experimental-welcome-view');
			}
			else if (expEmptyState) {
				welcomeContent = this.getWelcomeViewContent(additionalMessage, expEmptyState);
			}
			else {
				const tips = this.input.currentModeKind === ChatModeKind.Ask
					? new MarkdownString(localize('chatWidget.tips', "{0} or type {1} to attach context\n\n{2} to chat with extensions\n\nType {3} to use commands", '$(attach)', '#', '$(mention)', '/'), { supportThemeIcons: true })
					: new MarkdownString(localize('chatWidget.tips.withoutParticipants', "{0} or type {1} to attach context", '$(attach)', '#'), { supportThemeIcons: true });
				welcomeContent = this.getWelcomeViewContent(additionalMessage);
				welcomeContent.tips = tips;
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
		}

		if (this.viewModel) {
			dom.setVisibility(numItems === 0, this.welcomeMessageContainer);
			dom.setVisibility(numItems !== 0, this.listContainer);
		}
	}

	private renderChatTodoListWidget(): void {
		const isChatTodoListToolEnabled = this.configurationService.getValue<boolean>(TodoListToolSettingId) === true;
		if (isChatTodoListToolEnabled) {
			this.chatTodoListWidget.updateSessionId(this.viewModel?.sessionId);
		}
	}

	private getWelcomeViewContent(additionalMessage: string | IMarkdownString | undefined, expEmptyState?: boolean): IChatViewWelcomeContent {
		const disclaimerMessage = expEmptyState
			? localize('chatDisclaimer', "AI responses may be inaccurate.")
			: localize('chatMessage', "Copilot is powered by AI, so mistakes are possible. Review output carefully before use.");
		const icon = expEmptyState ? Codicon.chatSparkle : Codicon.copilotLarge;

		if (this.isLockedToCodingAgent) {
			return {
				title: localize('codingAgentTitle', "Chat with {0}", this._codingAgentPrefix),
				message: new MarkdownString(localize('codingAgentMessage', "This chat session will be forwarded to the {0} coding agent", this._codingAgentPrefix)),
				icon: Codicon.cloud,
				additionalMessage,
			};
		}

		if (this.input.currentModeKind === ChatModeKind.Ask) {
			return {
				title: localize('chatDescription', "Ask about your code."),
				message: new MarkdownString(disclaimerMessage),
				icon,
				additionalMessage,
			};
		} else if (this.input.currentModeKind === ChatModeKind.Edit) {
			const editsHelpMessage = localize('editsHelp', "Start your editing session by defining a set of files that you want to work with. Then ask Copilot for the changes you want to make.");
			const message = expEmptyState ? disclaimerMessage : `${editsHelpMessage}\n\n${disclaimerMessage}`;

			return {
				title: localize('editsTitle', "Edit in context."),
				message: new MarkdownString(message),
				icon,
				additionalMessage
			};
		} else {
			const agentHelpMessage = localize('agentMessage', "Ask Copilot to edit your files in [agent mode]({0}). Copilot will automatically use multiple requests to pick files to edit, run terminal commands, and iterate on errors.", 'https://aka.ms/vscode-copilot-agent');
			const message = expEmptyState ? disclaimerMessage : `${agentHelpMessage}\n\n${disclaimerMessage}`;

			return {
				title: localize('agentTitle', "Build with agent mode."),
				message: new MarkdownString(message),
				icon,
				additionalMessage
			};
		}
	}

	private getExpWelcomeViewContent(): IChatViewWelcomeContent {
		const welcomeContent: IChatViewWelcomeContent = {
			title: localize('expChatTitle', 'Welcome to Copilot'),
			message: new MarkdownString(localize('expchatMessage', "Let's get started")),
			icon: Codicon.copilotLarge,
			inputPart: this.inputPart.element,
			additionalMessage: localize('expChatAdditionalMessage', "Review AI output carefully before use."),
			isExperimental: true,
			suggestedPrompts: this.getExpSuggestedPrompts(),
		};
		return welcomeContent;
	}

	private getExpSuggestedPrompts(): IChatSuggestedPrompts[] {
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
					label: localize('chatWidget.suggestedPrompts.newProject', "Create project"),
					prompt: localize('chatWidget.suggestedPrompts.newProjectPrompt', "Create a #new Hello World project in TypeScript"),
				}
			];
		} else {
			return [
				{
					icon: Codicon.debugAlt,
					label: localize('chatWidget.suggestedPrompts.buildWorkspace', "Build workspace"),
					prompt: localize('chatWidget.suggestedPrompts.buildWorkspacePrompt', "How do I build this workspace?"),
				},
				{
					icon: Codicon.gear,
					label: localize('chatWidget.suggestedPrompts.findConfig', "Show project config"),
					prompt: localize('chatWidget.suggestedPrompts.findConfigPrompt', "Where is the configuration for this project defined?"),
				}
			];
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
			this._register(disposableTimeout(() => {
				// Progressive rendering paused while hidden, so start it up again.
				// Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
				if (this._visible) {
					this.onDidChangeItems(true);
				}
			}, 0));

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
					mode: this.input.currentModeKind,
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
			widgetViewKindTag: this.getWidgetViewKindTag()
		};

		if (this.viewModel?.editing) {
			const editedRequest = this.renderer.getTemplateDataForRequestId(this.viewModel?.editing?.id);
			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editedRequest?.contextKeyService])));
			this.inlineInputPart = this._register(scopedInstantiationService.createInstance(ChatInputPart,
				this.location,
				commonConfig,
				this.styles,
				() => this.collectInputState(),
				true
			));
		} else {
			this.inputPart = this._register(this.instantiationService.createInstance(ChatInputPart,
				this.location,
				commonConfig,
				this.styles,
				() => this.collectInputState(),
				false
			));
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
			this.renderWelcomeViewContentIfNeeded();
		}));
		this._register(this.input.onDidChangeCurrentChatMode(() => {
			this.renderWelcomeViewContentIfNeeded();
			this.refreshParsedInput();
			this.renderFollowups();
		}));


		const enabledToolSetsAndTools = this.input.selectedToolsModel.entries.map(value => {
			const toolSetIds = new Set<string>();
			const toolIds = new Set<string>();
			for (const item of value) {
				if (item instanceof ToolSet) {
					toolSetIds.add(item.id);
				} else {
					toolIds.add(item.id);
				}
			}
			return { toolSetIds, toolIds };
		});

		this._register(autorun(r => {

			const { toolSetIds, toolIds } = enabledToolSetsAndTools.read(r);

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

	togglePaused() {
		this.viewModel?.model.toggleLastRequestPaused();
		this.onDidChangeItems();
	}

	setModel(model: IChatModel, viewState: IChatViewState): void {
		if (!this.container) {
			throw new Error('Call render() before setModel()');
		}

		if (model.sessionId === this.viewModel?.sessionId) {
			return;
		}

		this._codeBlockModelCollection.clear();

		this.container.setAttribute('data-session-id', model.sessionId);
		this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, this._codeBlockModelCollection);

		if (this._lockedToCodingAgent) {
			const placeholder = localize('chat.input.placeholder.lockedToAgent', "Follow up with {0}", this._lockedToCodingAgent);
			this.viewModel.setInputPlaceholder(placeholder);
			this.inputEditor.updateOptions({ placeholder });
		} else if (this.viewModel.inputPlaceholder) {
			this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
		}

		const renderImmediately = this.configurationService.getValue<boolean>('chat.experimental.renderMarkdownImmediately') === true;
		const delay = renderImmediately ? MicrotaskDelay : 0;
		this.viewModelDisposables.add(Event.runAndSubscribe(Event.accumulate(this.viewModel.onDidChange, delay), (events => {
			if (!this.viewModel) {
				return;
			}

			this.requestInProgress.set(this.viewModel.requestInProgress);
			this.isRequestPaused.set(this.viewModel.requestPausibility === ChatPauseState.Paused);
			this.canRequestBePaused.set(this.viewModel.requestPausibility !== ChatPauseState.NotPausable);

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
	public lockToCodingAgent(name: string, displayName: string): void {
		this._lockedToCodingAgent = displayName;
		this._codingAgentPrefix = `@${name} `;
		this._lockedToCodingAgentContextKey.set(true);
		this.renderWelcomeViewContentIfNeeded();
		this.input.setChatMode(ChatModeKind.Ask);
		this.renderer.updateOptions({ restorable: false, editable: false, progressMessageAtBottomOfResponse: true });
		this.tree.rerender();
	}

	public unlockFromCodingAgent(): void {
		// Clear all state related to locking
		this._lockedToCodingAgent = undefined;
		this._codingAgentPrefix = undefined;
		this._lockedToCodingAgentContextKey.set(false);

		// Explicitly update the DOM to reflect unlocked state
		this.renderWelcomeViewContentIfNeeded();

		// Reset to default placeholder
		if (this.viewModel) {
			this.viewModel.resetInputPlaceholder();
		}
		this.inputEditor.updateOptions({ placeholder: undefined });
		this.renderer.updateOptions({ restorable: true, editable: true, progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask });
		this.tree.rerender();
	}

	public get isLockedToCodingAgent(): boolean {
		return !!this._lockedToCodingAgent;
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

	private async _applyPromptFileIfSet(requestInput: IChatRequestInputOptions): Promise<IPromptParserResult | undefined> {
		if (!PromptsConfig.enabled(this.configurationService)) {
			// if prompts are not enabled, we don't need to do anything
			return undefined;
		}


		let parseResult: IPromptParserResult | undefined;

		// first check if the input has a prompt slash command
		const agentSlashPromptPart = this.parsedInput.parts.find((r): r is ChatRequestSlashPromptPart => r instanceof ChatRequestSlashPromptPart);
		if (agentSlashPromptPart) {
			parseResult = await this.promptsService.resolvePromptSlashCommand(agentSlashPromptPart.slashPromptCommand, CancellationToken.None);
			if (parseResult) {
				// add the prompt file to the context, but not sticky
				requestInput.attachedContext.insertFirst(toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, undefined, true));

				// remove the slash command from the input
				requestInput.input = this.parsedInput.parts.filter(part => !(part instanceof ChatRequestSlashPromptPart)).map(part => part.text).join('').trim();
			}
		} else {
			// if not, check if the context contains a prompt file: This is the old workflow that we still support for legacy reasons
			const uri = this._findPromptFileInContext(requestInput.attachedContext);
			if (uri) {
				parseResult = await this.promptsService.parse(uri, PromptsType.prompt, CancellationToken.None);
			}
		}

		if (!parseResult) {
			return undefined;
		}
		const meta = parseResult.metadata;
		if (meta?.promptType !== PromptsType.prompt) {
			return undefined;
		}

		const input = requestInput.input.trim();
		requestInput.input = `Follow instructions in [${basename(parseResult.uri)}](${parseResult.uri.toString()}).`;
		if (input) {
			// if the input is not empty, append it to the prompt
			requestInput.input += `\n${input}`;
		}

		await this._applyPromptMetadata(meta, requestInput);

		return parseResult;
	}

	private async _acceptInput(query: { query: string } | undefined, options?: IChatAcceptInputOptions): Promise<IChatResponseModel | undefined> {
		if (this.viewModel?.requestInProgress && this.viewModel.requestPausibility !== ChatPauseState.Paused) {
			return;
		}

		// Handle coding agent prefix enforcement
		if (this._lockedToCodingAgent && this._codingAgentPrefix) {
			if (query) {
				// For programmatic input, ensure the prefix is added
				if (!query.query.startsWith(this._codingAgentPrefix)) {
					query.query = this._codingAgentPrefix + this.removeExistingAgentPrefix(query.query);
				}
			} else {
				// For user input, update the editor value if needed
				const currentValue = this.getInput();
				if (!currentValue.length) {
					return;
				}
				if (!currentValue.startsWith(this._codingAgentPrefix)) {
					const newValue = this._codingAgentPrefix + this.removeExistingAgentPrefix(currentValue);
					this.input.inputEditor.setValue(newValue);
				}
			}
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
			this.scrollLock = !!checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll);

			const editorValue = this.getInput();
			const requestId = this.chatAccessibilityService.acceptRequest();
			const requestInputs: IChatRequestInputOptions = {
				input: !query ? editorValue : query.query,
				attachedContext: this.input.getAttachedAndImplicitContext(this.viewModel.sessionId),
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
				modeInstructions: this.input.currentModeObs.get().body?.get()
			});

			if (result) {
				this.input.acceptInput(isUserQuery);
				this._onDidSubmitAgent.fire({ agent: result.agent, slashCommand: result.slashCommand });
				this.currentRequest = result.responseCompletePromise.then(() => {
					const responses = this.viewModel?.getItems().filter(isResponseVM);
					const lastResponse = responses?.[responses.length - 1];
					this.chatAccessibilityService.acceptResponse(lastResponse, requestId, options?.isVoiceInput);
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
			modeInstructions: this.input.currentModeObs.get().body?.get(),
			userSelectedTools: this.input.selectedToolsModel.enablementMap.map(map => {
				const userSelectedTools: Record<string, boolean> = {};
				for (const [tool, enablement] of map) {
					userSelectedTools[tool.id] = enablement;
				}
				return userSelectedTools;
			}),
			mode: this.input.currentModeKind,
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

	focusLastMessage(): void {
		if (!this.viewModel) {
			return;
		}

		const items = this.tree.getNode(null).children;
		const lastItem = items[items.length - 1];
		if (!lastItem) {
			return;
		}

		this.tree.setFocus([lastItem.element]);
		this.tree.domFocus();
	}

	layout(height: number, width: number): void {
		width = Math.min(width, 950);
		this.bodyDimension = new dom.Dimension(width, height);

		const layoutHeight = this._dynamicMessageLayoutData?.enabled ? this._dynamicMessageLayoutData.maxHeight : height;
		if (this.viewModel?.editing) {
			this.inlineInputPart?.layout(layoutHeight, width);
		}

		if (this.container.classList.contains('experimental-welcome-view')) {
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

	private async _applyPromptMetadata(metadata: TPromptMetadata, requestInput: IChatRequestInputOptions): Promise<void> {

		const { mode, tools, model } = metadata;

		// switch to appropriate chat mode if needed
		if (mode && mode !== this.input.currentModeKind) {
			const chatModeCheck = await this.instantiationService.invokeFunction(handleModeSwitch, this.input.currentModeKind, mode, this.viewModel?.model.getRequests().length ?? 0, this.viewModel?.model.editingSession);
			if (!chatModeCheck) {
				return undefined;
			} else if (chatModeCheck.needToClearSession) {
				this.clear();
				await this.waitForReady();
			}
			this.input.setChatMode(mode);
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
			await computer.collectCopilotInstructionsOnly(attachedContext, CancellationToken.None);
		}
	}

	private _getReadTool(): IToolData | undefined {
		if (this.input.currentModeKind !== ChatModeKind.Agent) {
			return undefined;
		}
		const readFileTool = this.toolsService.getToolByName('readFile');
		if (!readFileTool || !this.input.selectedToolsModel.enablementMap.get().get(readFileTool)) {
			return undefined;
		}
		return readFileTool;
	}

	private removeExistingAgentPrefix(text: string): string {
		// Remove any existing agent prefix (e.g., @agent) from the beginning
		return text.replace(/^@\w+\s*/, '');
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

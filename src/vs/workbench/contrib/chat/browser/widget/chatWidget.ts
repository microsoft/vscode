/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chat.css';
import './media/chatAgentHover.css';
import './media/chatViewWelcome.css';
import * as dom from '../../../../../base/browser/dom.js';
import { IMouseWheelEvent } from '../../../../../base/browser/mouseEvent.js';
import { disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, thenIfNotDisposed } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { filter } from '../../../../../base/common/objects.js';
import { autorun, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, extUri, isEqual } from '../../../../../base/common/resources.js';
import { MicrotaskDelay } from '../../../../../base/common/symbols.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';

import { ITextResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { checkModeOption } from '../../common/chat.js';
import { IChatAgentAttachmentCapabilities, IChatAgentCommand, IChatAgentData, IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, inChatEditingSessionContextKey, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { IChatLayoutService } from '../../common/widget/chatLayoutService.js';
import { IChatModel, IChatModelInputState, IChatResponseModel } from '../../common/model/chatModel.js';
import { ChatMode, IChatModeService } from '../../common/chatModes.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestSlashPromptPart, ChatRequestToolPart, ChatRequestToolSetPart, chatSubcommandLeader, formatChatQuestion, IParsedChatRequest } from '../../common/requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../../common/requestParser/chatRequestParser.js';
import { ChatRequestQueueKind, ChatSendResult, IChatLocationData, IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatSlashCommandService } from '../../common/participants/chatSlashCommands.js';
import { IChatTodoListService } from '../../common/tools/chatTodoListService.js';
import { ChatRequestVariableSet, IChatRequestVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isWorkspaceVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { CodeBlockModelCollection } from '../../common/widget/codeBlockModelCollection.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelToolsService, isToolSet } from '../../common/tools/languageModelToolsService.js';
import { ComputeAutomaticInstructions } from '../../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { IHandOff, PromptHeader, Target } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { handleModeSwitch } from '../actions/chatActions.js';
import { ChatTreeItem, IChatAcceptInputOptions, IChatAccessibilityService, IChatCodeBlockInfo, IChatFileTreeInfo, IChatListItemRendererOptions, IChatWidget, IChatWidgetService, IChatWidgetViewContext, IChatWidgetViewModelChangeEvent, IChatWidgetViewOptions, isIChatResourceViewContext, isIChatViewViewContext } from '../chat.js';
import { ChatAttachmentModel } from '../attachments/chatAttachmentModel.js';
import { ChatSuggestNextWidget } from './chatContentParts/chatSuggestNextWidget.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from './input/chatInputPart.js';
import { IChatListItemTemplate } from './chatListRenderer.js';
import { ChatListWidget } from './chatListWidget.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatViewWelcomePart, IChatSuggestedPrompts, IChatViewWelcomeContent } from '../viewsWelcome/chatViewWelcomeController.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';

const $ = dom.$;

export interface IChatWidgetStyles extends IChatInputStyles {
	readonly inputEditorBackground: string;
	readonly resultEditorBackground: string;
}

export interface IChatWidgetContrib extends IDisposable {

	readonly id: string;

	/**
	 * A piece of state which is related to the input editor of the chat widget.
	 * Takes in the `contrib` object that will be saved in the {@link IChatModelInputState}.
	 */
	getInputState?(contrib: Record<string, unknown>): void;

	/**
	 * Called with the result of getInputState when navigating input history.
	 */
	setInputState?(contrib: Readonly<Record<string, unknown>>): void;
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
	return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isQuickChat);
}

function isInlineChat(widget: IChatWidget): boolean {
	return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isInlineChat);
}

type ChatHandoffClickEvent = {
	fromAgent: string;
	toAgent: string;
	hasPrompt: boolean;
	autoSend: boolean;
};

type ChatHandoffClickClassification = {
	owner: 'digitarald';
	comment: 'Event fired when a user clicks on a handoff prompt in the chat suggest-next widget';
	fromAgent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent/mode the user was in before clicking the handoff' };
	toAgent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent/mode specified in the handoff' };
	hasPrompt: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the handoff includes a prompt' };
	autoSend: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the handoff automatically submits the request' };
};

type ChatHandoffWidgetShownEvent = {
	agent: string;
	handoffCount: number;
};

type ChatHandoffWidgetShownClassification = {
	owner: 'digitarald';
	comment: 'Event fired when the suggest-next widget is shown with handoff prompts';
	agent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current agent/mode that has handoffs defined' };
	handoffCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of handoff options shown to the user' };
};

const supportsAllAttachments: Required<IChatAgentAttachmentCapabilities> = {
	supportsFileAttachments: true,
	supportsToolAttachments: true,
	supportsMCPAttachments: true,
	supportsImageAttachments: true,
	supportsSearchResultAttachments: true,
	supportsInstructionAttachments: true,
	supportsSourceControlAttachments: true,
	supportsProblemAttachments: true,
	supportsSymbolAttachments: true,
	supportsTerminalAttachments: true,
};

const DISCLAIMER = localize('chatDisclaimer', "AI responses may be inaccurate.");

export class ChatWidget extends Disposable implements IChatWidget {

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static readonly CONTRIBS: { new(...args: [IChatWidget, ...any]): IChatWidgetContrib }[] = [];

	private readonly _onDidSubmitAgent = this._register(new Emitter<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>());
	readonly onDidSubmitAgent = this._onDidSubmitAgent.event;

	private _onDidChangeAgent = this._register(new Emitter<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>());
	readonly onDidChangeAgent = this._onDidChangeAgent.event;

	private _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeViewModel = this._register(new Emitter<IChatWidgetViewModelChangeEvent>());
	readonly onDidChangeViewModel = this._onDidChangeViewModel.event;

	private _onDidScroll = this._register(new Emitter<void>());
	readonly onDidScroll = this._onDidScroll.event;

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

	private _onDidChangeEmptyState = this._register(new Emitter<void>());
	readonly onDidChangeEmptyState = this._onDidChangeEmptyState.event;

	contribs: ReadonlyArray<IChatWidgetContrib> = [];

	private listContainer!: HTMLElement;
	private container!: HTMLElement;

	get domNode() { return this.container; }

	private listWidget!: ChatListWidget;
	private readonly _codeBlockModelCollection: CodeBlockModelCollection;

	private readonly visibilityTimeoutDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private readonly visibilityAnimationFrameDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	private readonly inputPartDisposable: MutableDisposable<ChatInputPart> = this._register(new MutableDisposable());
	private readonly inlineInputPartDisposable: MutableDisposable<ChatInputPart> = this._register(new MutableDisposable());
	private inputContainer!: HTMLElement;
	private focusedInputDOM!: HTMLElement;
	private editorOptions!: ChatEditorOptions;

	private recentlyRestoredCheckpoint: boolean = false;

	private welcomeMessageContainer!: HTMLElement;
	private readonly welcomePart: MutableDisposable<ChatViewWelcomePart> = this._register(new MutableDisposable());

	private readonly chatSuggestNextWidget: ChatSuggestNextWidget;

	private bodyDimension: dom.Dimension | undefined;
	private visibleChangeCount = 0;
	private requestInProgress: IContextKey<boolean>;
	private agentInInput: IContextKey<boolean>;

	private _visible = false;
	get visible() { return this._visible; }

	private _instructionFilesCheckPromise: Promise<boolean> | undefined;
	private _instructionFilesExist: boolean | undefined;

	private _isRenderingWelcome = false;

	// Coding agent locking state
	private _lockedAgent?: {
		id: string;
		name: string;
		prefix: string;
		displayName: string;
	};
	private readonly _lockedToCodingAgentContextKey: IContextKey<boolean>;
	private readonly _agentSupportsAttachmentsContextKey: IContextKey<boolean>;
	private readonly _sessionIsEmptyContextKey: IContextKey<boolean>;
	private _attachmentCapabilities: IChatAgentAttachmentCapabilities = supportsAllAttachments;

	// Cache for prompt file descriptions to avoid async calls during rendering
	private readonly promptDescriptionsCache = new Map<string, string>();
	private readonly promptUriCache = new Map<string, URI>();
	private _isLoadingPromptDescriptions = false;

	private readonly viewModelDisposables = this._register(new DisposableStore());
	private _viewModel: ChatViewModel | undefined;

	private set viewModel(viewModel: ChatViewModel | undefined) {
		if (this._viewModel === viewModel) {
			return;
		}

		const previousSessionResource = this._viewModel?.sessionResource;
		this.viewModelDisposables.clear();

		this._viewModel = viewModel;
		if (viewModel) {
			this.viewModelDisposables.add(viewModel);
			this.logService.debug('ChatWidget#setViewModel: have viewModel');

			// If switching to a model with a request in progress, play progress sound
			if (viewModel.model.requestInProgress.get()) {
				this.chatAccessibilityService.acceptRequest(viewModel.sessionResource, true);
			}
		} else {
			this.logService.debug('ChatWidget#setViewModel: no viewModel');
		}

		this._onDidChangeViewModel.fire({ previousSessionResource, currentSessionResource: this._viewModel?.sessionResource });
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
				.parseChatRequest(this.viewModel.sessionResource, this.getInput(), this.location, {
					selectedAgent: this._lastSelectedAgent,
					mode: this.input.currentModeKind,
					forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : undefined
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

	get supportsChangingModes(): boolean {
		return !!this.viewOptions.supportsChangingModes;
	}

	get locationData() {
		return this._location.resolveData?.();
	}

	constructor(
		location: ChatAgentLocation | IChatWidgetLocationOptions,
		viewContext: IChatWidgetViewContext | undefined,
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
		@IChatAccessibilityService private readonly chatAccessibilityService: IChatAccessibilityService,
		@ILogService private readonly logService: ILogService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@IChatEditingService chatEditingService: IChatEditingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IChatLayoutService private readonly chatLayoutService: IChatLayoutService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super();

		this._lockedToCodingAgentContextKey = ChatContextKeys.lockedToCodingAgent.bindTo(this.contextKeyService);
		this._agentSupportsAttachmentsContextKey = ChatContextKeys.agentSupportsAttachments.bindTo(this.contextKeyService);
		this._sessionIsEmptyContextKey = ChatContextKeys.chatSessionIsEmpty.bindTo(this.contextKeyService);

		this.viewContext = viewContext ?? {};

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

		this._register(this.chatEntitlementService.onDidChangeAnonymous(() => this.renderWelcomeViewContentIfNeeded()));

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
		this.chatSuggestNextWidget = this._register(this.instantiationService.createInstance(ChatSuggestNextWidget));

		this._register(autorun(r => {
			const viewModel = viewModelObs.read(r);
			const sessions = chatEditingService.editingSessionsObs.read(r);

			const session = sessions.find(candidate => isEqual(candidate.chatSessionResource, viewModel?.sessionResource));
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
			r.store.add(this.inputEditor.onDidChangeModelContent(() => {
				if (this.getInput() === '') {
					this.refreshParsedInput();
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

			for (const codeBlockPart of this.listWidget.editorsInUse()) {
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

		this._register(this.chatTodoListService.onDidUpdateTodos((sessionResource) => {
			if (isEqual(this.viewModel?.sessionResource, sessionResource)) {
				this.inputPart.renderChatTodoListWidget(sessionResource);
			}
		}));
	}

	private _lastSelectedAgent: IChatAgentData | undefined;
	set lastSelectedAgent(agent: IChatAgentData | undefined) {
		this.parsedChatRequest = undefined;
		this._lastSelectedAgent = agent;
		this._updateAgentCapabilitiesContextKeys(agent);
		this._onDidChangeParsedInput.fire();
	}

	get lastSelectedAgent(): IChatAgentData | undefined {
		return this._lastSelectedAgent;
	}

	private _updateAgentCapabilitiesContextKeys(agent: IChatAgentData | undefined): void {
		// Check if the agent has capabilities defined directly
		const capabilities = agent?.capabilities ?? (this._lockedAgent ? this.chatSessionsService.getCapabilitiesForSessionType(this._lockedAgent.id) : undefined);
		this._attachmentCapabilities = capabilities ?? supportsAllAttachments;

		const supportsAttachments = Object.keys(filter(this._attachmentCapabilities, (key, value) => value === true)).length > 0;
		this._agentSupportsAttachmentsContextKey.set(supportsAttachments);
	}

	get supportsFileReferences(): boolean {
		return !!this.viewOptions.supportsFileReferences;
	}

	get attachmentCapabilities(): IChatAgentAttachmentCapabilities {
		return this._attachmentCapabilities;
	}

	/**
	 * Either the inline input (when editing) or the main input part
	 */
	get input(): ChatInputPart {
		return this.viewModel?.editing && this.configurationService.getValue<string>('chat.editRequests') !== 'input' ? this.inlineInputPart : this.inputPart;
	}

	/**
	 * The main input part at the buttom of the chat widget. Use `input` to get the active input (main or inline editing part).
	 */
	get inputPart(): ChatInputPart {
		return this.inputPartDisposable.value!;
	}

	private get inlineInputPart(): ChatInputPart {
		return this.inlineInputPartDisposable.value!;
	}

	get inputEditor(): ICodeEditor {
		return this.input.inputEditor;
	}

	get contentHeight(): number {
		return this.input.height.get() + this.listWidget.contentHeight + this.chatSuggestNextWidget.height;
	}

	get attachmentModel(): ChatAttachmentModel {
		return this.input.attachmentModel;
	}

	render(parent: HTMLElement): void {
		const viewId = isIChatViewViewContext(this.viewContext) ? this.viewContext.viewId : undefined;
		this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
		const renderInputOnTop = this.viewOptions.renderInputOnTop ?? false;
		const renderFollowups = this.viewOptions.renderFollowups ?? !renderInputOnTop;
		const renderStyle = this.viewOptions.renderStyle;
		const renderInputToolbarBelowInput = this.viewOptions.renderInputToolbarBelowInput ?? false;

		this.container = dom.append(parent, $('.interactive-session'));
		this.welcomeMessageContainer = dom.append(this.container, $('.chat-welcome-view-container', { style: 'display: none' }));
		this._register(dom.addStandardDisposableListener(this.welcomeMessageContainer, dom.EventType.CLICK, () => this.focusInput()));

		this._register(this.chatSuggestNextWidget.onDidChangeHeight(() => {
			if (this.bodyDimension) {
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}
		}));
		this._register(this.chatSuggestNextWidget.onDidSelectPrompt(({ handoff, agentId }) => {
			this.handleNextPromptSelection(handoff, agentId);
		}));

		if (renderInputOnTop) {
			this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
		} else {
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
			dom.append(this.container, this.chatSuggestNextWidget.domNode);
			this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
		}

		this.renderWelcomeViewContentIfNeeded();
		this.createList(this.listContainer, { editable: !isInlineChat(this) && !isQuickChat(this), ...this.viewOptions.rendererOptions, renderStyle });

		// Update the font family and size
		this._register(autorun(reader => {
			const fontFamily = this.chatLayoutService.fontFamily.read(reader);
			const fontSize = this.chatLayoutService.fontSize.read(reader);

			this.container.style.setProperty('--vscode-chat-font-family', fontFamily);
			this.container.style.fontSize = `${fontSize}px`;

			if (this.visible) {
				this.listWidget.rerender();
			}
		}));

		this._register(Event.runAndSubscribe(this.editorOptions.onDidChange, () => this.onDidStyleChange()));

		// Do initial render
		if (this.viewModel) {
			this.onDidChangeItems();
			this.listWidget.scrollToEnd();
		}

		this.contribs = ChatWidget.CONTRIBS.map(contrib => {
			try {
				return this._register(this.instantiationService.createInstance(contrib, this));
			} catch (err) {
				this.logService.error('Failed to instantiate chat widget contrib', toErrorMessage(err));
				return undefined;
			}
		}).filter(isDefined);

		this._register(this.chatWidgetService.register(this));

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

		const previous = this.parsedChatRequest;
		this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(this.viewModel.sessionResource, this.getInput(), this.location, { selectedAgent: this._lastSelectedAgent, mode: this.input.currentModeKind });
		if (!previous || !IParsedChatRequest.equals(previous, this.parsedChatRequest)) {
			this._onDidChangeParsedInput.fire();
		}
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

	async clear(): Promise<void> {
		this.logService.debug('ChatWidget#clear');
		if (this._dynamicMessageLayoutData) {
			this._dynamicMessageLayoutData.enabled = true;
		}

		if (this.viewModel?.editing) {
			this.finishedEditing();
		}

		if (this.viewModel) {
			this.viewModel.resetInputPlaceholder();
		}
		if (this._lockedAgent) {
			this.lockToCodingAgent(this._lockedAgent.name, this._lockedAgent.displayName, this._lockedAgent.id);
		} else {
			this.unlockFromCodingAgent();
		}

		this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, true);
		this.chatSuggestNextWidget.hide();
		await this.viewOptions.clear?.();
	}

	private onDidChangeItems(skipDynamicLayout?: boolean) {
		if (this._visible || !this.viewModel) {
			const items = this.viewModel?.getItems() ?? [];

			if (items.length > 0) {
				this.updateChatViewVisibility();
			} else {
				this.renderWelcomeViewContentIfNeeded();
			}

			this._onWillMaybeChangeHeight.fire();

			// Update list widget state and refresh
			this.listWidget.setVisibleChangeCount(this.visibleChangeCount);
			this.listWidget.refresh();

			if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
				this.layoutDynamicChatTreeItemMode();
			}

			this.renderFollowups();
		}
	}

	/**
	 * Updates the DOM visibility of welcome view and chat list immediately
	 */
	private updateChatViewVisibility(): void {
		if (this.viewModel) {
			const numItems = this.viewModel.getItems().length;
			dom.setVisibility(numItems === 0, this.welcomeMessageContainer);
			dom.setVisibility(numItems !== 0, this.listContainer);
		}

		// Only show welcome getting started until extension is installed
		this.container.classList.toggle('chat-view-getting-started-disabled', this.chatEntitlementService.sentiment.installed);

		this._onDidChangeEmptyState.fire();
	}

	isEmpty(): boolean {
		return (this.viewModel?.getItems().length ?? 0) === 0;
	}

	/**
	 * Renders the welcome view content when needed.
	 */
	private renderWelcomeViewContentIfNeeded() {
		if (this._isRenderingWelcome) {
			return;
		}

		this._isRenderingWelcome = true;
		try {
			if (this.viewOptions.renderStyle === 'compact' || this.viewOptions.renderStyle === 'minimal' || this.lifecycleService.willShutdown) {
				return;
			}

			const numItems = this.viewModel?.getItems().length ?? 0;
			if (!numItems) {
				const defaultAgent = this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind);
				let additionalMessage: string | IMarkdownString | undefined;
				if (this.chatEntitlementService.anonymous && !this.chatEntitlementService.sentiment.installed) {
					const providers = product.defaultChatAgent.provider;
					additionalMessage = new MarkdownString(localize({ key: 'settings', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3}).", providers.default.name, providers.default.name, product.defaultChatAgent.termsStatementUrl, product.defaultChatAgent.privacyStatementUrl), { isTrusted: true });
				} else {
					additionalMessage = defaultAgent?.metadata.additionalWelcomeMessage;
				}
				if (!additionalMessage && !this._lockedAgent) {
					additionalMessage = this._getGenerateInstructionsMessage();
				}
				const welcomeContent = this.getWelcomeViewContent(additionalMessage);
				if (!this.welcomePart.value || this.welcomePart.value.needsRerender(welcomeContent)) {
					dom.clearNode(this.welcomeMessageContainer);

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
			}

			this.updateChatViewVisibility();
		} finally {
			this._isRenderingWelcome = false;
		}
	}

	private _getGenerateInstructionsMessage(): IMarkdownString {
		// Start checking for instruction files immediately if not already done
		if (!this._instructionFilesCheckPromise) {
			this._instructionFilesCheckPromise = this._checkForAgentInstructionFiles();
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

	/**
	 * Checks if any agent instruction files (.github/copilot-instructions.md or AGENTS.md) exist in the workspace.
	 * Used to determine whether to show the "Generate Agent Instructions" hint.
	 *
	 * @returns true if instruction files exist OR if instruction features are disabled (to hide the hint)
	 */
	private async _checkForAgentInstructionFiles(): Promise<boolean> {
		try {
			const useCopilotInstructionsFiles = this.configurationService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
			const useAgentMd = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
			if (!useCopilotInstructionsFiles && !useAgentMd) {
				// If both settings are disabled, return true to hide the hint (since the features aren't enabled)
				return true;
			}
			return (
				(await this.promptsService.listCopilotInstructionsMDs(CancellationToken.None)).length > 0 ||
				// Note: only checking for AGENTS.md files at the root folder, not ones in subfolders.
				(await this.promptsService.listAgentMDs(CancellationToken.None, false)).length > 0
			);
		} catch (error) {
			// On error, assume no instruction files exist to be safe
			this.logService.warn('[ChatWidget] Error checking for instruction files:', error);
			return false;
		}
	}

	private getWelcomeViewContent(additionalMessage: string | IMarkdownString | undefined): IChatViewWelcomeContent {
		if (this.isLockedToCodingAgent) {
			// Check for provider-specific customizations from chat sessions service
			const providerIcon = this._lockedAgent ? this.chatSessionsService.getIconForSessionType(this._lockedAgent.id) : undefined;
			const providerTitle = this._lockedAgent ? this.chatSessionsService.getWelcomeTitleForSessionType(this._lockedAgent.id) : undefined;
			const providerMessage = this._lockedAgent ? this.chatSessionsService.getWelcomeMessageForSessionType(this._lockedAgent.id) : undefined;

			// Fallback to default messages if provider doesn't specify
			const message = providerMessage
				? new MarkdownString(providerMessage)
				: (this._lockedAgent?.prefix === '@copilot '
					? new MarkdownString(localize('copilotCodingAgentMessage', "This chat session will be forwarded to the {0} [coding agent]({1}) where work is completed in the background. ", this._lockedAgent.prefix, 'https://aka.ms/coding-agent-docs') + DISCLAIMER, { isTrusted: true })
					: new MarkdownString(localize('genericCodingAgentMessage', "This chat session will be forwarded to the {0} coding agent where work is completed in the background. ", this._lockedAgent?.prefix) + DISCLAIMER));

			return {
				title: providerTitle ?? localize('codingAgentTitle', "Delegate to {0}", this._lockedAgent?.prefix),
				message,
				icon: providerIcon ?? Codicon.sendToRemoteAgent,
				additionalMessage,
				useLargeIcon: !!providerIcon,
			};
		}

		let title: string;
		if (this.input.currentModeKind === ChatModeKind.Ask) {
			title = localize('chatDescription', "Ask about your code");
		} else if (this.input.currentModeKind === ChatModeKind.Edit) {
			title = localize('editsTitle', "Edit in context");
		} else {
			title = localize('agentTitle', "Build with Agent");
		}

		return {
			title,
			message: new MarkdownString(DISCLAIMER),
			icon: Codicon.chatSparkle,
			additionalMessage,
			suggestedPrompts: this.getPromptFileSuggestions()
		};
	}

	private getPromptFileSuggestions(): IChatSuggestedPrompts[] {

		// Use predefined suggestions for new users
		if (!this.chatEntitlementService.sentiment.installed) {
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
			const commandLabel = localize('chatWidget.promptFile.commandLabel', "{0}", promptName);
			const uri = this.promptUriCache.get(promptName);
			const descriptionText = description?.trim() ? description : undefined;
			result.push({
				icon: Codicon.run,
				label: commandLabel,
				description: descriptionText,
				prompt: `/${promptName} `,
				uri: uri
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
			const promptCommands = await this.promptsService.getPromptSlashCommands(CancellationToken.None);

			let cacheUpdated = false;
			// Load descriptions only for the specified prompts
			for (const promptCommand of promptCommands) {
				if (promptNames.includes(promptCommand.name)) {
					const description = promptCommand.description;
					if (description) {
						this.promptDescriptionsCache.set(promptCommand.name, description);
						cacheUpdated = true;
					} else {
						// Set empty string to indicate we've checked this prompt
						this.promptDescriptionsCache.set(promptCommand.name, '');
						cacheUpdated = true;
					}
				}
			}

			// Fire event to trigger a re-render of the welcome view only if cache was updated
			if (cacheUpdated) {
				this.renderWelcomeViewContentIfNeeded();
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
	}

	private async renderFollowups(): Promise<void> {
		const lastItem = this.listWidget.lastItem;
		if (lastItem && isResponseVM(lastItem) && lastItem.isComplete) {
			this.input.renderFollowups(lastItem.replyFollowups, lastItem);
		} else {
			this.input.renderFollowups(undefined, undefined);
		}
	}

	private renderChatSuggestNextWidget(): void {
		if (this.lifecycleService.willShutdown) {
			return;
		}

		// Skip rendering in coding agent sessions
		if (this.isLockedToCodingAgent) {
			this.chatSuggestNextWidget.hide();
			return;
		}

		const items = this.viewModel?.getItems() ?? [];
		if (!items.length) {
			return;
		}

		const lastItem = items[items.length - 1];
		const lastResponseComplete = lastItem && isResponseVM(lastItem) && lastItem.isComplete;
		if (!lastResponseComplete) {
			return;
		}
		// Get the currently selected mode directly from the observable
		// Note: We use currentModeObs instead of currentModeKind because currentModeKind returns
		// the ChatModeKind enum (e.g., 'agent'), which doesn't distinguish between custom modes.
		// Custom modes all have kind='agent' but different IDs.
		const currentMode = this.input.currentModeObs.get();
		const handoffs = currentMode?.handOffs?.get();

		// Only show if: mode has handoffs AND chat has content AND not quick chat
		const shouldShow = currentMode && handoffs && handoffs.length > 0;

		if (shouldShow) {
			// Log telemetry only when widget transitions from hidden to visible
			const wasHidden = this.chatSuggestNextWidget.domNode.style.display === 'none';
			this.chatSuggestNextWidget.render(currentMode);

			if (wasHidden) {
				this.telemetryService.publicLog2<ChatHandoffWidgetShownEvent, ChatHandoffWidgetShownClassification>('chat.handoffWidgetShown', {
					agent: currentMode.id,
					handoffCount: handoffs.length
				});
			}
		} else {
			this.chatSuggestNextWidget.hide();
		}

		// Trigger layout update
		if (this.bodyDimension) {
			this.layout(this.bodyDimension.height, this.bodyDimension.width);
		}
	}

	private handleNextPromptSelection(handoff: IHandOff, agentId?: string): void {
		// Hide the widget after selection
		this.chatSuggestNextWidget.hide();

		const promptToUse = handoff.prompt;

		// Log telemetry
		const currentMode = this.input.currentModeObs.get();
		const fromAgent = currentMode?.id ?? '';
		this.telemetryService.publicLog2<ChatHandoffClickEvent, ChatHandoffClickClassification>('chat.handoffClicked', {
			fromAgent: fromAgent,
			toAgent: agentId || handoff.agent || '',
			hasPrompt: Boolean(promptToUse),
			autoSend: Boolean(handoff.send)
		});

		// If agentId is provided (from chevron dropdown), delegate to that chat session
		// Otherwise, switch to the handoff agent
		if (agentId) {
			// Delegate to chat session (e.g., @background or @cloud)
			this.input.setValue(`@${agentId} ${promptToUse}`, false);
			this.input.focus();
			// Auto-submit for delegated chat sessions
			this.acceptInput().catch(e => this.logService.error('Failed to handle handoff continueOn', e));
		} else if (handoff.agent) {
			// Regular handoff to specified agent
			this._switchToAgentByName(handoff.agent);
			// Switch to the specified model if provided
			if (handoff.model) {
				this.input.switchModelByQualifiedName([handoff.model]);
			}
			// Insert the handoff prompt into the input
			this.input.setValue(promptToUse, false);
			this.input.focus();

			// Auto-submit if send flag is true
			if (handoff.send) {
				this.acceptInput();
			}
		}
	}

	async handleDelegationExitIfNeeded(sourceAgent: Pick<IChatAgentData, 'id' | 'name'> | undefined, targetAgent: IChatAgentData | undefined): Promise<void> {
		if (!this._shouldExitAfterDelegation(sourceAgent, targetAgent)) {
			return;
		}

		this.logService.debug(`[Delegation] Will exit after delegation: sourceAgent=${sourceAgent?.id}, targetAgent=${targetAgent?.id}`);
		try {
			await this._handleDelegationExit();
		} catch (e) {
			this.logService.error('[Delegation] Failed to handle delegation exit', e);
		}
	}

	private _shouldExitAfterDelegation(sourceAgent: Pick<IChatAgentData, 'id' | 'name'> | undefined, targetAgent: IChatAgentData | undefined): boolean {
		if (!targetAgent) {
			this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (no targetAgent)');
			return false;
		}

		if (!this.configurationService.getValue<boolean>(ChatConfiguration.ExitAfterDelegation)) {
			this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (ExitAfterDelegation config disabled)');
			return false;
		}

		// Never exit if the source and target are the same (that means that you're providing a follow up, etc.)
		// NOTE: sourceAgent would be the chatWidget's 'lockedAgent'
		if (sourceAgent && sourceAgent.id === targetAgent.id) {
			this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (source and target agents are the same)');
			return false;
		}

		if (!isIChatViewViewContext(this.viewContext)) {
			this.logService.debug('[Delegation] _shouldExitAfterDelegation: false (not in chat view context)');
			return false;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(targetAgent.id);
		if (!contribution) {
			this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (no contribution found for targetAgent.id=${targetAgent.id})`);
			return false;
		}

		if (contribution.canDelegate !== true) {
			this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (contribution.canDelegate=${contribution.canDelegate}, expected true)`);
			return false;
		}

		this.logService.debug('[Delegation] _shouldExitAfterDelegation: true');
		return true;
	}

	/**
	 * Handles the exit of the panel chat when a delegation to another session occurs.
	 * Waits for the response to complete and any pending confirmations to be resolved,
	 * then clears the widget unless the final message is an error.
	 */
	private async _handleDelegationExit(): Promise<void> {
		const viewModel = this.viewModel;
		if (!viewModel) {
			this.logService.debug('[Delegation] _handleDelegationExit: no viewModel, returning');
			return;
		}

		const parentSessionResource = viewModel.sessionResource;
		this.logService.debug(`[Delegation] _handleDelegationExit: parentSessionResource=${parentSessionResource.toString()}`);

		// Check if response is complete, not pending confirmation, and has no error
		const checkIfShouldClear = (): boolean => {
			const items = viewModel.getItems();
			const lastItem = items[items.length - 1];
			if (lastItem && isResponseVM(lastItem) && lastItem.model && lastItem.isComplete && !lastItem.model.isPendingConfirmation.get()) {
				const hasError = Boolean(lastItem.result?.errorDetails);
				return !hasError;
			}
			return false;
		};

		if (checkIfShouldClear()) {
			this.logService.debug('[Delegation] Response complete, archiving session before clearing');
			// Archive BEFORE clearing to ensure session still exists in agentSessionsService
			await this.archiveLocalParentSession(parentSessionResource);
			await this.clear();
			return;
		}

		this.logService.debug('[Delegation] Waiting for response to complete...');
		const shouldClear = await new Promise<boolean>(resolve => {
			const disposable = viewModel.onDidChange(() => {
				const result = checkIfShouldClear();
				if (result) {
					cleanup();
					resolve(true);
				}
			});
			const timeout = setTimeout(() => {
				this.logService.debug('[Delegation] Timeout waiting for response to complete');
				cleanup();
				resolve(false);
			}, 30_000); // 30 second timeout
			const cleanup = () => {
				clearTimeout(timeout);
				disposable.dispose();
			};
		});

		if (shouldClear) {
			this.logService.debug('[Delegation] Response completed, archiving session before clearing');
			await this.archiveLocalParentSession(parentSessionResource);
			await this.clear();
		} else {
			this.logService.debug('[Delegation] Not clearing (timeout or error)');
		}
	}

	private async archiveLocalParentSession(sessionResource: URI): Promise<void> {
		if (sessionResource.scheme !== Schemas.vscodeLocalChatSession) {
			this.logService.debug(`[Delegation] archiveLocalParentSession: skipping, scheme=${sessionResource.scheme} is not vscodeLocalChatSession`);
			return;
		}

		this.logService.debug(`[Delegation] archiveLocalParentSession: archiving session ${sessionResource.toString()}`);

		// Implicitly keep parent session's changes as they've now been delegated to the new agent.
		await this.chatService.getSession(sessionResource)?.editingSession?.accept();

		const session = this.agentSessionsService.getSession(sessionResource);
		if (session) {
			session.setArchived(true);
			this.logService.debug('[Delegation] archiveLocalParentSession: session archived successfully');
		} else {
			this.logService.warn(`[Delegation] archiveLocalParentSession: session not found in agentSessionsService for ${sessionResource.toString()}`);
		}
	}

	setVisible(visible: boolean): void {
		const wasVisible = this._visible;
		this._visible = visible;
		this.visibleChangeCount++;
		this.listWidget.setVisible(visible);
		this.input.setVisible(visible);

		if (visible) {
			if (!wasVisible) {
				this.visibilityTimeoutDisposable.value = disposableTimeout(() => {
					// Progressive rendering paused while hidden, so start it up again.
					// Do it after a timeout because the container is not visible yet (it should be but offsetHeight returns 0 here)
					if (this._visible) {
						this.onDidChangeItems(true);
					}
				}, 0);

				this.visibilityAnimationFrameDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
					this._onDidShow.fire();
				});
			}
		} else if (wasVisible) {
			this._onDidHide.fire();
		}
	}

	private createList(listContainer: HTMLElement, options: IChatListItemRendererOptions): void {
		// Create a dom element to hold UI from editor widgets embedded in chat messages
		const overflowWidgetsContainer = document.createElement('div');
		overflowWidgetsContainer.classList.add('chat-overflow-widget-container', 'monaco-editor');
		listContainer.append(overflowWidgetsContainer);

		// Create chat list widget
		this.listWidget = this._register(this.instantiationService.createInstance(
			ChatListWidget,
			listContainer,
			{
				rendererOptions: options,
				renderStyle: this.viewOptions.renderStyle,
				defaultElementHeight: this.viewOptions.defaultElementHeight ?? 200,
				overflowWidgetsDomNode: overflowWidgetsContainer,
				styles: {
					listForeground: this.styles.listForeground,
					listBackground: this.styles.listBackground,
				},
				currentChatMode: () => this.input.currentModeKind,
				filter: this.viewOptions.filter ? { filter: this.viewOptions.filter.bind(this.viewOptions) } : undefined,
				codeBlockModelCollection: this._codeBlockModelCollection,
				viewModel: this.viewModel,
				editorOptions: this.editorOptions,
				location: this.location,
				getCurrentLanguageModelId: () => this.input.currentLanguageModel,
				getCurrentModeInfo: () => this.input.currentModeInfo,
			}
		));

		// Wire up ChatWidget-specific list widget events
		this._register(this.listWidget.onDidClickRequest(async item => {
			this.clickedRequest(item);
		}));

		this._register(this.listWidget.onDidRerender(item => {
			if (isRequestVM(item.currentElement) && this.configurationService.getValue<string>('chat.editRequests') !== 'input') {
				if (!item.rowContainer.contains(this.inputContainer)) {
					item.rowContainer.appendChild(this.inputContainer);
				}
				this.input.focus();
			}
		}));

		this._register(this.listWidget.onDidDispose(() => {
			this.focusedInputDOM.appendChild(this.inputContainer);
			this.input.focus();
		}));

		this._register(this.listWidget.onDidFocusOutside(() => {
			this.finishedEditing();
		}));

		this._register(this.listWidget.onDidClickFollowup(item => {
			// is this used anymore?
			this.acceptInput(item.message);
		}));

		this._register(this.listWidget.onDidChangeContentHeight(() => {
			this._onDidChangeContentHeight.fire();
		}));

		this._register(this.listWidget.onDidFocus(() => {
			this._onDidFocus.fire();
		}));
		this._register(this.listWidget.onDidScroll(() => {
			this._onDidScroll.fire();
		}));
	}

	startEditing(requestId: string): void {
		const editedRequest = this.listWidget.getTemplateDataForRequestId(requestId);
		if (editedRequest) {
			this.clickedRequest(editedRequest);
		}
	}

	private clickedRequest(item: IChatListItemTemplate) {

		const currentElement = item.currentElement;
		if (isRequestVM(currentElement) && !this.viewModel?.editing) {

			const requests = this.viewModel?.model.getRequests();
			if (!requests || !this.viewModel?.sessionResource) {
				return;
			}

			// this will only ever be true if we restored a checkpoint
			if (this.viewModel?.model.checkpoint) {
				this.recentlyRestoredCheckpoint = true;
			}

			this.viewModel?.model.setCheckpoint(currentElement.id);

			// set contexts and request to false
			const currentContext: IChatRequestVariableEntry[] = [];
			const addedContextIds = new Set<string>();
			const addToContext = (entry: IChatRequestVariableEntry) => {
				if (addedContextIds.has(entry.id) || isWorkspaceVariableEntry(entry)) {
					return;
				}
				if ((isPromptFileVariableEntry(entry) || isPromptTextVariableEntry(entry)) && entry.automaticallyAdded) {
					return;
				}
				addedContextIds.add(entry.id);
				currentContext.push(entry);
			};
			for (let i = requests.length - 1; i >= 0; i -= 1) {
				const request = requests[i];
				if (request.id === currentElement.id) {
					request.setShouldBeBlocked(false); // unblocking just this request.
					request.attachedContext?.forEach(addToContext);
					currentElement.variables.forEach(addToContext);
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
				this.input.setChatMode(this.inputPart.currentModeObs.get().id);
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
					this.listWidget.scrollToCurrentItem(currentElement);
				}));

				this._register(this.inlineInputPart.inputEditor.onDidChangeCursorSelection((e) => {
					this.listWidget.scrollToCurrentItem(currentElement);
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
		const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
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
			this.inputPart.setChatMode(this.input.currentModeObs.get().id);
			const currentModel = this.input.selectedLanguageModel.get();
			if (currentModel) {
				this.inputPart.switchModel(currentModel.metadata);
			}

			this.inputPart?.toggleChatInputOverlay(false);
			try {
				if (editedRequest?.rowContainer?.contains(this.inputContainer)) {
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

	private getWidgetViewKindTag(): string {
		if (!this.viewContext) {
			return 'editor';
		} else if (isIChatViewViewContext(this.viewContext)) {
			return 'view';
		} else {
			return 'quick';
		}
	}

	private createInput(container: HTMLElement, options?: { renderFollowups: boolean; renderStyle?: 'compact' | 'minimal'; renderInputToolbarBelowInput?: boolean }): void {
		const commonConfig: IChatInputPartOptions = {
			renderFollowups: options?.renderFollowups ?? true,
			renderStyle: options?.renderStyle === 'minimal' ? 'compact' : options?.renderStyle,
			renderInputToolbarBelowInput: options?.renderInputToolbarBelowInput ?? false,
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
			defaultMode: this.viewOptions.defaultMode,
			sessionTypePickerDelegate: this.viewOptions.sessionTypePickerDelegate,
			workspacePickerDelegate: this.viewOptions.workspacePickerDelegate,
		};

		if (this.viewModel?.editing) {
			const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editedRequest?.contextKeyService])));
			this.inlineInputPartDisposable.value = scopedInstantiationService.createInstance(ChatInputPart,
				this.location,
				commonConfig,
				this.styles,
				true
			);
		} else {
			this.inputPartDisposable.value = this.instantiationService.createInstance(ChatInputPart,
				this.location,
				commonConfig,
				this.styles,
				false
			);
			this._register(autorun(reader => {
				this.inputPart.height.read(reader);
				if (!this.listWidget) {
					// This is set up before the list/renderer are created
					return;
				}

				if (this.bodyDimension) {
					this.layout(this.bodyDimension.height, this.bodyDimension.width);
				}

				this._onDidChangeContentHeight.fire();
			}));
		}

		this.input.render(container, '', this);
		if (this.bodyDimension?.width) {
			this.input.layout(this.bodyDimension.width);
		}

		this._register(this.input.onDidLoadInputState(() => {
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
				sessionResource: this.viewModel.sessionResource,
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
			this.renderChatSuggestNextWidget();
		}));

		this._register(autorun(r => {
			const toolSetIds = new Set<string>();
			const toolIds = new Set<string>();
			for (const [entry, enabled] of this.input.selectedToolsModel.entriesMap.read(r)) {
				if (enabled) {
					if (isToolSet(entry)) {
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


	setModel(model: IChatModel | undefined): void {
		if (!this.container) {
			throw new Error('Call render() before setModel()');
		}

		if (!model) {
			if (this.viewModel?.editing) {
				this.finishedEditing();
			}
			this.viewModel = undefined;
			this.onDidChangeItems();
			return;
		}

		if (isEqual(model.sessionResource, this.viewModel?.sessionResource)) {
			return;
		}

		if (this.viewModel?.editing) {
			this.finishedEditing();
		}
		this.inputPart.clearTodoListWidget(model.sessionResource, false);
		this.chatSuggestNextWidget.hide();

		this._codeBlockModelCollection.clear();

		this.container.setAttribute('data-session-id', model.sessionId);
		this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, this._codeBlockModelCollection, undefined);

		// Pass input model reference to input part for state syncing
		this.inputPart.setInputModel(model.inputModel, model.getRequests().length === 0);
		this.listWidget.setViewModel(this.viewModel);

		if (this._lockedAgent) {
			let placeholder = this.chatSessionsService.getInputPlaceholderForSessionType(this._lockedAgent.id);
			if (!placeholder) {
				placeholder = localize('chat.input.placeholder.lockedToAgent', "Chat with {0}", this._lockedAgent.id);
			}
			this.viewModel.setInputPlaceholder(placeholder);
			this.inputEditor.updateOptions({ placeholder });
		} else if (this.viewModel.inputPlaceholder) {
			this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
		}

		const renderImmediately = this.configurationService.getValue<boolean>('chat.experimental.renderMarkdownImmediately');
		const delay = renderImmediately ? MicrotaskDelay : 0;
		this.viewModelDisposables.add(Event.runAndSubscribe(Event.accumulate(this.viewModel.onDidChange, delay), (events => {
			if (!this.viewModel || this._store.isDisposed) {
				// See https://github.com/microsoft/vscode/issues/278969
				return;
			}

			this.requestInProgress.set(this.viewModel.model.requestInProgress.get());

			// Update the editor's placeholder text when it changes in the view model
			if (events?.some(e => e?.kind === 'changePlaceholder')) {
				this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
			}

			this.onDidChangeItems();
			if (events?.some(e => e?.kind === 'addRequest') && this.visible) {
				this.listWidget.scrollToEnd();
			}
		})));
		this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
			// Ensure that view state is saved here, because we will load it again when a new model is assigned
			if (this.viewModel?.editing) {
				this.finishedEditing();
			}
			// Disposes the viewmodel and listeners
			this.viewModel = undefined;
			this.onDidChangeItems();
		}));
		this._sessionIsEmptyContextKey.set(model.getRequests().length === 0);

		this.refreshParsedInput();
		this.viewModelDisposables.add(model.onDidChange((e) => {
			if (e.kind === 'setAgent') {
				this._onDidChangeAgent.fire({ agent: e.agent, slashCommand: e.command });
				// Update capabilities context keys when agent changes
				this._updateAgentCapabilitiesContextKeys(e.agent);
			}
			if (e.kind === 'addRequest') {
				this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, false);
				this._sessionIsEmptyContextKey.set(false);
			}
			// Hide widget on request removal
			if (e.kind === 'removeRequest') {
				this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, true);
				this.chatSuggestNextWidget.hide();
				this._sessionIsEmptyContextKey.set((this.viewModel?.model.getRequests().length ?? 0) === 0);
			}
			// Show next steps widget when response completes (not when request starts)
			if (e.kind === 'completedRequest') {
				const lastRequest = this.viewModel?.model.getRequests().at(-1);
				const wasCancelled = lastRequest?.response?.isCanceled ?? false;
				if (wasCancelled) {
					// Clear todo list when request is cancelled
					this.inputPart.clearTodoListWidget(this.viewModel?.sessionResource, true);
				}
				// Only show if response wasn't canceled
				this.renderChatSuggestNextWidget();

				// Mark the session as read when the request completes and the widget is visible
				if (this.visible && this.viewModel?.sessionResource) {
					this.agentSessionsService.getSession(this.viewModel.sessionResource)?.setRead(true);
				}
			}
		}));

		if (this.listWidget && this.visible) {
			this.onDidChangeItems();
			this.listWidget.scrollToEnd();
		}

		this.updateChatInputContext();
		this.input.renderChatTodoListWidget(this.viewModel.sessionResource);
	}

	getFocus(): ChatTreeItem | undefined {
		return this.listWidget.getFocus()[0] ?? undefined;
	}

	reveal(item: ChatTreeItem, relativeTop?: number): void {
		this.listWidget.reveal(item, relativeTop);
	}

	focus(item: ChatTreeItem): void {
		if (!this.listWidget.hasElement(item)) {
			return;
		}

		this.listWidget.focusItem(item);
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

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined {
		return this.contribs.find(c => c.id === id) as T | undefined;
	}

	// Coding agent locking methods
	lockToCodingAgent(name: string, displayName: string, agentId: string): void {
		this._lockedAgent = {
			id: agentId,
			name,
			prefix: `@${name} `,
			displayName
		};
		this._lockedToCodingAgentContextKey.set(true);
		this.renderWelcomeViewContentIfNeeded();
		// Update capabilities for the locked agent
		const agent = this.chatAgentService.getAgent(agentId);
		this._updateAgentCapabilitiesContextKeys(agent);
		this.listWidget?.updateRendererOptions({ restorable: false, editable: false, noFooter: true, progressMessageAtBottomOfResponse: true });
		if (this.visible) {
			this.listWidget?.rerender();
		}
	}

	unlockFromCodingAgent(): void {
		// Clear all state related to locking
		this._lockedAgent = undefined;
		this._lockedToCodingAgentContextKey.set(false);
		this._updateAgentCapabilitiesContextKeys(undefined);

		// Explicitly update the DOM to reflect unlocked state
		this.renderWelcomeViewContentIfNeeded();

		// Reset to default placeholder
		if (this.viewModel) {
			this.viewModel.resetInputPlaceholder();
		}
		this.inputEditor?.updateOptions({ placeholder: undefined });
		this.listWidget?.updateRendererOptions({ restorable: true, editable: true, noFooter: false, progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask });
		if (this.visible) {
			this.listWidget?.rerender();
		}
	}

	get isLockedToCodingAgent(): boolean {
		return !!this._lockedAgent;
	}

	get lockedAgentId(): string | undefined {
		return this._lockedAgent?.id;
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

		const sessionResource = this.viewModel.sessionResource;
		const lastRequest = this.chatService.getSession(sessionResource)?.getRequests().at(-1);
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

	private async _applyPromptFileIfSet(requestInput: IChatRequestInputOptions): Promise<void> {
		// first check if the input has a prompt slash command
		const agentSlashPromptPart = this.parsedInput.parts.find((r): r is ChatRequestSlashPromptPart => r instanceof ChatRequestSlashPromptPart);
		if (!agentSlashPromptPart) {
			return;
		}

		// need to resolve the slash command to get the prompt file
		const slashCommand = await this.promptsService.resolvePromptSlashCommand(agentSlashPromptPart.name, CancellationToken.None);
		if (!slashCommand) {
			return;
		}
		const parseResult = slashCommand.parsedPromptFile;
		// add the prompt file to the context
		const refs = parseResult.body?.variableReferences.map(({ name, offset }) => ({ name, range: new OffsetRange(offset, offset + name.length + 1) })) ?? [];
		const toolReferences = this.toolsService.toToolReferences(refs);
		requestInput.attachedContext.insertFirst(toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, undefined, true, toolReferences));

		// remove the slash command from the input
		requestInput.input = this.parsedInput.parts.filter(part => !(part instanceof ChatRequestSlashPromptPart)).map(part => part.text).join('').trim();

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

	private async _acceptInput(query: { query: string } | undefined, options: IChatAcceptInputOptions = {}): Promise<IChatResponseModel | undefined> {
		if (this.viewModel?.model.requestInProgress.get()) {
			options.queue ??= ChatRequestQueueKind.Queued;
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

		while (!this._viewModel && !this._store.isDisposed) {
			await Event.toPromise(this.onDidChangeViewModel, this._store);
		}

		if (!this.viewModel) {
			return;
		}

		// Check if a custom submit handler wants to handle this submission
		if (this.viewOptions.submitHandler) {
			const inputValue = !query ? this.getInput() : query.query;
			const handled = await this.viewOptions.submitHandler(inputValue, this.input.currentModeKind);
			if (handled) {
				return;
			}
		}

		this._onDidAcceptInput.fire();
		this.listWidget.setScrollLock(this.isLockedToCodingAgent || !!checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll));

		const editorValue = this.getInput();
		const requestInputs: IChatRequestInputOptions = {
			input: !query ? editorValue : query.query,
			attachedContext: options?.enableImplicitContext === false ? this.input.getAttachedContext(this.viewModel.sessionResource) : this.input.getAttachedAndImplicitContext(this.viewModel.sessionResource),
		};

		const isUserQuery = !query;

		if (this.viewModel?.editing) {
			this.finishedEditing(true);
			this.viewModel.model?.setCheckpoint(undefined);
		}

		// process the prompt command
		await this._applyPromptFileIfSet(requestInputs);
		await this._autoAttachInstructions(requestInputs);

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

		this.input.validateAgentMode();

		if (this.viewModel.model.checkpoint) {
			const requests = this.viewModel.model.getRequests();
			for (let i = requests.length - 1; i >= 0; i -= 1) {
				const request = requests[i];
				if (request.shouldBeBlocked) {
					this.chatService.removeRequest(this.viewModel.sessionResource, request.id);
				}
			}
		}
		if (this.viewModel.sessionResource && !options.queue) {
			// todo@connor4312: move chatAccessibilityService.acceptRequest to a refcount model to handle queue messages
			this.chatAccessibilityService.acceptRequest(this._viewModel!.sessionResource);
		}

		const result = await this.chatService.sendRequest(this.viewModel.sessionResource, requestInputs.input, {
			userSelectedModelId: this.input.currentLanguageModel,
			location: this.location,
			locationData: this._location.resolveData?.(),
			parserContext: { selectedAgent: this._lastSelectedAgent, mode: this.input.currentModeKind },
			attachedContext: requestInputs.attachedContext.asArray(),
			noCommandDetection: options?.noCommandDetection,
			...this.getModeRequestOptions(),
			modeInfo: this.input.currentModeInfo,
			agentIdSilent: this._lockedAgent?.id,
			queue: options?.queue,
		});

		if (this.viewModel.sessionResource && !options.queue) {
			this.chatAccessibilityService.disposeRequest(this.viewModel.sessionResource);
		}

		if (ChatSendResult.isRejected(result)) {
			return;
		}

		// visibility sync before firing events to hide the welcome view
		this.updateChatViewVisibility();
		this.input.acceptInput(options?.storeToHistory ?? isUserQuery);

		const sent = ChatSendResult.isQueued(result) ? await result.deferred : result;
		if (!ChatSendResult.isSent(sent)) {
			return;
		}

		this._onDidSubmitAgent.fire({ agent: sent.data.agent, slashCommand: sent.data.slashCommand });
		this.handleDelegationExitIfNeeded(this._lockedAgent, sent.data.agent);
		sent.data.responseCompletePromise.then(() => {
			const responses = this.viewModel?.getItems().filter(isResponseVM);
			const lastResponse = responses?.[responses.length - 1];
			this.chatAccessibilityService.acceptResponse(this, this.container, lastResponse, this.viewModel?.sessionResource, options?.isVoiceInput);
			if (lastResponse?.result?.nextQuestion) {
				const { prompt, participant, command } = lastResponse.result.nextQuestion;
				const question = formatChatQuestion(this.chatAgentService, this.location, prompt, participant, command);
				if (question) {
					this.input.setValue(question, false);
				}
			}
		});

		return sent.data.responseCreatedPromise;
	}

	getModeRequestOptions(): Partial<IChatSendRequestOptions> {
		return {
			modeInfo: this.input.currentModeInfo,
			userSelectedTools: this.input.selectedToolsModel.userSelectedTools,
		};
	}

	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[] {
		return this.listWidget.getCodeBlockInfosForResponse(response);
	}

	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined {
		return this.listWidget.getCodeBlockInfoForEditor(uri);
	}

	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[] {
		return this.listWidget.getFileTreeInfosForResponse(response);
	}

	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined {
		return this.listWidget.getLastFocusedFileTreeForResponse(response);
	}

	focusResponseItem(lastFocused?: boolean): void {
		this.listWidget.focusLastItem(lastFocused);
	}

	layout(height: number, width: number): void {
		width = Math.min(width, this.viewOptions.renderStyle === 'minimal' ? width : 950); // no min width of inline chat

		this.bodyDimension = new dom.Dimension(width, height);

		if (this.viewModel?.editing) {
			this.inlineInputPart?.layout(width);
		}

		this.inputPart.layout(width);

		const inputHeight = this.inputPart.height.get();
		const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
		const lastElementVisible = this.listWidget.isScrolledToBottom;
		const lastItem = this.listWidget.lastItem;

		const contentHeight = Math.max(0, height - inputHeight - chatSuggestNextWidgetHeight);
		this.listWidget.layout(contentHeight, width);

		this.welcomeMessageContainer.style.height = `${contentHeight}px`;

		const lastResponseIsRendering = isResponseVM(lastItem) && lastItem.renderData;
		if (lastElementVisible && (!lastResponseIsRendering || checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll))) {
			this.listWidget.scrollToEnd();
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
		this._register(this.listWidget.onDidChangeItemHeight(() => this.layoutDynamicChatTreeItemMode()));

		const mutableDisposable = this._register(new MutableDisposable());
		this._register(this.listWidget.onDidScroll((e) => {
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
				this.input.layout(width);
				const inputPartHeight = this.input.height.get();
				const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
				const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - inputPartHeight - chatSuggestNextWidgetHeight);
				this.layout(newHeight + inputPartHeight + chatSuggestNextWidgetHeight, width);
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
		this.input.layout(width);
		const inputHeight = this.input.height.get();
		const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;

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
				inputHeight + chatSuggestNextWidgetHeight + listHeight + (totalMessages.length > 2 ? 18 : 0),
				this._dynamicMessageLayoutData.maxHeight
			),
			width
		);

		if (needsRerender || !listHeight) {
			this.listWidget.scrollToEnd();
		}
	}

	saveState(): void {
		// no-op
	}

	getViewState(): IChatModelInputState | undefined {
		return this.input.getCurrentInputState();
	}

	private updateChatInputContext() {
		const currentAgent = this.parsedInput.parts.find(part => part instanceof ChatRequestAgentPart);
		this.agentInInput.set(!!currentAgent);
	}

	private async _switchToAgentByName(agentName: string): Promise<void> {
		const currentAgent = this.input.currentModeObs.get();

		// switch to appropriate agent if needed
		if (agentName !== currentAgent.name.get()) {
			// Find the mode object to get its kind
			const agent = this.chatModeService.findModeByName(agentName);
			if (agent) {
				if (currentAgent.kind !== agent.kind) {
					const chatModeCheck = await this.instantiationService.invokeFunction(handleModeSwitch, currentAgent.kind, agent.kind, this.viewModel?.model.getRequests().length ?? 0, this.viewModel?.model);
					if (!chatModeCheck) {
						return;
					}

					if (chatModeCheck.needToClearSession) {
						await this.clear();
					}
				}
				this.input.setChatMode(agent.id);
			}
		}
	}

	private async _applyPromptMetadata({ agent, tools, model }: PromptHeader, requestInput: IChatRequestInputOptions): Promise<void> {

		if (tools !== undefined && !agent && this.input.currentModeKind !== ChatModeKind.Agent) {
			agent = ChatMode.Agent.name.get();
		}
		// switch to appropriate agent if needed
		if (agent) {
			this._switchToAgentByName(agent);
		}

		// if not tools to enable are present, we are done
		if (tools !== undefined && this.input.currentModeKind === ChatModeKind.Agent) {
			const enablementMap = this.toolsService.toToolAndToolSetEnablementMap(tools, Target.VSCode, this.input.selectedLanguageModel.get()?.metadata);
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
		this.logService.debug(`ChatWidget#_autoAttachInstructions: prompt files are always enabled`);
		const enabledTools = this.input.currentModeKind === ChatModeKind.Agent ? this.input.selectedToolsModel.userSelectedTools.get() : undefined;
		const enabledSubAgents = this.input.currentModeKind === ChatModeKind.Agent ? this.input.currentModeObs.get().agents?.get() : undefined;
		const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, this.input.currentModeKind, enabledTools, enabledSubAgents);
		await computer.collect(attachedContext, CancellationToken.None);
	}

	delegateScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent): void {
		this.listWidget.delegateScrollFromMouseWheelEvent(browserEvent);
	}
}

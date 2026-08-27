/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chat.css';
import './media/chatAgentHover.css';
import './media/chatViewWelcome.css';
import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { IMouseWheelEvent } from '../../../../../base/browser/mouseEvent.js';
import { disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { hash } from '../../../../../base/common/hash.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, thenIfNotDisposed, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { filter } from '../../../../../base/common/objects.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { extUri, isEqual } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatPerfMark, clearChatMarks, markChat } from '../../common/chatPerf.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';

import { ITextResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../../platform/product/common/product.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { SaveReason } from '../../../../common/editor.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { checkModeOption } from '../../common/chat.js';
import { IChatAgentAttachmentCapabilities, IChatAgentCommand, IChatAgentData, IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, inChatEditingSessionContextKey, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { IChatLayoutService } from '../../common/widget/chatLayoutService.js';
import { IChatModel, IChatModelInputState, IChatResponseModel, logChangesToStateModel } from '../../common/model/chatModel.js';
import { ChatMode, getModeNameForTelemetry, IChatMode } from '../../common/chatModes.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestToolPart, ChatRequestToolSetPart, chatSubcommandLeader, formatChatQuestion, IParsedChatRequest } from '../../common/requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../../common/requestParser/chatRequestParser.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../attachments/chatVariables.js';
import { ChatWidgetPasteTarget } from '../attachments/chatWidgetPasteTarget.js';
import { ChatRequestQueueKind, ChatSendResult, ChatSendResultSent, IChatLocationData, IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { IChatSlashCommandService } from '../../common/participants/chatSlashCommands.js';
import { IChatTodoListService } from '../../common/tools/chatTodoListService.js';
import { ChatRequestVariableSet, IChatRequestTranscriptContextVariableEntry, IChatRequestVariableEntry, isPastedTextArtifact, isPromptFileVariableEntry, isPromptTextVariableEntry, isWorkspaceVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatMessageRole, IChatMessage } from '../../common/languageModels.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, IResolvedNewChatSessionType, ThinkingDisplayMode } from '../../common/constants.js';
import { IChatGoalSummaryService } from '../chatGoalSummaryService.js';
import { ILanguageModelToolsService, isToolSet } from '../../common/tools/languageModelToolsService.js';
import { IHandOff, PromptHeader } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, handleModeSwitch } from '../actions/chatActions.js';
import { ChatTreeItem, IChatAcceptInputOptions, IChatAccessibilityService, IChatCodeBlockInfo, IChatFileTreeInfo, IChatFindController, IChatListItemRendererOptions, IChatPasteTargetService, IChatWidget, IChatWidgetService, IChatWidgetViewContext, IChatWidgetViewModelChangeEvent, IChatWidgetViewOptions, IChatWidgetViewState, isIChatResourceViewContext, isIChatViewViewContext } from '../chat.js';
import { ChatAttachmentModel } from '../attachments/chatAttachmentModel.js';
import { IChatAttachmentResolveService } from '../attachments/chatAttachmentResolveService.js';
import { ChatDynamicVariableModel } from '../attachments/chatDynamicVariables.js';
import { ChatAttachmentsContentPart } from './chatContentParts/chatAttachmentsContentPart.js';
import { ChatSuggestNextWidget } from './chatContentParts/chatSuggestNextWidget.js';
import { resolveEditedRequestSelection } from './input/chatInputModelUtils.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from './input/chatInputPart.js';
import { setChatInputStackInputWorking } from './input/chatInputStack.js';
import { IChatListItemTemplate } from './chatListRenderer.js';
import { ChatListWidget } from './chatListWidget.js';
import { ChatFindWidget, IChatFindHost } from './chatFind/chatFindWidget.js';
import { ChatEditorOptions } from './chatOptions.js';
import { ChatViewWelcomePart, IChatViewWelcomeContent } from '../viewsWelcome/chatViewWelcomeController.js';
import { hasImmutablePrimaryWorkingDirectory, resolveFolderPickerDecisionUpdate, IAgentHostNewSessionFolderService } from '../agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatTipService } from '../chatTipService.js';
import { ChatInputTipPresenter } from './input/chatInputTipPresenter.js';
import { ChatProgressSubPart } from './chatContentParts/chatProgressContentPart.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { CHAT_READ_ONLY_BANNER_HEIGHT, ChatReadOnlyBanner } from './chatReadOnlyBanner.js';
import { IChatSubmitRequestHandlerService } from '../chatSubmitRequestHandlerService.js';
import { shouldReserveChatPetSpace } from './chatPetWidget.js';
import { IChatPetWidgetService } from './chatPetWidgetService.js';
import { IChatPetService } from '../chatPetService.js';
import { ChatPetAchievementIds, hasChatPetImageAttachment } from '../chatPetAchievements.js';
import { stopDictationForEditor } from '../speechToText/dictationSession.js';
import { ChatContentMarkdownRenderer } from './chatContentMarkdownRenderer.js';

const $ = dom.$;

/**
 * Total horizontal padding of a chat item in the agents window (`.interactive-item-container`,
 * `padding: 0 32px` in sessions `style.css`). Reserved when laying out embedded editors so code
 * blocks match the rendered content width. See {@link IChatListItemRendererOptions.contentHorizontalPadding}.
 */
const SESSIONS_CHAT_ITEM_HORIZONTAL_PADDING = 64;

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

/** Whether the widget is a short-lived, single-task chat surface. */
function isTransientChat(widget: IChatWidget): boolean {
	return widget.location !== ChatAgentLocation.Chat || isInlineChat(widget) || isQuickChat(widget);
}

export function getImmediateSilentSlashCommandPart(parsedRequest: IParsedChatRequest): ChatRequestSlashCommandPart | undefined {
	return parsedRequest.parts.find((part): part is ChatRequestSlashCommandPart =>
		part instanceof ChatRequestSlashCommandPart
		&& part.range.start === 0
		&& part.slashCommand.executeImmediately === true
		&& part.slashCommand.silent === true
	);
}

export function shouldShowChatWelcome(itemCount: number | undefined, hasTranscriptOverlay: boolean): boolean | undefined {
	if (itemCount === undefined && !hasTranscriptOverlay) {
		return undefined;
	}
	return itemCount === 0 && !hasTranscriptOverlay;
}

export function shouldShowChatTip(itemCount: number | undefined, hasTranscriptOverlay: boolean, isLoading: boolean): boolean {
	return !isLoading && shouldShowChatWelcome(itemCount, hasTranscriptOverlay) === true;
}

export async function saveAllBeforeChatSend(configurationService: IConfigurationService, editorService: IEditorService): Promise<void> {
	if (configurationService.getValue<boolean>(ChatConfiguration.SaveBeforeSend) !== false) {
		await editorService.saveAll({ includeUntitled: false, reason: SaveReason.EXPLICIT });
	}
}

/**
 * Settles the outcome of a `IChatService.sendRequest` call.
 *
 * A request that could not be handed over to the chat service is never accepted. Anything else is
 * accepted right away — a queued request is accepted the moment it enters the queue, which is
 * potentially long before it runs — so {@link onRequestAccepted} fires before the queued request
 * settles. Resolves with the request once it has actually been sent, or `undefined` if it never was.
 */
export async function acceptAndAwaitSentRequest(result: ChatSendResult, onRequestAccepted?: () => void): Promise<ChatSendResultSent | undefined> {
	if (ChatSendResult.isRejected(result)) {
		return undefined;
	}

	onRequestAccepted?.();

	const sent = ChatSendResult.isQueued(result) ? await result.deferred : result;
	return ChatSendResult.isSent(sent) ? sent : undefined;
}

export function shouldUnlockChatPetRequestRevision(isEditing: boolean, isUserQuery: boolean): boolean {
	return isEditing && isUserQuery;
}

export function shouldUnlockChatPetQueueOrSteeringMessage(isUserQuery: boolean, queue: ChatRequestQueueKind | undefined): boolean {
	return isUserQuery && queue !== undefined;
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

type ChatPromptRunEvent = {
	storage: PromptsStorage;
	extensionId?: string;
	promptName?: string;
	promptNameHash?: string;
};

type ChatPromptRunClassification = {
	owner: 'digitarald';
	comment: 'Event fired when a prompt slash command is resolved into a follow instructions request';
	storage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the prompt is stored (local, user, extension).' };
	extensionId?: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Identifier of the extension that contributed the prompt, when applicable.' };
	promptName?: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Name of the core or extension-contributed prompt.' };
	promptNameHash?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Hashed name of local or user prompt for privacy.' };
};

type ChatThinkingStyleUsageEvent = {
	thinkingStyle: ThinkingDisplayMode;
	location: ChatAgentLocation;
	requestKind: 'submit' | 'rerun';
};

type ChatThinkingStyleUsageClassification = {
	owner: 'justschen';
	comment: 'Event fired when a chat request uses the configured thinking style rendering mode.';
	thinkingStyle: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The configured rendering mode for thinking content.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location where the request was made.' };
	requestKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the request was a new submit or a rerun.' };
};

const supportsAllAttachments: Required<Omit<IChatAgentAttachmentCapabilities, 'terminalCommandPrefix'>> = {
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
	supportsPromptAttachments: true,
	supportsHandOffs: true,
	supportsCheckpoints: true,
};

const DISCLAIMER = localize('chatDisclaimer', "AI responses may be inaccurate");

/** Set on the container when {@link IChatWidgetViewOptions.persistentContentHeight} is, floating the persistent content. */
export const chatFloatingPersistentContentClass = 'chat-floating-persistent-content';

/** Carries {@link IChatWidgetViewOptions.persistentContentHeight} to `chat.css`. */
export const chatPersistentContentHeightVariable = '--vscode-chat-persistent-content-height';

export class ChatWidget extends Disposable implements IChatWidget {

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static readonly CONTRIBS: { new(...args: [IChatWidget, ...any]): IChatWidgetContrib }[] = [];

	private readonly _onDidSubmitAgent = this._register(new Emitter<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>());
	readonly onDidSubmitAgent = this._onDidSubmitAgent.event;
	private _submitHandlerInFlight = false;

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

	private _onDidChangeActiveInputEditor = this._register(new Emitter<void>());
	readonly onDidChangeActiveInputEditor = this._onDidChangeActiveInputEditor.event;

	private readonly _onWillMaybeChangeHeight = this._register(new Emitter<void>());
	readonly onWillMaybeChangeHeight: Event<void> = this._onWillMaybeChangeHeight.event;

	private _onDidChangeHeight = this._register(new Emitter<number>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	private readonly _onDidLayout = this._register(new Emitter<{ width: number; height: number }>());
	readonly onDidLayout = this._onDidLayout.event;

	private _onDidChangeEmptyState = this._register(new Emitter<void>());
	readonly onDidChangeEmptyState = this._onDidChangeEmptyState.event;

	private readonly _onDidChangeFindableContent = this._register(new Emitter<void>());

	contribs: ReadonlyArray<IChatWidgetContrib> = [];

	private listContainer!: HTMLElement;
	private container!: HTMLElement;
	private transcriptProgress: { readonly container: HTMLElement; readonly content: HTMLElement } | undefined;
	private readonly transcriptProgressPart = this._register(new MutableDisposable<DisposableStore>());
	private transcriptProgressActive = false;
	private transcriptContext: HTMLElement | undefined;
	private readonly transcriptContextPart = this._register(new MutableDisposable<ChatAttachmentsContentPart>());
	private transcriptContextValue: IChatRequestTranscriptContextVariableEntry | undefined;

	get domNode() { return this.container; }

	private listWidget!: ChatListWidget;
	private _findController: ChatFindWidget | undefined;
	private inputPartMaxHeightOverride: number | undefined;

	private readonly visibilityTimeoutDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
	private readonly visibilityAnimationFrameDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	private readonly inputPartDisposable: MutableDisposable<ChatInputPart> = this._register(new MutableDisposable());
	private readonly inlineInputPartDisposable: MutableDisposable<ChatInputPart> = this._register(new MutableDisposable());

	private readonly mainPasteTargetRegistration = this._register(new MutableDisposable());
	private readonly inlinePasteTargetRegistration = this._register(new MutableDisposable());
	private _pasteTarget: ChatWidgetPasteTarget | undefined;

	/**
	 * Shared across the main and inline input parts: it resolves the active part
	 * through {@link input}, so one instance serves whichever is in use.
	 */
	private get pasteTarget(): ChatWidgetPasteTarget {
		return this._pasteTarget ??= new ChatWidgetPasteTarget(this);
	}
	private inputContainer!: HTMLElement;
	private focusedInputDOM!: HTMLElement;
	private editorOverflowWidgetsDomNode: HTMLElement | undefined;
	private editorOptions!: ChatEditorOptions;
	private readonly readOnlyBanner: ChatReadOnlyBanner | undefined;

	private recentlyRestoredCheckpoint: boolean = false;
	private _requestEditSnapshot: { readonly input: string; readonly attachmentIds: ReadonlySet<string> } | undefined;
	private _requestEditCancellationPending = false;

	/** Suppresses auto-scroll for the duration of an inline request edit. */
	private readonly _editingAutoScrollHold = this._register(new MutableDisposable<IDisposable>());

	private welcomeMessageContainer!: HTMLElement;
	private readonly welcomePart: MutableDisposable<ChatViewWelcomePart> = this._register(new MutableDisposable());

	private readonly _gettingStartedTip = this._register(new MutableDisposable<ChatInputTipPresenter>());

	private readonly chatSuggestNextWidget: ChatSuggestNextWidget;

	private bodyDimension: dom.Dimension | undefined;
	private visibleChangeCount = 0;
	private requestInProgress: IContextKey<boolean>;
	private hasActiveRequest: IContextKey<boolean>;
	private agentInInput: IContextKey<boolean>;

	private _visible = false;
	get visible() { return this._visible; }

	private _inputVisible = true;
	private _readOnly = false;

	private _instructionFilesCheckPromise: Promise<boolean> | undefined;
	private _instructionFilesExist: boolean | undefined;

	private _isRenderingWelcome = false;
	private _isLoading = false;

	/**
	 * The session whose model was just bound, cleared by the first
	 * {@link onDidChangeItems} that renders it. Tracked by resource (rather than
	 * a flag) so the trace marks time-to-first-render for the model it belongs
	 * to, once, even when an outgoing model triggers a render while unbinding.
	 */
	private _pendingFirstRenderSessionResource: URI | undefined;

	// Coding agent locking state
	private _lockedAgent?: {
		id: string;
		name: string;
		prefix: string;
		displayName: string;
		agentHostProviderId?: string;
	};
	private readonly _lockedToCodingAgentContextKey: IContextKey<boolean>;
	private readonly _lockedCodingAgentIdContextKey: IContextKey<string>;
	private readonly _readOnlyContextKey: IContextKey<boolean>;
	private readonly _chatIsAgentHostSessionContextKey: IContextKey<boolean>;
	private readonly _chatAgentHostProviderIdContextKey: IContextKey<string>;
	private readonly _chatAgentHostHasImmutablePrimaryWorkingDirectoryContextKey: IContextKey<boolean>;
	private readonly _chatAgentHostFolderPickerVisibleContextKey: IContextKey<boolean>;
	/** The session resource the {@link _chatAgentHostFolderPickerVisibleContextKey} value currently reflects, so a transient `undefined` decision during provisional recreation retains the value instead of flashing the chip. */
	private _folderPickerDecisionSessionResource: URI | undefined;
	private readonly _chatSessionSupportsForkContextKey: IContextKey<boolean>;
	private readonly _agentSupportsAttachmentsContextKey: IContextKey<boolean>;
	private readonly _sessionIsEmptyContextKey: IContextKey<boolean>;
	private readonly _hasPendingRequestsContextKey: IContextKey<boolean>;
	private readonly _sessionHasDebugDataContextKey: IContextKey<boolean>;
	private _attachmentCapabilities: IChatAgentAttachmentCapabilities = supportsAllAttachments;

	// Autopilot goal banner state — token source cancels in-flight goal-summary
	// requests when the user starts a new submission or the run completes.
	private _goalSummaryTokenSource: CancellationTokenSource | undefined;
	private _goalBannerDismissedForCurrentRequest = false;
	private readonly _goalBannerDismissListener = this._register(new MutableDisposable<IDisposable>());

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
			this.logService.debug(`ChatWidget#setViewModel: have viewModel session=${viewModel.sessionResource.toString()} requests=${viewModel.model.getRequests().length}`);

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
	private readonly _viewModelObs = observableFromEvent(this, this.onDidChangeViewModel, () => this.viewModel);

	private parsedChatRequest: IParsedChatRequest | undefined;
	get parsedInput() {
		if (this.parsedChatRequest === undefined) {
			if (!this.viewModel) {
				return { text: '', parts: [] };
			}

			this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser)
				.parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, {
					selectedAgent: this._lastSelectedAgent,
					mode: this.input.currentModeKind,
					attachmentCapabilities: this.attachmentCapabilities,
					forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : undefined,
					sessionType: getChatSessionType(this.viewModel.model.sessionResource)
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
		private styles: IChatWidgetStyles,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IDialogService private readonly dialogService: IDialogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatService private readonly chatService: IChatService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatPasteTargetService private readonly chatPasteTargetService: IChatPasteTargetService,
		@IChatAccessibilityService private readonly chatAccessibilityService: IChatAccessibilityService,
		@ILogService private readonly logService: ILogService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@IChatEditingService chatEditingService: IChatEditingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IChatLayoutService private readonly chatLayoutService: IChatLayoutService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IChatAttachmentResolveService private readonly chatAttachmentResolveService: IChatAttachmentResolveService,
		@IChatTipService private readonly chatTipService: IChatTipService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IChatGoalSummaryService private readonly chatGoalSummaryService: IChatGoalSummaryService,
		@IChatSubmitRequestHandlerService private readonly chatSubmitRequestHandlerService: IChatSubmitRequestHandlerService,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatPetWidgetService private readonly chatPetWidgetService: IChatPetWidgetService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostCustomizationService private readonly _agentHostCustomizationService: IAgentHostCustomizationService,
		@IAgentHostNewSessionFolderService private readonly _agentHostNewSessionFolderService: IAgentHostNewSessionFolderService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this.readOnlyBanner = viewOptions.isSessionsWindow
			? undefined
			: this._register(instantiationService.createInstance(
				ChatReadOnlyBanner,
				viewOptions.readOnlyBannerAtTop ? localize('chatReadOnlyBanner.message', "This chat is read-only") : undefined,
			));
		this._lockedToCodingAgentContextKey = ChatContextKeys.lockedToCodingAgent.bindTo(this.contextKeyService);
		this._lockedCodingAgentIdContextKey = ChatContextKeys.lockedCodingAgentId.bindTo(this.contextKeyService);
		this._readOnlyContextKey = ChatContextKeys.readOnly.bindTo(this.contextKeyService);
		this._chatIsAgentHostSessionContextKey = ChatContextKeys.chatIsAgentHostSession.bindTo(this.contextKeyService);
		this._chatAgentHostProviderIdContextKey = ChatContextKeys.chatAgentHostProviderId.bindTo(this.contextKeyService);
		this._chatAgentHostHasImmutablePrimaryWorkingDirectoryContextKey = ChatContextKeys.chatAgentHostHasImmutablePrimaryWorkingDirectory.bindTo(this.contextKeyService);
		this._chatAgentHostFolderPickerVisibleContextKey = ChatContextKeys.chatAgentHostFolderPickerVisible.bindTo(this.contextKeyService);
		this._chatSessionSupportsForkContextKey = ChatContextKeys.chatSessionSupportsFork.bindTo(this.contextKeyService);
		this._agentSupportsAttachmentsContextKey = ChatContextKeys.agentSupportsAttachments.bindTo(this.contextKeyService);
		this._sessionIsEmptyContextKey = ChatContextKeys.chatSessionIsEmpty.bindTo(this.contextKeyService);
		this._hasPendingRequestsContextKey = ChatContextKeys.hasPendingRequests.bindTo(this.contextKeyService);
		this._sessionHasDebugDataContextKey = ChatContextKeys.chatSessionHasDebugData.bindTo(this.contextKeyService);

		this._register(this.chatDebugService.onDidAddEvent(e => {
			const sessionResource = this.viewModel?.sessionResource;
			if (sessionResource && e.sessionResource.toString() === sessionResource.toString()) {
				this._sessionHasDebugDataContextKey.set(true);
			}
		}));

		// The folder picker's visibility depends on whether the locked Agent Host
		// provider pins an immutable primary working directory. That capability
		// hydrates after the agent host connects (and can reset on restart), and
		// `rootState` is a placeholder subscription whose `onDidChange` is
		// `Event.None` until then — so (re)bind on every start and listen for both
		// value and error transitions, mirroring agentHostSignedOutModelsNotification.
		const rootStateListeners = this._register(new DisposableStore());
		const bindRootState = () => {
			rootStateListeners.clear();
			const rootState = this._agentHostService.rootState;
			rootStateListeners.add(rootState.onDidChange(() => this._updateAgentHostWorkingDirectoryContextKeys(this._lockedAgent?.agentHostProviderId)));
			if (rootState.onDidError) {
				rootStateListeners.add(rootState.onDidError(() => this._updateAgentHostWorkingDirectoryContextKeys(this._lockedAgent?.agentHostProviderId)));
			}
			this._updateAgentHostWorkingDirectoryContextKeys(this._lockedAgent?.agentHostProviderId);
		};
		bindRootState();
		this._register(this._agentHostService.onAgentHostStart(bindRootState));

		// The harness may hide the Folder picker (and pin a primary) via a
		// per-session decision in `_meta` — e.g. Copilot auto-selects the sole
		// workspace folder carrying hooks. Read it from the customization service
		// (which already subscribes to the session's state) and recompute when it
		// changes or the widget rebinds to another session.
		this._register(this._agentHostCustomizationService.onDidChangeCustomizations(() => this._updateFolderPickerDecision()));
		this._register(this.onDidChangeViewModel(() => this._updateFolderPickerDecision()));

		this.viewContext = viewContext ?? {};

		const viewModelObs = this._viewModelObs;

		if (typeof location === 'object') {
			this._location = location;
		} else {
			this._location = { location };
		}

		ChatContextKeys.inChatSession.bindTo(contextKeyService).set(true);
		ChatContextKeys.location.bindTo(contextKeyService).set(this._location.location);
		ChatContextKeys.inQuickChat.bindTo(contextKeyService).set(isQuickChat(this));
		ChatContextKeys.findSupported.bindTo(contextKeyService).set(!!this.viewOptions.enableFind);
		this._register(this.onDidChangeViewModel(() => this._onDidChangeFindableContent.fire()));
		this.agentInInput = ChatContextKeys.inputHasAgent.bindTo(contextKeyService);
		this.requestInProgress = ChatContextKeys.requestInProgress.bindTo(contextKeyService);
		this.hasActiveRequest = ChatContextKeys.hasActiveRequest.bindTo(contextKeyService);

		this._register(this.chatEntitlementService.onDidChangeAnonymous(() => this.renderWelcomeViewContentIfNeeded()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.tips.enabled')) {
				if (!this.configurationService.getValue<boolean>('chat.tips.enabled')) {
					this.clearGettingStartedTip();
				} else {
					this.updateChatViewVisibility();
				}
			}
			if (e.affectsConfiguration(ChatConfiguration.ProgressBorder)) {
				this.updateWorkingProgressBorder();
			}
		}));

		this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
			this.updateWorkingProgressBorder();
			if (this.visible) {
				this.listWidget.rerender();
			}
		}));

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

		this.chatSuggestNextWidget = this._register(this.instantiationService.createInstance(ChatSuggestNextWidget));

		// Clear the autopilot goal banner whenever the active request finishes.
		this._register(autorun(r => {
			const viewModel = viewModelObs.read(r);
			const inProgress = viewModel?.model.requestInProgress.read(r) ?? false;
			if (!inProgress) {
				this._cancelGoalSummary();
				this.inputPartDisposable.value?.clearGoalBanner();
			}
		}));

		this._register(autorun(r => {
			const viewModel = viewModelObs.read(r);
			chatEditingService.editingSessionsObs.read(r);

			const session = viewModel ? chatEditingService.getEditingSession(viewModel.sessionResource) : undefined;
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

		this._register(this.codeEditorService.registerCodeEditorOpenHandler(async (input: ITextResourceEditorInput, _source: ICodeEditor | null, _sideBySide?: boolean): Promise<ICodeEditor | null> => {
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

	/**
	 * Updates the context key that gates the multi-root folder picker: it is set
	 * only when the locked Agent Host provider pins an immutable primary working
	 * directory. Defaults to (and falls back to) `false`, so the picker stays
	 * hidden until the provider's capabilities are known.
	 */
	private _updateAgentHostWorkingDirectoryContextKeys(agentHostProviderId: string | undefined): void {
		this._chatAgentHostHasImmutablePrimaryWorkingDirectoryContextKey.set(
			!!agentHostProviderId && hasImmutablePrimaryWorkingDirectory(this._agentHostService.rootState.value, agentHostProviderId));
	}

	/**
	 * Applies the harness-owned Folder-picker decision for the current session:
	 * it sets the visibility context key from the decision and, when the decision
	 * pins a primary and the session is still empty, auto-selects that folder. The
	 * decision lives in the session's `_meta` and is surfaced by
	 * {@link IAgentHostCustomizationService}; the resolution itself lives in the
	 * pure {@link resolveFolderPickerDecisionUpdate} so it stays testable.
	 *
	 * The picker is hidden by default and only revealed once a decision says so,
	 * so it never flashes visible-then-hidden. A transient `undefined` decision
	 * for the *same* session is retained rather than reset, so the chip does not
	 * flicker while a folder change recreates the provisional session.
	 */
	private _updateFolderPickerDecision(): void {
		const sessionResource = this.viewModel?.sessionResource;
		const agentHostProviderId = this._lockedAgent?.agentHostProviderId;
		const decision = sessionResource && agentHostProviderId
			? this._agentHostCustomizationService.getFolderPickerDecision(sessionResource)
			: undefined;
		const update = resolveFolderPickerDecisionUpdate(
			sessionResource,
			agentHostProviderId,
			decision,
			this._folderPickerDecisionSessionResource,
			!!this.viewOptions.isSessionsWindow,
			(this.viewModel?.model.getRequests().length ?? 0) === 0,
			sessionResource ? this._agentHostNewSessionFolderService.getFolder(sessionResource) : undefined,
			this._uriIdentityService.extUri,
		);
		if (update.kind === 'noop') {
			return;
		}
		this._chatAgentHostFolderPickerVisibleContextKey.set(update.visible);
		this._folderPickerDecisionSessionResource = update.trackedSessionResource;
		// `setFolder` deliberately overrides any prior selection, since a hidden
		// picker leaves the user no way to choose.
		if (update.selectPrimary && sessionResource) {
			this._agentHostNewSessionFolderService.setFolder(sessionResource, update.selectPrimary);
		}
	}

	get supportsFileReferences(): boolean {
		return !!this.viewOptions.supportsFileReferences;
	}

	get rendersInputOnTop(): boolean {
		return this.viewOptions.renderInputOnTop ?? false;
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

	private updateWorkingProgressBorder(): void {
		const inputPart = this.inputPartDisposable.value;
		if (!inputPart) {
			return;
		}
		const inputContainer = inputPart.inputContainerElement;
		if (!inputContainer) {
			return;
		}
		const enabled = this.configurationService.getValue<boolean>(ChatConfiguration.ProgressBorder) === true
			&& !this.accessibilityService.isMotionReduced()
			&& !isInlineChat(this);
		const inProgress = !!this.viewModel?.model.requestInProgress.get();
		const working = enabled && inProgress;
		inputContainer.classList.toggle('working', working);
		setChatInputStackInputWorking(inputContainer, working);
	}

	get inputEditor(): ICodeEditor {
		return this.input.inputEditor;
	}

	get contentHeight(): number {
		return this.input.height.get() + this.listWidget.contentHeight + this.chatSuggestNextWidget.height;
	}

	get scrollTop(): number {
		return this.listWidget.scrollTop;
	}

	set scrollTop(value: number) {
		this.listWidget.scrollTop = value;
	}

	getViewState(): IChatWidgetViewState {
		return {
			scrollTop: this.listWidget.scrollTop,
			isAtBottom: this.listWidget.isScrolledToBottom,
		};
	}

	restoreViewState(state: IChatWidgetViewState): void {
		if (state.isAtBottom) {
			this.listWidget.scrollToEnd();
		} else {
			this.listWidget.scrollTop = state.scrollTop;
		}
	}

	holdAutoScroll(): IDisposable {
		return this.listWidget.acquireAutoScrollHold();
	}

	get transcriptDomNode(): HTMLElement {
		return this.listWidget.domNode;
	}

	get scrollHeight(): number {
		return this.listWidget.scrollHeight;
	}
	get viewportHeight(): number {
		return this.listWidget.renderHeight;
	}

	get attachmentModel(): ChatAttachmentModel {
		return this.input.attachmentModel;
	}

	render(parent: HTMLElement, petMovementBounds?: HTMLElement, preferredPetHost?: IObservable<boolean>): void {
		const viewId = isIChatViewViewContext(this.viewContext) ? this.viewContext.viewId : undefined;
		this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
		const renderInputOnTop = this.viewOptions.renderInputOnTop ?? false;
		const renderFollowups = this.viewOptions.renderFollowups ?? !renderInputOnTop;
		const renderStyle = this.viewOptions.renderStyle;
		const renderInputToolbarBelowInput = this.viewOptions.renderInputToolbarBelowInput ?? false;

		this.container = dom.append(parent, $('.interactive-session'));
		if (this.viewOptions.persistentContentHeight) {
			// The class floats the persistent content; the variable tells the
			// surfaces the list now extends behind how far to keep clear.
			this.container.classList.add(chatFloatingPersistentContentClass);
			this.container.style.setProperty(chatPersistentContentHeightVariable, `${this.viewOptions.persistentContentHeight}px`);
		}
		this.editorOverflowWidgetsDomNode = this.viewOptions.editorOverflowWidgetsDomNode;
		if (!this.editorOverflowWidgetsDomNode) {
			const editorOverflowWidgetsDomNode = this.layoutService.getContainer(dom.getWindow(parent)).appendChild($('.chat-editor-overflow.monaco-editor'));
			this.editorOverflowWidgetsDomNode = editorOverflowWidgetsDomNode;
			this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
		}
		this.welcomeMessageContainer = dom.append(this.container, $('.chat-welcome-view-container', { style: 'display: none' }));
		this._register(dom.addStandardDisposableListener(this.welcomeMessageContainer, dom.EventType.CLICK, () => this.focusInput()));

		this._register(this.chatSuggestNextWidget.onDidChangeHeight(() => {
			if (this.bodyDimension) {
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}
		}));
		this._register(this.chatSuggestNextWidget.onDidSelectPrompt(({ handoff, agentId, withAutopilot }) => {
			this.handleNextPromptSelection(handoff, agentId, withAutopilot);
		}));

		if (renderInputOnTop) {
			if (this.readOnlyBanner && !this.viewOptions.readOnlyBannerAtTop) {
				this.container.appendChild(this.readOnlyBanner.domNode);
			}
			this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
			if (this.readOnlyBanner && this.viewOptions.readOnlyBannerAtTop) {
				this.container.appendChild(this.readOnlyBanner.domNode);
			}
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
		} else {
			if (this.readOnlyBanner && this.viewOptions.readOnlyBannerAtTop) {
				this.container.appendChild(this.readOnlyBanner.domNode);
			}
			this.listContainer = dom.append(this.container, $(`.interactive-list`));
			dom.append(this.container, this.chatSuggestNextWidget.domNode);
			if (this.readOnlyBanner && !this.viewOptions.readOnlyBannerAtTop) {
				this.container.appendChild(this.readOnlyBanner.domNode);
			}
			this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
		}

		if (this.location === ChatAgentLocation.Chat && !isInlineChat(this)) {
			const inputContainer = this.inputPart.inputContainerElement;
			const petHost = this.inputPart.element;
			const inputHasContent = observableFromEvent(this, this.inputEditor.onDidChangeModelContent, () => this.inputEditor.getValue().length > 0);
			const registration = this._register(this.chatPetWidgetService.register(this, {
				parent: petHost,
				dragBounds: inputContainer ?? petHost,
				movementBounds: petMovementBounds ?? parent,
				model: this._viewModelObs.map(viewModel => viewModel?.model),
				hasInput: inputHasContent,
				inputChanged: this.inputEditor.onDidChangeModelContent,
				getPlatformTop: petCenterX => this.inputPart.getChatPetPlatformTop(petCenterX),
				onDidChangePlatform: this.inputPart.onDidChangeChatPetHorizontalPlatforms,
			}, preferredPetHost));
			const petSpaceReserved = derived(this, reader => shouldReserveChatPetSpace(this.chatPetService.enabled.read(reader), registration.active.read(reader)));
			this._register(autorun(reader => this.container.classList.toggle('chat-pet-enabled', petSpaceReserved.read(reader))));
		}

		this.renderWelcomeViewContentIfNeeded();
		this.createList(this.listContainer, {
			editable: !isInlineChat(this) && !isQuickChat(this),
			contentHorizontalPadding: this.viewOptions.isSessionsWindow ? SESSIONS_CHAT_ITEM_HORIZONTAL_PADDING : undefined,
			...this.viewOptions.rendererOptions,
			renderStyle
		});

		if (this.viewOptions.enableFind) {
			const host: IChatFindHost = {
				transcriptDomNode: this.listWidget.domNode,
				getItems: () => this.viewModel?.getItems() ?? [],
				onDidChangeContent: this._onDidChangeFindableContent.event,
				reveal: (item, relativeTop) => this.reveal(item, relativeTop),
				getTemplateDataForRequestId: (requestId) => this.getTemplateDataForRequestId(requestId),
				onDidRerenderRow: this.onDidRerenderRow,
				editorsInUse: () => this.listWidget.editorsInUse(),
				getScrollTop: () => this.listWidget.scrollTop,
				setScrollTop: (scrollTop) => { this.listWidget.scrollTop = scrollTop; },
				getRenderHeight: () => this.listWidget.renderHeight,
				getViewportAnchorItemId: () => this.listWidget.lastVisibleItem?.id,
			};
			this._findController = this._register(this.instantiationService.createInstance(ChatFindWidget, host));
			// Focusing the Find widget must count as focusing this widget, so
			// focus-targeted commands (Escape, F3, toolbar actions) always
			// resolve to the pane the user is actually typing/searching in.
			this._register(this._findController.focusTracker.onDidFocus(() => this._onDidFocus.fire()));
			if (this.bodyDimension) {
				this._findController.layout(this.bodyDimension.width);
			}
		}

		// Forward wheel events that target the chat container itself (the margins
		// around the list and input) to the chat list.
		this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => {
			if (e.defaultPrevented || e.target !== this.container) {
				return;
			}

			this.listWidget.delegateScrollFromMouseWheelEvent(e);
		}));

		// Forward wheel events from the area around the chat widget (e.g. the
		// max-width margins in the classic VS Code chat view) to the chat list.
		this._register(dom.addDisposableListener(parent, dom.EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => {
			if (e.defaultPrevented) {
				return;
			}

			const target = e.target as Node | null;
			if (target && dom.isAncestor(target, this.container)) {
				return;
			}

			this.listWidget.delegateScrollFromMouseWheelEvent(e);
		}));

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
					if (part instanceof ChatRequestDynamicVariablePart && part.isAttachmentReference) {
						const attachment = this.attachmentModel.attachments.find(attachment => attachment.id === part.id);
						if (attachment && isPastedTextArtifact(attachment)) {
							newPromptAttachments.set(attachment.id, { ...attachment, range: part.range });
							oldPromptAttachments.delete(attachment.id);
						}
						continue;
					}
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
		// Read-only chats hide the input; focus the message list instead.
		if (!this._inputVisible) {
			if (this.listWidget.focusLastItem(true) < 0) {
				this.listWidget.focus();
			}
			this._onDidFocus.fire();
			return;
		}

		this.input.focus();

		// Sometimes focusing the input part is not possible,
		// but we'd like to be the last focused chat widget,
		// so we emit an optimistic onDidFocus event nonetheless.
		this._onDidFocus.fire();
	}

	focusTodosView(): boolean {
		if (!this.input.hasVisibleTodos()) {
			return false;
		}

		return this.input.focusTodoList();
	}

	toggleTodosViewFocus(): boolean {
		if (!this.input.hasVisibleTodos()) {
			return false;
		}

		if (this.input.isTodoListFocused()) {
			this.focusInput();
			return true;
		}

		return this.input.focusTodoList();
	}

	focusQuestionCarousel(): boolean {
		if (!this.input.questionCarousel) {
			return false;
		}

		return this.input.focusQuestionCarousel();
	}

	toggleQuestionCarouselFocus(): boolean {
		if (!this.input.questionCarousel) {
			return false;
		}

		if (this.input.isQuestionCarouselFocused()) {
			this.focusInput();
			return true;
		}

		return this.input.focusQuestionCarousel();
	}

	navigateToPreviousQuestion(): boolean {
		if (!this.input.questionCarousel) {
			return false;
		}

		return this.input.navigateToPreviousQuestion();
	}

	navigateToNextQuestion(): boolean {
		if (!this.input.questionCarousel) {
			return false;
		}

		return this.input.navigateToNextQuestion();
	}

	focusQuestionCarouselTerminal(): boolean {
		return this.input.focusQuestionCarouselTerminal();
	}

	hasInputFocus(): boolean {
		return this.input.hasFocus();
	}

	refreshParsedInput() {
		if (!this.viewModel) {
			return;
		}

		const previous = this.parsedChatRequest;
		const context = {
			selectedAgent: this._lastSelectedAgent,
			mode: this.input.currentModeKind,
			attachmentCapabilities: this.attachmentCapabilities,
			sessionType: getChatSessionType(this.viewModel.model.sessionResource),
			forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : undefined,
		};
		this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, context);
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

	async clear(resolvedSessionType?: IResolvedNewChatSessionType): Promise<void> {
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
			this.lockToCodingAgent(this._lockedAgent.name, this._lockedAgent.displayName, this._lockedAgent.id, this._lockedAgent.agentHostProviderId);
		} else {
			this.unlockFromCodingAgent();
		}

		this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
		this.inputPart?.clearArtifactsWidget();
		this.chatSuggestNextWidget.hide();
		await this.viewOptions.clear?.(resolvedSessionType);
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

			if (this._pendingFirstRenderSessionResource && this.viewModel && isEqual(this.viewModel.sessionResource, this._pendingFirstRenderSessionResource)) {
				this._pendingFirstRenderSessionResource = undefined;
				this.logService.trace(`ChatWidget#firstRender: session=${this.viewModel.sessionResource.toString()} items=${items.length}`);
			}

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
		const showWelcome = shouldShowChatWelcome(
			this.viewModel?.getItems().length,
			this.transcriptProgressActive || this.transcriptContextValue !== undefined,
		);
		if (showWelcome !== undefined) {
			dom.setVisibility(showWelcome, this.welcomeMessageContainer);
			dom.setVisibility(!showWelcome, this.listContainer);

			// Re-evaluate the getting-started tip. When the empty state goes away the
			// presenter drops the cached tip so the next empty state picks a fresh
			// (rotated) one instead of re-showing the stale tip.
			this.renderGettingStartedTipIfNeeded();
		}

		// Only show welcome getting started until setup is completed
		this.container.classList.toggle(
			'chat-view-getting-started-disabled',
			this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.hasByokModels);

		this._onDidChangeEmptyState.fire();
	}

	isEmpty(): boolean {
		return (this.viewModel?.getItems().length ?? 0) === 0;
	}

	setTranscriptProgress(message: string | undefined, ariaLabel = message): void {
		if (!this.transcriptProgress) {
			const container = dom.append(this.listContainer, $('.chat-transcript-progress'));
			container.hidden = true;
			container.setAttribute('role', 'status');
			container.setAttribute('aria-live', 'polite');
			const content = dom.append(container, $('.interactive-item-container'));
			content.setAttribute('aria-hidden', 'true');
			this.transcriptProgress = { container, content };
		}
		this.transcriptProgressPart.clear();
		dom.clearNode(this.transcriptProgress.content);
		if (message) {
			const store = new DisposableStore();
			const renderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
			const renderedMessage = store.add(renderer.render(new MarkdownString().appendText(message)));
			const progressPart = store.add(this.instantiationService.createInstance(ChatProgressSubPart, renderedMessage.element, Codicon.check, undefined));
			progressPart.domNode.classList.add('shimmer-progress');
			dom.append(this.transcriptProgress.content, progressPart.domNode);
			this.transcriptProgressPart.value = store;
		}
		this.transcriptProgress.container.setAttribute('aria-label', ariaLabel ?? '');
		this.transcriptProgress.container.hidden = message === undefined;
		this.transcriptProgressActive = message !== undefined;
		this.container.classList.toggle('chat-transcript-progress-active', message !== undefined);
		this.updateChatViewVisibility();
	}

	setTranscriptContext(context: IChatRequestTranscriptContextVariableEntry | undefined): void {
		this.transcriptContextValue = context;
		if (!this.transcriptContext) {
			this.transcriptContext = dom.append(this.listContainer, $('.chat-transcript-context.chat-attached-context'));
			this.transcriptContext.hidden = true;
		}
		this.transcriptContext.hidden = context === undefined;
		if (context) {
			this.transcriptContextPart.value = this.instantiationService.createInstance(ChatAttachmentsContentPart, {
				variables: [context],
				domNode: this.transcriptContext,
			});
		} else {
			this.transcriptContextPart.clear();
			dom.clearNode(this.transcriptContext);
		}
		this.container.classList.toggle('chat-transcript-context-active', context !== undefined);
		this.updateChatViewVisibility();
	}

	/**
	 * Renders the welcome view content when needed.
	 */
	private renderWelcomeViewContentIfNeeded() {
		if (this._isRenderingWelcome) {
			return;
		}

		// The input part may not be rendered yet (or may have been disposed) when this is
		// called from async flows such as `lockToCodingAgent` / `unlockFromCodingAgent` that
		// run after `showModel` resolves. Bail out to avoid dereferencing an undefined input.
		if (!this.inputPartDisposable.value) {
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
				if (this.chatEntitlementService.anonymous && !this.chatEntitlementService.sentiment.completed) {
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

	private renderGettingStartedTipIfNeeded(): void {
		this._gettingStartedTip.value?.update();
	}

	updateGettingStartedTip(): void {
		this.renderGettingStartedTipIfNeeded();
	}

	/**
	 * Whether this surface currently wants to show a getting-started tip. Mirrors
	 * the conditions under which the welcome view is shown, since the tip only
	 * belongs to the empty state of the standard chat layout.
	 */
	private isGettingStartedTipEligible(): boolean {
		if (typeof this.viewOptions.renderGettingStartedTip === 'function'
			? !this.viewOptions.renderGettingStartedTip()
			: this.viewOptions.renderGettingStartedTip === false) {
			return false;
		}
		if (this.viewOptions.renderStyle === 'compact' || this.viewOptions.renderStyle === 'minimal') {
			return false;
		}
		if (!this.viewModel) {
			return false;
		}
		if (this._isLoading) {
			return false;
		}
		return shouldShowChatTip(this.viewModel.getItems().length, this.transcriptProgressActive || this.transcriptContextValue !== undefined, this._isLoading);
	}

	private clearGettingStartedTip(): void {
		this._gettingStartedTip.value?.clear();
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
			return new MarkdownString(localize(
				'chatWidget.instructions',
				"[Generate Agent Instructions]({0}) to onboard AI onto your codebase.",
				`command:${GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID}`
			), { isTrusted: { enabledCommands: [GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID] } });
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
			return (await this.promptsService.listAgentInstructions(CancellationToken.None)).length > 0;
		} catch (error) {
			// On error, assume no instruction files exist to be safe
			this.logService.warn('[ChatWidget] Error checking for instruction files:', error);
			return false;
		}
	}

	private getWelcomeViewContent(additionalMessage: string | IMarkdownString | undefined): IChatViewWelcomeContent {
		if (this.isLockedToCodingAgent) {
			// Check for provider-specific customizations from chat sessions service
			const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : undefined;
			const providerIcon = contribution?.icon;
			const providerTitle = contribution?.welcomeTitle;
			const providerMessage = contribution?.welcomeMessage;

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
		};
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

		if (this._readOnly) {
			this.chatSuggestNextWidget.hide();
			return;
		}

		// Skip rendering in coding agent sessions unless the agent supports hand-offs
		if (this.isLockedToCodingAgent && !this._attachmentCapabilities.supportsHandOffs) {
			this.chatSuggestNextWidget.hide();
			return;
		}

		const items = this.viewModel?.getItems() ?? [];
		if (!items.length) {
			return;
		}

		const lastItem = items[items.length - 1];
		const lastResponseComplete = lastItem && isResponseVM(lastItem) && lastItem.isComplete;
		if (!lastResponseComplete || lastItem.isCanceled) {
			this.chatSuggestNextWidget.hide();
			return;
		}

		// Derive handoffs from the mode that generated the last response, not the current UI selection.
		// This ensures handoffs reflect what the response agent offers, regardless of mode picker state.
		// Fall back to the current mode picker for old sessions where modeInfo was not persisted.
		const modeInfo = lastItem.model.request?.modeInfo;
		let responseMode: IChatMode | undefined;
		const modes = this.input.currentChatModesObs.get();
		if (modeInfo?.modeInstructions?.name) {
			responseMode = modes.findModeByName(modeInfo.modeInstructions.name);
		} else {
			responseMode = this.input.currentModeObs.get();
		}

		const handoffs = responseMode?.handOffs?.get();

		if (responseMode && handoffs && handoffs.length > 0) {
			// In Autopilot mode, automatically trigger the first auto-send handoff
			// so the plan flows seamlessly into implementation without user interaction.
			const permissionLevel = this.inputPart.currentModeInfo.permissionLevel;
			if (permissionLevel === ChatPermissionLevel.Autopilot) {
				const autoSendHandoff = handoffs.find(h => h.send);
				if (autoSendHandoff) {
					this.handleNextPromptSelection(autoSendHandoff);
					return;
				}
			}

			// Log telemetry only when widget transitions from hidden to visible
			const wasHidden = this.chatSuggestNextWidget.domNode.style.display === 'none';
			this.chatSuggestNextWidget.render(responseMode);

			if (wasHidden) {
				this.telemetryService.publicLog2<ChatHandoffWidgetShownEvent, ChatHandoffWidgetShownClassification>('chat.handoffWidgetShown', {
					agent: getModeNameForTelemetry(responseMode),
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

	private handleNextPromptSelection(handoff: IHandOff, agentId?: string, withAutopilot?: boolean): void {
		// Hide the widget after selection
		this.chatSuggestNextWidget.hide();

		// If starting with Autopilot, set permission level before submitting
		if (withAutopilot) {
			this.inputPart.setPermissionLevel(ChatPermissionLevel.Autopilot);
		}

		const promptToUse = handoff.prompt;

		// Log telemetry
		const currentMode = this.input.currentModeObs.get();
		const toMode = handoff.agent ? this.input.currentChatModesObs.get().findModeByName(handoff.agent) : undefined;
		this.telemetryService.publicLog2<ChatHandoffClickEvent, ChatHandoffClickClassification>('chat.handoffClicked', {
			fromAgent: getModeNameForTelemetry(currentMode),
			toAgent: agentId || (toMode ? getModeNameForTelemetry(toMode) : ''),
			hasPrompt: Boolean(promptToUse),
			autoSend: Boolean(handoff.send)
		});

		this.executeHandoff(handoff, agentId).catch(e => {
			const target = agentId ?? handoff.agent ?? 'unknown';
			this.logService.error(`[Handoff] Failed to execute handoff '${handoff.label}' to '${target}'`, e);
		});
	}

	async executeHandoff(handoff: IHandOff, agentId?: string): Promise<void> {
		this.chatSuggestNextWidget.hide();

		const promptToUse = handoff.prompt;

		// If agentId is provided (from chevron dropdown), delegate to that chat session
		// Otherwise, switch to the handoff agent
		if (agentId) {
			// Delegate to chat session (e.g., @background or @cloud)
			this.input.setValue(`@${agentId} ${promptToUse}`, false);
			this.input.focus();
			// Auto-submit for delegated chat sessions
			this.acceptInput().catch(e => this.logService.error(`[Handoff] Failed to submit delegated handoff to '@${agentId}'`, e));
		} else if (handoff.agent) {
			// Regular handoff to specified agent
			const switched = await this._switchToAgentByName(handoff.agent);
			if (!switched) {
				this.logService.warn(`[Handoff] Did not execute handoff '${handoff.label}' to '${handoff.agent}' because switching agents was unsuccessful`);
				return;
			}
			// Switch to the specified model if provided
			const modelReady = handoff.model ? this.input.requestModelByQualifiedName([handoff.model]) : undefined;
			// Insert the handoff prompt into the input
			this.input.setValue(promptToUse, false);
			this.input.focus();

			// Auto-submit if send flag is true
			if (handoff.send) {
				if (modelReady && !await modelReady) {
					return;
				}
				this.acceptInput().catch(e => this.logService.error(`[Handoff] Failed to submit handoff to '${handoff.agent}'`, e));
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
		// In the regular workbench, only archive local chat sessions.
		// In the sessions window, allow archiving any session type after delegation.
		if (getChatSessionType(sessionResource) !== localChatSessionType && !IsSessionsWindowContext.getValue(this.contextKeyService)) {
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

	/**
	 * Mark the chat shown in this widget as read-only (non-interactive) or not.
	 * Read-only chats hide the composer and expose a context key so mutating
	 * actions (e.g. Start Over, Restore Checkpoint) are not offered.
	 */
	setReadOnly(readOnly: boolean): void {
		const wasReadOnly = this._readOnly;
		this._readOnly = readOnly;
		this._readOnlyContextKey.set(readOnly);
		if (readOnly) {
			if (this.viewModel?.editing) {
				this.finishedEditing();
			}
			this.chatSuggestNextWidget.hide();
			if (this.hasInputFocus()) {
				if (this.listWidget.focusLastItem(true) < 0) {
					this.listWidget.focus();
				}
			}
		} else if (wasReadOnly) {
			this.renderChatSuggestNextWidget();
		}
		this.readOnlyBanner?.setVisible(readOnly);
		this.setInputVisible(!readOnly);
		// Authoritative over the lock/unlock `editable` toggles below.
		this._applyRendererEditable(!readOnly);
		if (this.visible) {
			this.listWidget?.rerender();
		}
	}

	/**
	 * Applies the renderer's `editable` option, forcing it off while the chat is
	 * read-only so the lock/unlock transitions can never re-enable request
	 * editing on a read-only chat.
	 */
	private _applyRendererEditable(editable: boolean): void {
		this.listWidget?.updateRendererOptions({ editable: editable && !this._readOnly });
	}

	/**
	 * Show or hide the input part. Hidden inputs are removed from the DOM flow
	 * unless they contain persistent content. Used to render read-only chats
	 * without a composer while retaining input-adjacent status controls.
	 */
	setInputVisible(visible: boolean): void {
		const changed = this._inputVisible !== visible;
		this._inputVisible = visible;
		// Re-applied in `createInput` so a rebuilt input part keeps the correct visibility.
		this._applyInputVisibility();
		if (changed && this.bodyDimension) {
			this._layoutListForInputHeight();
		}
	}

	private _applyInputVisibility(): void {
		const inputElement = this.inputPartDisposable.value?.element;
		if (inputElement) {
			inputElement.classList.toggle('chat-input-hidden', !this._inputVisible);
			inputElement.style.display = '';
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
				defaultElementHeight: this.viewOptions.defaultElementHeight ?? 200,
				overflowWidgetsDomNode: overflowWidgetsContainer,
				styles: {
					listForeground: this.styles.listForeground,
					listBackground: this.styles.listBackground,
					listShadow: this.styles.listShadow,
				},
				currentChatMode: () => this.input.currentModeKind,
				filter: this.viewOptions.filter ? { filter: this.viewOptions.filter.bind(this.viewOptions) } : undefined,
				viewModel: this.viewModel,
				editorOptions: this.editorOptions,
				location: this.location,
				getSelectedModelRequestOptions: () => this.getSelectedModelRequestOptions(),
				getCurrentModeInfo: () => this.input.currentModeInfo,
				getEditingValue: () => this.input.inputEditor.getValue(),
				paddingBottom: this.viewOptions.persistentContentHeight,
			}
		));

		// Wire up ChatWidget-specific list widget events
		this._register(this.listWidget.onDidClickRequest(item => this.handleRequestClick(item)));

		this._register(this.listWidget.onDidRerender(item => {
			if (isRequestVM(item.currentElement) && this.configurationService.getValue<string>('chat.editRequests') !== 'input') {
				// Don't move the input into sticky scroll rows
				if (dom.findParentWithClass(item.rowContainer, 'monaco-tree-sticky-row')) {
					return;
				}
				if (!item.rowContainer.contains(this.inputContainer)) {
					item.requestTimestampContainer.before(this.inputContainer);
				}
				this.input.focus();
			}
		}));

		this._register(this.listWidget.onDidDispose(() => {
			this.focusedInputDOM.appendChild(this.inputContainer);
			this.input.focus();
		}));

		this._register(this.listWidget.onDidFocusOutside(() => {
			void this.cancelEditing();
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

	private handleRequestClick(item: IChatListItemTemplate): void {
		const currentElement = item.currentElement;
		if (dom.findParentWithClass(item.rowContainer, 'monaco-tree-sticky-row') && isRequestVM(currentElement)) {
			this.listWidget.reveal(currentElement, 0);
			const realTemplate = this.listWidget.getTemplateDataForRequestId(currentElement.id);
			if (realTemplate) {
				this.clickedRequest(realTemplate);
			}
			return;
		}
		this.clickedRequest(item);
	}

	startEditing(requestId: string): void {
		if (this._readOnly) {
			return;
		}

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
				const dedupKey = entry.range ? `${entry.id}:${entry.range.start}-${entry.range.endExclusive}` : entry.id;
				if (addedContextIds.has(dedupKey) || isWorkspaceVariableEntry(entry)) {
					return;
				}
				if ((isPromptFileVariableEntry(entry) || isPromptTextVariableEntry(entry)) && entry.automaticallyAdded) {
					return;
				}
				addedContextIds.add(dedupKey);
				currentContext.push(entry);
			};
			for (let i = requests.length - 1; i >= 0; i -= 1) {
				const request = requests[i];
				if (request.id === currentElement.id) {
					request.setShouldBeBlocked(false); // unblocking just this request.
					request.attachedContext?.forEach(addToContext);
				}
			}
			currentElement.variables.forEach(addToContext);

			// set states
			this.viewModel?.setEditing(currentElement);
			if (item?.contextKeyService) {
				ChatContextKeys.currentlyEditing.bindTo(item.contextKeyService).set(true);
			}

			const isEditingSentRequest = currentElement.pendingKind === undefined
				? ChatContextKeys.EditingRequestType.Sent
				: currentElement.pendingKind === ChatRequestQueueKind.Queued
					? ChatContextKeys.EditingRequestType.Queue
					: ChatContextKeys.EditingRequestType.Steer;
			const isInput = this.configurationService.getValue<string>('chat.editRequests') === 'input';
			this.inputPart?.setEditing(!!this.viewModel?.editing && isInput, isEditingSentRequest);

			if (!isInput) {
				this.inputContainer = dom.$('.chat-edit-input-container');
				item.requestTimestampContainer.before(this.inputContainer);
				this.createInput(this.inputContainer);
				this.input.setChatMode(this.inputPart.currentModeObs.get().id);
				this.input.setPermissionLevel(this.inputPart.currentModeInfo.permissionLevel ?? ChatPermissionLevel.Default);
				this.input.setEditing(true, isEditingSentRequest);
				this._onDidChangeActiveInputEditor.fire();
			} else {
				this.inputPart.element.classList.add('editing');
			}
			if (currentElement.modelId) {
				void this.input.requestModelByIdentifier(currentElement.modelId);
			}

			this.inputPart.toggleChatInputOverlay(!isInput);
			if (currentContext.length > 0) {
				this.input.attachmentModel.addContext(...currentContext);
			}

			// rerenders
			this.inputPart.dnd.setDisabledOverlay(!isInput);
			this.input.renderAttachedContext();
			this.input.setValue(currentElement.messageText, false);

			// restore dynamic variables in the model so decorations and parsing work
			const dynamicVariableModel = this.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
			const editorModel = this.input.inputEditor.getModel();
			if (dynamicVariableModel && editorModel) {
				const modelTextLength = editorModel.getValueLength();
				for (const entry of currentContext) {
					if (entry.range) {
						if (entry.range.start >= entry.range.endExclusive) {
							continue;
						}

						if (entry.range.start < 0 || entry.range.endExclusive > modelTextLength) {
							continue;
						}

						const startPos = editorModel.getPositionAt(entry.range.start);
						const endPos = editorModel.getPositionAt(entry.range.endExclusive);
						dynamicVariableModel.addReference({
							id: entry.id,
							range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
							data: entry.value,
							fullName: entry.fullName,
							icon: entry.icon,
							modelDescription: entry.modelDescription,
							isFile: entry.kind === 'file',
							isDirectory: entry.kind === 'directory',
						});
					}
				}
			}

			this._requestEditSnapshot = {
				input: this.getInput(),
				attachmentIds: this.input.attachmentModel.getAttachmentIDs(),
			};
			this._editingAutoScrollHold.value = this.listWidget.acquireAutoScrollHold();
			this.onDidChangeItems();
			this.input.inputEditor.focus();

			this._register(this.inputPart.onDidClickOverlay(() => {
				if (this.viewModel?.editing && this.configurationService.getValue<string>('chat.editRequests') !== 'input') {
					void this.cancelEditing();
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

	async cancelEditing(): Promise<void> {
		const editing = this.viewModel?.editing;
		if (!editing || this._requestEditCancellationPending) {
			return;
		}

		let confirmed = true;
		if (this._hasRequestEditChanges()) {
			this._requestEditCancellationPending = true;
			try {
				const result = await this.dialogService.confirm({
					type: 'warning',
					message: localize('chat.cancelEditing.confirm', "Discard Edits?"),
					detail: localize('chat.cancelEditing.confirmDetail', "Your changes to this request will be lost."),
					primaryButton: localize('chat.cancelEditing.discard', "Discard Edits"),
				});
				confirmed = result.confirmed;
			} finally {
				this._requestEditCancellationPending = false;
			}
		}

		if (this.viewModel?.editing !== editing) {
			return;
		}
		if (!confirmed) {
			this.input.focus();
			return;
		}

		this.finishedEditing();
	}

	private _hasRequestEditChanges(): boolean {
		const snapshot = this._requestEditSnapshot;
		if (!snapshot) {
			return false;
		}

		const attachmentIds = this.input.attachmentModel.getAttachmentIDs();
		return this.getInput() !== snapshot.input
			|| attachmentIds.size !== snapshot.attachmentIds.size
			|| [...attachmentIds].some(id => !snapshot.attachmentIds.has(id));
	}

	finishedEditing(completedEdit?: boolean): void {
		// reset states
		this._requestEditSnapshot = undefined;
		this._editingAutoScrollHold.clear();
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
			// The inline editor is self-contained: it shows the model its request ran on, submits
			// with it (see `acceptInput`, which reads the model from here before this runs), and
			// disappears. The bottom input keeps whatever the user left it on.
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
		this.inputPart?.setEditing(false, undefined);

		if (!isInput) {
			this._onDidChangeActiveInputEditor.fire();
		}

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
			editorOverflowWidgetsDomNode: this.editorOverflowWidgetsDomNode,
			enableImplicitContext: this.viewOptions.enableImplicitContext,
			renderWorkingSet: this.viewOptions.enableWorkingSet === 'explicit',
			supportsChangingModes: this.viewOptions.supportsChangingModes,
			dndContainer: this.viewOptions.dndContainer,
			inputEditorMinLines: this.viewOptions.inputEditorMinLines,
			isTransientChat: isTransientChat(this),
			widgetViewKindTag: this.getWidgetViewKindTag(),
			defaultMode: this.viewOptions.defaultMode,
			sessionTypePickerDelegate: this.viewOptions.sessionTypePickerDelegate,
			workspacePickerDelegate: this.viewOptions.workspacePickerDelegate,
			isSessionsWindow: this.viewOptions.isSessionsWindow,
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
			this.inlinePasteTargetRegistration.value = this.chatPasteTargetService.registerTarget(this.inlineInputPart.inputUri, this.pasteTarget);
		} else {
			this.inputPartDisposable.value = this.instantiationService.createInstance(ChatInputPart,
				this.location,
				commonConfig,
				this.styles,
				false
			);
			this.mainPasteTargetRegistration.value = this.chatPasteTargetService.registerTarget(this.inputPart.inputUri, this.pasteTarget);
			this._register(autorun(reader => {
				this.inputPart.height.read(reader);
				if (!this.listWidget) {
					// This is set up before the list/renderer are created
					return;
				}

				if (this.bodyDimension) {
					// Only re-layout the list/containers to match the new input
					// height. Do NOT re-call this.layout() here: the input part
					// has already laid itself out and re-entering inputPart.layout
					// creates a layout loop when the viewPane also reacts.
					this._layoutListForInputHeight();
				}

				this._onDidChangeContentHeight.fire();
			}));
		}

		this.input.render(container, '', this);
		this._gettingStartedTip.value = this.instantiationService.createInstance(
			ChatInputTipPresenter,
			{
				container: this.input.gettingStartedTipContainerElement,
				isEligible: () => this.isGettingStartedTipEligible(),
				focusInput: () => this.focusInput(),
			},
			this.input.noticeHost,
		);
		// Keep read-only chats' composer hidden if the input part was rebuilt.
		this._applyInputVisibility();
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
			} else if (!e.followup.agentId && e.followup.subCommand && this.chatSlashCommandService.hasCommand(e.followup.subCommand, getChatSessionType(this.viewModel.model.sessionResource))) {
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
		const foregroundSessionCountContextKeys = new Set([ChatContextKeys.foregroundSessionCount.key]);
		const hasByokModelsContextKeys = new Set([ChatEntitlementContextKeys.hasByokModels.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(foregroundSessionCountContextKeys) && this.isEmpty()) {
				this.renderGettingStartedTipIfNeeded();
			}
			if (e.affectsSome(hasByokModelsContextKeys)) {
				this.updateChatViewVisibility();
			}
		}));
		let previousModelIdentifier: string | undefined;
		this._register(autorun(reader => {
			const modelIdentifier = this.inputPart.selectedLanguageModel.read(reader)?.identifier;
			if (previousModelIdentifier === undefined) {
				previousModelIdentifier = modelIdentifier;
				return;
			}

			if (previousModelIdentifier === modelIdentifier) {
				return;
			}

			previousModelIdentifier = modelIdentifier;
			if (!this._gettingStartedTip.value?.current) {
				return;
			}

			// Re-selects the tip for the new model; promotion/rotation reaches the
			// rendered tip through `onDidNavigateTip`, so the result is unused here.
			this.chatTipService.getWelcomeTip(this.contextKeyService);
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

	/**
	 * Updates the widget's color styles after construction. Propagates the new
	 * list styles to the list widget, pushes the new color
	 * tokens into `editorOptions` so subscribers (code blocks, result/input editor
	 * backgrounds, container CSS variables) pick them up via `onDidChange`, and
	 * refreshes the CSS variables the chat container exposes for stylesheet rules.
	 */
	setStyles(styles: IChatWidgetStyles): void {
		const oldStyles = this.styles;
		this.styles = styles;

		// update list if needed
		const listColorsChanged =
			oldStyles.listBackground !== styles.listBackground ||
			oldStyles.listForeground !== styles.listForeground ||
			oldStyles.listShadow !== styles.listShadow;

		if (listColorsChanged) {
			this.listWidget?.setStyles({
				listForeground: styles.listForeground,
				listBackground: styles.listBackground,
				listShadow: styles.listShadow,
			});
		}

		// update editor colors if needed
		const editorColorsChanged =
			oldStyles.listForeground !== styles.listForeground ||
			oldStyles.inputEditorBackground !== styles.inputEditorBackground ||
			oldStyles.resultEditorBackground !== styles.resultEditorBackground;

		if (editorColorsChanged && this.container) {
			// Updating editorOptions fires onDidChange which triggers onDidStyleChange
			// and also propagates the new colors to subscribers like CodeBlockPart.
			this.editorOptions.setColors(styles.listForeground, styles.inputEditorBackground, styles.resultEditorBackground);
		}
	}


	setModel(model: IChatModel | undefined): void {
		if (!this.container || !this.inputPart) {
			// Widget hasn't finished rendering yet; skip rather than crash and
			// break the session view. Caller will re-invoke once rendered.
			this.logService.warn('ChatWidget#setModel called before render() completed');
			return;
		}

		const currentInputModel = this.viewModel?.model?.inputModel?.state?.get();
		if (!model) {
			this._pendingFirstRenderSessionResource = undefined;
			logChangesToStateModel(this.viewModel?.model?.inputModel, `ChatWidget.setModel to empty, old ${this.viewModel?.sessionResource.toString()}`, undefined, currentInputModel, this.logService);
			// Flush any unsent draft to the outgoing input model before we drop our
			// reference to it, so the host's `willDisposeModel` persistence sees it.
			this.inputPart.flushInputStateToModel();
			if (this.viewModel?.editing) {
				this.finishedEditing();
			}
			this.clearGettingStartedTip();
			this.viewModel = undefined;
			this.updateWorkingProgressBorder();
			this.onDidChangeItems();
			this._hasPendingRequestsContextKey.set(false);
			if (!this.viewOptions.isSessionsWindow) {
				this.setReadOnly(false);
			}
			return;
		}

		if (isEqual(model.sessionResource, this.viewModel?.sessionResource)) {
			return;
		}

		logChangesToStateModel(model.inputModel, `ChatWidget.setModel new ${model.sessionResource.toString()}, old ${this.viewModel?.sessionResource.toString()}`, model.inputModel.state.get(), currentInputModel, this.logService);

		if (this.viewModel?.editing) {
			this.finishedEditing();
		}
		this.inputPart?.clearTodoListWidget(model.sessionResource, false);
		this.inputPart?.clearArtifactsWidget();
		this.chatSuggestNextWidget.hide();
		this.chatTipService.resetSession();

		// Switching sessions resets tip service state; clear any rendered tip so
		// empty-state rendering picks a fresh, context-appropriate tip.
		this.clearGettingStartedTip();

		// Set the input model on the inputPart before assigning this.viewModel. Assigning this.viewModel
		// fires onDidChangeViewModel, which ChatInputPart listens to and expects the input model to be initialized.
		// Pass input model reference to input part for state syncing
		this.inputPart.setInputModel(model.inputModel, model.getRequests().length === 0, model.sessionResource);

		this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, undefined);
		if (!this.viewOptions.isSessionsWindow) {
			this.viewModelDisposables.add(autorun(reader => this.setReadOnly(model.isReadOnly.read(reader))));
		}

		this.listWidget.setViewModel(this.viewModel);
		// Armed only once the list is bound, so a render triggered while the
		// outgoing model was torn down cannot consume it.
		this._pendingFirstRenderSessionResource = model.sessionResource;

		if (this._lockedAgent) {
			let placeholder = this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id)?.inputPlaceholder;
			if (!placeholder) {
				placeholder = localize('chat.input.placeholder.lockedToAgent', "Chat with {0}", this._lockedAgent.displayName || this._lockedAgent.name);
			}
			this.viewModel.setInputPlaceholder(placeholder);
			this.inputEditor.updateOptions({ placeholder });
		} else if (this.viewModel.inputPlaceholder) {
			this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
		}

		this.viewModelDisposables.add(Event.runAndSubscribe(Event.accumulate(this.viewModel.onDidChange), (events => {
			if (!this.viewModel || this._store.isDisposed) {
				// See https://github.com/microsoft/vscode/issues/278969
				return;
			}

			this.requestInProgress.set(this.viewModel.model.requestInProgress.get());
			this.hasActiveRequest.set(this.viewModel.model.hasActiveRequest.get());
			this.updateWorkingProgressBorder();

			// Update the editor's placeholder text when it changes in the view model
			if (events?.some(e => e?.kind === 'changePlaceholder')) {
				this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
			}

			this.onDidChangeItems();
			if (events?.some(e => e?.kind === 'addRequest') && this.visible && !this.listWidget.isAutoScrollHeld) {
				this.listWidget.scrollToEnd();
			}
			this._onDidChangeFindableContent.fire();
		})));
		this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
			// Ensure that view state is saved here, because we will load it again when a new model is assigned
			if (this.viewModel?.editing) {
				this.finishedEditing();
			}
			// Disposes the viewmodel and listeners
			this.viewModel = undefined;
			this.updateWorkingProgressBorder();
			this.onDidChangeItems();
		}));
		this._sessionIsEmptyContextKey.set(model.getRequests().length === 0);
		const updateSupportsFork = () => {
			const supportsFork = this.chatSessionsService.sessionSupportsFork(model.sessionResource);
			this._chatSessionSupportsForkContextKey.set(supportsFork);
			this.listWidget?.updateRendererOptions({ supportsFork });
		};
		updateSupportsFork();
		this.viewModelDisposables.add(this.chatSessionsService.onDidChangeAvailability(() => updateSupportsFork()));
		this._sessionHasDebugDataContextKey.set(this.chatDebugService.getEvents(model.sessionResource).length > 0);
		let lastSteeringCount = 0;
		const updatePendingRequestKeys = (announceSteering: boolean) => {
			const pendingRequests = model.getPendingRequests();
			const pendingCount = pendingRequests.length;
			this._hasPendingRequestsContextKey.set(pendingCount > 0);
			const steeringCount = pendingRequests.filter(pending => pending.kind === ChatRequestQueueKind.Steering).length;
			if (announceSteering && steeringCount > 0 && lastSteeringCount === 0) {
				status(localize('chat.pendingRequests.steeringQueued', "Steering"));
			}
			lastSteeringCount = steeringCount;
		};
		updatePendingRequestKeys(false);
		this.viewModelDisposables.add(model.onDidChangePendingRequests(() => updatePendingRequestKeys(true)));

		this.refreshParsedInput();
		this.viewModelDisposables.add(model.onDidChange((e) => {
			if (e.kind === 'setAgent') {
				this._onDidChangeAgent.fire({ agent: e.agent, slashCommand: e.command });
				// Update capabilities context keys when agent changes
				this._updateAgentCapabilitiesContextKeys(e.agent);
			}
			if (e.kind === 'addRequest') {
				this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, false);
				this._sessionIsEmptyContextKey.set(false);
				this.chatSuggestNextWidget.hide();
			}
			// Hide widget on request removal
			if (e.kind === 'removeRequest') {
				this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
				this.chatSuggestNextWidget.hide();
				this._sessionIsEmptyContextKey.set((this.viewModel?.model.getRequests().length ?? 0) === 0);
			}
			// Show next steps widget when response completes (not when request starts)
			if (e.kind === 'completedRequest') {
				const lastRequest = this.viewModel?.model.getRequests().at(-1);
				const wasCancelled = lastRequest?.response?.isCanceled ?? false;
				if (wasCancelled) {
					// Clear todo list when request is cancelled
					this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
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

		this.renderChatSuggestNextWidget();
		this.updateChatInputContext();
		this.input.renderChatTodoListWidget(this.viewModel.sessionResource);
		this.input.renderArtifactsWidget(this.viewModel.sessionResource);
	}

	setLoading(isLoading: boolean): void {
		this._isLoading = isLoading;
		this.renderGettingStartedTipIfNeeded();
	}

	getFocus(): ChatTreeItem | undefined {
		return this.listWidget.getFocus()[0] ?? undefined;
	}

	reveal(item: ChatTreeItem, relativeTop?: number): void {
		this.listWidget.reveal(item, relativeTop);
	}

	/**
	 * The top offset of an item in transcript content space (same space as
	 * `scrollTop`/`scrollHeight`), or `undefined` if it is not in the list.
	 * Virtualization-safe for off-screen items (reads the layout height model).
	 */
	getElementTop(item: ChatTreeItem): number | undefined {
		return this.listWidget.getElementTop(item);
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
	lockToCodingAgent(name: string, displayName: string, agentId: string, agentHostProviderId?: string): void {
		if (this._lockedAgent?.id === agentId && this._lockedAgent.name === name && this._lockedAgent.displayName === displayName && this._lockedAgent.agentHostProviderId === agentHostProviderId) {
			return;
		}

		this._lockedAgent = {
			id: agentId,
			name,
			prefix: `@${name} `,
			displayName,
			agentHostProviderId
		};
		this._lockedToCodingAgentContextKey.set(true);
		this._lockedCodingAgentIdContextKey.set(agentId);
		this._chatIsAgentHostSessionContextKey.set(!!agentHostProviderId);
		this._chatAgentHostProviderIdContextKey.set(agentHostProviderId ?? '');
		this._updateAgentHostWorkingDirectoryContextKeys(agentHostProviderId);
		this._updateFolderPickerDecision();
		this.renderWelcomeViewContentIfNeeded();
		// Update capabilities for the locked agent
		const agent = this.chatAgentService.getAgent(agentId);
		this._updateAgentCapabilitiesContextKeys(agent);
		const supportsCheckpoints = this._attachmentCapabilities.supportsCheckpoints ?? false;
		this.listWidget?.updateRendererOptions({ restorable: supportsCheckpoints, editable: supportsCheckpoints && !this._readOnly, noFooter: false, progressMessageAtBottomOfResponse: true });
		if (this.visible) {
			this.listWidget?.rerender();
		}
	}

	unlockFromCodingAgent(): void {
		if (!this._lockedAgent) {
			return;
		}

		// Clear all state related to locking
		this._lockedAgent = undefined;
		this._lockedToCodingAgentContextKey.set(false);
		this._lockedCodingAgentIdContextKey.set('');
		this._chatIsAgentHostSessionContextKey.set(false);
		this._chatAgentHostProviderIdContextKey.set('');
		this._chatAgentHostHasImmutablePrimaryWorkingDirectoryContextKey.set(false);
		this._chatAgentHostFolderPickerVisibleContextKey.set(false);
		this._folderPickerDecisionSessionResource = undefined;
		this._chatSessionSupportsForkContextKey.set(false);
		this._updateAgentCapabilitiesContextKeys(undefined);

		// Explicitly update the DOM to reflect unlocked state
		this.renderWelcomeViewContentIfNeeded();

		// Reset to default placeholder
		if (this.viewModel) {
			this.viewModel.resetInputPlaceholder();
		}
		this.inputEditor?.updateOptions({ placeholder: undefined });
		this.listWidget?.updateRendererOptions({ restorable: true, editable: !this._readOnly, progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask });
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
		if (this._readOnly || this.input.hasPendingProgrammaticModelSelection) {
			return undefined;
		}

		if (!options?.preserveInput) {
			// preserveInput submissions (e.g. /compact or programmatic maintenance
			// requests) leave the input draft untouched, so they must not stop an
			// unrelated dictation and flush its final transcript into that draft.
			await stopDictationForEditor(this.inputEditor);
		}

		if (this.viewModel) {
			markChat(this.viewModel.sessionResource, ChatPerfMark.RequestStart);
		}
		return this._acceptInput(query ? { query } : undefined, options);
	}

	async rerunLastRequest(): Promise<void> {
		if (this._readOnly || !this.viewModel) {
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
			...this.getSelectedModelRequestOptions(),
			modeInfo: this.input.currentModeInfo,
		};
		const result = await this.chatService.resendRequest(lastRequest, options);
		this.logThinkingStyleUsage('rerun');
		return result;
	}

	private getConfiguredThinkingStyle(): ThinkingDisplayMode {
		const thinkingStyle = this.configurationService.getValue<ThinkingDisplayMode>(ChatConfiguration.ThinkingStyle);
		switch (thinkingStyle) {
			case ThinkingDisplayMode.Collapsed:
			case ThinkingDisplayMode.CollapsedPreview:
			case ThinkingDisplayMode.FixedScrolling:
				return thinkingStyle;
			default:
				return ThinkingDisplayMode.FixedScrolling;
		}
	}

	private logThinkingStyleUsage(requestKind: ChatThinkingStyleUsageEvent['requestKind']): void {
		this.telemetryService.publicLog2<ChatThinkingStyleUsageEvent, ChatThinkingStyleUsageClassification>('chat.thinkingStyleUsage', {
			thinkingStyle: this.getConfiguredThinkingStyle(),
			location: this.location,
			requestKind,
		});
	}

	private _cancelGoalSummary(): void {
		this._goalSummaryTokenSource?.dispose(true);
		this._goalSummaryTokenSource = undefined;
	}

	private _maybeStartGoalSummary(prompt: string): void {
		const inputPart = this.inputPartDisposable.value;
		if (!inputPart) {
			return;
		}

		// The advanced autopilot goal banner is only supported in the local chat
		// harness. Agent-host backed sessions (Copilot CLI, Claude, Codex and the
		// local/remote agent hosts) must never render it.
		const sessionResource = this.viewModel?.model.sessionResource;
		const isLocalHarness = !!sessionResource && getChatSessionType(sessionResource) === localChatSessionType;
		const permissionLevel = inputPart.currentModeInfo?.permissionLevel;
		const goalModeOn = this.configurationService.getValue<boolean>(ChatConfiguration.AutopilotAdvancedEnabled) === true;
		if (!isLocalHarness || permissionLevel !== ChatPermissionLevel.Autopilot || !goalModeOn) {
			this._cancelGoalSummary();
			inputPart.clearGoalBanner();
			return;
		}

		// Reset per-request dismissal state and (re)bind the dismiss listener to the
		// current input part. A MutableDisposable disposes any prior binding, so this
		// stays correct even if the input part is recreated.
		this._goalBannerDismissedForCurrentRequest = false;
		this._goalBannerDismissListener.value = inputPart.onDidDismissGoalBanner(() => {
			this._goalBannerDismissedForCurrentRequest = true;
			this._cancelGoalSummary();
		});

		this._cancelGoalSummary();
		const cts = new CancellationTokenSource();
		this._goalSummaryTokenSource = cts;
		inputPart.showGoalBannerLoading();

		this.chatGoalSummaryService.summarize(prompt, cts.token).then(summary => {
			if (cts.token.isCancellationRequested || this._goalBannerDismissedForCurrentRequest) {
				return;
			}
			const current = this.inputPartDisposable.value;
			if (!current) {
				return;
			}
			if (summary) {
				current.setGoalBanner(summary);
			} else {
				current.clearGoalBanner();
			}
		}, () => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			this.inputPartDisposable.value?.clearGoalBanner();
		});
	}

	/**
	 * @returns `false` when the prompt metadata requested an agent switch that the
	 * user cancelled, signalling that input submission should be aborted.
	 */
	private async _applyPromptFileIfSet(requestInput: IChatRequestInputOptions, sessionResource: URI): Promise<boolean> {
		// first check if the input has a prompt slash command
		const agentSlashPromptPart = this.parsedInput.parts.find((r): r is ChatRequestSlashPromptPart => r instanceof ChatRequestSlashPromptPart);
		if (!agentSlashPromptPart) {
			return true;
		}

		// Prompt slash commands are transformed out of the input before sendRequest.
		// Track them now so tip exclusions still update for commands like /init.
		this.chatTipService.recordSlashCommandUsage(agentSlashPromptPart.name);

		// need to resolve the slash command to get the prompt file
		const slashCommand = await this.customizationHarnessService.resolvePromptSlashCommand(agentSlashPromptPart.name, sessionResource, CancellationToken.None);
		if (!slashCommand) {
			return true;
		}
		const parseResult = slashCommand.parsedPromptFile;
		// add the prompt file to the context
		const refs = parseResult.body?.variableReferences.map(({ name, offset, fullLength }) => ({ name, range: new OffsetRange(offset, offset + fullLength) })) ?? [];
		const toolReferences = this.toolsService.toToolReferences(refs);
		requestInput.attachedContext.insertFirst(toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, undefined, true, toolReferences));

		const promptRunEvent: ChatPromptRunEvent = {
			storage: slashCommand.storage,
		};
		if (slashCommand.extension) {
			promptRunEvent.extensionId = slashCommand.extension.identifier.value;
			promptRunEvent.promptName = slashCommand.name;
		} else {
			promptRunEvent.promptNameHash = hash(slashCommand.name).toString(16);
		}
		this.telemetryService.publicLog2<ChatPromptRunEvent, ChatPromptRunClassification>('chat.promptRun', promptRunEvent);

		if (parseResult.header) {
			const applied = await this._applyPromptMetadata(parseResult.header, requestInput);
			if (!applied) {
				return false;
			}
		}

		return true;
	}

	private async _acceptInput(query: { query: string } | undefined, options: IChatAcceptInputOptions = {}): Promise<IChatResponseModel | undefined> {
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

		let savedBeforeSend = false;
		// Check if a custom submit handler wants to handle this submission
		if (this.viewOptions.submitHandler) {
			if (this._submitHandlerInFlight) {
				return;
			}
			this._submitHandlerInFlight = true;
			try {
				const inputValue = !query ? this.getInput() : query.query;
				await saveAllBeforeChatSend(this.configurationService, this.editorService);
				savedBeforeSend = true;
				const attachedContext = this.input.getAttachedContext().asArray();
				const handled = await this.viewOptions.submitHandler(inputValue, this.input.currentModeKind, attachedContext, options.isVoiceModeInput);
				if (handled) {
					return;
				}
			} finally {
				this._submitHandlerInFlight = false;
			}
		}

		const isUserQuery = !query;
		const inputValue = isUserQuery ? this.getInput() : query.query;
		if (this.viewModel.model.hasActiveRequest.get() && await this._tryExecuteImmediateSlashCommand(inputValue, isUserQuery ? this.parsedInput : undefined)) {
			this.setInput('');
			return;
		}
		if (isUserQuery) {
			const preSubmitResult = await this.chatSubmitRequestHandlerService.tryHandle({
				sessionResource: this.viewModel.sessionResource,
				input: inputValue,
			});
			if (preSubmitResult) {
				this.setInput('');
				return;
			}
		}

		if (!savedBeforeSend) {
			await saveAllBeforeChatSend(this.configurationService, this.editorService);
		}

		if (!options.preserveInput) {
			// Would stop dictation the preserved draft may still be using.
			this._onDidAcceptInput.fire();
		}
		this.listWidget.setScrollLock(this.isLockedToCodingAgent || !!checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll));

		const requestInputs: IChatRequestInputOptions = {
			input: inputValue,
			// preserveInput means the input box holds an unrelated draft, so its
			// attachments belong to that draft and must not be sent with this query.
			attachedContext: options?.preserveInput
				? new ChatRequestVariableSet()
				: options?.enableImplicitContext === false ? this.input.getAttachedContext() : this.input.getAttachedAndImplicitContext(),
		};

		const attachedContext = this._getAttachedContextForConcurrentSlashCommand(options.preserveInput);
		if (await this._executeSlashCommandDuringRequest(requestInputs.input, { attachedContext }, isUserQuery, options.preserveFocus)) {
			return;
		}
		const isEditing = this.viewModel?.editing;
		const submittedFromEditing = shouldUnlockChatPetRequestRevision(isEditing !== undefined, isUserQuery);
		// Captured before `finishedEditing` tears the inline editor down, while `this.input` still
		// resolves to it. The inline editor owns the model and mode for a resubmit — those are the
		// pickers the user actually chose in — so these stay authoritative over the bottom input.
		const isInlineEdit = isEditing && this.configurationService.getValue<string>('chat.editRequests') !== 'input';
		const editedModelRequestOptions = isInlineEdit ? this.getSelectedModelRequestOptions() : undefined;
		const editedModeKind = isInlineEdit ? this.input.currentModeKind : undefined;
		const editedModeInfo = isInlineEdit ? this.input.currentModeInfo : undefined;
		// Tools and instruction routing belong to the mode, so they come from the same editor at the
		// same moment.
		const editedModeRequestOptions = isInlineEdit ? this.getModeRequestOptions() : undefined;
		const editedInstructionRouting = isInlineEdit ? this._getInstructionRouting() : undefined;
		let cancelledCurrentRequest = false;
		if (isEditing) {
			// Clear the carousel since the existing request is being replaced
			this.inputPart?.clearToolConfirmationCarousel();

			const editingPendingRequest = this.viewModel.editing!.pendingKind;
			if (editingPendingRequest !== undefined) {
				const editingRequestId = this.viewModel.editing!.id;
				this.chatService.removePendingRequest(this.viewModel.sessionResource, editingRequestId);
				if (!options.cancelCurrentRequest) {
					options.queue ??= editingPendingRequest;
				}
			} else {
				await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, 'acceptInput-editing');
				cancelledCurrentRequest = true;
				options.queue = undefined;
			}

			// For agents that support checkpoints, preserve the checkpoint
			// through finishedEditing so blocked requests are removed below
			// and the agent host can dispatch a protocol truncation action.
			const preserveCheckpoint = this._lockedAgent && !!this._attachmentCapabilities.supportsCheckpoints;
			if (preserveCheckpoint) {
				this.recentlyRestoredCheckpoint = true;
			}
			this.finishedEditing(true);
			if (!preserveCheckpoint) {
				this.viewModel.model?.setCheckpoint(undefined);
			}
		}

		const model = this.viewModel.model;
		if (options.cancelCurrentRequest && model.requestInProgress.get() && !cancelledCurrentRequest) {
			await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, 'acceptInput-stopAndSend');
			cancelledCurrentRequest = true;
			options.queue = undefined;
		}
		const requestInProgress = model.requestInProgress.get();
		// Cancel the request if the user chooses to take a different path.
		// This is a bit of a heuristic for the common case of tool confirmation+reroute.
		// But we don't do this if there are queued messages, because we would either
		// discard them or need a prompt (as in `confirmPendingRequestsBeforeSend`)
		// which could be a surprising behavior if the user finishes typing a steering
		// request just as confirmation is triggered.
		if (!options.cancelCurrentRequest && model.requestNeedsInput.get() && !model.getPendingRequests().length) {
			await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, 'acceptInput-needsInput');
			options.queue ??= ChatRequestQueueKind.Queued;
		}
		if (requestInProgress && !options.cancelCurrentRequest) {
			options.queue ??= ChatRequestQueueKind.Queued;
		}
		if (!requestInProgress && !isEditing && !(await this.confirmPendingRequestsBeforeSend(model, options))) {
			return;
		}

		// process the prompt command
		// Skipped for preserveInput: parsedInput is the draft, and an agent switch can clear the session.
		if (!options.preserveInput) {
			const promptApplied = await this._applyPromptFileIfSet(requestInputs, this.viewModel.sessionResource);
			if (!promptApplied) {
				return;
			}
		}

		if (this.viewOptions.enableWorkingSet !== undefined && resolveEditedRequestSelection(editedModeKind, this.input.currentModeKind) === ChatModeKind.Edit) {
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
				if (request.shouldBeBlocked.get() || request === this.viewModel.model.checkpoint) {
					this.chatService.removeRequest(this.viewModel.sessionResource, request.id);
				}
			}
			this.viewModel.model.setCheckpoint(undefined);
		}

		// Expand directory attachments: extract images as binary entries
		const resolvedImageVariables = await this._resolveDirectoryImageAttachments(requestInputs.attachedContext.asArray());
		const submittedWithImage = isUserQuery && hasChatPetImageAttachment([
			...requestInputs.attachedContext.asArray(),
			...resolvedImageVariables,
		]);
		const submittedSessionResource = this.viewModel.sessionResource;

		// For contributed session types, only collect automatic instructions when
		// the contribution explicitly opts in via autoAttachReferences.
		const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : undefined;
		const autoAttachEnabled = contribution ? contribution.autoAttachReferences === true : true;

		const modeKind = resolveEditedRequestSelection(editedModeKind, this.input.currentModeKind);
		const modeInfo = resolveEditedRequestSelection(editedModeInfo, this.input.currentModeInfo);
		const selectedModelRequestOptions = resolveEditedRequestSelection(editedModelRequestOptions, this.getSelectedModelRequestOptions());

		const transcriptContext = this.transcriptContextValue;
		if (transcriptContext) {
			requestInputs.attachedContext.insertFirst(transcriptContext);
			this.setTranscriptContext(undefined);
		}
		let result: ChatSendResult;
		try {
			result = await this.chatService.sendRequest(this.viewModel.sessionResource, requestInputs.input, {
				...selectedModelRequestOptions,
				location: this.location,
				locationData: this._location.resolveData?.(),
				parserContext: { selectedAgent: this._lastSelectedAgent, mode: modeKind, attachmentCapabilities: this._lastSelectedAgent?.capabilities ?? this.attachmentCapabilities },
				attachedContext: requestInputs.attachedContext.asArray(),
				resolvedVariables: resolvedImageVariables,
				noCommandDetection: options?.noCommandDetection,
				isVoiceModeInput: options?.isVoiceModeInput,
				...resolveEditedRequestSelection(editedModeRequestOptions, this.getModeRequestOptions()),
				modeInfo,
				agentIdSilent: this._lockedAgent?.id,
				queue: options?.queue,
				instructionContext: autoAttachEnabled ? {
					modeKind,
					...resolveEditedRequestSelection(editedInstructionRouting, this._getInstructionRouting()),
				} : undefined,
			});
		} catch (error) {
			if (transcriptContext) {
				this.setTranscriptContext(transcriptContext);
			}
			throw error;
		}

		if (ChatSendResult.isRejected(result)) {
			if (transcriptContext) {
				this.setTranscriptContext(transcriptContext);
			}
			if (result.newSessionResource) {
				const newModel = this.chatService.getSession(result.newSessionResource);
				if (newModel) {
					this.setModel(newModel);
				}
			}
			return;
		}

		this.logThinkingStyleUsage('submit');

		// visibility sync before firing events to hide the welcome view
		this.updateChatViewVisibility();
		this.input.acceptInput(options?.storeToHistory ?? isUserQuery, options?.preserveFocus, options?.preserveInput);

		if (!options.preserveInput) {
			// A maintenance command is not the user's goal.
			this._maybeStartGoalSummary(requestInputs.input);
		}

		const shouldUnlockQueueOrSteeringMessage = shouldUnlockChatPetQueueOrSteeringMessage(isUserQuery, options.queue);
		const sent = await acceptAndAwaitSentRequest(result, () => {
			if (shouldUnlockQueueOrSteeringMessage) {
				this.chatPetService.unlockAchievement(ChatPetAchievementIds.QueueOrSteeringMessage);
			}
			options.onRequestAccepted?.();
		});
		if (!sent) {
			return;
		}
		if (isUserQuery) {
			this.chatPetService.unlockAchievement(ChatPetAchievementIds.FirstChatMessage);
		}
		if (submittedFromEditing) {
			this.chatPetService.unlockAchievement(ChatPetAchievementIds.RequestRevision);
		}
		if (submittedWithImage) {
			this.chatPetService.unlockAchievement(ChatPetAchievementIds.ImageRequest);
		}
		if (!options.preserveInput) {
			// Not a user submission; listeners would consume draft state. Also skips editor pinning.
			this._onDidSubmitAgent.fire({ agent: sent.data.agent, slashCommand: sent.data.slashCommand });
		}
		this.handleDelegationExitIfNeeded(this._lockedAgent, sent.data.agent);

		// If the session was replaced (untitled -> real contributed session), swap the widget's model
		if (sent.newSessionResource) {
			const newModel = this.chatService.getSession(sent.newSessionResource);
			if (newModel) {
				this.setModel(newModel);
			}
		}

		sent.data.responseCreatedPromise.then(() => {
			// Only start accessibility progress once a real request/response model exists.
			this.chatAccessibilityService.acceptRequest(submittedSessionResource);
			sent.data.responseCompletePromise.then(() => {
				const responses = this.viewModel?.getItems().filter(isResponseVM);
				const lastResponse = responses?.[responses.length - 1];
				this.chatAccessibilityService.acceptResponse(this, this.container, lastResponse, submittedSessionResource, options?.isVoiceInput);
				if (lastResponse?.result?.nextQuestion) {
					const { prompt, participant, command } = lastResponse.result.nextQuestion;
					const question = formatChatQuestion(this.chatAgentService, this.location, prompt, participant, command);
					if (question) {
						this.input.setValue(question, false);
					}
				}
			});
		});

		return sent.data.responseCreatedPromise;
	}

	private _getAttachedContextForConcurrentSlashCommand(preserveInput: boolean | undefined): IChatRequestVariableEntry[] {
		return preserveInput ? [] : this.input.getAttachedContext().asArray();
	}

	private async _executeSlashCommandDuringRequest(input: string, requestOptions: IChatSendRequestOptions, storeToHistory: boolean, preserveFocus: boolean | undefined): Promise<boolean> {
		const viewModel = this.viewModel;
		if (!viewModel?.model.hasActiveRequest.get()) {
			return false;
		}
		const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(
			viewModel.sessionResource,
			input,
			this.location,
			{
				selectedAgent: this._lastSelectedAgent,
				mode: this.input.currentModeKind,
				attachmentCapabilities: this.attachmentCapabilities,
				forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : undefined,
			},
		);
		const commandPart = parsedRequest.parts.find((part): part is ChatRequestSlashCommandPart => part instanceof ChatRequestSlashCommandPart);
		if (!commandPart?.slashCommand.executeDuringRequest || commandPart.slashCommand.silent !== true) {
			return false;
		}

		const history: IChatMessage[] = [];
		for (const request of viewModel.model.getRequests()) {
			if (!request.response) {
				continue;
			}
			history.push({ role: ChatMessageRole.User, content: [{ type: 'text', value: request.message.text }] });
			history.push({ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: request.response.response.toString() }] });
		}

		this.input.acceptInput(storeToHistory, preserveFocus);
		const prompt = parsedRequest.text.slice(commandPart.range.endExclusive).trimStart();
		try {
			await this.chatSlashCommandService.executeCommand(
				commandPart.slashCommand.command,
				prompt,
				Progress.None,
				history,
				this.location,
				viewModel.sessionResource,
				CancellationToken.None,
				requestOptions,
			);
		} finally {
			clearChatMarks(viewModel.sessionResource);
		}
		return true;
	}

	// Resolve images from directory attachments to send as additional variables.
	private async _resolveDirectoryImageAttachments(attachments: IChatRequestVariableEntry[]): Promise<IChatRequestVariableEntry[]> {
		const imagePromises: Promise<IChatRequestVariableEntry[]>[] = [];

		for (const attachment of attachments) {
			if (attachment.kind === 'directory' && URI.isUri(attachment.value)) {
				imagePromises.push(
					this.chatAttachmentResolveService.resolveDirectoryImages(attachment.value)
				);
			}
		}

		if (imagePromises.length === 0) {
			return [];
		}

		const resolved = await Promise.all(imagePromises);
		return resolved.flat();
	}

	private async _tryExecuteImmediateSlashCommand(input: string, parsedInput: IParsedChatRequest | undefined): Promise<boolean> {
		const viewModel = this.viewModel;
		if (!viewModel) {
			return false;
		}
		const parsedRequest = parsedInput ?? this.instantiationService.createInstance(ChatRequestParser)
			.parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), input, this.location, {
				selectedAgent: this._lastSelectedAgent,
				mode: this.input.currentModeKind,
				attachmentCapabilities: this.attachmentCapabilities,
				forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : undefined,
				sessionType: getChatSessionType(viewModel.model.sessionResource)
			});
		const commandPart = getImmediateSilentSlashCommandPart(parsedRequest);
		if (!commandPart) {
			return false;
		}

		const history: IChatMessage[] = [];
		for (const request of viewModel.model.getRequests()) {
			if (!request.response) {
				continue;
			}
			history.push({ role: ChatMessageRole.User, content: [{ type: 'text', value: request.message.text }] });
			history.push({ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: request.response.response.toString() }] });
		}

		const command = commandPart.slashCommand.command;
		await this.chatSlashCommandService.executeCommand(
			command,
			input.slice(commandPart.range.endExclusive).trimStart(),
			new Progress(() => { }),
			history,
			this.location,
			viewModel.sessionResource,
			CancellationToken.None,
		);
		return true;
	}

	private async confirmPendingRequestsBeforeSend(model: IChatModel, options: IChatAcceptInputOptions): Promise<boolean> {
		if (options.queue) {
			return true;
		}

		const hasPendingRequests = model.getPendingRequests().length > 0;
		if (!hasPendingRequests) {
			return true;
		}

		const promptResult = await this.dialogService.prompt({
			type: 'question',
			message: localize('chat.pendingRequests.prompt.message', "You already have pending requests."),
			detail: localize('chat.pendingRequests.prompt.detail', "Do you want to keep them in the queue or remove them before sending this message?"),
			buttons: [
				{
					label: localize('chat.pendingRequests.prompt.keep', "Keep Pending Requests"),
					run: () => 'keep'
				},
				{
					label: localize('chat.pendingRequests.prompt.remove', "Remove Pending Requests"),
					run: () => 'remove'
				}
			],
			cancelButton: true
		});

		if (!promptResult.result) {
			return false;
		}

		if (promptResult.result === 'remove') {
			for (const pendingRequest of [...model.getPendingRequests()]) {
				this.chatService.removePendingRequest(model.sessionResource, pendingRequest.request.id);
			}
		}

		return true;
	}

	// Keep the selected model and its editor-scoped configuration together so
	// resend/confirmation flows preserve custom per-model settings.
	getSelectedModelRequestOptions(): Pick<IChatSendRequestOptions, 'userSelectedModelId' | 'userSelectedModelConfiguration'> {
		const modelId = this.input.currentLanguageModel;
		return {
			userSelectedModelId: modelId,
			userSelectedModelConfiguration: modelId ? this.input.getModelConfiguration(modelId) : undefined,
		};
	}

	/** The tool and subagent routing of whichever input this is called on, for its current mode. */
	private _getInstructionRouting(): Pick<NonNullable<IChatSendRequestOptions['instructionContext']>, 'enabledTools' | 'enabledSubAgents'> {
		const isAgent = this.input.currentModeKind === ChatModeKind.Agent;
		return {
			enabledTools: isAgent ? this.input.selectedToolsModel.userSelectedTools.get() : undefined,
			enabledSubAgents: isAgent ? this.input.currentModeObs.get().agents?.get() : undefined,
		};
	}

	getModeRequestOptions(): Partial<IChatSendRequestOptions> {
		if (!this.inputPartDisposable.value) {
			return {};
		}

		const sessionResource = this.viewModel?.sessionResource;
		const capturedModeId = this.input.currentModeObs.get().id;
		const userSelectedTools = this.input.selectedToolsModel.userSelectedTools;

		let lastToolsSnapshot = userSelectedTools.get();

		// When the widget has loaded a new session, return a snapshot of the tools for this session.
		// Only sync with the tools model when this session is shown with the same mode.
		const scopedTools = derived(reader => {
			if (this._store.isDisposed) {
				return lastToolsSnapshot;
			}
			const activeSession = this._viewModelObs.read(reader)?.sessionResource;
			const currentModeId = this.input.currentModeObs.read(reader).id;
			if (isEqual(activeSession, sessionResource) && currentModeId === capturedModeId) {
				const tools = userSelectedTools.read(reader);
				lastToolsSnapshot = tools;
				return tools;
			}
			return lastToolsSnapshot;
		});

		return {
			modeInfo: this.input.currentModeInfo,
			userSelectedTools: scopedTools,
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

	getElementFromNode(node: HTMLElement): ChatTreeItem | undefined {
		return this.listWidget.getElementFromNode(node);
	}

	getFindController(): IChatFindController | undefined {
		return this._findController;
	}

	/** @internal Used by {@link ChatFindWidget} to locate a row's rendered template. Not part of `IChatWidget`. */
	getTemplateDataForRequestId(requestId: string | undefined): IChatListItemTemplate | undefined {
		return this.listWidget.getTemplateDataForRequestId(requestId);
	}

	/** @internal Used by {@link ChatFindWidget} to know when a row remounts. Not part of `IChatWidget`. */
	get onDidRerenderRow(): Event<IChatListItemTemplate> {
		return this.listWidget.onDidRerender;
	}

	focusResponseItem(lastFocused?: boolean): void {
		this.listWidget.focusLastItem(lastFocused);
	}

	setInputPartMaxHeightOverride(maxHeight: number | undefined): void {
		this.inputPartMaxHeightOverride = maxHeight;
	}

	layout(height: number, width: number): void {
		width = Math.min(width, this.viewOptions.renderStyle === 'minimal' ? width : 950); // no min width of inline chat

		this.bodyDimension = new dom.Dimension(width, height);
		this._findController?.layout(width);

		if (this.viewModel?.editing) {
			this.inlineInputPart?.layout(width);
		}

		const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
		const inputMaxHeight = this._dynamicMessageLayoutData || this.location !== ChatAgentLocation.Chat
			? undefined
			: this.inputPartMaxHeightOverride !== undefined
				? Math.max(0, this.inputPartMaxHeightOverride - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT)
				: Math.max(0, height - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT);
		this.inputPart.setMaxHeight(inputMaxHeight);
		this.inputPart.layout(width);

		this._layoutListForInputHeight();
		this._onDidLayout.fire({ width, height });
	}

	/**
	 * Updates the widget's available space after the intrinsic input height changed.
	 * The input has already laid itself out, so this only resizes the list-side
	 * surfaces and must not call {@link ChatInputPart.layout}.
	 */
	layoutForInputHeight(height: number, width: number): void {
		width = Math.min(width, this.viewOptions.renderStyle === 'minimal' ? width : 950);
		this.bodyDimension = new dom.Dimension(width, height);
		this._layoutListForInputHeight();
	}

	/**
	 * Re-layout just the list, welcome container, and list container to match
	 * the current input-part height. Called both from {@link layout} and from
	 * the inputPart.height autorun so we never re-enter inputPart.layout when
	 * only the input height changed.
	 */
	private _layoutListForInputHeight(): void {
		if (!this.bodyDimension) {
			return;
		}

		const { height, width } = this.bodyDimension;
		const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;

		const inputHeight = this._inputVisible ? this.inputPart.height.get() : this.inputPart.element.offsetHeight;
		const readOnlyBannerHeight = this.readOnlyBanner?.visible ? CHAT_READ_ONLY_BANNER_HEIGHT : 0;
		const lastElementVisible = this.listWidget.isScrolledToBottom;
		const lastItem = this.listWidget.lastItem;

		const contentHeight = Math.max(0, height - inputHeight - readOnlyBannerHeight - chatSuggestNextWidgetHeight);
		this.listWidget.layout(contentHeight, width);

		this.welcomeMessageContainer.style.height = `${contentHeight}px`;

		const lastResponseIsRendering = isResponseVM(lastItem) && lastItem.renderData;
		if (lastElementVisible && !this.listWidget.isAutoScrollHeld && (!lastResponseIsRendering || checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll))) {
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

	getInputState(): IChatModelInputState | undefined {
		return this.input.getCurrentInputState();
	}

	private updateChatInputContext() {
		const currentAgent = this.parsedInput.parts.find(part => part instanceof ChatRequestAgentPart);
		this.agentInInput.set(!!currentAgent);
	}

	private async _switchToAgentByName(agentName: string): Promise<boolean> {
		const currentAgent = this.input.currentModeObs.get();

		// already on the target agent
		if (agentName === currentAgent.name.get()) {
			return true;
		}

		// Find the mode object to get its kind
		const agent = this.input.currentChatModesObs.get().findModeByName(agentName);
		if (!agent) {
			return false;
		}

		if (currentAgent.kind !== agent.kind) {
			const chatModeCheck = await this.instantiationService.invokeFunction(handleModeSwitch, currentAgent.kind, agent.kind, this.viewModel?.model.getRequests().length ?? 0, this.viewModel?.model);
			if (!chatModeCheck) {
				return false;
			}

			if (chatModeCheck.needToClearSession) {
				await this.clear();
			}
		}
		this.input.setChatMode(agent.id);
		return true;
	}

	/**
	 * @returns `false` when the agent switch was cancelled (e.g. user dismissed the
	 * mode-switch confirmation dialog), signalling that the caller should abort the
	 * current input submission.
	 */
	private async _applyPromptMetadata({ agent, tools, model }: PromptHeader, requestInput: IChatRequestInputOptions): Promise<boolean> {

		if (tools !== undefined && !agent && this.input.currentModeKind !== ChatModeKind.Agent) {
			agent = ChatMode.Agent.name.get();
		}
		// switch to appropriate agent if needed
		if (agent) {
			const switched = await this._switchToAgentByName(agent);
			if (!switched) {
				return false;
			}
		}

		// if not tools to enable are present, we are done
		if (tools !== undefined && this.input.currentModeKind === ChatModeKind.Agent) {
			const enablementMap = this.toolsService.toToolAndToolSetEnablementMap(tools, this.input.selectedLanguageModel.get()?.metadata);
			this.input.selectedToolsModel.set(enablementMap, true);
		}

		if (model !== undefined) {
			return this.input.requestModelByQualifiedName(model);
		}

		return true;
	}

	delegateScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent): void {
		this.listWidget.delegateScrollFromMouseWheelEvent(browserEvent);
	}
}

export function layoutChatWidgetForInputHeight(widget: Pick<ChatWidget, 'setInputPartMaxHeightOverride' | 'layoutForInputHeight'>, inputMaxHeight: number | undefined, height: number, width: number): void {
	widget.setInputPartMaxHeightOverride(inputMaxHeight);
	widget.layoutForInputHeight(height, width);
}

const MIN_LIST_HEIGHT = 50;

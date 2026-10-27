/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLocalAgentHostProviderDisabledByPolicy } from '../../../../platform/agentHost/common/agentService.js';
import './media/chatView.css';
import { $, isHTMLElement, size } from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IReader, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { scrollbarShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IMicCaptureService } from '../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../workbench/common/theme.js';
import { ChatContentMarkdownRenderer } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { chatPersistentContentVisibleClass, ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { SESSIONS_CHAT_CONTENT_HORIZONTAL_PADDING } from '../../../../workbench/contrib/chat/browser/widget/chatOptions.js';
import { IChatRespondent, isResponseSelectionSupported, setModelPreservingInputTypedWhileLoading } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatOpen, IChatOpenDiagnosticsService } from '../../../../workbench/contrib/chat/common/chatOpenDiagnosticsService.js';
import { ElicitationState, IChatModelReference, IChatService, IChatToolInvocation, ResponseModelState } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { isChatTranscriptContextVariableEntry, IChatRequestTranscriptContextVariableEntry, IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatModel, IChatModel, IChatProgressResponseContent, IInputModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { isCarouselToolConfirmation } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatToolPartUtilities.js';
import { isInConversationModelChoice } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { ChatRequestTextPart } from '../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js';
import { Range } from '../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getHarnessPresentationOrDefault, ISendRequestOptions, ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { getChatSessionType, getNewChatSessionResource } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IChatSessionsService, localChatSessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatSessionHistoryStatus } from '../../../../platform/chat/common/chatSessionHistory.js';
import { isPhoneLayout } from '../../../browser/parts/mobile/mobileLayout.js';
import { AbstractChatView, ChatViewInputOnlyContext, ChatViewInputOnlyEnabledContext, ChatViewKind, IChatViewOptions, ISelectNoWorkspaceOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../../../browser/parts/chatView.js';
import { IsPhoneLayoutContext, SessionUsesExperimentalComposerLayoutContext } from '../../../common/contextkeys.js';
import { ChatInteractivity, getChatHarness, getSessionStatusMessage, IChat, isActiveSessionStatus, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { SessionStatusIcon } from '../../../browser/sessionStatusIcon.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { NewChatWidget } from './newChatWidget.js';
import { NewChatInSessionWidget } from './newChatInSessionWidget.js';
import { SessionInputBanners } from '../../sessionInputBanners/browser/sessionInputBanners.js';
import { SESSION_CHAT_INPUT_TOOLBAR_HEIGHT, SessionChatInputToolbar } from './sessionChatInputToolbar.js';
import { ResponseSelectionSideChatController } from '../../../../workbench/contrib/chat/browser/responseSelectionSideChatController.js';
import { logResponseSelectionWidgetAction } from '../../../common/sessionsTelemetry.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ISessionChatPillsDebugService } from './sessionChatInputToolbarDebug.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../../common/theme.js';
import { setupVoiceInputDecorations } from './voiceInputDecorations.js';
import { INewChatVoiceTargetService } from './newChatVoice.js';
import { ISessionsChatViewStateService } from './chatViewStateService.js';
import { ExternalSessionBanner } from './externalSessionBanner.js';
import { ISessionOpenTelemetryService } from '../../../services/sessions/browser/sessionOpenTelemetryService.js';
import { ISessionArchiveNudgeTarget, SessionArchiveNudge } from './sessionArchiveNudge.js';
import { SessionsChatBackgroundReplica } from '../../../services/chatBackground/browser/chatBackgroundRenderer.js';
import { ISessionsChatBackgroundService } from '../../../services/chatBackground/browser/chatBackgroundService.js';
import { SessionComparisonResult } from './sessionComparisonResult.js';
import { ISessionPickerVisibility, noSessionPickerVisibility } from '../../../services/sessions/common/sessionPickerVisibility.js';
import { ISessionComparison, ISessionComparisonService, SessionComparisonParticipantRole } from '../../../services/sessions/common/sessionComparison.js';
import { IAgentsWindowDraft } from '../../../../platform/window/common/window.js';
import { AGENTS_CENTERED_CONTENT_MAX_WIDTH } from '../../../common/layoutConstants.js';
import { AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING } from '../common/constants.js';

const SESSION_CHAT_RESPONSE_INTERNAL_HORIZONTAL_PADDING = 12;
// 14px icon + 6px padding + 4px gap + breathing room. The percentage label expands over the editor on hover.
export const EXPERIMENTAL_SESSION_CHAT_INPUT_TRAILING_SPACE = 28;

/**
 * Returns the total horizontal space the renderer must reserve for Sessions chat items.
 * The background increment must match the response's `--vscode-spacing-size120` padding on both sides.
 */
export function getSessionChatItemHorizontalPadding(hasBackground: boolean): number {
	return SESSIONS_CHAT_CONTENT_HORIZONTAL_PADDING + (hasBackground ? SESSION_CHAT_RESPONSE_INTERNAL_HORIZONTAL_PADDING * 2 : 0);
}

export function shouldShowSessionChatTip(sessionStatus: SessionStatus | undefined): boolean {
	return sessionStatus === undefined || !isActiveSessionStatus(sessionStatus);
}

export function shouldRenderRunningSessionSecondaryToolbar(usesExperimentalComposerLayout: boolean): boolean {
	return !usesExperimentalComposerLayout;
}

export function getSessionComparisonRequestSummary(comparisons: readonly ISessionComparison[], sessionResource: URI | undefined, chatResource: URI | undefined, mainChatResource: URI | undefined): string | undefined {
	if (!sessionResource || !chatResource || !isEqual(chatResource, mainChatResource)) {
		return undefined;
	}
	const participant = comparisons.flatMap(comparison => comparison.participants).find(participant => isEqual(participant.sessionResource, sessionResource));
	switch (participant?.role) {
		case SessionComparisonParticipantRole.Judge:
			return localize('sessionComparison.judgeInstructions', "Judge Instructions");
		case SessionComparisonParticipantRole.Synthesis:
			return localize('sessionComparison.synthesisInstructions', "Synthesis Instructions");
		default:
			return undefined;
	}
}

/**
 * Whether a chat input keydown should move focus to the status pills above it. Matches an
 * unmodified Shift+Tab, mirroring the accessibility-help guidance for reaching those pills.
 */
export function isFocusChatPillsKeyDown(event: Pick<IKeyboardEvent, 'keyCode' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
	return event.keyCode === KeyCode.Tab && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * A session view that hosts a {@link NewChatWidget} — the "new session" UI
 * shown before a session has been created. This is the default view that
 * the `SessionsPart` grid is seeded with.
 */
export interface INewChatViewOptions extends IChatViewOptions {
	readonly initialAttachments?: readonly IChatRequestVariableEntry[];
}

const providerModelSignals = new WeakMap<ISessionsProvider, IObservable<void>>();

/** Signals when a provider's models or harnesses may have changed; one per provider, alive while observed. */
function readProviderModelsChanged(provider: ISessionsProvider, reader: IReader | undefined): void {
	let signal = providerModelSignals.get(provider);
	if (!signal) {
		signal = observableSignalFromEvent(provider, Event.any(provider.onDidChangeModels, provider.onDidChangeSessionTypes));
		providerModelSignals.set(provider, signal);
	}
	signal.read(reader);
}

/**
 * The respondent of a chat whose harness differs from its session's: its harness's presentation
 * (with the provider's generic fallback while unknown) and the session type its models come from,
 * `undefined` until the provider resolves that agent's models apart from the session's.
 */
export function getChatRespondent(session: ISession, chatResource: URI, sessionsProvidersService: ISessionsProvidersService, reader: IReader | undefined): IChatRespondent | undefined {
	const chat = session.chats.read(reader).find(candidate => isEqual(candidate.resource, chatResource));
	const harness = chat && getChatHarness(session, chat);
	if (!chat || !harness || harness === session.harness) {
		return undefined;
	}
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (provider) {
		readProviderModelsChanged(provider, reader);
	}
	const modelTarget = provider?.getModelsSnapshot(session.sessionId, undefined, chat.resource).modelTarget;
	// The session's own target is never this chat's: it means the chat's agent is not resolved yet.
	const modelSessionType = modelTarget && modelTarget !== getChatSessionType(session.resource) ? modelTarget : undefined;
	const presentation = getHarnessPresentationOrDefault(provider, harness, reader);
	return { label: presentation.label, icon: presentation.icon, modelSessionType };
}

export class NewChatView extends AbstractChatView {

	static readonly TYPE = 'sessions.newSession';

	override readonly kind: ChatViewKind;
	override readonly pickerVisibility: IObservable<ISessionPickerVisibility>;

	private readonly _widget: NewChatWidget | NewChatInSessionWidget;
	private readonly _isVisibleObs = observableValue(this, true);

	constructor(
		isNewChatInSession: boolean,
		options: INewChatViewOptions,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.element.classList.add('chat-view-new');
		this.kind = isNewChatInSession ? 'newChatInSession' : 'newSession';
		const widgetOptions = { ...options, inputVisible: this._isVisibleObs, petHostPreferred: this._isVisibleObs };
		this._widget = this._register(isNewChatInSession
			? instantiationService.createInstance(NewChatInSessionWidget, widgetOptions)
			: instantiationService.createInstance(NewChatWidget, widgetOptions));
		this.pickerVisibility = this._widget instanceof NewChatWidget ? this._widget.pickerVisibility : constObservable(noSessionPickerVisibility);
		this._widget.render(this.element);
	}

	override toJSON(): object {
		return { type: NewChatView.TYPE };
	}

	override setChat(chat: IChat): void {
		if (this._widget instanceof NewChatInSessionWidget) {
			this._widget.setChat(chat);
		}
	}

	override get preserveOnSessionClear(): boolean {
		return this._widget instanceof NewChatWidget && this._widget.preserveOnSessionClear;
	}

	protected override doLayout(width: number, height: number, _top: number, _left: number): void {
		this._widget.layout(height, width);
	}

	override focus(): void {
		this._widget.focusInput();
	}

	override focusWorkspacePicker(): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.focusWorkspacePicker();
		}
	}

	override focusHarnessPicker(): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.focusHarnessPicker();
		}
	}

	override focusEnvironmentPicker(): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.focusEnvironmentPicker();
		}
	}

	override focusBranchPicker(): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.focusBranchPicker();
		}
	}

	override focusWorktreePicker(): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.focusWorktreePicker();
		}
	}

	override focusSyncAction(): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.focusSyncAction();
		}
	}

	override openModelComparison(): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.openModelComparison();
		}
	}

	override selectWorkspace(folderUri: URI, options?: ISelectWorkspaceOptions): WorkspaceSelectionResult {
		return this._widget instanceof NewChatWidget ? this._widget.selectWorkspace(folderUri, options) : 'notReady';
	}

	override applyDraft(draft: IAgentsWindowDraft, folderUri: URI | undefined, options: ISelectWorkspaceOptions, token: CancellationToken): Promise<WorkspaceSelectionResult> {
		return this._widget instanceof NewChatWidget ? this._widget.applyDraft(draft, folderUri, options, token) : Promise.resolve('notReady');
	}

	override selectNoWorkspace(options?: ISelectNoWorkspaceOptions): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.selectNoWorkspace(undefined, options);
		}
	}

	override prefillInput(text: string): void {
		if (this._widget instanceof NewChatWidget) {
			this._widget.prefillInput(text);
		}
	}


	override async sendQuery(text: string): Promise<boolean> {
		if (this._widget instanceof NewChatWidget) {
			return this._widget.sendQuery(text);
		}
		return false;
	}

	override submitInput(): Promise<boolean> {
		return this._widget instanceof NewChatWidget ? this._widget.submitInput() : Promise.resolve(false);
	}

	override attach(uris: URI[]): void {
		this._widget.attach(uris);
	}

	override setVisible(visible: boolean): void {
		this._isVisibleObs.set(visible, undefined);
		if (this._widget instanceof NewChatWidget) {
			this._widget.setHostVisible(visible);
		}
	}
}

/**
 * A session view that hosts the standard chat {@link ChatWidget} — used to
 * render an active chat session inside the `SessionsPart` grid.
 */
export class ChatView extends AbstractChatView {

	static readonly TYPE = 'sessions.session';

	static readonly REPLACED_PROVIDER_RELEASE_WARNING_DELAY_MS = 5_000;

	/** Delay before the loading progress bar appears, so instant loads do not flash. */
	static readonly LOADING_FEEDBACK_DELAY_MS = 100;

	override readonly kind: ChatViewKind = 'chat';

	override get activityBarActions() {
		return this._chatPills.activityBarActions;
	}

	private readonly _widget: ChatWidget;
	override readonly onDidSubmitRequest: Event<URI>;
	private readonly _widgetContainer: HTMLElement;
	private readonly _inputOnlyEnabledContext: IContextKey<boolean>;
	private readonly _inputOnlyContext: IContextKey<boolean>;
	/** The most the input, with what is shown above it, may grow to while only the input is shown; `undefined` until enabled. */
	private _inputOnlyMaxHeight: number | undefined;
	private readonly _inputOnly = observableValue(this, false);
	override readonly inputOnly: IObservable<boolean> = this._inputOnly;
	private readonly _inputOnlyEnabled = observableValue(this, false);
	/** The last height the input measured that it can have; see {@link inputOnlyHeight}. */
	private _inputOnlyInputHeight = 0;
	override readonly inputOnlyHeight: IObservable<number>;
	override readonly canShowInputOnly: IObservable<boolean>;
	private readonly _inputOnlyStatus: IObservable<IInputOnlyStatus>;
	private readonly _inputOnlyStatusElement: HTMLElement;
	private readonly _inputOnlyRequestElement: HTMLElement;
	private readonly _inputOnlyResponseElement: HTMLElement;
	private readonly _inputOnlyResponseIconElement: HTMLElement;
	private readonly _inputOnlyResponseText: HTMLElement;
	private _inputOnlyStatusShown = false;
	/** What {@link _renderInputOnlyStatus} rendered last, to skip rendering it again. */
	private _inputOnlyRendered: { readonly shown: boolean; readonly status: IInputOnlyStatus } | undefined;
	/** The state of the latest message's response last rendered, to announce only when it changes. */
	private _inputOnlyAnnouncedState: { readonly requestId: string | undefined; readonly state: InputOnlyResponseState } | undefined;
	private readonly _inputOnlyRequestText: HTMLElement;
	private readonly _inputOnlyRequestIconElement: HTMLElement;
	private readonly _inputOnlyRequestIcon: SessionStatusIcon;
	private readonly _externalSessionBanner: ExternalSessionBanner;

	/** Session banners (CI failures, created comments) shown above the chat input. */
	private readonly _banners: SessionInputBanners;
	/** Judge-only comparison result shown above the chat input. */
	private readonly _comparisonResult: SessionComparisonResult;
	/** Floating status pills (changes, preview, background activity) above the input. */
	private readonly _chatPills: SessionChatInputToolbar;
	private readonly _showPills: boolean;

	/** Keeps selected transcript text stable and offers supported selection actions. */
	private readonly _selectionSideChatController: ResponseSelectionSideChatController;

	/** Reference to the loaded chat model; disposing releases the model. */
	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());
	/** Keeps the bound chat presented as answered by its own harness while it differs from its session's. */
	private readonly _respondentBinding = this._register(new MutableDisposable());
	private readonly _preparationModel = this._register(new MutableDisposable<ChatModel>());
	private readonly _transcriptDisposables = this._register(new DisposableStore());

	/** Cancels any in-flight model load when a new session is set or the view disposes. */
	private readonly _loadCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private _providerReloadCts: CancellationTokenSource | undefined;
	private _pendingLoadInput: { readonly resource: URI; readonly inputBeforeLoad: string; readonly inputModelToPreserve?: IInputModel } | undefined;

	private readonly _stickyScrollBackgroundReplica = this._register(new MutableDisposable<SessionsChatBackgroundReplica>());
	private _stickyScrollBackgroundContainer: HTMLElement | undefined;

	/** Tracks the current chat's interactivity and hides the input for read-only chats. */
	private readonly _interactiveDisposable = this._register(new MutableDisposable());
	private _onInput: (() => void) | undefined;
	private readonly _loadedChatResource = observableValue<URI | undefined>(this, undefined);
	private readonly _liveModelReady: IObservable<boolean>;
	private readonly _modelReadOnly: IObservable<boolean>;

	/** Tracks the currently loaded chat resource to avoid redundant reloads. */
	private _currentChatResource: URI | undefined;
	private readonly _openDiagnostics = this._register(new MutableDisposable<IChatOpen>());
	/**
	 * The bound chat whose content provider was unregistered. Its model stays wired to the
	 * provider that went away, so a replacement registering for the same session type never
	 * reaches it; the chat is reloaded once one does.
	 */
	private _chatWithUnregisteredProvider: URI | undefined;
	private readonly _currentChatResourceObs = observableValue<URI | undefined>(this, undefined);
	private readonly _currentSessionObs = observableValue<ISession | undefined>(this, undefined);
	private readonly _loadFailure = observableValue<{ readonly resource: URI; readonly status: IChatSessionHistoryStatus } | undefined>(this, undefined);
	override readonly hasVisibleTranscriptContent = observableValue(this, false);
	override readonly isLoadingTranscript = observableValue(this, false);
	override readonly isInputBlocked: IObservable<boolean>;
	override readonly historyStatus: IObservable<IChatSessionHistoryStatus | undefined>;
	private _historyKey: string | undefined;

	/** Whether this view currently represents the active session. */
	private _isActive = true;
	/** Whether this view occupies the first group in the session's chat grid. */
	private readonly _isPrimaryObs = observableValue(this, false);
	private _isSplit = false;
	/** Observable mirror of {@link _isActive} so the voice overlay can react. */
	private readonly _isActiveObs = observableValue<boolean>(this, true);

	/** Whether this view is currently visible. `undefined` so the first push always reaches the widget. */
	private _isVisible: boolean | undefined;
	private readonly _isVisibleObs = observableValue(this, false);
	private _lastLayout: { width: number; height: number } | undefined;
	private _chatItemHorizontalPadding: number;
	private readonly _composerOnly: boolean;

	/**
	 * Per-view mirror of `agentsVoiceInitiatedHere`, scoped above the chat widget.
	 * Keeps post-connect voice controls anchored to the active session view.
	 */
	private readonly _voiceInitiatedHereKey: IContextKey<boolean>;

	constructor(
		options: IChatViewOptions = {},
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IThemeService private readonly themeService: IThemeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@ISessionChatPillsDebugService private readonly chatPillsDebugService: ISessionChatPillsDebugService,
		@INewChatVoiceTargetService private readonly newChatVoiceTargetService: INewChatVoiceTargetService,
		@ISessionsChatViewStateService private readonly viewStateService: ISessionsChatViewStateService,
		@ISessionOpenTelemetryService private readonly sessionOpenTelemetryService: ISessionOpenTelemetryService,
		@IChatOpenDiagnosticsService private readonly chatOpenDiagnosticsService: IChatOpenDiagnosticsService,
		@ISessionsChatBackgroundService private readonly chatBackgroundService: ISessionsChatBackgroundService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this._composerOnly = options.inputOnly === true;
		this._register(toDisposable(() => this._reportModelUnbound()));
		this._chatItemHorizontalPadding = getSessionChatItemHorizontalPadding(!!this.chatBackgroundService.getBackground());

		this.element.classList.add('chat-view-chat');
		this._widgetContainer = $('.chat-view-widget');
		this.element.appendChild(this._widgetContainer);

		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this._inputOnlyEnabledContext = ChatViewInputOnlyEnabledContext.bindTo(scopedContextKeyService);
		this._inputOnlyContext = ChatViewInputOnlyContext.bindTo(scopedContextKeyService);
		const usesExperimentalComposerLayout = SessionUsesExperimentalComposerLayoutContext.bindTo(scopedContextKeyService);
		const initiallyUsesExperimentalComposerLayout = !isPhoneLayout(this.layoutService);
		usesExperimentalComposerLayout.set(initiallyUsesExperimentalComposerLayout);
		this.element.classList.toggle('experimental-session-composer', initiallyUsesExperimentalComposerLayout);
		const scopedInstantiationService = this._register(instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));

		// Matches `AGENTS_VOICE_INITIATED_HERE` in agentsVoice.contribution.ts.
		this._voiceInitiatedHereKey = scopedContextKeyService.createKey<boolean>('agentsVoiceInitiatedHere', false);

		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			undefined,
			{
				renderChatPet: options.renderChatPet,
				filter: options.inputOnly ? () => false : undefined,
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: true,
				firstRequestSummary: derived(this, reader => {
					const session = this._currentSessionObs.read(reader);
					return getSessionComparisonRequestSummary(
						this.comparisonService.comparisons.read(reader),
						session?.resource,
						this._currentChatResourceObs.read(reader),
						session?.mainChat.read(reader).resource,
					);
				}),
				supportsFileReferences: true,
				rendererOptions: {
					renderInputRequests: options.inputOnly ? false : undefined,
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
					contentHorizontalPadding: this._chatItemHorizontalPadding,
				},
				enableImplicitContext: true,
				enableWorkingSet: 'implicit',
				supportsChangingModes: true,
				supportsSideChat: derived(this, reader => {
					const session = this._currentSessionObs.read(reader);
					return !!session && session.status.read(reader) !== SessionStatus.Untitled
						&& !session.isArchived.read(reader) && !!session.capabilities.read(reader).supportsSideChat;
				}),
				renderSecondaryToolbar: shouldRenderRunningSessionSecondaryToolbar(initiallyUsesExperimentalComposerLayout),
				inputEditorMinLines: options.input?.minLines ?? 2,
				inputPlaceholder: options.input?.placeholder,
				isSessionsWindow: true,
				transcriptTabIndex: -1,
				enableFind: true,
				persistentContentHeight: SESSION_CHAT_INPUT_TOOLBAR_HEIGHT,
				renderGettingStartedTip: () => shouldShowSessionChatTip(this._currentSessionObs.get()?.status.get()),
			},
			this._buildStyles(this._isActive)
		));
		this.onDidSubmitRequest = this._widget.onDidAcceptRequest;
		this._widget.setMaximumWidth(AGENTS_CENTERED_CONTENT_MAX_WIDTH);
		this._widget.render(this._widgetContainer, undefined, this._isActiveObs);
		const updateExperimentalComposerLayout = () => {
			const enabled = !isPhoneLayout(this.layoutService);
			usesExperimentalComposerLayout.set(enabled);
			this.element.classList.toggle('experimental-session-composer', enabled);
			this._widget.inputPart.placeContextUsageWidget(enabled ? this._widget.inputPart.inputContainerElement : undefined);
			this._widget.inputPart.setInputEditorTrailingSpace(enabled ? EXPERIMENTAL_SESSION_CHAT_INPUT_TRAILING_SPACE : 0);
		};
		updateExperimentalComposerLayout();
		this._register(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(new Set([IsPhoneLayoutContext.key]))) {
				updateExperimentalComposerLayout();
			}
		}));
		this._register(this._widget.onDidChangeStickyScrollDomNode(() => this._layoutStickyScrollBackground()));
		this._register(this.chatBackgroundService.onDidChangeBackground(() => this._updateChatBackground()));
		this._externalSessionBanner = this._register(scopedInstantiationService.createInstance(
			ExternalSessionBanner,
			this.element,
			{
				onDidChangeLayout: () => this._layoutChatWidget(),
				onDidDismissWithFocus: () => this._widget.focusInput(),
			}
		));
		this.element.insertBefore(this._externalSessionBanner.domNode, this._widgetContainer);
		this._register(autorun(reader => {
			const sessionStatus = this._currentSessionObs.read(reader)?.status.read(reader);
			if (!shouldShowSessionChatTip(sessionStatus)) {
				this._widget.updateGettingStartedTip();
			}
		}));
		const chatModel = observableFromEvent(this, this._widget.onDidChangeViewModel, () => this._widget.viewModel?.model);
		// The message, with an icon for how its response ended or that it waits for the user, as chats show in the sessions list.
		this._inputOnlyRequestIconElement = $('span.chat-view-input-only-request-icon', { role: 'img' });
		this._inputOnlyRequestIcon = this._register(instantiationService.createInstance(SessionStatusIcon, this._inputOnlyRequestIconElement));
		this._inputOnlyRequestText = $('span.chat-view-input-only-request-text');
		this._inputOnlyRequestElement = $('span.chat-view-input-only-request', undefined, this._inputOnlyRequestIconElement, this._inputOnlyRequestText);
		// The response's answer, or what it does while it works, with the spinner chats show in the sessions list.
		this._inputOnlyResponseIconElement = $('span.chat-view-input-only-response-icon', { 'aria-hidden': 'true' });
		this._register(instantiationService.createInstance(SessionStatusIcon, this._inputOnlyResponseIconElement)).setStatus(SessionStatus.InProgress, true, false);
		this._inputOnlyResponseText = $('span.chat-view-input-only-response-text');
		// Not a live region: progress changes too often to announce; state changes are announced once instead.
		this._inputOnlyResponseElement = $('span.chat-view-input-only-response', undefined, this._inputOnlyResponseIconElement, this._inputOnlyResponseText);
		// The message, then its response below it, as in the conversation.
		this._inputOnlyStatusElement = $('.chat-view-input-only-status.hidden', undefined,
			$('.chat-view-input-only-request-row', undefined, this._inputOnlyRequestElement),
			$('.chat-view-input-only-response-row', undefined, this._inputOnlyResponseElement),
		);
		this.element.insertBefore(this._inputOnlyStatusElement, this._widgetContainer);
		this._inputOnlyStatus = this._createInputOnlyStatus(chatModel);
		// Once the chat has a message, the rows keep their room, so the input does not move as the chat works.
		this.inputOnlyHeight = derived(this, reader => {
			if (!this._inputOnlyEnabled.read(reader)) {
				return 0;
			}
			// Laid out before it knows its width, the input measures far taller than it can grow; that is not its height.
			const inputHeight = this._widget.input.height.read(reader);
			if (inputHeight > 0 && inputHeight <= (this._inputOnlyMaxHeight ?? Number.POSITIVE_INFINITY)) {
				this._inputOnlyInputHeight = inputHeight;
			}
			return this._inputOnlyInputHeight === 0 ? 0 : INPUT_ONLY_TOP_PADDING + this._inputOnlyInputHeight + (this._inputOnlyStatus.read(reader).request ? INPUT_ONLY_STATUS_HEIGHT : 0);
		});
		const needsConversation = derived(this, reader => this._inputOnlyEnabled.read(reader)
			&& needsConversationForInput(chatModel.read(reader), this.configurationService.getValue<boolean>(ChatConfiguration.ToolConfirmationCarousel), reader));
		this.canShowInputOnly = derived(this, reader => this._inputOnlyEnabled.read(reader) && !needsConversation.read(reader));
		this._register(autorun(reader => {
			this._inputOnly.read(reader);
			this._inputOnlyStatus.read(reader);
			this._renderInputOnlyStatus();
		}));
		this._register(autorun(reader => {
			if (needsConversation.read(reader) && this._inputOnly.read(undefined)) {
				// Only the conversation can show what the chat waits for.
				this.setInputOnly(false);
			}
		}));
		this.isInputBlocked = derived(this, reader => {
			const model = chatModel.read(reader);
			return isEqual(model?.sessionResource, this._currentChatResourceObs.read(reader)) && (model?.isInputBlocked.read(reader) ?? false);
		});
		this.historyStatus = derived(this, reader => {
			const resource = this._currentChatResourceObs.read(reader);
			const failure = this._loadFailure.read(reader);
			if (failure && isEqual(failure.resource, resource)) {
				return failure.status;
			}
			const model = chatModel.read(reader);
			return isEqual(model?.sessionResource, resource) ? model?.historyStatus?.read(reader) : undefined;
		});
		this._modelReadOnly = derived(this, reader => {
			const model = chatModel.read(reader);
			return isEqual(model?.sessionResource, this._currentChatResourceObs.read(reader)) && (model?.isReadOnly.read(reader) ?? false);
		});
		this._liveModelReady = derived(this, reader => {
			const model = chatModel.read(reader);
			return isEqual(model?.sessionResource, this._currentChatResourceObs.read(reader))
				&& !!model && !model.isReadOnly.read(reader) && !this.isLoadingTranscript.read(reader);
		});
		this._register(this._widget.onDidChangeDraft(() => this._handleDraftInput()));
		this._setupTranscriptPreparationProgress(chatModel);
		this._setupInitialTranscriptContext(chatModel);

		this._selectionSideChatController = this._register(scopedInstantiationService.createInstance(ResponseSelectionSideChatController, this._widget, isResponseSelectionSupported(), {
			useActionMenu: () => configurationService.getValue<boolean>(AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING),
			onAction: (variant, action) => logResponseSelectionWidgetAction(telemetryService, variant, action),
		}));

		// Mount the session banners directly above the chat input.
		this._banners = this._register(instantiationService.createInstance(SessionInputBanners));
		this._banners.setActive(this._isActive);
		this._comparisonResult = this._register(scopedInstantiationService.createInstance(
			SessionComparisonResult,
			this._currentSessionObs,
			() => this._layoutChatWidget(),
			scopedInstantiationService.createInstance(ChatContentMarkdownRenderer),
		));

		const archiveNudge = this._register(instantiationService.createInstance(SessionArchiveNudge, derivedOpts<ISessionArchiveNudgeTarget | undefined>({
			owner: this,
			equalsFn: (a, b) => a?.session === b?.session && a?.chat === b?.chat,
		}, reader => {
			if (!this._isVisibleObs.read(reader) || !this._isPrimaryObs.read(reader) || this.isLoadingTranscript.read(reader)) {
				return undefined;
			}
			const session = this._currentSessionObs.read(reader);
			const resource = this._currentChatResourceObs.read(reader);
			if (!session || !isEqual(chatModel.read(reader)?.sessionResource, resource)) {
				return undefined;
			}
			// The suggestion covers the pull requests of the chat it appears in.
			const chat = session.chats.read(reader).find(chat => isEqual(chat.resource, resource));
			return chat?.interactivity.read(reader) === ChatInteractivity.Full ? { session, chat } : undefined;
		})));
		this._register(autorun(reader => {
			const options = archiveNudge.options.read(reader);
			this._widget.inputPart.setSessionArchiveNudge(options);
			if (options) {
				archiveNudge.markShown();
			}
		}));

		// Floating status pills above the input.
		this._chatPills = this._register(instantiationService.createInstance(SessionChatInputToolbar, false, () => this._widget.focusInput()));
		this._register(this._widget.registerBackgroundActivityPillSections(this._chatPills.backgroundActivityPillSections));
		this._register(this._widget.inputEditor.onKeyDown(event => {
			if (isFocusChatPillsKeyDown(event) && this._chatPills.focusFirst()) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));
		this._showPills = options.input?.showPills ?? true;
		this._register(this._chatPills.onDidChangeVisibility(() => this._updateChatPillsVisibility()));
		this._updateChatPillsVisibility();
		this._register(this._widget.inputPart.registerChatPetHorizontalPlatformProvider({
			onDidChange: this._chatPills.onDidChangeChatPetPlatform,
			getElements: () => this._chatPills.getChatPetPlatformElements(),
		}));
		this._register(chatPillsDebugService.register(this._chatPills, this._banners, this._isActiveObs));
		this._ensureBannersMounted();
		this._register(this.chatSessionsService.onDidChangeContentProviderSchemes(({ added, removed }) => {
			this._trackUnregisteredContentProvider(removed);
			// Remote providers are registered after their host connects, possibly after this view's initial load.
			this._retryUnresolvedChatLoad(added);
			this._reloadChatForReplacedProvider(added);
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
				this._applyHistoryKey();
			}
		}));

		// Voice transcript overlay + input glow.
		this._setupVoiceOverlay();

		// Anchor post-connect voice controls to this active voice view.
		this._register(autorun(reader => {
			const active = this._isActiveObs.read(reader);
			const voiceActive = this.voiceSessionController.isConnected.read(reader)
				|| this.voiceSessionController.isConnecting.read(reader);
			const target = this.voiceSessionController.targetSession.read(reader);
			const hasDraftTarget = this.voiceSessionController.hasDraftTarget.read(reader);
			const current = this._currentChatResourceObs.read(reader);
			const ownsVoice = !hasDraftTarget && (!target || (!!current && isEqual(target, current)));
			this._voiceInitiatedHereKey.set(active && voiceActive && ownsVoice);
		}));
	}

	private _setupTranscriptPreparationProgress(chatModel: IObservable<IChatModel | undefined>): void {
		const hiddenResponseProgress = derived(this, reader => {
			const request = chatModel.read(reader)?.lastRequestObs.read(reader);
			const response = request?.isRequestHiddenFromTranscript ? request.response : undefined;
			return response ? observableFromEvent(this, response.onDidChange, () => {
				const progress = response.response.value.filter(part => part.kind === 'progressMessage').at(-1);
				return progress ? renderAsPlaintext(progress.content) : undefined;
			}) : constObservable(undefined);
		});
		let lastPreparationMessage: string | undefined;
		let lastPreparationModel: ChatModel | undefined;
		this._transcriptDisposables.add(autorun(reader => {
			const resource = this._currentChatResourceObs.read(reader);
			const session = this._currentSessionObs.read(reader);
			const preparation = session?.preparationProgress?.read(reader);
			const statusMessage = session
				? session.isNewSessionRequestInProgress?.read(reader)
					? session.description.read(reader)
					: getSessionStatusMessage(session.status.read(reader), session.description.read(reader))
				: undefined;
			const activity = typeof statusMessage === 'string' ? statusMessage : statusMessage ? renderAsPlaintext(statusMessage) : undefined;
			const model = chatModel.read(reader);
			const preparationModel = this._preparationModel.value;
			if (preparationModel && preparation && (preparation.message !== lastPreparationMessage || preparationModel !== lastPreparationModel)) {
				lastPreparationMessage = preparation.message;
				lastPreparationModel = preparationModel;
				preparationModel.acceptResponseProgress(preparationModel.getRequests()[0], {
					kind: 'progressMessage',
					id: 'sessionPreparation',
					content: new MarkdownString().appendText(preparation.message),
					shimmer: true,
				});
			}
			if (!preparation) {
				lastPreparationMessage = undefined;
				lastPreparationModel = undefined;
			}
			let showProgress: boolean;
			let requestCount = 0;
			let visibleRequestCount = 0;
			let hiddenRequestIncomplete: boolean | undefined;
			let hiddenRequestState: ResponseModelState | undefined;
			let readyMessage: string | undefined;
			if (!resource) {
				showProgress = false;
			} else if (!model) {
				showProgress = true;
			} else {
				const requests = model.getRequests();
				const lastRequest = model.lastRequestObs.read(reader);
				requestCount = requests.length;
				visibleRequestCount = requests.filter(request => !request.isRequestHiddenFromTranscript).length;
				const hiddenResponse = lastRequest?.isRequestHiddenFromTranscript ? lastRequest.response : undefined;
				hiddenRequestIncomplete = hiddenResponse?.isIncomplete.read(reader);
				hiddenRequestState = hiddenResponse?.state;
				readyMessage = findTranscriptContextEntry(requests.filter(request => request.isHiddenFromTranscript))?.readyMessage?.trim();
				showProgress = shouldShowTranscriptPreparationProgress(requestCount, visibleRequestCount, hiddenRequestIncomplete);
			}
			const showCompletion = shouldShowTranscriptPreparationCompletion(requestCount, visibleRequestCount, hiddenRequestState, readyMessage);
			const responseProgress = hiddenResponseProgress.read(reader).read(reader);
			const progress = preparation?.message ?? (showCompletion ? readyMessage : getTranscriptProgress(showProgress, responseProgress ?? activity));
			this._widget.setTranscriptProgress(progress, progress, preparation
				? { detail: preparation.showLog ? { label: localize('sessionPreparation.showLog', "Show Log"), run: preparation.showLog } : undefined, onCancel: preparation.cancel, inTranscript: !!preparationModel }
				: showCompletion ? { complete: true } : undefined);
		}));
	}

	private _setupInitialTranscriptContext(chatModel: IObservable<IChatModel | undefined>): void {
		let currentEntryId: string | undefined;
		this._transcriptDisposables.add(autorun(reader => {
			const model = chatModel.read(reader);
			model?.lastRequestObs.read(reader);
			const requests = model?.getRequests() ?? [];
			const hasVisibleRequest = requests.some(request => !request.isHiddenFromTranscript);
			this.hasVisibleTranscriptContent.set(hasVisibleRequest, undefined);
			const entry = findInitialTranscriptContextEntry(requests);
			if (entry?.id === currentEntryId) {
				return;
			}
			currentEntryId = entry?.id;
			this._widget.setTranscriptContext(entry);
		}));
	}

	override dispose(): void {
		this._transcriptDisposables.dispose();
		this._saveCurrentViewState();
		this._loadCts.value?.cancel();
		super.dispose();
	}

	private _buildStyles(active: boolean) {
		return {
			listForeground: active ? activeSessionViewForeground : inactiveSessionViewForeground,
			listBackground: active ? activeSessionViewBackground : inactiveSessionViewBackground,
			listShadow: scrollbarShadow,
			overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
			inputEditorBackground: inactiveSessionViewBackground,
			resultEditorBackground: agentsPanelBackground,
		};
	}

	/** The underlying chat widget. */
	get widget(): ChatWidget {
		return this._widget;
	}

	override setChat(chat: IChat, historyKey?: string, session?: ISession, onInput?: () => void): void {
		this.chatPillsDebugService.clear(this._chatPills);
		const previousSession = this._currentSessionObs.get();
		this._currentSessionObs.set(session, undefined);
		this._externalSessionBanner.setSession(this._isPrimaryObs.get() ? session : undefined);
		const resource = chat.resource;
		const previousChatResource = this._currentChatResource;
		const chatChanged = !isEqual(previousChatResource, resource);
		this._onInput = onInput ?? (!chatChanged && chat.interactivity.get() === ChatInteractivity.Full ? this._onInput : undefined);
		if (chatChanged) {
			this._pendingLoadInput = undefined;
			this._saveCurrentViewState();
		}
		this._historyKey = historyKey;
		this._applyHistoryKey();

		// Reflect this chat's last-turn changes, status, and background activity.
		this._chatPills.setChat(chat);
		this._selectionSideChatController.setChat(chat.resource, derived(this, reader => chat.interactivity.read(reader) !== ChatInteractivity.Full || this._modelReadOnly.read(reader)));
		this._banners.setDebugData(undefined);

		// Reflect read-only (non-interactive) chats: hide the composer and gate
		// mutating actions (Start Over / Restore Checkpoint) via the widget. Any
		// non-Full interactivity is treated as read-only here (hidden chats are
		// filtered out of the visible model before they reach a ChatView).
		this._interactiveDisposable.value = autorun(reader => {
			const interactivity = chat.interactivity.read(reader);
			const draftOnly = interactivity === ChatInteractivity.DraftOnly;
			const modelReadOnly = !draftOnly && this._modelReadOnly.read(reader);
			const loading = !!this._onInput && interactivity === ChatInteractivity.Full && (!this._liveModelReady.read(reader) || (session?.loading.read(reader) ?? false));
			const draftLoaded = isEqual(this._loadedChatResource.read(reader), resource);
			const failure = this._loadFailure.read(reader);
			const loadStatus = failure && isEqual(failure.resource, resource) ? failure.status : undefined;
			const keepInputVisible = !loadStatus && interactivity !== ChatInteractivity.ReadOnly
				&& (this.isInputBlocked.read(reader) || (!modelReadOnly && (draftOnly || loading) && draftLoaded));
			this._widget.setReadOnly(interactivity !== ChatInteractivity.Full || loading || modelReadOnly || !!loadStatus, keepInputVisible, loadStatus);
		});

		// Skip loading if we're already showing this chat
		if (!chatChanged) {
			if (previousSession && !isEqual(previousSession.resource, session?.resource) && previousChatResource) {
				this.sessionOpenTelemetryService.modelUnbound(previousSession.resource, previousChatResource);
			}
			if (session && isEqual(this._modelRef.value?.object.sessionResource, resource)) {
				this.sessionOpenTelemetryService.modelBound(session.resource, resource);
			}
			return;
		}

		this.hasVisibleTranscriptContent.set(false, undefined);
		this._currentChatResource = resource;
		this._currentChatResourceObs.set(resource, undefined);
		this.logService.trace(`[ChatView] setChat start uri=${resource.toString()} session=${session?.resource.toString()}`);

		const preparationInput = session?.preparationProgress?.get() && this.sessionsManagementService.getInFlightNewSessionRequest(session.resource);
		if (session && preparationInput) {
			this._loadCts.value?.cancel();
			this._showPreparationInput(preparationInput, session);
			this._setLoading(false);
			this._layoutChatWidget();
		} else {
			this._preparationModel.clear();
			this._loadChat(resource, session, { previousChatResource, previousSession });
		}
	}

	override reopenChat(resource: URI): Promise<void> {
		const failure = this._loadFailure.get();
		return failure && isEqual(failure.resource, resource) && isEqual(this._currentChatResource, resource)
			? failure.status.action?.run() ?? Promise.resolve()
			: Promise.resolve();
	}

	private _showPreparationInput(input: Pick<ISendRequestOptions, 'query' | 'attachedContext'>, session: ISession): void {
		const snapshot = this.sessionsProvidersService.getProvider(session.providerId)?.getModelsSnapshot(session.sessionId, session.modelId.get());
		// Keep this view-owned model in the draft's pool without registering it or reusing the backend resource.
		const model = this.instantiationService.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat,
			resource: snapshot?.modelTarget ? getNewChatSessionResource(snapshot.modelTarget) : undefined,
			canUseTools: false,
			disableBackgroundKeepAlive: true,
			isReadOnly: constObservable(true),
		});
		this._preparationModel.value = model;
		if (snapshot?.desiredModelResolution.kind === 'available') {
			model.inputModel.setState({ selectedModel: snapshot.desiredModelResolution.model });
		}
		const lines = input.query.split('\n');
		model.addRequest({
			text: input.query,
			parts: [new ChatRequestTextPart(new OffsetRange(0, input.query.length), new Range(1, 1, lines.length, lines.at(-1)!.length + 1), input.query)],
		}, { variables: input.attachedContext ?? [] }, 0);
		this._widget.setModel(model);
	}

	private _handleDraftInput(): void {
		if (this._onInput && this._currentChatResource && isEqual(this._loadedChatResource.get(), this._currentChatResource)
			&& (!this._liveModelReady.get() || this._currentSessionObs.get()?.remoteConnectionStatus?.get().kind !== 'connected')) {
			this._onInput();
		}
	}

	private _retryUnresolvedChatLoad(addedSessionTypes: readonly string[]): void {
		if (this._providerReloadCts && !this._providerReloadCts.token.isCancellationRequested) {
			return;
		}
		const resource = this._currentChatResource;
		if (!resource || this._modelRef.value || this._preparationModel.value || !addedSessionTypes.includes(getChatSessionType(resource))) {
			return;
		}
		this._loadChat(resource, this._currentSessionObs.get());
	}

	/**
	 * A load still in flight binds to the removed provider's session just as a bound model does,
	 * so it is tracked as well; a fresh load clears the mark.
	 */
	private _trackUnregisteredContentProvider(removedSessionTypes: readonly string[]): void {
		const resource = this._currentChatResource;
		if (resource && removedSessionTypes.includes(getChatSessionType(resource))) {
			this._chatWithUnregisteredProvider = resource;
		}
	}

	/**
	 * Reload a bound chat once a content provider registers again for its session type. The model
	 * on screen is still wired to the provider that went away — a sandbox served from history until
	 * its environment was woken, or a host that reconnected with a new client — so nothing the new
	 * provider streams reaches it and nothing sent from it reaches the host.
	 */
	private _reloadChatForReplacedProvider(addedSessionTypes: readonly string[]): void {
		const resource = this._chatWithUnregisteredProvider;
		if (!resource || !isEqual(resource, this._currentChatResource) || !addedSessionTypes.includes(getChatSessionType(resource))) {
			return;
		}
		if (resource.scheme.startsWith('agent-host-') && isLocalAgentHostProviderDisabledByPolicy(resource.scheme.slice('agent-host-'.length), this.configurationService)) {
			if (this._providerReloadCts) {
				this._modelRef.value ??= this.chatService.acquireExistingSession(resource, 'ChatView#policyReapplied');
				this._providerReloadCts.cancel();
			}
			return;
		}
		if (!this._modelRef.value) {
			return;
		}

		this._chatWithUnregisteredProvider = undefined;
		const session = this._currentSessionObs.get();
		const inputModelToPreserve = this._modelRef.value.object.inputModel;
		this.logService.trace(`[ChatView] reloading chat after its content provider was replaced uri=${resource.toString()}`);
		this._saveCurrentViewState();

		this._loadCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this._loadCts.value = cts;
		this._providerReloadCts = cts;
		// Wait for eviction: reacquiring before disposal can resurrect the old model.
		const store = new DisposableStore();
		const released = new Promise<void>(resolve => {
			store.add(Event.once(Event.filter(this.chatService.onDidDisposeSession, e =>
				e.reason === 'disposed' && e.sessionResources.some(disposed => isEqual(disposed, resource))))(() => resolve()));
			store.add(disposableTimeout(() => {
				this.logService.warn(`[ChatView] Waiting for the previous model to be released before reloading uri=${resource.toString()}`);
			}, ChatView.REPLACED_PROVIDER_RELEASE_WARNING_DELAY_MS));
			store.add(cts.token.onCancellationRequested(() => resolve()));
		});
		this._modelRef.clear();
		const reloaded = released.then(() => {
			store.dispose();
			if (this._providerReloadCts === cts) {
				this._providerReloadCts = undefined;
			}
			if (cts.token.isCancellationRequested || this._loadCts.value !== cts || !isEqual(this._currentChatResource, resource)) {
				return;
			}
			this._clearCurrentChat(session, resource);
			this._setLoading(true);
			this._loadChat(resource, session, { inputModelToPreserve });
		});
		this.showProgressWhile(reloaded, ChatView.LOADING_FEEDBACK_DELAY_MS);
	}

	/**
	 * Drives the widget's loading affordance and the observable mirror of it together, so a
	 * consumer reading {@link isLoadingTranscript} can never disagree with what the widget shows.
	 */
	private _setLoading(isLoading: boolean): void {
		this._widget.setLoading(isLoading);
		this.isLoadingTranscript.set(isLoading, undefined);
	}

	private _loadChat(resource: URI, session: ISession | undefined, options?: { previousChatResource?: URI; previousSession?: ISession; inputModelToPreserve?: IInputModel }): Promise<void> {
		this._loadFailure.set(undefined, undefined);
		// A fresh load binds to whichever provider serves the chat now.
		this._chatWithUnregisteredProvider = undefined;
		// Cancel any in-flight load for the previous chat and start a fresh one.
		this._loadCts.value?.cancel();
		if (options?.previousChatResource) {
			this._clearCurrentChat(options.previousSession, options.previousChatResource);
		}
		const cts = new CancellationTokenSource();
		this._loadCts.value = cts;
		const token = cts.token;
		const open = this._openDiagnostics.value = this.chatOpenDiagnosticsService.startOpen('agentsWindow', resource, token);
		open.mark('selectionHandled');
		this._setLoading(true);

		// Provider replacement and explicit retry belong to the same input load window.
		const previousInput = this._pendingLoadInput;
		const input = this._pendingLoadInput = previousInput && isEqual(previousInput.resource, resource)
			? previousInput
			: { resource, inputBeforeLoad: this._widget.getInput(), inputModelToPreserve: options?.inputModelToPreserve };

		const loadPromise = (async (): Promise<boolean> => {
			let ref: IChatModelReference | undefined;
			try {
				ref = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'ChatView');
			} catch (err) {
				if (!isEqual(this._currentChatResource, resource) || this._loadCts.value !== cts) {
					return false;
				}
				if (token.isCancellationRequested) {
					this.logService.trace(`[ChatView] setChat cancelled uri=${resource.toString()}`);
					this._setLoading(false);
					return false;
				}
				this.logService.error(`[ChatView] Failed to load chat model for chat uri=${resource.toString()}`, err);
				this._loadFailure.set({
					resource,
					status: {
						kind: 'history',
						message: localize('chatView.historyLoadFailed', "Couldn't load this conversation."),
						action: {
							label: localize('chatView.retryHistoryLoad', "Retry"),
							run: async () => {
								if (!token.isCancellationRequested && this._loadCts.value === cts && isEqual(this._currentChatResource, resource)) {
									await this._loadChat(resource, this._currentSessionObs.get());
								}
							},
						},
					},
				}, undefined);
				this._setLoading(false);
				open.fail(err);
				if (session) {
					this.sessionOpenTelemetryService.modelBindFailed(session.resource, resource);
				}
				return false;
			}
			const isCurrentChat = isEqual(this._currentChatResource, resource);
			const isCurrentLoad = this._loadCts.value === cts;
			if (token.isCancellationRequested || !ref || !isCurrentChat || !isCurrentLoad) {
				ref?.dispose();
				if (!token.isCancellationRequested && !ref && isCurrentChat && isCurrentLoad && session) {
					this.sessionOpenTelemetryService.modelBindFailed(session.resource, resource);
				}
				if (isCurrentChat && isCurrentLoad) {
					this._setLoading(false);
					if (!token.isCancellationRequested && !ref) {
						open.fail(new Error('The chat model could not be acquired'));
					}
				}
				this.logService.trace(`[ChatView] setChat abandoned uri=${resource.toString()}`);
				return false;
			}
			this.logService.trace(`[ChatView] setChat model loaded uri=${resource.toString()}`);
			const inputState = input.inputModelToPreserve ? this._widget.getInputState() : undefined;
			const restoreInputFocus = !!inputState && this._widget.inputEditor.hasTextFocus();
			if (inputState) {
				const inputModel = ref.object.inputModel;
				const intendedModel = input.inputModelToPreserve?.intendedModel;
				if (intendedModel) {
					inputModel.setIntendedModel(intendedModel);
				} else if (inputState.selectedModel && inputState.selectedModelReason && isInConversationModelChoice(inputState.selectedModelReason)) {
					inputModel.setIntendedModel({
						modelId: inputState.selectedModel.identifier, model: inputState.selectedModel,
						reason: inputState.selectedModelReason, configuration: inputState.modelConfiguration,
					});
				}
				// Preserve composing state without restoring the outgoing model's permissions.
				inputModel.setState({ ...inputState, permissionLevel: inputModel.state.get()?.permissionLevel });
			}
			this._pendingLoadInput = undefined;
			this._modelRef.value = ref;
			this._updateWidgetLockState(getChatSessionType(ref.object.sessionResource));
			// Bound ahead of the model so a chat answered by another agent never validates against its session's models.
			this._respondentBinding.value = session ? autorun(reader => this._widget.setRespondent(getChatRespondent(session, resource, this.sessionsProvidersService, reader), resource)) : undefined;
			if (inputState) {
				this._widget.setModel(ref.object);
			} else {
				setModelPreservingInputTypedWhileLoading(this._widget, input.inputBeforeLoad, () => this._widget.setModel(ref.object));
			}
			const widgetViewState = this._composerOnly ? undefined : this.viewStateService.get(resource);
			if (widgetViewState) {
				this._widget.restoreViewState(widgetViewState);
			}
			if (restoreInputFocus) {
				this._widget.focusInput();
			}
			this._loadedChatResource.set(resource, undefined);
			this._setLoading(false);
			if (session) {
				this.sessionOpenTelemetryService.modelBound(session.resource, resource);
			}
			// Expose the bound chat resource on the DOM so test automation
			// can synchronize with the post-rebind state without polling timeouts.
			// Set AFTER `setModel` so observers see the attribute only once the
			// inner widget is fully attached to the loaded model.
			this.element.dataset.boundChatResource = resource.toString();
			this.logService.trace(`[ChatView] setChat done uri=${resource.toString()}`);
			return true;
		})();

		const loaded = (async () => {
			try {
				const bound = await loadPromise;
				if (bound && !token.isCancellationRequested) {
					open.complete(this._widget.visible && !this.element.ownerDocument.hidden);
				}
			} catch (err) {
				open.fail(err);
				throw err;
			} finally {
				open.end();
			}
		})();

		// Surface progress on this leaf's own bar while the chat model loads,
		// matching how each editor group shows progress independently. The short
		// delay avoids flashing the bar for fast cached loads.
		this.showProgressWhile(loaded, ChatView.LOADING_FEEDBACK_DELAY_MS);
		this._layoutChatWidget();
		return loaded;
	}

	private _saveCurrentViewState(): void {
		if (this._composerOnly || this._preparationModel.value) {
			return;
		}
		const resource = this._widget.viewModel?.sessionResource;
		if (resource) {
			this.viewStateService.set(resource, this._widget.getViewState());
		}
	}

	private _clearCurrentChat(previousSession: ISession | undefined, previousChatResource: URI): void {
		if (previousSession) {
			this.sessionOpenTelemetryService.modelUnbound(previousSession.resource, previousChatResource);
		}
		this._widget.clear().catch(err => this.logService.error('[ChatView] Failed to clear chat widget', err));
		this._respondentBinding.clear();
		this._widget.setModel(undefined);
		this._selectionSideChatController.setChat(undefined, constObservable(true));
		this._modelRef.clear();
		// Clear the bound-resource attribute while the rebind is in flight so
		// test automation can wait for the next `setChat` cycle to finish
		// before acting on the view.
		delete this.element.dataset.boundChatResource;
	}

	private _reportModelUnbound(): void {
		if (this._preparationModel.value) {
			return;
		}
		const session = this._currentSessionObs.get();
		if (session && this._currentChatResource) {
			this.sessionOpenTelemetryService.modelUnbound(session.resource, this._currentChatResource);
		}
	}

	private _applyHistoryKey(): void {
		const scopedHistory = this.configurationService.getValue<boolean>(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false;
		this._widget.inputPart.setHistoryKey(scopedHistory ? this._historyKey : undefined);
	}

	private _updateWidgetLockState(sessionType: string): void {
		if (sessionType === localChatSessionType) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		if (contribution) {
			this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType, contribution.agentHostProviderId);
		} else {
			this._widget.unlockFromCodingAgent();
		}
	}

	override toJSON(): object {
		return { type: ChatView.TYPE };
	}

	protected override doLayout(width: number, height: number, _top: number, _left: number): void {
		this._lastLayout = { width, height };
		this._ensureBannersMounted();
		this._layoutChatWidget();
	}

	private _layoutChatWidget(): void {
		if (!this._lastLayout) {
			return;
		}
		const { width, height } = this._lastLayout;
		// Only the external-session banner, and the input-only padding and progress, precede the widget in normal flow.
		const widgetTop = this._externalSessionBanner.domNode.classList.contains('hidden') && !this._inputOnly.get() ? 0 : this._widgetContainer.offsetTop;
		const widgetHeight = Math.max(0, height - widgetTop);
		const progressContainer = Array.from(this.element.children).find(element => element.classList.contains('monaco-progress-container'));
		if (isHTMLElement(progressContainer)) {
			progressContainer.style.top = `${widgetTop}px`;
		}
		this._comparisonResult.layout(width);
		size(this._widgetContainer, width, widgetHeight);
		// Showing only the input, the widget is laid out with the room the input may grow into, not the room it has,
		// which its host sizes to the input.
		const inputOnlyMaxHeight = this._inputOnly.get() ? this._inputOnlyMaxHeight : undefined;
		this._widget.layout(inputOnlyMaxHeight !== undefined ? Math.max(0, inputOnlyMaxHeight - widgetTop) : widgetHeight, width);
		this._layoutStickyScrollBackground();
	}

	override enableInputOnly(options: { readonly maxHeight: number; readonly inputOnly?: boolean }): void {
		this._inputOnlyMaxHeight = options.maxHeight;
		this._inputOnlyEnabled.set(true, undefined);
		this._inputOnlyEnabledContext.set(true);
		this.setInputOnly(options.inputOnly ?? true);
	}

	override disableInputOnly(): void {
		this.setInputOnly(false);
		this._inputOnlyMaxHeight = undefined;
		this._inputOnlyEnabled.set(false, undefined);
		this._inputOnlyEnabledContext.set(false);
	}

	override setInputOnly(inputOnly: boolean): void {
		if (this._inputOnlyMaxHeight === undefined || (inputOnly && !this.canShowInputOnly.get())) {
			return;
		}
		this._inputOnly.set(inputOnly, undefined);
		this._inputOnlyContext.set(inputOnly);
		this.element.classList.toggle('input-only', inputOnly);
		// Showing only the input, the input stays one line tall; longer text scrolls in it.
		this._widget.inputPart.setSingleLine(inputOnly);
		this._updateChatPillsVisibility();
		this._renderInputOnlyStatus();
		this._layoutChatWidget();
	}

	private _createInputOnlyStatus(chatModel: IObservable<IChatModel | undefined>): IObservable<IInputOnlyStatus> {
		// Until input-only is enabled, nothing is read from the chat, so streaming responses cost nothing here.
		const lastRequest = derived(this, reader => {
			if (!this._inputOnlyEnabled.read(reader)) {
				return undefined;
			}
			const model = chatModel.read(reader);
			model?.lastRequestObs.read(reader);
			const request = model?.getRequests().findLast(request => !request.isRequestHiddenFromTranscript);
			return request ? { request, onDidChange: request.response ? observableSignalFromEvent(this, request.response.onDidChange) : undefined } : undefined;
		});
		return derived(this, reader => {
			const last = lastRequest.read(reader);
			if (!last) {
				return NO_INPUT_ONLY_STATUS;
			}
			last.onDidChange?.read(reader);
			const { request } = last;
			const response = request.response;
			const state = response ? getInputOnlyResponseState(response.isIncomplete.read(reader), !!response.isPendingConfirmation.read(reader), response.state) : undefined;
			return {
				requestId: request.id,
				request: request.message.text.replace(/\s+/g, ' ').trim() || undefined,
				state,
				response: !response ? undefined : state === 'working'
					? getInputOnlyProgressMessage(response.response.value, reader)
					: getInputOnlyResponseText(response.response.getFinalResponse()),
			};
		});
	}

	private _renderInputOnlyStatus(): void {
		const inputOnlyStatus = this._inputOnlyStatus.get();
		const { requestId, request, state = 'succeeded', response } = inputOnlyStatus;
		// Nothing is shown before the first message, so an empty chat has just its input.
		const shown = this._inputOnly.get() && !!request;
		this._announceInputOnlyStateChange(shown, requestId, state);
		const previous = this._inputOnlyRendered;
		if (previous?.shown === shown && (!shown || (previous.status.request === request && previous.status.state === inputOnlyStatus.state && previous.status.response === response))) {
			return;
		}
		this._inputOnlyRendered = { shown, status: inputOnlyStatus };
		this._inputOnlyStatusElement.classList.toggle('hidden', !shown);
		if (!shown) {
			this._updateInputOnlyStatusShown(false);
			return;
		}
		this._inputOnlyRequestText.textContent = request ?? '';
		this._inputOnlyRequestElement.title = request ?? '';
		const { status, completedIcon, label } = INPUT_ONLY_REQUEST_STATES[state];
		// A message whose response works or is done needs no icon: the response below it shows that.
		this._inputOnlyRequestIconElement.classList.toggle('hidden', status === undefined);
		if (status !== undefined) {
			this._inputOnlyRequestIcon.setStatus(status, true, false, completedIcon);
		}
		this._inputOnlyRequestIconElement.setAttribute('aria-label', label);
		this._inputOnlyRequestIconElement.dataset.state = state;
		this._inputOnlyResponseText.textContent = response ?? '';
		this._inputOnlyResponseElement.title = response ?? '';
		this._inputOnlyResponseIconElement.classList.toggle('hidden', state !== 'working');
		this._updateInputOnlyStatusShown(true);
	}

	private _updateInputOnlyStatusShown(shown: boolean): void {
		if (shown !== this._inputOnlyStatusShown) {
			this._inputOnlyStatusShown = shown;
			this._layoutChatWidget();
		}
	}

	/**
	 * Announces once when the response to the shown message, while only the input is shown, comes to wait for the user,
	 * fails or is canceled. Its start and its answer are announced by chat already, its progress is not announced.
	 */
	private _announceInputOnlyStateChange(shown: boolean, requestId: string | undefined, state: InputOnlyResponseState): void {
		const previous = this._inputOnlyAnnouncedState;
		this._inputOnlyAnnouncedState = { requestId, state };
		const message = INPUT_ONLY_STATE_ANNOUNCEMENTS[state];
		if (shown && message && requestId !== undefined && previous?.requestId === requestId && previous.state !== state) {
			this._announce(message);
		}
	}

	private _announce(message: string): void {
		if (this.accessibilityService.isScreenReaderOptimized()) {
			aria.status(message);
		}
	}

	private _updateChatBackground(): void {
		const background = this.chatBackgroundService.getBackground();
		this._updateChatItemHorizontalPadding(!!background);
		this._stickyScrollBackgroundReplica.value?.setBackground(background);
	}

	private _updateChatItemHorizontalPadding(hasBackground: boolean): void {
		const horizontalPadding = getSessionChatItemHorizontalPadding(hasBackground);
		if (horizontalPadding === this._chatItemHorizontalPadding) {
			return;
		}

		this._chatItemHorizontalPadding = horizontalPadding;
		this._widget.setContentHorizontalPadding(horizontalPadding);
	}

	private _layoutStickyScrollBackground(): void {
		const stickyContainer = this._widget.stickyScrollDomNode;
		if (stickyContainer !== this._stickyScrollBackgroundContainer) {
			this._stickyScrollBackgroundReplica.clear();
			this._stickyScrollBackgroundContainer = undefined;
		}

		if (!stickyContainer) {
			return;
		}

		let replica = this._stickyScrollBackgroundReplica.value;
		if (!replica) {
			const sessionsPart = this.element.closest('.part.sessionspart');
			const source = sessionsPart ? Array.from(sessionsPart.children).find(element => element.classList.contains('sessions-chat-background')) : undefined;
			if (!isHTMLElement(source)) {
				return;
			}

			replica = new SessionsChatBackgroundReplica(source, stickyContainer);
			this._stickyScrollBackgroundReplica.value = replica;
			this._stickyScrollBackgroundContainer = stickyContainer;
			replica.setBackground(this.chatBackgroundService.getBackground());
		} else {
			replica.layout();
		}
	}

	/** Shows the status pills above the input, unless they are off for this view, or it shows only its input. */
	private _updateChatPillsVisibility(): void {
		const shown = this._showPills && !this._inputOnly.get();
		this._chatPills.element.style.display = shown ? '' : 'none';
		this._widget.inputPart.persistentContentContainerElement.classList.toggle(chatPersistentContentVisibleClass, shown && this._chatPills.visible);
	}

	/**
	 * Mounts the status pills and session banners above the chat input.
	 */
	private _ensureBannersMounted(): void {
		const inputPartElement = this._widget.inputPart.element;
		const persistentContentContainer = this._widget.inputPart.persistentContentContainerElement;
		const pillsNode = this._chatPills.element;
		this._chatPills.setInputElement(this._widget.inputPart.inputContainerElement);
		this._updateChatPillsVisibility();
		const bannersNode = this._banners.domNode;
		const comparisonResultNode = this._comparisonResult.domNode;
		if (pillsNode.parentElement !== persistentContentContainer) {
			persistentContentContainer.appendChild(pillsNode);
		}
		if (persistentContentContainer.nextSibling !== bannersNode) {
			inputPartElement.insertBefore(bannersNode, persistentContentContainer.nextSibling);
		}
		if (bannersNode.nextSibling !== comparisonResultNode) {
			inputPartElement.insertBefore(comparisonResultNode, bannersNode.nextSibling);
		}
	}

	//#region Voice overlay

	/**
	 * Sets up this view's transcript overlay and input glow, mirroring `ChatViewPane`.
	 * Shows only while voice is connected and targeting this active session.
	 */
	private _setupVoiceOverlay(): void {
		const inputContainerEl = this._widget.inputPart.inputContainerElement;
		if (!inputContainerEl) {
			return;
		}
		this._register(setupVoiceInputDecorations({
			voiceSessionController: this.voiceSessionController,
			ttsPlaybackService: this.ttsPlaybackService,
			micCaptureService: this.micCaptureService,
			configurationService: this.configurationService,
			keybindingService: this.keybindingService,
			themeService: this.themeService,
			accessibilityService: this.accessibilityService,
		}, {
			inputContainer: inputContainerEl,
			isActive: this._isActiveObs,
			getCurrentResource: reader => this._currentChatResourceObs.read(reader),
			currentVoiceInputResource: this.newChatVoiceTargetService.currentVoiceInputResource,
		}));
	}

	//#endregion

	override focus(): void {
		this._widget.focusInput();
	}

	override attach(uris: URI[]): void {
		if (this._widget.isTranscriptProgressActive) {
			this.notificationService.info(localize('sessionPreparation.attachUnavailable', "Wait for session preparation to finish before adding attachments."));
			return;
		}
		for (const uri of uris) {
			this._widget.attachmentModel.addFile(uri).catch(err => this.logService.error('[ChatView] Failed to attach file as context', err));
		}
	}

	override setPrimary(primary: boolean, split = false): void {
		if (this._isSplit !== split) {
			this._isSplit = split;
			this._widget.setMaximumWidth(split ? Number.POSITIVE_INFINITY : AGENTS_CENTERED_CONTENT_MAX_WIDTH);
			this._layoutChatWidget();
		}
		if (this._isPrimaryObs.get() === primary) {
			return;
		}
		this._isPrimaryObs.set(primary, undefined);
		this._externalSessionBanner.setSession(primary ? this._currentSessionObs.get() : undefined);
	}

	override setActive(active: boolean): void {
		if (this._isActive === active) {
			return;
		}
		this._isActive = active;
		this._isActiveObs.set(active, undefined);
		this._banners.setActive(active);
		this._widget.setStyles(this._buildStyles(active));
	}

	override setVisible(visible: boolean): void {
		if (this._isVisible === visible) {
			return;
		}
		this._isVisible = visible;
		this._widget.setVisible(visible);
		this._isVisibleObs.set(visible, undefined);
	}
}

/** Height of the message and response rows shown above the input while only the input is shown. */
const INPUT_ONLY_STATUS_HEIGHT = 60;

/** Room above what a chat view showing only its input shows, matching the `.input-only` padding in chatView.css. */
const INPUT_ONLY_TOP_PADDING = 12;

/** What a chat view showing only its input shows above it: the latest message sent, and its response. */
export interface IInputOnlyStatus {
	readonly requestId?: string;
	readonly request?: string;
	readonly state?: InputOnlyResponseState;
	/** The response's answer as one line, or what it does while it works. */
	readonly response?: string;
}

/** What a chat view shows above its input while input-only is not enabled: nothing. */
const NO_INPUT_ONLY_STATUS: IInputOnlyStatus = {};

/** Whether a response works, waits for the user, or how it ended. */
export type InputOnlyResponseState = 'working' | 'waiting' | 'succeeded' | 'failed' | 'canceled';

/**
 * How the message shows the state of its response: like a chat in the sessions list, except that while it works the
 * response shows the progress instead.
 */
const INPUT_ONLY_REQUEST_STATES: Record<InputOnlyResponseState, { readonly status?: SessionStatus; readonly completedIcon?: ThemeIcon; readonly label: string }> = {
	working: { label: localize('inputOnly.working', "Working") },
	waiting: { status: SessionStatus.NeedsInput, label: localize('inputOnly.waiting', "Waiting for your input") },
	succeeded: { label: localize('inputOnly.succeeded', "Done") },
	failed: { status: SessionStatus.Error, label: localize('inputOnly.failed', "Failed") },
	canceled: { status: SessionStatus.Completed, completedIcon: Codicon.circleSlash, label: localize('inputOnly.canceled', "Canceled") },
};

/** What is announced when the response to the message shown above the input comes to a state; see `_announceInputOnlyStateChange`. */
const INPUT_ONLY_STATE_ANNOUNCEMENTS: Partial<Record<InputOnlyResponseState, string>> = {
	waiting: localize('inputOnly.announce.waiting', "Chat is waiting for your input"),
	failed: localize('inputOnly.announce.failed', "Chat response failed"),
	canceled: localize('inputOnly.announce.canceled', "Chat response canceled"),
};

/**
 * The state of a response, shown with the message above the input while only the input is shown: whether it works,
 * waits for the user, which the input's approvals or the conversation show, or how it ended.
 */
export function getInputOnlyResponseState(isIncomplete: boolean, isPendingConfirmation: boolean, state: ResponseModelState): InputOnlyResponseState | undefined {
	if (isPendingConfirmation) {
		return 'waiting';
	}
	if (isIncomplete) {
		return 'working';
	}
	switch (state) {
		case ResponseModelState.Complete:
			return 'succeeded';
		case ResponseModelState.Failed:
			return 'failed';
		case ResponseModelState.Cancelled:
			return 'canceled';
		default:
			return undefined;
	}
}

/** What a working response does: its latest progress message or running tool. */
export function getInputOnlyProgressMessage(parts: readonly IChatProgressResponseContent[], reader: IReader | undefined): string {
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];
		if (part.kind === 'progressMessage') {
			return renderAsPlaintext(part.content);
		}
		if (part.kind === 'toolInvocation' && !IChatToolInvocation.isComplete(part, reader)) {
			const message = part.invocationMessage;
			return typeof message === 'string' ? message : renderAsPlaintext(message);
		}
	}
	return localize('inputOnly.workingMessage', "Working...");
}

/** Longest response text turned into the one line shown above the input; the line is trimmed to fit anyway. */
const INPUT_ONLY_RESPONSE_MAX_LENGTH = 1000;

/** The response's answer, its final text after any tool calls, as the one line shown above the input. */
export function getInputOnlyResponseText(finalResponse: string): string | undefined {
	const markdown = new MarkdownString(finalResponse.slice(0, INPUT_ONLY_RESPONSE_MAX_LENGTH));
	return renderAsPlaintext(markdown, { omitMarkdownSyntax: true }).replace(/\s+/g, ' ').trim() || undefined;
}

/**
 * Whether the chat waits for input that only its conversation shows. The input shows questions, and tool approvals in
 * its confirmation carousel when that is enabled; other approvals, confirmations, plan reviews and elicitations show
 * only in the conversation.
 */
export function needsConversationForInput(model: IChatModel | undefined, confirmationCarouselEnabled: boolean, reader: IReader | undefined): boolean {
	const response = model?.lastRequestObs.read(reader)?.response;
	if (!response?.isPendingConfirmation.read(reader)) {
		return false;
	}
	if (response.pendingToolInvocations.read(reader).some(tool => !confirmationCarouselEnabled || !isCarouselToolConfirmation(tool, tool.state.read(reader)))) {
		return true;
	}
	return response.response.value.some(part => {
		switch (part.kind) {
			case 'confirmation':
			case 'planReview':
				return !part.isUsed;
			case 'elicitation2':
				return part.state.read(reader) === ElicitationState.Pending;
			default:
				return false;
		}
	});
}

export function shouldShowTranscriptPreparationProgress(requestCount: number, visibleRequestCount: number, hiddenRequestIncomplete: boolean | undefined): boolean {
	return requestCount === 0 || (visibleRequestCount === 0 && hiddenRequestIncomplete !== false);
}

export function shouldShowTranscriptPreparationCompletion(requestCount: number, visibleRequestCount: number, hiddenRequestState: ResponseModelState | undefined, readyMessage: string | undefined): boolean {
	return requestCount > 0 && visibleRequestCount === 0 && hiddenRequestState === ResponseModelState.Complete && !!readyMessage;
}

export function getTranscriptProgress(showProgress: boolean, activity: string | undefined): string | undefined {
	if (!showProgress) {
		return undefined;
	}
	return activity?.trim() || undefined;
}

export function findTranscriptContextEntry(requests: readonly { readonly variableData: { readonly variables: readonly IChatRequestVariableEntry[] }; readonly attachedContext?: readonly IChatRequestVariableEntry[] }[]): IChatRequestTranscriptContextVariableEntry | undefined {
	for (const request of requests) {
		const entry = [...request.variableData.variables, ...(request.attachedContext ?? [])].find(isChatTranscriptContextVariableEntry);
		if (entry) {
			return entry;
		}
	}
	return undefined;
}

/** Returns initial transcript context until a request row becomes visible. */
export function findInitialTranscriptContextEntry(requests: readonly { readonly isRequestHiddenFromTranscript: boolean; readonly variableData: { readonly variables: readonly IChatRequestVariableEntry[] }; readonly attachedContext?: readonly IChatRequestVariableEntry[] }[]): IChatRequestTranscriptContextVariableEntry | undefined {
	return requests.some(request => !request.isRequestHiddenFromTranscript)
		? undefined
		: findTranscriptContextEntry(requests);
}

/**
 * Default {@link IChatViewFactory} implementation. Lives in the contrib
 * layer where the concrete views are defined and is registered as an eager
 * singleton via the entry point.
 */
export class ChatViewFactory implements IChatViewFactory {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	createNewChatView(isNewChatInSession: boolean, options: IChatViewOptions, instantiationService = this.instantiationService): AbstractChatView {
		return instantiationService.createInstance(NewChatView, isNewChatInSession, options);
	}

	createChatView(instantiationService = this.instantiationService, options: IChatViewOptions = {}): AbstractChatView {
		return instantiationService.createInstance(ChatView, options);
	}
}

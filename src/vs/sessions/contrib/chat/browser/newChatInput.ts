/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInput.css';
import './media/chatInputMobile.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import type { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../editor/common/config/fontInfo.js';
import { EditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../../workbench/contrib/accessibility/common/accessibilityCommands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { getSimpleEditorOptions } from '../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';
import { ChatDragAndDrop } from '../../../../workbench/contrib/chat/browser/widget/chatDragAndDrop.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../workbench/common/theme.js';
import { inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../../common/theme.js';

import { INewChatVoiceTargetService, isNewChatVoiceSessionActive, NEW_CHAT_VOICE_SENTINEL, NewChatVoiceController } from './newChatVoice.js';
import { ISessionTypePickerOptions, SessionTypePicker } from './sessionTypePicker.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { MobileSessionTypePicker } from './mobile/mobileSessionTypePicker.js';
import { installMobileChipLaneScroll } from '../../../browser/parts/mobile/mobileChipLaneScroll.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../browser/menus.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getDictationHoverMarkdown } from '../../../../workbench/contrib/chat/browser/speechToText/micButtonHovers.js';
import { addMicButtonContextMenuListener, getDictationContextMenuActions } from '../../../../workbench/contrib/chat/browser/speechToText/micButtonMenuActions.js';
import { SlashCommandHandler } from './slashCommands.js';
import { VariableCompletionHandler } from './variableCompletions.js';
import { SessionReferenceCompletionHandler } from './sessionReferenceCompletions.js';
import { AgentHostInputCompletionHandler } from './agentHostInputCompletions.js';
import { IChatModelInputState } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatRequestVariableEntry, isExplicitFileOrImageVariableEntry, toFileVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ChatHistoryNavigator } from '../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IHistoryNavigationWidget } from '../../../../base/browser/history.js';
import { registerAndCreateHistoryNavigationContext, IHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ChatInputNotificationWidget } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationWidget.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { registerChatInputOnboardingHosts } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputOnboardingHosts.js';
import { IChatInputNoticeHubService } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHub.js';
import { chatInputStackClass, chatInputStackSlotClass, ChatInputStackSlot, refreshChatInputStack, setChatInputStackSlot } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { IChatSubmitRequestHandlerService } from '../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js';
import { INewChatModelPickerService, NewChatModelPickerService } from './newChatModelPicker.js';
import { ModelPicker, ModelPickerActionViewItem } from './modelPicker.js';
import { ISessionModelSelectionModel, SessionModelSelectionModel } from './sessionModelSelectionModel.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import { IChatStatusItemService } from '../../../../workbench/contrib/chat/browser/chatStatus/chatStatusItemService.js';
import { handleTerminalCommandPaste, isTerminalCommandInput } from '../../../../workbench/contrib/chat/browser/chatTerminalCommandPaste.js';
import { IChatPasteTargetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { NewChatInputPasteTarget } from './newChatInputPasteTarget.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { ChatSpeechToTextState, DictationSettingId, IChatSpeechToTextService, isDictationActiveOnSurface } from '../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js';
import { setupDictationMicGlow } from '../../../../workbench/contrib/chat/browser/speechToText/dictationMicGlow.js';
import { IDictationOnboardingService } from '../../../../workbench/contrib/chat/browser/speechToText/dictationOnboarding.js';
import { ChatVoiceInputModeAction, VoiceInputModeActionViewItem } from '../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputModeActionViewItem.js';
import { IVoiceInputModeService } from '../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js';
import { toAction } from '../../../../base/common/actions.js';
import { runDictationShortcut } from '../../../../workbench/contrib/chat/browser/actions/chatSpeechToTextActions.js';
import { notifyDictationSubmitted } from '../../../../workbench/contrib/chat/browser/speechToText/dictationSession.js';
import { combineVoiceInput } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceInputUtils.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { DictationDownloadRing, getDictationDownloadHoverMarkdown, getDictationPreparingLabel } from '../../../../workbench/contrib/chat/browser/speechToText/dictationDownloadRing.js';
import { IVoiceSessionController } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js';
import { ChatPetWidget } from '../../../../workbench/contrib/chat/browser/widget/chatPetWidget.js';
import { IVoiceModeOnboardingService } from '../../../../workbench/contrib/agentsVoice/browser/voiceModeOnboarding.js';
import { AGENTS_VOICE_ENABLED } from '../../../../workbench/contrib/agentsVoice/common/agentsVoice.js';
import { animatePromptTyping, IPromptTypingAnimation } from './promptTypingAnimation.js';
import { PromptTemplatePlaceholderController } from './promptTemplatePlaceholder.js';
import { INewSessionComposer, INewSessionPromptOptionsController, NEW_SESSION_PROMPT_TYPING_DURATION_MS, NewSessionPromptOptionsState, NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';
import { NewSessionPromptOptionsWidget } from './newSessionPromptOptions.js';


const OPEN_OTEL_SETTINGS_COMMAND = 'github.copilot.chat.otel.openSettings';
const OTEL_STATUS_COMMAND = 'github.copilot.chat.otel.statusActive';
const OTEL_STATUS_ENTRY_ID = 'copilot.otelStatus';
const OTEL_DOCS_URL = 'https://code.visualstudio.com/docs/agents/guides/monitoring-agents';
const STORAGE_KEY_DRAFT_STATE = 'sessions.draftState';
const MIN_EDITOR_HEIGHT = 50;
const MAX_EDITOR_HEIGHT = 200;
const NEW_CHAT_INPUT_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

/** True while focus is in an Agents window composer that supports dictation. */
const SessionsChatInputHasDictationFocus = new RawContextKey<boolean>('sessionsChatInputHasDictationFocus', false, localize('sessionsChatInputHasDictationFocus', "True when focus is in an Agents window chat composer that supports dictation."));

const TOGGLE_DICTATION_COMMAND_ID = 'sessions.action.chat.toggleDictation';

/** Composer the dictation shortcut targets (the composer isn't an `IChatWidget`). */
let activeDictationComposer: NewChatInputWidget | undefined;

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: TOGGLE_DICTATION_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: ContextKeyExpr.and(
		SessionsChatInputHasDictationFocus,
		ContextKeyExpr.has(ChatContextKeys.speechToTextConfigured.key),
	),
	primary: KeyMod.CtrlCmd | KeyCode.KeyI,
	handler: () => activeDictationComposer?.toggleDictation(),
});

// Preserve the command id so push-to-talk hold mode can track this chord.
KeybindingsRegistry.registerKeybindingRule({
	id: 'agentsVoice.startVoiceInChat',
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: ContextKeyExpr.and(
		SessionsChatInputHasDictationFocus,
		AGENTS_VOICE_ENABLED,
	),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
});

interface IDraftState {
	inputText: string;
	attachments: readonly IChatRequestVariableEntry[];
}

class NewChatInputStatusActionViewItem extends MenuEntryActionViewItem {
	private readonly hoverContentDisposables = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IChatStatusItemService private readonly chatStatusItemService: IChatStatusItemService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (this._commandAction.id !== OTEL_STATUS_COMMAND) {
			return;
		}

		this._register(this.chatStatusItemService.onDidChange(e => {
			if (e.entry.id === OTEL_STATUS_ENTRY_ID) {
				this.updateTooltip();
			}
		}));
	}

	override async onClick(event: MouseEvent): Promise<void> {
		if (this._commandAction.id === OTEL_STATUS_COMMAND && this.element) {
			event.preventDefault();
			event.stopPropagation();
			this.hoverService.showManagedHover(this.element);
			return;
		}

		await super.onClick(event);
	}

	protected override getHoverContents(): IManagedHoverContent | undefined {
		if (this._commandAction.id === OTEL_STATUS_COMMAND) {
			return { element: () => this._renderStatusHover() };
		}

		return super.getHoverContents();
	}

	protected override getTooltip(): string {
		if (this._commandAction.id === OTEL_STATUS_COMMAND) {
			const tooltip = this._getStatusEntryTooltip();
			if (tooltip) {
				return tooltip;
			}
		}

		return super.getTooltip();
	}

	private _getStatusEntryTooltip(): string | undefined {
		for (const entry of this.chatStatusItemService.getEntries()) {
			if (entry.id === OTEL_STATUS_ENTRY_ID) {
				return entry.tooltip;
			}
		}

		return undefined;
	}

	private _renderStatusHover(): HTMLElement {
		const store = new DisposableStore();
		this.hoverContentDisposables.value = store;

		const root = dom.$('.new-chat-input-status-hover');
		root.appendChild(dom.$('.new-chat-input-status-hover-title', undefined, localize('newChatInput.status.otel.title', "Monitoring with OpenTelemetry enabled")));
		root.appendChild(dom.$('.new-chat-input-status-hover-detail', undefined, this._getStatusEntryTooltip() ?? super.getTooltip()));

		const actions = root.appendChild(dom.$('.new-chat-input-status-hover-actions'));
		const learnMoreButton = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		learnMoreButton.label = localize('newChatInput.status.otel.learnMore', "Learn More");
		store.add(learnMoreButton.onDidClick(() => {
			void this.commandService.executeCommand('vscode.open', URI.parse(OTEL_DOCS_URL));
			this.hoverService.hideHover(true);
		}));

		const manageButton = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		manageButton.label = localize('newChatInput.status.otel.manage', "Manage");
		store.add(manageButton.onDidClick(() => {
			void this.commandService.executeCommand(OPEN_OTEL_SETTINGS_COMMAND);
			this.hoverService.hideHover(true);
		}));

		return root;
	}
}

/**
 * Options passed to the {@link NewChatInputWidget}'s `sendRequest` callback when
 * the user submits the input.
 */
export interface INewChatInputSendRequest {
	readonly query: string;
	readonly attachments?: IChatRequestVariableEntry[];
	readonly background?: boolean;
}

/**
 * Randomized, friendly placeholders shown in the new-session chat input
 * to add a bit of personality. One is picked per widget instance, avoiding
 * an immediate repeat of the previous pick.
 */
const RANDOM_PLACEHOLDERS = [
	localize('sessionsChatInput.placeholder.whatAreYouBuilding', "What are you building?"),
	localize('sessionsChatInput.placeholder.whatWillYouShipToday', "What will you ship today?"),
	localize('sessionsChatInput.placeholder.describeWhatYouWantToBuild', "Describe what you want to build"),
	localize('sessionsChatInput.placeholder.whatsYourNextMilestone', "What's your next milestone?"),
	localize('sessionsChatInput.placeholder.whatAreYouTryingToAchieve', "What are you trying to achieve?"),
	localize('sessionsChatInput.placeholder.pitchYourIdea', "Pitch your idea"),
	localize('sessionsChatInput.placeholder.whatsTheGoal', "What's the goal?"),
	localize('sessionsChatInput.placeholder.whatWillYouCreate', "What will you create?"),
	localize('sessionsChatInput.placeholder.whatFeatureAreYouDreamingUp', "What feature are you dreaming up?"),
	localize('sessionsChatInput.placeholder.describeTheOutcome', "Describe the outcome you want"),
	localize('sessionsChatInput.placeholder.whatProblemAreYouSolving', "What problem are you solving?"),
	localize('sessionsChatInput.placeholder.whatsNextOnYourRoadmap', "What's next on your roadmap?"),
	localize('sessionsChatInput.placeholder.whatWouldYouLikeToAutomate', "What would you like to automate?"),
	localize('sessionsChatInput.placeholder.whatWillYouLaunch', "What will you launch?"),
	localize('sessionsChatInput.placeholder.describeYourMission', "Describe your mission"),
];

let lastPlaceholderIndex = -1;
function getRandomChatInputPlaceholder(): string {
	let index = Math.floor(Math.random() * RANDOM_PLACEHOLDERS.length);
	if (index === lastPlaceholderIndex) {
		index = (index + 1) % RANDOM_PLACEHOLDERS.length;
	}
	lastPlaceholderIndex = index;
	return RANDOM_PLACEHOLDERS[index];
}

// #region --- New Chat Widget ---

export class NewChatInputWidget extends Disposable implements IHistoryNavigationWidget, INewSessionComposer {
	private static readonly compactModelPickerWidth = 280;

	readonly sessionTypePicker: SessionTypePicker;

	/** Arbitrates which notice occupies the area above this input. */
	readonly noticeHost = this._register(new ChatInputNoticeHost(() => this.focus()));
	private _gettingStartedTipContainer: HTMLElement | undefined;

	/** The canonical notice slot, directly above this input. */
	get gettingStartedTipContainerElement(): HTMLElement | undefined {
		return this._gettingStartedTipContainer;
	}


	// IHistoryNavigationWidget
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;
	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;
	get element(): HTMLElement { return this._editorContainer; }

	/** The underlying input editor. Exposed for component fixtures. */
	get inputEditor(): CodeEditorWidget | undefined { return this._editor; }

	/** The current model-selection state. Exposed so host widgets can react to model changes. */
	get selectedModelState() { return this._sessionModelSelectionModel.state; }

	get workspacePreselectionSource(): NewSessionWorkspacePreselectionSource | undefined {
		return this.options.getWorkspacePreselectionSource?.();
	}

	/** Opens the model picker dropdown. */
	openModelPicker(): void { this._newChatModelPickerService.openModelPicker(); }

	/** Moves the provider-contributed session controls into the given container. */
	renderSessionControls(container: HTMLElement): void {
		if (!this._sessionControlsContainer) {
			throw new Error('NewChatInputWidget must be rendered before its session controls.');
		}
		container.appendChild(this._sessionControlsContainer);
	}

	// Input
	private _editor!: CodeEditorWidget;
	private _editorContainer!: HTMLElement;
	private readonly _inputModelReference = this._register(new MutableDisposable<IReference<IResolvedTextEditorModel>>());
	private _sessionControlsContainer: HTMLElement | undefined;
	private readonly _promptTemplatePlaceholder = this._register(new MutableDisposable<PromptTemplatePlaceholderController>());
	private readonly _promptOptionsWidget = this._register(new MutableDisposable<NewSessionPromptOptionsWidget>());
	private readonly _promptOptionsRefresh = this._register(new MutableDisposable<CancellationTokenSource>());
	private _promptOptionsState: NewSessionPromptOptionsState | undefined;
	private _promptOptionsController: INewSessionPromptOptionsController | undefined;
	private _promptOptionsDismissed = false;

	// Send button
	private _sendButton: Button | undefined;
	private _sending = false;

	// Loading state
	private _loadingSpinner: HTMLElement | undefined;
	private readonly _loadingDelayDisposable = this._register(new MutableDisposable());
	private readonly _promptTypingAnimation = this._register(new MutableDisposable<IPromptTypingAnimation>());

	// Attached context
	private readonly _contextAttachments: NewChatContextAttachments;

	// Slash commands
	private _agentHostInputCompletionHandler: AgentHostInputCompletionHandler | undefined;
	private readonly _scopedInstantiationService: IInstantiationService;
	private readonly _newChatModelPickerService = new NewChatModelPickerService();
	private readonly _sessionModelSelectionModel: SessionModelSelectionModel;
	private readonly _canSendRequest: IObservable<boolean>;
	private readonly _compactModelPicker = observableValue(this, false);

	// Input state
	private _draftState: IDraftState | undefined = {
		inputText: '',
		attachments: [],
	};

	// Input history
	private readonly _history: ChatHistoryNavigator;
	private _historyNavigationBackwardsEnablement!: IHistoryNavigationContext['historyNavigationBackwardsEnablement'];
	private _historyNavigationForwardsEnablement!: IHistoryNavigationContext['historyNavigationForwardsEnablement'];

	constructor(
		private readonly options: {
			session: IObservable<IActiveSession | undefined>;
			getContextFolderUri: () => URI | undefined;
			getWorkspacePreselectionSource?: () => NewSessionWorkspacePreselectionSource;
			sendRequest: (request: INewChatInputSendRequest) => Promise<boolean>;
			canSendRequest: IObservable<boolean>;
			canSubmitWithoutSession?: IObservable<boolean>;
			hasAdditionalSendContent?: IObservable<boolean>;
			loading: IObservable<boolean>;
			historyKey?: IObservable<string | undefined>;
			minEditorHeight?: number;
			placeholder?: string;
			renderSessionTypePickerInControls?: boolean;
			renderSendButton?: boolean;
			sessionTypePickerOptions?: ISessionTypePickerOptions;
			supportsBackground?: boolean;
			deferredNotificationsEnabled?: IObservable<boolean>;
			/**
			 * Keep this composer a valid voice target even while a created session
			 * is active. Used by the in-session "new chat" composer so dictation
			 * creates a parallel chat instead of routing to the parent session's
			 * chat widget. The welcome composer leaves this unset.
			 */
			voiceRoutesWhileSessionActive?: boolean;
		},
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IChatPasteTargetService private readonly chatPasteTargetService: IChatPasteTargetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@IHoverService private readonly hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatSpeechToTextService private readonly chatSpeechToTextService: IChatSpeechToTextService,
		@IDictationOnboardingService private readonly dictationOnboardingService: IDictationOnboardingService,
		@IChatInputNoticeHubService private readonly chatInputNoticeHubService: IChatInputNoticeHubService,
		@IChatSubmitRequestHandlerService private readonly chatSubmitRequestHandlerService: IChatSubmitRequestHandlerService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@IVoiceInputModeService private readonly voiceInputModeService: IVoiceInputModeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IVoiceModeOnboardingService private readonly voiceModeOnboardingService: IVoiceModeOnboardingService,
		@INewChatVoiceTargetService private readonly newChatVoiceTargetService: INewChatVoiceTargetService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._sessionModelSelectionModel = this._register(this.instantiationService.createInstance(SessionModelSelectionModel, this.options.session));
		this._canSendRequest = derived(this, reader => {
			if (this.options.canSubmitWithoutSession?.read(reader)) {
				return true;
			}
			const modelSelection = this._sessionModelSelectionModel.state.read(reader);
			return this.options.canSendRequest.read(reader) && modelSelection.hasSelectableModel && !modelSelection.pendingSelection;
		});
		this._scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
			[INewChatModelPickerService, this._newChatModelPickerService],
			[ISessionContext, new SessionContext(this.options.session)],
			[ISessionModelSelectionModel, this._sessionModelSelectionModel],
		)));
		this._history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
		if (this.options.historyKey) {
			this._register(autorun(reader => this._setHistoryKey(this.options.historyKey?.read(reader))));
			this._register(this.configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
					this._setHistoryKey(this.options.historyKey?.get());
				}
			}));
		}
		this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
		// Always use the mobile-aware picker. Its overrides bail to the
		// desktop behavior when `isPhoneLayout()` is false, so picking
		// the same class regardless of construction-time viewport
		// avoids a class-mismatch when the user resizes across the
		// phone breakpoint after the chat input mounted.
		this.sessionTypePicker = this._register(this.instantiationService.createInstance(MobileSessionTypePicker, this.options.session, this.options.sessionTypePickerOptions));
		this._register(this._contextAttachments.onDidChangeContext(() => {
			this._updateDraftState();
			this._updateSendButtonState();
			this.focus();
		}));
		this._register(autorun(reader => {
			this._canSendRequest.read(reader);
			this.options.hasAdditionalSendContent?.read(reader);
			const isLoading = this.options.loading.read(reader);
			this._loadingSpinner?.classList.toggle('visible', isLoading);
			this._updateSendButtonState();
		}));
	}

	private _setHistoryKey(historyKey: string | undefined): void {
		this._history.setHistoryKey(this.configurationService.getValue<boolean>(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false ? historyKey : undefined);
	}

	// --- Rendering ---

	render(parent: HTMLElement, root: HTMLElement): void {
		// Input slot, and the stack the notices, prompt options and input area sit in.
		const chatInputContainer = dom.append(parent, dom.$(`.new-chat-input-container.${chatInputStackClass}`));

		// Overflow widget DOM node at the top level so the suggest widget
		// is not clipped by any overflow:hidden ancestor.
		// Mounted on the workbench container (not the composer subtree) so overflow
		// widgets such as suggest and the post-paste selector are not clipped by,
		// or stacked beneath, the composer's own layout. Because it lives outside the
		// composer, it has to be taken down with the widget rather than with `root`.
		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(dom.getWindow(root)).appendChild(dom.$('.sessions-chat-editor-overflow.monaco-editor'));
		// Suppress the default `Text` kind icon in the suggest widget; chat slash/skill
		// completions use that kind and rely on the chat module's CSS rule scoped to this class.
		editorOverflowWidgetsDomNode.classList.add('hideSuggestTextIcons');
		// Registered before the editor so it is removed after the editor — and the
		// overflow widgets it owns — have been disposed.
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		this._register(this.chatInputNoticeHubService.registerHost(this.noticeHost, chatInputContainer));

		// Scopes the notice focus command to this composer. Tracked on the whole
		// container rather than the editor, so the command can also toggle focus
		// back out of a notice once it is in one.
		const composerFocusKey = ChatContextKeys.inChatComposer.bindTo(this._register(this.contextKeyService.createScoped(chatInputContainer)));
		const composerFocusTracker = this._register(dom.trackFocus(chatInputContainer));
		this._register(composerFocusTracker.onDidFocus(() => composerFocusKey.set(true)));
		this._register(composerFocusTracker.onDidBlur(() => composerFocusKey.set(false)));

		// Notification widget above the input area
		const notificationContainer = dom.append(chatInputContainer, dom.$(`.chat-input-notification-container.${chatInputStackSlotClass}`));
		// Declared up front: the visibility callback can fire while the widget is
		// still being constructed, before the binding below is assigned.
		const notificationWidget: ChatInputNotificationWidget = this._register(this.instantiationService.createInstance(
			ChatInputNotificationWidget,
			{
				modelTargetChatSessionType: this.sessionTypePicker.modelTargetChatSessionType,
				deferredNotificationsEnabled: this.options.deferredNotificationsEnabled,
				openModelPicker: () => this._newChatModelPickerService.openModelPicker(),
				switchToModel: modelIdentifier => this._newChatModelPickerService.switchToModel(modelIdentifier),
				onDidChangeVisibility: (visible, focusTarget) => this.noticeHost.setOccupied(ChatInputNoticeLane.Notification, visible, focusTarget),
				focusInput: () => this.focus(),
			},
		));
		notificationWidget.attachTo(notificationContainer);

		// First-run voice and dictation introductions, docked directly above the
		// input area so they read as one stack with it.
		const voiceOnboardingContainer = dom.append(chatInputContainer, dom.$(`.voice-mode-onboarding-container.${chatInputStackSlotClass}`));
		const dictationOnboardingContainer = dom.append(chatInputContainer, dom.$(`.dictation-onboarding-container.${chatInputStackSlotClass}`));
		this._register(registerChatInputOnboardingHosts(
			this.noticeHost,
			{ voice: voiceOnboardingContainer, dictation: dictationOnboardingContainer },
			chatInputContainer,
			() => this.focus(),
			this.voiceModeOnboardingService,
			this.dictationOnboardingService,
		));

		// Getting-started tip: the canonical notice slot, directly above and
		// attached to the input, matching the workbench chat input.
		this._gettingStartedTipContainer = dom.append(chatInputContainer, dom.$(`.chat-getting-started-tip-container.${chatInputStackSlotClass}`));

		this._promptOptionsWidget.value = this.instantiationService.createInstance(NewSessionPromptOptionsWidget, chatInputContainer, {
			selectOption: async (option, expectedInput, animate) => {
				this.focus();
				const inserted = animate
					? await this.animatePrompt(option.prompt, NEW_SESSION_PROMPT_TYPING_DURATION_MS, option.placeholder, CancellationToken.None, expectedInput)
					: this._replacePrompt(option.prompt, option.placeholder, expectedInput);
				const generatedValue = option.placeholder ? option.prompt.replace(option.placeholder, '') : option.prompt;
				if (inserted && (this._editor.getValue() === option.prompt || this._editor.getValue() === generatedValue)) {
					aria.status(localize('newSessionPromptOptions.inserted', "Inserted prompt: {0}", option.title));
				}
				return inserted;
			},
			onDidSelectOption: option => this._promptOptionsController?.onDidSelectOption(option),
			onDidClose: () => this._dismissPromptOptions(),
		});
		this._promptOptionsWidget.value.setState(this._promptOptionsState);

		// Input area inside the input slot
		const inputAreaWrapper = dom.append(chatInputContainer, dom.$('.new-chat-input-area-wrapper'));
		const inputArea = dom.append(inputAreaWrapper, dom.$('.new-chat-input-area'));

		// Attachments row (pills only) inside input area, above editor
		const contextAttachments = this._contextAttachments;
		const attachRow = dom.append(inputArea, dom.$('.sessions-chat-attach-row'));
		const attachedContextContainer = dom.append(attachRow, dom.$('.sessions-chat-attached-context'));
		this._contextAttachments.renderAttachedContext(attachedContextContainer);
		this._register(this.instantiationService.createInstance(ChatDragAndDrop, () => undefined, {
			get attachments() { return contextAttachments.attachments; },
			addAttachments: (entries: readonly IChatRequestVariableEntry[]) => contextAttachments.addAttachments(...entries),
		}, {
			listForeground: inactiveSessionViewForeground,
			listBackground: inactiveSessionViewBackground,
			overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
		})).addOverlay(root, root);

		this._createEditor(inputArea, editorOverflowWidgetsDomNode);
		const inputHasContent = observableFromEvent(this, this._editor.onDidChangeModelContent, () => this._editor.getValue().length > 0);
		this._register(this.instantiationService.createInstance(ChatPetWidget, chatInputContainer, inputArea, root, constObservable(undefined), inputHasContent, constObservable(true), this._editor.onDidChangeModelContent));
		this._createInputToolbar(inputArea);

		const newChatBottomContainer = dom.append(parent, dom.$('.new-chat-bottom-container'));
		const newChatControlsContainer = dom.append(newChatBottomContainer, dom.$('.new-chat-controls-container'));
		if (this.options.renderSessionTypePickerInControls !== false) {
			const sessionTypePickerHost = dom.append(newChatControlsContainer, dom.$('.new-chat-session-type-picker-host'));
			this.sessionTypePicker.render(sessionTypePickerHost);
		}
		const sessionControlsContainer = this._sessionControlsContainer = dom.append(newChatControlsContainer, dom.$('.new-chat-session-controls'));
		this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, sessionControlsContainer, Menus.NewSessionControl, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));
		this._register({ dispose: () => sessionControlsContainer.remove() });

		const repoConfigContainer = dom.append(newChatBottomContainer, dom.$('.new-chat-repo-config-container'));
		this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, repoConfigContainer, Menus.NewSessionRepositoryConfig, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));

		// On phone, the chip lane is horizontally scrollable when its
		// content overflows the viewport. Native touch scroll is blocked
		// because each chip registers a `Gesture.addTarget` handler in
		// `renderPickerTrigger` that calls `preventDefault` on
		// `touchmove`, swallowing the pan. The helper below installs a
		// pointer-event-based scroll handler that no-ops on desktop and
		// kicks in once a drag crosses a small threshold on phone.
		this._register(installMobileChipLaneScroll(newChatBottomContainer, this.layoutService));

		// Generic extension point for status indicators in the new-session view.
		const statusContainer = dom.append(repoConfigContainer, dom.$('.new-chat-status-toolbar'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, statusContainer, MenuId.ChatInputStatus, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			actionViewItemProvider: (action, options) => {
				if (action.id === OTEL_STATUS_COMMAND && action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(NewChatInputStatusActionViewItem, action, options);
				}
				return undefined;
			},
		}));

		// Restore draft input state from storage
		this._restoreState();

		// The composer is a stack, and was just added to its host's stack. Hosts
		// often dock a notice - the sub-session tip, a feedback banner - before
		// this point, and nothing reports for a child being added.
		//
		// Standalone, not docked: the composer draws its own frame, so a notice
		// above it joins it but the run stops before the controls row below.
		setChatInputStackSlot(chatInputContainer, ChatInputStackSlot.Standalone);
		refreshChatInputStack(parent);

		// Layout editor after the input slot fade-in animation completes
		this._register(dom.addDisposableListener(chatInputContainer, 'animationend', () => {
			this._editor?.layout();
		}, { once: true }));
	}

	private _updateInputLoadingState(): void {
		const loading = this._sending;
		if (loading) {
			if (!this._loadingDelayDisposable.value) {
				const timer = setTimeout(() => {
					this._loadingDelayDisposable.clear();
					if (this._sending) {
						this._loadingSpinner?.classList.add('visible');
					}
				}, 500);
				this._loadingDelayDisposable.value = toDisposable(() => clearTimeout(timer));
			}
		} else {
			this._loadingDelayDisposable.clear();
			this._loadingSpinner?.classList.remove('visible');
		}
	}

	// --- Editor ---

	private _getAriaLabel(): string {
		const verbose = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionsChat);
		if (verbose) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel
				? localize('chatInput.accessibilityHelp', "Chat input. Press Enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel)
				: localize('chatInput.accessibilityHelpNoKb', "Chat input. Press Enter to send out the request. Use the Chat Accessibility Help command for more information.");
		}
		return localize('chatInput', "Chat input");
	}

	private _getTerminalCommandPrefix(): string | undefined {
		const session = this.options.session.get();
		return session ? this.chatSessionsService.getCapabilitiesForSessionType(getChatSessionType(session.resource))?.terminalCommandPrefix : undefined;
	}

	private _handleTerminalCommandPaste(e: ClipboardEvent): void {
		handleTerminalCommandPaste(e, this._editor, this._getTerminalCommandPrefix(), this.dialogService, this.storageService);
	}

	/**
	 * Paste edits are applied through the bulk edit service, which resolves the
	 * input model and force-destroys it when the last reference is released.
	 * Holding one keeps the model alive for this editor's lifetime.
	 */
	private async _holdInputModelReference(uri: URI): Promise<void> {
		try {
			this._inputModelReference.value = await this.textModelService.createModelReference(uri);
		} catch (error) {
			this.logService.error('Failed to hold the chat input model reference', error);
		}
	}

	private _createEditor(container: HTMLElement, overflowWidgetsDomNode: HTMLElement): void {
		const editorContainer = this._editorContainer = dom.append(container, dom.$('.sessions-chat-editor'));
		const minHeight = this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT;
		editorContainer.style.height = `${minHeight}px`;

		// Create scoped context key service and register history navigation
		// BEFORE creating the editor, so the editor's context key scope is a child
		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
		this._historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
		this._historyNavigationForwardsEnablement = historyNavigationForwardsEnablement;

		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));

		const uri = URI.from({ scheme: Schemas.sessionsChatInput, path: `input-${Date.now()}` });
		const textModel = this._register(this.modelService.createModel('', null, uri, true));
		void this._holdInputModelReference(uri);

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this.configurationService),
			readOnly: false,
			// Match the workbench chat input so the post-paste selector is offered.
			pasteAs: EditorOptions.pasteAs.defaultValue,
			ariaLabel: this._getAriaLabel(),
			placeholder: this.options.placeholder ?? getRandomChatInputPlaceholder(),
			fontFamily: NEW_CHAT_INPUT_FONT_FAMILY,
			fontSize: 13,
			lineHeight: 20,
			cursorWidth: 1,
			padding: { top: 8, bottom: 2 },
			wrappingStrategy: 'advanced',
			stickyScroll: { enabled: false },
			renderWhitespace: 'none',
			scrollbar: {
				horizontal: 'hidden',
				alwaysConsumeMouseWheel: false,
				vertical: 'auto',
				verticalScrollbarSize: 7,
			},
			overflowWidgetsDomNode,
			suggest: {
				showIcons: true,
				showSnippets: false,
				showWords: true,
				showStatusBar: false,
				insertMode: 'insert',
				fitWidthToDetails: true,
			},
		};

		const widgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				ContextMenuController.ID,
				SuggestController.ID,
				SnippetController2.ID,
				PlaceholderTextContribution.ID,
				CopyPasteController.ID,
			]),
		};

		this._editor = this._register(scopedInstantiationService.createInstance(
			CodeEditorWidget, editorContainer, editorOptions, widgetOptions,
		));
		this._editor.setModel(textModel);
		this._promptTemplatePlaceholder.value = new PromptTemplatePlaceholderController(this._editor, () => this._promptTypingAnimation.value?.complete());
		this._register(autorun(reader => {
			// Re-evaluate when the attached session changes; content changes are
			// handled by the model-content listener below.
			this.options.session.read(reader);
			this._updateEditorFontFamily();
		}));
		// Attach to the container (not `getDomNode()`, which is null until the
		// editor has a model) so the capture-phase paste veto is always wired up.
		this._register(dom.addDisposableListener(this._editorContainer, dom.EventType.PASTE, e => this._handleTerminalCommandPaste(e), true));

		// Ensure suggest widget renders above the input (not clipped by container)
		SuggestController.get(this._editor)?.forceRenderingAbove();

		// Update aria label when accessibility verbosity setting changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.SessionsChat)) {
				this._editor.updateOptions({ ariaLabel: this._getAriaLabel() });
			}
		}));

		const dictationFocusKey = SessionsChatInputHasDictationFocus.bindTo(inputScopedContextKeyService);
		this._register(this._editor.onDidFocusEditorWidget(() => {
			dictationFocusKey.set(true);
			activeDictationComposer = this;
			this._onDidFocus.fire();
		}));
		this._register(this._editor.onDidBlurEditorWidget(() => {
			dictationFocusKey.set(false);
			if (activeDictationComposer === this) {
				activeDictationComposer = undefined;
			}
			this._onDidBlur.fire();
		}));
		this._register(toDisposable(() => {
			if (activeDictationComposer === this) {
				activeDictationComposer = undefined;
			}
		}));

		this._register(this._editor.onKeyDown(e => {
			if (e.browserEvent.defaultPrevented) {
				return;
			}
			if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && !e.altKey && this._promptTemplatePlaceholder.value?.replaceAtCursor()) {
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && !e.altKey) {
				// Don't send if the suggest widget is visible (let it accept the completion)
				if (this._editor.contextKeyService.getContextKeyValue<boolean>('suggestWidgetVisible')) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				this._send();
			}
			// Alt+Enter — send in the background without navigating into the session
			if (this.options.supportsBackground && e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				this._send(true);
			}
			// Cmd+/ / Ctrl+/ — open the context picker (same as the attach button)
			if (e.equals(KeyMod.CtrlCmd | KeyCode.Slash)) {
				e.preventDefault();
				e.stopPropagation();
				this._contextAttachments.showPicker(this.options.getContextFolderUri());
			}
		}));

		// Update history navigation enablement based on cursor position
		const updateHistoryNavigationEnablement = () => {
			const model = this._editor.getModel();
			const position = this._editor.getPosition();
			if (!model || !position) {
				return;
			}
			this._historyNavigationBackwardsEnablement.set(position.lineNumber === 1 && position.column === 1);
			this._historyNavigationForwardsEnablement.set(position.lineNumber === model.getLineCount() && position.column === model.getLineMaxColumn(position.lineNumber));
		};
		this._register(this._editor.onDidChangeCursorPosition(() => updateHistoryNavigationEnablement()));
		updateHistoryNavigationEnablement();

		let previousHeight = -1;
		this._register(this._editor.onDidContentSizeChange(e => {
			if (!e.contentHeightChanged) {
				return;
			}
			const contentHeight = this._editor.getContentHeight();
			const clampedHeight = Math.min(MAX_EDITOR_HEIGHT, Math.max(this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT, contentHeight));
			if (clampedHeight === previousHeight) {
				return;
			}
			previousHeight = clampedHeight;
			this._editorContainer.style.height = `${clampedHeight}px`;
			this._editor.layout();
		}));

		// Slash commands
		this._register(this._scopedInstantiationService.createInstance(SlashCommandHandler, this._editor));

		// Variable completions (#file, #folder)
		this._register(this.instantiationService.createInstance(
			VariableCompletionHandler, this._editor, this._contextAttachments, () => this.options.getContextFolderUri(),
		));

		// Session reference completions (#session)
		this._register(this.instantiationService.createInstance(
			SessionReferenceCompletionHandler, this._editor, this._contextAttachments,
		));

		this._agentHostInputCompletionHandler = this._register(this._scopedInstantiationService.createInstance(
			AgentHostInputCompletionHandler, this._editor, this._contextAttachments,
		));

		this._register(this.chatPasteTargetService.registerTarget(textModel.uri, new NewChatInputPasteTarget(
			this._editor,
			this._contextAttachments,
			this._agentHostInputCompletionHandler,
			() => this._getTerminalCommandPrefix(),
			() => this.options.session.get()?.resource,
			textModel.uri,
		)));

		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateDraftState();
			this._updateSendButtonState();
			this._updateEditorFontFamily();
			this._promptOptionsWidget.value?.setInputValue(this._editor.getValue());
		}));
	}

	/**
	 * The input is monospace only while a terminal command is being composed:
	 * the attached session advertises a prefix AND the current input begins with
	 * it. Otherwise it uses the normal new-chat input font.
	 */
	private _updateEditorFontFamily(): void {
		const isCommand = isTerminalCommandInput(this._editor.getModel()?.getLineContent(1) || '', this._getTerminalCommandPrefix());
		this._editor.updateOptions({ fontFamily: isCommand ? EDITOR_FONT_DEFAULTS.fontFamily : NEW_CHAT_INPUT_FONT_FAMILY });
	}

	private _createAttachButton(container: HTMLElement): void {
		const attachButton = dom.append(container, dom.$('.sessions-chat-attach-button'));
		const attachButtonLabel = localize('addContext', "Add Context...");
		attachButton.tabIndex = 0;
		attachButton.role = 'button';
		attachButton.ariaLabel = attachButtonLabel;
		this._register(this.hoverService.setupDelayedHover(attachButton, {
			content: attachButtonLabel,
			position: { hoverPosition: HoverPosition.BELOW },
			appearance: { showPointer: true }
		}));
		dom.append(attachButton, renderIcon(Codicon.addCompact));
		this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => {
			this._contextAttachments.showPicker(this.options.getContextFolderUri());
		}));
	}

	private _createInputToolbar(container: HTMLElement): void {
		const toolbar = dom.append(container, dom.$('.sessions-chat-toolbar'));
		let dictationActionVisible = false;
		let voiceActionCount = 0;
		const updateVoiceInputActionBorder = () => {
			toolbar.classList.toggle('sessions-chat-voice-input-actions-multiple', Number(dictationActionVisible) + voiceActionCount > 1);
		};

		this._createAttachButton(toolbar);

		// Session config pickers (such as model) — rendered via MenuWorkbenchToolBar
		// Visibility controlled by context keys (isActiveSessionBackgroundProvider, isNewChatSession)
		const configContainer = dom.append(toolbar, dom.$('.sessions-chat-config-toolbar'));
		this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, configContainer, Menus.NewSessionConfig, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			actionViewItemProvider: (action) => {
				if (action.id === 'sessions.modelPicker') {
					const picker = this._scopedInstantiationService.createInstance(ModelPicker, this._compactModelPicker);
					return new ModelPickerActionViewItem(picker);
				}
				return undefined;
			},
		}));

		dom.append(toolbar, dom.$('.sessions-chat-toolbar-spacer'));

		// Dictation mic button. Shares the STT service, mic
		// device, and gating (backend support + `dictation.enabled`)
		// with the main chat input; inserts the transcript into this composer's
		// editor. Placed before the voice controls so dictation leads the
		// mic-related group.
		try {
			this._createSpeechToTextButton(toolbar, visible => {
				dictationActionVisible = visible;
				updateVoiceInputActionBorder();
			});
		} catch (error) {
			this.logService.error('Failed to create new-session dictation control:', error);
		}

		// Voice controls (mic/stop/settings/disconnect). The hand-built toolbar
		// can't use the shared `MenuId.ChatExecute`, so a dedicated menu is used.
		// Keep the session picker usable when optional voice initialization fails.
		// The controller also handles voice target routing + input glow, which the
		// segmented pill relies on, so it is created regardless of the pill; its
		// toolbar items hide (via `when`) when the pill is active.
		const voiceContainer = dom.append(toolbar, dom.$('.sessions-chat-voice-toolbar'));
		try {
			this._register(this.instantiationService.createInstance(NewChatVoiceController, {
				toolbarContainer: voiceContainer,
				inputContainer: container,
				composer: this,
				onDidChangeActions: actionCount => {
					voiceActionCount = actionCount;
					updateVoiceInputActionBorder();
				},
			}));
		} catch (error) {
			this.logService.error('Failed to create new-session voice controls:', error);
		}

		// Segmented voice/dictation pill (experimental). When enabled it replaces the
		// standalone dictation button and voice controls above with a single control.
		try {
			this._createVoiceInputModePill(toolbar, container);
		} catch (error) {
			this.logService.error('Failed to create new-session voice input mode pill:', error);
		}

		this._loadingSpinner = dom.append(toolbar, dom.$('.sessions-chat-loading-spinner'));
		const loadingIcon = dom.append(this._loadingSpinner, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
		loadingIcon.setAttribute('aria-hidden', 'true');
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._loadingSpinner, localize('loading', "Loading...")));
		this._loadingSpinner.classList.toggle('visible', this.options.loading.get());

		if (this.options.renderSendButton !== false) {
			const sendButtonContainer = dom.append(toolbar, dom.$('.sessions-chat-send-button'));
			const sendButton = this._sendButton = this._register(new Button(sendButtonContainer, {
				secondary: true,
				title: this.options.supportsBackground
					? localize('sendWithBackgroundHint', "Send (Alt-click to start in the background)")
					: localize('send', "Send"),
				ariaLabel: localize('send', "Send"),
			}));
			sendButton.icon = Codicon.arrowUpCompact;
			// Hold Alt while clicking Send to start the session in the background.
			this._register(sendButton.onDidClick(e => this._send(!!this.options.supportsBackground && !!(e as MouseEvent | KeyboardEvent | undefined)?.altKey)));
		}
		updateVoiceInputActionBorder();
	}

	private _createVoiceInputModePill(toolbar: HTMLElement, inputContainer: HTMLElement): void {
		const pillContainer = dom.append(toolbar, dom.$('.sessions-chat-voice-input-mode'));
		const isVoiceInputActive = derived(this, reader => isEqual(this.newChatVoiceTargetService.currentVoiceInputResource.read(reader), NEW_CHAT_VOICE_SENTINEL));
		const isVoiceSessionActive = derived(this, reader => isNewChatVoiceSessionActive(
			this.voiceSessionController.isConnected.read(reader),
			this.voiceSessionController.isConnecting.read(reader),
			this.voiceSessionController.targetSession.read(reader),
			this.voiceSessionController.hasDraftTarget.read(reader),
			this.voiceSessionController.omniInputOpen.read(reader),
		));

		const action = toAction({
			id: ChatVoiceInputModeAction.ID,
			label: localize('voiceInputMode', "Voice Input Mode"),
			run: () => { /* interaction handled by the view item */ },
		});
		const pill = this._register(this._scopedInstantiationService.createInstance(VoiceInputModeActionViewItem, action, {
			// Dictation must target this composer's editor, not the last focused
			// chat widget (this composer isn't an `IChatWidget`).
			toggleDictation: () => { void this.toggleDictation(); },
			isActive: isVoiceInputActive,
			isVoiceActive: isVoiceSessionActive,
		}));
		pill.render(pillContainer);

		// The pill only earns its place when it would host at least two cells:
		//   - both dictation and Voice Mode are available, or
		//   - only Voice Mode is available in manual (non-hands-free) mode AND a
		//     session is active, so listen + voice-connection cells both render.
		// Otherwise the standalone dictation + voice controls show instead.
		this._register(autorun(reader => {
			const dict = this.voiceInputModeService.dictationAvailable.read(reader);
			const voice = this.voiceInputModeService.voiceAvailable.read(reader);
			const handsFree = this.voiceInputModeService.handsFree.read(reader);
			// The voice-only branch's "session active" must match the main-window
			// `AGENTS_VOICE_CONNECTED` context key, which tracks `isConnected` only.
			// Counting `isConnecting` here would show the pill while the scoped
			// standalone toolbar still shows its Connecting item (duplicate controls).
			const connected = isVoiceSessionActive.read(reader) && this.voiceSessionController.isConnected.read(reader);
			const pillActive = (dict && voice) || (voice && !dict && !handsFree && connected);
			pillContainer.classList.toggle('hidden', !pillActive);
			// Mirror the pill's active state onto the input container so voice glow
			// styling (driven by the voice controller) stays consistent.
			inputContainer.classList.toggle('voice-input-mode-pill', pillActive);
		}));
	}

	private _createSpeechToTextButton(container: HTMLElement, onDidChangeVisibility: (visible: boolean) => void): void {
		const sttService = this.chatSpeechToTextService;

		const button = dom.append(container, dom.$('.sessions-chat-stt-button'));
		button.tabIndex = 0;
		button.role = 'button';
		const micLabel = localize('sessionsStt.dictate', "Dictate (Speech to Text)");
		const stopLabel = localize('sessionsStt.stop', "Stop Dictation");
		this._register(this.hoverService.setupDelayedHover(button, () => ({
			// While the model prepares, surface the download/connecting hover
			// (which invites the user to click to cancel) so this composer matches
			// the main chat toolbar affordance. Idle gets the richer description
			// naming the configured dictation model.
			content: sttService.currentSurface === 'chat' && sttService.isPreparingModel
				? getDictationDownloadHoverMarkdown(sttService)
				: (isDictationActiveOnSurface(sttService, 'chat') ? stopLabel : getDictationHoverMarkdown(micLabel, this.configurationService)),
			position: { hoverPosition: HoverPosition.BELOW },
			appearance: { showPointer: true }
		})));

		const downloadRing = this._register(new MutableDisposable<DictationDownloadRing>());
		const renderState = () => {
			const active = isDictationActiveOnSurface(sttService, 'chat');
			const preparing = active && sttService.isPreparingModel;
			// Only the active Recording state should read as "recording" (filled
			// mic). Once the user stops, the service enters Transcribing while it
			// waits for the final transcript (up to a few seconds on the cloud
			// backend); during that the mic must already read as idle, matching
			// the chat toolbar which flips as soon as recording stops.
			const recording = active && sttService.state === ChatSpeechToTextState.Recording;
			dom.clearNode(button);
			downloadRing.clear();
			if (preparing) {
				// First-use only. Show a download icon wrapped by a progress
				// ring only during an actual model download (a confirmed cache
				// miss); otherwise (loading an already-cached model, or the cloud
				// backend connecting) render a plain spinner instead.
				// Glyphs render at the compact 12px size, so use the `*Compact`
				// variants where one exists.
				if (sttService.isDownloadingModel) {
					dom.append(button, renderIcon(Codicon.micDownloadCompact));
					downloadRing.value = new DictationDownloadRing(button, sttService);
				} else {
					dom.append(button, renderIcon(ThemeIcon.modify(Codicon.loadingCompact, 'spin')));
				}
			} else {
				// `mic` / `micFilled` have no compact variant, so they stay as-is.
				dom.append(button, renderIcon(recording ? Codicon.micFilled : Codicon.mic));
			}
			button.classList.toggle('recording', recording && !preparing);
			button.classList.toggle('preparing', preparing);
			button.ariaLabel = preparing
				? localize('sessionsStt.cancelPreparing', "Cancel Dictation. {0}", getDictationPreparingLabel(sttService))
				: (active ? stopLabel : micLabel);
		};
		renderState();
		this._register(sttService.onDidChangeState(renderState));
		this._register(sttService.onDidChangePreparingModel(renderState));
		this._register(sttService.onDidChangeDownloadingModel(renderState));
		this._register(setupDictationMicGlow(button, sttService, this.accessibilityService, undefined, this.themeService));

		const updateVisibility = () => {
			// Mirror the `MenuId.ChatExecute` dictation gate: hide while
			// unconfigured, and while Voice Mode is connected so the dictation and
			// voice mic affordances never compete on this composer. Also hide when
			// the segmented voice/dictation pill applies (both modes available, so
			// the pill hosts its own dictation cell), which supersedes this button.
			const voiceActive = isNewChatVoiceSessionActive(
				this.voiceSessionController.isConnected.get(),
				this.voiceSessionController.isConnecting.get(),
				this.voiceSessionController.targetSession.get(),
				this.voiceSessionController.hasDraftTarget.get(),
				this.voiceSessionController.omniInputOpen.get(),
			);
			const dict = this.voiceInputModeService.dictationAvailable.get();
			const voice = this.voiceInputModeService.voiceAvailable.get();
			const handsFree = this.voiceInputModeService.handsFree.get();
			// Match the pill autorun / `AGENTS_VOICE_CONNECTED`: the voice-only branch
			// keys off `isConnected` only, not the connecting phase.
			const sessionActive = this.voiceSessionController.isConnected.get();
			const pillActive = (dict && voice) || (voice && !dict && !handsFree && sessionActive);
			// Honor the shared `dictation.showButton` visibility toggle: hiding the
			// button still leaves Cmd/Ctrl+I working (its keybinding is independent).
			const buttonShown = this.configurationService.getValue<boolean>(DictationSettingId.ShowButton) !== false;
			const visible = sttService.isConfigured && !voiceActive && !pillActive && buttonShown;
			button.classList.toggle('hidden', !visible);
			onDidChangeVisibility(visible);
		};
		updateVisibility();
		this._register(autorun(reader => {
			this.voiceSessionController.isConnected.read(reader);
			this.voiceSessionController.isConnecting.read(reader);
			this.voiceSessionController.targetSession.read(reader);
			this.voiceSessionController.hasDraftTarget.read(reader);
			this.voiceSessionController.omniInputOpen.read(reader);
			this.voiceInputModeService.dictationAvailable.read(reader);
			this.voiceInputModeService.voiceAvailable.read(reader);
			this.voiceInputModeService.handsFree.read(reader);
			updateVisibility();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			// Both the enable kill-switch and the model selection can change
			// availability (e.g. an unsupported on-device platform becomes
			// configured when switching to the cloud backend).
			if (e.affectsConfiguration('dictation.enabled') || e.affectsConfiguration('dictation.model') || e.affectsConfiguration(DictationSettingId.ShowButton)) {
				updateVisibility();
			}
		}));

		const toggle = () => this.toggleDictation();
		// A styled div doesn't get Enter/Space activation or touch tap for free;
		// wire them explicitly so the button is keyboard- and touch-accessible.
		this._register(Gesture.addTarget(button));
		[dom.EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			this._register(dom.addDisposableListener(button, eventType, e => {
				dom.EventHelper.stop(e);
				void toggle();
			}));
		});
		this._register(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(event, true);
				void toggle();
			}
		}));

		// Right-click shows dictation-specific entries ("Configure Keybinding",
		// "Select Microphone", "Disable Dictation") mirroring the chat-input mic
		// button, since this custom button isn't a `MenuEntryActionViewItem`.
		this._register(addMicButtonContextMenuListener(
			button,
			() => getDictationContextMenuActions(this.commandService, this.configurationService, this.keybindingService, TOGGLE_DICTATION_COMMAND_ID),
			this.contextMenuService,
		));
	}

	/**
	 * Toggle dictation into this composer's editor. Shared by the mic button and
	 * the Cmd/Ctrl+I chord ({@link TOGGLE_DICTATION_COMMAND_ID}); the shared
	 * Dictate action can't target this composer since it isn't an `IChatWidget`.
	 */
	async toggleDictation(): Promise<void> {
		if (!this._editor) {
			return;
		}
		await runDictationShortcut({
			speechService: this.chatSpeechToTextService,
			keybindingService: this.keybindingService,
			logService: this.logService,
			onboardingService: this.dictationOnboardingService,
		}, TOGGLE_DICTATION_COMMAND_ID, this._editor);
	}

	// --- Input History (IHistoryNavigationWidget) ---

	showPreviousValue(): void {
		if (this._history.isAtStart()) {
			return;
		}
		if (this._draftState?.inputText || this._draftState?.attachments.length) {
			this._history.overlay(this._toHistoryEntry(this._draftState));
		}
		this._navigateHistory(true);
	}

	showNextValue(): void {
		if (this._history.isAtEnd()) {
			return;
		}
		if (this._draftState?.inputText || this._draftState?.attachments.length) {
			this._history.overlay(this._toHistoryEntry(this._draftState));
		}
		this._navigateHistory(false);
	}

	private _updateDraftState(): void {
		this._draftState = {
			inputText: this._editor?.getModel()?.getValue() ?? '',
			attachments: [...this._contextAttachments.attachments],
		};
	}

	private _toHistoryEntry(draft: IDraftState): IChatModelInputState {
		return {
			...draft,
			mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
			selectedModel: undefined,
			selections: [],
			contrib: {},
		};
	}

	private _navigateHistory(previous: boolean): void {
		const entry = previous ? this._history.previous() : this._history.next();
		const inputText = entry?.inputText ?? '';
		if (entry) {
			this._editor?.getModel()?.setValue(inputText);
			this._contextAttachments.setAttachments(entry.attachments);
		}
		aria.status(inputText);
		if (previous) {
			this._editor.setPosition({ lineNumber: 1, column: 1 });
		} else {
			const model = this._editor.getModel();
			if (model) {
				const lastLine = model.getLineCount();
				this._editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
			}
		}
	}

	// --- Send ---


	async submit(background = false): Promise<boolean> {
		return this._send(background);
	}

	private async _send(background = false): Promise<boolean> {
		const rawQuery = this._editor.getModel()?.getValue() ?? '';
		const query = rawQuery.trim();
		const queryOffset = rawQuery.length - rawQuery.trimStart().length;
		const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
		const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
		if ((!query && !hasSendableAttachment && !hasAdditionalSendContent) || this._sending) {
			return false;
		}

		// Respect the same gate as the send button (e.g. a session with no
		// usable model). The Enter keybinding and slash-command paths reach
		// here directly, bypassing the button's disabled state.
		if (!this._canSendRequest.get()) {
			return false;
		}

		// Measure any pending dictation accuracy against the text being sent,
		// before the editor is cleared below.
		notifyDictationSubmitted(this._editor);

		const session = this.options.session.get();
		if (!hasAdditionalSendContent && session && await this.chatSubmitRequestHandlerService.tryHandle({
			sessionResource: session.resource,
			providerId: session.providerId,
			sessionId: session.sessionId,
			input: query,
		})) {
			this._editor.getModel()?.setValue('');
			return true;
		}

		const attachments = this._agentHostInputCompletionHandler?.getAttachmentsForSend(query, queryOffset) ?? [...this._contextAttachments.attachments];
		const attachedContext = attachments.length > 0
			? attachments
			: undefined;
		const request = query;

		if (this._draftState) {
			this._history.append(this._toHistoryEntry(this._draftState));
		}
		this._clearDraftState();

		this._sending = true;
		this._editor.updateOptions({ readOnly: true });
		this._updateSendButtonState();
		this._updateInputLoadingState();

		let sent = false;
		try {
			sent = await this.options.sendRequest({ query: request, attachments: attachedContext, background });
			if (!sent) {
				return false;
			}
			this._contextAttachments.clear();
			this._editor.getModel()?.setValue('');
		} catch (e) {
			this.logService.error('Failed to send request:', e);
			return false;
		} finally {
			this._sending = false;
			this._editor.updateOptions({ readOnly: false });
			this._updateDraftState();
			this._updateSendButtonState();
			this._updateInputLoadingState();
		}
		return sent;
	}

	private _updateSendButtonState(): void {
		if (!this._sendButton) {
			return;
		}
		const hasText = !!this._editor?.getModel()?.getValue().trim();
		const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
		const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
		this._sendButton.enabled = !this._sending && (hasText || hasSendableAttachment || hasAdditionalSendContent) && this._canSendRequest.get();
	}

	private _restoreState(): void {
		const draft = this._getDraftState();
		if (draft) {
			this._editor?.getModel()?.setValue(draft.inputText);
			if (draft.attachments?.length) {
				this._contextAttachments.setAttachments(draft.attachments.map(IChatRequestVariableEntry.fromExport));
			}
		}
	}

	private _getDraftState(): IDraftState | undefined {
		const raw = this.storageService.get(STORAGE_KEY_DRAFT_STATE, StorageScope.WORKSPACE);
		if (!raw) {
			return undefined;
		}
		try {
			return JSON.parse(raw);
		} catch {
			return undefined;
		}
	}

	private _clearDraftState(): void {
		this._draftState = { inputText: '', attachments: [] };
		this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(this._draftState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	saveState(): void {
		if (this._draftState) {
			const state = {
				...this._draftState,
				attachments: this._draftState.attachments.map(IChatRequestVariableEntry.toExport),
			};
			this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	layout(_height: number, width: number): void {
		this._compactModelPicker.set(width < NewChatInputWidget.compactModelPickerWidth, undefined);
		this._editor?.layout();
	}

	focus(): void {
		this._editor?.focus();
	}

	async animatePrompt(text: string, durationMs: number, placeholder: string, token: CancellationToken, expectedValue = ''): Promise<boolean> {
		const editor = this._editor;
		const model = editor?.getModel();
		if (!editor || !model || !text || model.getValue() !== expectedValue || token.isCancellationRequested) {
			return false;
		}

		this._promptTypingAnimation.clear();
		if (expectedValue) {
			model.setValue('');
		}
		this._promptTemplatePlaceholder.value?.setPlaceholder(placeholder);
		const targetWindow = dom.getWindow(this._editorContainer);
		const effectiveDuration = this.accessibilityService.isMotionReduced() || this.accessibilityService.isScreenReaderOptimized() ? 0 : durationMs;
		const animation = animatePromptTyping({
			getValue: () => model.getValue(),
			setValue: value => {
				model.setValue(value);
				const lastLine = model.getLineCount();
				editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
			},
			onDidChange: listener => model.onDidChangeContent(() => listener()),
		}, text, effectiveDuration, {
			now: () => targetWindow.performance.now(),
			schedule: callback => dom.scheduleAtNextAnimationFrame(targetWindow, callback),
		});
		this._promptTypingAnimation.value = animation;
		const cancellationListener = token.onCancellationRequested(() => {
			if (this._promptTypingAnimation.value === animation) {
				this._promptTypingAnimation.clear();
			} else {
				animation.dispose();
			}
		});
		try {
			return (await animation.result).didWrite;
		} finally {
			cancellationListener.dispose();
			if (this._promptTypingAnimation.value === animation) {
				this._promptTypingAnimation.clear();
			}
		}
	}

	private _replacePrompt(text: string, placeholder: string, expectedValue: string): boolean {
		const model = this._editor.getModel();
		if (!model || model.getValue() !== expectedValue) {
			return false;
		}
		this._promptTypingAnimation.clear();
		this._promptTemplatePlaceholder.value?.setPlaceholder(placeholder);
		this._editor.pushUndoStop();
		const edited = this._editor.executeEdits('sessions.promptOption', [{ range: model.getFullModelRange(), text }]);
		if (!edited) {
			return false;
		}
		this._editor.pushUndoStop();
		const lastLine = model.getLineCount();
		this._editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
		return true;
	}

	showPromptOptions(state: NewSessionPromptOptionsState | undefined): boolean {
		if (state && this._promptOptionsDismissed) {
			return false;
		}
		this._promptOptionsState = state;
		const widget = this._promptOptionsWidget.value;
		if (!widget) {
			return false;
		}
		widget.setState(state);
		widget.setInputValue(this._editor.getValue());
		return true;
	}

	setPromptOptionsController(controller: INewSessionPromptOptionsController): void {
		this._cancelPromptOptionsRefresh(false);
		this._promptOptionsController = controller;
		this._promptOptionsDismissed = false;
	}

	preparePromptOptionsRefresh(): boolean {
		if (!this._promptOptionsController || this._promptOptionsDismissed) {
			return false;
		}
		this._cancelPromptOptionsRefresh();
		this.showPromptOptions({ kind: 'loading' });
		return true;
	}

	clearPromptOptions(): void {
		this._cancelPromptOptionsRefresh();
		this.showPromptOptions(undefined);
	}

	private _dismissPromptOptions(): void {
		if (this._promptOptionsDismissed) {
			return;
		}
		const controller = this._promptOptionsController;
		this._promptOptionsDismissed = true;
		this._cancelPromptOptionsRefresh(false);
		this.showPromptOptions(undefined);
		this.focus();
		aria.status(localize('newSessionPromptOptions.closed', "Prompt options closed"));
		controller?.onDidClose();
	}

	private _cancelPromptOptionsRefresh(clearGeneratedInput = true): void {
		const shouldClearInput = this._promptOptionsWidget.value?.shouldClearInputForRefresh() ?? false;
		this._promptTypingAnimation.clear();
		this._promptOptionsRefresh.value?.cancel();
		this._promptOptionsRefresh.clear();
		if (clearGeneratedInput && shouldClearInput) {
			this._promptTemplatePlaceholder.value?.setPlaceholder(undefined);
			this._editor.getModel()?.setValue('');
		}
	}

	async refreshPromptOptions(token: CancellationToken = CancellationToken.None): Promise<boolean> {
		const controller = this._promptOptionsController;
		if (!controller || !this.preparePromptOptionsRefresh()) {
			return false;
		}
		const cts = new CancellationTokenSource(token);
		this._promptOptionsRefresh.value = cts;
		let state: NewSessionPromptOptionsState;
		try {
			state = await controller.resolve(cts.token);
		} catch (error) {
			if (this._promptOptionsRefresh.value === cts) {
				this._promptOptionsRefresh.clear();
				if (cts.token.isCancellationRequested) {
					this.showPromptOptions(undefined);
					return false;
				}
			}
			throw error;
		}
		if (this._promptOptionsRefresh.value !== cts) {
			return false;
		}
		if (cts.token.isCancellationRequested) {
			this._promptOptionsRefresh.clear();
			this.showPromptOptions(undefined);
			return false;
		}
		this._promptOptionsRefresh.clear();
		return this.showPromptOptions(state);
	}

	override dispose(): void {
		this._cancelPromptOptionsRefresh();
		super.dispose();
	}

	/** See {@link INewChatVoiceComposer.routesWhileSessionActive}. */
	get routesWhileSessionActive(): boolean {
		return this.options.voiceRoutesWhileSessionActive === true;
	}

	prefillInput(text: string): void {
		const editor = this._editor;
		const model = editor?.getModel();
		if (editor && model) {
			model.setValue(text);
			const lastLine = model.getLineCount();
			const maxColumn = model.getLineMaxColumn(lastLine);
			editor.setPosition({ lineNumber: lastLine, column: maxColumn });
			editor.focus();
		}
	}

	sendQuery(text: string): void {
		// A submit is already in flight (e.g. a rapid second transcript before the
		// session is created); don't clobber the in-flight text or double-submit.
		if (this._sending) {
			return;
		}
		const model = this._editor?.getModel();
		if (model) {
			const combined = combineVoiceInput(model.getValue(), text);
			model.setValue(combined);
			this._send();
		}
	}

	attach(uris: URI[]): void {
		this._contextAttachments.addAttachments(...uris.map(uri => toFileVariableEntry(uri)));
	}

	getVoiceModels() {
		return this._sessionModelSelectionModel.state.get().models;
	}

	selectVoiceModel(identifier: string): boolean {
		return this._sessionModelSelectionModel.selectModel(identifier);
	}
}

// #endregion

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInput.css';
import './media/chatInputMobile.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import type { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../editor/common/config/fontInfo.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
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
import { NewChatVoiceController } from './newChatVoice.js';
import { SessionTypePicker } from './sessionTypePicker.js';
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
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ChatInputNotificationWidget } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationWidget.js';
import { INewChatModelPickerService, NewChatModelPickerService } from './newChatModelPicker.js';
import { ModelPicker, ModelPickerActionViewItem } from './modelPicker.js';
import { ISessionModelSelectionModel, SessionModelSelectionModel } from './sessionModelSelectionModel.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import { IChatStatusItemService } from '../../../../workbench/contrib/chat/browser/chatStatus/chatStatusItemService.js';
import { handleTerminalCommandPaste, isTerminalCommandInput } from '../../../../workbench/contrib/chat/browser/chatTerminalCommandPaste.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js';
import { runDictationShortcut } from '../../../../workbench/contrib/chat/browser/actions/chatSpeechToTextActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { DictationDownloadRing } from '../../../../workbench/contrib/chat/browser/speechToText/dictationDownloadRing.js';


const OPEN_OTEL_SETTINGS_COMMAND = 'github.copilot.chat.otel.openSettings';
const OTEL_STATUS_COMMAND = 'github.copilot.chat.otel.statusActive';
const OTEL_STATUS_ENTRY_ID = 'copilot.otelStatus';
const OTEL_DOCS_URL = 'https://code.visualstudio.com/docs/copilot/guides/monitoring-agents';
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

export class NewChatInputWidget extends Disposable implements IHistoryNavigationWidget {
	private static readonly compactModelPickerWidth = 280;

	readonly sessionTypePicker: SessionTypePicker;

	// IHistoryNavigationWidget
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;
	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;
	get element(): HTMLElement { return this._editorContainer; }

	/** The underlying input editor. Exposed for component fixtures. */
	get inputEditor(): CodeEditorWidget | undefined { return this._editor; }

	// Input
	private _editor!: CodeEditorWidget;
	private _editorContainer!: HTMLElement;

	// Send button
	private _sendButton: Button | undefined;
	private _sending = false;

	// Loading state
	private _loadingSpinner: HTMLElement | undefined;
	private readonly _loadingDelayDisposable = this._register(new MutableDisposable());

	// Attached context
	private readonly _contextAttachments: NewChatContextAttachments;

	// Slash commands
	private _slashCommandHandler: SlashCommandHandler | undefined;
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
			sendRequest: (request: INewChatInputSendRequest) => Promise<void>;
			canSendRequest: IObservable<boolean>;
			loading: IObservable<boolean>;
			historyKey?: IObservable<string | undefined>;
			minEditorHeight?: number;
			placeholder?: string;
			renderSessionTypePickerInControls?: boolean;
			supportsBackground?: boolean;
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
	) {
		super();
		this._sessionModelSelectionModel = this._register(this.instantiationService.createInstance(SessionModelSelectionModel, this.options.session));
		this._canSendRequest = derived(this, reader => {
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
		this.sessionTypePicker = this._register(this.instantiationService.createInstance(MobileSessionTypePicker, this.options.session, undefined));
		this._register(this._contextAttachments.onDidChangeContext(() => {
			this._updateDraftState();
			this._updateSendButtonState();
			this.focus();
		}));
		this._register(autorun(reader => {
			this._canSendRequest.read(reader);
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
		// Input slot
		const chatInputContainer = dom.append(parent, dom.$('.new-chat-input-container'));

		// Overflow widget DOM node at the top level so the suggest widget
		// is not clipped by any overflow:hidden ancestor.
		const editorOverflowWidgetsDomNode = dom.append(root, dom.$('.sessions-chat-editor-overflow.monaco-editor'));
		// Suppress the default `Text` kind icon in the suggest widget; chat slash/skill
		// completions use that kind and rely on the chat module's CSS rule scoped to this class.
		editorOverflowWidgetsDomNode.classList.add('hideSuggestTextIcons');
		this._register({ dispose: () => editorOverflowWidgetsDomNode.remove() });

		// Notification widget above the input area
		const notificationContainer = dom.append(chatInputContainer, dom.$('.chat-input-notification-container'));
		const notificationWidget = this._register(this.instantiationService.createInstance(
			ChatInputNotificationWidget,
			{
				modelTargetChatSessionType: this.sessionTypePicker.modelTargetChatSessionType,
				openModelPicker: () => this._newChatModelPickerService.openModelPicker(),
				switchToModel: modelIdentifier => this._newChatModelPickerService.switchToModel(modelIdentifier),
			},
		));
		notificationContainer.appendChild(notificationWidget.domNode);

		// Input area inside the input slot
		const inputArea = dom.append(chatInputContainer, dom.$('.new-chat-input-area'));

		// Attachments row (pills only) inside input area, above editor
		const attachRow = dom.append(inputArea, dom.$('.sessions-chat-attach-row'));
		const attachedContextContainer = dom.append(attachRow, dom.$('.sessions-chat-attached-context'));
		this._contextAttachments.renderAttachedContext(attachedContextContainer);
		this._contextAttachments.registerDropTarget(root);
		this._contextAttachments.registerPasteHandler(inputArea);

		this._createEditor(inputArea, editorOverflowWidgetsDomNode);
		this._createInputToolbar(inputArea);

		const newChatBottomContainer = dom.append(parent, dom.$('.new-chat-bottom-container'));
		const newChatControlsContainer = dom.append(newChatBottomContainer, dom.$('.new-chat-controls-container'));
		if (this.options.renderSessionTypePickerInControls !== false) {
			const sessionTypePickerHost = dom.append(newChatControlsContainer, dom.$('.new-chat-session-type-picker-host'));
			this.sessionTypePicker.render(sessionTypePickerHost);
		}
		this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, dom.append(newChatControlsContainer, dom.$('')), Menus.NewSessionControl, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));

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

		const uri = URI.from({ scheme: 'sessions-chat', path: `input-${Date.now()}` });
		const textModel = this._register(this.modelService.createModel('', null, uri, true));

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this.configurationService),
			readOnly: false,
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
			overflowWidgetsDomNode,
			suggest: {
				showIcons: true,
				showSnippets: false,
				showWords: true,
				showStatusBar: false,
				insertMode: 'insert',
			},
		};

		const widgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				ContextMenuController.ID,
				SuggestController.ID,
				SnippetController2.ID,
				PlaceholderTextContribution.ID,
			]),
		};

		this._editor = this._register(scopedInstantiationService.createInstance(
			CodeEditorWidget, editorContainer, editorOptions, widgetOptions,
		));
		this._editor.setModel(textModel);
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
		this._slashCommandHandler = this._register(this._scopedInstantiationService.createInstance(SlashCommandHandler, this._editor));

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

		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateDraftState();
			this._updateSendButtonState();
			this._updateEditorFontFamily();
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
		dom.append(attachButton, renderIcon(Codicon.add));
		this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => {
			this._contextAttachments.showPicker(this.options.getContextFolderUri());
		}));
	}

	private _createInputToolbar(container: HTMLElement): void {
		const toolbar = dom.append(container, dom.$('.sessions-chat-toolbar'));

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

		// Dictation (speech-to-text) mic button. Shares the STT service, mic
		// device, and gating (on-device support + `chat.speechToText.enabled`)
		// with the main chat input; inserts the transcript into this composer's
		// editor. Placed before the voice controls so dictation leads the
		// mic-related group.
		try {
			this._createSpeechToTextButton(toolbar);
		} catch (error) {
			this.logService.error('Failed to create new-session dictation control:', error);
		}

		// Voice controls (mic/stop/settings/disconnect). The hand-built toolbar
		// can't use the shared `MenuId.ChatExecute`, so a dedicated menu is used.
		// Keep the session picker usable when optional voice initialization fails.
		const voiceContainer = dom.append(toolbar, dom.$('.sessions-chat-voice-toolbar'));
		try {
			this._register(this.instantiationService.createInstance(NewChatVoiceController, {
				toolbarContainer: voiceContainer,
				inputContainer: container,
				composer: this,
			}));
		} catch (error) {
			this.logService.error('Failed to create new-session voice controls:', error);
		}

		this._loadingSpinner = dom.append(toolbar, dom.$('.sessions-chat-loading-spinner'));
		const loadingIcon = dom.append(this._loadingSpinner, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
		loadingIcon.setAttribute('aria-hidden', 'true');
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._loadingSpinner, localize('loading', "Loading...")));
		this._loadingSpinner.classList.toggle('visible', this.options.loading.get());

		const sendButtonContainer = dom.append(toolbar, dom.$('.sessions-chat-send-button'));
		const sendButton = this._sendButton = this._register(new Button(sendButtonContainer, {
			secondary: true,
			title: this.options.supportsBackground
				? localize('sendWithBackgroundHint', "Send (Alt-click to start in the background)")
				: localize('send', "Send"),
			ariaLabel: localize('send', "Send"),
		}));
		sendButton.icon = Codicon.newLine;
		// Hold Alt while clicking Send to start the session in the background.
		this._register(sendButton.onDidClick(e => this._send(!!this.options.supportsBackground && !!(e as MouseEvent | KeyboardEvent | undefined)?.altKey)));
	}

	private _createSpeechToTextButton(container: HTMLElement): void {
		const sttService = this.chatSpeechToTextService;

		const button = dom.append(container, dom.$('.sessions-chat-stt-button'));
		button.tabIndex = 0;
		button.role = 'button';
		const micLabel = localize('sessionsStt.dictate', "Dictate (Speech to Text)");
		const stopLabel = localize('sessionsStt.stop', "Stop Dictation");
		this._register(this.hoverService.setupDelayedHover(button, {
			content: micLabel,
			position: { hoverPosition: HoverPosition.BELOW },
			appearance: { showPointer: true }
		}));

		const downloadRing = this._register(new MutableDisposable<DictationDownloadRing>());
		const renderState = () => {
			const preparing = sttService.isPreparingModel;
			const recording = sttService.state !== ChatSpeechToTextState.Idle;
			dom.clearNode(button);
			downloadRing.clear();
			if (preparing) {
				// First-use only: render a download icon wrapped by a determinate
				// progress ring instead of a plain spinner, matching the chat
				// toolbar, so the model download reads as progress rather than a hang.
				dom.append(button, renderIcon(Codicon.cloudDownload));
				downloadRing.value = new DictationDownloadRing(button, sttService);
			} else {
				dom.append(button, renderIcon(recording ? Codicon.stopCircle : Codicon.mic));
			}
			button.classList.toggle('recording', recording && !preparing);
			button.classList.toggle('preparing', preparing);
			button.ariaLabel = preparing
				? localize('sessionsStt.preparing', "Preparing Speech to Text Model…")
				: (recording ? stopLabel : micLabel);
		};
		renderState();
		this._register(sttService.onDidChangeState(renderState));
		this._register(sttService.onDidChangePreparingModel(renderState));

		const updateVisibility = () => {
			button.classList.toggle('hidden', !sttService.isConfigured);
		};
		updateVisibility();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.speechToText.enabled')) {
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
	}

	/**
	 * Toggle on-device dictation into this composer's editor, honoring the
	 * tap-vs-hold `chat.speechToText.mode` setting. Shared by the mic button and
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
			configurationService: this.configurationService,
			logService: this.logService,
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


	private async _send(background = false): Promise<void> {
		const rawQuery = this._editor.getModel()?.getValue() ?? '';
		const query = rawQuery.trim();
		const queryOffset = rawQuery.length - rawQuery.trimStart().length;
		const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
		if ((!query && !hasSendableAttachment) || this._sending) {
			return;
		}

		// Respect the same gate as the send button (e.g. a session with no
		// usable model). The Enter keybinding and slash-command paths reach
		// here directly, bypassing the button's disabled state.
		if (!this._canSendRequest.get()) {
			return;
		}

		// Check for slash commands first
		if (query && this._slashCommandHandler?.tryExecuteSlashCommand(query)) {
			this._editor.getModel()?.setValue('');
			return;
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

		try {
			await this.options.sendRequest({ query: request, attachments: attachedContext, background });
			this._contextAttachments.clear();
			this._editor.getModel()?.setValue('');
		} catch (e) {
			this.logService.error('Failed to send request:', e);
		}

		this._sending = false;
		this._editor.updateOptions({ readOnly: false });
		this._updateSendButtonState();
		this._updateInputLoadingState();
	}

	private _updateSendButtonState(): void {
		if (!this._sendButton) {
			return;
		}
		const hasText = !!this._editor?.getModel()?.getValue().trim();
		const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
		this._sendButton.enabled = !this._sending && (hasText || hasSendableAttachment) && this._canSendRequest.get();
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
			const existing = model.getValue();
			const combined = existing && !/\s$/.test(existing) ? `${existing} ${text}` : `${existing}${text}`;
			model.setValue(combined);
			this._send();
		}
	}

	attach(uris: URI[]): void {
		this._contextAttachments.addAttachments(...uris.map(uri => toFileVariableEntry(uri)));
	}
}

// #endregion

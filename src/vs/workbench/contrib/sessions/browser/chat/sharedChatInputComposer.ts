/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInput.css';
import './media/sharedChatInputComposer.css';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, Separator } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { autorun, constObservable, derived, IObservable, IReader, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { scrollbarShadow } from '../../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../common/theme.js';
import { IChatSubmitRequestHandlerService } from '../../../chat/browser/chatSubmitRequestHandlerService.js';
import { combineVoiceInput } from '../../../chat/browser/voiceClient/voiceInputUtils.js';
import { ChatDynamicVariableModel } from '../../../chat/browser/attachments/chatDynamicVariables.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../../../chat/browser/attachments/chatVariables.js';
import { createChatInputToolbarContext } from '../../../chat/browser/actions/chatExecuteActions.js';
import { IChatWidget } from '../../../chat/browser/chat.js';
import { compactCodiconsIn } from '../../../chat/browser/chatIcons.js';
import { ChatWidget } from '../../../chat/browser/widget/chatWidget.js';
import { ChatInputNoticeHost } from '../../../chat/browser/widget/input/chatInputNoticeHost.js';
import { IChatInputHostModelSelection } from '../../../chat/browser/widget/input/chatInputPart.js';
import { ModelComparisonAvailableContext } from '../../../chat/browser/widget/input/modelPicker/modelPickerComparison.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatDraft } from '../../../chat/common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { IChatModelReference, IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IDynamicVariable } from '../../../chat/common/attachments/chatVariables.js';
import { getChatSessionType } from '../../../chat/common/model/chatUri.js';
import { IChatSlashCommandService } from '../../../chat/common/participants/chatSlashCommands.js';
import { ChatRequestSlashCommandPart, IParsedChatRequest } from '../../../chat/common/requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../../../chat/common/requestParser/chatRequestParser.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { Menus } from '../menus.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground } from '../../common/theme.js';
import { IWorkspaceSelectionSnapshot } from '../../../../services/sessions/common/workspaceSelection.js';
import { ISessionsProvidersService, observeSessionSandboxToggle } from '../sessionsProvidersService.js';
import { ISessionHost, ISessionHostService, SessionHost, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { ChatInputCanScheduleContext, ChatInputSupportsBackgroundContext } from '../../common/contextkeys.js';
import { ISessionInputPickerVisibility, SessionInputPickerVisibility } from '../../common/sessionPickerVisibility.js';
import { WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { readNewChatDraftState, writeNewChatDraftState } from '../../common/newChatDraftState.js';
import { MobileSessionTypePicker } from './mobile/mobileSessionTypePicker.js';
import { getLabeledPickerResponsiveItems, hasSendableNewChatContent, IComposerRepositoryControls, INewChatComposerInputOptions, syncInputGitHubContextAttachments } from './newChatComposerInput.js';
import { createSessionModelCommands, INewChatModelPickerService, NewChatModelPickerService } from './newChatModelPicker.js';
import { INewChatVoiceComposer, INewChatVoiceTargetService, NEW_CHAT_VOICE_SENTINEL, NewChatVoiceInputDecorations } from './newChatVoice.js';
import { INewSessionComposer, INewSessionComposerPicker, INewSessionPromptOptionsController, INewSessionTargetLabels, NewSessionPromptOptionsState, NewSessionWorkspacePreselectionSource } from '../newSessionComposerService.js';
import { NewSessionPromptOptionsPresenter } from './newSessionPromptOptions.js';
import { NewChatUserInteraction } from './newChatUserInteraction.js';
import { hasSendableModelSelection } from './sessionModelPickerState.js';
import { ISessionModelSelection, SessionModelSelection } from './sessionModelSelection.js';
import { SessionReferenceCompletions } from './sessionReferenceCompletions.js';
import { SessionTypePicker } from './sessionTypePicker.js';
import { ChatInputPickerResponsiveLayout } from '../../../chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { markOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { isPhoneLayout } from '../../../../browser/parts/sessions/mobileLayout.js';
import { installMobileChipLaneScroll } from '../mobile/mobileChipLaneScroll.js';
import { shownChatOf } from '../../../../services/sessions/common/sessionPane.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

/** Body height the composer lays its chat widget out with; the transcript is hidden, so it only bounds the input. */
const COMPOSER_LAYOUT_HEIGHT = 200;
/** Mirrors the chat widget's reserved list and chrome height so the hidden transcript does not shrink the input. */
const COMPOSER_INPUT_MAX_HEIGHT = COMPOSER_LAYOUT_HEIGHT + 50 + 72;
/** Progress stays hidden for operations that finish faster than this, so quick changes do not flicker. */
const BUSY_INDICATOR_DELAY_MS = 500;
/** How long a send waits for the session to get ready to send, such as while its provider starts. */
const SEND_READINESS_TIMEOUT_MS = 15_000;

export type ComposerBusyState = '' | 'initializing' | 'sending';

/** What the composer is waiting on, shown as progress in its input toolbar. */
export const SharedChatInputComposerBusyContext = new RawContextKey<ComposerBusyState>('sessionsSharedChatInputComposerBusy', '', localize('sessionsSharedChatInputComposerBusy', "What the new-session composer is waiting on, if anything."));

/** A client-side slash command parsed from the composer's input. */
interface IClientSlashCommand {
	readonly part: ChatRequestSlashCommandPart;
	readonly parsed: IParsedChatRequest;
	readonly sessionResource: URI;
}

/** The input editor's padding, matching the composer's text inset and minimum height. */
const COMPOSER_INPUT_EDITOR_PADDING = { top: 8, bottom: 2 };

/** A status indicator in the composer's controls row; icon-only items use the compact control box. */
class ComposerStatusActionViewItem extends MenuEntryActionViewItem {
	private _compactCodiconClass: string | undefined;

	override render(container: HTMLElement): void {
		super.render(container);
		this._updateIconPresentation();
	}

	protected override updateClass(): void {
		if (this._compactCodiconClass) {
			this.label?.classList.remove(this._compactCodiconClass);
			this._compactCodiconClass = undefined;
		}
		super.updateClass();
		this._updateIconPresentation();
	}

	private _updateIconPresentation(): void {
		const label = this.label;
		const rendersIcon = !!label && (label.classList.contains('codicon') || label.classList.contains('icon'));
		this.element?.classList.toggle('new-chat-status-icon-action', rendersIcon);
		if (rendersIcon && this.element && label.classList.contains('codicon')) {
			const before = this._getCodiconClass();
			compactCodiconsIn(this.element);
			const after = this._getCodiconClass();
			this._compactCodiconClass = after !== before ? after : undefined;
		}
	}

	private _getCodiconClass(): string | undefined {
		return this.label ? [...this.label.classList].find(className => className.startsWith('codicon-') && !className.startsWith('codicon-modifier-')) : undefined;
	}
}

/** The separator between repository controls, styled per composer layout. */
class RepositoryConfigSeparatorActionViewItem extends ActionViewItem {
	override render(container: HTMLElement): void {
		container.classList.add('repository-config-separator');
		super.render(container);
	}
}

/**
 * The input of the Agents window's new-session and new-chat composers, backed
 * by the standard chat {@link ChatWidget}. Hosts own workspace selection,
 * session creation and sending; the composer owns the prompt, its attachments
 * and the session configuration pickers.
 *
 * The widget registers with the chat widget service, so the workbench chat
 * input commands and keybindings (submit, add context, model picker, dictation,
 * paste) act on it like on any other chat input. Sending is delegated to the
 * host instead of the widget's chat model, and model selection follows the
 * session provider: the Agents window model picker is contributed to the input
 * toolbar and the input's own model commands and notifications act on it.
 */
export class SharedChatInputComposer extends Disposable implements INewSessionComposer, INewChatVoiceComposer {

	private static readonly _backgroundComposers = new WeakMap<IChatWidget, SharedChatInputComposer>();

	static getBackgroundComposer(widget: IChatWidget): SharedChatInputComposer | undefined {
		return SharedChatInputComposer._backgroundComposers.get(widget);
	}

	readonly sessionTypePicker: SessionTypePicker;
	readonly host: ISessionHost;
	private readonly _targetLabels = observableValue<IObservable<INewSessionTargetLabels> | undefined>(this, undefined);
	readonly targetLabels = derived(this, reader => this._targetLabels.read(reader)?.read(reader) ?? {});
	readonly pickerVisibility: SessionInputPickerVisibility;
	readonly pickerHoverDelegate: WorkbenchHoverDelegate;
	readonly sessionResource: IObservable<URI | undefined>;

	private readonly _modelSelection: SessionModelSelection;
	/** The chat the input binds to: the composer's chat, else the session's shown chat. */
	private readonly _shownChat: IObservable<IChat | undefined>;
	private readonly _newChatModelPickerService = new NewChatModelPickerService(() => this.focus());
	private readonly _scopedInstantiationService: IInstantiationService;
	private readonly _canSendRequest: IObservable<boolean>;
	private readonly _promptOptions: NewSessionPromptOptionsPresenter;

	private _widget: ChatWidget | undefined;
	private _container: HTMLElement | undefined;
	private _repositoryControlsContainer: HTMLElement | undefined;
	private _repositoryControlsHome: HTMLElement | undefined;
	private _repositoryToolbar: MenuWorkbenchToolBar | undefined;
	private _updateBottomContainerVisibility: (() => void) | undefined;
	private _bottomPickerResponsiveLayout: ChatInputPickerResponsiveLayout | undefined;
	private _lastLayoutWidth: number | undefined;
	private _updateAttachmentOffset: (() => void) | undefined;

	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());
	/** Counts draft bindings, so a load that a newer draft superseded is released instead of bound. */
	private _modelBinding = 0;
	private _boundResource: URI | undefined;
	/** Attachments added before the input renders, such as a host's initial context. */
	private readonly _pendingAttachments: IChatRequestVariableEntry[] = [];
	private readonly _sending = observableValue(this, false);
	/** Whether the host is asking to confirm a send. Other sends stay blocked, but nothing shows progress yet. */
	private readonly _confirmingSend = observableValue(this, false);
	/** Releases the in-flight send's visibility tracking, also when the composer is disposed mid-send. */
	private readonly _userInteractionSource = this._register(new MutableDisposable());
	/** A send's wait for the session to be ready to send, which settles as the composer is disposed. */
	private readonly _readinessWait = this._register(new MutableDisposable<DisposableStore>());

	private readonly _onDidChangeInput = this._register(new Emitter<void>());
	readonly onDidChangeInput = this._onDidChangeInput.event;
	private readonly _onDidChangeAttachments = this._register(new Emitter<void>());
	readonly onDidChangeAttachments = this._onDidChangeAttachments.event;
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;
	/** Fires with the model the user selects for the session, once applied: not as the session's model changes otherwise. */
	get onDidSelectModel(): Event<string> { return this._modelSelection.onDidSelectModel; }

	private _widgetContextKeyService: IContextKeyService | undefined;

	constructor(
		private readonly options: INewChatComposerInputOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatSubmitRequestHandlerService private readonly chatSubmitRequestHandlerService: IChatSubmitRequestHandlerService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService,
		@INewChatVoiceTargetService private readonly newChatVoiceTargetService: INewChatVoiceTargetService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ISessionHost parentHost: ISessionHost,
		@ISessionHostService sessionHostService: ISessionHostService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.host = parentHost;
		this.pickerHoverDelegate = this._register(this.instantiationService.createInstance(WorkbenchHoverDelegate, 'element', { instantHover: true }, { style: HoverStyle.Pointer }));
		this.pickerVisibility = this._register(new SessionInputPickerVisibility());
		this.sessionResource = derived(this, reader => this.options.session.read(reader)?.resource);
		// The model of the chat the input binds to, not of the session's active chat elsewhere.
		const shownChat = this._shownChat = shownChatOf(this.options.session, this.options.chat);
		const modelSource = { session: this.options.session, chat: shownChat };
		this._modelSelection = this._register(this.instantiationService.createInstance(SessionModelSelection, modelSource, {
			comparison: this.options.modelPickerComparison,
			comparisonBusy: this._sending,
			modelConfiguration: true,
			fallbackModelConfiguration: this.languageModelsService,
		}));
		this._canSendRequest = derived(this, reader => {
			if (this.options.canSubmitWithoutSession?.read(reader)) {
				return true;
			}
			return this.options.canSendRequest.read(reader) && hasSendableModelSelection(this._modelSelection.state.read(reader));
		});
		// Created before the input's instantiation services so it is disposed first:
		// disposing it restores the input text.
		this._promptOptions = this._register(this.instantiationService.createInstance(NewSessionPromptOptionsPresenter, () => this.focus()));
		// Its keys are bound on the context of its widget once it renders.
		const host = new SessionHost({ kind: SessionHostKind.Composer, parent: parentHost, session: this.options.session, chat: shownChat, contextKeyService: () => this._widgetContextKeyService ?? this.contextKeyService });
		this._register(sessionHostService.registerHost(host));
		this._scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
			[INewChatModelPickerService, this._newChatModelPickerService],
			[ISessionHost, host],
			[ISessionModelSelection, this._modelSelection],
			[ISessionInputPickerVisibility, this.pickerVisibility],
		)));
		this.sessionTypePicker = this._register(this.instantiationService.createInstance(MobileSessionTypePicker, this.options.session, this.options.sessionTypePickerOptions));
		this._register(autorun(reader => this.pickerVisibility.setVisible('harness', this.sessionTypePicker.isVisible.read(reader))));
		this._register(this.storageService.onWillSaveState(() => this.saveState()));
	}

	// #region Rendering

	render(parent: HTMLElement, root: HTMLElement): void {
		const container = this._container = dom.append(parent, dom.$('.new-chat-input-container.sessions-shared-chat-input'));
		this._register(toDisposable(() => container.remove()));

		// Mounted on the workbench container so suggest and other overflow widgets
		// are not clipped by the composer.
		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(dom.getWindow(root)).appendChild(dom.$('.chat-editor-overflow.monaco-editor'));
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		const widgetContainer = dom.append(container, dom.$('.sessions-shared-chat-widget'));
		const widgetContextKeyService = this._widgetContextKeyService = this._register(this.contextKeyService.createScoped(widgetContainer));
		const busyContextKey = SharedChatInputComposerBusyContext.bindTo(widgetContextKeyService);
		ChatInputSupportsBackgroundContext.bindTo(widgetContextKeyService).set(!!this.options.supportsBackground);
		const comparisonAvailable = ModelComparisonAvailableContext.bindTo(widgetContextKeyService);
		this._register(autorun(reader => comparisonAvailable.set(this.options.modelPickerComparison?.available.read(reader) ?? false)));
		// Tracked on the whole widget, so commands scoped to the composer also apply
		// while focus is in its notices or toolbar.
		const composerFocusKey = ChatContextKeys.inChatComposer.bindTo(widgetContextKeyService);
		const composerFocusTracker = this._register(dom.trackFocus(widgetContainer));
		this._register(composerFocusTracker.onDidFocus(() => composerFocusKey.set(true)));
		this._register(composerFocusTracker.onDidBlur(() => composerFocusKey.set(false)));
		const widgetInstantiationService = this._register(this._scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, widgetContextKeyService])));
		// Voice Mode belongs to this composer while it is the voice input for a draft.
		const ownsDraftVoiceSession = derived(this, reader => this.newChatVoiceTargetService.activeComposer.read(reader) === this
			&& isEqual(this.newChatVoiceTargetService.currentVoiceInputResource.read(reader), NEW_CHAT_VOICE_SENTINEL));
		const widget = this._widget = this._register(widgetInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			undefined,
			{
				renderFollowups: false,
				renderChatPet: this.options.renderChatPet,
				renderInputOnTop: true,
				renderSecondaryToolbar: false,
				// Status indicators share the composer's controls row instead.
				renderStatusToolbar: false,
				renderGettingStartedTip: false,
				supportsFileReferences: true,
				enableImplicitContext: false,
				supportsChangingModes: false,
				isSessionsWindow: true,
				inputEditorMinLines: 2,
				inputEditorOptions: this.options.inputEditorOptions,
				inputEditorPadding: COMPOSER_INPUT_EDITOR_PADDING,
				inputPlaceholder: this.options.placeholder,
				sandboxToggleChecked: observeSessionSandboxToggle(this.options.session, derived(this, reader => this._getChatResource(reader)), this.sessionsProvidersService),
				editorOverflowWidgetsDomNode,
				menus: {
					inputToolbar: Menus.NewSessionChatInputToolbar,
					telemetrySource: 'sessions.newChatComposer',
				},
				// The input sits flush with the composer's picker rows.
				inputPartHorizontalPadding: 0,
				hostModelSelection: this._createHostModelSelection(),
				deferredNotificationsEnabled: this.options.deferredNotificationsEnabled,
				ownsDraftVoiceSession,
				hostSubmit: {
					canSubmit: derived(this, reader => this._canSendRequest.read(reader) && !this._sending.read(reader)),
					hasContent: this.options.hasAdditionalSendContent,
					label: this.options.sendButtonLabel,
				},
				submitHandler: async (query, _mode, attachedContext) => {
					await this._send(query, attachedContext ?? [], false);
					// The host sends; the widget's own model must never receive the request.
					return true;
				},
			},
			{
				listForeground: activeSessionViewForeground,
				listBackground: activeSessionViewBackground,
				listShadow: scrollbarShadow,
				overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
				inputEditorBackground: inactiveSessionViewBackground,
				resultEditorBackground: agentsPanelBackground,
			},
		));
		widget.render(widgetContainer, root, this.options.petHostPreferred, this.options.setChatPetPlatformOccupation);
		if (this.options.hideChatWidgetWhileHidden) {
			// The widget is a foreground chat only while its composer is visible, rather than for as long as it is rendered.
			this._register(autorun(reader => widget.setVisible((this.options.hostVisible?.read(reader) ?? true) && (this.options.inputVisible?.read(reader) ?? true))));
		} else {
			widget.setVisible(true);
		}
		widget.setInputPartMaxHeightOverride(COMPOSER_INPUT_MAX_HEIGHT);

		this._register(widget.onDidFocus(() => this._onDidFocus.fire()));
		this._register(widget.inputEditor.onDidChangeModelContent(() => {
			this._syncInputGitHubContext();
			this._onDidChangeInput.fire();
		}));
		this._register(widget.attachmentModel.onDidChange(() => {
			this._onDidChangeAttachments.fire();
			this._onDidChangeInput.fire();
		}));
		this._register(this.instantiationService.createInstance(SessionReferenceCompletions, widget, () => this.options.session.get()));
		if (this.options.supportsBackground) {
			SharedChatInputComposer._backgroundComposers.set(widget, this);
			this._register(toDisposable(() => SharedChatInputComposer._backgroundComposers.delete(widget)));
		}
		const canScheduleKey = ChatInputCanScheduleContext.bindTo(widget.scopedContextKeyService);
		this._register(autorun(reader => canScheduleKey.set(!!this.options.canSchedule?.read(reader))));
		this._register(toDisposable(() => canScheduleKey.reset()));
		if (this.options.inputVisible) {
			const inputVisible = this.options.inputVisible;
			this._register(autorun(reader => container.classList.toggle('hidden', !inputVisible.read(reader))));
		}
		this._renderBusyState(busyContextKey);

		// Prompt options dock in the input's notice stack, directly above the input.
		const tipContainer = widget.input.gettingStartedTipContainerElement;
		if (tipContainer.parentElement) {
			const inputRow = tipContainer.nextElementSibling;
			this._promptOptions.attach(widget.inputEditor, tipContainer.parentElement, dom.isHTMLElement(inputRow) ? inputRow : undefined);
		}
		this._register(this._registerVoiceTarget());
		const inputContainer = widget.inputPart.inputContainerElement;
		if (inputContainer) {
			this._register(this.instantiationService.createInstance(NewChatVoiceInputDecorations, inputContainer, this.options.inputVisible ?? constObservable(true), ownsDraftVoiceSession));
			if (this.options.onboardingTargetId) {
				this._register(markOnboardingTarget(inputContainer, this.options.onboardingTargetId, { focusTarget: { element: inputContainer, focus: () => this.focus() } }));
			}
		}
		this._register(widget.input.registerChatPetHorizontalPlatformProvider({
			onDidChange: Event.any(this.options.onDidChangeChatPetPlatform ?? Event.None, this.sessionTypePicker.onDidChangeChatPetPlatform),
			getElements: () => [...(this.options.getChatPetPlatformElements?.() ?? []), ...this.sessionTypePicker.getChatPetPlatformElements()],
			getBaseElement: this.options.getChatPetBasePlatformElement,
			getJumpGameElement: this.options.getChatPetJumpGameElement,
		}));

		this._renderSessionControls(parent);
		this._restoreInput(widget);
		this._bindChatModel();

		const resizeObserver = this._register(new dom.DisposableResizeObserver('SharedChatInputComposer', () => this._layoutWidget(), dom.getWindow(container)));
		this._register(resizeObserver.observe(container));
		this._layoutWidget();
		this._renderAttachmentOffset(parent, widget.inputPart.attachmentsContainerElement);
	}

	/**
	 * Raises the host's centered stack by half the attachment row, so the
	 * controls above the input stay put and attachments grow the input downward.
	 */
	private _renderAttachmentOffset(parent: HTMLElement, attachmentsContainer: HTMLElement): void {
		const update = this._updateAttachmentOffset = () => {
			if (isPhoneLayout(this.layoutService)) {
				parent.style.removeProperty('top');
			} else {
				parent.style.top = `${-attachmentsContainer.getBoundingClientRect().height / 2}px`;
			}
		};
		const resizeObserver = this._register(new dom.DisposableResizeObserver('SharedChatInputComposer.attachments', update, dom.getWindow(attachmentsContainer)));
		this._register(resizeObserver.observe(attachmentsContainer));
		this._register(toDisposable(() => {
			this._updateAttachmentOffset = undefined;
			parent.style.removeProperty('top');
		}));
		update();
	}

	private _createHostModelSelection(): IChatInputHostModelSelection {
		return {
			...createSessionModelCommands(this._modelSelection, this.languageModelsService),
			state: this._modelSelection.state,
			openPicker: () => this.openModelPicker(),
			selectModel: modelIdentifier => this._newChatModelPickerService.switchToModel(modelIdentifier),
			applyModelConfiguration: (modelIdentifier, values) => (this._modelSelection.modelConfiguration ?? this.languageModelsService).setModelConfiguration(modelIdentifier, values),
		};
	}

	/** Shows progress in the input toolbar while the draft initializes or the host sends, after a short delay. */
	private _renderBusyState(busyContextKey: IContextKey<ComposerBusyState>): void {
		const busy = derived<ComposerBusyState>(this, reader => {
			const sending = this._sending.read(reader) && !this._confirmingSend.read(reader);
			const comparisonSending = sending && !!this.options.modelPickerComparison?.summary.read(reader);
			return sending && !comparisonSending ? 'sending' : this.options.loading.read(reader) ? 'initializing' : '';
		});
		const delay = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			const value = busy.read(reader);
			delay.clear();
			busyContextKey.set('');
			if (value) {
				const handle = setTimeout(() => busyContextKey.set(value), BUSY_INDICATOR_DELAY_MS);
				delay.value = toDisposable(() => clearTimeout(handle));
			}
		}));
	}

	/**
	 * Renders the session controls row after the input, as a sibling the host's
	 * layout positions, for example above the input on phones.
	 */
	private _renderSessionControls(parent: HTMLElement): void {
		const bottomContainer = dom.append(parent, dom.$('.new-chat-bottom-container.sessions-shared-chat-input-controls'));
		this._register(toDisposable(() => bottomContainer.remove()));
		if (this.options.inputVisible) {
			const inputVisible = this.options.inputVisible;
			this._register(autorun(reader => bottomContainer.classList.toggle('hidden', !inputVisible.read(reader))));
		}
		const secondaryControlsContainer = this._repositoryControlsHome = dom.append(bottomContainer, dom.$('.new-chat-secondary-controls-container'));
		const repositoryControlsContainer = this._repositoryControlsContainer = dom.append(secondaryControlsContainer, dom.$('.new-chat-repo-config-container'));
		this._register(dom.addDisposableListener(repositoryControlsContainer, dom.EventType.KEY_DOWN, event => this._navigateRepositionedRepositoryControls(event)));
		let repositoryToolbar: MenuWorkbenchToolBar | undefined;
		let hostRepositoryControls: IComposerRepositoryControls | undefined;
		if (typeof this.options.renderRepositoryControls === 'function') {
			hostRepositoryControls = this._register(this.options.renderRepositoryControls(repositoryControlsContainer, this.pickerHoverDelegate));
		} else if (this.options.renderRepositoryControls !== false) {
			const session = this.options.session;
			const shownChat = this._shownChat;
			repositoryToolbar = this._repositoryToolbar = this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, repositoryControlsContainer, Menus.NewSessionRepositoryConfig, {
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				hoverDelegate: this.pickerHoverDelegate,
				ariaLabel: localize('sessionsSharedChatInput.repositoryControls', "Repository Controls"),
				toolbarOptions: {
					primaryGroup: group => group.startsWith('navigation'),
					useSeparatorsInPrimaryActions: true,
				},
				actionViewItemProvider: (action, options) => action.id === Separator.ID
					? new RepositoryConfigSeparatorActionViewItem(undefined, action, options)
					: undefined,
				menuOptions: {
					// Capture the originating session and the chat it shows before command activation can yield.
					get arg() { return { session: session.get(), chat: shownChat.get() }; },
				},
			}));
		}

		// Status indicators share the row, and with it the phone chip lane above the input.
		const statusToolbar = this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, dom.append(secondaryControlsContainer, dom.$('.new-chat-status-toolbar')), MenuId.ChatInputStatus, {
			hoverDelegate: this.pickerHoverDelegate,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			menuOptions: { shouldForwardArgs: true },
			toolbarOptions: { primaryGroup: () => true },
			actionViewItemProvider: (action, options) => action instanceof MenuItemAction
				? this._scopedInstantiationService.createInstance(ComposerStatusActionViewItem, action, options)
				: undefined,
		}));
		if (this._widget) {
			statusToolbar.context = createChatInputToolbarContext(this._widget);
		}

		const updateVisibility = () => {
			const repositoryControlCount = repositoryControlsContainer.parentElement === secondaryControlsContainer
				? (repositoryToolbar?.getItemsLength() ?? 0) + (hostRepositoryControls?.visible.get() ? 1 : 0)
				: 0;
			bottomContainer.classList.toggle('empty', repositoryControlCount + statusToolbar.getItemsLength() === 0);
		};
		this._updateBottomContainerVisibility = updateVisibility;
		if (repositoryToolbar) {
			this._register(repositoryToolbar.onDidChangeMenuItems(updateVisibility));
		}
		this._register(statusToolbar.onDidChangeMenuItems(updateVisibility));
		this._register(installMobileChipLaneScroll(bottomContainer, this.layoutService));
		const bottomPickerResponsiveLayout = this._bottomPickerResponsiveLayout = this._register(new ChatInputPickerResponsiveLayout('SharedChatInputComposer.bottomPicker', bottomContainer, {
			isCompactionEnabled: () => !isPhoneLayout(this.layoutService),
			getItems: () => getLabeledPickerResponsiveItems(bottomContainer),
		}));
		if (hostRepositoryControls) {
			const visible = hostRepositoryControls.visible;
			this._register(autorun(reader => {
				visible.read(reader);
				updateVisibility();
				bottomPickerResponsiveLayout.layout();
			}));
		}
		updateVisibility();
		bottomPickerResponsiveLayout.layout();
	}

	private _layoutWidget(): void {
		const widget = this._widget;
		const container = this._container;
		if (!widget || !container) {
			return;
		}
		const width = container.clientWidth || this._lastLayoutWidth;
		if (width) {
			widget.layout(COMPOSER_LAYOUT_HEIGHT, width);
		}
	}

	layout(_height: number, width: number): void {
		this._lastLayoutWidth = width;
		this._updateAttachmentOffset?.();
		this._layoutWidget();
		this._bottomPickerResponsiveLayout?.layout();
	}

	focus(): void {
		this._widget?.focusInput();
	}

	// #endregion

	// #region Chat model binding

	/**
	 * The widget needs a chat model before it accepts input. Binds the host's
	 * chat, by default the draft's, so the input sees its session type, and keeps
	 * the input when that chat is replaced.
	 */
	private _bindChatModel(): void {
		this._register(autorun(reader => {
			void this._bindModel(this._getChatResource(reader));
		}));
	}

	private _getChatResource(reader: IReader): URI | undefined {
		return (this.options.chat ? this.options.chat.read(reader) : this.options.session.read(reader)?.mainChat.read(reader))?.resource;
	}

	private async _bindModel(resource: URI | undefined): Promise<void> {
		const widget = this._widget;
		if (!widget || (this._modelRef.value && isEqual(this._boundResource, resource))) {
			return;
		}
		this._boundResource = resource;
		// A newer draft supersedes a load that is still in flight. The load is not
		// cancelled: it is shared with the session itself, such as its view and the
		// agent host's prewarm, which cancelling would tear down.
		const binding = ++this._modelBinding;
		let ref: IChatModelReference | undefined;
		if (resource) {
			try {
				ref = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None, 'SharedChatInputComposer');
			} catch (error) {
				if (!isCancellationError(error)) {
					this.logService.warn('[SharedChatInputComposer] Could not load the draft chat; using a placeholder model', error);
				}
			}
		}
		if (binding !== this._modelBinding || this._store.isDisposed) {
			ref?.dispose();
			return;
		}
		// Without a draft (no workspace picked yet) the widget still needs a model
		// to accept input. It never sends to that model: the composer's host sends.
		ref ??= this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'SharedChatInputComposer' });

		// The composer owns its draft, so carry the typed input, its inline
		// references and attachments over instead of adopting whatever the newly
		// bound model had.
		const inputText = widget.getInput();
		const attachments = [...widget.attachmentModel.attachments];
		const references = [...getDynamicVariablesForWidget(widget)];
		widget.setModel(ref.object);
		// The references refer to the prompt, which differs from the input editor's text while it shows inline attachment pills.
		if (widget.inputEditor.getValue() !== inputText) {
			this.setInputValue(inputText);
		}
		widget.attachmentModel.clearAndSetContext(...attachments);
		widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.setInputState({ [ChatDynamicVariableModel.ID]: references });
		this._modelRef.value = ref;
	}

	// #endregion

	// #region Input state

	get noticeHost(): ChatInputNoticeHost {
		if (!this._widget) {
			throw new Error('The composer must be rendered before its notice host is used.');
		}
		return this._widget.input.noticeHost;
	}

	get gettingStartedTipContainerElement(): HTMLElement | undefined {
		return this._widget?.input.gettingStartedTipContainerElement;
	}

	get hostNoticeContainerElement(): HTMLElement | undefined {
		return this._widget?.input.gettingStartedTipContainerElement;
	}

	get selectedModelState() {
		return this._modelSelection.state;
	}

	get modelPicker(): INewSessionComposerPicker | undefined {
		return this._newChatModelPickerService.activePicker;
	}

	get workspacePreselectionSource(): NewSessionWorkspacePreselectionSource | undefined {
		return this.options.getWorkspacePreselectionSource?.();
	}

	get workspaceSelection(): IWorkspaceSelectionSnapshot | undefined {
		return this.options.getWorkspaceSelection?.();
	}

	setTargetLabels(labels: IObservable<INewSessionTargetLabels>): void {
		this._targetLabels.set(labels, undefined);
	}

	get onDidChangeWorkspaceSelection(): Event<void> {
		return this.options.onDidChangeWorkspaceSelection ?? Event.None;
	}

	/** Makes it a target of Voice Mode, the active one as it mounts and once it gains focus, unless its host keeps it out of Voice Mode. */
	private _registerVoiceTarget(): IDisposable {
		if (this.options.voiceTarget === false) {
			return Disposable.None;
		}
		const store = new DisposableStore();
		store.add(this.newChatVoiceTargetService.registerComposer(this));
		store.add(this.onDidFocus(() => this.newChatVoiceTargetService.setActive(this)));
		return store;
	}

	get routesWhileSessionActive(): boolean {
		return this.options.voiceRoutesWhileSessionActive === true;
	}

	get attachments(): readonly IChatRequestVariableEntry[] {
		return this._widget?.attachmentModel.attachments ?? this._pendingAttachments;
	}

	get hasInput(): boolean {
		return !!this.getInputValue() || this.attachments.length > 0 || !!this.options.hasAdditionalSendContent?.get();
	}

	get isInputReady(): boolean {
		return !!this._widget;
	}

	get canApplyWorkspaceDefault(): boolean {
		return !this.hasInput && (this.options.canApplyWorkspaceDefault?.() ?? false);
	}

	getInputValue(): string {
		return this._widget?.getInput() ?? '';
	}

	setInputValue(text: string): void {
		const widget = this._widget;
		if (!widget) {
			return;
		}
		widget.setInput(text);
		const model = widget.inputEditor.getModel();
		if (model) {
			const lineNumber = model.getLineCount();
			widget.inputEditor.setPosition({ lineNumber, column: model.getLineMaxColumn(lineNumber) });
		}
	}

	prefillInput(text: string): void {
		this.setInputValue(text);
		this.focus();
	}

	saveState(): void {
		const widget = this._widget;
		// A host that keeps the input in a snapshot persists it itself.
		if (widget && !this.options.inputSnapshot) {
			writeNewChatDraftState(this.storageService, { inputText: this.getInputValue(), attachments: [...this.attachments], references: this._getDraftReferences(widget) });
		}
	}

	private _getDraftReferences(widget: ChatWidget): IDynamicVariable[] | undefined {
		const references = getDynamicVariablesForWidget(widget);
		return references.length ? [...references] : undefined;
	}

	/** Binds the mentions of a draft to what they stand for, so that each becomes the pill it was. */
	private _restoreDraftReferences(draft: IChatDraft): void {
		if (draft.references?.length) {
			this._widget?.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.setInputState({ [ChatDynamicVariableModel.ID]: draft.references });
		}
	}

	/** Gives the input its context queued before rendering and its saved draft, and then tracks the host's snapshot. */
	private _restoreInput(widget: ChatWidget): void {
		if (this._pendingAttachments.length) {
			widget.attachmentModel.addContext(...this._pendingAttachments.splice(0));
		}
		this._restoreDraftState();
		// Only once the host's input is restored and the queued context is merged into it, so neither overwrites it.
		if (this.options.inputSnapshot || this.options.onDidChangeDraft) {
			this._register(this._trackInputSnapshot(widget));
		}
	}

	/**
	 * Writes the input to the host's snapshot now and synchronously on every change of its text, attachments, inline
	 * references or inline attachment pills, which can change the saved prompt without an edit. Never on disposal.
	 */
	private _trackInputSnapshot(widget: ChatWidget): IDisposable {
		const store = new DisposableStore();
		const write = () => this._writeInputSnapshot(widget);
		store.add(widget.inputEditor.onDidChangeModelContent(write));
		store.add(widget.attachmentModel.onDidChange(write));
		const references = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (references) {
			store.add(references.onDidChangeReferences(write));
		}
		const inlineAttachments = widget.input.inlineAttachments;
		if (inlineAttachments) {
			store.add(inlineAttachments.onDidChange(write));
		}
		if (this.options.inputSnapshot) {
			store.add(this.options.inputSnapshot.registerRestorer(draft => this._showRestoredInput(widget, draft)));
		}
		write();
		return store;
	}

	/**
	 * Shows `draft`, which the host gave back, such as the prompt of a send that did not start its session, and returns
	 * whether it did: not while it sends, which clears the input it would show it in.
	 */
	private _showRestoredInput(widget: ChatWidget, draft: IChatDraft): boolean {
		if (this._widget !== widget || this._sending.get()) {
			return false;
		}
		this.setInputValue(draft.inputText);
		widget.attachmentModel.clearAndSetContext(...draft.attachments);
		this._restoreDraftReferences(draft);
		return true;
	}

	private _writeInputSnapshot(widget: ChatWidget): void {
		if (this._widget === widget) {
			const draft = { inputText: this.getInputValue(), attachments: [...this.attachments], references: this._getDraftReferences(widget) };
			this.options.inputSnapshot?.set(draft);
			this.options.onDidChangeDraft?.(draft);
		}
	}

	/**
	 * Ends a send's attempt. A send that did not go out restores its input into the composer; when the composer's input
	 * is gone, such as a view replaced during the send, the snapshot gets it back for the next view, unless that view
	 * already has input of its own.
	 */
	private _endSendAttempt(attemptId: string, sent: boolean, inputAlive: boolean): void {
		const snapshot = this.options.inputSnapshot;
		if (!snapshot) {
			return;
		}
		const state = snapshot.get();
		if (!sent && !inputAlive && state.attempt?.id === attemptId && !state.input.inputText && !state.input.attachments.length) {
			snapshot.set(state.attempt.input);
		}
		snapshot.endSendAttempt(attemptId);
	}

	private _restoreDraftState(): void {
		let draft: IChatDraft | undefined;
		if (this.options.inputSnapshot) {
			// A send whose input was cleared but that has not ended restores what was sent.
			const state = this.options.inputSnapshot.get();
			draft = state.attempt?.input ?? state.input;
		} else {
			try {
				draft = readNewChatDraftState(this.storageService);
			} catch {
				this.logService.warn('[SharedChatInputComposer] Could not restore the saved draft');
			}
		}
		if (draft) {
			this.setInputValue(draft.inputText);
			if (draft.attachments.length) {
				this._widget?.attachmentModel.addContext(...draft.attachments);
			}
			this._restoreDraftReferences(draft);
		}
	}

	getDraft(): IChatDraft {
		const references = this._widget ? this._getDraftReferences(this._widget) : undefined;
		return { inputText: this.getInputValue(), attachments: [...this.attachments], ...(references ? { references } : {}) };
	}

	setInputEnabled(enabled: boolean): void {
		this._widget?.input?.setInputEnabled(enabled);
	}

	async schedule(): Promise<void> {
		if (!this.options.canSchedule?.get() || !this.options.scheduleRequest || this._sending.get() || !this.hasInput) {
			throw new Error(localize('sendLater.composerUnavailable', "Send Later is not available for this composition."));
		}
		this._sending.set(true, undefined);
		this.setInputEnabled(false);
		const input = this.getDraft();
		try {
			const onDidClearInput = await this.options.scheduleRequest(this._widget?.input.executeToolbarElement);
			if (onDidClearInput && !this._store.isDisposed && equals(input, this.getDraft())) {
				this.setDraft(undefined);
				this.saveState();
				onDidClearInput();
			}
		} finally {
			this._sending.set(false, undefined);
			this.setInputEnabled(true);
		}
	}

	setDraft(draft: IChatDraft | undefined): void {
		this.setInputValue(draft?.inputText ?? '');
		this._widget?.attachmentModel.clearAndSetContext(...(draft?.attachments ?? []));
		if (draft) {
			this._restoreDraftReferences(draft);
		}
	}

	applyDraft(draft: IChatDraft): boolean {
		if (!this.isInputReady || this.hasInput || this._sending.get()) {
			return false;
		}
		this.prefillInput(draft.inputText);
		this.addAttachments(...draft.attachments);
		this._restoreDraftReferences(draft);
		this.saveState();
		return true;
	}

	// #endregion

	// #region Attachments

	async runAttachContextAction(action: IAction): Promise<void> {
		await action.run({ anchor: this._widget?.input.attachContextButtonElement });
	}

	attach(uris: URI[]): void {
		this.addAttachments(...uris.map(uri => toFileVariableEntry(uri)));
	}

	attachTextContext(name: string, content: string, icon: ThemeIcon, id = `context:${content}`): void {
		const attachmentModel = this._widget?.attachmentModel;
		if (!attachmentModel) {
			return;
		}
		attachmentModel.delete(id);
		attachmentModel.addContext(toPasteVariableEntry(name, content, { id, icon }));
	}

	addAttachments(...attachments: IChatRequestVariableEntry[]): void {
		if (this._widget) {
			this._widget.attachmentModel.addContext(...attachments);
		} else {
			this._pendingAttachments.push(...attachments);
		}
	}

	removeAttachment(id: string): void {
		this._widget?.attachmentModel.delete(id);
	}

	/** Keeps GitHub issue and pull request links typed into the input as pills. */
	private _syncInputGitHubContext(): void {
		const attachmentModel = this._widget?.attachmentModel;
		const attachments = attachmentModel && syncInputGitHubContextAttachments(this.getInputValue(), attachmentModel.attachments);
		if (attachments) {
			attachmentModel.clearAndSetContext(...attachments);
		}
	}

	// #endregion

	// #region Models

	openModelPicker(): void {
		this._newChatModelPickerService.openModelPicker();
	}

	getComparisonModels() {
		return this._modelSelection.getComparisonModels();
	}

	resolveComparisonModel(modelIdentifier: string) {
		return this._modelSelection.resolveComparisonModel(modelIdentifier);
	}

	getVoiceModels() {
		return this._modelSelection.state.get().models;
	}

	selectVoiceModel(identifier: string): boolean {
		return this._modelSelection.selectModel(identifier);
	}

	/** The id of the repository control action that renders `element`, if any. */
	getRepositoryControlId(element: HTMLElement): string | undefined {
		return this._repositoryToolbar?.getItemAction(element)?.id;
	}

	placeRepositoryControls(container?: HTMLElement): void {
		const repositoryControls = this._repositoryControlsContainer;
		const repositoryControlsHome = this._repositoryControlsHome;
		if (!repositoryControls || !repositoryControlsHome) {
			return;
		}
		if (container) {
			const harnessPicker = Array.from(container.children).find(element => element.classList.contains('sessions-chat-session-type-picker'));
			if (harnessPicker) {
				harnessPicker.before(repositoryControls);
			} else {
				container.append(repositoryControls);
			}
		} else {
			repositoryControlsHome.prepend(repositoryControls);
		}
		this._updateBottomContainerVisibility?.();
		this._bottomPickerResponsiveLayout?.layout();
	}

	/**
	 * Moves focus between the repository controls with Tab while they sit in the
	 * workspace row, where their toolbar's own keyboard navigation does not apply.
	 */
	private _navigateRepositionedRepositoryControls(event: KeyboardEvent): void {
		const repositoryControls = this._repositoryControlsContainer;
		const repositoryControlsHome = this._repositoryControlsHome;
		if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !repositoryControls || !repositoryControlsHome || repositoryControls.parentElement === repositoryControlsHome) {
			return;
		}

		const currentSlot = dom.isHTMLElement(event.target) ? dom.findParentWithClass(event.target, 'sessions-chat-picker-slot') : undefined;
		const slots: HTMLElement[] = [];
		const collectSlots = (element: HTMLElement): void => {
			if (element.classList.contains('sessions-chat-picker-slot')) {
				slots.push(element);
				return;
			}
			for (const child of element.children) {
				if (dom.isHTMLElement(child)) {
					collectSlots(child);
				}
			}
		};
		collectSlots(repositoryControls);
		const findControl = (element: HTMLElement): HTMLElement | undefined => {
			if (element.hasAttribute('tabindex')) {
				return element;
			}
			for (const child of element.children) {
				if (dom.isHTMLElement(child)) {
					const control = findControl(child);
					if (control) {
						return control;
					}
				}
			}
			return undefined;
		};
		const controls = slots.flatMap(slot => {
			const control = findControl(slot);
			return control && control.getAttribute('aria-disabled') !== 'true' ? [{ slot, control }] : [];
		});
		const currentIndex = controls.findIndex(entry => entry.slot === currentSlot);
		const nextIndex = currentIndex + (event.shiftKey ? -1 : 1);
		if (currentIndex < 0 || nextIndex < 0 || nextIndex >= controls.length) {
			return;
		}

		dom.EventHelper.stop(event, true);
		controls[nextIndex].control.focus();
	}

	// #endregion

	// #region Sending

	submit(background = false): Promise<boolean> {
		return this._send(this.getInputValue(), [...(this._widget?.input.getAttachedContext().asArray() ?? [])], background);
	}

	async sendQuery(text: string): Promise<boolean> {
		if (this._sending.get() || !this._widget) {
			return false;
		}
		this.setInputValue(combineVoiceInput(this.getInputValue(), text));
		return this.submit();
	}

	/** Whether the session gets ready to send in time, such as once its draft and model are set up, or the composer goes first. */
	private async _whenCanSendRequest(): Promise<'ready' | 'timeout' | 'disposed'> {
		const store = new DisposableStore();
		this._readinessWait.value = store;
		try {
			return await new Promise<'ready' | 'timeout' | 'disposed'>(resolve => {
				store.add(toDisposable(() => resolve('disposed')));
				store.add(disposableTimeout(() => resolve('timeout'), SEND_READINESS_TIMEOUT_MS));
				store.add(autorun(reader => {
					if (this._canSendRequest.read(reader)) {
						resolve('ready');
					}
				}));
			});
		} finally {
			if (this._readinessWait.value === store) {
				this._readinessWait.clear();
			}
		}
	}

	private async _send(rawQuery: string, attachments: readonly IChatRequestVariableEntry[], background: boolean): Promise<boolean> {
		const widget = this._widget;
		const query = rawQuery.trim();
		const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
		if (!widget || this._sending.get() || !hasSendableNewChatContent(query, attachments, hasAdditionalSendContent)) {
			return false;
		}
		// Inline references belong to the input text; a command completion submits
		// its own text instead, which carries none.
		const references = rawQuery === widget.getInput() ? [...getDynamicVariablesForWidget(widget)] : [];
		// Client-side commands, such as /models, are not sends: they run in the
		// input as in any chat input, also while the host cannot send.
		const slashCommand = this._parseClientSlashCommand(widget, rawQuery, references);
		if (slashCommand) {
			return this._runClientSlashCommand(slashCommand, attachments);
		}
		const targetWindow = dom.getWindow(widget.domNode);
		const hadFocus = widget.input.hasFocus();
		let disabledInputFocus = targetWindow.document.activeElement;
		const canRestoreInputFocus = () => {
			const activeElement = targetWindow.document.activeElement;
			return this.options.inputVisible?.get() !== false && this.options.hostVisible?.get() !== false
				&& (activeElement === targetWindow.document.body || activeElement === disabledInputFocus || widget.input.hasFocus());
		};
		// The request is captured before it waits for its session or the host's confirmation, during which the input is read-only.
		// It can still be replaced programmatically, such as by Run Prompt, and sending would then clear the newer draft.
		const draftBeforeWait = this.getDraft();
		const isDraftReplaced = () => !equals(draftBeforeWait, this.getDraft());
		if (!this._canSendRequest.get()) {
			// A request sent as the composer opens, such as by Run Prompt, can come before its session is set up to send.
			// The request is already captured, so edits made while it waits would be lost.
			this._sending.set(true, undefined);
			widget.input.setInputEnabled(false, this.options.preserveInputFocusOnSend);
			disabledInputFocus = targetWindow.document.activeElement;
			let readiness: 'ready' | 'timeout' | 'disposed';
			try {
				readiness = await this._whenCanSendRequest();
			} finally {
				this._sending.set(false, undefined);
				if (this._widget === widget && widget.input) {
					widget.input.setInputEnabled(true);
				}
			}
			if (readiness === 'disposed' || this._widget !== widget || !widget.input) {
				return false;
			}
			if (readiness === 'timeout') {
				if (hadFocus && canRestoreInputFocus()) {
					widget.input.focus();
				}
				this.notificationService.error(localize('sharedChatInputComposer.notReady', "The request could not be sent because the new session is not ready. Try sending it again."));
				return false;
			}
		}
		if (this.options.confirmSend) {
			transaction(tx => {
				this._sending.set(true, tx);
				this._confirmingSend.set(true, tx);
			});
			// The request is already captured, so edits made while the host confirms would be lost.
			widget.input.setInputEnabled(false, this.options.preserveInputFocusOnSend);
			disabledInputFocus = targetWindow.document.activeElement;
			let confirmed = false;
			try {
				confirmed = await this.options.confirmSend(query);
			} finally {
				transaction(tx => {
					this._sending.set(false, tx);
					this._confirmingSend.set(false, tx);
				});
				if (this._widget === widget && widget.input) {
					widget.input.setInputEnabled(true);
					if (!confirmed && hadFocus && canRestoreInputFocus()) {
						widget.input.focus();
					}
				}
			}
			if (!confirmed || this._widget !== widget) {
				return false;
			}
		}
		if (isDraftReplaced()) {
			// Keep the newer draft for the user to send, and say why the request did not go out.
			if (hadFocus && canRestoreInputFocus()) {
				widget.input.focus();
			}
			this._notifyInputReplaced();
			return false;
		}

		const userInteraction = background ? undefined : this.instantiationService.createInstance(NewChatUserInteraction, {
			window: dom.getWindow(widget.domNode),
			visible: this.options.inputVisible ?? constObservable(true),
			hostVisible: this.options.hostVisible,
		});
		this._userInteractionSource.value = toDisposable(() => userInteraction?.disposeSource());
		const restoreFocusAfterSend = hadFocus && canRestoreInputFocus();
		this._sending.set(true, undefined);
		widget.input.setInputEnabled(false, this.options.preserveInputFocusOnSend);
		disabledInputFocus = targetWindow.document.activeElement;
		// The send can dispose the input widget, e.g. when the composer is left while a workspace is
		// applied or the send waits; the send itself completes and only the gone input is skipped.
		const isInputAlive = () => this._widget === widget && !!widget.input;
		let ownsClearedDraft: (() => boolean) | undefined;
		let attemptId: string | undefined;
		let sent = false;
		const restoreInput = () => {
			if (isInputAlive() && !this.getInputValue() && !widget.attachmentModel.attachments.length) {
				this.setInputValue(rawQuery);
				widget.attachmentModel.addContext(...attachments);
				// The send cleared the inline references along with the text.
				widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.setInputState({ [ChatDynamicVariableModel.ID]: references });
				if (ownsClearedDraft?.()) {
					this.saveState();
				}
			}
		};
		try {
			const session = this.options.session.get();
			if (!hasAdditionalSendContent && session && await this.chatSubmitRequestHandlerService.tryHandle({
				sessionResource: session.resource,
				providerId: session.providerId,
				sessionId: session.sessionId,
				input: query,
			})) {
				userInteraction?.cancel('notDispatched');
				// The handler has acted on the request; an input replaced while it ran is newer, so it is kept.
				if (!isInputAlive() || !isDraftReplaced()) {
					this.setInputValue('');
				}
				return true;
			}
			// The handler can wait, during which the input can be replaced as before.
			if (isInputAlive() && isDraftReplaced()) {
				userInteraction?.cancel('notDispatched');
				this._notifyInputReplaced();
				return false;
			}

			// The input is about to be cleared: until the send ends, the host restores what is sent.
			this.options.onWillSendDraft?.(this.getDraft());
			attemptId = this.options.inputSnapshot?.beginSendAttempt({ inputText: this.getInputValue(), attachments: [...this.attachments], references: this._getDraftReferences(widget) });
			// Clear the input as a regular chat send does. The widget is bound to
			// the draft's chat model, which the running session adopts once the
			// host sends, so the draft must not carry the sent prompt.
			await widget.input.acceptInput(true, true);
			this._modelRef.value?.object.inputModel.setState({ inputText: '', attachments: [] });
			// The host can create another composer before the send completes. A host that keeps the input in a
			// snapshot gets the cleared input from tracking it, and never the main composer's saved draft.
			if (!this.options.inputSnapshot) {
				ownsClearedDraft = writeNewChatDraftState(this.storageService, { inputText: '', attachments: [] });
			}
			// Prompt ranges, such as those of inline references, refer to the untrimmed input.
			const queryOffset = rawQuery.length - rawQuery.trimStart().length;
			const sentAttachments = attachments.map(entry => entry.range && queryOffset
				? { ...entry, range: { start: entry.range.start - queryOffset, endExclusive: entry.range.endExclusive - queryOffset } }
				: entry);
			const accepted = await this.options.sendRequest({ query, attachments: sentAttachments.length > 0 ? sentAttachments : undefined, background, userInteraction, attemptId });
			if (!accepted) {
				userInteraction?.cancel('notDispatched');
				restoreInput();
				return false;
			}
			sent = true;
			return true;
		} catch (error) {
			userInteraction?.cancel(isCancellationError(error) ? 'cancelled' : 'error');
			restoreInput();
			this.logService.error('[SharedChatInputComposer] Failed to send request', error);
			return false;
		} finally {
			this.options.onDidSendDraft?.(sent);
			// After a rejection or failure restored the input, so the snapshot holds it again.
			if (attemptId) {
				this._endSendAttempt(attemptId, sent, isInputAlive());
			}
			this._userInteractionSource.clear();
			if (isInputAlive()) {
				widget.input.setInputEnabled(true);
				if (!sent && restoreFocusAfterSend && canRestoreInputFocus()) {
					widget.input.focus();
				}
			}
			this._sending.set(false, undefined);
		}
	}

	private _notifyInputReplaced(): void {
		this.notificationService.warn(localize('sharedChatInputComposer.inputReplaced', "The request was not sent because the input was replaced while it waited. The new input was kept."));
	}

	/** The client-side command `rawQuery` runs, if any. Provider commands are references, so they never parse as one. */
	private _parseClientSlashCommand(widget: ChatWidget, rawQuery: string, references: readonly IDynamicVariable[]): IClientSlashCommand | undefined {
		const sessionResource = widget.viewModel?.sessionResource;
		if (!sessionResource) {
			return undefined;
		}
		const parsed = this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(references, getSelectedToolAndToolSetsForWidget(widget), rawQuery, ChatAgentLocation.Chat, {
			mode: widget.input.currentModeKind,
			sessionType: getChatSessionType(sessionResource),
		});
		const part = parsed.parts.find((part): part is ChatRequestSlashCommandPart => part instanceof ChatRequestSlashCommandPart);
		return part ? { part, parsed, sessionResource } : undefined;
	}

	/** Runs a client-side command like a chat input does, keeping the input usable for any UI the command opens. */
	private async _runClientSlashCommand({ part, parsed, sessionResource }: IClientSlashCommand, attachments: readonly IChatRequestVariableEntry[]): Promise<boolean> {
		try {
			const result = await this.chatSlashCommandService.executeCommand(
				part.slashCommand.command,
				parsed.text.slice(part.range.endExclusive).trimStart(),
				new Progress(() => { }),
				[],
				ChatAgentLocation.Chat,
				sessionResource,
				CancellationToken.None,
				{ attachedContext: [...attachments] },
				{ input: parsed.text },
			);
			if (!result?.preserveInput) {
				this.setInputValue('');
			}
			return true;
		} catch (error) {
			this.logService.error(`[SharedChatInputComposer] Failed to run /${part.slashCommand.command}`, error);
			return false;
		}
	}

	// #endregion

	// #region Prompt options

	animatePrompt(text: string, durationMs: number, placeholder: string, token: CancellationToken): Promise<boolean> {
		return this._promptOptions.animatePrompt(text, durationMs, placeholder, token);
	}

	showPromptOptions(state: NewSessionPromptOptionsState | undefined): boolean {
		return this._promptOptions.showPromptOptions(state);
	}

	setPromptOptionsController(controller: INewSessionPromptOptionsController): void {
		this._promptOptions.setPromptOptionsController(controller);
	}

	preparePromptOptionsRefresh(): boolean {
		return this._promptOptions.preparePromptOptionsRefresh();
	}

	clearPromptOptions(): void {
		this._promptOptions.clearPromptOptions();
	}

	refreshPromptOptions(token?: CancellationToken): Promise<boolean> {
		return this._promptOptions.refreshPromptOptions(token);
	}

	// #endregion
}

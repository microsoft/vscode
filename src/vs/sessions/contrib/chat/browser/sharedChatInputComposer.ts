/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInput.css';
import './media/sharedChatInputComposer.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, Separator } from '../../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { scrollbarShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../workbench/common/theme.js';
import { IChatSubmitRequestHandlerService } from '../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js';
import { combineVoiceInput } from '../../../../workbench/contrib/chat/browser/voiceClient/voiceInputUtils.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatInputNoticeHost } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { IChatInputHostModelSelection } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ModelComparisonAvailableContext } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerComparison.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatDraft } from '../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatModelReference, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../browser/menus.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground } from '../../../common/theme.js';
import { IWorkspaceSelectionSnapshot } from '../../../common/workspaceSelection.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionInputPickerVisibility, SessionInputPickerVisibility } from '../../../services/sessions/common/sessionPickerVisibility.js';
import { readNewChatDraftState, writeNewChatDraftState } from '../common/newChatDraftState.js';
import { MobileSessionTypePicker } from './mobile/mobileSessionTypePicker.js';
import { getLabeledPickerResponsiveItems, hasSendableNewChatContent, INewChatComposerInputOptions, syncInputGitHubContextAttachments } from './newChatComposerInput.js';
import { createSessionModelCommands, INewChatModelPickerService, NewChatModelPickerService } from './newChatModelPicker.js';
import { INewChatVoiceComposer, INewChatVoiceTargetService } from './newChatVoice.js';
import { createNewSessionControlToolbar } from './newSessionConfigToolbars.js';
import { INewSessionComposer, INewSessionComposerPicker, INewSessionPromptOptionsController, NewSessionPromptOptionsState, NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';
import { NewSessionPromptOptionsPresenter } from './newSessionPromptOptions.js';
import { NewChatUserInteraction } from './newChatUserInteraction.js';
import { hasSendableModelSelection } from './sessionModelPickerState.js';
import { ISessionModelSelection, SessionModelSelection } from './sessionModelSelection.js';
import { SessionTypePicker } from './sessionTypePicker.js';
import { ChatInputPickerResponsiveLayout } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { isPhoneLayout } from '../../../browser/parts/mobile/mobileLayout.js';
import { installMobileChipLaneScroll } from '../../../browser/parts/mobile/mobileChipLaneScroll.js';

/** Body height the composer lays its chat widget out with; the transcript is hidden, so it only bounds the input. */
const COMPOSER_LAYOUT_HEIGHT = 200;
/** Mirrors the chat widget's reserved list and chrome height so the hidden transcript does not shrink the input. */
const COMPOSER_INPUT_MAX_HEIGHT = COMPOSER_LAYOUT_HEIGHT + 50 + 72;
/** Progress stays hidden for operations that finish faster than this, so quick changes do not flicker. */
const BUSY_INDICATOR_DELAY_MS = 500;

export type ComposerBusyState = '' | 'initializing' | 'sending';

/** What the composer is waiting on, shown as progress in its input toolbar. */
export const SharedChatInputComposerBusyContext = new RawContextKey<ComposerBusyState>('sessionsSharedChatInputComposerBusy', '', localize('sessionsSharedChatInputComposerBusy', "What the new-session composer is waiting on, if anything."));

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

	readonly sessionTypePicker: SessionTypePicker;
	readonly pickerVisibility: SessionInputPickerVisibility;
	readonly sessionResource: IObservable<URI | undefined>;

	private readonly _modelSelection: SessionModelSelection;
	private readonly _newChatModelPickerService = new NewChatModelPickerService(() => this.focus());
	private readonly _scopedInstantiationService: IInstantiationService;
	private readonly _canSendRequest: IObservable<boolean>;
	private readonly _promptOptions: NewSessionPromptOptionsPresenter;

	private _widget: ChatWidget | undefined;
	private _container: HTMLElement | undefined;
	private _repositoryControlsContainer: HTMLElement | undefined;
	private _repositoryControlsHome: HTMLElement | undefined;
	private _updateBottomContainerVisibility: (() => void) | undefined;
	private _bottomPickerResponsiveLayout: ChatInputPickerResponsiveLayout | undefined;
	private _lastLayoutWidth: number | undefined;

	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());
	private _modelBinding: CancellationTokenSource | undefined;
	private _boundResource: URI | undefined;
	private readonly _sending = observableValue(this, false);
	/** Releases the in-flight send's visibility tracking, also when the composer is disposed mid-send. */
	private readonly _userInteractionSource = this._register(new MutableDisposable());

	private readonly _onDidChangeInput = this._register(new Emitter<void>());
	readonly onDidChangeInput = this._onDidChangeInput.event;
	private readonly _onDidChangeAttachments = this._register(new Emitter<void>());
	readonly onDidChangeAttachments = this._onDidChangeAttachments.event;
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	constructor(
		private readonly options: INewChatComposerInputOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatSubmitRequestHandlerService private readonly chatSubmitRequestHandlerService: IChatSubmitRequestHandlerService,
		@INewChatVoiceTargetService private readonly newChatVoiceTargetService: INewChatVoiceTargetService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();
		this.pickerVisibility = this._register(new SessionInputPickerVisibility());
		this.sessionResource = derived(this, reader => this.options.session.read(reader)?.resource);
		this._modelSelection = this._register(this.instantiationService.createInstance(SessionModelSelection, this.options.session, {
			comparison: this.options.modelPickerComparison,
			modelConfiguration: true,
			fallbackModelConfiguration: this.languageModelsService,
		}));
		this._canSendRequest = derived(this, reader => {
			if (this.options.canSubmitWithoutSession?.read(reader)) {
				return true;
			}
			return this.options.canSendRequest.read(reader) && hasSendableModelSelection(this._modelSelection.state.read(reader));
		});
		this._scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
			[INewChatModelPickerService, this._newChatModelPickerService],
			[ISessionContext, new SessionContext(this.options.session)],
			[ISessionModelSelection, this._modelSelection],
			[ISessionInputPickerVisibility, this.pickerVisibility],
		)));
		this.sessionTypePicker = this._register(this.instantiationService.createInstance(MobileSessionTypePicker, this.options.session, this.options.sessionTypePickerOptions));
		this._promptOptions = this._register(this.instantiationService.createInstance(NewSessionPromptOptionsPresenter, () => this.focus()));
		this._register(autorun(reader => this.pickerVisibility.setVisible('harness', this.sessionTypePicker.isVisible.read(reader))));
		this._register(this.storageService.onWillSaveState(() => this.saveState()));
		this._register(toDisposable(() => this._modelBinding?.dispose(true)));
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
		const widgetContextKeyService = this._register(this.contextKeyService.createScoped(widgetContainer));
		const busyContextKey = SharedChatInputComposerBusyContext.bindTo(widgetContextKeyService);
		const comparisonAvailable = ModelComparisonAvailableContext.bindTo(widgetContextKeyService);
		this._register(autorun(reader => comparisonAvailable.set(this.options.modelPickerComparison?.available.read(reader) ?? false)));
		// Tracked on the whole widget, so commands scoped to the composer also apply
		// while focus is in its notices or toolbar.
		const composerFocusKey = ChatContextKeys.inChatComposer.bindTo(widgetContextKeyService);
		const composerFocusTracker = this._register(dom.trackFocus(widgetContainer));
		this._register(composerFocusTracker.onDidFocus(() => composerFocusKey.set(true)));
		this._register(composerFocusTracker.onDidBlur(() => composerFocusKey.set(false)));
		const widgetInstantiationService = this._register(this._scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, widgetContextKeyService])));
		const widget = this._widget = this._register(widgetInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			undefined,
			{
				renderFollowups: false,
				renderInputOnTop: true,
				renderSecondaryToolbar: false,
				renderGettingStartedTip: false,
				supportsFileReferences: true,
				enableImplicitContext: false,
				supportsChangingModes: false,
				isSessionsWindow: true,
				inputEditorMinLines: 2,
				editorOverflowWidgetsDomNode,
				menus: {
					inputToolbar: Menus.NewSessionChatInputToolbar,
					telemetrySource: 'sessions.newChatComposer',
				},
				// The input sits flush with the composer's picker rows.
				inputPartHorizontalPadding: 0,
				hostModelSelection: this._createHostModelSelection(),
				deferredNotificationsEnabled: this.options.deferredNotificationsEnabled,
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
		widget.render(widgetContainer, root, this.options.petHostPreferred);
		widget.setVisible(true);
		widget.setInputPartMaxHeightOverride(COMPOSER_INPUT_MAX_HEIGHT);
		if (this.options.placeholder) {
			widget.inputEditor.updateOptions({ placeholder: this.options.placeholder });
		}

		this._register(widget.onDidFocus(() => this._onDidFocus.fire()));
		this._register(widget.inputEditor.onDidChangeModelContent(() => {
			this._syncInputGitHubContext();
			this._onDidChangeInput.fire();
		}));
		this._register(widget.attachmentModel.onDidChange(() => {
			this._onDidChangeAttachments.fire();
			this._onDidChangeInput.fire();
		}));
		if (this.options.supportsBackground) {
			// Alt+Enter sends without navigating into the session, like the other Agents window composers.
			this._register(widget.inputEditor.onKeyDown(e => {
				if (e.keyCode === KeyCode.Enter && e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
					e.preventDefault();
					e.stopPropagation();
					void this.submit(true);
				}
			}));
		}
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
		this._register(this.newChatVoiceTargetService.registerComposer(this));
		this._register(this.onDidFocus(() => this.newChatVoiceTargetService.setActive(this)));
		this._register(widget.input.registerChatPetHorizontalPlatformProvider({
			onDidChange: Event.any(this.options.onDidChangeChatPetPlatform ?? Event.None, this.sessionTypePicker.onDidChangeChatPetPlatform),
			getElements: () => [...(this.options.getChatPetPlatformElements?.() ?? []), ...this.sessionTypePicker.getChatPetPlatformElements()],
		}));

		this._renderSessionControls(container);
		this._restoreDraftState();

		// The widget needs a chat model before it accepts input. Bind the draft's
		// chat so the input sees its session type, and keep the input when the
		// draft is replaced.
		this._register(autorun(reader => {
			const session = this.options.session.read(reader);
			void this._bindModel(session?.activeChat.read(reader).resource);
		}));

		const resizeObserver = this._register(new dom.DisposableResizeObserver('SharedChatInputComposer', () => this._layoutWidget(), dom.getWindow(container)));
		this._register(resizeObserver.observe(container));
		this._layoutWidget();
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
		const busy = derived<ComposerBusyState>(this, reader => this._sending.read(reader) ? 'sending' : this.options.loading.read(reader) ? 'initializing' : '');
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

	private _renderSessionControls(container: HTMLElement): void {
		const bottomContainer = dom.append(container, dom.$('.new-chat-bottom-container'));
		const controlsContainer = dom.append(bottomContainer, dom.$('.new-chat-controls-container'));
		let sessionControlsToolbar: MenuWorkbenchToolBar | undefined;

		const secondaryControlsContainer = this._repositoryControlsHome = dom.append(bottomContainer, dom.$('.new-chat-secondary-controls-container'));
		const repositoryControlsContainer = this._repositoryControlsContainer = dom.append(secondaryControlsContainer, dom.$('.new-chat-repo-config-container'));
		this._register(dom.addDisposableListener(repositoryControlsContainer, dom.EventType.KEY_DOWN, event => this._navigateRepositionedRepositoryControls(event)));
		let repositoryToolbar: MenuWorkbenchToolBar | undefined;
		if (this.options.renderRepositoryControls !== false) {
			const session = this.options.session;
			repositoryToolbar = this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, repositoryControlsContainer, Menus.NewSessionRepositoryConfig, {
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				toolbarOptions: {
					primaryGroup: group => group.startsWith('navigation'),
					useSeparatorsInPrimaryActions: true,
				},
				actionViewItemProvider: (action, options) => action.id === Separator.ID
					? new RepositoryConfigSeparatorActionViewItem(undefined, action, options)
					: undefined,
				menuOptions: {
					// Capture the originating session before command activation can yield.
					get arg() { return { session: session.get() }; },
				},
			}));
		}

		const useExperimentalLayout = this.options.useExperimentalLayout ?? constObservable(false);
		const updateVisibility = () => {
			const sessionControlCount = sessionControlsToolbar?.getItemsLength() ?? 0;
			const repositoryControlCount = repositoryControlsContainer.parentElement === secondaryControlsContainer ? repositoryToolbar?.getItemsLength() ?? 0 : 0;
			bottomContainer.classList.toggle('empty', sessionControlCount + repositoryControlCount === 0);
		};
		this._updateBottomContainerVisibility = updateVisibility;
		if (repositoryToolbar) {
			this._register(repositoryToolbar.onDidChangeMenuItems(updateVisibility));
		}
		this._register(installMobileChipLaneScroll(bottomContainer, this.layoutService));
		const bottomPickerResponsiveLayout = this._bottomPickerResponsiveLayout = this._register(new ChatInputPickerResponsiveLayout('SharedChatInputComposer.bottomPicker', bottomContainer, {
			isCompactionEnabled: () => !isPhoneLayout(this.layoutService),
			getItems: () => getLabeledPickerResponsiveItems(bottomContainer),
		}));
		this._register(autorun(reader => {
			const experimental = useExperimentalLayout.read(reader);
			bottomContainer.classList.toggle('standard-new-session-composer-layout', !experimental);
			controlsContainer.classList.toggle('hidden', experimental);
			// The experimental layout shows the session controls in the input toolbar instead.
			if (!experimental) {
				const sessionControlsContainer = dom.append(controlsContainer, dom.$('.sessions-chat-config-toolbar.new-chat-session-controls'));
				const toolbar = sessionControlsToolbar = reader.store.add(createNewSessionControlToolbar(sessionControlsContainer, this._scopedInstantiationService, localize('sessionsSharedChatInput.sessionControlsRow', "Session controls")));
				reader.store.add(toolbar.onDidChangeMenuItems(updateVisibility));
				reader.store.add(toDisposable(() => {
					sessionControlsToolbar = undefined;
					sessionControlsContainer.remove();
				}));
			}
			updateVisibility();
			bottomPickerResponsiveLayout.layout();
		}));
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
		this._layoutWidget();
		this._bottomPickerResponsiveLayout?.layout();
	}

	focus(): void {
		this._widget?.focusInput();
	}

	// #endregion

	// #region Chat model binding

	private async _bindModel(resource: URI | undefined): Promise<void> {
		const widget = this._widget;
		if (!widget || (this._modelRef.value && isEqual(this._boundResource, resource))) {
			return;
		}
		this._boundResource = resource;
		// A newer draft supersedes a load that is still in flight.
		this._modelBinding?.dispose(true);
		const cts = this._modelBinding = new CancellationTokenSource();
		let ref: IChatModelReference | undefined;
		if (resource) {
			try {
				ref = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, cts.token, 'SharedChatInputComposer');
			} catch (error) {
				if (!isCancellationError(error)) {
					this.logService.warn('[SharedChatInputComposer] Could not load the draft chat; using a placeholder model', error);
				}
			}
		}
		if (cts.token.isCancellationRequested || this._store.isDisposed) {
			ref?.dispose();
			return;
		}
		// Without a draft (no workspace picked yet) the widget still needs a model
		// to accept input. It never sends to that model: the composer's host sends.
		ref ??= this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'SharedChatInputComposer' });

		// The composer owns its draft, so carry the typed input and attachments
		// over instead of adopting whatever the newly bound model had.
		const inputText = widget.getInput();
		const attachments = [...widget.attachmentModel.attachments];
		widget.setModel(ref.object);
		if (widget.getInput() !== inputText) {
			this.setInputValue(inputText);
		}
		widget.attachmentModel.clearAndSetContext(...attachments);
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

	get onDidChangeWorkspaceSelection(): Event<void> {
		return this.options.onDidChangeWorkspaceSelection ?? Event.None;
	}

	get routesWhileSessionActive(): boolean {
		return this.options.voiceRoutesWhileSessionActive === true;
	}

	get attachments(): readonly IChatRequestVariableEntry[] {
		return this._widget?.attachmentModel.attachments ?? [];
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
		if (this._widget) {
			writeNewChatDraftState(this.storageService, { inputText: this.getInputValue(), attachments: [...this.attachments] });
		}
	}

	private _restoreDraftState(): void {
		let draft: IChatDraft | undefined;
		try {
			draft = readNewChatDraftState(this.storageService);
		} catch {
			this.logService.warn('[SharedChatInputComposer] Could not restore the saved draft');
		}
		if (draft) {
			this.setInputValue(draft.inputText);
			if (draft.attachments.length) {
				this._widget?.attachmentModel.addContext(...draft.attachments);
			}
		}
	}

	applyDraft(draft: IChatDraft): boolean {
		if (!this.isInputReady || this.hasInput || this._sending.get()) {
			return false;
		}
		this.prefillInput(draft.inputText);
		this.addAttachments(...draft.attachments);
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
		this._widget?.attachmentModel.addContext(...attachments);
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

	private async _send(rawQuery: string, attachments: readonly IChatRequestVariableEntry[], background: boolean): Promise<boolean> {
		const widget = this._widget;
		const query = rawQuery.trim();
		const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
		if (!widget || this._sending.get() || !hasSendableNewChatContent(query, attachments, hasAdditionalSendContent) || !this._canSendRequest.get()) {
			return false;
		}

		const userInteraction = background ? undefined : this.instantiationService.createInstance(NewChatUserInteraction, {
			window: dom.getWindow(widget.domNode),
			visible: this.options.inputVisible ?? constObservable(true),
			hostVisible: this.options.hostVisible,
		});
		this._userInteractionSource.value = toDisposable(() => userInteraction?.disposeSource());
		this._sending.set(true, undefined);
		widget.input.setInputEnabled(false);
		const restoreInput = () => {
			if (!this.getInputValue() && !widget.attachmentModel.attachments.length) {
				this.setInputValue(rawQuery);
				widget.attachmentModel.addContext(...attachments);
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
				this.setInputValue('');
				return true;
			}

			// Clear the input as a regular chat send does. The widget is bound to
			// the draft's chat model, which the running session adopts once the
			// host sends, so the draft must not carry the sent prompt.
			await widget.input.acceptInput(true, true);
			this._modelRef.value?.object.inputModel.setState({ inputText: '', attachments: [] });
			const sent = await this.options.sendRequest({ query, attachments: attachments.length > 0 ? [...attachments] : undefined, background, userInteraction });
			if (!sent) {
				userInteraction?.cancel('notDispatched');
				restoreInput();
				return false;
			}
			this.saveState();
			return true;
		} catch (error) {
			userInteraction?.cancel(isCancellationError(error) ? 'cancelled' : 'error');
			restoreInput();
			this.logService.error('[SharedChatInputComposer] Failed to send request', error);
			return false;
		} finally {
			this._userInteractionSource.clear();
			widget.input.setInputEnabled(true);
			this._sending.set(false, undefined);
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

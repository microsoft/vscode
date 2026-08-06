/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInputWindow.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindowService, IAuxiliaryWindow } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IRectangle } from '../../../../../platform/window/common/window.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { inputBackground, inputBorder } from '../../../../../platform/theme/common/colors/inputColors.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { localize } from '../../../../../nls.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatMode } from '../../common/chatModes.js';
import { IChatModelReference, IChatService } from '../../common/chatService/chatService.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../sessionRouter/chatSessionRoutingController.js';
import { combineVoiceInput } from '../voiceClient/voiceInputUtils.js';
import { IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT, CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID } from '../../common/chatInputWindow.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { AgentSessionStatus } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IVoiceSessionController } from '../voiceClient/voiceSessionController.js';
import { IMicCaptureService } from '../voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../voiceClient/ttsPlaybackService.js';
import { setupVoiceInputDecorations } from '../voiceClient/voiceInputDecorations.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { OmniChatEnabledSettingId } from '../../common/sessionRouter.js';
import { AgentSessionProviders, AgentSessionTarget } from '../agentSessions/agentSessions.js';

const CHAT_INPUT_WINDOW_MODEL_PICKER_HEIGHT = 420;
const CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT = 44;
const CHAT_INPUT_WINDOW_MAX_WIDTH = 600;
const CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT = 360;
const CHAT_INPUT_WINDOW_MIN_CONFIRMATION_HEIGHT = 112;

/**
 * Hosts a frameless, always-on-top auxiliary window containing the full chat
 * input box — dictation, voice mode, and the glow animation. Submissions are
 * intercepted and routed to the best-matching existing session (or a new one)
 * via the shared {@link ChatSessionRoutingController}.
 */
export class ChatInputWindowService extends Disposable implements IChatInputWindowService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeOpen = this._register(new Emitter<boolean>());
	readonly onDidChangeOpen: Event<boolean> = this._onDidChangeOpen.event;

	private readonly _auxiliaryWindowRef = this._register(new MutableDisposable());
	private _window: IAuxiliaryWindow | undefined;
	private readonly _windowDisposables = this._register(new DisposableStore());
	private readonly _ownershipChannel: BroadcastChannel;
	private _modelRef: IChatModelReference | undefined;
	private _widget: ChatWidget | undefined;
	private _pendingPromptIndex = 0;
	private _activePendingSessionResource: URI | undefined;
	private readonly _voiceConfirmationPending = observableValue(this, false);
	private readonly _onDidChangeSessionTarget = this._register(new Emitter<AgentSessionTarget>());
	private _sessionTarget: AgentSessionTarget = AgentSessionProviders.Local;
	private _fitWindowToContent: () => void = () => { };
	/** The single input row; routing results are inserted immediately after it. */
	private _row: HTMLElement | undefined;
	private _lead: HTMLElement | undefined;
	private _trail: HTMLElement | undefined;
	/** Shared routing + advisory-badge behaviour; recreated per widget, torn down on close. */
	private _routingController: ChatSessionRoutingController | undefined;
	/** In-flight `openWindow()` operation, so concurrent toggles stay idempotent. */
	private _openOperation: Promise<void> | undefined;
	private _desiredOpen = false;
	private readonly _ownershipId = mainWindow.crypto.randomUUID();
	private _ownershipClaim: { readonly timestamp: number; readonly id: string } | undefined;
	private _actionWidgetRestoreHeight: number | undefined;
	/** Immutable bounds of the window that invoked omni, captured before service resolution. */
	private _invokingWindowBounds: IRectangle = this._windowBounds(mainWindow);

	get isOpen(): boolean {
		return !!this._window;
	}

	get hasFocus(): boolean {
		return this._window?.window.document.hasFocus() ?? false;
	}

	constructor(
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@ICommandService private readonly commandService: ICommandService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ILogService private readonly logService: ILogService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		const ownershipChannel = new BroadcastChannel('chat-input-window-ownership');
		ownershipChannel.onmessage = e => {
			const incoming = e.data;
			if (incoming?.type !== 'claim' || typeof incoming.timestamp !== 'number' || typeof incoming.id !== 'string') {
				return;
			}
			const current = this._ownershipClaim;
			const incomingWins = !current
				|| incoming.timestamp > current.timestamp
				|| (incoming.timestamp === current.timestamp && incoming.id > current.id);
			if (incomingWins) {
				this.closeWindow();
			}
		};
		this._register({ dispose: () => ownershipChannel.close() });
		this._ownershipChannel = ownershipChannel;

		this._register(dom.addDisposableListener(mainWindow, 'beforeunload', () => {
			if (this._window) {
				this.closeWindow();
			}
		}));

		const wasOpen = this.storageService.getBoolean(ChatInputWindowStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
		if (wasOpen) {
			this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		const closeWhenDisabled = () => {
			if (!this._isEnabled()) {
				this.closeWindow();
			}
		};
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(OmniChatEnabledSettingId)) {
				closeWhenDisabled();
			}
		}));
		this._register(this.chatEntitlementService.onDidChangeSentiment(closeWhenDisabled));
	}

	async openWindow(invokingWindowBounds?: IRectangle): Promise<void> {
		if (!this._isEnabled()) {
			return;
		}
		this._desiredOpen = true;
		if (this._window) {
			return;
		}
		// Coalesce concurrent open/toggle calls so we never create two aux windows.
		if (this._openOperation) {
			return this._openOperation;
		}
		this._invokingWindowBounds = invokingWindowBounds ?? this._windowBounds(dom.getActiveWindow());
		this._openOperation = this._doOpenWindow();
		try {
			await this._openOperation;
		} catch (error) {
			this._desiredOpen = false;
			this._disposeWidget();
			this._window = undefined;
			this._windowDisposables.clear();
			this._auxiliaryWindowRef.clear();
			this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			throw error;
		} finally {
			this._openOperation = undefined;
		}
	}

	private async _doOpenWindow(): Promise<void> {
		const bounds = this._defaultBounds();

		const auxiliaryWindow = await this.auxiliaryWindowService.open({
			bounds,
			alwaysOnTop: true,
			frameless: true,
			transparent: true,
			disableFullscreen: true,
			nativeTitlebar: false,
			noBackgroundThrottling: true,
			backgroundColor: '#00000000',
		});
		if (!this._desiredOpen || !this._isEnabled()) {
			auxiliaryWindow.dispose();
			return;
		}

		this._window = auxiliaryWindow;
		this._auxiliaryWindowRef.value = auxiliaryWindow;

		const workspace = this.workspaceContextService.getWorkspace();
		const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : '';
		auxiliaryWindow.window.document.title = projectName
			? localize('chatInputWindow.titleWithProject', "Chat Input — {0}", projectName)
			: localize('chatInputWindow.title', "Chat Input");

		auxiliaryWindow.container.style.overflow = 'hidden';
		auxiliaryWindow.container.classList.add('chat-input-window');
		auxiliaryWindow.window.document.body.classList.add('chat-input-window-body');
		auxiliaryWindow.window.document.body.style.setProperty('margin', '0', 'important');

		this._windowDisposables.clear();

		const applyThemeColors = () => {
			const theme = this.themeService.getColorTheme();
			const surface = theme.getColor(inputBackground)?.toString() ?? '#3c3c3c';
			const border = theme.getColor(inputBorder)?.toString() ?? 'transparent';
			auxiliaryWindow.window.document.body.style.setProperty('background-color', 'transparent', 'important');
			auxiliaryWindow.container.style.backgroundColor = surface;
			auxiliaryWindow.container.style.border = `1px solid ${border}`;
			auxiliaryWindow.container.style.boxSizing = 'border-box';
		};

		auxiliaryWindow.container.style.display = 'flex';
		auxiliaryWindow.container.style.flexDirection = 'column';

		const row = dom.append(auxiliaryWindow.container, dom.$('.chat-input-window-row'));
		this._row = row;
		const lead = dom.append(row, dom.$('.chat-input-window-lead', {
			'aria-hidden': 'true',
			title: localize('chatInputWindow.drag', "Drag to move"),
		}));
		this._lead = lead;
		lead.style.setProperty('-webkit-app-region', 'drag');
		lead.appendChild(renderIcon(Codicon.grabber));

		applyThemeColors();
		this._windowDisposables.add(this.themeService.onDidColorThemeChange(() => applyThemeColors()));

		// Host the real chat input (dictation, voice mode, glow) by rendering a
		// compact ChatWidget. The response list is filtered out so only the input
		// box shows. Submission is intercepted via submitHandler (the routing
		// seam) and routed to the best-matching existing session.
		this._renderChatWidget(auxiliaryWindow, row);
		this._windowDisposables.add(autorun(reader => {
			const ownsVoice = this.voiceSessionController.omniInputActive.read(reader);
			if (ownsVoice || auxiliaryWindow.window.document.hasFocus()) {
				return;
			}
			this._windowDisposables.add(dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => {
				const activeWindow = dom.getActiveWindow();
				if (activeWindow !== auxiliaryWindow.window) {
					this.voiceSessionController.setActiveWindow(activeWindow);
				}
			}));
		}));

		const trail = dom.append(row, dom.$('.chat-input-window-trail'));
		this._trail = trail;
		const close = dom.append(trail, dom.$('a.chat-input-window-close', {
			role: 'button',
			tabindex: '0',
			'aria-label': localize('chatInputWindow.close.label', "Close"),
		}));
		close.appendChild(renderIcon(Codicon.close));
		this._windowDisposables.add(dom.addDisposableListener(close, dom.EventType.CLICK, () => this.closeWindow()));
		this._windowDisposables.add(dom.addStandardDisposableListener(close, dom.EventType.KEY_DOWN, event => {
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				event.preventDefault();
				this.closeWindow();
			}
		}));
		this._renderPendingPrompts(auxiliaryWindow);

		// Clean up when the user closes the window via OS controls. Guard by window
		// identity so a stale unload after a quick reopen can't tear down the new one.
		Event.once(auxiliaryWindow.onUnload)(() => {
			if (this._window !== auxiliaryWindow) {
				return;
			}
			this._disposeWidget();
			this._desiredOpen = false;
			this._ownershipClaim = undefined;
			this._window = undefined;
			this._windowDisposables.clear();
			this._auxiliaryWindowRef.value = undefined;
			this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			this._onDidChangeOpen.fire(false);
		});

		this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this._onDidChangeOpen.fire(true);
	}

	closeWindow(): void {
		this._desiredOpen = false;
		this._ownershipClaim = undefined;
		if (!this._window) { return; }

		this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);

		// Cancel any in-flight submission so routing can't dispatch after close.
		this._routingController?.cancelPending();
		this._disposeWidget();
		this._window = undefined;
		this._windowDisposables.clear();
		this._auxiliaryWindowRef.value = undefined;
		this._onDidChangeOpen.fire(false);
	}

	async toggleWindow(invokingWindowBounds?: IRectangle): Promise<void> {
		if (this._desiredOpen || this.isOpen) {
			this.closeWindow();
		} else {
			const claim = { timestamp: Date.now(), id: this._ownershipId };
			this._ownershipClaim = claim;
			this._ownershipChannel.postMessage({ type: 'claim', ...claim });
			await this.openWindow(invokingWindowBounds);
		}
	}

	async acceptVoiceInput(text: string): Promise<boolean> {
		const window = this._window?.window;
		const widget = this._widget;
		if ((!window?.document.hasFocus() && !this.voiceSessionController.omniInputActive.get()) || !widget || !this._routingController) {
			return false;
		}

		await widget.acceptInput(combineVoiceInput(widget.getInput(), text), {
			preserveFocus: true,
			isVoiceModeInput: true,
		});
		return true;
	}

	private _renderChatWidget(auxiliaryWindow: IAuxiliaryWindow, row: HTMLElement): void {
		// The glow CSS keys off `.monaco-workbench .interactive-session
		// .chat-input-container` - the aux container already tracks the
		// `monaco-workbench` class, so we only need the `.interactive-session`
		// wrapper here.
		const parent = dom.append(row, dom.$('.interactive-session'));
		parent.style.flex = '1 1 auto';
		parent.style.minWidth = '0';

		const scopedContextKeyService = this._windowDisposables.add(this.contextKeyService.createScoped(parent));
		// Mark this surface so its dedicated accessibility help (routing + how to
		// close) takes precedence over the generic Quick Chat help.
		ChatContextKeys.inChatInputWindow.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._windowDisposables.add(this.instantiationService.createChild(
			new ServiceCollection([
				IContextKeyService,
				scopedContextKeyService,
			])
		));

		const widget = this._windowDisposables.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ isQuickChat: true },
			{
				autoScroll: true,
				renderInputOnTop: true,
				renderStyle: 'compact',
				renderGettingStartedTip: false,
				// Show only the input box — drop every response list item.
				filter: () => false,
				enableImplicitContext: false,
				defaultMode: ChatMode.Ask,
				menus: { telemetrySource: 'chatInputWindow' },
				sessionTypePickerDelegate: {
					getActiveSessionProvider: () => this._sessionTarget,
					setActiveSessionProvider: provider => {
						this._sessionTarget = provider;
						this._onDidChangeSessionTarget.fire(provider);
					},
					onDidChangeActiveSessionProvider: this._onDidChangeSessionTarget.event,
				},
				// Routing seam: intercept submission before local execution and
				// route it to the best-matching existing session (or a new one),
				// forwarding any explicit attachments on the input.
				submitHandler: (query, mode, attachedContext, isVoiceModeInput) => this._routingController?.handleSubmit(query, mode, attachedContext, isVoiceModeInput) ?? Promise.resolve(false),
				onDidChangeModelPickerVisibility: visible => this._layoutForModelPicker(auxiliaryWindow, visible),
				inputPickerPosition: AnchorPosition.BELOW,
				inputPickerContainer: auxiliaryWindow.container,
			},
			{
				inputEditorBackground: inputBackground,
				resultEditorBackground: editorBackground,
				listBackground: editorBackground,
				listForeground: editorBackground,
				overlayBackground: editorBackground,
			}
		));
		this._widget = widget;
		widget.render(parent);
		widget.setVisible(true);
		const inputContainer = widget.input.inputContainerElement;
		if (inputContainer) {
			try {
				this._windowDisposables.add(setupVoiceInputDecorations({
					voiceSessionController: this.voiceSessionController,
					ttsPlaybackService: this.ttsPlaybackService,
					micCaptureService: this.micCaptureService,
					configurationService: this.configurationService,
					keybindingService: this.keybindingService,
					themeService: this.themeService,
					accessibilityService: this.accessibilityService,
				}, {
					inputContainer,
					glowContainer: auxiliaryWindow.container,
					isActive: this.voiceSessionController.omniInputActive,
					isOwner: this.voiceSessionController.omniInputActive,
					confirmationPending: this._voiceConfirmationPending,
				}));
			} catch (error) {
				this.logService.error('[chatInputWindow] Failed to initialize voice decorations', error);
			}
		}

		const modelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: 'ChatInputWindow' });
		this._modelRef = modelRef;
		widget.setModel(modelRef.object);

		let fitWindowToInput = () => { };

		// Route submissions through the shared controller, inserting its advisory
		// panel below the input and excluding this window's scratch session from
		// the routing candidates so it can never route to itself.
		const host: IChatSessionRoutingHost = {
			widget,
			getOwnSessionResource: () => this._modelRef?.object.sessionResource,
			getPendingReplySessionResource: () => this._activePendingSessionResource,
			getNewSessionTarget: () => this._sessionTarget,
			onWillRoute: () => this.voiceSessionController.prepareForRoutingRequest(),
			onWillDispatchRoute: resource => this.voiceSessionController.markRoutedRequestPending(resource),
			onDidRejectRoute: resource => this.voiceSessionController.clearRoutedRequest(resource),
			onDidResolveRoute: (resource, kind, _isVoiceModeInput, requestId) => {
				if (resource) {
					this.voiceSessionController.markRoutedRequestPending(resource, requestId);
				}
				this.commandService.executeCommand(CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID, resource?.toString(), kind).catch(() => { });
			},
			placeBadge: (badge) => {
				const container = this._window?.container;
				const row = this._row;
				if (!container || !row) {
					return;
				}
				row.after(badge);
				fitWindowToInput();
				const resizeObserver = new auxiliaryWindow.window.ResizeObserver(() => fitWindowToInput());
				resizeObserver.observe(badge);
				const observer = new auxiliaryWindow.window.MutationObserver(() => {
					if (!badge.isConnected) {
						observer.disconnect();
						resizeObserver.disconnect();
						fitWindowToInput();
					}
				});
				observer.observe(container, { childList: true });
				this._windowDisposables.add(toDisposable(() => {
					observer.disconnect();
					resizeObserver.disconnect();
				}));
			},
		};
		this._routingController = this._windowDisposables.add(this.instantiationService.createInstance(ChatSessionRoutingController, host, 'chatInputWindow'));

		// Fit the frameless window to the widget's own content and any routing
		// panel below it. Measuring the input container itself includes the
		// height the host assigned and creates a feedback loop with empty space.
		let lastContentHeight: number | undefined;
		let didInitialPosition = false;
		fitWindowToInput = () => {
			if (this._actionWidgetRestoreHeight !== undefined) {
				return;
			}
			const win = this._window?.window;
			if (!win || win !== auxiliaryWindow.window) {
				return;
			}
			const width = Math.max(this._defaultWidth(), win.outerWidth);
			const rowHeight = Math.max(CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT, Math.ceil(widget.contentHeight));
			const extraHeight = Array.from(auxiliaryWindow.container.children)
				.filter(child => child !== this._row)
				.reduce((height, child) => {
					const element = child as HTMLElement;
					const position = auxiliaryWindow.window.getComputedStyle(element).position;
					return position === 'absolute' || position === 'fixed'
						? height
						: height + element.offsetHeight;
				}, 0);
			const contentHeight = rowHeight + extraHeight + 2;
			if (contentHeight === lastContentHeight) {
				return;
			}
			lastContentHeight = contentHeight;
			let x = win.screenX;
			let y = win.screenY;
			if (!didInitialPosition) {
				didInitialPosition = true;
				const invokingWindowBounds = this._invokingWindowBounds;
				x = Math.round(invokingWindowBounds.x + (invokingWindowBounds.width - width) / 2);
				y = Math.round(invokingWindowBounds.y + (invokingWindowBounds.height - contentHeight) / 2);
			}
			void auxiliaryWindow.setBounds({ x, y, width, height: contentHeight });
		};
		this._fitWindowToContent = fitWindowToInput;

		let layingOut = false;
		const layout = () => {
			if (layingOut) {
				return;
			}
			layingOut = true;
			try {
				const chrome = (this._lead?.offsetWidth ?? 0) + (this._trail?.offsetWidth ?? 0);
				const rowStyle = auxiliaryWindow.window.getComputedStyle(row);
				const horizontalPadding = Number.parseFloat(rowStyle.paddingLeft) + Number.parseFloat(rowStyle.paddingRight);
				const available = Math.max(0, row.clientWidth - chrome - horizontalPadding);
				parent.style.width = `${available}px`;
				widget.input.layout(available);
				widget.layoutForInputHeight(Math.max(CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT, widget.contentHeight), available);

				const spill = parent.scrollWidth - parent.clientWidth;
				if (spill > 0) {
					const compensatedWidth = Math.max(0, available - spill);
					widget.input.layout(compensatedWidth);
					widget.layoutForInputHeight(Math.max(CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT, widget.contentHeight), compensatedWidth);
				}
				fitWindowToInput();
			} finally {
				layingOut = false;
			}
		};
		layout();
		this._windowDisposables.add(widget.onDidChangeContentHeight(() => fitWindowToInput()));
		const scheduledInputLayout = this._windowDisposables.add(new MutableDisposable());
		this._windowDisposables.add(widget.inputEditor.onDidChangeModelContent(() => {
			// Submit controls change after the editor event; measure them in the
			// next frame so the editor yields space before they can cover close.
			scheduledInputLayout.value = dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => layout());
		}));

		this._windowDisposables.add(dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => {
			layout();
			// Focus the input only after the window has been positioned: the
			// `moveTo`/`resizeTo` above blur the editor, so focusing in a
			// follow-up frame (after the OS window is settled and keyed) is what
			// makes the caret actually render.
			this._windowDisposables.add(dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => {
				widget.focusInput();
			}));
		}));
		// Refresh editor focus and transfer the voice capture lease back to omni
		// when an in-progress omni turn regains OS focus.
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'focus', () => {
			widget.focusInput();
			if (this.voiceSessionController.omniInputActive.get()) {
				this.voiceSessionController.setOmniInputActive(true);
				this.voiceSessionController.setActiveWindow(auxiliaryWindow.window);
			}
		}));
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', layout));
	}

	private _renderPendingPrompts(auxiliaryWindow: IAuxiliaryWindow): void {
		const panel = dom.append(auxiliaryWindow.container, dom.$('.chat-input-window-pending-panel'));
		const header = dom.append(panel, dom.$('.chat-input-window-pending-header', { 'aria-live': 'polite' }));
		const marker = dom.append(header, dom.$('span.chat-input-window-pending-marker', { 'aria-hidden': 'true' }));
		marker.appendChild(renderIcon(Codicon.gripper));
		const label = dom.append(header, dom.$('span.chat-input-window-pending-label'));
		const navigation = dom.append(header, dom.$('.chat-input-window-pending-navigation'));
		const previous = this._appendPendingNavigationButton(navigation, Codicon.chevronLeft, localize('chatInputWindow.pending.previous', "Previous Request"));
		const next = this._appendPendingNavigationButton(navigation, Codicon.chevronRight, localize('chatInputWindow.pending.next', "Next Request"));

		const parent = dom.append(panel, dom.$('.chat-input-window-pending-widget.interactive-session'));
		const scopedContextKeyService = this._windowDisposables.add(this.contextKeyService.createScoped(parent));
		ChatContextKeys.inChatInputWindow.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._windowDisposables.add(this.instantiationService.createChild(
			new ServiceCollection([
				IContextKeyService,
				scopedContextKeyService,
			])
		));
		const widget = this._windowDisposables.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ isQuickChat: true },
			{
				autoScroll: true,
				renderInputOnTop: true,
				renderStyle: 'compact',
				renderGettingStartedTip: false,
				filter: item => isResponseVM(item) && !!item.model.isPendingConfirmation.get(),
				enableImplicitContext: false,
				defaultMode: ChatMode.Ask,
				menus: { telemetrySource: 'chatInputWindowPending' },
			},
			{
				inputEditorBackground: inputBackground,
				resultEditorBackground: editorBackground,
				listBackground: editorBackground,
				listForeground: editorBackground,
				overlayBackground: editorBackground,
			}
		));
		widget.render(parent);
		// Tool approvals and questions are rendered in ChatInputPart rather than
		// the response list. Keep it mounted; CSS hides only the editor chrome.
		widget.setInputVisible(true);
		widget.setVisible(true);
		const list = widget.domNode.querySelector<HTMLElement>(':scope > .interactive-list');

		let pendingModels: readonly IChatModel[] = [];
		let layingOut = false;
		let lastPendingHeight: number | undefined;
		let lastPendingWidth: number | undefined;
		let confirmationWidgetLayoutHeight = 0;
		let displayedResource: string | undefined;
		const layout = () => {
			if (layingOut || !panel.classList.contains('shown')) {
				return;
			}
			layingOut = true;
			try {
				const width = Math.max(0, panel.clientWidth);
				if (lastPendingHeight === undefined || lastPendingWidth !== width) {
					if (lastPendingWidth !== width) {
						confirmationWidgetLayoutHeight = 0;
					}
					lastPendingWidth = width;
					widget.layout(lastPendingHeight ?? CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT, width);
				}
				const listBounds = list?.getBoundingClientRect();
				const renderedRows = list ? Array.from(list.querySelectorAll<HTMLElement>('.interactive-item-container')) : [];
				const renderedContentHeight = listBounds
					? renderedRows.reduce((height, row) => {
						const rowBounds = row.getBoundingClientRect();
						const confirmation = row.querySelector<HTMLElement>('.chat-confirmation-widget-container');
						const confirmationBounds = confirmation?.getBoundingClientRect();
						const paddingBottom = parseFloat(dom.getWindow(row).getComputedStyle(row).paddingBottom);
						const renderedDescendantBottom = confirmation
							? Array.from(confirmation.querySelectorAll<HTMLElement>('*')).reduce(
								(bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom),
								confirmationBounds?.bottom ?? 0,
							)
							: 0;
						const confirmationBottom = confirmationBounds
							? Math.max(confirmationBounds.top + (confirmation?.scrollHeight ?? 0), renderedDescendantBottom)
							: 0;
						const bottom = Math.max(rowBounds.bottom, confirmationBottom + paddingBottom);
						return Math.max(height, bottom - listBounds.top);
					}, 0)
					: 0;
				const contentHeight = panel.classList.contains('question') || renderedContentHeight === 0
					? widget.contentHeight
					: renderedContentHeight;
				const minimumHeight = panel.classList.contains('question') ? 1 : CHAT_INPUT_WINDOW_MIN_CONFIRMATION_HEIGHT;
				const measuredHeight = Math.min(CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT, Math.max(minimumHeight, Math.ceil(contentHeight)));
				// Approval content (diff summaries, risk badges, button rows) can
				// render after the first frame. Grow to accommodate it, but never
				// shrink this prompt and re-enter a resize oscillation.
				const height = panel.classList.contains('question')
					? measuredHeight
					: Math.max(lastPendingHeight ?? 0, measuredHeight);
				const heightChanged = height !== lastPendingHeight;
				if (heightChanged) {
					lastPendingHeight = height;
					parent.style.height = `${height}px`;
					this._fitWindowToContent();
				}
				if (panel.classList.contains('question') && heightChanged) {
					widget.layout(height, width);
				} else if (!panel.classList.contains('question') && height > confirmationWidgetLayoutHeight) {
					// Keep the virtual row constrained below the input/header, and
					// allow only monotonic growth when approval details render late.
					confirmationWidgetLayoutHeight = height;
					widget.layout(height, width);
					scheduleLayout();
				}
			} finally {
				layingOut = false;
			}
		};
		const scheduledLayout = this._windowDisposables.add(new MutableDisposable());
		const scheduleLayout = () => {
			scheduledLayout.value = dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, layout);
		};
		const showPendingModel = (index: number) => {
			if (pendingModels.length === 0) {
				this._pendingPromptIndex = 0;
				lastPendingHeight = undefined;
				lastPendingWidth = undefined;
				confirmationWidgetLayoutHeight = 0;
				displayedResource = undefined;
				this._activePendingSessionResource = undefined;
				this._voiceConfirmationPending.set(false, undefined);
				panel.classList.remove('shown', 'question');
				widget.setModel(undefined);
				this._fitWindowToContent();
				return;
			}
			this._pendingPromptIndex = (index + pendingModels.length) % pendingModels.length;
			const model = pendingModels[this._pendingPromptIndex];
			this._activePendingSessionResource = model.sessionResource;
			const resource = model.sessionResource.toString();
			if (displayedResource !== resource) {
				displayedResource = resource;
				lastPendingHeight = undefined;
				confirmationWidgetLayoutHeight = 0;
			}
			this._voiceConfirmationPending.set(true, undefined);
			panel.classList.add('shown');
			panel.classList.toggle('question', this._hasPendingQuestion(model));
			const hasMultiple = pendingModels.length > 1;
			const title = model.title || localize('chatInputWindow.pending.untitledSource', "Chat");
			label.textContent = hasMultiple
				? localize(
					'chatInputWindow.pending.sourceAndCount',
					"{0} — {1} of {2} waiting on you",
					title,
					this._pendingPromptIndex + 1,
					pendingModels.length,
				)
				: localize('chatInputWindow.pending.source', "{0} waiting on you", title);
			navigation.classList.toggle('hidden', !hasMultiple);
			for (const button of [previous, next]) {
				button.classList.toggle('disabled', !hasMultiple);
				button.setAttribute('aria-disabled', String(!hasMultiple));
				button.tabIndex = hasMultiple ? 0 : -1;
			}
			widget.setModel(model);
			scheduleLayout();
		};

		this._windowDisposables.add(dom.addDisposableListener(previous, dom.EventType.CLICK, () => showPendingModel(this._pendingPromptIndex - 1)));
		this._windowDisposables.add(dom.addDisposableListener(next, dom.EventType.CLICK, () => showPendingModel(this._pendingPromptIndex + 1)));
		this._windowDisposables.add(widget.onDidChangeContentHeight(scheduleLayout));
		const pendingMutationObserver = new auxiliaryWindow.window.MutationObserver(scheduleLayout);
		pendingMutationObserver.observe(widget.domNode, { childList: true, subtree: true, attributes: true });
		this._windowDisposables.add(toDisposable(() => pendingMutationObserver.disconnect()));
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', scheduleLayout));
		this._loadPendingSessionModels();
		this._windowDisposables.add(autorun(reader => {
			const currentResource = pendingModels[this._pendingPromptIndex]?.sessionResource.toString();
			const activeTarget = this.voiceSessionController.targetSession.read(reader)?.toString();
			pendingModels = [...this.chatService.chatModels.read(reader)]
				.filter(model => !!model.requestNeedsInput.read(reader))
				.sort((a, b) =>
					Number(b.sessionResource.toString() === activeTarget) - Number(a.sessionResource.toString() === activeTarget)
					|| Number(this._hasPendingQuestion(b)) - Number(this._hasPendingQuestion(a))
					|| b.lastMessageDate - a.lastMessageDate);
			const preservedIndex = currentResource
				? pendingModels.findIndex(model => model.sessionResource.toString() === currentResource)
				: -1;
			showPendingModel(preservedIndex >= 0 ? preservedIndex : Math.min(this._pendingPromptIndex, pendingModels.length - 1));
		}));
	}

	private _loadPendingSessionModels(): void {
		const refs = this._windowDisposables.add(new DisposableMap<string, IChatModelReference>());
		const loads = new Set<string>();
		const cts = new CancellationTokenSource();
		this._windowDisposables.add(toDisposable(() => cts.dispose(true)));
		const update = async () => {
			const pendingSessions = this.agentSessionsService.model.sessions
				.filter(session => !session.isArchived() && session.status === AgentSessionStatus.NeedsInput);
			const pendingKeys = new Set(pendingSessions.map(session => session.resource.toString()));
			for (const key of refs.keys()) {
				if (!pendingKeys.has(key)) {
					refs.deleteAndDispose(key);
				}
			}
			await Promise.all(pendingSessions.map(async session => {
				const key = session.resource.toString();
				if (this.chatService.getSession(session.resource) || refs.has(key) || loads.has(key)) {
					return;
				}
				loads.add(key);
				try {
					const ref = await this.chatService.acquireOrLoadSession(session.resource, ChatAgentLocation.Chat, cts.token, 'ChatInputWindow-pending');
					if (!ref) {
						return;
					}
					if (cts.token.isCancellationRequested || !this.agentSessionsService.model.sessions.some(candidate =>
						candidate.resource.toString() === key && candidate.status === AgentSessionStatus.NeedsInput && !candidate.isArchived())) {
						ref.dispose();
						return;
					}
					refs.set(key, ref);
				} catch (error) {
					if (!cts.token.isCancellationRequested) {
						this.logService.warn(`[chatInputWindow] Failed to load pending session ${key}:`, error);
					}
				} finally {
					loads.delete(key);
				}
			}));
		};
		this._windowDisposables.add(this.agentSessionsService.model.onDidChangeSessions(() => void update()));
		void update();
	}

	private _appendPendingNavigationButton(container: HTMLElement, icon: ThemeIcon, ariaLabel: string): HTMLElement {
		const button = dom.append(container, dom.$('a.chat-input-window-pending-navigation-button', {
			role: 'button',
			tabindex: '0',
			'aria-label': ariaLabel,
		}));
		button.appendChild(renderIcon(icon));
		this._windowDisposables.add(dom.addStandardDisposableListener(button, dom.EventType.KEY_DOWN, event => {
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				event.preventDefault();
				button.click();
			}
		}));
		return button;
	}

	private _hasPendingQuestion(model: IChatModel): boolean {
		return model.lastRequest?.response?.response.value.some(part => part.kind === 'questionCarousel' && !part.isUsed) ?? false;
	}

	private async _layoutForModelPicker(auxiliaryWindow: IAuxiliaryWindow, visible: boolean): Promise<void> {
		const win = auxiliaryWindow.window;
		if (visible) {
			if (this._actionWidgetRestoreHeight !== undefined) {
				return;
			}

			this._actionWidgetRestoreHeight = win.outerHeight;
			const desiredHeight = Math.max(win.outerHeight, CHAT_INPUT_WINDOW_MODEL_PICKER_HEIGHT);
			const windowChromeHeight = win.outerHeight - win.innerHeight;
			await auxiliaryWindow.setBounds({ x: win.screenX, y: win.screenY, width: win.outerWidth, height: desiredHeight });
			await this._waitForWindowHeight(auxiliaryWindow, desiredHeight - windowChromeHeight);
			win.focus();
		} else if (this._actionWidgetRestoreHeight !== undefined) {
			const restoreHeight = this._actionWidgetRestoreHeight;
			this._actionWidgetRestoreHeight = undefined;
			await auxiliaryWindow.setBounds({ x: win.screenX, y: win.screenY, width: win.outerWidth, height: restoreHeight });
			win.dispatchEvent(new win.Event('resize'));
		}
	}

	private async _waitForWindowHeight(auxiliaryWindow: IAuxiliaryWindow, minimumInnerHeight: number): Promise<void> {
		for (let attempt = 0; attempt < 30 && this._window === auxiliaryWindow; attempt++) {
			if (auxiliaryWindow.window.innerHeight >= minimumInnerHeight) {
				return;
			}
			await new Promise<void>(resolve => dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => resolve()));
		}
	}

	private _disposeWidget(): void {
		this.voiceSessionController.setOmniInputActive(false);
		this._routingController = undefined;
		this._widget = undefined;
		this._fitWindowToContent = () => { };
		this._row = undefined;
		this._lead = undefined;
		this._trail = undefined;
		this._activePendingSessionResource = undefined;
		this._voiceConfirmationPending.set(false, undefined);
		this._actionWidgetRestoreHeight = undefined;
		this._modelRef?.dispose();
		this._modelRef = undefined;
	}

	private _defaultBounds(): IRectangle {
		const invokingWindowBounds = this._invokingWindowBounds;
		// Match Quick Chat's width so the model-detail hover has room to sit
		// beside the picker: golden-cut of the invoking window, capped like the
		// quick input widget (MAX_WIDTH = 600).
		const width = this._defaultWidth();
		// Center the omni bar within the window that invoked it.
		const x = Math.round(invokingWindowBounds.x + (invokingWindowBounds.width - width) / 2);
		const y = Math.round(invokingWindowBounds.y + (invokingWindowBounds.height - CHAT_INPUT_WINDOW_DEFAULT_HEIGHT) / 2);
		return {
			x,
			y,
			width,
			height: CHAT_INPUT_WINDOW_DEFAULT_HEIGHT,
		};
	}

	private _defaultWidth(): number {
		const invokingWindowWidth = this._invokingWindowBounds.width > 0
			? this._invokingWindowBounds.width
			: mainWindow.outerWidth;
		const availableWidth = invokingWindowWidth > 0
			? invokingWindowWidth
			: CHAT_INPUT_WINDOW_MAX_WIDTH / 0.62;
		return Math.round(Math.min(availableWidth * 0.62, CHAT_INPUT_WINDOW_MAX_WIDTH));
	}

	private _windowBounds(window: Window): IRectangle {
		return {
			x: window.screenX,
			y: window.screenY,
			width: window.outerWidth,
			height: window.outerHeight,
		};
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(OmniChatEnabledSettingId) === true
			&& !this.chatEntitlementService.sentiment.hidden;
	}
}

registerSingleton(IChatInputWindowService, ChatInputWindowService, InstantiationType.Delayed);

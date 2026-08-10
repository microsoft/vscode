/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInputWindow.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
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
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { inputBackground, inputBorder } from '../../../../../platform/theme/common/colors/inputColors.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { localize } from '../../../../../nls.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatMode } from '../../common/chatModes.js';
import { IChatModelReference, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../sessionRouter/chatSessionRoutingController.js';
import { combineVoiceInput } from '../voiceClient/voiceInputUtils.js';
import { IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT, CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID } from '../../common/chatInputWindow.js';
import { autorun, IReader, observableValue } from '../../../../../base/common/observable.js';
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
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { derivePendingId, getVoiceToolApprovalCommand, isPendingIdResolved, markPendingIdResolved } from '../../common/voiceClient/voiceClientService.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';

const CHAT_INPUT_WINDOW_MODEL_PICKER_HEIGHT = 420;
const CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT = 44;
const CHAT_INPUT_WINDOW_MAX_WIDTH = 600;
const CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT = 360;
const CHAT_INPUT_WINDOW_MIN_CONFIRMATION_HEIGHT = 112;

function getDescendantElements(parent: HTMLElement, className?: string): HTMLElement[] {
	const result: HTMLElement[] = [];
	const visit = (element: HTMLElement) => {
		for (const child of element.children) {
			if (!dom.isHTMLElement(child)) {
				continue;
			}
			if (!className || child.classList.contains(className)) {
				result.push(child);
			}
			visit(child);
		}
	};
	visit(parent);
	return result;
}

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
	private readonly _actionWidgetWindow = this._register(new MutableDisposable<IAuxiliaryWindow>());
	private _actionWidgetLayoutGeneration = 0;
	private _actionWidgetVisibilityCount = 0;
	private _actionWidgetOpenOperation: Promise<void> | undefined;
	private _actionWidgetOwner: IAuxiliaryWindow | undefined;
	private _actionWidgetWindowAnchorY = 0;
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
		@IHostService private readonly hostService: IHostService,
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
		this._invokingWindowBounds = this._isUsableWindowBounds(invokingWindowBounds)
			? invokingWindowBounds
			: this._windowBounds(dom.getActiveWindow());
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
		this.voiceSessionController.setOmniInputOpen(true);

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
		this._renderChatWidget(auxiliaryWindow, row, bounds);
		const pendingActiveWindowSync = this._windowDisposables.add(new MutableDisposable());
		this._windowDisposables.add(autorun(reader => {
			const ownsVoice = this.voiceSessionController.omniInputActive.read(reader);
			if (ownsVoice || auxiliaryWindow.window.document.hasFocus()) {
				return;
			}
			pendingActiveWindowSync.value = dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => {
				const activeWindow = dom.getActiveWindow();
				if (activeWindow !== auxiliaryWindow.window) {
					this.voiceSessionController.setActiveWindow(activeWindow);
				}
			});
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
			this._storeWindowPosition(auxiliaryWindow);
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

		this._storeWindowPosition(this._window);
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

	private _renderChatWidget(auxiliaryWindow: IAuxiliaryWindow, row: HTMLElement, openingBounds: IRectangle): void {
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
				defaultMode: ChatMode.Agent,
				menus: { telemetrySource: 'chatInputWindow' },
				// Routing seam: intercept submission before local execution and
				// route it to the best-matching existing session (or a new one),
				// forwarding any explicit attachments on the input.
				submitHandler: (query, mode, attachedContext, isVoiceModeInput) => this._routingController?.handleSubmit(query, mode, attachedContext, isVoiceModeInput) ?? Promise.resolve(false),
				onDidChangeModelPickerVisibility: visible => this._setModelPickerVisible(auxiliaryWindow, visible),
				inputPickerPosition: AnchorPosition.BELOW,
				inputPickerContainer: () => this._actionWidgetWindow.value?.container,
				inputPickerAnchor: anchor => this._getModelPickerAnchor(anchor),
				inputPickerOpenOnMouseUp: true,
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
			getNewSessionTarget: () => AgentSessionProviders.AgentHostCopilot,
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
				const observerDisposables = this._windowDisposables.add(new DisposableStore());
				const resizeObserver = new auxiliaryWindow.window.ResizeObserver(() => fitWindowToInput());
				observerDisposables.add(toDisposable(() => resizeObserver.disconnect()));
				resizeObserver.observe(badge);
				const observer = new auxiliaryWindow.window.MutationObserver(() => {
					if (!badge.isConnected) {
						observerDisposables.dispose();
						fitWindowToInput();
					}
				});
				observerDisposables.add(toDisposable(() => observer.disconnect()));
				observer.observe(container, { childList: true });
			},
		};
		this._routingController = this._windowDisposables.add(this.instantiationService.createInstance(ChatSessionRoutingController, host, 'chatInputWindow'));

		// Fit the frameless window to the widget's own content and any routing
		// panel below it. Measuring the input container itself includes the
		// height the host assigned and creates a feedback loop with empty space.
		let lastContentHeight: number | undefined;
		let didInitialPosition = false;
		// Renderer screen coordinates lag native moves, so retain the requested
		// position until each queued bounds update has completed.
		let currentPosition = { x: openingBounds.x, y: openingBounds.y };
		let pendingBounds: IRectangle | undefined;
		let applyingBounds = false;
		const applyPendingBounds = async () => {
			if (applyingBounds) {
				return;
			}
			applyingBounds = true;
			try {
				while (pendingBounds && this._window === auxiliaryWindow) {
					const bounds = pendingBounds;
					pendingBounds = undefined;
					currentPosition = { x: bounds.x, y: bounds.y };
					await auxiliaryWindow.setBounds(bounds);
				}
			} finally {
				applyingBounds = false;
			}
		};
		fitWindowToInput = () => {
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
			if (!didInitialPosition) {
				didInitialPosition = true;
				const initialBounds = this._positionedBounds(width, contentHeight);
				currentPosition = { x: initialBounds.x, y: initialBounds.y };
			} else if (!applyingBounds) {
				currentPosition = { x: win.screenX, y: win.screenY };
			}
			pendingBounds = { ...currentPosition, width, height: contentHeight };
			void applyPendingBounds();
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
		const approvalFallback = dom.append(panel, dom.$('.chat-input-window-pending-approval-fallback'));
		const approvalTitle = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-title'));
		const approvalMessage = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-message'));
		const approvalCommand = dom.append(approvalFallback, dom.$('code.chat-input-window-pending-approval-command'));
		const approvalDisclaimer = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-disclaimer'));
		const approvalActions = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-actions'));
		const approvalActionDisposables = this._windowDisposables.add(new MutableDisposable<DisposableStore>());
		let lastActivatedApproval: string | undefined;
		let displayedApproval: { readonly invocation: IChatToolInvocation; readonly occurrence: string } | undefined;
		const renderApprovalFallback = (approval: typeof displayedApproval) => {
			approvalActionDisposables.value = new DisposableStore();
			approvalActions.replaceChildren();
			if (!approval) {
				return;
			}
			const state = approval.invocation.state.get();
			if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation
				&& state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
				return;
			}
			const messages = state.confirmationMessages;
			approvalTitle.textContent = renderAsPlaintext(messages?.title ?? approval.invocation.invocationMessage);
			approvalMessage.textContent = renderAsPlaintext(messages?.message ?? '');
			approvalMessage.classList.toggle('hidden', !approvalMessage.textContent);
			approvalCommand.textContent = getVoiceToolApprovalCommand(approval.invocation) ?? '';
			approvalCommand.classList.toggle('hidden', !approvalCommand.textContent);
			const approvalReason = messages?.approvalReason?.status === 'complete'
				? renderAsPlaintext(messages.approvalReason.explanation)
				: '';
			approvalDisclaimer.textContent = [renderAsPlaintext(messages?.disclaimer ?? ''), approvalReason].filter(Boolean).join('\n');
			approvalDisclaimer.classList.toggle('hidden', !approvalDisclaimer.textContent);

			const confirm = (reason: Parameters<typeof IChatToolInvocation.confirmWith>[1]) => {
				markPendingIdResolved(approval.occurrence);
				IChatToolInvocation.confirmWith(approval.invocation, reason);
			};
			const options = messages?.customOptions;
			if (options?.length) {
				for (const option of options) {
					const button = approvalActionDisposables.value.add(new Button(approvalActions, {
						...defaultButtonStyles,
						small: true,
						secondary: option.kind === ConfirmationOptionKind.Deny,
					}));
					button.label = option.label;
					approvalActionDisposables.value.add(button.onDidClick(() => confirm({
						type: ToolConfirmKind.UserAction,
						selectedButton: option.id,
						selectedButtonKind: option.kind,
					})));
				}
			} else {
				const allowButton = approvalActionDisposables.value.add(new Button(approvalActions, {
					...defaultButtonStyles,
					small: true,
				}));
				allowButton.label = messages?.confirmResults
					? localize('chatInputWindow.pending.allowAndReview', "Allow and Review Once")
					: localize('chatInputWindow.pending.allow', "Allow Once");
				approvalActionDisposables.value.add(allowButton.onDidClick(() => confirm({ type: ToolConfirmKind.UserAction })));
				const skipButton = approvalActionDisposables.value.add(new Button(approvalActions, {
					...defaultButtonStyles,
					small: true,
					secondary: true,
				}));
				skipButton.label = localize('chatInputWindow.pending.skip', "Skip");
				approvalActionDisposables.value.add(skipButton.onDidClick(() => confirm({ type: ToolConfirmKind.Skipped })));
			}
		};

		const parent = dom.append(panel, dom.$('.chat-input-window-pending-widget.interactive-session'));
		this._windowDisposables.add(dom.addDisposableListener(parent, dom.EventType.CLICK, event => {
			const approval = displayedApproval;
			const target = event.target;
			if (!approval || !(target instanceof auxiliaryWindow.window.Element) || !target.closest('.chat-confirmation-widget-buttons')) {
				return;
			}
			const state = approval.invocation.state.get();
			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
				|| state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				markPendingIdResolved(approval.occurrence);
			}
		}, { capture: true }));
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
		const list = widget.transcriptDomNode;

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
				for (const row of getDescendantElements(list, 'monaco-list-row')) {
					const confirmations = getDescendantElements(row, 'chat-confirmation-widget-container');
					const hasConfirmation = confirmations.length > 0;
					row.classList.toggle('chat-input-window-confirmation-row', hasConfirmation);
					for (const confirmation of confirmations) {
						confirmation.classList.toggle(
							'chat-input-window-modified-files-confirmation',
							getDescendantElements(confirmation, 'chat-modified-files-confirmation').length > 0,
						);
					}
					for (const value of getDescendantElements(row, 'value')) {
						value.classList.toggle('chat-input-window-confirmation-value', hasConfirmation);
					}
				}
				panel.classList.toggle('tool-approval-fallback', !!displayedApproval && !panel.classList.contains('question'));
				const width = Math.max(0, panel.clientWidth);
				if (lastPendingHeight === undefined || lastPendingWidth !== width) {
					if (lastPendingWidth !== width) {
						confirmationWidgetLayoutHeight = 0;
					}
					lastPendingWidth = width;
					widget.layout(lastPendingHeight ?? CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT, width);
				}
				const listBounds = list.getBoundingClientRect();
				const renderedRows = getDescendantElements(list, 'interactive-item-container');
				const renderedContentHeight = renderedRows.reduce((height, row) => {
					const rowBounds = row.getBoundingClientRect();
					const confirmation = getDescendantElements(row, 'chat-confirmation-widget-container')[0];
					const confirmationBounds = confirmation?.getBoundingClientRect();
					const paddingBottom = parseFloat(dom.getWindow(row).getComputedStyle(row).paddingBottom);
					const renderedDescendantBottom = confirmation
						? getDescendantElements(confirmation).reduce(
							(bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom),
							confirmationBounds?.bottom ?? 0,
						)
						: 0;
					const confirmationBottom = confirmationBounds
						? Math.max(confirmationBounds.top + (confirmation?.scrollHeight ?? 0), renderedDescendantBottom)
						: 0;
					const bottom = Math.max(rowBounds.bottom, confirmationBottom + paddingBottom);
					return Math.max(height, bottom - listBounds.top);
				}, 0);
				const isQuestion = panel.classList.contains('question');
				const questionContainer = isQuestion
					? getDescendantElements(parent, 'chat-question-carousel-widget-container').find(element => element.childElementCount > 0)
					: undefined;
				const questionContentHeight = questionContainer
					? questionContainer.getBoundingClientRect().bottom - parent.getBoundingClientRect().top
					: 0;
				const contentHeight = isQuestion
					? Math.max(widget.contentHeight, questionContentHeight)
					: renderedContentHeight || widget.contentHeight;
				const minimumHeight = isQuestion ? 1 : CHAT_INPUT_WINDOW_MIN_CONFIRMATION_HEIGHT;
				const measuredHeight = Math.min(CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT, Math.max(minimumHeight, Math.ceil(contentHeight)));
				// Approval content (diff summaries, risk badges, button rows) can
				// render after the first frame. Grow to accommodate it, but never
				// shrink this prompt and re-enter a resize oscillation.
				const height = isQuestion
					? measuredHeight
					: Math.max(lastPendingHeight ?? 0, measuredHeight);
				const heightChanged = height !== lastPendingHeight;
				if (heightChanged) {
					lastPendingHeight = height;
					parent.style.height = `${height}px`;
					this._fitWindowToContent();
				}
				if (isQuestion && heightChanged) {
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
				displayedApproval = undefined;
				renderApprovalFallback(undefined);
				lastActivatedApproval = undefined;
				this._activePendingSessionResource = undefined;
				this._voiceConfirmationPending.set(false, undefined);
				panel.classList.remove('shown', 'question', 'tool-approval-fallback');
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
			const hasPendingQuestion = this._hasPendingQuestion(model);
			const pendingApproval = this._getPendingToolApproval(model);
			displayedApproval = pendingApproval;
			renderApprovalFallback(pendingApproval);
			const omniVoiceActive = this.voiceSessionController.omniInputActive.get();
			if (!omniVoiceActive) {
				lastActivatedApproval = undefined;
			}
			panel.classList.toggle('question', hasPendingQuestion);
			panel.classList.toggle('tool-approval-fallback', !hasPendingQuestion && !!pendingApproval);
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
			if (pendingApproval && omniVoiceActive && pendingApproval.occurrence !== lastActivatedApproval) {
				// The pending card is the most direct observation that this exact
				// approval is visible in omni. Activate it once so a coalesced/missed
				// session-state transition cannot leave hands-free mode listening over
				// an unannounced confirmation. Voice narration dedup is occurrence-based,
				// so the normal state-change path and this UI path remain exactly-once.
				lastActivatedApproval = pendingApproval.occurrence;
				this.voiceSessionController.activateSession(model.sessionResource);
			}
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
			this.voiceSessionController.omniInputActive.read(reader);
			const currentResource = pendingModels[this._pendingPromptIndex]?.sessionResource.toString();
			const activeTarget = this.voiceSessionController.targetSession.read(reader)?.toString();
			pendingModels = [...this.chatService.chatModels.read(reader)]
				.filter(model => !!model.requestNeedsInput.read(reader) && !this._hasOnlyResolvedPendingTools(model, reader))
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

	private _hasOnlyResolvedPendingTools(model: IChatModel, reader: IReader): boolean {
		const request = model.lastRequest;
		const parts = request?.response?.response.value;
		if (!request || !parts) {
			return false;
		}
		let sawResolvedTool = false;
		for (const part of parts) {
			if (part.kind === 'questionCarousel' && !part.isUsed && !part.answeredExternally) {
				return false;
			}
			if (part.kind === 'elicitation2' && part.state.get() === 'pending') {
				return false;
			}
			if ((part.kind === 'planReview' || part.kind === 'confirmation') && !part.isUsed) {
				return false;
			}
			if (part.kind !== 'toolInvocation') {
				continue;
			}
			const state = part.state.get();
			if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation
				&& state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval
				&& state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
				continue;
			}
			const occurrence = derivePendingId(request.id, part, this._windowDisposables);
			if (!isPendingIdResolved(occurrence, reader)) {
				return false;
			}
			sawResolvedTool = true;
		}
		return sawResolvedTool;
	}

	private _getPendingToolApproval(model: IChatModel): { readonly invocation: IChatToolInvocation; readonly occurrence: string } | undefined {
		const request = model.lastRequest;
		const parts = request?.response?.response.value;
		if (!request || !parts) {
			return undefined;
		}
		for (const part of parts) {
			if (part.kind !== 'toolInvocation') {
				continue;
			}
			const state = part.state.get();
			if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation
				&& state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval
				&& state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
				continue;
			}

			const occurrence = derivePendingId(request.id, part, this._windowDisposables);
			if (!isPendingIdResolved(occurrence)) {
				return { invocation: part, occurrence };
			}
		}
		return undefined;
	}

	private _setModelPickerVisible(auxiliaryWindow: IAuxiliaryWindow, visible: boolean): Promise<void> {
		if (!visible) {
			if (this._actionWidgetOwner !== auxiliaryWindow) {
				return Promise.resolve();
			}
			this._actionWidgetVisibilityCount = Math.max(0, this._actionWidgetVisibilityCount - 1);
			if (this._actionWidgetVisibilityCount === 0) {
				this._actionWidgetLayoutGeneration++;
				this._actionWidgetOwner = undefined;
				this._actionWidgetWindow.clear();
			}
			return Promise.resolve();
		}

		if (this._actionWidgetOwner !== auxiliaryWindow) {
			this._actionWidgetLayoutGeneration++;
			this._actionWidgetVisibilityCount = 0;
			this._actionWidgetOwner = auxiliaryWindow;
			this._actionWidgetWindow.clear();
			this._actionWidgetOpenOperation = undefined;
		}
		this._actionWidgetVisibilityCount++;
		if (this._actionWidgetWindow.value) {
			return Promise.resolve();
		}
		if (this._actionWidgetOpenOperation) {
			return this._actionWidgetOpenOperation;
		}

		const generation = ++this._actionWidgetLayoutGeneration;
		const operation = this._openModelPickerWindow(auxiliaryWindow, generation);
		this._actionWidgetOpenOperation = operation;
		return operation.finally(() => {
			if (this._actionWidgetOpenOperation === operation) {
				this._actionWidgetOpenOperation = undefined;
			}
		});
	}

	private async _openModelPickerWindow(auxiliaryWindow: IAuxiliaryWindow, generation: number): Promise<void> {
		const sourceWindow = auxiliaryWindow.window;
		const screen = sourceWindow.screen;
		const display = (await this.hostService.getCursorScreenPoint())?.display ?? {
			x: sourceWindow.screenX,
			y: sourceWindow.screenY,
			width: screen.availWidth,
			height: screen.availHeight,
		};
		const height = Math.min(CHAT_INPUT_WINDOW_MODEL_PICKER_HEIGHT, display.height);
		const sourceBottom = sourceWindow.screenY + sourceWindow.outerHeight;
		const displayBottom = display.y + display.height;
		const displayRight = display.x + display.width;
		const placeBelow = sourceBottom + height <= displayBottom;
		const preferredY = placeBelow
			? sourceBottom
			: sourceWindow.screenY - height;
		const y = Math.min(Math.max(display.y, preferredY), displayBottom - height);
		const width = Math.min(sourceWindow.outerWidth, display.width);
		const x = Math.min(Math.max(display.x, sourceWindow.screenX), displayRight - width);
		const actionWidgetWindow = await this.auxiliaryWindowService.open({
			bounds: { x, y, width, height },
			alwaysOnTop: true,
			frameless: true,
			transparent: true,
			notResizable: true,
			disableFullscreen: true,
			nativeTitlebar: false,
			noBackgroundThrottling: true,
			backgroundColor: '#00000000',
		});
		await actionWidgetWindow.whenStylesHaveLoaded;
		if (generation !== this._actionWidgetLayoutGeneration || this._window !== auxiliaryWindow) {
			actionWidgetWindow.dispose();
			return;
		}

		actionWidgetWindow.window.document.body.style.setProperty('background-color', 'transparent', 'important');
		actionWidgetWindow.window.document.body.style.setProperty('margin', '0', 'important');
		actionWidgetWindow.container.style.backgroundColor = 'transparent';
		actionWidgetWindow.container.style.overflow = 'hidden';
		this._actionWidgetWindowAnchorY = placeBelow ? 0 : height;
		this._actionWidgetWindow.value = actionWidgetWindow;
	}

	private _getModelPickerAnchor(anchor: HTMLElement): IAnchor {
		const bounds = anchor.getBoundingClientRect();
		return {
			x: bounds.left,
			y: this._actionWidgetWindowAnchorY,
			width: bounds.width,
			height: 1,
		};
	}

	private _disposeWidget(): void {
		this.voiceSessionController.setOmniInputOpen(false);
		this.voiceSessionController.setOmniInputActive(false);
		this._routingController = undefined;
		this._widget = undefined;
		this._fitWindowToContent = () => { };
		this._row = undefined;
		this._lead = undefined;
		this._trail = undefined;
		this._activePendingSessionResource = undefined;
		this._voiceConfirmationPending.set(false, undefined);
		this._actionWidgetVisibilityCount = 0;
		this._actionWidgetOwner = undefined;
		this._actionWidgetOpenOperation = undefined;
		this._actionWidgetWindow.clear();
		this._actionWidgetLayoutGeneration++;
		this._modelRef?.dispose();
		this._modelRef = undefined;
	}

	private _defaultBounds(): IRectangle {
		// Match Quick Chat's width so the model-detail hover has room to sit
		// beside the picker: golden-cut of the invoking window, capped like the
		// quick input widget (MAX_WIDTH = 600).
		const width = this._defaultWidth();
		return this._positionedBounds(width, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT);
	}

	private _positionedBounds(width: number, height: number): IRectangle {
		const invoking = this._invokingWindowBounds;
		const stored = this.storageService.getObject<{ readonly offsetX: number; readonly offsetY: number }>(
			ChatInputWindowStorageKeys.WindowPosition,
			StorageScope.WORKSPACE,
		);
		const centeredX = invoking.x + (invoking.width - width) / 2;
		const centeredY = invoking.y + (invoking.height - height) / 2;
		const maxX = invoking.x + Math.max(0, invoking.width - width);
		const maxY = invoking.y + Math.max(0, invoking.height - height);
		const hasStoredPosition = stored
			&& Number.isFinite(stored.offsetX)
			&& Number.isFinite(stored.offsetY);
		const desiredX = hasStoredPosition ? invoking.x + stored.offsetX : centeredX;
		const desiredY = hasStoredPosition ? invoking.y + stored.offsetY : centeredY;
		return {
			x: Math.round(Math.min(Math.max(desiredX, invoking.x), maxX)),
			y: Math.round(Math.min(Math.max(desiredY, invoking.y), maxY)),
			width,
			height,
		};
	}

	private _storeWindowPosition(auxiliaryWindow: IAuxiliaryWindow): void {
		const bounds = auxiliaryWindow.createState().bounds;
		if (bounds?.x === undefined || bounds.y === undefined) {
			return;
		}
		this.storageService.store(
			ChatInputWindowStorageKeys.WindowPosition,
			JSON.stringify({
				offsetX: bounds.x - this._invokingWindowBounds.x,
				offsetY: bounds.y - this._invokingWindowBounds.y,
			}),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
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

	private _isUsableWindowBounds(bounds: IRectangle | undefined): bounds is IRectangle {
		return !!bounds
			&& Number.isFinite(bounds.x)
			&& Number.isFinite(bounds.y)
			&& Number.isFinite(bounds.width)
			&& Number.isFinite(bounds.height)
			&& bounds.width > 0
			&& bounds.height > 0;
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(OmniChatEnabledSettingId) === true
			&& !this.chatEntitlementService.sentiment.hidden;
	}
}

registerSingleton(IChatInputWindowService, ChatInputWindowService, InstantiationType.Delayed);

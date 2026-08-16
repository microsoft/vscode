/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInputWindow.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { DeferredPromise, disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindowService, IAuxiliaryWindow } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IRectangle } from '../../../../../platform/window/common/window.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { chartsOrange } from '../../../../../platform/theme/common/colors/chartsColors.js';
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
import { IChatInputWindowCIFailure, IChatInputWindowCIFailureProvider, IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT, CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID, getChatInputWindowBounds, IChatInputWindowPositionOffset } from '../../common/chatInputWindow.js';
import { autorun, IReader, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { AgentSessionStatus } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IVoiceSessionController } from '../voiceClient/voiceSessionController.js';
import { IMicCaptureService } from '../voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../voiceClient/ttsPlaybackService.js';
import { setupVoiceInputDecorations } from '../voiceClient/voiceInputDecorations.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { getQuickInputWidth } from '../../../../../platform/quickinput/browser/quickInputController.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionRoutingProviderService, OmniChatEnabledSettingId } from '../../common/sessionRouter.js';
import { QuickInputService } from '../../../../services/quickinput/browser/quickInputService.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { derivePendingId, getVoiceToolApprovalCommand, isPendingIdResolved, markPendingIdResolved } from '../../common/voiceClient/voiceClientService.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';

const CHAT_INPUT_WINDOW_ACTION_WIDGET_HEIGHT = 420;
const CHAT_INPUT_WINDOW_ACTION_WIDGET_WIDTH = 420;
const CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN = 4;
const CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT = 44;
const CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT = 360;
const CHAT_INPUT_WINDOW_MIN_CONFIRMATION_HEIGHT = 112;
const CHAT_INPUT_WINDOW_CONTEXT_PICKER_TRANSITION_DELAY = 100;

type ChatInputActionWidgetPlacement = 'above' | 'right';

interface IChatInputWindowPendingChat {
	readonly kind: 'chat';
	readonly id: string;
	readonly model: IChatModel;
}

interface IChatInputWindowPendingCIFailure {
	readonly kind: 'ciFailure';
	readonly id: string;
	readonly failure: IChatInputWindowCIFailure;
	readonly provider: IChatInputWindowCIFailureProvider;
}

type ChatInputWindowPendingItem = IChatInputWindowPendingChat | IChatInputWindowPendingCIFailure;

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
	private _pendingVoiceRoute: DeferredPromise<URI | false> | undefined;
	private readonly _pendingResolvedInteractionCheck = this._register(new MutableDisposable());
	private _pendingPromptIndex = 0;
	private _activePendingSessionResource: URI | undefined;
	private readonly _dismissedPendingRequests = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly _dismissedCIFailures = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly _ciFailureProviders = observableValue<readonly IChatInputWindowCIFailureProvider[]>(this, []);
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
	private _actionWidgetAnchorPosition = AnchorPosition.BELOW;
	private _actionWidgetPlacement: ChatInputActionWidgetPlacement = 'above';
	private readonly _contextPicker = this._register(new MutableDisposable<DisposableStore>());
	/** Bounds of the window that invoked omni, captured before the auxiliary window opens. */
	private _invokingWindowBounds: IRectangle = this._windowBounds(mainWindow);
	private _invokingWindow = mainWindow;

	get isOpen(): boolean {
		return !!this._window;
	}

	get hasFocus(): boolean {
		return this._window?.window.document.hasFocus() ?? false;
	}

	registerCIFailureProvider(provider: IChatInputWindowCIFailureProvider): IDisposable {
		this._ciFailureProviders.set([...this._ciFailureProviders.get(), provider], undefined);
		return toDisposable(() => {
			const providers = this._ciFailureProviders.get();
			const index = providers.indexOf(provider);
			if (index >= 0) {
				this._ciFailureProviders.set(providers.filter(candidate => candidate !== provider), undefined);
			}
		});
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
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IChatSessionRoutingProviderService private readonly routingProviderService: IChatSessionRoutingProviderService,
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
		this._dismissedCIFailures.set(new Set(
			this.storageService.getObject<readonly string[]>(ChatInputWindowStorageKeys.DismissedCIFailures, StorageScope.PROFILE, [])
		), undefined);

		const closeAndResetPositionWhenDisabled = () => {
			if (!this._isEnabled()) {
				this.closeWindow();
				this.storageService.remove(ChatInputWindowStorageKeys.WindowPositionOffset, StorageScope.WORKSPACE);
			}
		};
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(OmniChatEnabledSettingId)) {
				closeAndResetPositionWhenDisabled();
			}
		}));
		this._register(this.chatEntitlementService.onDidChangeSentiment(closeAndResetPositionWhenDisabled));
		closeAndResetPositionWhenDisabled();
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
		this._invokingWindow = dom.getActiveWindow();
		this._invokingWindowBounds = this._isUsableWindowBounds(invokingWindowBounds)
			? invokingWindowBounds
			: this._windowBounds(this._invokingWindow);
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
			disableMaximize: true,
			notResizable: true,
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
		const surface = dom.append(auxiliaryWindow.container, dom.$('.chat-input-window'));

		const workspace = this.workspaceContextService.getWorkspace();
		const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : '';
		auxiliaryWindow.window.document.title = projectName
			? localize('chatInputWindow.titleWithProject', "Chat Input — {0}", projectName)
			: localize('chatInputWindow.title', "Chat Input");
		auxiliaryWindow.container.style.overflow = 'hidden';
		auxiliaryWindow.window.document.body.classList.add('chat-input-window-body');
		auxiliaryWindow.window.document.body.style.setProperty('margin', '0', 'important');
		auxiliaryWindow.window.document.body.style.setProperty('overflow', 'hidden', 'important');

		this._windowDisposables.clear();

		const applyThemeColors = () => {
			const theme = this.themeService.getColorTheme();
			const surfaceColor = theme.getColor(inputBackground)?.toString() ?? '#3c3c3c';
			const border = theme.getColor(inputBorder)?.toString() ?? 'transparent';
			auxiliaryWindow.window.document.body.style.setProperty('background-color', 'transparent', 'important');
			surface.style.backgroundColor = surfaceColor;
			surface.style.border = `1px solid ${border}`;
		};

		surface.style.display = 'flex';
		surface.style.flex = '1 1 auto';
		surface.style.flexDirection = 'column';
		surface.style.minHeight = '0';

		const row = dom.append(surface, dom.$('.chat-input-window-row'));
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
		this._renderChatWidget(auxiliaryWindow, surface, row, bounds);
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
		close.appendChild(renderIcon(Codicon.closeSmall));
		this._windowDisposables.add(dom.addDisposableListener(close, dom.EventType.CLICK, () => this.closeWindow()));
		this._windowDisposables.add(dom.addStandardDisposableListener(close, dom.EventType.KEY_DOWN, event => {
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				event.preventDefault();
				this.closeWindow();
			}
		}));
		this._renderPendingPrompts(auxiliaryWindow, surface);

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

	async acceptVoiceInput(text: string): Promise<URI | false> {
		const window = this._window?.window;
		const widget = this._widget;
		if ((!window?.document.hasFocus() && !this.voiceSessionController.omniInputActive.get()) || !widget || !this._routingController) {
			return false;
		}

		this._completePendingVoiceRoute(false);
		const pendingRoute = new DeferredPromise<URI | false>();
		this._pendingVoiceRoute = pendingRoute;
		const routeTimeout = disposableTimeout(() => pendingRoute.complete(false), 30_000);
		try {
			await widget.acceptInput(combineVoiceInput(widget.getInput(), text), {
				preserveFocus: true,
				isVoiceModeInput: true,
			});
			return await pendingRoute.p;
		} finally {
			routeTimeout.dispose();
			if (this._pendingVoiceRoute === pendingRoute) {
				this._completePendingVoiceRoute(false);
			}
		}
	}

	private _completePendingVoiceRoute(resource: URI | false): void {
		const pendingRoute = this._pendingVoiceRoute;
		if (!pendingRoute) {
			return;
		}
		this._pendingVoiceRoute = undefined;
		void pendingRoute.complete(resource);
	}

	private _renderChatWidget(auxiliaryWindow: IAuxiliaryWindow, surface: HTMLElement, row: HTMLElement, openingBounds: IRectangle): void {
		this._dismissedPendingRequests.set(new Set(), undefined);
		// The glow CSS keys off `.monaco-workbench .interactive-session
		// .chat-input-container` - the aux container already tracks the
		// `monaco-workbench` class, so we only need the `.interactive-session`
		// wrapper here.
		const parent = dom.append(row, dom.$('.interactive-session'));
		parent.style.flex = '1 1 auto';
		parent.style.minWidth = '0';
		const editorOverflowWidgetsDomNode = dom.append(auxiliaryWindow.window.document.body, dom.$('.chat-editor-overflow.monaco-editor'));
		this._windowDisposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

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

		const widget: ChatWidget = this._windowDisposables.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ isQuickChat: true },
			{
				autoScroll: true,
				renderInputOnTop: true,
				renderStyle: 'compact',
				inputEditorMaxHeight: 250,
				renderGettingStartedTip: false,
				deferredNotificationsEnabled: false,
				// Show only the input box — drop every response list item.
				filter: () => false,
				enableImplicitContext: false,
				defaultMode: ChatMode.Agent,
				modelPickerSessionType: AgentSessionProviders.AgentHostCopilot,
				menus: { telemetrySource: 'chatInputWindow' },
				// Routing seam: intercept submission before local execution and
				// route it to the best-matching existing session (or a new one),
				// forwarding any explicit attachments on the input.
				submitHandler: (query, mode, attachedContext, isVoiceModeInput) => this._routingController?.handleSubmit(query, mode, attachedContext, isVoiceModeInput) ?? Promise.resolve(false),
				onDidChangeModelPickerVisibility: visible => this._setActionWidgetVisible(auxiliaryWindow, surface, undefined, visible, 'above'),
				inputPickerPosition: () => this._actionWidgetAnchorPosition,
				inputPickerContainer: () => this._actionWidgetWindow.value?.container,
				inputPickerAnchor: anchor => this._getActionWidgetAnchor(anchor),
				inputPickerOpenOnMouseUp: true,
				contextPicker: {
					prepare: (): Promise<IQuickInputService> => this._prepareContextPicker(auxiliaryWindow, surface, scopedContextKeyService, widget),
				},
				editorOverflowWidgetsDomNode,
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
				const inputValue = observableFromEvent(this, widget.inputEditor.onDidChangeModelContent, () => widget.getInput());
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
					glowContainer: surface,
					isActive: this.voiceSessionController.omniInputOpen,
					inputValue,
					isOwner: this.voiceSessionController.omniInputOpen,
				}));
			} catch (error) {
				this.logService.error('[chatInputWindow] Failed to initialize voice decorations', error);
			}
		}

		const modelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: 'ChatInputWindow' });
		this._modelRef = modelRef;
		widget.setModel(modelRef.object);
		widget.setInputPlaceholder(localize('chatInputWindow.inputPlaceholder', "Send a request to any session or folder..."));

		let fitWindowToInput = () => { };

		// Route submissions through the shared controller, inserting its advisory
		// panel below the input and excluding this window's scratch session from
		// the routing candidates so it can never route to itself.
		const host: IChatSessionRoutingHost = {
			widget,
			getOwnSessionResource: () => this._modelRef?.object.sessionResource,
			getRoutingProvider: () => this.routingProviderService.getProvider(),
			getPendingReplySessionResource: () => this._activePendingSessionResource,
			getSelectedModelLabel: () => widget.inputPart.selectedLanguageModel.get()?.metadata.name,
			onWillRoute: () => this.voiceSessionController.prepareForRoutingRequest(),
			onWillDispatchRoute: resource => this.voiceSessionController.markRoutedRequestPending(resource),
			onDidRejectRoute: (resource, isVoiceModeInput) => {
				if (resource) {
					this.voiceSessionController.clearRoutedRequest(resource);
				}
				if (isVoiceModeInput) {
					this._completePendingVoiceRoute(false);
				}
			},
			onDidResolveRoute: (resource, kind, isVoiceModeInput, requestId) => {
				if (resource) {
					this.voiceSessionController.markRoutedRequestPending(resource, requestId);
				}
				if (isVoiceModeInput) {
					this._completePendingVoiceRoute(resource ?? false);
				}
				this.commandService.executeCommand(CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID, resource?.toString(), kind).catch(() => { });
			},
			onDidDismissRoute: (resource, requestId) => {
				const dismissed = new Set(this._dismissedPendingRequests.get());
				dismissed.add(this._pendingRequestKey(resource, requestId));
				this._dismissedPendingRequests.set(dismissed, undefined);
				this.voiceSessionController.clearRoutedRequest(resource);
			},
			onDidChangeActionWidgetVisibility: (visible, anchor) => this._setActionWidgetVisible(auxiliaryWindow, surface, anchor, visible, 'right'),
			getActionWidgetContainer: () => this._actionWidgetWindow.value?.container,
			getActionWidgetAnchor: anchor => this._getActionWidgetAnchor(anchor),
			getActionWidgetAnchorPosition: () => this._actionWidgetAnchorPosition,
			pickFolder: async defaultUri => (await this.fileDialogService.showOpenDialog({
				title: localize('chatInputWindow.selectSessionFolder', "Select Folder for New Session"),
				openLabel: localize('chatInputWindow.selectFolder', "Select Folder"),
				canSelectFolders: true,
				canSelectFiles: false,
				canSelectMany: false,
				defaultUri,
			}))?.[0],
			placeBadge: (badge) => {
				const row = this._row;
				if (!surface.isConnected || !row) {
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
				observer.observe(surface, { childList: true });
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
		const getRowHeight = () => {
			let contentHeight = Math.ceil(widget.contentHeight);
			if (widget.attachmentModel.size > 0) {
				contentHeight += Math.max(0, CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT - widget.input.inputRowHeight);
			}
			return Math.max(CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT, contentHeight);
		};
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
			const width = this._defaultWidth();
			const rowHeight = getRowHeight();
			const extraHeight = Array.from(surface.children)
				.filter(child => child !== this._row)
				.reduce((height, child) => {
					const element = child as HTMLElement;
					const position = auxiliaryWindow.window.getComputedStyle(element).position;
					return position === 'absolute' || position === 'fixed'
						? height
						: height + element.offsetHeight;
				}, 0);
			const contentHeight = rowHeight + extraHeight + 4;
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
				const rowHeight = getRowHeight();
				widget.layoutForInputHeight(rowHeight, available);
				fitWindowToInput();
			} finally {
				layingOut = false;
			}
		};
		layout();
		this._windowDisposables.add(widget.onDidChangeContentHeight(() => fitWindowToInput()));
		const updateAttachmentLayout = () => {
			row.classList.toggle('has-attachments', widget.attachmentModel.size > 0);
			layout();
		};
		this._windowDisposables.add(widget.attachmentModel.onDidChange(updateAttachmentLayout));
		updateAttachmentLayout();
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
			const activeElement = auxiliaryWindow.window.document.activeElement;
			if (!activeElement
				|| activeElement === auxiliaryWindow.window.document.body
				|| activeElement === auxiliaryWindow.window.document.documentElement
				|| widget.inputEditor.getDomNode()?.contains(activeElement)) {
				widget.focusInput();
			}
			if (this.voiceSessionController.omniInputActive.get()) {
				this.voiceSessionController.setOmniInputActive(true);
				this.voiceSessionController.setActiveWindow(auxiliaryWindow.window);
			}
		}));
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', layout));
	}

	private _renderPendingPrompts(auxiliaryWindow: IAuxiliaryWindow, surface: HTMLElement): void {
		const panel = dom.append(surface, dom.$('.chat-input-window-pending-panel'));
		const header = dom.append(panel, dom.$('.chat-input-window-pending-header', { 'aria-live': 'polite' }));
		const marker = dom.append(header, dom.$('span.chat-input-window-pending-marker', { 'aria-hidden': 'true' }));
		marker.appendChild(renderIcon(Codicon.gripper));
		const label = dom.append(header, dom.$('span.chat-input-window-pending-label'));
		const navigation = dom.append(header, dom.$('.chat-input-window-pending-navigation'));
		const previous = this._appendPendingNavigationButton(navigation, Codicon.chevronLeft, localize('chatInputWindow.pending.previous', "Previous Item"));
		const next = this._appendPendingNavigationButton(navigation, Codicon.chevronRight, localize('chatInputWindow.pending.next', "Next Item"));
		const approvalFallback = dom.append(panel, dom.$('.chat-input-window-pending-approval-fallback'));
		const approvalTitle = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-title'));
		const approvalMessage = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-message'));
		const approvalCommand = dom.append(approvalFallback, dom.$('code.chat-input-window-pending-approval-command'));
		const approvalDisclaimer = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-disclaimer'));
		const approvalActions = dom.append(approvalFallback, dom.$('.chat-input-window-pending-approval-actions'));
		const ciFallback = dom.append(panel, dom.$('.chat-input-window-pending-ci-fallback'));
		const ciTitle = dom.append(ciFallback, dom.$('.chat-input-window-pending-ci-title'));
		const ciDetail = dom.append(ciFallback, dom.$('.chat-input-window-pending-ci-detail', { 'aria-live': 'polite' }));
		const ciActions = dom.append(ciFallback, dom.$('.chat-input-window-pending-ci-actions'));
		const approvalActionDisposables = this._windowDisposables.add(new MutableDisposable<DisposableStore>());
		const ciActionDisposables = this._windowDisposables.add(new MutableDisposable<DisposableStore>());
		let lastActivatedPendingItem: string | undefined;
		let displayedApproval: { readonly invocation: IChatToolInvocation; readonly occurrence: string } | undefined;
		let displayedPendingOccurrence: string | undefined;
		let displayedCIFailure: IChatInputWindowPendingCIFailure | undefined;
		let renderedCIFailureId: string | undefined;
		const renderCIFailure = (entry: IChatInputWindowPendingCIFailure | undefined) => {
			displayedCIFailure = entry;
			if (renderedCIFailureId !== entry?.id) {
				renderedCIFailureId = entry?.id;
				ciActionDisposables.value = new DisposableStore();
				ciActions.replaceChildren();
				if (entry) {
					const button = ciActionDisposables.value.add(new Button(ciActions, {
						title: localize('chatInputWindow.pending.fixCITooltip', "Fix failing CI checks"),
						...defaultButtonStyles,
						small: true,
						buttonBackground: asCssVariable(chartsOrange),
						buttonHoverBackground: `color-mix(in srgb, ${asCssVariable(chartsOrange)} 88%, black)`,
						buttonBorder: asCssVariable(chartsOrange),
					}));
					button.label = localize('chatInputWindow.pending.fixCI', "Fix CI");
					ciActionDisposables.value.add(button.onDidClick(() => {
						entry.provider.fixCI(entry.failure.sessionResource);
						this._widget?.focusInput();
					}));
					const dismissButton = ciActionDisposables.value.add(new Button(ciActions, {
						...defaultButtonStyles,
						small: true,
						secondary: true,
					}));
					dismissButton.label = localize('chatInputWindow.pending.dismissCI', "Dismiss");
					ciActionDisposables.value.add(dismissButton.onDidClick(() => {
						const dismissed = new Set(this._dismissedCIFailures.get());
						dismissed.add(entry.id);
						this._dismissedCIFailures.set(dismissed, undefined);
						this.storageService.store(
							ChatInputWindowStorageKeys.DismissedCIFailures,
							JSON.stringify([...dismissed].slice(-100)),
							StorageScope.PROFILE,
							StorageTarget.MACHINE,
						);
						this._widget?.focusInput();
					}));
				}
			}
			if (!entry) {
				ciTitle.textContent = '';
				ciDetail.textContent = '';
				return;
			}

			ciTitle.textContent = localize('chatInputWindow.pending.ciTitle', "CI is failing for {0}", entry.failure.label);
			ciDetail.textContent = localize(
				'chatInputWindow.pending.ciDetail',
				"{0} checks failed, {1} pending",
				entry.failure.failed,
				entry.failure.pending,
			);
		};
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
			const confirmationTitle = renderAsPlaintext(messages?.title ?? approval.invocation.invocationMessage);
			approvalTitle.textContent = confirmationTitle;
			const confirmationMessage = renderAsPlaintext(messages?.message ?? '');
			const showConfirmationMessage = !!confirmationMessage && confirmationMessage !== confirmationTitle;
			approvalMessage.textContent = showConfirmationMessage ? confirmationMessage : '';
			dom.setVisibility(showConfirmationMessage, approvalMessage);
			approvalCommand.textContent = getVoiceToolApprovalCommand(approval.invocation) ?? '';
			dom.setVisibility(!!approvalCommand.textContent, approvalCommand);
			const approvalReason = messages?.approvalReason?.status === 'complete'
				? renderAsPlaintext(messages.approvalReason.explanation)
				: '';
			approvalDisclaimer.textContent = [renderAsPlaintext(messages?.disclaimer ?? ''), approvalReason].filter(Boolean).join('\n');
			dom.setVisibility(!!approvalDisclaimer.textContent, approvalDisclaimer);

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
			if (!(target instanceof auxiliaryWindow.window.Element)) {
				return;
			}
			if (approval && target.closest('.chat-confirmation-widget-buttons')) {
				const state = approval.invocation.state.get();
				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
					|| state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					markPendingIdResolved(approval.occurrence);
				}
			}
			this._notifyPendingItemResolvedAfterInteraction();
		}, { capture: true }));
		this._windowDisposables.add(dom.addDisposableListener(parent, dom.EventType.KEY_DOWN, () => {
			this._notifyPendingItemResolvedAfterInteraction();
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
				rendererOptions: { questionCarouselFitContent: true },
				filter: item => isResponseVM(item) && (
					!!item.model.isPendingConfirmation.get()
					|| item.model.response.value.some(part => part.kind === 'questionCarousel' && !part.isUsed)
				),
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

		let pendingItems: readonly ChatInputWindowPendingItem[] = [];
		let layingOut = false;
		let lastPendingHeight: number | undefined;
		let lastPendingWidth: number | undefined;
		let confirmationWidgetLayoutHeight = 0;
		let displayedItemId: string | undefined;
		const layout = () => {
			if (layingOut || !panel.classList.contains('shown')) {
				return;
			}
			layingOut = true;
			try {
				if (displayedCIFailure) {
					this._fitWindowToContent();
					return;
				}
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
				const measuredHeight = isQuestion
					? Math.max(minimumHeight, Math.ceil(contentHeight))
					: Math.min(CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT, Math.max(minimumHeight, Math.ceil(contentHeight)));
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
		const showPendingItem = (index: number) => {
			if (pendingItems.length === 0) {
				this._pendingPromptIndex = 0;
				lastPendingHeight = undefined;
				lastPendingWidth = undefined;
				confirmationWidgetLayoutHeight = 0;
				displayedItemId = undefined;
				displayedApproval = undefined;
				displayedPendingOccurrence = undefined;
				renderApprovalFallback(undefined);
				renderCIFailure(undefined);
				lastActivatedPendingItem = undefined;
				this._activePendingSessionResource = undefined;
				panel.classList.remove('shown', 'question', 'tool-approval-fallback', 'ci-failure');
				widget.setModel(undefined);
				this._fitWindowToContent();
				return;
			}
			this._pendingPromptIndex = (index + pendingItems.length) % pendingItems.length;
			const item = pendingItems[this._pendingPromptIndex];
			if (displayedItemId !== item.id) {
				displayedItemId = item.id;
				lastPendingHeight = undefined;
				confirmationWidgetLayoutHeight = 0;
			}
			panel.classList.add('shown');

			const hasMultiple = pendingItems.length > 1;
			header.classList.toggle('hidden', !hasMultiple);
			label.textContent = hasMultiple
				? localize('chatInputWindow.pending.count', "Item {0} of {1}", this._pendingPromptIndex + 1, pendingItems.length)
				: '';
			navigation.classList.toggle('hidden', !hasMultiple);
			for (const button of [previous, next]) {
				button.classList.toggle('disabled', !hasMultiple);
				button.setAttribute('aria-disabled', String(!hasMultiple));
				button.tabIndex = hasMultiple ? 0 : -1;
			}

			if (item.kind === 'ciFailure') {
				this._activePendingSessionResource = undefined;
				displayedApproval = undefined;
				displayedPendingOccurrence = undefined;
				renderApprovalFallback(undefined);
				renderCIFailure(item);
				panel.classList.remove('question', 'tool-approval-fallback');
				panel.classList.add('ci-failure');
				widget.setModel(undefined);
				scheduleLayout();
				return;
			}

			const model = item.model;
			this._activePendingSessionResource = model.sessionResource;
			renderCIFailure(undefined);
			panel.classList.remove('ci-failure');
			const hasPendingQuestion = this._hasPendingQuestion(model);
			const pendingApproval = this._getPendingToolApproval(model);
			const pendingOccurrence = pendingApproval?.occurrence ?? this._getPendingQuestionOccurrence(model);
			displayedApproval = pendingApproval;
			displayedPendingOccurrence = pendingOccurrence;
			renderApprovalFallback(pendingApproval);
			const omniInputOpen = this.voiceSessionController.omniInputOpen.get();
			if (!omniInputOpen) {
				lastActivatedPendingItem = undefined;
			}
			panel.classList.toggle('question', hasPendingQuestion);
			panel.classList.toggle('tool-approval-fallback', !hasPendingQuestion && !!pendingApproval);
			widget.setModel(model);
			if (pendingOccurrence && omniInputOpen && pendingOccurrence !== lastActivatedPendingItem) {
				// The pending card is the most direct observation that this exact
				// question or approval is visible in omni. Activate it once so a
				// coalesced/missed state transition cannot leave a visible prompt
				// unannounced. Voice narration dedup is occurrence-based, so the
				// normal state-change path and this UI path remain exactly-once.
				lastActivatedPendingItem = pendingOccurrence;
				this.voiceSessionController.announceSessionInOmni(model.sessionResource);
			}
			scheduleLayout();
		};

		this._windowDisposables.add(dom.addDisposableListener(previous, dom.EventType.CLICK, () => showPendingItem(this._pendingPromptIndex - 1)));
		this._windowDisposables.add(dom.addDisposableListener(next, dom.EventType.CLICK, () => showPendingItem(this._pendingPromptIndex + 1)));
		this._windowDisposables.add(widget.onDidChangeContentHeight(scheduleLayout));
		const pendingMutationObserver = new auxiliaryWindow.window.MutationObserver(scheduleLayout);
		pendingMutationObserver.observe(widget.domNode, { childList: true, subtree: true, attributes: true });
		this._windowDisposables.add(toDisposable(() => pendingMutationObserver.disconnect()));
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', scheduleLayout));
		this._loadPendingSessionModels();
		this._windowDisposables.add(autorun(reader => {
			this.voiceSessionController.omniInputOpen.read(reader);
			const dismissedPendingRequests = this._dismissedPendingRequests.read(reader);
			const dismissedCIFailures = this._dismissedCIFailures.read(reader);
			const displayedResource = this._activePendingSessionResource;
			if (displayedResource && displayedPendingOccurrence) {
				const displayedModel = this.chatService.getSession(displayedResource);
				const currentOccurrence = displayedModel
					? this._getPendingToolApproval(displayedModel)?.occurrence ?? this._getPendingQuestionOccurrence(displayedModel)
					: undefined;
				if (currentOccurrence !== displayedPendingOccurrence) {
					this.voiceSessionController.notifyPendingItemResolved(displayedResource);
					displayedPendingOccurrence = undefined;
				}
			}
			const currentItemId = pendingItems[this._pendingPromptIndex]?.id;
			const activeTarget = this.voiceSessionController.targetSession.read(reader)?.toString();
			const pendingChats: IChatInputWindowPendingChat[] = [...this.chatService.chatModels.read(reader)]
				.filter(model => !!model.requestNeedsInput.read(reader) && !this._hasOnlyResolvedPendingTools(model, reader))
				.filter(model => !dismissedPendingRequests.has(this._pendingRequestKey(model.sessionResource, model.lastRequest?.id)))
				.sort((a, b) =>
					Number(b.sessionResource.toString() === activeTarget) - Number(a.sessionResource.toString() === activeTarget)
					|| Number(this._hasPendingQuestion(b)) - Number(this._hasPendingQuestion(a))
					|| b.lastMessageDate - a.lastMessageDate)
				.map(model => ({
					kind: 'chat',
					id: `chat:${this._pendingRequestKey(model.sessionResource, model.lastRequest?.id)}`,
					model,
				}));
			const ciFailures: IChatInputWindowPendingCIFailure[] = [];
			for (const provider of this._ciFailureProviders.read(reader)) {
				for (const failure of provider.failures.read(reader)) {
					const item: IChatInputWindowPendingCIFailure = {
						kind: 'ciFailure',
						id: `ci:${failure.sessionResource.toString()}:${failure.occurrenceId}`,
						failure,
						provider,
					};
					if (!dismissedCIFailures.has(item.id)) {
						ciFailures.push(item);
					}
				}
			}
			ciFailures.sort((a, b) => b.failure.updatedAt - a.failure.updatedAt);
			pendingItems = [...pendingChats, ...ciFailures];
			const preservedIndex = currentItemId
				? pendingItems.findIndex(item => item.id === currentItemId)
				: -1;
			showPendingItem(preservedIndex >= 0 ? preservedIndex : Math.min(this._pendingPromptIndex, pendingItems.length - 1));
		}));
	}

	private _notifyPendingItemResolvedAfterInteraction(): void {
		const resource = this._activePendingSessionResource;
		if (!resource) {
			return;
		}
		const model = this.chatService.getSession(resource);
		const occurrence = model
			? this._getPendingToolApproval(model)?.occurrence ?? this._getPendingQuestionOccurrence(model)
			: undefined;
		if (!occurrence) {
			return;
		}
		this._pendingResolvedInteractionCheck.value = disposableTimeout(() => {
			const currentModel = this.chatService.getSession(resource);
			const currentOccurrence = currentModel
				? this._getPendingToolApproval(currentModel)?.occurrence ?? this._getPendingQuestionOccurrence(currentModel)
				: undefined;
			if (currentOccurrence !== occurrence) {
				this.voiceSessionController.notifyPendingItemResolved(resource);
			}
		}, 0);
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

	private _pendingRequestKey(resource: URI, requestId: string | undefined): string {
		return `${resource.toString()}\0${requestId ?? ''}`;
	}

	private _hasPendingQuestion(model: IChatModel): boolean {
		return model.lastRequest?.response?.response.value.some(part => part.kind === 'questionCarousel' && !part.isUsed) ?? false;
	}

	private _getPendingQuestionOccurrence(model: IChatModel): string | undefined {
		const request = model.lastRequest;
		const question = request?.response?.response.value.find(part =>
			part.kind === 'questionCarousel' && !part.isUsed && !part.answeredExternally);
		return request && question ? derivePendingId(request.id, question, this._windowDisposables) : undefined;
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

	private _setActionWidgetVisible(auxiliaryWindow: IAuxiliaryWindow, surface: HTMLElement, anchor: HTMLElement | undefined, visible: boolean, placement: ChatInputActionWidgetPlacement): Promise<void> {
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
		const operation = this._openActionWidgetWindow(auxiliaryWindow, surface, anchor, generation, placement);
		this._actionWidgetOpenOperation = operation;
		return operation.finally(() => {
			if (this._actionWidgetOpenOperation === operation) {
				this._actionWidgetOpenOperation = undefined;
			}
		});
	}

	private async _prepareContextPicker(auxiliaryWindow: IAuxiliaryWindow, surface: HTMLElement, contextKeyService: IContextKeyService, widget: ChatWidget): Promise<IQuickInputService> {
		this._contextPicker.clear();
		await this._setActionWidgetVisible(auxiliaryWindow, surface, undefined, true, 'above');

		const actionWidgetWindow = this._actionWidgetWindow.value;
		if (!actionWidgetWindow) {
			throw new Error('Unable to open the chat input context picker window');
		}

		actionWidgetWindow.window.focus();
		await timeout(0);

		const pickerLayoutService: ILayoutService = {
			_serviceBrand: undefined,
			onDidLayoutMainContainer: Event.None,
			onDidLayoutContainer: Event.None,
			onDidLayoutActiveContainer: Event.None,
			onDidAddContainer: Event.None,
			onDidChangeActiveContainer: Event.None,
			get mainContainerDimension() {
				return { width: actionWidgetWindow.container.clientWidth, height: actionWidgetWindow.container.clientHeight };
			},
			get activeContainerDimension() {
				return this.mainContainerDimension;
			},
			mainContainer: actionWidgetWindow.container,
			activeContainer: actionWidgetWindow.container,
			containers: [actionWidgetWindow.container],
			getContainer: () => actionWidgetWindow.container,
			whenContainerStylesLoaded: () => actionWidgetWindow.whenStylesHaveLoaded,
			mainContainerOffset: { top: 0, quickPickTop: 0 },
			activeContainerOffset: { top: 0, quickPickTop: 0 },
			focus: () => actionWidgetWindow.window.focus(),
		};
		const services = new ServiceCollection(
			[IContextKeyService, contextKeyService],
			[ILayoutService, pickerLayoutService],
		);
		const scopedInstantiationService = this.instantiationService.createChild(services);
		const store = new DisposableStore();
		store.add(scopedInstantiationService);
		store.add(dom.addDisposableListener(actionWidgetWindow.window, dom.EventType.KEY_DOWN, event => {
			if (event.key !== 'Escape') {
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			this._contextPicker.clear();
		}, true));
		const quickInputService = store.add(scopedInstantiationService.createInstance(QuickInputService));
		services.set(IQuickInputService, quickInputService);

		const pendingHide = store.add(new MutableDisposable());
		const pendingLayout = store.add(new MutableDisposable());
		let picker: HTMLElement | undefined;
		const anchorPicker = () => {
			pendingLayout.value = dom.scheduleAtNextAnimationFrame(actionWidgetWindow.window, () => {
				if (picker) {
					if (picker.style.top !== 'auto') {
						picker.style.top = 'auto';
					}
					if (picker.style.bottom !== '0px') {
						picker.style.bottom = '0';
					}
				}
			});
		};
		const pickerObserver = new actionWidgetWindow.window.MutationObserver(mutations => {
			for (const mutation of mutations) {
				if (dom.isHTMLElement(mutation.target) && mutation.target.classList.contains('quick-input-widget')) {
					picker = mutation.target;
				}
				for (const node of mutation.addedNodes) {
					if (dom.isHTMLElement(node) && node.classList.contains('quick-input-widget')) {
						picker = node;
					}
				}
				for (const node of mutation.removedNodes) {
					if (picker && (node === picker || node.contains(picker))) {
						picker = undefined;
					}
				}
			}
			anchorPicker();
		});
		pickerObserver.observe(actionWidgetWindow.container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
		store.add(toDisposable(() => pickerObserver.disconnect()));
		store.add(quickInputService.onShow(() => {
			pendingHide.clear();
			anchorPicker();
		}));
		store.add(quickInputService.onHide(() => {
			pendingHide.value = disposableTimeout(() => {
				if (this._contextPicker.value === store) {
					this._contextPicker.clear();
				}
			}, CHAT_INPUT_WINDOW_CONTEXT_PICKER_TRANSITION_DELAY);
		}));
		store.add(toDisposable(() => {
			void this._setActionWidgetVisible(auxiliaryWindow, surface, undefined, false, 'above');
			if (this._window === auxiliaryWindow) {
				auxiliaryWindow.window.focus();
				widget.focusInput();
			}
		}));
		this._contextPicker.value = store;

		return quickInputService;
	}

	private async _openActionWidgetWindow(auxiliaryWindow: IAuxiliaryWindow, surface: HTMLElement, anchor: HTMLElement | undefined, generation: number, placement: ChatInputActionWidgetPlacement): Promise<void> {
		const sourceWindow = auxiliaryWindow.window;
		const [cursorScreenPoint, nativeSourceBounds] = await Promise.all([
			this.hostService.getCursorScreenPoint(),
			this.hostService.getWindowPosition(sourceWindow),
		]);
		const sourceBounds = nativeSourceBounds ?? {
			x: sourceWindow.screenX,
			y: sourceWindow.screenY,
			width: sourceWindow.outerWidth,
			height: sourceWindow.outerHeight,
		};
		const sourceSurfaceBounds = surface.getBoundingClientRect();
		const sourceTop = sourceBounds.y + sourceSurfaceBounds.top;
		const sourceRight = sourceBounds.x + sourceSurfaceBounds.right;
		const sourceAnchorBounds = anchor?.getBoundingClientRect();
		const screen = sourceWindow.screen;
		const display = cursorScreenPoint?.display ?? {
			x: sourceBounds.x,
			y: sourceBounds.y,
			width: screen.availWidth,
			height: screen.availHeight,
		};
		const displayBottom = display.y + display.height;
		const displayRight = display.x + display.width;
		const width = Math.min(
			placement === 'right' ? CHAT_INPUT_WINDOW_ACTION_WIDGET_WIDTH : sourceBounds.width,
			display.width
		);
		const availableAbove = Math.max(1, sourceTop - display.y - CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN);
		const height = Math.min(
			CHAT_INPUT_WINDOW_ACTION_WIDGET_HEIGHT,
			placement === 'above' ? availableAbove : display.height
		);
		const preferredX = placement === 'right'
			? sourceRight + CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN
			: sourceBounds.x;
		const preferredY = placement === 'right'
			? sourceBounds.y + (sourceAnchorBounds?.top ?? sourceSurfaceBounds.top)
			: sourceTop - height - CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN;
		const x = Math.min(Math.max(display.x, preferredX), displayRight - width);
		const y = Math.min(Math.max(display.y, preferredY), displayBottom - height);
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
		this._actionWidgetPlacement = placement;
		this._actionWidgetWindowAnchorY = placement === 'right' ? 0 : height;
		this._actionWidgetAnchorPosition = placement === 'right' ? AnchorPosition.BELOW : AnchorPosition.ABOVE;
		this._actionWidgetWindow.value = actionWidgetWindow;
	}

	private _getActionWidgetAnchor(anchor: HTMLElement): IAnchor {
		const bounds = anchor.getBoundingClientRect();
		return {
			x: this._actionWidgetPlacement === 'right' ? 0 : bounds.left,
			y: this._actionWidgetWindowAnchorY,
			width: bounds.width,
			height: 1,
		};
	}

	private _disposeWidget(): void {
		this._completePendingVoiceRoute(false);
		this._pendingResolvedInteractionCheck.clear();
		this.voiceSessionController.setOmniInputOpen(false);
		this.voiceSessionController.setOmniInputActive(false);
		this._routingController = undefined;
		this._widget = undefined;
		this._fitWindowToContent = () => { };
		this._row = undefined;
		this._lead = undefined;
		this._trail = undefined;
		this._activePendingSessionResource = undefined;
		this._contextPicker.clear();
		this._actionWidgetVisibilityCount = 0;
		this._actionWidgetOwner = undefined;
		this._actionWidgetOpenOperation = undefined;
		this._actionWidgetWindow.clear();
		this._actionWidgetLayoutGeneration++;
		this._modelRef?.dispose();
		this._modelRef = undefined;
	}

	private _defaultBounds(): IRectangle {
		return this._positionedBounds(this._defaultWidth(), CHAT_INPUT_WINDOW_DEFAULT_HEIGHT);
	}

	private _positionedBounds(width: number, height: number): IRectangle {
		const offset = this.storageService.getObject<IChatInputWindowPositionOffset>(
			ChatInputWindowStorageKeys.WindowPositionOffset,
			StorageScope.WORKSPACE,
		);
		const validOffset = offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) ? offset : undefined;
		const bounds = getChatInputWindowBounds(this._invokingWindowBounds, width, height, validOffset);
		const screen = this._invokingWindow.screen as Screen & { readonly availLeft?: number; readonly availTop?: number };
		const availableLeft = screen.availLeft;
		const availableTop = screen.availTop;
		if (typeof availableLeft !== 'number' || typeof availableTop !== 'number' || !Number.isFinite(availableLeft) || !Number.isFinite(availableTop) || screen.availWidth <= 0 || screen.availHeight <= 0) {
			return bounds;
		}
		return {
			...bounds,
			x: Math.min(Math.max(bounds.x, availableLeft), availableLeft + Math.max(0, screen.availWidth - width)),
			y: Math.min(Math.max(bounds.y, availableTop), availableTop + Math.max(0, screen.availHeight - height)),
		};
	}

	private _storeWindowPosition(auxiliaryWindow: IAuxiliaryWindow): void {
		const bounds = auxiliaryWindow.createState().bounds;
		if (bounds?.x === undefined || bounds.y === undefined) {
			return;
		}
		this.storageService.store(
			ChatInputWindowStorageKeys.WindowPositionOffset,
			JSON.stringify({
				x: bounds.x - this._invokingWindowBounds.x,
				y: bounds.y - this._invokingWindowBounds.y,
			} satisfies IChatInputWindowPositionOffset),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
	}

	private _defaultWidth(): number {
		const invokingWindowWidth = this._invokingWindowBounds.width > 0
			? this._invokingWindowBounds.width
			: mainWindow.outerWidth;
		return Math.round(getQuickInputWidth(invokingWindowWidth) * 1.1);
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

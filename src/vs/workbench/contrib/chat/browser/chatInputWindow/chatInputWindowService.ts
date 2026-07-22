/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
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
import { ChatWidget } from '../widget/chatWidget.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../sessionRouter/chatSessionRoutingController.js';
import { IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_WIDTH, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT } from '../../common/chatInputWindow.js';

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
	/** Parent element hosting the input widget; the routing badge is inserted just before it. */
	private _widgetParent: HTMLElement | undefined;
	/** Shared routing + advisory-badge behaviour; recreated per widget, torn down on close. */
	private _routingController: ChatSessionRoutingController | undefined;
	/** In-flight `openWindow()` operation, so concurrent toggles stay idempotent. */
	private _openOperation: Promise<void> | undefined;

	get isOpen(): boolean {
		return !!this._window;
	}

	constructor(
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		const ownershipChannel = new BroadcastChannel('chat-input-window-ownership');
		ownershipChannel.onmessage = (e) => {
			if (e.data?.type === 'claim' && this._window) {
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
	}

	async openWindow(): Promise<void> {
		if (this._window) {
			return;
		}
		// Coalesce concurrent open/toggle calls so we never create two aux windows.
		if (this._openOperation) {
			return this._openOperation;
		}
		this._openOperation = this._doOpenWindow();
		try {
			await this._openOperation;
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
			transparent: false,
			disableFullscreen: true,
			nativeTitlebar: false,
			noBackgroundThrottling: true,
			backgroundColor: this.themeService.getColorTheme().getColor(editorBackground)?.toString() ?? '#1e1e1e',
		});

		this._window = auxiliaryWindow;
		this._auxiliaryWindowRef.value = auxiliaryWindow;

		const workspace = this.workspaceContextService.getWorkspace();
		const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : '';
		auxiliaryWindow.window.document.title = projectName
			? localize('chatInputWindow.titleWithProject', "Chat Input — {0}", projectName)
			: localize('chatInputWindow.title', "Chat Input");

		auxiliaryWindow.container.style.overflow = 'hidden';
		auxiliaryWindow.window.document.body.style.setProperty('margin', '0', 'important');

		this._windowDisposables.clear();

		// Resolve theme colors so the aux window matches the chat input box, and
		// re-apply them on theme changes (a light/dark/high-contrast switch would
		// otherwise leave the window on the old inline colors).
		const applyThemeColors = () => {
			const theme = this.themeService.getColorTheme();
			const bgColor = theme.getColor(editorBackground)?.toString() ?? '#1e1e1e';
			const inputBg = theme.getColor(inputBackground)?.toString() ?? '#3C3C3C';
			const inputBd = theme.getColor(inputBorder)?.toString() ?? 'transparent';

			auxiliaryWindow.container.style.setProperty('--vscode-chat-input-window-background', bgColor);
			auxiliaryWindow.container.style.backgroundColor = inputBg;
			auxiliaryWindow.container.style.border = `1px solid ${inputBd}`;
			auxiliaryWindow.container.style.boxSizing = 'border-box';
			auxiliaryWindow.window.document.body.style.setProperty('background-color', inputBg, 'important');
		};
		applyThemeColors();
		this._windowDisposables.add(this.themeService.onDidColorThemeChange(() => applyThemeColors()));

		// A frameless window can only be dragged through a `-webkit-app-region:
		// drag` region, so add a dedicated handle strip above the input. Its
		// interactive descendants are marked no-drag inside the widget below.
		const dragHandle = dom.append(auxiliaryWindow.container, dom.$('.chat-input-window-drag-handle'));
		dragHandle.style.setProperty('-webkit-app-region', 'drag');
		dragHandle.style.height = '6px';
		dragHandle.style.width = '100%';
		dragHandle.style.flexShrink = '0';
		dragHandle.style.cursor = 'grab';
		auxiliaryWindow.container.style.display = 'flex';
		auxiliaryWindow.container.style.flexDirection = 'column';

		// Host the real chat input (dictation, voice mode, glow) by rendering a
		// compact ChatWidget. The response list is filtered out so only the input
		// box shows. Submission is intercepted via submitHandler (the routing
		// seam) and routed to the best-matching existing session.
		this._renderChatWidget(auxiliaryWindow);

		// Clean up when the user closes the window via OS controls. Guard by window
		// identity so a stale unload after a quick reopen can't tear down the new one.
		Event.once(auxiliaryWindow.onUnload)(() => {
			if (this._window !== auxiliaryWindow) {
				return;
			}
			this._disposeWidget();
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

	async toggleWindow(): Promise<void> {
		if (this.isOpen) {
			this.closeWindow();
		} else {
			this._ownershipChannel.postMessage({ type: 'claim' });
			await this.openWindow();
		}
	}

	private _renderChatWidget(auxiliaryWindow: IAuxiliaryWindow): void {
		// The glow CSS keys off `.monaco-workbench .interactive-session
		// .chat-input-container` — the aux container already tracks the
		// `monaco-workbench` class, so we only need the `.interactive-session`
		// wrapper here.
		const parent = dom.append(auxiliaryWindow.container, dom.$('.interactive-session'));
		parent.style.flex = '1 1 auto';
		parent.style.minHeight = '0';
		parent.style.width = '100%';
		this._widgetParent = parent;

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
				// Show only the input box — drop every response list item.
				filter: () => false,
				enableImplicitContext: false,
				defaultMode: ChatMode.Ask,
				menus: { inputSideToolbar: MenuId.ChatInputWindowSide, telemetrySource: 'chatInputWindow' },
				// Routing seam: intercept submission before local execution and
				// route it to the best-matching existing session (or a new one),
				// forwarding any explicit attachments on the input.
				submitHandler: (query, mode, attachedContext) => this._routingController?.handleSubmit(query, mode, attachedContext) ?? Promise.resolve(false),
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
		widget.setVisible(true);

		const modelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: 'ChatInputWindow' });
		this._modelRef = modelRef;
		widget.setModel(modelRef.object);

		// Route submissions through the shared controller, inserting its advisory
		// badge just above the input, and excluding this window's scratch session
		// from the routing candidates so it can never route to itself.
		const host: IChatSessionRoutingHost = {
			widget,
			getOwnSessionResource: () => this._modelRef?.object.sessionResource,
			placeBadge: (badge) => {
				const container = this._window?.container;
				if (container && this._widgetParent) {
					container.insertBefore(badge, this._widgetParent);
				}
			},
		};
		this._routingController = this._windowDisposables.add(this.instantiationService.createInstance(ChatSessionRoutingController, host, 'chatInputWindow'));

		const layout = () => widget.layout(parent.offsetHeight, parent.offsetWidth);
		layout();
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', layout));
		this._windowDisposables.add(widget.onDidChangeHeight(() => layout()));
	}

	private _disposeWidget(): void {
		this._routingController = undefined;
		this._widgetParent = undefined;
		this._modelRef?.dispose();
		this._modelRef = undefined;
	}

	private _defaultBounds(): IRectangle {
		// Center horizontally within the main VS Code window, near the bottom.
		const x = Math.round(mainWindow.screenX + (mainWindow.outerWidth - CHAT_INPUT_WINDOW_DEFAULT_WIDTH) / 2);
		const y = mainWindow.screenY + mainWindow.outerHeight - CHAT_INPUT_WINDOW_DEFAULT_HEIGHT - 100;
		return {
			x,
			y,
			width: CHAT_INPUT_WINDOW_DEFAULT_WIDTH,
			height: CHAT_INPUT_WINDOW_DEFAULT_HEIGHT,
		};
	}
}

registerSingleton(IChatInputWindowService, ChatInputWindowService, InstantiationType.Delayed);


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
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
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IVoiceSessionController } from '../voiceClient/voiceSessionController.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatMode } from '../../common/chatModes.js';
import { IChatModelReference, IChatService } from '../../common/chatService/chatService.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../sessionRouter/chatSessionRoutingController.js';
import { IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_WIDTH, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT } from '../../common/chatInputWindow.js';

import './media/chatInputWindow.css';

/** Floor for the fitted window, so a mid-layout measurement can't collapse it. */
const CHAT_INPUT_WINDOW_MIN_HEIGHT = 44;

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
	/** The hosted input widget, measured to size the window to its content. */
	private _widget: ChatWidget | undefined;
	/** The single input row: lead block plus the widget. Badges go above it. */
	private _row: HTMLElement | undefined;
	/** Scope block on the left; also the drag region. */
	private _lead: HTMLElement | undefined;
	/** Trailing chrome on the right, carrying the close control. */
	private _trail: HTMLElement | undefined;
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
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IVoiceSessionController private readonly voiceSessionController: IVoiceSessionController,
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
			// Transparent so the surface's rounded corners read against whatever
			// is behind the window rather than against a square of chrome.
			transparent: true,
			disableFullscreen: true,
			nativeTitlebar: false,
			noBackgroundThrottling: true,
			backgroundColor: '#00000000',
		});

		this._window = auxiliaryWindow;
		this._auxiliaryWindowRef.value = auxiliaryWindow;

		auxiliaryWindow.window.document.title = localize('chatInputWindow.title', "Chat Input");

		auxiliaryWindow.container.classList.add('chat-input-window');
		auxiliaryWindow.window.document.body.classList.add('chat-input-window-body');
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
		};
		applyThemeColors();
		this._windowDisposables.add(this.themeService.onDidColorThemeChange(() => applyThemeColors()));

		auxiliaryWindow.container.style.display = 'flex';
		auxiliaryWindow.container.style.flexDirection = 'column';

		// The bar is one row: a lead block naming what you are talking about,
		// then the input. The lead doubles as the drag region, so a frameless
		// window can be moved without spending a control on a grip — at this size
		// a grip glyph is indistinguishable from the session spinners anyway.
		const row = dom.append(auxiliaryWindow.container, dom.$('.chat-input-window-row'));
		const lead = dom.append(row, dom.$('.chat-input-window-lead'));
		lead.style.setProperty('-webkit-app-region', 'drag');
		this._row = row;
		this._lead = lead;

		// Host the real chat input (dictation, voice mode, glow) by rendering a
		// compact ChatWidget. The response list is filtered out so only the input
		// box shows. Submission is intercepted via submitHandler (the routing
		// seam) and routed to the best-matching existing session.
		this._renderChatWidget(auxiliaryWindow);

		// The way out belongs to the bar, not to the chat input inside it, so it
		// is rendered as trailing chrome. Borrowing the widget's side toolbar
		// coupled this window's width to the chat input's internal layout.
		const trail = dom.append(row, dom.$('.chat-input-window-trail'));
		const close = dom.append(trail, dom.$('a.chat-input-window-close', {
			role: 'button',
			tabindex: '0',
			'aria-label': localize('chatInputWindow.close.label', "Close"),
		}));
		close.appendChild(renderIcon(Codicon.close));
		this._windowDisposables.add(dom.addDisposableListener(close, dom.EventType.CLICK, () => this.closeWindow()));
		this._windowDisposables.add(dom.addDisposableListener(close, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				event.preventDefault();
				this.closeWindow();
			}
		}));
		this._trail = trail;

		// While either party is speaking there is no turn for you to submit, so
		// the arrow recedes rather than inviting a press it would not honour.
		this._windowDisposables.add(autorun(reader => {
			const state = this.voiceSessionController.voiceState.read(reader);
			const engaged = state === 'listening' || state === 'speaking';
			auxiliaryWindow.container.setAttribute('data-voice', engaged ? 'active' : 'idle');
		}));

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
		const parent = dom.append(this._row ?? auxiliaryWindow.container, dom.$('.interactive-session'));
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
		this._widget = widget;
		widget.render(parent);
		widget.setVisible(true);

		const modelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: 'ChatInputWindow' });
		this._modelRef = modelRef;
		widget.setModel(modelRef.object);
		// The mode's own description ("Explore and understand your code") describes
		// a panel you read answers in, and this bar takes anything — a command, a
		// file, a question, work for an agent. Naming the product instead of an
		// action keeps the invitation open, and since the bar floats over other
		// apps with no title bar and no workspace label, it is also the only
		// thing saying what you are typing into.
		widget.viewModel?.setInputPlaceholder(localize('chatInputWindow.placeholder', "Visual Studio Code chat"));

		// Route submissions through the shared controller, inserting its advisory
		// badge just above the input, and excluding this window's scratch session
		// from the routing candidates so it can never route to itself.
		const host: IChatSessionRoutingHost = {
			widget,
			getOwnSessionResource: () => this._modelRef?.object.sessionResource,
			placeBadge: (badge) => {
				const container = this._window?.container;
				if (container && this._row) {
					// Below the input, not above it: the list is a consequence of what
					// you just typed, and reading downward keeps the sentence first.
					this._row.after(badge);
					// The badge is a new row; grow to meet it, and shrink back when
					// it is removed.
					this._fitWindowToContent();
					const observer = new MutationObserver(() => {
						if (!badge.isConnected) {
							observer.disconnect();
							this._fitWindowToContent();
						}
					});
					observer.observe(container, { childList: true });
					this._windowDisposables.add(toDisposable(() => observer.disconnect()));
				}
			},
		};
		this._routingController = this._windowDisposables.add(this.instantiationService.createInstance(ChatSessionRoutingController, host, 'chatInputWindow'));

		// Lay the widget out against its own content height rather than the
		// window's, then size the window to match. Otherwise the input floats in
		// a fixed 110px box with dead space under it.
		const layout = () => {
			// Give the widget an explicit width rather than leaving it to flex: the
			// chat input's inner boxes overflow their parent instead of shrinking,
			// which pushes the close button past the window edge.
			const row = this._row;
			const chrome = (this._lead?.offsetWidth ?? 0) + (this._trail?.offsetWidth ?? 0);
			const available = row ? Math.max(0, row.clientWidth - chrome) : parent.offsetWidth;
			parent.style.width = `${available}px`;
			widget.layout(widget.contentHeight || parent.offsetHeight, available);
			this._fitWindowToContent();
		};
		layout();
		// The lead block's width depends on the workspace name, so the first
		// layout runs before the input knows how much room it actually has.
		// Re-measure once the row has settled, and whenever it changes size.
		this._windowDisposables.add(dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, layout));
		const observer = new auxiliaryWindow.window.ResizeObserver(() => layout());
		if (this._row) {
			observer.observe(this._row);
		}
		this._windowDisposables.add(toDisposable(() => observer.disconnect()));
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', layout));
		this._windowDisposables.add(widget.onDidChangeHeight(() => layout()));
	}

	/**
	 * Sizes the window to exactly what it is holding: the drag strip, any badge
	 * above the input, and the input itself. At rest that is a single row, and
	 * it grows only while something is actually there.
	 */
	private _fitWindowToContent(): void {
		const win = this._window?.window;
		const container = this._window?.container;
		const widget = this._widget;
		if (!win || !container || !widget) {
			return;
		}

		// The input's own content height, not the container's: the widget parent
		// flexes to fill the window, so measuring it would just report the height
		// we are trying to derive.
		let content = widget.contentHeight;
		for (const child of Array.from(container.children)) {
			if (child !== this._row) {
				content += (child as HTMLElement).offsetHeight;
			}
		}
		if (content <= 0) {
			return;
		}

		// The container is border-box with a 1px border, and a frameless window
		// has no chrome to account for beyond that.
		const desired = Math.max(Math.round(content + 2), CHAT_INPUT_WINDOW_MIN_HEIGHT);
		if (Math.abs(desired - win.outerHeight) < 2) {
			return;
		}

		// `window.resizeTo` is a no-op for auxiliary windows, so go through the
		// main process, which owns the BrowserWindow.
		void this.nativeHostService.positionWindow(
			{ x: win.screenX, y: win.screenY, width: win.outerWidth, height: desired },
			{ targetWindowId: win.vscodeWindowId },
		);
	}

	private _disposeWidget(): void {
		this._routingController = undefined;
		this._widget = undefined;
		this._row = undefined;
		this._lead = undefined;
		this._trail = undefined;
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


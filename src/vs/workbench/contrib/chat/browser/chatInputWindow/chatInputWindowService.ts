/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatInputWindow.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
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
import { IVoiceSessionController } from '../voiceClient/voiceSessionController.js';
import { IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT } from '../../common/chatInputWindow.js';

const CHAT_INPUT_WINDOW_MODEL_PICKER_HEIGHT = 420;
const CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT = 44;

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
	/** The single input row; routing results are inserted immediately after it. */
	private _row: HTMLElement | undefined;
	private _lead: HTMLElement | undefined;
	private _trail: HTMLElement | undefined;
	/** Shared routing + advisory-badge behaviour; recreated per widget, torn down on close. */
	private _routingController: ChatSessionRoutingController | undefined;
	/** In-flight `openWindow()` operation, so concurrent toggles stay idempotent. */
	private _openOperation: Promise<void> | undefined;
	private _actionWidgetRestoreHeight: number | undefined;
	/** The window that invoked the input window; used to center it on that window. */
	private _invokingWindow: CodeWindow = mainWindow;

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
		// Capture the window that invoked us (before the aux window steals focus)
		// so the input window is centered on it rather than always the main one.
		this._invokingWindow = dom.getActiveWindow();
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
		const dragGlyph = dom.append(lead, dom.$('span.chat-input-window-drag-glyph'));
		dom.append(dragGlyph, dom.$('span'));
		dom.append(dragGlyph, dom.$('span'));
		dom.append(dragGlyph, dom.$('span'));

		applyThemeColors();
		this._windowDisposables.add(this.themeService.onDidColorThemeChange(() => applyThemeColors()));

		// Host the real chat input (dictation, voice mode, glow) by rendering a
		// compact ChatWidget. The response list is filtered out so only the input
		// box shows. Submission is intercepted via submitHandler (the routing
		// seam) and routed to the best-matching existing session.
		this._renderChatWidget(auxiliaryWindow, row);

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
				// Show only the input box — drop every response list item.
				filter: () => false,
				enableImplicitContext: false,
				defaultMode: ChatMode.Ask,
				menus: { telemetrySource: 'chatInputWindow' },
				// Routing seam: intercept submission before local execution and
				// route it to the best-matching existing session (or a new one),
				// forwarding any explicit attachments on the input.
				submitHandler: (query, mode, attachedContext) => this._routingController?.handleSubmit(query, mode, attachedContext) ?? Promise.resolve(false),
				onDidChangeModelPickerVisibility: visible => this._layoutForModelPicker(auxiliaryWindow, visible),
				inputPickerPosition: AnchorPosition.BELOW,
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

		let fitWindowToInput = () => { };

		// Route submissions through the shared controller, inserting its advisory
		// panel below the input and excluding this window's scratch session from
		// the routing candidates so it can never route to itself.
		const host: IChatSessionRoutingHost = {
			widget,
			getOwnSessionResource: () => this._modelRef?.object.sessionResource,
			onDidResolveRoute: (resource, kind) => {
				if (this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get()) {
					this.voiceSessionController.setTargetSession(resource, kind);
				}
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
			const rowHeight = Math.max(CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT, Math.ceil(row.scrollHeight));
			const extraHeight = Array.from(auxiliaryWindow.container.children)
				.filter(child => child !== this._row)
				.reduce((height, child) => height + (child as HTMLElement).offsetHeight, 0);
			const contentHeight = rowHeight + extraHeight + 2;
			if (contentHeight === lastContentHeight) {
				return;
			}
			lastContentHeight = contentHeight;
			let x = win.screenX;
			let y = win.screenY;
			if (!didInitialPosition) {
				didInitialPosition = true;
				const invokingWindow = this._invokingWindow;
				x = Math.round(invokingWindow.screenX + (invokingWindow.outerWidth - win.outerWidth) / 2);
				y = Math.round(invokingWindow.screenY + (invokingWindow.outerHeight - contentHeight) / 2);
			}
			void auxiliaryWindow.setBounds({ x, y, width: win.outerWidth, height: contentHeight });
		};

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
		// Refresh editor focus when the auxiliary window becomes active.
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'focus', () => widget.focusInput()));
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', layout));
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
		this._routingController = undefined;
		this._row = undefined;
		this._lead = undefined;
		this._trail = undefined;
		this._actionWidgetRestoreHeight = undefined;
		this._modelRef?.dispose();
		this._modelRef = undefined;
	}

	private _defaultBounds(): IRectangle {
		const invokingWindow = this._invokingWindow;
		// Match Quick Chat's width so the model-detail hover has room to sit
		// beside the picker: golden-cut of the invoking window, capped like the
		// quick input widget (MAX_WIDTH = 600).
		const width = Math.round(Math.min(invokingWindow.innerWidth * 0.62, 600));
		// Center the omni bar within the window that invoked it.
		const x = Math.round(invokingWindow.screenX + (invokingWindow.outerWidth - width) / 2);
		const y = Math.round(invokingWindow.screenY + (invokingWindow.outerHeight - CHAT_INPUT_WINDOW_DEFAULT_HEIGHT) / 2);
		return {
			x,
			y,
			width,
			height: CHAT_INPUT_WINDOW_DEFAULT_HEIGHT,
		};
	}
}

registerSingleton(IChatInputWindowService, ChatInputWindowService, InstantiationType.Delayed);

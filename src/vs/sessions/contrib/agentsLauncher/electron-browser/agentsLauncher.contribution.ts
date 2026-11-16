/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsLauncher.css';
import * as dom from '../../../../base/browser/dom.js';
import { getZoomFactor } from '../../../../base/browser/browser.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, constObservable } from '../../../../base/common/observable.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { Context as SuggestContext } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { FocusMode, INativeHostService } from '../../../../platform/native/common/native.js';
import { InQuickInputContextKey } from '../../../../platform/quickinput/browser/quickInput.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { editorBackground } from '../../../../platform/theme/common/colors/editorColors.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { AGENTS_LAUNCHER_IPC_CHANNEL, IPoint, IRectangle } from '../../../../platform/window/common/window.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { AGENTS_LAUNCHER_COMMAND_ID } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { AbstractChatView, INewSessionDraftHost } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SharedChatInputComposer } from '../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposer.js';
import { ChatInputSupportsBackgroundContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SessionsCategories } from '../../../../workbench/contrib/sessions/common/categories.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { createSessionHostServices, ISessionHostService, SessionHost, SessionHostKind } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ChatWindowComposerBackgroundSends, ChatWindowComposerModel, createChatWindowComposerResource } from '../../../../workbench/contrib/sessions/browser/chatEditor/chatWindowComposer.js';
import { AgentsLauncherClickThrough, AgentsLauncherPresenter, computeAgentsLauncherLayout, DismissalCheck, dismissWhenAllowed, followOrdinarySend, IAgentsLauncherLayout } from './agentsLauncher.js';

const AGENTS_LAUNCHER_INITIAL_HEIGHT = 180;
const AGENTS_LAUNCHER_BLUR_HIDE_DELAY = 150;
/** How long the Agents Launcher stays transparent at most as it shows, waiting for its first frame. */
const AGENTS_LAUNCHER_REVEAL_TIMEOUT = 150;
/**
 * Whether the Agents Launcher's window is transparent around its card, with room for the composer's popups, and lets clicks through
 * there. Only on macOS: on Linux, transparency depends on the compositor and a window that lets clicks through receives no mouse
 * moves to stop; on Windows, some systems render transparent windows opaque black (electron/electron#40515).
 */
const AGENTS_LAUNCHER_TRANSPARENT = isMacintosh;
const HIDE_AGENTS_LAUNCHER_COMMAND_ID = 'workbench.action.hideAgentsLauncher';
const AGENTS_LAUNCHER_SEND_IN_BACKGROUND_COMMAND_ID = 'workbench.action.agentsLauncher.sendInBackground';

const AgentsLauncherFocusContext = new RawContextKey<boolean>('agentsLauncherFocus', false, localize('agentsLauncherFocus', "Whether focus is inside the Agents Launcher"));

export const IAgentsLauncherService = createDecorator<IAgentsLauncherService>('agentsLauncherService');

/** Controls the Agents Launcher: the Agents window's persistent composer and its auxiliary window. */
export interface IAgentsLauncherService {
	readonly _serviceBrand: undefined;
	readonly isVisible: IObservable<boolean>;
	/** Shows and focuses the Agents Launcher. */
	show(): Promise<void>;
	/** Hides the Agents Launcher while preserving its draft. */
	hide(): Promise<void>;
	/** Shows or hides the Agents Launcher. */
	toggle(): Promise<void>;
	/** Starts the composer's session in the background and keeps the Agents Launcher open, with a status that can open the session. */
	sendInBackground(): Promise<void>;
}

/** Returns whether a context view is visible, optionally in one particular window. */
function isContextViewVisible(contextViewService: IContextViewService, targetWindow?: Window): boolean {
	const element = contextViewService.getContextViewElement();
	return element.style.display !== 'none' && (!targetWindow || dom.getWindow(element) === targetWindow);
}

/** The display the Agents Launcher shows on, and its work area, which leaves out its menu bar and dock. */
interface IAgentsLauncherDisplay {
	readonly bounds: IRectangle;
	readonly workArea: IRectangle;
}

/** Returns whether two window bounds are identical. */
function equalBounds(first: IRectangle | undefined, second: IRectangle): boolean {
	return !!first && first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height;
}

function containsPoint(bounds: IRectangle, point: IPoint): boolean {
	return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

/** Resolves once `targetWindow` has rendered a frame since the call, or after a timeout should it render none. */
function whenRendered(targetWindow: Window): Promise<unknown> {
	// The second callback runs once the frame of the first one has been produced.
	return raceTimeout(new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => targetWindow.requestAnimationFrame(() => resolve()))), AGENTS_LAUNCHER_REVEAL_TIMEOUT);
}

/** Hosts the existing new-session composer in a reusable, always-on-top auxiliary window. */
export class AgentsLauncherService extends Disposable implements IAgentsLauncherService {

	declare readonly _serviceBrand: undefined;

	private readonly _presenter = new AgentsLauncherPresenter({
		getWindowId: () => this._window?.window.vscodeWindowId,
		prepare: () => this._prepareToShow(),
		setOpacity: (targetWindowId, opacity) => this._nativeHostService.setWindowOpacity(opacity, { targetWindowId }),
		position: async targetWindowId => {
			if (this._lastLayout) {
				await this._nativeHostService.positionWindow(this._lastLayout.window, { targetWindowId });
			}
		},
		show: targetWindowId => {
			this._logService.trace(`[AgentsLauncher] Showing window=${targetWindowId}`);
			// Not a forced focus: that activates the whole application, while a panel takes focus without activating it.
			return this._nativeHostService.showWindow({ targetWindowId });
		},
		focus: () => this._focusComposer(),
		whenRendered: async () => {
			if (this._window) {
				await whenRendered(this._window.window);
			}
		},
		hide: async targetWindowId => {
			this._logService.trace(`[AgentsLauncher] Hiding window=${targetWindowId}`);
			// Where the pointer was is no longer known once hidden.
			this._clickThrough?.resetPointer(undefined);
			await this._nativeHostService.hideWindow({ targetWindowId });
			// Only once hidden, so that the composer does not change on screen, and unless shown again meanwhile. It stays
			// rendered, but is a foreground chat only while the Agents Launcher is visible.
			if (!this._presenter.visible.get()) {
				this._view?.setVisible(false);
			}
		},
	});
	readonly isVisible: IObservable<boolean> = this._presenter.visible;

	private readonly _auxiliaryWindow = this._register(new MutableDisposable<IAuxiliaryWindow>());
	private readonly _windowDisposables = this._register(new DisposableStore());
	private readonly _blurHide = this._register(new MutableDisposable());
	private readonly _focusRequest = this._register(new MutableDisposable());
	/** Opens the session of the last send that leaves the Agents Launcher, once it has started. */
	private readonly _pendingOpen = this._register(new MutableDisposable());
	private readonly _backgroundSends: ChatWindowComposerBackgroundSends;
	private readonly _composer: ChatWindowComposerModel;
	private readonly _draftHost: INewSessionDraftHost;

	private _window: IAuxiliaryWindow | undefined;
	private _windowCreation: Promise<IAuxiliaryWindow> | undefined;
	/** The element in the Agents Launcher's window that the composer renders into. */
	private _surface: HTMLElement | undefined;
	private _view: AbstractChatView | undefined;
	private _clickThrough: AgentsLauncherClickThrough | undefined;
	private _display: IAgentsLauncherDisplay | undefined;
	private _lastLayout: IAgentsLauncherLayout | undefined;
	private _contentHeight = AGENTS_LAUNCHER_INITIAL_HEIGHT;

	constructor(
		@IAuxiliaryWindowService private readonly _auxiliaryWindowService: IAuxiliaryWindowService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IThemeService private readonly _themeService: IThemeService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChatViewFactory private readonly _chatViewFactory: IChatViewFactory,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ISessionHostService private readonly _sessionHostService: ISessionHostService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._backgroundSends = this._register(this._instantiationService.createInstance(ChatWindowComposerBackgroundSends));
		const composer = this._composer = this._register(this._instantiationService.createInstance(
			ChatWindowComposerModel,
			createChatWindowComposerResource(),
			{},
			this._backgroundSends,
			session => this._openStartedSession(session),
		));
		// The composer sends in the background, so that a failure gives its prompt back here. A send the user did not ask to
		// send in the background, as Send in Background does, also leaves the Agents Launcher for the Agents window.
		this._draftHost = {
			slot: composer.slot,
			input: composer.input,
			requestedTarget: composer.requestedTarget,
			setRequestedTarget: (target, reason) => composer.setRequestedTarget(target, reason),
			openStartedSession: session => composer.openStartedSession(session),
			trackBackgroundSend: send => {
				const tracking = composer.trackBackgroundSend(send);
				return send.requestedInBackground ? tracking : combinedDisposable(tracking, this._openWhenStarted(send.session));
			},
		};

		this._register(this._nativeHostService.onDidBlurMainOrAuxiliaryWindow(windowId => this._onWindowBlur(windowId)));
		if (AGENTS_LAUNCHER_TRANSPARENT) {
			this._register(this._nativeHostService.onDidChangeDisplay(() => void this._onDidChangeDisplay().catch(error => this._logService.error('[AgentsLauncher] Failed to lay out for the displays', error))));
		}
		this._register(this._nativeHostService.onDidFocusMainOrAuxiliaryWindow(windowId => {
			if (windowId === this._window?.window.vscodeWindowId) {
				this._blurHide.clear();
			}
		}));
		this._register(this._chatEntitlementService.onDidChangeSentiment(() => {
			if (this._chatEntitlementService.sentiment.hidden) {
				this._destroyWindow('AI features hidden');
			}
		}));
		const enabledKeys = new Set([ChatContextKeys.enabled.key]);
		this._register(this._contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(enabledKeys) && !this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled)) {
				this._destroyWindow('Chat disabled');
			}
		}));
	}

	/** Shows, positions, and focuses the Agents Launcher. */
	show(): Promise<void> {
		return this._presenter.show();
	}

	/** Lays out the composer for a show, creating its window should there be none: resolves to the window to show, if any. */
	private async _prepareToShow(): Promise<number | undefined> {
		if (!this._isEnabled()) {
			this._logService.trace('[AgentsLauncher] Show ignored because Chat is disabled');
			return undefined;
		}

		const { display: bounds, workArea } = await this._nativeHostService.getCursorScreenPoint();
		const display = this._display = { bounds, workArea };
		// Created at the zoom level of the Agents window.
		const auxiliaryWindow = await this._ensureWindow(this._computeLayout(display, getZoomFactor(mainWindow)));
		if (!this._isEnabled()) {
			this._destroyWindow('Chat disabled while opening');
			return undefined;
		}

		const view = this._view;
		if (auxiliaryWindow !== this._window || !view) {
			return undefined;
		}

		// Sized for the composer as it shows: its content can change while hidden, and on creation before it is first measured.
		// Visible first, since its chat widget is hidden while it is, which collapses its input.
		view.setVisible(true);
		view.setActive(true);
		const inputContent = view.inputContentElement;
		if (inputContent && this._surface) {
			this._contentHeight = this._measureContentHeight(this._surface, inputContent);
		}
		const layout = this._computeLayout(display, getZoomFactor(auxiliaryWindow.window));
		this._lastLayout = layout;
		this._layoutView(auxiliaryWindow, view, layout);
		const clickThrough = this._clickThrough;
		if (clickThrough) {
			// Where the pointer is now, rather than as the show began, before which the window may have been created. Until it moves,
			// clicks go through should it rest outside what the launcher renders.
			const version = clickThrough.pointerVersion;
			const { point } = await this._nativeHostService.getCursorScreenPoint();
			if (auxiliaryWindow !== this._window) {
				return undefined;
			}
			clickThrough.resetPointer(this._pointerInWindow(auxiliaryWindow, layout.window, point), version);
		}
		return auxiliaryWindow.window.vscodeWindowId;
	}

	/** Where `point`, in the display's coordinates, is in the window laid out at `bounds`, in its CSS pixels, should it be over it. */
	private _pointerInWindow(auxiliaryWindow: IAuxiliaryWindow, bounds: IRectangle, point: IPoint): { readonly x: number; readonly y: number } | undefined {
		if (!containsPoint(bounds, point)) {
			return undefined;
		}
		const zoomFactor = getZoomFactor(auxiliaryWindow.window);
		return { x: (point.x - bounds.x) / zoomFactor, y: (point.y - bounds.y) / zoomFactor };
	}

	/** Tells the click-through where a pointer at rest now is in the window, whose zoom or bounds changed beneath it. */
	private async _relocatePointer(auxiliaryWindow: IAuxiliaryWindow): Promise<void> {
		const clickThrough = this._clickThrough;
		if (!clickThrough || !this._presenter.visible.get()) {
			return;
		}
		const version = clickThrough.pointerVersion;
		const { point } = await this._nativeHostService.getCursorScreenPoint();
		const layout = this._lastLayout;
		if (auxiliaryWindow === this._window && layout && this._presenter.visible.get()) {
			clickThrough.relocatePointer(this._pointerInWindow(auxiliaryWindow, layout.window, point), version);
		}
	}

	/** Lays a shown transparent window out again for the displays as they now are, as it keeps the size it was laid out for. */
	private async _onDidChangeDisplay(): Promise<void> {
		const auxiliaryWindow = this._window;
		const surface = this._surface;
		const inputContent = this._view?.inputContentElement;
		// A hidden window is laid out again as it shows.
		if (!auxiliaryWindow || !surface || !inputContent || !this._presenter.visible.get()) {
			return;
		}
		const { display: bounds, workArea } = await this._nativeHostService.getCursorScreenPoint();
		if (auxiliaryWindow === this._window && this._presenter.visible.get()) {
			this._display = { bounds, workArea };
			// Positioned again even should its layout not change, as the system may have moved or resized it.
			this._lastLayout = undefined;
			await this._resizeToContent(auxiliaryWindow, surface, inputContent);
		}
	}

	private _computeLayout(display: IAgentsLauncherDisplay, zoomFactor: number): IAgentsLauncherLayout {
		return computeAgentsLauncherLayout(display.bounds, display.workArea, this._contentHeight, zoomFactor, AGENTS_LAUNCHER_TRANSPARENT);
	}

	/** Lays the composer out for `layout`, which is in the display's coordinates rather than the window's CSS pixels. */
	private _layoutView(auxiliaryWindow: IAuxiliaryWindow, view: AbstractChatView, layout: IAgentsLauncherLayout): void {
		const zoomFactor = getZoomFactor(auxiliaryWindow.window);
		const { window, card } = layout;
		if (AGENTS_LAUNCHER_TRANSPARENT && this._surface) {
			this._surface.style.left = `${(card.x - window.x) / zoomFactor}px`;
			this._surface.style.top = `${(card.y - window.y) / zoomFactor}px`;
			this._surface.style.width = `${card.width / zoomFactor}px`;
			this._surface.style.height = `${card.height / zoomFactor}px`;
		}
		view.layout(card.width / zoomFactor, card.height / zoomFactor, 0, 0);
	}

	private _focusComposer(): void {
		const auxiliaryWindow = this._window;
		const view = this._view;
		if (auxiliaryWindow && view) {
			view.focus();
			this._focusRequest.value = dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => view.focus());
		}
	}

	/** Hides the Agents Launcher without discarding its draft or closing its window. */
	hide(): Promise<void> {
		this._blurHide.clear();
		this._focusRequest.clear();
		// Hiding hides the window only: the composer stays rendered, so that it shows again exactly as it was, without a stale frame.
		return this._presenter.hide();
	}

	/** Toggles the Agents Launcher while retaining the same composer and draft slot. */
	toggle(): Promise<void> {
		return this._presenter.visible.get() ? this.hide() : this.show();
	}

	async sendInBackground(): Promise<void> {
		const widget = this._getChatWidget();
		await (widget && SharedChatInputComposer.getBackgroundComposer(widget))?.submit(true);
	}

	/** The chat widget of the composer in the Agents Launcher's window. */
	private _getChatWidget(): IChatWidget | undefined {
		const container = this._window?.container;
		return container && this._chatWidgetService.getAllWidgets().find(widget => dom.isAncestor(widget.domNode, container));
	}

	private _isEnabled(): boolean {
		return !this._chatEntitlementService.sentiment.hidden && this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled);
	}

	/** Resolves to the Agents Launcher's window, which concurrent shows create once. */
	private _ensureWindow(layout: IAgentsLauncherLayout): Promise<IAuxiliaryWindow> {
		if (this._window) {
			return Promise.resolve(this._window);
		}
		this._windowCreation ??= this._createWindow(layout).finally(() => {
			this._windowCreation = undefined;
		});
		return this._windowCreation;
	}

	private async _createWindow(layout: IAgentsLauncherLayout): Promise<IAuxiliaryWindow> {
		this._logService.trace('[AgentsLauncher] Creating auxiliary window');
		const backgroundColor = this._themeService.getColorTheme().getColor(editorBackground)?.toString() ?? '#1E1E1E';
		const auxiliaryWindow = await this._auxiliaryWindowService.open({
			bounds: layout.window,
			frameless: true,
			alwaysOnTop: true,
			panel: true,
			// Transparent until the first show has painted it, as every show is.
			opacity: 0,
			disableFullscreen: true,
			disableMaximize: true,
			nativeTitlebar: false,
			// A transparent window is not resized but laid out, as resizing can break its transparency, and the card draws its own shadow.
			...(AGENTS_LAUNCHER_TRANSPARENT ? { transparent: true, notResizable: true, noShadow: true } : { backgroundColor }),
		});
		await auxiliaryWindow.whenStylesHaveLoaded;

		this._windowDisposables.clear();
		this._auxiliaryWindow.value = auxiliaryWindow;
		this._window = auxiliaryWindow;
		try {
			this._renderComposer(auxiliaryWindow, layout);
		} catch (error) {
			// Never leave an empty floating window behind.
			this._destroyWindow('Failed to render the composer');
			throw error;
		}
		return auxiliaryWindow;
	}

	private _renderComposer(auxiliaryWindow: IAuxiliaryWindow, layout: IAgentsLauncherLayout): void {
		const title = localize('agentsLauncher.title', "Agents Launcher");
		auxiliaryWindow.window.document.title = title;
		// An element of its own rather than the window's container, whose classes follow those of the Agents window's container.
		const surface = dom.append(auxiliaryWindow.container, dom.$('.agents-launcher', { role: 'dialog', 'aria-label': title }));
		this._windowDisposables.add(toDisposable(() => surface.remove()));
		this._surface = surface;
		if (AGENTS_LAUNCHER_TRANSPARENT) {
			// An attribute rather than a class, which would follow those of the Agents window's container too.
			auxiliaryWindow.container.setAttribute('data-agents-launcher-transparent', '');
			this._trackClickThrough(auxiliaryWindow, surface);
		}

		const scopedContextKeyService = this._windowDisposables.add(this._contextKeyService.createScoped(auxiliaryWindow.container));
		const focusContext = AgentsLauncherFocusContext.bindTo(scopedContextKeyService);
		this._windowDisposables.add(toDisposable(() => focusContext.reset()));
		const focusTracker = this._windowDisposables.add(dom.trackFocus(auxiliaryWindow.container));
		this._windowDisposables.add(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._windowDisposables.add(focusTracker.onDidBlur(() => focusContext.set(false)));

		// The composer's UI injects the host it is in: a window host of its own, which shows the composer's draft.
		const host = new SessionHost({
			kind: SessionHostKind.ChatWindow,
			parent: undefined,
			session: this._composer.session,
			chat: constObservable(undefined),
			windowId: constObservable(auxiliaryWindow.window.vscodeWindowId),
			contextKeyService: scopedContextKeyService,
		});
		this._windowDisposables.add(this._sessionHostService.registerHost(host));
		const scopedInstantiationService = this._windowDisposables.add(this._instantiationService.createChild(createSessionHostServices(scopedContextKeyService, host)));
		const view = this._windowDisposables.add(this._chatViewFactory.createNewChatView(false, {
			backgroundSend: true,
			newSessionDraft: this._draftHost,
			session: this._composer.session,
			hostVisible: constObservable(true),
			// Kept rendered while hidden, it is a foreground chat only while visible.
			hideChatWidgetWhileHidden: true,
			renderChatPet: false,
			renderAquarium: false,
		}, scopedInstantiationService));
		this._view = view;
		surface.appendChild(view.element);
		view.setActive(true);
		view.setVisible(true);
		this._layoutView(auxiliaryWindow, view, layout);

		this._windowDisposables.add(auxiliaryWindow.onDidLayout(dimension => {
			if (AGENTS_LAUNCHER_TRANSPARENT) {
				// A transparent window keeps the size it was laid out for, which it cannot be resized from and is laid out again for as
				// displays change: a change of its zoom changes the CSS pixels of the card, and of the pointer in it.
				this._layoutView(auxiliaryWindow, view, this._lastLayout ?? layout);
				void this._relocatePointer(auxiliaryWindow).catch(error => this._logService.error('[AgentsLauncher] Failed to locate the pointer', error));
			} else {
				// The window is the card, at the size the user or the system resized it to.
				view.layout(dimension.width, dimension.height, 0, 0);
			}
		}));
		// A keyboard submit acts on the chat widget focused last, which a widget of the main window can become while this
		// composer keeps the keyboard focus. Reclaim it before the keybinding service, which listens on the window, resolves
		// the key. Only for keys typed into the input, which focusing the input then leaves focused rather than moving focus.
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.container, dom.EventType.KEY_DOWN, () => {
			const lastFocused = this._chatWidgetService.lastFocusedWidget;
			if (lastFocused && dom.isAncestor(lastFocused.domNode, auxiliaryWindow.container)) {
				return;
			}
			const widget = this._getChatWidget();
			if (widget?.inputEditor.hasTextFocus()) {
				this._logService.trace('[AgentsLauncher] Reclaiming the focused chat widget');
				widget.focusInput();
			}
		}, true));
		this._windowDisposables.add(Event.once(auxiliaryWindow.onUnload)(() => this._onWindowUnload(auxiliaryWindow)));

		const inputContent = view.inputContentElement;
		if (inputContent) {
			const resizeObserver = this._windowDisposables.add(new dom.DisposableResizeObserver(
				'AgentsLauncher.inputContent',
				() => void this._resizeToContent(auxiliaryWindow, surface, inputContent).catch(error => this._logService.error('[AgentsLauncher] Failed to resize', error)),
				dom.getWindow(inputContent),
			));
			this._windowDisposables.add(resizeObserver.observe(inputContent));
			this._windowDisposables.add(dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => void this._resizeToContent(auxiliaryWindow, surface, inputContent).catch(error => this._logService.error('[AgentsLauncher] Failed to resize', error))));
		}
	}

	/** Lets clicks through the transparent window where it renders nothing. */
	private _trackClickThrough(auxiliaryWindow: IAuxiliaryWindow, surface: HTMLElement): void {
		const targetWindowId = auxiliaryWindow.window.vscodeWindowId;
		const clickThrough = this._clickThrough = this._windowDisposables.add(new AgentsLauncherClickThrough(
			auxiliaryWindow.container,
			surface,
			ignore => void this._nativeHostService.setWindowIgnoreMouseEvents(ignore, { targetWindowId }).catch(error => this._logService.error('[AgentsLauncher] Failed to let clicks through', error)),
			// Hides the launcher as a click that goes through does. With a popup open, the click closes only the popup, which loses focus to it.
			() => {
				if (!this._hasOwnedPopupOpen()) {
					void this.hide().catch(error => this._logService.error('[AgentsLauncher] Failed to hide after a click outside', error));
				}
			},
		));
		this._windowDisposables.add(toDisposable(() => {
			if (this._clickThrough === clickThrough) {
				this._clickThrough = undefined;
			}
		}));
	}

	private async _resizeToContent(auxiliaryWindow: IAuxiliaryWindow, surface: HTMLElement, inputContent: HTMLElement): Promise<void> {
		// A hidden window is sized again as it shows.
		if (auxiliaryWindow !== this._window || !this._display || !this._presenter.visible.get()) {
			return;
		}
		this._contentHeight = this._measureContentHeight(surface, inputContent);
		const layout = this._computeLayout(this._display, getZoomFactor(auxiliaryWindow.window));
		const previous = this._lastLayout;
		if (previous && equalBounds(previous.window, layout.window) && equalBounds(previous.card, layout.card)) {
			return;
		}
		this._lastLayout = layout;
		// A transparent window has room for the card to grow in, so that typing resizes the card only.
		const moved = !equalBounds(previous?.window, layout.window);
		if (moved) {
			await this._nativeHostService.positionWindow(layout.window, { targetWindowId: auxiliaryWindow.window.vscodeWindowId });
		}
		if (this._view) {
			this._layoutView(auxiliaryWindow, this._view, layout);
		}
		if (moved) {
			await this._relocatePointer(auxiliaryWindow);
		}
		const { card } = layout;
		this._logService.trace(`[AgentsLauncher] Resized card=${card.x},${card.y},${card.width},${card.height}`);
	}

	/**
	 * The height in CSS pixels the card needs to fit the composer with the insets the stylesheet gives it: above it as
	 * laid out, below it the view's bottom padding and the surface's border.
	 */
	private _measureContentHeight(surface: HTMLElement, inputContent: HTMLElement): number {
		const contentRect = inputContent.getBoundingClientRect();
		const contentTop = contentRect.top - surface.getBoundingClientRect().top;
		const contentHeight = Math.max(inputContent.scrollHeight, contentRect.height);
		const below = (this._view ? parseFloat(dom.getComputedStyle(this._view.element).paddingBottom) : 0) + parseFloat(dom.getComputedStyle(surface).borderBottomWidth);
		return Math.ceil(contentTop + contentHeight + below);
	}

	private _onWindowBlur(windowId: number): void {
		const auxiliaryWindow = this._window;
		if (!auxiliaryWindow || windowId !== auxiliaryWindow.window.vscodeWindowId || !this._presenter.visible.get()) {
			return;
		}
		// Focusing the launcher again or hiding it clears the check; until then, a send or a popup of the launcher only defers hiding.
		this._blurHide.value = dismissWhenAllowed(() => {
			if (auxiliaryWindow !== this._window || !this._presenter.visible.get() || auxiliaryWindow.window.document.hasFocus()) {
				return DismissalCheck.Keep;
			}
			return this._composer.input.get().attempt || this._hasOwnedPopupOpen() ? DismissalCheck.Defer : DismissalCheck.Dismiss;
		}, AGENTS_LAUNCHER_BLUR_HIDE_DELAY, () => void this.hide().catch(error => this._logService.error('[AgentsLauncher] Failed to hide after blur', error)));
	}

	private _hasOwnedPopupOpen(): boolean {
		return !!this._quickInputService.currentQuickInput || !!this._window && isContextViewVisible(this._contextViewService, this._window.window);
	}

	private async _openStartedSession(session: ISession): Promise<void> {
		this._logService.trace(`[AgentsLauncher] Opening started session=${session.sessionId}`);
		this._pendingOpen.clear();
		await this.hide();
		try {
			await this._sessionsService.openSession(session.resource, { source: 'chat', forceMainChat: true });
		} finally {
			await this._nativeHostService.focusWindow({ mode: FocusMode.Force, targetWindowId: mainWindow.vscodeWindowId });
		}
	}

	/**
	 * Leaves the Agents Launcher for the Agents window as the send of `draft` goes out, and opens its session there as soon as it
	 * has started. A failure is reported there, and the prompt goes back into the Agents Launcher's composer. Disposing the result,
	 * as the composer does for a send it does not dispatch, stays in the Agents Launcher.
	 */
	private _openWhenStarted(draft: ISession): IDisposable {
		const pending = followOrdinarySend(this._sessionsManagementService, this._composer.slot, draft, {
			leave: () => {
				this._logService.trace(`[AgentsLauncher] Opening session=${draft.sessionId} once it has started`);
				void (async () => {
					await this.hide();
					await this._nativeHostService.focusWindow({ mode: FocusMode.Force, targetWindowId: mainWindow.vscodeWindowId });
				})().catch(error => this._logService.error('[AgentsLauncher] Failed to show the Agents window', error));
			},
			open: session => {
				void this._sessionsService.openSession(session.resource, { source: 'chat', forceMainChat: true })
					.catch(error => this._logService.error('[AgentsLauncher] Failed to open the started session', error));
			},
		});
		this._pendingOpen.value = pending;
		return toDisposable(() => {
			if (this._pendingOpen.value === pending) {
				this._pendingOpen.clear();
			}
		});
	}

	private _onWindowUnload(auxiliaryWindow: IAuxiliaryWindow): void {
		if (auxiliaryWindow !== this._window) {
			return;
		}
		this._logService.trace(`[AgentsLauncher] Auxiliary window closed window=${auxiliaryWindow.window.vscodeWindowId}`);
		this._window = undefined;
		this._surface = undefined;
		this._view = undefined;
		this._display = undefined;
		this._lastLayout = undefined;
		this._presenter.reset();
		this._blurHide.clear();
		this._focusRequest.clear();
		this._windowDisposables.clear();
		this._auxiliaryWindow.clear();
	}

	private _destroyWindow(reason: string): void {
		const auxiliaryWindow = this._window;
		if (!auxiliaryWindow) {
			return;
		}
		this._logService.trace(`[AgentsLauncher] Disposing auxiliary window: ${reason}`);
		this._window = undefined;
		this._surface = undefined;
		this._view = undefined;
		this._display = undefined;
		this._lastLayout = undefined;
		this._presenter.reset();
		this._blurHide.clear();
		this._focusRequest.clear();
		this._windowDisposables.clear();
		this._auxiliaryWindow.clear();
	}

	override dispose(): void {
		this._destroyWindow('Agents window disposed');
		super.dispose();
	}
}

/** Toggles the Agents Launcher when an editor window, such as the owner of a system-wide keybinding, asks the Agents window to. */
class AgentsLauncherContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.agentsLauncher';

	constructor(
		@IAgentsLauncherService agentsLauncherService: IAgentsLauncherService,
		@ILogService logService: ILogService,
	) {
		super();
		const handleToggle = () => {
			void agentsLauncherService.toggle().catch(error => logService.error('[AgentsLauncher] Failed to handle IPC toggle', error));
		};
		ipcRenderer.on(AGENTS_LAUNCHER_IPC_CHANNEL, handleToggle);
		this._register(toDisposable(() => ipcRenderer.removeListener(AGENTS_LAUNCHER_IPC_CHANNEL, handleToggle)));
	}
}

registerSingleton(IAgentsLauncherService, AgentsLauncherService, InstantiationType.Delayed);
registerWorkbenchContribution2(AgentsLauncherContribution.ID, AgentsLauncherContribution, WorkbenchPhase.BlockStartup);

registerAction2(class ShowAgentsLauncherAction extends Action2 {
	constructor() {
		super({
			id: AGENTS_LAUNCHER_COMMAND_ID,
			title: localize2('showAgentsLauncher', "Show Agents Launcher"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IAgentsLauncherService).toggle();
	}
});

registerAction2(class SendInBackgroundFromAgentsLauncherAction extends Action2 {
	constructor() {
		super({
			id: AGENTS_LAUNCHER_SEND_IN_BACKGROUND_COMMAND_ID,
			title: localize2('agentsLauncherSendInBackground', "Start Session in Background"),
			f1: false,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatInputSupportsBackgroundContext,
				ChatContextKeys.inputHasSendableContent,
				ChatContextKeys.inputBlocked.negate(),
				ChatContextKeys.chatSessionOptionsValid,
			),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				secondary: [KeyMod.Alt | KeyCode.Enter],
				when: ContextKeyExpr.and(AgentsLauncherFocusContext, ChatContextKeys.inChatInput),
				// Above the chat input's own Send in Background, which takes Cmd+Enter only with the inbox enabled, and sends the
				// chat widget focused last rather than this one.
				weight: KeybindingWeight.SessionsContrib + 1,
			},
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IAgentsLauncherService).sendInBackground();
	}
});

registerAction2(class HideAgentsLauncherAction extends Action2 {
	constructor() {
		super({
			id: HIDE_AGENTS_LAUNCHER_COMMAND_ID,
			title: localize2('hideAgentsLauncher', "Hide Agents Launcher"),
			f1: false,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(
					AgentsLauncherFocusContext,
					SuggestContext.Visible.toNegated(),
					InQuickInputContextKey.toNegated(),
					EditorContextKeys.hoverVisible.toNegated(),
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated(),
				),
			},
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> | undefined {
		if (accessor.get(IQuickInputService).currentQuickInput || isContextViewVisible(accessor.get(IContextViewService))) {
			return undefined;
		}
		return accessor.get(IAgentsLauncherService).hide();
	}
});

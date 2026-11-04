/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../workbench/browser/parts/titlebar/media/titlebarpart.css';
import './media/titlebarpart.css';
import { MultiWindowParts, Part } from '../../../workbench/browser/part.js';
import { ITitleService } from '../../../workbench/services/title/browser/titleService.js';
import { getZoomFactor, isWCOEnabled, getWCOTitlebarAreaRect, isFullscreen, onDidChangeFullscreen, setFullscreen } from '../../../base/browser/browser.js';
import { hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, TitlebarStyle, getTitleBarStyle, getWindowControlsStyle, WindowControlsStyle } from '../../../platform/window/common/window.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { agentsBackground, agentsPanelForeground } from '../../common/theme.js';
import { isLinux, isMacintosh, isWeb, isNative, platformLocale } from '../../../base/common/platform.js';
import { EventType, EventHelper, append, $, addDisposableListener, prepend, getWindow, getWindowId, AnimationFrameScheduler, isHTMLElement } from '../../../base/browser/dom.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { Parts, IWorkbenchLayoutService, LayoutSettings, ModernUIDensity } from '../../../workbench/services/layout/browser/layoutService.js';

import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { MenuWorkbenchButtonBar } from '../../../platform/actions/browser/buttonbar.js';
import { IEditorGroupsContainer } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { CodeWindow, mainWindow } from '../../../base/browser/window.js';
import { safeIntl } from '../../../base/common/date.js';
import { ITitlebarPart, ITitleProperties, ITitleVariable, IAuxiliaryTitlebarPart } from '../../../workbench/browser/parts/titlebar/titlebarPart.js';
import { WindowTitle } from '../../../workbench/browser/parts/titlebar/windowTitle.js';
import { Menus } from '../menus.js';
import { IsNewChatSessionContext } from '../../common/contextkeys.js';
import { createInstantHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';

const commandCenterContextKeys = new Set([IsNewChatSessionContext.key]);
const DEFAULT_SESSIONS_TITLEBAR_HEIGHT = 44;

/** The width reserved for the macOS traffic lights while they show. */
const TRAFFIC_LIGHTS_WIDTH = 70;

/** How long a window is still after resizing, such as into or out of full screen, before its host is asked whether it is in full screen. */
const FULLSCREEN_RECHECK_DELAY = 300;

const SHOWS_NO_ACTIONS_CLASS = 'shows-no-actions';

/**
 * Marks each of `containers` that shows no actions, such as one whose actions all hide themselves, as the Create Pull
 * Request bar without changes does, with `shows-no-actions`: as its actions show and hide.
 */
function trackActionsContainersShowingNoActions(containers: readonly HTMLElement[]): IDisposable {
	const showsActions = (element: Element): boolean => [...element.children].some(child => child.classList.contains('action-item') ? isHTMLElement(child) && child.style.display !== 'none' : showsActions(child));
	const update = (container: HTMLElement) => container.classList.toggle(SHOWS_NO_ACTIONS_CLASS, !showsActions(container));
	const observers = containers.map(container => {
		update(container);
		const observer = new (getWindow(container).MutationObserver)(() => update(container));
		observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
		return observer;
	});
	return toDisposable(() => observers.forEach(observer => observer.disconnect()));
}

/**
 * Simplified agent sessions titlebar part.
 *
 * Three sections driven entirely by menus:
 * - **Left**: `Menus.TitleBarLeft` toolbar
 * - **Center**: `Menus.CommandCenter` toolbar (renders session picker via IActionViewItemService)
 * - **Right**: `Menus.TitleBarRight` toolbar (includes account submenu)
 *
 * No menubar, no editor actions, no layout controls, no WindowTitle dependency.
 */
export class TitlebarPart extends Part implements ITitlebarPart {

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	get minimumHeight(): number {
		if (this.fixedHeight !== undefined) {
			return this.fixedHeight;
		}
		const wcoEnabled = isWeb && isWCOEnabled();
		let value = this.configurationService.getValue<ModernUIDensity>(LayoutSettings.MODERN_UI_DENSITY) === ModernUIDensity.Compact
			? DEFAULT_CUSTOM_TITLEBAR_HEIGHT
			: DEFAULT_SESSIONS_TITLEBAR_HEIGHT;
		if (wcoEnabled) {
			value = Math.max(value, getWCOTitlebarAreaRect(getWindow(this.element))?.height ?? 0);
		}

		return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
	}

	get maximumHeight(): number { return this.minimumHeight; }

	//#endregion

	//#region Events

	private readonly _onMenubarVisibilityChange = this._register(new Emitter<boolean>());
	readonly onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion

	protected rootContainer!: HTMLElement;
	protected windowControlsContainer: HTMLElement | undefined;

	private leftContent!: HTMLElement;
	private leftToolbarContainer!: HTMLElement;
	private centerContent!: HTMLElement;
	private windowTitleLabel: HTMLElement | undefined;
	private fixedTitle: string | undefined;
	private sessionHeaderHost: HTMLElement | undefined;
	private rightContent!: HTMLElement;
	private readonly overflowManagedToolBarElements: HTMLElement[] = [];
	private titleBarToolBarOverflowScheduler!: AnimationFrameScheduler;

	get leftContainer(): HTMLElement { return this.leftContent; }
	get rightContainer(): HTMLElement { return this.rightContent; }
	get rightWindowControlsContainer(): HTMLElement | undefined { return this.windowControlsContainer; }

	/** Follows the fullscreen state of the window the title bar is in now. */
	private trackFullscreenOfWindow: () => void = () => { };

	/**
	 * The full-screen state of `targetWindow` as its host knows it, if it can tell, to correct the state the window was
	 * told of. Its size cannot tell: a window in full screen may not cover its screen, such as below the camera notch of a
	 * display or on an external display.
	 */
	protected async queryWindowFullscreen(_targetWindow: CodeWindow): Promise<boolean | undefined> {
		return undefined;
	}

	private centerActionsContainer!: HTMLElement;
	private sessionActionsContainer!: HTMLElement;
	private sessionHeaderActionsHost: HTMLElement | undefined;

	private readonly titleBarStyle: TitlebarStyle;
	private isInactive: boolean = false;

	constructor(
		id: string,
		targetWindow: CodeWindow,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
	) {
		super(id, { hasTitle: false }, themeService, storageService, layoutService);

		this.titleBarStyle = getTitleBarStyle(this.configurationService);

		this.registerListeners(targetWindow);
	}

	private registerListeners(targetWindow: CodeWindow): void {
		this._register(this.hostService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
		// The window it is in as the active window changes: a title bar may be created before it is in its window, such as
		// one created into an editor before it shows in an auxiliary window.
		this._register(this.hostService.onDidChangeActiveWindow(windowId => windowId === getWindowId(this.element ? getWindow(this.element) : targetWindow) ? this.onFocus() : this.onBlur()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.MODERN_UI_DENSITY)) {
				this._onDidChange.fire(undefined);
			}
		}));
	}

	private onBlur(): void {
		this.isInactive = true;
		this.updateStyles();
	}

	private onFocus(): void {
		this.isInactive = false;
		this.updateStyles();
	}

	updateProperties(_properties: ITitleProperties): void {
		// No window title to update in simplified titlebar
	}

	/**
	 * Shows a fixed title in the center of the title bar, in place of the command center. Meant for auxiliary windows that
	 * show one thing, such as a chat; `undefined` removes it. The title of the window is its owner's: a title bar may not be
	 * in its window yet, such as one created into an editor before it shows, and would set the main window's title.
	 */
	setTitle(title: string | undefined): void {
		this.fixedTitle = title;
		this.renderFixedTitle();
	}

	/**
	 * The element that shows a session header in place of the title, after the window controls; see
	 * {@link setHostsSessionHeader}. Created when first asked for, so a title bar that never hosts one is as it was.
	 */
	getSessionHeaderHost(): HTMLElement {
		if (!this.sessionHeaderHost) {
			this.sessionHeaderHost = append(this.leftContent, $('.session-header-host'));
		}
		return this.sessionHeaderHost;
	}

	/**
	 * The element that shows the actions of a hosted session header, such as its More Actions, last of the actions of the
	 * title bar. Asking for it makes the actions one group at the right of the title bar, as a window of its own for a
	 * session, such as a chat window, shows them: the actions that otherwise show beside the title, such as Run and Open in
	 * VS Code, then show before those at the right, such as Create Pull Request and the layout actions, and the header's
	 * after all of them, before only the window controls.
	 */
	getSessionHeaderActionsHost(): HTMLElement {
		if (!this.sessionHeaderActionsHost) {
			this.sessionHeaderActionsHost = $('.session-header-actions-host');
			this.sessionActionsContainer.before(this.centerActionsContainer);
			const windowControls = [...this.rightContent.children].find(child => child.classList.contains('window-controls-container'));
			this.rightContent.insertBefore(this.sessionHeaderActionsHost, windowControls ?? null);
			const actionsContainers = [...this.rightContent.children].filter((child): child is HTMLElement => child.classList.contains('titlebar-actions-container'));
			this._register(trackActionsContainersShowingNoActions(actionsContainers));
			this.titleBarToolBarOverflowScheduler.schedule();
		}
		return this.sessionHeaderActionsHost;
	}

	private fixedHeight: number | undefined;

	/**
	 * Whether the title bar shows the layout actions of its window ({@link Menus.TitleBarWindowLayout}), which apply to
	 * windows with layout modes, such as chat windows: the title bars of other windows than the main window.
	 */
	protected get showsWindowLayoutActions(): boolean {
		return false;
	}

	/**
	 * Makes the title bar `height` tall, in place of the height of the density, such as to line up with the row of tabs
	 * beside it in a chat window; its drag region and window controls follow. `undefined` brings back the density's.
	 */
	setHeight(height: number | undefined): void {
		if (this.fixedHeight === height) {
			return;
		}
		this.fixedHeight = height;
		this._onDidChange.fire(undefined);
	}

	/** Shows the {@link getSessionHeaderHost} in place of the title. The window title stays. */
	setHostsSessionHeader(hosts: boolean): void {
		this.element.classList.toggle('hosts-session-header', hosts);
	}

	private renderFixedTitle(): void {
		if (!this.windowTitleLabel) {
			return;
		}
		this.windowTitleLabel.textContent = this.fixedTitle ?? '';
		this.windowTitleLabel.parentElement?.classList.toggle('has-fixed-title', !!this.fixedTitle);
	}

	registerVariables(_variables: ITitleVariable[]): void {
		// No window title variables in simplified titlebar
	}

	updateOptions(_options: { compact: boolean }): void {
		// Auxiliary-window compact mode does not override the configured layout density.
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.rootContainer = append(parent, $('.titlebar-container.sessions-titlebar-container.has-center'));

		// Track fullscreen of the window hosting this part (main or auxiliary): the window it is in, which may change from
		// the one it was created in, such as for a title bar created before it is in its window, as the title row of a
		// chat view is.
		let trafficLightSpacer: HTMLElement | undefined;
		const updateFullscreen = () => {
			const fullscreen = isFullscreen(getWindow(parent));
			parent.classList.toggle('titlebar-fullscreen', fullscreen);
			if (trafficLightSpacer) {
				trafficLightSpacer.style.display = fullscreen ? 'none' : '';
			}
		};
		// The full-screen state of an auxiliary window comes from the events of its host, which the host is asked again once
		// the window is done resizing or the title bar moves to it, in case the state it was told of is stale.
		let querying = false;
		let queryAgain = false;
		const correctFullscreen = async () => {
			if (querying) {
				queryAgain = true;
				return;
			}
			querying = true;
			try {
				do {
					queryAgain = false;
					const targetWindow = trackedWindow;
					if (!targetWindow || targetWindow === mainWindow) {
						return;
					}
					const fullscreen = await this.queryWindowFullscreen(targetWindow);
					if (this._store.isDisposed) {
						return;
					}
					if (fullscreen !== undefined && targetWindow === trackedWindow && fullscreen !== isFullscreen(targetWindow)) {
						setFullscreen(fullscreen, targetWindow);
					}
				} while (queryAgain);
			} finally {
				querying = false;
			}
		};
		const correctFullscreenScheduler = this._register(new RunOnceScheduler(() => void correctFullscreen(), FULLSCREEN_RECHECK_DELAY));
		const windowResize = this._register(new MutableDisposable());
		let trackedWindow: CodeWindow | undefined;
		this.trackFullscreenOfWindow = () => {
			const targetWindow = getWindow(parent);
			if (targetWindow !== trackedWindow) {
				trackedWindow = targetWindow;
				correctFullscreenScheduler.cancel();
				windowResize.value = targetWindow !== mainWindow ? addDisposableListener(targetWindow, EventType.RESIZE, () => correctFullscreenScheduler.schedule()) : undefined;
				void correctFullscreen();
			}
			updateFullscreen();
		};
		this.trackFullscreenOfWindow();
		this._register(onDidChangeFullscreen(windowId => {
			if (windowId === getWindowId(getWindow(parent))) {
				updateFullscreen();
			}
		}));
		// Measure in the render phase so DOM reads do not force layout during startup.
		this.titleBarToolBarOverflowScheduler = this._register(new AnimationFrameScheduler(this.rootContainer, () => this.updateTitleBarToolBarOverflow()));

		// Draggable region
		prepend(this.rootContainer, $('div.titlebar-drag-region'));

		this.leftContent = append(this.rootContainer, $('.titlebar-left'));
		this.centerContent = append(this.rootContainer, $('.titlebar-center'));
		this.rightContent = append(this.rootContainer, $('.titlebar-right'));

		// Window Controls Container (must be before left toolbar for correct ordering)
		if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
			let primaryWindowControlsLocation = isMacintosh ? 'left' : 'right';
			if (isMacintosh && isNative) {
				const localeInfo = safeIntl.Locale(platformLocale).value;
				const textInfo = (localeInfo as { textInfo?: { direction?: string } }).textInfo;
				if (textInfo?.direction === 'rtl') {
					primaryWindowControlsLocation = 'right';
				}
			}

			if (isMacintosh && isNative && primaryWindowControlsLocation === 'left') {
				// macOS native: traffic lights are rendered by the OS at the top-left corner.
				// Add a fixed-width spacer to push content past the traffic lights.
				// The spacer is hidden in fullscreen, where traffic lights are not shown.
				const spacer = trafficLightSpacer = append(this.leftContent, $('div.window-controls-container'));
				updateFullscreen();
				spacer.style.width = `${TRAFFIC_LIGHTS_WIDTH}px`;
				spacer.style.flexShrink = '0';
			} else if (getWindowControlsStyle(this.configurationService) === WindowControlsStyle.HIDDEN) {
				// controls explicitly disabled
			} else {
				this.windowControlsContainer = append(primaryWindowControlsLocation === 'left' ? this.leftContent : this.rightContent, $('div.window-controls-container'));
				if (isWCOEnabled()) {
					this.windowControlsContainer.classList.add('wco-enabled');
					if (isWeb || isLinux) {
						append(primaryWindowControlsLocation === 'left' ? this.rightContent : this.leftContent, $('div.window-controls-container.wco-enabled'));
					}
				} else if (isWeb) {
					append(primaryWindowControlsLocation === 'left' ? this.rightContent : this.leftContent, $('div.window-controls-container'));
				}
			}
		}

		// Left toolbar (driven by Menus.TitleBarLeft, rendered after window controls via CSS order)
		const hoverDelegate = this._register(createInstantHoverDelegate());
		this.leftToolbarContainer = append(this.leftContent, $('div.left-toolbar-container'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.leftToolbarContainer, Menus.TitleBarLeftLayout, {
			hoverDelegate,
			contextMenu: Menus.TitleBarContext,
			telemetrySource: 'titlePart.left',
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Center section: [nav toolbar] [command center box] [actions toolbar]
		// All live inside .titlebar-center so the cluster is window-centered.

		// Navigation toolbar (Back/Forward), rendered left of the command center.
		const centerNavContainer = append(this.centerContent, $('div.titlebar-actions-container.titlebar-center-nav-container'));
		const centerNavToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerNavContainer, Menus.TitleBarCenterLeft, {
			hoverDelegate,
			contextMenu: Menus.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'titlePart.centerLeft',
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Center toolbar - command center (renders session picker via IActionViewItemService)
		// Uses .window-title > .command-center nesting to match default workbench CSS selectors
		const windowTitle = append(this.centerContent, $('div.window-title'));
		this.windowTitleLabel = append(windowTitle, $('span.window-title-text'));
		this.renderFixedTitle();
		const centerToolbarContainer = append(windowTitle, $('div.command-center'));
		const centerToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerToolbarContainer, Menus.CommandCenter, {
			hoverDelegate,
			contextMenu: Menus.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'commandCenter',
			toolbarOptions: { primaryGroup: () => true },
		}));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(commandCenterContextKeys)) {
				centerToolbar.refresh();
			}
		}));

		// Actions toolbar (Open in VS Code), rendered right of the command center.
		const centerActionsContainer = this.centerActionsContainer = append(this.centerContent, $('div.titlebar-actions-container.titlebar-center-actions-container'));
		const centerActionsToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerActionsContainer, Menus.TitleBarCenterRight, {
			hoverDelegate,
			contextMenu: Menus.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'titlePart.centerRight',
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Right toolbar (driven by Menus.TitleBarRightLayout - includes layout actions)
		const rightToolbarContainer = prepend(this.rightContent, $('div.titlebar-actions-container.titlebar-right-layout-container'));
		const rightToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, rightToolbarContainer, Menus.TitleBarRightLayout, {
			hoverDelegate,
			contextMenu: Menus.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'titlePart.right',
			toolbarOptions: { primaryGroup: () => true },
		}));

		// The layout actions of a window with layout modes (before right toolbar), such as a chat window: its Layout menu and
		// the buttons of its actions, which the user shows and hides from the context menu of the toolbar.
		const windowLayoutContainer = this.showsWindowLayoutActions ? prepend(this.rightContent, $('div.titlebar-actions-container.titlebar-window-layout-container')) : undefined;
		const windowLayoutToolBar = windowLayoutContainer && this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, windowLayoutContainer, Menus.TitleBarWindowLayout, {
			hoverDelegate,
			contextMenu: Menus.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			telemetrySource: 'titlePart.windowLayout',
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Session title actions toolbar (before right toolbar)
		const sessionActionsContainer = this.sessionActionsContainer = prepend(this.rightContent, $('div.titlebar-actions-container.titlebar-session-actions-container'));
		const sessionActionsToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionActionsContainer, Menus.TitleBarSessionMenu, {
			hoverDelegate,
			contextMenu: Menus.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'titlePart.sessionActions',
			toolbarOptions: { primaryGroup: () => true },
		}));

		const screenReaderToolBarElement = prepend(this.rightContent, $('div.titlebar-actions-container.titlebar-screen-reader-container'));
		const screenReaderButtonBar = this._register(this.instantiationService.createInstance(MenuWorkbenchButtonBar, screenReaderToolBarElement, Menus.TitleBarAccessibility, {
			telemetrySource: 'titlePart.accessibility',
			renderSecondaryActions: false,
			buttonConfigProvider: () => ({ showIcon: false, showLabel: true, isSecondary: false }),
		}));
		const updateScreenReaderButtonBar = () => {
			screenReaderToolBarElement.classList.toggle('has-no-actions', screenReaderButtonBar.buttons.length === 0);
			this.titleBarToolBarOverflowScheduler.schedule();
		};
		this._register(screenReaderButtonBar.onDidChange(updateScreenReaderButtonBar));
		updateScreenReaderButtonBar();

		this.overflowManagedToolBarElements.push(screenReaderToolBarElement);
		this.registerOverflowManagedToolBar(centerActionsContainer, centerActionsToolBar);
		this.registerOverflowManagedToolBar(centerNavContainer, centerNavToolBar);
		this.registerOverflowManagedToolBar(rightToolbarContainer, rightToolBar);
		this.registerOverflowManagedToolBar(sessionActionsContainer, sessionActionsToolBar);
		if (windowLayoutContainer && windowLayoutToolBar) {
			this.registerOverflowManagedToolBar(windowLayoutContainer, windowLayoutToolBar);
		}

		// Context menu on the titlebar
		this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, e => {
			EventHelper.stop(e);
			this.onContextMenu(e);
		}));

		this.updateStyles();

		return this.element;
	}

	override updateStyles(): void {
		super.updateStyles();

		if (this.element) {
			this.element.classList.toggle('inactive', this.isInactive);

			const titleBarBackground = this.getColor(agentsBackground); // transparent background not supported on some platforms
			this.element.style.backgroundColor = titleBarBackground || '';

			const titleForeground = this.getColor(agentsPanelForeground);
			this.element.style.color = titleForeground || '';
		}
	}

	protected onContextMenu(e: MouseEvent): void {
		const event = new StandardMouseEvent(getWindow(this.element), e);
		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			menuId: Menus.TitleBarContext,
			contextKeyService: this.contextKeyService,
			domForShadowRoot: isMacintosh && isNative ? event.target : undefined
		});
	}

	get hasZoomableElements(): boolean {
		return true; // sessions titlebar always has command center and toolbar actions
	}

	get preventZoom(): boolean {
		// Prevent zooming behavior if any of the following conditions are met:
		// 1. Shrinking below the window control size (zoom < 1)
		// 2. No custom items are present in the title bar
		return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
	}

	override layout(width: number, height: number): void {
		// Laid out in the window it is in, which it may have been moved to since it was created.
		this.trackFullscreenOfWindow();
		this.updateLayout();
		super.layoutContents(width, height);
		this.titleBarToolBarOverflowScheduler.schedule();
		this.layoutService.getContainer(getWindow(this.element)).style.setProperty('--modern-ui-notifications-block-start-inset', `${height + 5}px`);
	}

	private registerOverflowManagedToolBar(element: HTMLElement, toolBar: MenuWorkbenchToolBar): void {
		this.overflowManagedToolBarElements.push(element);
		this._register(toolBar.onDidChangeMenuItems(() => this.titleBarToolBarOverflowScheduler.schedule()));
	}

	private updateTitleBarToolBarOverflow(): void {
		for (const element of this.overflowManagedToolBarElements) {
			element.classList.remove('overflowing');
		}

		if (this.rootContainer.clientWidth === 0) {
			return;
		}

		for (const element of this.overflowManagedToolBarElements) {
			if (!this.isTitleBarOverflowing()) {
				return;
			}

			if (!element.classList.contains('has-no-actions')) {
				element.classList.add('overflowing');
			}
		}
	}

	private isTitleBarOverflowing(): boolean {
		return [this.rootContainer, this.leftContent, this.centerContent, this.rightContent]
			.some(element => element.scrollWidth > element.clientWidth);
	}

	private updateLayout(): void {
		if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
			return;
		}

		const zoomFactor = getZoomFactor(getWindow(this.element));
		this.element.style.setProperty('--zoom-factor', zoomFactor.toString());
		this.rootContainer.classList.toggle('counter-zoom', this.preventZoom);
	}

	focus(): void {
		// eslint-disable-next-line no-restricted-syntax
		(this.element.querySelector('[tabindex]:not([tabindex="-1"])') as HTMLElement | null)?.focus();
	}

	toJSON(): object {
		return { type: Parts.TITLEBAR_PART };
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}
}

/**
 * Main agent sessions titlebar part (for the main window).
 */
export class MainTitlebarPart extends TitlebarPart {

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
	) {
		super(Parts.TITLEBAR_PART, mainWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
	}
}

/**
 * Auxiliary agent sessions titlebar part (for auxiliary windows).
 */
export class AuxiliaryTitlebarPart extends TitlebarPart implements IAuxiliaryTitlebarPart {

	private static COUNTER = 1;

	get height() { return this.minimumHeight; }

	constructor(
		readonly container: HTMLElement,
		private readonly mainTitlebar: TitlebarPart,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
	) {
		const id = AuxiliaryTitlebarPart.COUNTER++;
		super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
	}

	protected override get showsWindowLayoutActions(): boolean {
		return true;
	}

	override get preventZoom(): boolean {
		// Prevent zooming behavior if any of the following conditions are met:
		// 1. Shrinking below the window control size (zoom < 1)
		// 2. No custom items are present in the main title bar
		// The auxiliary title bar never contains any zoomable items itself,
		// but we want to match the behavior of the main title bar.
		return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
	}
}

/**
 * Agent Sessions title service - manages the titlebar parts.
 */
export class TitleService extends MultiWindowParts<TitlebarPart> implements ITitleService {

	declare _serviceBrand: undefined;

	readonly mainPart: TitlebarPart;

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService
	) {
		super('workbench.agentSessionsTitleService', themeService, storageService);

		this.mainPart = this._register(this.createMainTitlebarPart());
		this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;
		this._register(this.registerPart(this.mainPart));
	}

	protected createMainTitlebarPart(): TitlebarPart {
		return this.instantiationService.createInstance(MainTitlebarPart);
	}

	//#region Auxiliary Titlebar Parts

	createAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer, instantiationService: IInstantiationService): IAuxiliaryTitlebarPart {
		const titlebarPartContainer = $('.part.titlebar', { role: 'none' });
		titlebarPartContainer.style.position = 'relative';
		container.insertBefore(titlebarPartContainer, container.firstChild);

		const disposables = new DisposableStore();

		const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer, instantiationService);
		disposables.add(this.registerPart(titlebarPart));

		disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
		titlebarPart.create(titlebarPartContainer);

		Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());

		return titlebarPart;
	}

	protected doCreateAuxiliaryTitlebarPart(container: HTMLElement, _editorGroupsContainer: IEditorGroupsContainer, instantiationService: IInstantiationService): TitlebarPart & IAuxiliaryTitlebarPart {
		return instantiationService.createInstance(AuxiliaryTitlebarPart, container, this.mainPart);
	}

	//#endregion

	//#region Service Implementation

	readonly onMenubarVisibilityChange: Event<boolean>;

	updateProperties(properties: ITitleProperties): void {
		for (const part of this.parts) {
			part.updateProperties(properties);
		}
	}

	registerVariables(variables: ITitleVariable[]): void {
		for (const part of this.parts) {
			part.registerVariables(variables);
		}
	}

	private _windowTitle: WindowTitle | undefined;

	get windowTitle(): WindowTitle {
		// The Agents window title bar does not render `window.title`, so we
		// lazily construct a `WindowTitle` only when a consumer (e.g. a custom
		// command center widget) actually asks for one.
		if (!this._windowTitle) {
			this._windowTitle = this._register(this.instantiationService.createInstance(WindowTitle, mainWindow));
		}
		return this._windowTitle;
	}

	//#endregion
}

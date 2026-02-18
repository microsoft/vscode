/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../workbench/browser/parts/titlebar/media/titlebarpart.css';
import './media/titlebarpart.css';
import { MultiWindowParts, Part } from '../../../workbench/browser/part.js';
import { ITitleService } from '../../../workbench/services/title/browser/titleService.js';
import { getZoomFactor, isWCOEnabled, getWCOTitlebarAreaRect, isFullscreen, onDidChangeFullscreen } from '../../../base/browser/browser.js';
import { hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, TitlebarStyle, getTitleBarStyle, getWindowControlsStyle, WindowControlsStyle } from '../../../platform/window/common/window.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from '../../../workbench/common/theme.js';
import { isMacintosh, isWeb, isNative, platformLocale } from '../../../base/common/platform.js';
import { Color } from '../../../base/common/color.js';
import { EventType, EventHelper, Dimension, append, $, addDisposableListener, prepend, getWindow, getWindowId } from '../../../base/browser/dom.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { Parts, IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';

import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { IEditorGroupsContainer } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { CodeWindow, mainWindow } from '../../../base/browser/window.js';
import { safeIntl } from '../../../base/common/date.js';
import { ITitlebarPart, ITitleProperties, ITitleVariable, IAuxiliaryTitlebarPart } from '../../../workbench/browser/parts/titlebar/titlebarPart.js';
import { Menus } from '../menus.js';

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
		const wcoEnabled = isWeb && isWCOEnabled();
		let value = DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
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

	private rootContainer!: HTMLElement;
	private windowControlsContainer: HTMLElement | undefined;

	private leftContent!: HTMLElement;
	private centerContent!: HTMLElement;
	private rightContent!: HTMLElement;

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

		this.registerListeners(getWindowId(targetWindow));
	}

	private registerListeners(targetWindowId: number): void {
		this._register(this.hostService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
		this._register(this.hostService.onDidChangeActiveWindow(windowId => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
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

	registerVariables(_variables: ITitleVariable[]): void {
		// No window title variables in simplified titlebar
	}

	updateOptions(_options: { compact: boolean }): void {
		// No compact mode support in agent sessions titlebar
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.rootContainer = append(parent, $('.titlebar-container.has-center'));

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
				const spacer = append(this.leftContent, $('div.window-controls-container'));
				spacer.style.width = '70px';
				spacer.style.flexShrink = '0';

				// Hide spacer in fullscreen (traffic lights are not shown)
				const updateSpacerVisibility = () => {
					spacer.style.display = isFullscreen(mainWindow) ? 'none' : '';
				};
				updateSpacerVisibility();
				this._register(onDidChangeFullscreen(windowId => {
					if (windowId === getWindowId(mainWindow)) {
						updateSpacerVisibility();
					}
				}));
			} else if (getWindowControlsStyle(this.configurationService) === WindowControlsStyle.HIDDEN) {
				// controls explicitly disabled
			} else {
				this.windowControlsContainer = append(primaryWindowControlsLocation === 'left' ? this.leftContent : this.rightContent, $('div.window-controls-container'));
				if (isWeb) {
					append(primaryWindowControlsLocation === 'left' ? this.rightContent : this.leftContent, $('div.window-controls-container'));
				}

				if (isWCOEnabled()) {
					this.windowControlsContainer.classList.add('wco-enabled');
				}
			}
		}

		// Left toolbar (driven by Menus.TitleBarLeft, rendered after window controls via CSS order)
		const leftToolbarContainer = append(this.leftContent, $('div.left-toolbar-container'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, leftToolbarContainer, Menus.TitleBarLeft, {
			contextMenu: Menus.TitleBarContext,
			telemetrySource: 'titlePart.left',
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Center toolbar - command center (renders session picker via IActionViewItemService)
		// Uses .window-title > .command-center nesting to match default workbench CSS selectors
		const windowTitle = append(this.centerContent, $('div.window-title'));
		const centerToolbarContainer = append(windowTitle, $('div.command-center'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerToolbarContainer, Menus.CommandCenter, {
			contextMenu: Menus.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'commandCenter',
			toolbarOptions: { primaryGroup: () => true },
		}));

		// Right toolbar (driven by Menus.TitleBarRight - includes account submenu)
		const rightToolbarContainer = prepend(this.rightContent, $('div.action-toolbar-container'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, rightToolbarContainer, Menus.TitleBarRight, {
			contextMenu: Menus.TitleBarContext,
			telemetrySource: 'titlePart.right',
			toolbarOptions: { primaryGroup: () => true },
		}));

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

			const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND, (color, theme) => {
				return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
			}) || '';
			this.element.style.backgroundColor = titleBackground;

			if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
				this.element.classList.add('light');
			} else {
				this.element.classList.remove('light');
			}

			const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
			this.element.style.color = titleForeground || '';

			const titleBorder = this.getColor(TITLE_BAR_BORDER);
			this.element.style.borderBottom = titleBorder ? `1px solid ${titleBorder}` : '';
		}
	}

	private onContextMenu(e: MouseEvent): void {
		const event = new StandardMouseEvent(getWindow(this.element), e);
		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			menuId: Menus.TitleBarContext,
			contextKeyService: this.contextKeyService,
			domForShadowRoot: isMacintosh && isNative ? event.target : undefined
		});
	}

	private lastLayoutDimension: Dimension | undefined;

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
		this.lastLayoutDimension = new Dimension(width, height);
		this.updateLayout();
		super.layoutContents(width, height);
	}

	private updateLayout(): void {
		if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
			return;
		}

		const zoomFactor = getZoomFactor(getWindow(this.element));
		this.element.style.setProperty('--zoom-factor', zoomFactor.toString());
		this.rootContainer.classList.toggle('counter-zoom', this.preventZoom);

		this.updateCenterOffset();
	}

	private updateCenterOffset(): void {
		if (!this.centerContent || !this.lastLayoutDimension) {
			return;
		}

		// Center the command center relative to the viewport.
		// The titlebar only covers the right section (sidebar is to the left),
		// so we shift the center content left by half the sidebar width
		// using a negative margin.
		const windowWidth = this.layoutService.mainContainerDimension.width;
		const titlebarWidth = this.lastLayoutDimension.width;
		const leftOffset = windowWidth - titlebarWidth;
		this.centerContent.style.marginLeft = leftOffset > 0 ? `${-leftOffset / 2}px` : '';
		this.centerContent.style.marginRight = leftOffset > 0 ? `${leftOffset / 2}px` : '';
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
		editorGroupsContainer: IEditorGroupsContainer,
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

	protected doCreateAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer, instantiationService: IInstantiationService): TitlebarPart & IAuxiliaryTitlebarPart {
		return instantiationService.createInstance(AuxiliaryTitlebarPart, container, editorGroupsContainer, this.mainPart);
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

	//#endregion
}

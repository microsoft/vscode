/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/titlebarpart';
import { localize } from 'vs/nls';
import { Part } from 'vs/workbench/browser/part';
import { ITitleService, ITitleProperties } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor, isWCOVisible } from 'vs/base/browser/browser';
import { MenuBarVisibility, getTitleBarStyle, getMenuBarVisibility } from 'vs/platform/window/common/window';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { isMacintosh, isWindows, isLinux, isWeb, isNative } from 'vs/base/common/platform';
import { Color } from 'vs/base/common/color';
import { EventType, EventHelper, Dimension, isAncestor, append, $, addDisposableListener, runAtThisOrScheduleAtNextAnimationFrame, prepend, reset } from 'vs/base/browser/dom';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Parts, IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { Codicon } from 'vs/base/common/codicons';
import { getIconRegistry } from 'vs/platform/theme/common/iconRegistry';
import { WindowTitle } from 'vs/workbench/browser/parts/titlebar/windowTitle';
import { CommandCenterControl } from 'vs/workbench/browser/parts/titlebar/commandCenterControl';
import { IHoverDelegate } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';

export class TitlebarPart extends Part implements ITitleService {

	private static readonly configCommandCenter = 'window.commandCenter';

	declare readonly _serviceBrand: undefined;

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	get minimumHeight(): number {
		const value = this.isCommandCenterVisible || (isWeb && isWCOVisible()) ? 35 : 30;
		return value / (this.useCounterZoom ? getZoomFactor() : 1);
	}

	get maximumHeight(): number { return this.minimumHeight; }

	//#endregion

	private _onMenubarVisibilityChange = this._register(new Emitter<boolean>());
	readonly onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;

	private readonly _onDidChangeCommandCenterVisibility = new Emitter<void>();
	readonly onDidChangeCommandCenterVisibility: Event<void> = this._onDidChangeCommandCenterVisibility.event;

	protected rootContainer!: HTMLElement;
	protected windowControls: HTMLElement | undefined;
	protected dragRegion: HTMLElement | undefined;
	protected title!: HTMLElement;

	protected customMenubar: CustomMenubarControl | undefined;
	protected appIcon: HTMLElement | undefined;
	private appIconBadge: HTMLElement | undefined;
	protected menubar?: HTMLElement;
	protected layoutControls: HTMLElement | undefined;
	private layoutToolbar: MenuWorkbenchToolBar | undefined;
	protected lastLayoutDimensions: Dimension | undefined;

	private hoverDelegate: IHoverDelegate;

	private readonly titleDisposables = this._register(new DisposableStore());
	private titleBarStyle: 'native' | 'custom';

	private isInactive: boolean = false;

	private readonly windowTitle: WindowTitle;

	constructor(
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService protected readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@IHoverService hoverService: IHoverService,
	) {
		super(Parts.TITLEBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
		this.windowTitle = this._register(instantiationService.createInstance(WindowTitle));

		this.titleBarStyle = getTitleBarStyle(this.configurationService);

		this.hoverDelegate = new class implements IHoverDelegate {

			private _lastHoverHideTime: number = 0;

			readonly showHover = hoverService.showHover.bind(hoverService);
			readonly placement = 'element';

			get delay(): number {
				return Date.now() - this._lastHoverHideTime < 200
					? 0  // show instantly when a hover was recently shown
					: configurationService.getValue<number>('workbench.hover.delay');
			}

			onDidHideHover() {
				this._lastHoverHideTime = Date.now();
			}
		};

		this.registerListeners();
	}

	updateProperties(properties: ITitleProperties): void {
		this.windowTitle.updateProperties(properties);
	}

	get isCommandCenterVisible() {
		return this.configurationService.getValue<boolean>(TitlebarPart.configCommandCenter);
	}

	private registerListeners(): void {
		this._register(this.hostService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
	}

	private onBlur(): void {
		this.isInactive = true;
		this.updateStyles();
	}

	private onFocus(): void {
		this.isInactive = false;
		this.updateStyles();
	}

	protected onConfigurationChanged(event: IConfigurationChangeEvent): void {

		if (this.titleBarStyle !== 'native' && (!isMacintosh || isWeb)) {
			if (event.affectsConfiguration('window.menuBarVisibility')) {
				if (this.currentMenubarVisibility === 'compact') {
					this.uninstallMenubar();
				} else {
					this.installMenubar();
				}
			}
		}

		if (this.titleBarStyle !== 'native' && this.layoutControls && event.affectsConfiguration('workbench.layoutControl.enabled')) {
			this.layoutControls.classList.toggle('show-layout-control', this.layoutControlEnabled);
			this._onDidChange.fire(undefined);
		}

		if (event.affectsConfiguration(TitlebarPart.configCommandCenter)) {
			this.updateTitle();
			this.adjustTitleMarginToCenter();
			this._onDidChangeCommandCenterVisibility.fire();
		}
	}

	protected onMenubarVisibilityChanged(visible: boolean): void {
		if (isWeb || isWindows || isLinux) {
			if (this.lastLayoutDimensions) {
				this.layout(this.lastLayoutDimensions.width, this.lastLayoutDimensions.height);
			}

			this._onMenubarVisibilityChange.fire(visible);
		}
	}


	private uninstallMenubar(): void {
		if (this.customMenubar) {
			this.customMenubar.dispose();
			this.customMenubar = undefined;
		}

		if (this.menubar) {
			this.menubar.remove();
			this.menubar = undefined;
		}

		this.onMenubarVisibilityChanged(false);
	}

	protected installMenubar(): void {
		// If the menubar is already installed, skip
		if (this.menubar) {
			return;
		}

		this.customMenubar = this._register(this.instantiationService.createInstance(CustomMenubarControl));

		this.menubar = this.rootContainer.insertBefore($('div.menubar'), this.title);
		this.menubar.setAttribute('role', 'menubar');

		this._register(this.customMenubar.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));

		this.customMenubar.create(this.menubar);
	}

	private updateTitle(): void {
		this.titleDisposables.clear();
		if (!this.isCommandCenterVisible) {
			// Text Title
			this.title.innerText = this.windowTitle.value;
			this.titleDisposables.add(this.windowTitle.onDidChange(() => {
				this.title.innerText = this.windowTitle.value;
				this.adjustTitleMarginToCenter();
			}));
		} else {
			// Menu Title
			const commandCenter = this.instantiationService.createInstance(CommandCenterControl, this.windowTitle, this.hoverDelegate);
			reset(this.title, commandCenter.element);
			this.titleDisposables.add(commandCenter);
			this.titleDisposables.add(commandCenter.onDidChangeVisibility(this.adjustTitleMarginToCenter, this));
		}
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.rootContainer = append(parent, $('.titlebar-container'));

		// Draggable region that we can manipulate for #52522
		this.dragRegion = prepend(this.rootContainer, $('div.titlebar-drag-region'));

		// App Icon (Native Windows/Linux and Web)
		if (!isMacintosh || isWeb) {
			this.appIcon = prepend(this.rootContainer, $('a.window-appicon'));

			// Web-only home indicator and menu
			if (isWeb) {
				const homeIndicator = this.environmentService.options?.homeIndicator;
				if (homeIndicator) {
					const icon: ThemeIcon = getIconRegistry().getIcon(homeIndicator.icon) ? { id: homeIndicator.icon } : Codicon.code;

					this.appIcon.setAttribute('href', homeIndicator.href);
					this.appIcon.classList.add(...ThemeIcon.asClassNameArray(icon));
					this.appIconBadge = document.createElement('div');
					this.appIconBadge.classList.add('home-bar-icon-badge');
					this.appIcon.appendChild(this.appIconBadge);
				}
			}
		}

		// Menubar: install a custom menu bar depending on configuration
		// and when not in activity bar
		if (this.titleBarStyle !== 'native'
			&& (!isMacintosh || isWeb)
			&& this.currentMenubarVisibility !== 'compact') {
			this.installMenubar();
		}

		// Title
		this.title = append(this.rootContainer, $('div.window-title'));
		this.updateTitle();


		if (this.titleBarStyle !== 'native') {
			this.layoutControls = append(this.rootContainer, $('div.layout-controls-container'));
			this.layoutControls.classList.toggle('show-layout-control', this.layoutControlEnabled);

			this.layoutToolbar = this.instantiationService.createInstance(MenuWorkbenchToolBar, this.layoutControls, MenuId.LayoutControlMenu, {
				contextMenu: MenuId.TitleBarContext,
				toolbarOptions: { primaryGroup: () => true },
				actionViewItemProvider: action => {
					return createActionViewItem(this.instantiationService, action, { hoverDelegate: this.hoverDelegate });
				}
			});
		}

		this.windowControls = append(this.element, $('div.window-controls-container'));

		// Context menu on title
		[EventType.CONTEXT_MENU, EventType.MOUSE_DOWN].forEach(event => {
			this._register(addDisposableListener(this.rootContainer, event, e => {
				if (e.type === EventType.CONTEXT_MENU || e.metaKey) {
					EventHelper.stop(e);
					this.onContextMenu(e, e.target === this.title ? MenuId.TitleBarTitleContext : MenuId.TitleBarContext);
				}
			}));
		});

		// Since the title area is used to drag the window, we do not want to steal focus from the
		// currently active element. So we restore focus after a timeout back to where it was.
		this._register(addDisposableListener(this.element, EventType.MOUSE_DOWN, e => {
			if (e.target && this.menubar && isAncestor(e.target as HTMLElement, this.menubar)) {
				return;
			}

			if (e.target && this.layoutToolbar && isAncestor(e.target as HTMLElement, this.layoutToolbar.getElement())) {
				return;
			}

			if (e.target && isAncestor(e.target as HTMLElement, this.title)) {
				return;
			}

			const active = document.activeElement;
			setTimeout(() => {
				if (active instanceof HTMLElement) {
					active.focus();
				}
			}, 0 /* need a timeout because we are in capture phase */);
		}, true /* use capture to know the currently active element properly */));

		this.updateStyles();

		const that = this;
		registerAction2(class FocusTitleBar extends Action2 {

			constructor() {
				super({
					id: `workbench.action.focusTitleBar`,
					title: { value: localize('focusTitleBar', "Focus Title Bar"), original: 'Focus Title Bar' },
					category: Categories.View,
					f1: true,
				});
			}

			run(accessor: ServicesAccessor, ...args: any[]): void {
				if (that.customMenubar) {
					that.customMenubar.toggleFocus();
				} else {
					(that.element.querySelector('[tabindex]:not([tabindex="-1"])') as HTMLElement).focus();
				}
			}
		});

		return this.element;
	}

	override updateStyles(): void {
		super.updateStyles();

		// Part container
		if (this.element) {
			if (this.isInactive) {
				this.element.classList.add('inactive');
			} else {
				this.element.classList.remove('inactive');
			}

			const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND, (color, theme) => {
				// LCD Rendering Support: the title bar part is a defining its own GPU layer.
				// To benefit from LCD font rendering, we must ensure that we always set an
				// opaque background color. As such, we compute an opaque color given we know
				// the background color is the workbench background.
				return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
			}) || '';
			this.element.style.backgroundColor = titleBackground;

			if (this.appIconBadge) {
				this.appIconBadge.style.backgroundColor = titleBackground;
			}

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

	protected onContextMenu(e: MouseEvent, menuId: MenuId): void {
		// Find target anchor
		const event = new StandardMouseEvent(e);
		const anchor = { x: event.posx, y: event.posy };

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			menuId,
			contextKeyService: this.contextKeyService,
			domForShadowRoot: isMacintosh && isNative ? event.target : undefined
		});
	}

	protected adjustTitleMarginToCenter(): void {
		const base = isMacintosh ? (this.windowControls?.clientWidth ?? 0) : 0;
		const leftMarker = base + (this.appIcon?.clientWidth ?? 0) + (this.menubar?.clientWidth ?? 0) + 10;
		const rightMarker = base + this.rootContainer.clientWidth - (this.layoutControls?.clientWidth ?? 0) - 10;

		// Not enough space to center the titlebar within window,
		// Center between left and right controls
		if (leftMarker > (this.rootContainer.clientWidth + (this.windowControls?.clientWidth ?? 0) - this.title.clientWidth) / 2 ||
			rightMarker < (this.rootContainer.clientWidth + (this.windowControls?.clientWidth ?? 0) + this.title.clientWidth) / 2) {
			this.title.style.position = '';
			this.title.style.left = '';
			this.title.style.transform = '';
			return;
		}

		this.title.style.position = 'absolute';
		this.title.style.left = `calc(50% - ${this.title.clientWidth / 2}px)`;
	}

	protected get currentMenubarVisibility(): MenuBarVisibility {
		return getMenuBarVisibility(this.configurationService);
	}

	private get layoutControlEnabled(): boolean {
		return this.configurationService.getValue<boolean>('workbench.layoutControl.enabled');
	}

	protected get useCounterZoom(): boolean {
		// Prevent zooming behavior if any of the following conditions are met:
		// 1. Shrinking below the window control size (zoom < 1)
		// 2. No custom items are present in the title bar
		const zoomFactor = getZoomFactor();

		const noMenubar = this.currentMenubarVisibility === 'hidden' || (!isWeb && isMacintosh);
		const noCommandCenter = !this.isCommandCenterVisible;
		const noLayoutControls = !this.layoutControlEnabled;
		return zoomFactor < 1 || (noMenubar && noCommandCenter && noLayoutControls);
	}

	updateLayout(dimension: Dimension): void {
		this.lastLayoutDimensions = dimension;

		if (getTitleBarStyle(this.configurationService) === 'custom') {
			const zoomFactor = getZoomFactor();

			this.element.style.setProperty('--zoom-factor', zoomFactor.toString());
			this.rootContainer.classList.toggle('counter-zoom', this.useCounterZoom);

			if (this.customMenubar) {
				const menubarDimension = new Dimension(0, dimension.height);
				this.customMenubar.layout(menubarDimension);
			}

			runAtThisOrScheduleAtNextAnimationFrame(() => this.adjustTitleMarginToCenter());
		}
	}

	override layout(width: number, height: number): void {
		this.updateLayout(new Dimension(width, height));

		super.layoutContents(width, height);
	}

	toJSON(): object {
		return {
			type: Parts.TITLEBAR_PART
		};
	}
}

registerThemingParticipant((theme, collector) => {
	const titlebarActiveFg = theme.getColor(TITLE_BAR_ACTIVE_FOREGROUND);
	if (titlebarActiveFg) {
		collector.addRule(`
		.monaco-workbench .part.titlebar .window-controls-container .window-icon {
			color: ${titlebarActiveFg};
		}
		`);
	}

	const titlebarInactiveFg = theme.getColor(TITLE_BAR_INACTIVE_FOREGROUND);
	if (titlebarInactiveFg) {
		collector.addRule(`
		.monaco-workbench .part.titlebar.inactive .window-controls-container .window-icon {
				color: ${titlebarInactiveFg};
			}
		`);
	}
});


class ToogleConfigAction extends Action2 {

	constructor(private readonly section: string, title: string, order: number) {
		super({
			id: `toggle.${section}`,
			title,
			toggled: ContextKeyExpr.equals(`config.${section}`, true),
			menu: { id: MenuId.TitleBarContext, order }
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]): void {
		const configService = accessor.get(IConfigurationService);
		const value = configService.getValue(this.section);
		configService.updateValue(this.section, !value);
	}
}

registerAction2(class ToogleCommandCenter extends ToogleConfigAction {
	constructor() {
		super('window.commandCenter', localize('toggle.commandCenter', 'Command Center'), 1);
	}
});

registerAction2(class ToogleLayoutControl extends ToogleConfigAction {
	constructor() {
		super('workbench.layoutControl.enabled', localize('toggle.layout', 'Layout Controls'), 2);
	}
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/titlebarpart';
import { localize } from 'vs/nls';
import { Part } from 'vs/workbench/browser/part';
import { ITitleService, ITitleProperties } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { MenuBarVisibility, getTitleBarStyle, getMenuBarVisibility } from 'vs/platform/window/common/window';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction, toAction } from 'vs/base/common/actions';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { DisposableStore, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { isMacintosh, isWindows, isLinux, isWeb } from 'vs/base/common/platform';
import { Color } from 'vs/base/common/color';
import { EventType, EventHelper, Dimension, isAncestor, append, $, addDisposableListener, runAtThisOrScheduleAtNextAnimationFrame, prepend, clearNode } from 'vs/base/browser/dom';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Parts, IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { createActionViewItem, createAndFillInContextMenuActions, DropdownWithDefaultActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, IMenu, MenuId, SubmenuItemAction, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { Codicon } from 'vs/base/common/codicons';
import { getIconRegistry } from 'vs/platform/theme/common/iconRegistry';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WindowTitle } from 'vs/workbench/browser/parts/titlebar/windowTitle';

export class TitlebarPart extends Part implements ITitleService {

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	get minimumHeight(): number { return 30 / (this.currentMenubarVisibility === 'hidden' || getZoomFactor() < 1 ? getZoomFactor() : 1); }
	get maximumHeight(): number { return this.minimumHeight; }

	//#endregion

	private _onMenubarVisibilityChange = this._register(new Emitter<boolean>());
	readonly onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;

	declare readonly _serviceBrand: undefined;

	protected rootContainer!: HTMLElement;
	protected windowControls: HTMLElement | undefined;
	protected title!: HTMLElement;

	protected customMenubar: CustomMenubarControl | undefined;
	protected appIcon: HTMLElement | undefined;
	private appIconBadge: HTMLElement | undefined;
	protected menubar?: HTMLElement;
	protected layoutControls: HTMLElement | undefined;
	private layoutToolbar: ToolBar | undefined;
	protected lastLayoutDimensions: Dimension | undefined;

	private readonly titleDisposables = this._register(new DisposableStore());
	private titleBarStyle: 'native' | 'custom';

	private isInactive: boolean = false;

	private readonly windowTitle: WindowTitle;

	private readonly contextMenu: IMenu;

	constructor(
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService protected readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(Parts.TITLEBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
		this.windowTitle = this._register(instantiationService.createInstance(WindowTitle));
		this.contextMenu = this._register(menuService.createMenu(MenuId.TitleBarContext, contextKeyService));

		this.titleBarStyle = getTitleBarStyle(this.configurationService);

		this.registerListeners();
	}

	updateProperties(properties: ITitleProperties): void {
		this.windowTitle.updateProperties(properties);
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
		}

		if (event.affectsConfiguration('window.experimental.titleMenu')) {
			this.updateTitle();
			this.adjustTitleMarginToCenter();
		}
	}

	protected onMenubarVisibilityChanged(visible: boolean): void {
		if (isWeb || isWindows || isLinux) {
			this.adjustTitleMarginToCenter();

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
	}

	protected installMenubar(): void {
		// If the menubar is already installed, skip
		if (this.menubar) {
			return;
		}

		this.customMenubar = this._register(this.instantiationService.createInstance(CustomMenubarControl));

		this.menubar = this.rootContainer.insertBefore($('div.menubar'), this.title);
		this.menubar.setAttribute('role', 'menubar');

		this.customMenubar.create(this.menubar);

		this._register(this.customMenubar.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));
	}

	private updateTitle(): void {
		this.titleDisposables.clear();
		const enableTitleMenu = this.configurationService.getValue<boolean>('window.experimental.titleMenu');
		this.title.classList.toggle('title-menu', enableTitleMenu);

		if (!enableTitleMenu) {
			// Text Title
			this.title.innerText = this.windowTitle.value;
			this.titleDisposables.add(this.windowTitle.onDidChange(() => {
				this.title.innerText = this.windowTitle.value;
				this.adjustTitleMarginToCenter();
			}));
		} else {
			// Menu Title
			clearNode(this.title);
			const that = this;
			const titleToolbar = new ToolBar(this.title, this.contextMenuService, {
				actionViewItemProvider: (action) => {

					if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.TitleMenuQuickPick) {
						class QuickInputDropDown extends DropdownWithDefaultActionViewItem {
							override render(container: HTMLElement): void {
								super.render(container);
								container.classList.add('quickopen');
								container.title = that.windowTitle.value;
								this._store.add(that.windowTitle.onDidChange(() => container.title = that.windowTitle.value));
							}
						}
						return that.instantiationService.createInstance(QuickInputDropDown, action, {
							keybindingProvider: action => that.keybindingService.lookupKeybinding(action.id),
							renderKeybindingWithDefaultActionLabel: true
						});
					}
					return undefined;
				}
			});
			const titleMenu = this.titleDisposables.add(this.menuService.createMenu(MenuId.TitleMenu, this.contextKeyService));
			const titleMenuDisposables = this.titleDisposables.add(new DisposableStore());
			const updateTitleMenu = () => {
				titleMenuDisposables.clear();
				const actions: IAction[] = [];
				titleMenuDisposables.add(createAndFillInContextMenuActions(titleMenu, undefined, actions));
				titleToolbar.setActions(actions);
			};
			this.titleDisposables.add(titleMenu.onDidChange(updateTitleMenu));
			this.titleDisposables.add(this.keybindingService.onDidUpdateKeybindings(updateTitleMenu));
			this.titleDisposables.add(toDisposable(() => clearNode(this.title)));
			updateTitleMenu();
		}
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.rootContainer = append(parent, $('.titlebar-container'));

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

			this.layoutToolbar = new ToolBar(this.layoutControls, this.contextMenuService, {
				actionViewItemProvider: action => {
					return createActionViewItem(this.instantiationService, action);
				},
				allowContextMenu: true
			});

			this._register(addDisposableListener(this.layoutControls, EventType.CONTEXT_MENU, e => {
				EventHelper.stop(e);

				this.onLayoutControlContextMenu(e, this.layoutControls!);
			}));


			const menu = this._register(this.menuService.createMenu(MenuId.LayoutControlMenu, this.contextKeyService));
			const updateLayoutMenu = () => {
				if (!this.layoutToolbar) {
					return;
				}

				const actions: IAction[] = [];
				const toDispose = createAndFillInContextMenuActions(menu, undefined, { primary: [], secondary: actions });

				this.layoutToolbar.setActions(actions);

				toDispose.dispose();
			};

			menu.onDidChange(updateLayoutMenu);
			updateLayoutMenu();
		}

		this.windowControls = append(this.element, $('div.window-controls-container'));

		// Context menu on title
		[EventType.CONTEXT_MENU, EventType.MOUSE_DOWN].forEach(event => {
			this._register(addDisposableListener(this.title, event, e => {
				if (e.type === EventType.CONTEXT_MENU || e.metaKey) {
					EventHelper.stop(e);

					this.onContextMenu(e);
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

	private onContextMenu(e: MouseEvent): void {
		// Find target anchor
		const event = new StandardMouseEvent(e);
		const anchor = { x: event.posx, y: event.posy };

		// Fill in contributed actions
		const actions: IAction[] = [];
		const actionsDisposable = createAndFillInContextMenuActions(this.contextMenu, undefined, actions);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => dispose(actionsDisposable)
		});
	}

	private onLayoutControlContextMenu(e: MouseEvent, el: HTMLElement): void {
		// Find target anchor
		const event = new StandardMouseEvent(e);
		const anchor = { x: event.posx, y: event.posy };

		const actions: IAction[] = [];
		actions.push(toAction({
			id: 'layoutControl.hide',
			label: localize('layoutControl.hide', "Hide Layout Control"),
			run: () => {
				this.configurationService.updateValue('workbench.layoutControl.enabled', false);
			}
		}));

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			domForShadowRoot: el
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

	updateLayout(dimension: Dimension): void {
		this.lastLayoutDimensions = dimension;

		if (getTitleBarStyle(this.configurationService) === 'custom') {
			// Prevent zooming behavior if any of the following conditions are met:
			// 1. Native macOS
			// 2. Menubar is hidden
			// 3. Shrinking below the window control size (zoom < 1)
			const zoomFactor = getZoomFactor();
			this.element.style.setProperty('--zoom-factor', zoomFactor.toString());
			this.rootContainer.classList.toggle('counter-zoom', zoomFactor < 1 || (!isWeb && isMacintosh) || this.currentMenubarVisibility === 'hidden');

			runAtThisOrScheduleAtNextAnimationFrame(() => this.adjustTitleMarginToCenter());

			if (this.customMenubar) {
				const menubarDimension = new Dimension(0, dimension.height);
				this.customMenubar.layout(menubarDimension);
			}
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

MenuRegistry.appendMenuItem(MenuId.TitleMenu, {
	submenu: MenuId.TitleMenuQuickPick,
	title: localize('title', "Select Mode"),
	order: Number.MAX_SAFE_INTEGER
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activitybarpart';
import 'vs/css!./media/activityaction';
import { localize } from 'vs/nls';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { Part } from 'vs/workbench/browser/part';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ToggleSidebarPositionAction } from 'vs/workbench/browser/actions/layoutActions';
import { IThemeService, IColorTheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER } from 'vs/workbench/common/theme';
import { activeContrastBorder, contrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { addDisposableListener, EventType, isAncestor } from 'vs/base/browser/dom';
import { ICompositeBarColors, IActivityHoverOptions } from 'vs/workbench/browser/parts/compositeBarActions';
import { assertIsDefined } from 'vs/base/common/types';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getMenuBarVisibility } from 'vs/platform/window/common/window';
import { IAction, Separator, SubmenuAction, toAction } from 'vs/base/common/actions';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { GestureEvent } from 'vs/base/browser/touch';
import { IPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';
import { PaneCompositeBar } from 'vs/workbench/browser/parts/paneCompositeBar';
import { GlobalCompositeBar } from 'vs/workbench/browser/parts/globalCompositeBar';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Action2, IAction2Options, IMenuService, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ViewContainerLocation, ViewContainerLocationToString } from 'vs/workbench/common/views';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

export class ActivitybarPart extends Part {

	private static readonly ACTION_HEIGHT = 48;

	static readonly pinnedViewContainersKey = 'workbench.activity.pinnedViewlets2';
	static readonly placeholderViewContainersKey = 'workbench.activity.placeholderViewlets';

	//#region IView

	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 48;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	private content: HTMLElement | undefined;

	private menuBar: CustomMenubarControl | undefined;
	private menuBarContainer: HTMLElement | undefined;

	private compositeBarContainer: HTMLElement | undefined;
	private readonly compositeBar: PaneCompositeBar;
	private readonly globalCompositeBar: GlobalCompositeBar;

	private readonly keyboardNavigationDisposables = this._register(new DisposableStore());

	constructor(
		private readonly paneCompositePart: IPaneCompositePart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
		this.compositeBar = this.createCompositeBar();
		this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.compositeBar.getContextMenuActions(), (theme: IColorTheme) => this.getActivitybarItemColors(theme), this.getActivityHoverOptions()));
		this.registerListeners();
	}

	private createCompositeBar(): PaneCompositeBar {
		return this._register(this.instantiationService.createInstance(PaneCompositeBar, {
			partContainerClass: 'activitybar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			orientation: ActionsOrientation.VERTICAL,
			icon: true,
			iconSize: 24,
			activityHoverOptions: this.getActivityHoverOptions(),
			preventLoopNavigation: true,
			recomputeSizes: false,
			fillExtraContextMenuActions: (actions, e?: MouseEvent | GestureEvent) => {
				// Menu
				const menuBarVisibility = getMenuBarVisibility(this.configurationService);
				if (menuBarVisibility === 'compact' || menuBarVisibility === 'hidden' || menuBarVisibility === 'toggle') {
					actions.unshift(...[toAction({ id: 'toggleMenuVisibility', label: localize('menu', "Menu"), checked: menuBarVisibility === 'compact', run: () => this.configurationService.updateValue('window.menuBarVisibility', menuBarVisibility === 'compact' ? 'toggle' : 'compact') }), new Separator()]);
				}

				if (menuBarVisibility === 'compact' && this.menuBarContainer && e?.target) {
					if (isAncestor(e.target as Node, this.menuBarContainer)) {
						actions.unshift(...[toAction({ id: 'hideCompactMenu', label: localize('hideMenu', "Hide Menu"), run: () => this.configurationService.updateValue('window.menuBarVisibility', 'toggle') }), new Separator()]);
					}
				}

				// Global Composite Bar
				actions.push(new Separator());
				actions.push(...this.globalCompositeBar.getContextMenuActions());
				actions.push(new Separator());

				actions.push(...this.getActivityBarContextMenuActions());

			},
			compositeSize: 52,
			colors: (theme: IColorTheme) => this.getActivitybarItemColors(theme),
			overflowActionSize: ActivitybarPart.ACTION_HEIGHT,
		}, Parts.ACTIVITYBAR_PART, this.paneCompositePart));
	}

	private getActivityHoverOptions(): IActivityHoverOptions {
		return {
			position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT,
		};
	}

	private registerListeners(): void {
		// Register for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.menuBarVisibility')) {
				if (getMenuBarVisibility(this.configurationService) === 'compact') {
					this.installMenubar();
				} else {
					this.uninstallMenubar();
				}
			}
		}));
	}

	getActivityBarContextMenuActions(): IAction[] {
		const activityBarPositionMenu = this.menuService.createMenu(MenuId.ActivityBarPositionMenu, this.contextKeyService);
		const positionActions: IAction[] = [];
		createAndFillInContextMenuActions(activityBarPositionMenu, { shouldForwardArgs: true, renderShortTitle: true }, { primary: [], secondary: positionActions });
		activityBarPositionMenu.dispose();
		return [
			new SubmenuAction('workbench.action.panel.position', localize('activity bar position', "Activity Bar Position"), positionActions),
			toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarPositionAction().run(accessor)) })
		];
	}

	showActivity(viewContainerOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		const disposable = this.globalCompositeBar.showActivity(viewContainerOrActionId, badge, clazz, priority);
		if (disposable) {
			return disposable;
		}
		return this.compositeBar.showActivity(viewContainerOrActionId, badge, clazz, priority);
	}

	private uninstallMenubar() {
		if (this.menuBar) {
			this.menuBar.dispose();
			this.menuBar = undefined;
		}

		if (this.menuBarContainer) {
			this.menuBarContainer.remove();
			this.menuBarContainer = undefined;
			this.registerKeyboardNavigationListeners();
		}
	}

	private installMenubar() {
		if (this.menuBar) {
			return; // prevent menu bar from installing twice #110720
		}

		this.menuBarContainer = document.createElement('div');
		this.menuBarContainer.classList.add('menubar');

		const content = assertIsDefined(this.content);
		content.prepend(this.menuBarContainer);

		// Menubar: install a custom menu bar depending on configuration
		this.menuBar = this._register(this.instantiationService.createInstance(CustomMenubarControl));
		this.menuBar.create(this.menuBarContainer);

		this.registerKeyboardNavigationListeners();
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		this.content = document.createElement('div');
		this.content.classList.add('content');
		parent.appendChild(this.content);

		// Install menubar if compact
		if (getMenuBarVisibility(this.configurationService) === 'compact') {
			this.installMenubar();
		}

		// View Containers action bar
		this.compositeBarContainer = this.compositeBar.create(this.content);

		// Global action bar
		this.globalCompositeBar.create(this.content);

		// Keyboard Navigation
		this.registerKeyboardNavigationListeners();

		return this.content;
	}

	private registerKeyboardNavigationListeners(): void {
		this.keyboardNavigationDisposables.clear();

		// Up/Down arrow on compact menu
		if (this.menuBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.compositeBar?.focus();
				}
			}));
		}

		// Up/Down on Activity Icons
		if (this.compositeBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.globalCompositeBar.focus();
				} else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.menuBar?.toggleFocus();
				}
			}));
		}

		// Up arrow on global icons
		this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, e => {
			const kbEvent = new StandardKeyboardEvent(e);
			if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
				this.compositeBar?.focus(this.getVisiblePaneCompositeIds().length - 1);
			}
		}));
	}

	getPinnedPaneCompositeIds(): string[] {
		return this.compositeBar.getPinnedPaneCompositeIds();
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.compositeBar.getVisiblePaneCompositeIds();
	}

	focus(): void {
		this.compositeBar.focus();
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || '';
		container.style.backgroundColor = background;

		const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || '';
		container.classList.toggle('bordered', !!borderColor);
		container.style.borderColor = borderColor ? borderColor : '';
	}

	private getActivitybarItemColors(theme: IColorTheme): ICompositeBarColors {
		return {
			activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
			inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
			activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
			activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
			badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
			badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
			dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
			activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
		};
	}

	override layout(width: number, height: number): void {
		if (!this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			return;
		}

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout composite bar
		let availableHeight = contentAreaSize.height;
		if (this.menuBarContainer) {
			availableHeight -= this.menuBarContainer.clientHeight;
		}
		availableHeight -= (this.globalCompositeBar.size() * ActivitybarPart.ACTION_HEIGHT); // adjust height for global actions showing
		this.compositeBar.layout(width, availableHeight);
	}

	toJSON(): object {
		return {
			type: Parts.ACTIVITYBAR_PART
		};
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.side',
			title: {
				value: localize('positionActivityBarSide', 'Move Activity Bar to Side'),
				original: 'Move Activity Bar to Side',
				mnemonicTitle: localize({ key: 'miSideActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Side"),
			},
			shortTitle: localize('side', "Side"),
			category: Categories.View,
			f1: true,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.SIDE),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 1
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.SIDE),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.SIDE);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.top',
			title: {
				value: localize('positionActivityBarTop', 'Move Activity Bar to Top'),
				original: 'Move Activity Bar to Top',
				mnemonicTitle: localize({ key: 'miTopActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Top"),
			},
			shortTitle: localize('top', "Top"),
			category: Categories.View,
			f1: true,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 2
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.TOP);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.hide',
			title: {
				value: localize('hideActivityBar', 'Hide Activity Bar'),
				original: 'Hide Activity Bar',
				mnemonicTitle: localize({ key: 'miHideActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Hidden"),
			},
			shortTitle: localize('hide', "Hidden"),
			category: Categories.View,
			f1: true,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 3
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.HIDDEN);
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.ActivityBarPositionMenu,
	title: localize('positionActivituBar', "Activity Bar Position"),
	group: '3_workbench_layout_move',
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.ViewContainerTitleContext, {
	submenu: MenuId.ActivityBarPositionMenu,
	title: localize('positionActivituBar', "Activity Bar Position"),
	when: ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(ViewContainerLocation.Sidebar)),
	group: '3_workbench_layout_move',
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.ViewTitleContext, {
	submenu: MenuId.ActivityBarPositionMenu,
	title: localize('positionActivituBar', "Activity Bar Position"),
	when: ContextKeyExpr.equals('viewLocation', ViewContainerLocationToString(ViewContainerLocation.Sidebar)),
	group: '3_workbench_layout_move',
	order: 1
});

class SwitchSideBarViewAction extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private readonly offset: number
	) {
		super(desc);
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);

		const visibleViewletIds = paneCompositeService.getVisiblePaneCompositeIds(ViewContainerLocation.Sidebar);

		const activeViewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
		if (!activeViewlet) {
			return;
		}
		let targetViewletId: string | undefined;
		for (let i = 0; i < visibleViewletIds.length; i++) {
			if (visibleViewletIds[i] === activeViewlet.getId()) {
				targetViewletId = visibleViewletIds[(i + visibleViewletIds.length + this.offset) % visibleViewletIds.length];
				break;
			}
		}

		await paneCompositeService.openPaneComposite(targetViewletId, ViewContainerLocation.Sidebar, true);
	}
}

registerAction2(
	class PreviousSideBarViewAction extends SwitchSideBarViewAction {
		constructor() {
			super({
				id: 'workbench.action.previousSideBarView',
				title: { value: localize('previousSideBarView', "Previous Primary Side Bar View"), original: 'Previous Primary Side Bar View' },
				category: Categories.View,
				f1: true
			}, -1);
		}
	}
);

registerAction2(
	class NextSideBarViewAction extends SwitchSideBarViewAction {
		constructor() {
			super({
				id: 'workbench.action.nextSideBarView',
				title: { value: localize('nextSideBarView', "Next Primary Side Bar View"), original: 'Next Primary Side Bar View' },
				category: Categories.View,
				f1: true
			}, 1);
		}
	}
);

registerAction2(
	class FocusActivityBarAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.focusActivityBar',
				title: { value: localize('focusActivityBar', "Focus Activity Bar"), original: 'Focus Activity Bar' },
				category: Categories.View,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
			layoutService.focusPart(Parts.ACTIVITYBAR_PART);
		}
	});

registerThemingParticipant((theme, collector) => {

	const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
	if (activityBarActiveBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
	}

	const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
	if (activityBarActiveFocusBorderColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
	}

	const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
	if (activityBarActiveBackgroundColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:before {
				content: "";
				position: absolute;
				top: 8px;
				left: 8px;
				height: 32px;
				width: 32px;
				z-index: 1;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.profile-activity-item:before {
				top: -6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover:before {
				outline: 1px solid;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover:before {
				outline: 1px dashed;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover:before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover:before {
				outline-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
						border-left-color: ${focusBorderColor};
					}
				`);
		}
	}
});

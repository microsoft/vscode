/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activitybarpart';
import 'vs/css!./media/activityaction';
import { localize, localize2 } from 'vs/nls';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { Part } from 'vs/workbench/browser/part';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { ToggleSidebarPositionAction } from 'vs/workbench/browser/actions/layoutActions';
import { IThemeService, IColorTheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER } from 'vs/workbench/common/theme';
import { activeContrastBorder, contrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { addDisposableListener, append, EventType, isAncestor, $, clearNode } from 'vs/base/browser/dom';
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
import { IPaneCompositeBarOptions, PaneCompositeBar } from 'vs/workbench/browser/parts/paneCompositeBar';
import { GlobalCompositeBar } from 'vs/workbench/browser/parts/globalCompositeBar';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Action2, IAction2Options, IMenuService, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IViewDescriptorService, ViewContainerLocation, ViewContainerLocationToString } from 'vs/workbench/common/views';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class ActivitybarPart extends Part {

	static readonly ACTION_HEIGHT = 48;

	static readonly pinnedViewContainersKey = 'workbench.activity.pinnedViewlets2';
	static readonly placeholderViewContainersKey = 'workbench.activity.placeholderViewlets';
	static readonly viewContainersWorkspaceStateKey = 'workbench.activity.viewletsWorkspaceState';

	//#region IView

	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 48;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	private readonly compositeBar = this._register(new MutableDisposable<PaneCompositeBar>());
	private content: HTMLElement | undefined;

	constructor(
		private readonly paneCompositePart: IPaneCompositePart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {
		super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	private createCompositeBar(): PaneCompositeBar {
		return this.instantiationService.createInstance(ActivityBarCompositeBar, {
			partContainerClass: 'activitybar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
			orientation: ActionsOrientation.VERTICAL,
			icon: true,
			iconSize: 24,
			activityHoverOptions: {
				position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT,
			},
			preventLoopNavigation: true,
			recomputeSizes: false,
			fillExtraContextMenuActions: (actions, e?: MouseEvent | GestureEvent) => { },
			compositeSize: 52,
			colors: (theme: IColorTheme) => ({
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
				activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
				activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
				activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
			}),
			overflowActionSize: ActivitybarPart.ACTION_HEIGHT,
		}, Parts.ACTIVITYBAR_PART, this.paneCompositePart, true);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.content = append(this.element, $('.content'));

		if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			this.show();
		}

		return this.content;
	}

	getPinnedPaneCompositeIds(): string[] {
		return this.compositeBar.value?.getPinnedPaneCompositeIds() ?? [];
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.compositeBar.value?.getVisiblePaneCompositeIds() ?? [];
	}

	focus(): void {
		this.compositeBar.value?.focus();
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

	show(focus?: boolean): void {
		if (!this.content) {
			return;
		}

		if (!this.compositeBar.value) {
			this.compositeBar.value = this.createCompositeBar();
			this.compositeBar.value.create(this.content);

			if (this.dimension) {
				this.layout(this.dimension.width, this.dimension.height);
			}
		}

		if (focus) {
			this.focus();
		}
	}

	hide(): void {
		if (!this.compositeBar.value) {
			return;
		}

		this.compositeBar.clear();

		if (this.content) {
			clearNode(this.content);
		}
	}

	override layout(width: number, height: number): void {
		super.layout(width, height, 0, 0);

		if (!this.compositeBar.value) {
			return;
		}

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout composite bar
		this.compositeBar.value.layout(width, contentAreaSize.height);
	}

	toJSON(): object {
		return {
			type: Parts.ACTIVITYBAR_PART
		};
	}
}

export class ActivityBarCompositeBar extends PaneCompositeBar {

	private element: HTMLElement | undefined;

	private menuBar: CustomMenubarControl | undefined;
	private menuBarContainer: HTMLElement | undefined;
	private compositeBarContainer: HTMLElement | undefined;
	private readonly globalCompositeBar: GlobalCompositeBar | undefined;

	private readonly keyboardNavigationDisposables = this._register(new DisposableStore());

	constructor(
		options: IPaneCompositeBarOptions,
		part: Parts,
		paneCompositePart: IPaneCompositePart,
		showGlobalActivities: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMenuService private readonly menuService: IMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super({
			...options,
			fillExtraContextMenuActions: (actions, e) => {
				options.fillExtraContextMenuActions(actions, e);
				this.fillContextMenuActions(actions, e);
			}
		}, part, paneCompositePart, instantiationService, storageService, extensionService, viewDescriptorService, contextKeyService, environmentService, layoutService);

		if (showGlobalActivities) {
			this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.getContextMenuActions(), (theme: IColorTheme) => this.options.colors(theme), this.options.activityHoverOptions));
		}

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

	private fillContextMenuActions(actions: IAction[], e?: MouseEvent | GestureEvent) {
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
		if (this.globalCompositeBar) {
			actions.push(new Separator());
			actions.push(...this.globalCompositeBar.getContextMenuActions());
		}
		actions.push(new Separator());
		actions.push(...this.getActivityBarContextMenuActions());
	}

	private uninstallMenubar() {
		if (this.menuBar) {
			this.menuBar.dispose();
			this.menuBar = undefined;
		}

		if (this.menuBarContainer) {
			this.menuBarContainer.remove();
			this.menuBarContainer = undefined;
		}
	}

	private installMenubar() {
		if (this.menuBar) {
			return; // prevent menu bar from installing twice #110720
		}

		this.menuBarContainer = document.createElement('div');
		this.menuBarContainer.classList.add('menubar');

		const content = assertIsDefined(this.element);
		content.prepend(this.menuBarContainer);

		// Menubar: install a custom menu bar depending on configuration
		this.menuBar = this._register(this.instantiationService.createInstance(CustomMenubarControl));
		this.menuBar.create(this.menuBarContainer);

	}

	private registerKeyboardNavigationListeners(): void {
		this.keyboardNavigationDisposables.clear();

		// Up/Down or Left/Right arrow on compact menu
		if (this.menuBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.focus();
				}
			}));
		}

		// Up/Down on Activity Icons
		if (this.compositeBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.globalCompositeBar?.focus();
				} else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.menuBar?.toggleFocus();
				}
			}));
		}

		// Up arrow on global icons
		if (this.globalCompositeBar) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.focus(this.getVisiblePaneCompositeIds().length - 1);
				}
			}));
		}
	}

	override create(parent: HTMLElement): HTMLElement {
		this.element = parent;

		// Install menubar if compact
		if (getMenuBarVisibility(this.configurationService) === 'compact') {
			this.installMenubar();
		}

		// View Containers action bar
		this.compositeBarContainer = super.create(this.element);

		// Global action bar
		if (this.globalCompositeBar) {
			this.globalCompositeBar.create(this.element);
		}

		// Keyboard Navigation
		this.registerKeyboardNavigationListeners();

		return this.compositeBarContainer;
	}

	override layout(width: number, height: number): void {
		if (this.menuBarContainer) {
			if (this.options.orientation === ActionsOrientation.VERTICAL) {
				height -= this.menuBarContainer.clientHeight;
			} else {
				width -= this.menuBarContainer.clientWidth;
			}
		}
		if (this.globalCompositeBar) {
			if (this.options.orientation === ActionsOrientation.VERTICAL) {
				height -= (this.globalCompositeBar.size() * ActivitybarPart.ACTION_HEIGHT);
			} else {
				width -= this.globalCompositeBar.element.clientWidth;
			}
		}
		super.layout(width, height);
	}

	getActivityBarContextMenuActions(): IAction[] {
		const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
		const positionActions: IAction[] = [];
		createAndFillInContextMenuActions(activityBarPositionMenu, { primary: [], secondary: positionActions });
		return [
			new SubmenuAction('workbench.action.panel.position', localize('activity bar position', "Activity Bar Position"), positionActions),
			toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarPositionAction().run(accessor)) })
		];
	}

}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.default',
			title: {
				...localize2('positionActivityBarDefault', 'Move Activity Bar to Side'),
				mnemonicTitle: localize({ key: 'miDefaultActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Default"),
			},
			shortTitle: localize('default', "Default"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 1
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.DEFAULT);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.top',
			title: {
				...localize2('positionActivityBarTop', 'Move Activity Bar to Top'),
				mnemonicTitle: localize({ key: 'miTopActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Top"),
			},
			shortTitle: localize('top', "Top"),
			category: Categories.View,
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
			id: 'workbench.action.activityBarLocation.bottom',
			title: {
				...localize2('positionActivityBarBottom', 'Move Activity Bar to Bottom'),
				mnemonicTitle: localize({ key: 'miBottomActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Bottom"),
			},
			shortTitle: localize('bottom', "Bottom"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 3
			}, {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
			}]
		});
	}
	run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.BOTTOM);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.activityBarLocation.hide',
			title: {
				...localize2('hideActivityBar', 'Hide Activity Bar'),
				mnemonicTitle: localize({ key: 'miHideActivityBar', comment: ['&& denotes a mnemonic'] }, "&&Hidden"),
			},
			shortTitle: localize('hide', "Hidden"),
			category: Categories.View,
			toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
			menu: [{
				id: MenuId.ActivityBarPositionMenu,
				order: 4
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
	order: 2
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
				title: localize2('previousSideBarView', 'Previous Primary Side Bar View'),
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
				title: localize2('nextSideBarView', 'Next Primary Side Bar View'),
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
				title: localize2('focusActivityBar', 'Focus Activity Bar'),
				category: Categories.View,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const layoutService = accessor.get(IWorkbenchLayoutService);
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
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label::before{
				padding: 6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover .action-label::before {
				outline: 1px solid ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label::before {
				outline: 1px dashed ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator::before {
						border-left-color: ${focusBorderColor};
					}
				`);
		}
	}
});

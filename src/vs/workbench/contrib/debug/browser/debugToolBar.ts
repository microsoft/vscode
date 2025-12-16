/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import { ActionBar, ActionsOrientation, IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CodeWindow, mainWindow } from '../../../../base/browser/window.js';
import { Action, IAction, IRunEvent, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import * as arrays from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import * as errors from '../../../../base/common/errors.js';
import { DisposableStore, markAsSingleton, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Platform, platform } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../nls.js';
import { ICommandAction, ICommandActionTitle } from '../../../../platform/action/common/action.js';
import { DropdownWithPrimaryActionViewItem, IDropdownWithPrimaryActionViewItemOptions } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { createActionViewItem, getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenu, IMenuService, MenuId, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { widgetBorder, widgetShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { getTitleBarStyle, TitlebarStyle } from '../../../../platform/window/common/window.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorTabsMode, IWorkbenchLayoutService, LayoutSettings, Parts } from '../../../services/layout/browser/layoutService.js';
import { CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_IN_DEBUG_MODE, CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, IDebugConfiguration, IDebugService, State, VIEWLET_ID } from '../common/debug.js';
import { FocusSessionActionViewItem } from './debugActionViewItems.js';
import { debugToolBarBackground, debugToolBarBorder } from './debugColors.js';
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, REVERSE_CONTINUE_ID, STEP_BACK_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from './debugCommands.js';
import * as icons from './debugIcons.js';
import './media/debugToolBar.css';

const DEBUG_TOOLBAR_POSITION_KEY = 'debug.actionswidgetposition';
const DEBUG_TOOLBAR_Y_KEY = 'debug.actionswidgety';

export class DebugToolBar extends Themable implements IWorkbenchContribution {

	private $el: HTMLElement;
	private dragArea: HTMLElement;
	private actionBar: ActionBar;
	private activeActions: IAction[];
	private updateScheduler: RunOnceScheduler;
	private debugToolBarMenu: IMenu;

	private isVisible = false;
	private isBuilt = false;

	private readonly stopActionViewItemDisposables = this._register(new DisposableStore());
	/** coordinate of the debug toolbar per aux window */
	private readonly auxWindowCoordinates = new WeakMap<CodeWindow, { x: number; y: number | undefined }>();

	private readonly trackPixelRatioListener = this._register(new MutableDisposable());

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IDebugService private readonly debugService: IDebugService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(themeService);

		this.$el = dom.$('div.debug-toolbar');

		// Note: changes to this setting require a restart, so no need to listen to it.
		const controlsOnTitlebar = getTitleBarStyle(this.configurationService) === TitlebarStyle.CUSTOM;

		// Do not allow the widget to overflow or underflow window controls.
		// Use CSS calculations to avoid having to force layout with `.clientWidth`
		const controlsOnLeft = controlsOnTitlebar && platform === Platform.Mac;
		const controlsOnRight = controlsOnTitlebar && (platform === Platform.Windows || platform === Platform.Linux);
		this.$el.style.transform = `translate(
			min(
				max(${controlsOnLeft ? '60px' : '0px'}, calc(-50% + (100vw * var(--x-position)))),
				calc(100vw - 100% - ${controlsOnRight ? '100px' : '0px'})
			),
			var(--y-position)
		)`;

		this.dragArea = dom.append(this.$el, dom.$('div.drag-area' + ThemeIcon.asCSSSelector(icons.debugGripper)));

		const actionBarContainer = dom.append(this.$el, dom.$('div.action-bar-container'));
		this.debugToolBarMenu = menuService.createMenu(MenuId.DebugToolBar, contextKeyService);
		this._register(this.debugToolBarMenu);

		this.activeActions = [];
		this.actionBar = this._register(new ActionBar(actionBarContainer, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionViewItemProvider: (action: IAction, options: IBaseActionViewItemOptions) => {
				if (action.id === FOCUS_SESSION_ID) {
					return this.instantiationService.createInstance(FocusSessionActionViewItem, action, undefined);
				} else if (action.id === STOP_ID || action.id === DISCONNECT_ID) {
					this.stopActionViewItemDisposables.clear();
					const item = this.instantiationService.invokeFunction(accessor => createDisconnectMenuItemAction(action as MenuItemAction, this.stopActionViewItemDisposables, accessor, { hoverDelegate: options.hoverDelegate }));
					if (item) {
						return item;
					}
				}

				return createActionViewItem(this.instantiationService, action, options);
			}
		}));

		this.updateScheduler = this._register(new RunOnceScheduler(() => {
			const state = this.debugService.state;
			const toolBarLocation = this.configurationService.getValue<IDebugConfiguration>('debug').toolBarLocation;
			if (
				state === State.Inactive ||
				toolBarLocation !== 'floating' ||
				this.debugService.getModel().getSessions().every(s => s.suppressDebugToolbar) ||
				(state === State.Initializing && this.debugService.initializingOptions?.suppressDebugToolbar)
			) {
				return this.hide();
			}

			const actions = getFlatActionBarActions(this.debugToolBarMenu.getActions({ shouldForwardArgs: true }));
			if (!arrays.equals(actions, this.activeActions, (first, second) => first.id === second.id && first.enabled === second.enabled)) {
				this.actionBar.clear();
				this.actionBar.push(actions, { icon: true, label: false });
				this.activeActions = actions;
			}

			this.show();
		}, 20));

		this.updateStyles();
		this.registerListeners();
		this.hide();
	}

	private registerListeners(): void {
		this._register(this.debugService.onDidChangeState(() => this.updateScheduler.schedule()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.toolBarLocation')) {
				this.updateScheduler.schedule();
			}
			if (e.affectsConfiguration(LayoutSettings.EDITOR_TABS_MODE) || e.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
				this._yRange = undefined;
				this.setCoordinates();
			}
		}));
		this._register(this.debugToolBarMenu.onDidChange(() => this.updateScheduler.schedule()));
		this._register(this.actionBar.actionRunner.onDidRun((e: IRunEvent) => {
			// check for error
			if (e.error && !errors.isCancellationError(e.error)) {
				this.notificationService.warn(e.error);
			}

			// log in telemetry
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: e.action.id, from: 'debugActionsWidget' });
		}));

		this._register(dom.addDisposableGenericMouseUpListener(this.dragArea, (event: MouseEvent) => {
			const mouseClickEvent = new StandardMouseEvent(dom.getWindow(this.dragArea), event);
			if (mouseClickEvent.detail === 2) {
				// double click on debug bar centers it again #8250
				this.setCoordinates(0.5, this.yDefault);
				this.storePosition();
			}
		}));

		this._register(dom.addDisposableGenericMouseDownListener(this.dragArea, (e: MouseEvent) => {
			this.dragArea.classList.add('dragged');
			const activeWindow = dom.getWindow(this.layoutService.activeContainer);
			const originEvent = new StandardMouseEvent(activeWindow, e);

			const originX = this.computeCurrentXPercent();
			const originY = this.getCurrentYPosition();

			const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e: MouseEvent) => {
				const mouseMoveEvent = new StandardMouseEvent(activeWindow, e);
				// Prevent default to stop editor selecting text #8524
				mouseMoveEvent.preventDefault();
				this.setCoordinates(
					originX + (mouseMoveEvent.posx - originEvent.posx) / activeWindow.innerWidth,
					originY + mouseMoveEvent.posy - originEvent.posy,
				);
			});

			const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e: MouseEvent) => {
				this.storePosition();
				this.dragArea.classList.remove('dragged');

				mouseMoveListener.dispose();
				mouseUpListener.dispose();
			});
		}));

		this._register(this.layoutService.onDidChangePartVisibility(() => this.setCoordinates()));

		this._register(this.layoutService.onDidChangeActiveContainer(async () => {
			this._yRange = undefined;

			// note: we intentionally don't keep the activeContainer before the
			// `await` clause to avoid any races due to quickly switching windows.
			await this.layoutService.whenContainerStylesLoaded(dom.getWindow(this.layoutService.activeContainer));
			if (this.isBuilt) {
				this.doShowInActiveContainer();
				this.setCoordinates();
			}
		}));
	}

	/**
	 * Computes the x percent position at which the toolbar is currently displayed.
	 */
	private computeCurrentXPercent(): number {
		const { left, width } = this.$el.getBoundingClientRect();
		return (left + width / 2) / dom.getWindow(this.$el).innerWidth;
	}

	/**
	 * Gets the x position set in the style of the toolbar. This may not be its
	 * actual position on screen depending on toolbar locations.
	 */
	private getCurrentXPercent(): number {
		return Number(this.$el.style.getPropertyValue('--x-position'));
	}

	/** Gets the y position set in the style of the toolbar */
	private getCurrentYPosition(): number {
		return parseInt(this.$el.style.getPropertyValue('--y-position'));
	}

	private storePosition(): void {
		const activeWindow = dom.getWindow(this.layoutService.activeContainer);
		const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;

		const x = this.getCurrentXPercent();
		const y = this.getCurrentYPosition();
		if (isMainWindow) {
			this.storageService.store(DEBUG_TOOLBAR_POSITION_KEY, x, StorageScope.PROFILE, StorageTarget.MACHINE);
			this.storageService.store(DEBUG_TOOLBAR_Y_KEY, y, StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.auxWindowCoordinates.set(activeWindow, { x, y });
		}
	}

	override updateStyles(): void {
		super.updateStyles();

		if (this.$el) {
			this.$el.style.backgroundColor = this.getColor(debugToolBarBackground) || '';

			const widgetShadowColor = this.getColor(widgetShadow);
			this.$el.style.boxShadow = widgetShadowColor ? `0 0 8px 2px ${widgetShadowColor}` : '';

			const contrastBorderColor = this.getColor(widgetBorder);
			const borderColor = this.getColor(debugToolBarBorder);

			if (contrastBorderColor) {
				this.$el.style.border = `1px solid ${contrastBorderColor}`;
			} else {
				this.$el.style.border = borderColor ? `solid ${borderColor}` : 'none';
				this.$el.style.border = '1px 0';
			}
		}
	}

	/** Gets the stored X position of the middle of the toolbar based on the current window width */
	private getStoredXPosition() {
		const currentWindow = dom.getWindow(this.layoutService.activeContainer);
		const isMainWindow = currentWindow === mainWindow;
		const storedPercentage = isMainWindow
			? Number(this.storageService.get(DEBUG_TOOLBAR_POSITION_KEY, StorageScope.PROFILE))
			: this.auxWindowCoordinates.get(currentWindow)?.x;
		return storedPercentage !== undefined && !isNaN(storedPercentage) ? storedPercentage : 0.5;
	}

	private getStoredYPosition() {
		const currentWindow = dom.getWindow(this.layoutService.activeContainer);
		const isMainWindow = currentWindow === mainWindow;
		const storedY = isMainWindow
			? this.storageService.getNumber(DEBUG_TOOLBAR_Y_KEY, StorageScope.PROFILE)
			: this.auxWindowCoordinates.get(currentWindow)?.y;
		return storedY ?? this.yDefault;
	}

	private setCoordinates(x?: number, y?: number): void {
		if (!this.isVisible) {
			return;
		}

		x ??= this.getStoredXPosition();
		y ??= this.getStoredYPosition();

		const [yMin, yMax] = this.yRange;
		y = Math.max(yMin, Math.min(y, yMax));
		this.$el.style.setProperty('--x-position', `${x}`);
		this.$el.style.setProperty('--y-position', `${y}px`);
	}

	private get yDefault() {
		return this.layoutService.mainContainerOffset.top;
	}

	private _yRange: [number, number] | undefined;
	private get yRange(): [number, number] {
		if (!this._yRange) {
			const isTitleBarVisible = this.layoutService.isVisible(Parts.TITLEBAR_PART, dom.getWindow(this.layoutService.activeContainer));
			const yMin = isTitleBarVisible ? 0 : this.layoutService.mainContainerOffset.top;
			let yMax = 0;

			if (isTitleBarVisible) {
				if (this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) === true) {
					yMax += 35;
				} else {
					yMax += 28;
				}
			}

			if (this.configurationService.getValue(LayoutSettings.EDITOR_TABS_MODE) !== EditorTabsMode.NONE) {
				yMax += 35;
			}
			this._yRange = [yMin, yMax];
		}
		return this._yRange;
	}

	private show(): void {
		if (this.isVisible) {
			this.setCoordinates();
			return;
		}
		if (!this.isBuilt) {
			this.isBuilt = true;
			this.doShowInActiveContainer();
		}

		this.isVisible = true;
		dom.show(this.$el);
		this.setCoordinates();
	}

	private doShowInActiveContainer(): void {
		this.layoutService.activeContainer.appendChild(this.$el);
		this.trackPixelRatioListener.value = PixelRatio.getInstance(dom.getWindow(this.$el)).onDidChange(
			() => this.setCoordinates()
		);
	}

	private hide(): void {
		this.isVisible = false;
		dom.hide(this.$el);
	}

	override dispose(): void {
		super.dispose();

		this.$el?.remove();
	}
}

export function createDisconnectMenuItemAction(action: MenuItemAction, disposables: DisposableStore, accessor: ServicesAccessor, options: IDropdownWithPrimaryActionViewItemOptions): IActionViewItem | undefined {
	const menuService = accessor.get(IMenuService);
	const contextKeyService = accessor.get(IContextKeyService);
	const instantiationService = accessor.get(IInstantiationService);

	const menu = menuService.getMenuActions(MenuId.DebugToolBarStop, contextKeyService, { shouldForwardArgs: true });
	const secondary = getFlatActionBarActions(menu);

	if (!secondary.length) {
		return undefined;
	}

	const dropdownAction = disposables.add(new Action('notebook.moreRunActions', localize('notebook.moreRunActionsLabel', "More..."), 'codicon-chevron-down', true));
	const item = instantiationService.createInstance(DropdownWithPrimaryActionViewItem,
		action as MenuItemAction,
		dropdownAction,
		secondary,
		'debug-stop-actions',
		options);
	return item;
}

// Debug toolbar

const debugViewTitleItems = new DisposableStore();
const registerDebugToolBarItem = (id: string, title: string | ICommandActionTitle, order: number, icon?: { light?: URI; dark?: URI } | ThemeIcon, when?: ContextKeyExpression, precondition?: ContextKeyExpression, alt?: ICommandAction) => {
	MenuRegistry.appendMenuItem(MenuId.DebugToolBar, {
		group: 'navigation',
		when,
		order,
		command: {
			id,
			title,
			icon,
			precondition
		},
		alt
	});

	// Register actions in debug viewlet when toolbar is docked
	debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
		group: 'navigation',
		when: ContextKeyExpr.and(when, ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo('inactive'), ContextKeyExpr.equals('config.debug.toolBarLocation', 'docked')),
		order,
		command: {
			id,
			title,
			icon,
			precondition
		}
	}));
};

markAsSingleton(MenuRegistry.onDidChangeMenu(e => {
	// In case the debug toolbar is docked we need to make sure that the docked toolbar has the up to date commands registered #115945
	if (e.has(MenuId.DebugToolBar)) {
		debugViewTitleItems.clear();
		const items = MenuRegistry.getMenuItems(MenuId.DebugToolBar);
		for (const i of items) {
			debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
				...i,
				when: ContextKeyExpr.and(i.when, ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo('inactive'), ContextKeyExpr.equals('config.debug.toolBarLocation', 'docked'))
			}));
		}
	}
}));


const CONTEXT_TOOLBAR_COMMAND_CENTER = ContextKeyExpr.equals('config.debug.toolBarLocation', 'commandCenter');

MenuRegistry.appendMenuItem(MenuId.CommandCenterCenter, {
	submenu: MenuId.DebugToolBar,
	title: 'Debug',
	icon: Codicon.debug,
	order: 1,
	when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_TOOLBAR_COMMAND_CENTER)
});

registerDebugToolBarItem(CONTINUE_ID, CONTINUE_LABEL, 10, icons.debugContinue, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(PAUSE_ID, PAUSE_LABEL, 10, icons.debugPause, CONTEXT_DEBUG_STATE.notEqualsTo('stopped'), ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo('running'), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated()));
registerDebugToolBarItem(STOP_ID, STOP_LABEL, 70, icons.debugStop, CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), undefined, { id: DISCONNECT_ID, title: DISCONNECT_LABEL, icon: icons.debugDisconnect, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED), });
registerDebugToolBarItem(DISCONNECT_ID, DISCONNECT_LABEL, 70, icons.debugDisconnect, CONTEXT_FOCUSED_SESSION_IS_ATTACH, undefined, { id: STOP_ID, title: STOP_LABEL, icon: icons.debugStop, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED), });
registerDebugToolBarItem(STEP_OVER_ID, STEP_OVER_LABEL, 20, icons.debugStepOver, undefined, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(STEP_INTO_ID, STEP_INTO_LABEL, 30, icons.debugStepInto, undefined, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(STEP_OUT_ID, STEP_OUT_LABEL, 40, icons.debugStepOut, undefined, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(RESTART_SESSION_ID, RESTART_LABEL, 60, icons.debugRestart);
registerDebugToolBarItem(STEP_BACK_ID, localize('stepBackDebug', "Step Back"), 50, icons.debugStepBack, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(REVERSE_CONTINUE_ID, localize('reverseContinue', "Reverse"), 55, icons.debugReverseContinue, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugToolBarItem(FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, 100, Codicon.listTree, ContextKeyExpr.and(CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_TOOLBAR_COMMAND_CENTER.negate()));

MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
	group: 'navigation',
	when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
	order: 0,
	command: {
		id: DISCONNECT_ID,
		title: DISCONNECT_LABEL,
		icon: icons.debugDisconnect
	}
});

MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
	group: 'navigation',
	when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
	order: 0,
	command: {
		id: STOP_ID,
		title: STOP_LABEL,
		icon: icons.debugStop
	}
});

MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
	group: 'navigation',
	when: ContextKeyExpr.or(
		ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
		ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED),
	),
	order: 0,
	command: {
		id: DISCONNECT_AND_SUSPEND_ID,
		title: DISCONNECT_AND_SUSPEND_LABEL,
		icon: icons.debugDisconnect
	}
});

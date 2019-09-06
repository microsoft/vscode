/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activityaction';
import * as nls from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import { Action, IAction } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { SyncActionDescriptor, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { activeContrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ActivityAction, ActivityActionViewItem, ICompositeBar, ICompositeBarColors, ToggleCompositePinnedAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IActivity } from 'vs/workbench/common/activity';
import { ACTIVITY_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IActivityBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';

export class ViewletActivityAction extends ActivityAction {

	private static readonly preventDoubleClickDelay = 300;

	private lastRun: number = 0;

	constructor(
		activity: IActivity,
		@IViewletService private readonly viewletService: IViewletService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super(activity);
	}

	async run(event: any): Promise<any> {
		if (event instanceof MouseEvent && event.button === 2) {
			return false; // do not run on right click
		}

		// prevent accident trigger on a doubleclick (to help nervous people)
		const now = Date.now();
		if (now > this.lastRun /* https://github.com/Microsoft/vscode/issues/25830 */ && now - this.lastRun < ViewletActivityAction.preventDoubleClickDelay) {
			return true;
		}
		this.lastRun = now;

		const sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (sideBarVisible && activeViewlet && activeViewlet.getId() === this.activity.id) {
			this.logAction('hide');
			this.layoutService.setSideBarHidden(true);
			return true;
		}

		this.logAction('show');
		await this.viewletService.openViewlet(this.activity.id, true);
		return this.activate();
	}

	private logAction(action: string) {
		type ActivityBarActionClassification = {
			viewletId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			action: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};
		this.telemetryService.publicLog2<{ viewletId: String, action: String }, ActivityBarActionClassification>('activityBarAction', { viewletId: this.activity.id, action });
	}
}

export class ToggleViewletAction extends Action {

	constructor(
		private _viewlet: ViewletDescriptor,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewletService private readonly viewletService: IViewletService
	) {
		super(_viewlet.id, _viewlet.name);
	}

	run(): Promise<any> {
		const sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (sideBarVisible && activeViewlet && activeViewlet.getId() === this._viewlet.id) {
			this.layoutService.setSideBarHidden(true);
			return Promise.resolve();
		}

		return this.viewletService.openViewlet(this._viewlet.id, true);
	}
}

export class GlobalActivityActionViewItem extends ActivityActionViewItem {

	constructor(
		action: ActivityAction,
		colors: (theme: ITheme) => ICompositeBarColors,
		@IThemeService themeService: IThemeService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(action, { draggable: false, colors, icon: true }, themeService);
	}

	render(container: HTMLElement): void {
		super.render(container);

		// Context menus are triggered on mouse down so that an item can be picked
		// and executed with releasing the mouse over it

		this._register(DOM.addDisposableListener(this.container, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			DOM.EventHelper.stop(e, true);
			this.showContextMenu();
		}));

		this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(e, true);
				this.showContextMenu();
			}
		}));

		this._register(DOM.addDisposableListener(this.container, TouchEventType.Tap, (e: GestureEvent) => {
			DOM.EventHelper.stop(e, true);
			this.showContextMenu();
		}));
	}

	private showContextMenu(): void {
		const globalActivityActions: IAction[] = [];
		const globalActivityMenu = this.menuService.createMenu(MenuId.GlobalActivity, this.contextKeyService);
		const actionsDisposable = createAndFillInActionBarActions(globalActivityMenu, undefined, { primary: [], secondary: globalActivityActions });

		const containerPosition = DOM.getDomNodePagePosition(this.container);
		const location = { x: containerPosition.left + containerPosition.width / 2, y: containerPosition.top };
		this.contextMenuService.showContextMenu({
			getAnchor: () => location,
			getActions: () => globalActivityActions,
			onHide: () => {
				globalActivityMenu.dispose();
				dispose(actionsDisposable);
			}
		});
	}
}

export class PlaceHolderViewletActivityAction extends ViewletActivityAction {

	constructor(
		id: string, name: string, iconUrl: URI,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super({ id, name: id, cssClass: `extensionViewlet-placeholder-${id.replace(/\./g, '-')}` }, viewletService, layoutService, telemetryService);

		const iconClass = `.monaco-workbench .activitybar .monaco-action-bar .action-label.${this.class}`; // Generate Placeholder CSS to show the icon in the activity bar
		DOM.createCSSRule(iconClass, `-webkit-mask: ${DOM.asCSSUrl(iconUrl)} no-repeat 50% 50%; -webkit-mask-size: 24px;`);
	}

	setActivity(activity: IActivity): void {
		this.activity = activity;
	}
}

export class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {

	constructor(id: string, compositeBar: ICompositeBar) {
		super({ id, name: id, cssClass: undefined }, compositeBar);
	}

	setActivity(activity: IActivity): void {
		this.label = activity.name;
	}
}

class SwitchSideBarViewAction extends Action {

	constructor(
		id: string,
		name: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IActivityBarService private readonly activityBarService: IActivityBarService
	) {
		super(id, name);
	}

	run(offset: number): Promise<any> {
		const pinnedViewletIds = this.activityBarService.getPinnedViewletIds();

		const activeViewlet = this.viewletService.getActiveViewlet();
		if (!activeViewlet) {
			return Promise.resolve();
		}
		let targetViewletId: string | undefined;
		for (let i = 0; i < pinnedViewletIds.length; i++) {
			if (pinnedViewletIds[i] === activeViewlet.getId()) {
				targetViewletId = pinnedViewletIds[(i + pinnedViewletIds.length + offset) % pinnedViewletIds.length];
				break;
			}
		}
		return this.viewletService.openViewlet(targetViewletId, true);
	}
}

export class PreviousSideBarViewAction extends SwitchSideBarViewAction {

	static readonly ID = 'workbench.action.previousSideBarView';
	static LABEL = nls.localize('previousSideBarView', 'Previous Side Bar View');

	constructor(
		id: string,
		name: string,
		@IViewletService viewletService: IViewletService,
		@IActivityBarService activityBarService: IActivityBarService
	) {
		super(id, name, viewletService, activityBarService);
	}

	run(): Promise<any> {
		return super.run(-1);
	}
}

export class NextSideBarViewAction extends SwitchSideBarViewAction {

	static readonly ID = 'workbench.action.nextSideBarView';
	static LABEL = nls.localize('nextSideBarView', 'Next Side Bar View');

	constructor(
		id: string,
		name: string,
		@IViewletService viewletService: IViewletService,
		@IActivityBarService activityBarService: IActivityBarService
	) {
		super(id, name, viewletService, activityBarService);
	}

	run(): Promise<any> {
		return super.run(1);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(PreviousSideBarViewAction, PreviousSideBarViewAction.ID, PreviousSideBarViewAction.LABEL), 'View: Previous Side Bar View', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(NextSideBarViewAction, NextSideBarViewAction.ID, NextSideBarViewAction.LABEL), 'View: Next Side Bar View', nls.localize('view', "View"));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	const activeForegroundColor = theme.getColor(ACTIVITY_BAR_FOREGROUND);
	if (activeForegroundColor) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.active .action-label,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item:focus .action-label,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item:hover .action-label {
				background-color: ${activeForegroundColor} !important;
			}
		`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item:before {
				content: "";
				position: absolute;
				top: 9px;
				left: 9px;
				height: 32px;
				width: 32px;
			}

			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.active:before,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.checked:hover:before {
				outline: 1px solid;
			}

			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item:hover:before {
				outline: 1px dashed;
			}

			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item:focus:before {
				border-left-color: ${outline};
			}

			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.active:before,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item.checked:hover:before,
			.monaco-workbench .activitybar > .content .monaco-action-bar .action-item:hover:before {
				outline-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
					.monaco-workbench .activitybar > .content .monaco-action-bar .action-item:focus:before {
						border-left-color: ${focusBorderColor};
					}
				`);
		}
	}
});

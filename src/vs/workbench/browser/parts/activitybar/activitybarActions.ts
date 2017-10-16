/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activityaction';
import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IActivityBarService } from 'vs/workbench/services/activity/common/activityBarService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IActivity, IGlobalActivity } from 'vs/workbench/common/activity';
import { dispose } from 'vs/base/common/lifecycle';
import { IViewletService, } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IThemeService, ITheme, registerThemingParticipant, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { activeContrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActivityAction, ActivityActionItem } from 'vs/workbench/browser/parts/compositebar/compositeBarActions';

export class ViewletActivityAction extends ActivityAction {

	private static preventDoubleClickDelay = 300;

	private lastRun: number = 0;

	constructor(
		activity: IActivity,
		@IViewletService private viewletService: IViewletService,
		@IPartService private partService: IPartService
	) {
		super(activity);
	}

	public run(event: any): TPromise<any> {
		if (event instanceof MouseEvent && event.button === 2) {
			return TPromise.as(false); // do not run on right click
		}

		// prevent accident trigger on a doubleclick (to help nervous people)
		const now = Date.now();
		if (now > this.lastRun /* https://github.com/Microsoft/vscode/issues/25830 */ && now - this.lastRun < ViewletActivityAction.preventDoubleClickDelay) {
			return TPromise.as(true);
		}
		this.lastRun = now;

		const sideBarVisible = this.partService.isVisible(Parts.SIDEBAR_PART);
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (sideBarVisible && activeViewlet && activeViewlet.getId() === this.activity.id) {
			return this.partService.setSideBarHidden(true);
		}

		return this.viewletService.openViewlet(this.activity.id, true).then(() => this.activate());
	}
}

export class ToggleViewletAction extends Action {

	constructor(
		private _viewlet: ViewletDescriptor,
		@IPartService private partService: IPartService,
		@IViewletService private viewletService: IViewletService
	) {
		super(_viewlet.id, _viewlet.name);
	}

	public run(): TPromise<any> {
		const sideBarVisible = this.partService.isVisible(Parts.SIDEBAR_PART);
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (sideBarVisible && activeViewlet && activeViewlet.getId() === this._viewlet.id) {
			return this.partService.setSideBarHidden(true);
		}

		return this.viewletService.openViewlet(this._viewlet.id, true);
	}
}

export class ToggleViewletPinnedAction extends Action {

	constructor(
		private activity: IActivity,
		@IActivityBarService private activityBarService: IActivityBarService
	) {
		super('activitybar.show.toggleViewletPinned', activity ? activity.name : nls.localize('toggle', "Toggle View Pinned"));

		this.checked = this.activity && this.activityBarService.isPinned(this.activity.id);
	}

	public run(context: string): TPromise<any> {
		const id = this.activity ? this.activity.id : context;

		if (this.activityBarService.isPinned(id)) {
			this.activityBarService.unpin(id);
		} else {
			this.activityBarService.pin(id);
		}

		return TPromise.as(true);
	}
}

export class GlobalActivityAction extends ActivityAction {

	constructor(activity: IGlobalActivity) {
		super(activity);
	}
}

export class GlobalActivityActionItem extends ActivityActionItem {

	constructor(
		action: GlobalActivityAction,
		@IThemeService themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService
	) {
		super(action, { draggable: false }, themeService);
	}

	public render(container: HTMLElement): void {
		super.render(container);

		// Context menus are triggered on mouse down so that an item can be picked
		// and executed with releasing the mouse over it
		this.$container.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			this.onClick(e);
		});

		// Extra listener for keyboard interaction
		this.$container.on(DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				this.onClick(e);
			}
		});
	}

	public onClick(event?: MouseEvent | KeyboardEvent): void {
		DOM.EventHelper.stop(event, true);

		let location: HTMLElement | { x: number, y: number };
		if (event instanceof MouseEvent) {
			const mouseEvent = new StandardMouseEvent(event);
			location = { x: mouseEvent.posx, y: mouseEvent.posy };
		} else {
			location = this.$container.getHTMLElement();
		}

		this.showContextMenu(location);
	}

	private showContextMenu(location: HTMLElement | { x: number, y: number }): void {
		const globalAction = this._action as GlobalActivityAction;
		const activity = globalAction.activity as IGlobalActivity;
		const actions = activity.getActions();

		this.contextMenuService.showContextMenu({
			getAnchor: () => location,
			getActions: () => TPromise.as(actions),
			onHide: () => dispose(actions)
		});
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:before {
				content: "";
				position: absolute;
				top: 9px;
				left: 9px;
				height: 32px;
				width: 32px;
				opacity: 0.6;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.active:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.checked:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.checked:hover:before {
				outline: 1px solid;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:hover:before {
				outline: 1px dashed;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.active:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.checked:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:hover:before {
				opacity: 1;
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:focus:before {
				border-left-color: ${outline};
			}

			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.active:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.checked:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.checked:hover:before,
			.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:hover:before {
				outline-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
				.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.active .action-label,
				.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item.checked .action-label,
				.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:focus .action-label,
				.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:hover .action-label {
					opacity: 1;
				}

				.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item .action-label {
					opacity: 0.6;
				}

				.monaco-workbench > .activitybar > .content .monaco-action-bar .action-item:focus:before {
					border-left-color: ${focusBorderColor};
				}
			`);
		}
	}
});
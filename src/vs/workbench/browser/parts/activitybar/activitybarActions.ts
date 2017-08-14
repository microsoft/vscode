/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activityaction';
import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { Action } from 'vs/base/common/actions';
import { BaseActionItem, Separator, IBaseActionItemOptions } from 'vs/base/browser/ui/actionbar/actionbar';
import { IActivityBarService, ProgressBadge, TextBadge, NumberBadge, IconBadge, IBadge } from 'vs/workbench/services/activity/common/activityBarService';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IActivity, IGlobalActivity } from 'vs/workbench/browser/activity';
import { dispose } from 'vs/base/common/lifecycle';
import { IViewletService, } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IThemeService, ITheme, registerThemingParticipant, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { contrastBorder, activeContrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';

export interface IViewletActivity {
	badge: IBadge;
	clazz: string;
}

export class ActivityAction extends Action {
	private badge: IBadge;
	private _onDidChangeBadge = new Emitter<this>();

	constructor(private _activity: IActivity) {
		super(_activity.id, _activity.name, _activity.cssClass);

		this.badge = null;
	}

	public get activity(): IActivity {
		return this._activity;
	}

	public get onDidChangeBadge(): Event<this> {
		return this._onDidChangeBadge.event;
	}

	public activate(): void {
		if (!this.checked) {
			this._setChecked(true);
		}
	}

	public deactivate(): void {
		if (this.checked) {
			this._setChecked(false);
		}
	}

	public getBadge(): IBadge {
		return this.badge;
	}

	public setBadge(badge: IBadge): void {
		this.badge = badge;
		this._onDidChangeBadge.fire(this);
	}
}

export class ViewletActivityAction extends ActivityAction {

	private static preventDoubleClickDelay = 300;

	private lastRun: number = 0;

	constructor(
		private viewlet: ViewletDescriptor,
		@IViewletService private viewletService: IViewletService,
		@IPartService private partService: IPartService
	) {
		super(viewlet);
	}

	public run(event): TPromise<any> {
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
		if (sideBarVisible && activeViewlet && activeViewlet.getId() === this.viewlet.id) {
			return this.partService.setSideBarHidden(true);
		}

		return this.viewletService.openViewlet(this.viewlet.id, true)
			.then(() => this.activate());
	}
}

export class ActivityActionItem extends BaseActionItem {
	protected $container: Builder;
	protected $label: Builder;
	protected $badge: Builder;

	private $badgeContent: Builder;
	private mouseUpTimeout: number;

	constructor(
		action: ActivityAction,
		options: IBaseActionItemOptions,
		@IThemeService protected themeService: IThemeService
	) {
		super(null, action, options);

		this.themeService.onThemeChange(this.onThemeChange, this, this._callOnDispose);
		action.onDidChangeBadge(this.handleBadgeChangeEvenet, this, this._callOnDispose);
	}

	protected get activity(): IActivity {
		return (this._action as ActivityAction).activity;
	}

	protected updateStyles(): void {
		const theme = this.themeService.getTheme();

		// Label
		if (this.$label) {
			const background = theme.getColor(ACTIVITY_BAR_FOREGROUND);

			this.$label.style('background-color', background ? background.toString() : null);
		}

		// Badge
		if (this.$badgeContent) {
			const badgeForeground = theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND);
			const badgeBackground = theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND);
			const contrastBorderColor = theme.getColor(contrastBorder);

			this.$badgeContent.style('color', badgeForeground ? badgeForeground.toString() : null);
			this.$badgeContent.style('background-color', badgeBackground ? badgeBackground.toString() : null);

			this.$badgeContent.style('border-style', contrastBorderColor ? 'solid' : null);
			this.$badgeContent.style('border-width', contrastBorderColor ? '1px' : null);
			this.$badgeContent.style('border-color', contrastBorderColor ? contrastBorderColor.toString() : null);
		}
	}

	public render(container: HTMLElement): void {
		super.render(container);

		// Make the container tab-able for keyboard navigation
		this.$container = $(container).attr({
			tabIndex: '0',
			role: 'button',
			title: this.activity.name
		});

		// Try hard to prevent keyboard only focus feedback when using mouse
		this.$container.on(DOM.EventType.MOUSE_DOWN, () => {
			this.$container.addClass('clicked');
		});

		this.$container.on(DOM.EventType.MOUSE_UP, () => {
			if (this.mouseUpTimeout) {
				clearTimeout(this.mouseUpTimeout);
			}

			this.mouseUpTimeout = setTimeout(() => {
				this.$container.removeClass('clicked');
			}, 800); // delayed to prevent focus feedback from showing on mouse up
		});

		// Label
		this.$label = $('a.action-label').appendTo(this.builder);
		if (this.activity.cssClass) {
			this.$label.addClass(this.activity.cssClass);
		}

		this.$badge = this.builder.clone().div({ 'class': 'badge' }, (badge: Builder) => {
			this.$badgeContent = badge.div({ 'class': 'badge-content' });
		});

		this.$badge.hide();

		this.updateStyles();
	}

	private onThemeChange(theme: ITheme): void {
		this.updateStyles();
	}

	public setBadge(badge: IBadge): void {
		this.updateBadge(badge);
	}

	protected updateBadge(badge: IBadge): void {
		this.$badgeContent.empty();
		this.$badge.hide();

		if (badge) {

			// Number
			if (badge instanceof NumberBadge) {
				if (badge.number) {
					this.$badgeContent.text(badge.number > 99 ? '99+' : badge.number.toString());
					this.$badge.show();
				}
			}

			// Text
			else if (badge instanceof TextBadge) {
				this.$badgeContent.text(badge.text);
				this.$badge.show();
			}

			// Text
			else if (badge instanceof IconBadge) {
				this.$badge.show();
			}

			// Progress
			else if (badge instanceof ProgressBadge) {
				this.$badge.show();
			}

			const description = badge.getDescription();
			this.$label.attr('aria-label', `${this.activity.name} - ${description}`);
			this.$label.title(description);
		}
	}

	private handleBadgeChangeEvenet(): void {
		const action = this.getAction();
		if (action instanceof ActivityAction) {
			this.updateBadge(action.getBadge());
		}
	}

	public dispose(): void {
		super.dispose();

		if (this.mouseUpTimeout) {
			clearTimeout(this.mouseUpTimeout);
		}

		this.$badge.destroy();
	}
}

export class ViewletActionItem extends ActivityActionItem {

	private static manageExtensionAction: ManageExtensionAction;
	private static toggleViewletPinnedAction: ToggleViewletPinnedAction;
	private static draggedViewlet: ViewletDescriptor;

	private _keybinding: string;
	private cssClass: string;

	constructor(
		private action: ViewletActivityAction,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IActivityBarService private activityBarService: IActivityBarService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(action, { draggable: true }, themeService);

		this.cssClass = action.class;
		this._keybinding = this.getKeybindingLabel(this.viewlet.id);

		if (!ViewletActionItem.manageExtensionAction) {
			ViewletActionItem.manageExtensionAction = instantiationService.createInstance(ManageExtensionAction);
		}

		if (!ViewletActionItem.toggleViewletPinnedAction) {
			ViewletActionItem.toggleViewletPinnedAction = instantiationService.createInstance(ToggleViewletPinnedAction, void 0);
		}
	}

	private get viewlet(): ViewletDescriptor {
		return this.action.activity as ViewletDescriptor;
	}

	private getKeybindingLabel(id: string): string {
		const kb = this.keybindingService.lookupKeybinding(id);
		if (kb) {
			return kb.getLabel();
		}

		return null;
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this.$container.on('contextmenu', e => {
			DOM.EventHelper.stop(e, true);

			this.showContextMenu(container);
		});

		// Allow to drag
		this.$container.on(DOM.EventType.DRAG_START, (e: DragEvent) => {
			e.dataTransfer.effectAllowed = 'move';
			this.setDraggedViewlet(this.viewlet);

			// Trigger the action even on drag start to prevent clicks from failing that started a drag
			if (!this.getAction().checked) {
				this.getAction().run();
			}
		});

		// Drag enter
		let counter = 0; // see https://github.com/Microsoft/vscode/issues/14470
		this.$container.on(DOM.EventType.DRAG_ENTER, (e: DragEvent) => {
			const draggedViewlet = ViewletActionItem.getDraggedViewlet();
			if (draggedViewlet && draggedViewlet.id !== this.viewlet.id) {
				counter++;
				this.updateFromDragging(container, true);
			}
		});

		// Drag leave
		this.$container.on(DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			const draggedViewlet = ViewletActionItem.getDraggedViewlet();
			if (draggedViewlet) {
				counter--;
				if (counter === 0) {
					this.updateFromDragging(container, false);
				}
			}
		});

		// Drag end
		this.$container.on(DOM.EventType.DRAG_END, (e: DragEvent) => {
			const draggedViewlet = ViewletActionItem.getDraggedViewlet();
			if (draggedViewlet) {
				counter = 0;
				this.updateFromDragging(container, false);

				ViewletActionItem.clearDraggedViewlet();
			}
		});

		// Drop
		this.$container.on(DOM.EventType.DROP, (e: DragEvent) => {
			DOM.EventHelper.stop(e, true);

			const draggedViewlet = ViewletActionItem.getDraggedViewlet();
			if (draggedViewlet && draggedViewlet.id !== this.viewlet.id) {
				this.updateFromDragging(container, false);
				ViewletActionItem.clearDraggedViewlet();

				this.activityBarService.move(draggedViewlet.id, this.viewlet.id);
			}
		});

		// Keybinding
		this.keybinding = this._keybinding; // force update

		// Activate on drag over to reveal targets
		[this.$badge, this.$label].forEach(b => new DelayedDragHandler(b.getHTMLElement(), () => {
			if (!ViewletActionItem.getDraggedViewlet() && !this.getAction().checked) {
				this.getAction().run();
			}
		}));

		this.updateStyles();
	}

	private updateFromDragging(element: HTMLElement, isDragging: boolean): void {
		const theme = this.themeService.getTheme();
		const dragBackground = theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BACKGROUND);

		element.style.backgroundColor = isDragging && dragBackground ? dragBackground.toString() : null;
	}

	public static getDraggedViewlet(): ViewletDescriptor {
		return ViewletActionItem.draggedViewlet;
	}

	private setDraggedViewlet(viewlet: ViewletDescriptor): void {
		ViewletActionItem.draggedViewlet = viewlet;
	}

	public static clearDraggedViewlet(): void {
		ViewletActionItem.draggedViewlet = void 0;
	}

	private showContextMenu(container: HTMLElement): void {
		const actions: Action[] = [ViewletActionItem.toggleViewletPinnedAction];
		if (this.viewlet.extensionId) {
			actions.push(new Separator());
			actions.push(ViewletActionItem.manageExtensionAction);
		}

		const isPinned = this.activityBarService.isPinned(this.viewlet.id);
		if (isPinned) {
			ViewletActionItem.toggleViewletPinnedAction.label = nls.localize('removeFromActivityBar', "Remove from Activity Bar");
		} else {
			ViewletActionItem.toggleViewletPinnedAction.label = nls.localize('keepInActivityBar', "Keep in Activity Bar");
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => container,
			getActionsContext: () => this.viewlet,
			getActions: () => TPromise.as(actions)
		});
	}

	public focus(): void {
		this.$container.domFocus();
	}

	public set keybinding(keybinding: string) {
		this._keybinding = keybinding;

		if (!this.$label) {
			return;
		}

		let title: string;
		if (keybinding) {
			title = nls.localize('titleKeybinding', "{0} ({1})", this.activity.name, keybinding);
		} else {
			title = this.activity.name;
		}

		this.$label.title(title);
		this.$badge.title(title);
		this.$container.title(title);
	}

	protected _updateClass(): void {
		if (this.cssClass) {
			this.$badge.removeClass(this.cssClass);
		}

		this.cssClass = this.getAction().class;
		this.$badge.addClass(this.cssClass);
	}

	protected _updateChecked(): void {
		if (this.getAction().checked) {
			this.$container.addClass('checked');
		} else {
			this.$container.removeClass('checked');
		}
	}

	protected _updateEnabled(): void {
		if (this.getAction().enabled) {
			this.builder.removeClass('disabled');
		} else {
			this.builder.addClass('disabled');
		}
	}

	public dispose(): void {
		super.dispose();

		ViewletActionItem.clearDraggedViewlet();

		this.$label.destroy();
	}
}

export class ViewletOverflowActivityAction extends ActivityAction {

	constructor(
		private showMenu: () => void
	) {
		super({
			id: 'activitybar.additionalViewlets.action',
			name: nls.localize('additionalViews', "Additional Views"),
			cssClass: 'toggle-more'
		});
	}

	public run(event): TPromise<any> {
		this.showMenu();

		return TPromise.as(true);
	}
}

export class ViewletOverflowActivityActionItem extends ActivityActionItem {
	private name: string;
	private cssClass: string;
	private actions: OpenViewletAction[];

	constructor(
		action: ActivityAction,
		private getOverflowingViewlets: () => ViewletDescriptor[],
		private getBadge: (viewlet: ViewletDescriptor) => IBadge,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IViewletService private viewletService: IViewletService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService
	) {
		super(action, null, themeService);

		this.cssClass = action.class;
		this.name = action.label;
	}

	public showMenu(): void {
		if (this.actions) {
			dispose(this.actions);
		}

		this.actions = this.getActions();

		this.contextMenuService.showContextMenu({
			getAnchor: () => this.builder.getHTMLElement(),
			getActions: () => TPromise.as(this.actions),
			onHide: () => dispose(this.actions)
		});
	}

	private getActions(): OpenViewletAction[] {
		const activeViewlet = this.viewletService.getActiveViewlet();

		return this.getOverflowingViewlets().map(viewlet => {
			const action = this.instantiationService.createInstance(OpenViewletAction, viewlet);
			action.radio = activeViewlet && activeViewlet.getId() === action.id;

			const badge = this.getBadge(action.viewlet);
			let suffix: string | number;
			if (badge instanceof NumberBadge) {
				suffix = badge.number;
			} else if (badge instanceof TextBadge) {
				suffix = badge.text;
			}

			if (suffix) {
				action.label = nls.localize('numberBadge', "{0} ({1})", action.viewlet.name, suffix);
			} else {
				action.label = action.viewlet.name;
			}

			return action;
		});
	}

	public dispose(): void {
		super.dispose();

		this.actions = dispose(this.actions);
	}
}

class ManageExtensionAction extends Action {

	constructor(
		@ICommandService private commandService: ICommandService
	) {
		super('activitybar.manage.extension', nls.localize('manageExtension', "Manage Extension"));
	}

	public run(viewlet: ViewletDescriptor): TPromise<any> {
		return this.commandService.executeCommand('_extensions.manage', viewlet.extensionId);
	}
}

class OpenViewletAction extends Action {

	constructor(
		private _viewlet: ViewletDescriptor,
		@IPartService private partService: IPartService,
		@IViewletService private viewletService: IViewletService
	) {
		super(_viewlet.id, _viewlet.name);
	}

	public get viewlet(): ViewletDescriptor {
		return this._viewlet;
	}

	public run(): TPromise<any> {
		const sideBarVisible = this.partService.isVisible(Parts.SIDEBAR_PART);
		const activeViewlet = this.viewletService.getActiveViewlet();

		// Hide sidebar if selected viewlet already visible
		if (sideBarVisible && activeViewlet && activeViewlet.getId() === this.viewlet.id) {
			return this.partService.setSideBarHidden(true);
		}

		return this.viewletService.openViewlet(this.viewlet.id, true);
	}
}

export class ToggleViewletPinnedAction extends Action {

	constructor(
		private viewlet: ViewletDescriptor,
		@IActivityBarService private activityBarService: IActivityBarService
	) {
		super('activitybar.show.toggleViewletPinned', viewlet ? viewlet.name : nls.localize('toggle', "Toggle View Pinned"));

		this.checked = this.viewlet && this.activityBarService.isPinned(this.viewlet.id);
	}

	public run(context?: ViewletDescriptor): TPromise<any> {
		const viewlet = this.viewlet || context;

		if (this.activityBarService.isPinned(viewlet.id)) {
			this.activityBarService.unpin(viewlet.id);
		} else {
			this.activityBarService.pin(viewlet.id);
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
			DOM.EventHelper.stop(e, true);

			const event = new StandardMouseEvent(e);
			this.showContextMenu({ x: event.posx, y: event.posy });
		});

		this.$container.on(DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(e, true);

				this.showContextMenu(this.$container.getHTMLElement());
			}
		});
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { BaseActionItem, IBaseActionItemOptions, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { dispose, IDisposable, empty, toDisposable } from 'vs/base/common/lifecycle';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { TextBadge, NumberBadge, IBadge, IconBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { IActivity } from 'vs/workbench/common/activity';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Event, Emitter } from 'vs/base/common/event';

export interface ICompositeActivity {
	badge: IBadge;
	clazz: string;
	priority: number;
}

export interface ICompositeBar {
	/**
	 * Unpins a composite from the composite bar.
	 */
	unpin(compositeId: string): void;

	/**
	 * Pin a composite inside the composite bar.
	 */
	pin(compositeId: string): void;

	/**
	 * Find out if a composite is pinned in the composite bar.
	 */
	isPinned(compositeId: string): boolean;

	/**
	 * Reorder composite ordering by moving a composite to the location of another composite.
	 */
	move(compositeId: string, tocompositeId: string): void;
}

export class ActivityAction extends Action {
	private badge: IBadge;
	private clazz: string | undefined;
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

	public getClass(): string | undefined {
		return this.clazz;
	}

	public setBadge(badge: IBadge, clazz?: string): void {
		this.badge = badge;
		this.clazz = clazz;
		this._onDidChangeBadge.fire(this);
	}
}

export interface ICompositeBarColors {
	backgroundColor: string;
	badgeBackground: string;
	badgeForeground: string;
	dragAndDropBackground: string;
}

export interface IActivityActionItemOptions extends IBaseActionItemOptions {
	icon?: boolean;
	colors: ICompositeBarColors;
}

export class ActivityActionItem extends BaseActionItem {
	protected $container: Builder;
	protected $label: Builder;
	protected $badge: Builder;
	protected options: IActivityActionItemOptions;

	private $badgeContent: Builder;
	private badgeDisposable: IDisposable = empty;
	private mouseUpTimeout: number;

	constructor(
		action: ActivityAction,
		options: IActivityActionItemOptions,
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
		if (this.$label && this.options.icon) {
			const background = theme.getColor(this.options.colors.backgroundColor);

			this.$label.style('background-color', background ? background.toString() : null);
		}

		// Badge
		if (this.$badgeContent) {
			const badgeForeground = theme.getColor(this.options.colors.badgeForeground);
			const badgeBackground = theme.getColor(this.options.colors.badgeBackground);
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
		this.$container.on(dom.EventType.MOUSE_DOWN, () => {
			this.$container.addClass('clicked');
		});

		this.$container.on(dom.EventType.MOUSE_UP, () => {
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
		if (!this.options.icon) {
			this.$label.text(this.getAction().label);
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

	protected updateBadge(badge: IBadge, clazz?: string): void {
		if (!this.$badge || !this.$badgeContent) {
			return;
		}

		this.badgeDisposable.dispose();
		this.badgeDisposable = empty;

		this.$badgeContent.empty();
		this.$badge.hide();

		if (badge) {

			// Number
			if (badge instanceof NumberBadge) {
				if (badge.number) {
					let number = badge.number.toString();
					if (badge.number > 9999) {
						number = nls.localize('largeNumberBadge', '10k+');
					} else if (badge.number > 999) {
						number = number.charAt(0) + 'k';
					}
					this.$badgeContent.text(number);
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

			if (clazz) {
				this.$badge.addClass(clazz);
				this.badgeDisposable = toDisposable(() => this.$badge.removeClass(clazz));
			}
		}

		// Title
		let title: string;
		if (badge && badge.getDescription()) {
			if (this.activity.name) {
				title = nls.localize('badgeTitle', "{0} - {1}", this.activity.name, badge.getDescription());
			} else {
				title = badge.getDescription();
			}
		} else {
			title = this.activity.name;
		}

		[this.$label, this.$badge, this.$container].forEach(b => {
			if (b) {
				b.attr('aria-label', title);
				b.title(title);
			}
		});
	}

	private handleBadgeChangeEvenet(): void {
		const action = this.getAction();
		if (action instanceof ActivityAction) {
			this.updateBadge(action.getBadge(), action.getClass());
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

export class CompositeOverflowActivityAction extends ActivityAction {

	constructor(
		private showMenu: () => void
	) {
		super({
			id: 'additionalComposites.action',
			name: nls.localize('additionalViews', "Additional Views"),
			cssClass: 'toggle-more'
		});
	}

	public run(event: any): TPromise<any> {
		this.showMenu();

		return TPromise.as(true);
	}
}

export class CompositeOverflowActivityActionItem extends ActivityActionItem {
	private actions: Action[];

	constructor(
		action: ActivityAction,
		private getOverflowingComposites: () => { id: string, name: string }[],
		private getActiveCompositeId: () => string,
		private getBadge: (compositeId: string) => IBadge,
		private getCompositeOpenAction: (compositeId: string) => Action,
		colors: ICompositeBarColors,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService
	) {
		super(action, { icon: true, colors }, themeService);
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

	private getActions(): Action[] {
		return this.getOverflowingComposites().map(composite => {
			const action = this.getCompositeOpenAction(composite.id);
			action.radio = this.getActiveCompositeId() === action.id;

			const badge = this.getBadge(composite.id);
			let suffix: string | number;
			if (badge instanceof NumberBadge) {
				suffix = badge.number;
			} else if (badge instanceof TextBadge) {
				suffix = badge.text;
			}

			if (suffix) {
				action.label = nls.localize('numberBadge', "{0} ({1})", composite.name, suffix);
			} else {
				action.label = composite.name;
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

	public run(id: string): TPromise<any> {
		return this.commandService.executeCommand('_extensions.manage', id);
	}
}

export class CompositeActionItem extends ActivityActionItem {

	private static manageExtensionAction: ManageExtensionAction;
	private static draggedCompositeId: string;

	private compositeActivity: IActivity;
	private cssClass: string;

	constructor(
		private compositeActivityAction: ActivityAction,
		private toggleCompositePinnedAction: Action,
		colors: ICompositeBarColors,
		icon: boolean,
		private compositeBar: ICompositeBar,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(compositeActivityAction, { draggable: true, colors, icon }, themeService);

		this.cssClass = compositeActivityAction.class;

		if (!CompositeActionItem.manageExtensionAction) {
			CompositeActionItem.manageExtensionAction = instantiationService.createInstance(ManageExtensionAction);
		}
	}

	protected get activity(): IActivity {
		if (!this.compositeActivity) {
			let activityName: string;
			const keybinding = this.getKeybindingLabel(this.compositeActivityAction.activity.keybindingId);
			if (keybinding) {
				activityName = nls.localize('titleKeybinding', "{0} ({1})", this.compositeActivityAction.activity.name, keybinding);
			} else {
				activityName = this.compositeActivityAction.activity.name;
			}

			this.compositeActivity = {
				id: this.compositeActivityAction.activity.id,
				cssClass: this.cssClass,
				name: activityName
			};
		}

		return this.compositeActivity;
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
			dom.EventHelper.stop(e, true);

			this.showContextMenu(container);
		});

		// Allow to drag
		this.$container.on(dom.EventType.DRAG_START, (e: DragEvent) => {
			e.dataTransfer.effectAllowed = 'move';
			this.setDraggedComposite(this.activity.id);

			// Trigger the action even on drag start to prevent clicks from failing that started a drag
			if (!this.getAction().checked) {
				this.getAction().run();
			}
		});

		// Drag enter
		let counter = 0; // see https://github.com/Microsoft/vscode/issues/14470
		this.$container.on(dom.EventType.DRAG_ENTER, (e: DragEvent) => {
			const draggedCompositeId = CompositeActionItem.getDraggedCompositeId();
			if (draggedCompositeId && draggedCompositeId !== this.activity.id) {
				counter++;
				this.updateFromDragging(container, true);
			}
		});

		// Drag leave
		this.$container.on(dom.EventType.DRAG_LEAVE, (e: DragEvent) => {
			const draggedCompositeId = CompositeActionItem.getDraggedCompositeId();
			if (draggedCompositeId) {
				counter--;
				if (counter === 0) {
					this.updateFromDragging(container, false);
				}
			}
		});

		// Drag end
		this.$container.on(dom.EventType.DRAG_END, (e: DragEvent) => {
			const draggedCompositeId = CompositeActionItem.getDraggedCompositeId();
			if (draggedCompositeId) {
				counter = 0;
				this.updateFromDragging(container, false);

				CompositeActionItem.clearDraggedComposite();
			}
		});

		// Drop
		this.$container.on(dom.EventType.DROP, (e: DragEvent) => {
			dom.EventHelper.stop(e, true);

			const draggedCompositeId = CompositeActionItem.getDraggedCompositeId();
			if (draggedCompositeId && draggedCompositeId !== this.activity.id) {
				this.updateFromDragging(container, false);
				CompositeActionItem.clearDraggedComposite();

				this.compositeBar.move(draggedCompositeId, this.activity.id);
			}
		});

		// Activate on drag over to reveal targets
		[this.$badge, this.$label].forEach(b => new DelayedDragHandler(b.getHTMLElement(), () => {
			if (!CompositeActionItem.getDraggedCompositeId() && !this.getAction().checked) {
				this.getAction().run();
			}
		}));

		this.updateStyles();
	}

	private updateFromDragging(element: HTMLElement, isDragging: boolean): void {
		const theme = this.themeService.getTheme();
		const dragBackground = theme.getColor(this.options.colors.dragAndDropBackground);

		element.style.backgroundColor = isDragging && dragBackground ? dragBackground.toString() : null;
	}

	public static getDraggedCompositeId(): string {
		return CompositeActionItem.draggedCompositeId;
	}

	private setDraggedComposite(compositeId: string): void {
		CompositeActionItem.draggedCompositeId = compositeId;
	}

	public static clearDraggedComposite(): void {
		CompositeActionItem.draggedCompositeId = void 0;
	}

	private showContextMenu(container: HTMLElement): void {
		const actions: Action[] = [this.toggleCompositePinnedAction];
		if ((<any>this.compositeActivityAction.activity).extensionId) {
			actions.push(new Separator());
			actions.push(CompositeActionItem.manageExtensionAction);
		}

		const isPinned = this.compositeBar.isPinned(this.activity.id);
		if (isPinned) {
			this.toggleCompositePinnedAction.label = nls.localize('hide', "Hide");
			this.toggleCompositePinnedAction.checked = false;
		} else {
			this.toggleCompositePinnedAction.label = nls.localize('keep', "Keep");
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => container,
			getActionsContext: () => this.activity.id,
			getActions: () => TPromise.as(actions)
		});
	}

	public focus(): void {
		this.$container.domFocus();
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

		CompositeActionItem.clearDraggedComposite();

		this.$label.destroy();
	}
}

export class ToggleCompositePinnedAction extends Action {

	constructor(
		private activity: IActivity,
		private compositeBar: ICompositeBar
	) {
		super('show.toggleCompositePinned', activity ? activity.name : nls.localize('toggle', "Toggle View Pinned"));

		this.checked = this.activity && this.compositeBar.isPinned(this.activity.id);
	}

	public run(context: string): TPromise<any> {
		const id = this.activity ? this.activity.id : context;

		if (this.compositeBar.isPinned(id)) {
			this.compositeBar.unpin(id);
		} else {
			this.compositeBar.pin(id);
		}

		return TPromise.as(true);
	}
}

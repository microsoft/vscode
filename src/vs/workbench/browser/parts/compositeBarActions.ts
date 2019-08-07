/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import { BaseActionViewItem, IBaseActionViewItemOptions, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { dispose, toDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { TextBadge, NumberBadge, IBadge, IconBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { IActivity } from 'vs/workbench/common/activity';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Event, Emitter } from 'vs/base/common/event';
import { DragAndDropObserver, LocalSelectionTransfer } from 'vs/workbench/browser/dnd';
import { Color } from 'vs/base/common/color';

export interface ICompositeActivity {
	badge: IBadge;
	clazz?: string;
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

	private _onDidChangeActivity = new Emitter<this>();
	readonly onDidChangeActivity: Event<this> = this._onDidChangeActivity.event;

	private _onDidChangeBadge = new Emitter<this>();
	readonly onDidChangeBadge: Event<this> = this._onDidChangeBadge.event;

	private badge?: IBadge;
	private clazz: string | undefined;

	constructor(private _activity: IActivity) {
		super(_activity.id, _activity.name, _activity.cssClass);
	}

	get activity(): IActivity {
		return this._activity;
	}

	set activity(activity: IActivity) {
		this._activity = activity;
		this._onDidChangeActivity.fire(this);
	}

	activate(): void {
		if (!this.checked) {
			this._setChecked(true);
		}
	}

	deactivate(): void {
		if (this.checked) {
			this._setChecked(false);
		}
	}

	getBadge(): IBadge | undefined {
		return this.badge;
	}

	getClass(): string | undefined {
		return this.clazz;
	}

	setBadge(badge: IBadge | undefined, clazz?: string): void {
		this.badge = badge;
		this.clazz = clazz;
		this._onDidChangeBadge.fire(this);
	}

	dispose(): void {
		this._onDidChangeActivity.dispose();
		this._onDidChangeBadge.dispose();

		super.dispose();
	}
}

export interface ICompositeBarColors {
	activeBackgroundColor?: Color;
	inactiveBackgroundColor?: Color;
	activeBorderBottomColor?: Color;
	activeForegroundColor?: Color;
	inactiveForegroundColor?: Color;
	badgeBackground?: Color;
	badgeForeground?: Color;
	dragAndDropBackground?: Color;
}

export interface IActivityActionViewItemOptions extends IBaseActionViewItemOptions {
	icon?: boolean;
	colors: (theme: ITheme) => ICompositeBarColors;
}

export class ActivityActionViewItem extends BaseActionViewItem {
	protected container!: HTMLElement;
	protected label!: HTMLElement;
	protected badge!: HTMLElement;
	protected options!: IActivityActionViewItemOptions;

	private badgeContent: HTMLElement | undefined;
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private mouseUpTimeout: any;

	constructor(
		action: ActivityAction,
		options: IActivityActionViewItemOptions,
		@IThemeService protected themeService: IThemeService
	) {
		super(null, action, options);

		this._register(this.themeService.onThemeChange(this.onThemeChange, this));
		this._register(action.onDidChangeActivity(this.updateActivity, this));
		this._register(action.onDidChangeBadge(this.updateBadge, this));
	}

	protected get activity(): IActivity {
		return (this._action as ActivityAction).activity;
	}

	protected updateStyles(): void {
		const theme = this.themeService.getTheme();
		const colors = this.options.colors(theme);

		if (this.label) {
			if (this.options.icon) {
				const foreground = this._action.checked ? colors.activeBackgroundColor || colors.activeForegroundColor : colors.inactiveBackgroundColor || colors.inactiveForegroundColor;
				this.label.style.backgroundColor = foreground ? foreground.toString() : null;
			} else {
				const foreground = this._action.checked ? colors.activeForegroundColor : colors.inactiveForegroundColor;
				const borderBottomColor = this._action.checked ? colors.activeBorderBottomColor : null;
				this.label.style.color = foreground ? foreground.toString() : null;
				this.label.style.borderBottomColor = borderBottomColor ? borderBottomColor.toString() : null;
			}
		}

		// Badge
		if (this.badgeContent) {
			const badgeForeground = colors.badgeForeground;
			const badgeBackground = colors.badgeBackground;
			const contrastBorderColor = theme.getColor(contrastBorder);

			this.badgeContent.style.color = badgeForeground ? badgeForeground.toString() : null;
			this.badgeContent.style.backgroundColor = badgeBackground ? badgeBackground.toString() : null;

			this.badgeContent.style.borderStyle = contrastBorderColor ? 'solid' : null;
			this.badgeContent.style.borderWidth = contrastBorderColor ? '1px' : null;
			this.badgeContent.style.borderColor = contrastBorderColor ? contrastBorderColor.toString() : null;
		}
	}

	render(container: HTMLElement): void {
		super.render(container);

		this.container = container;

		// Make the container tab-able for keyboard navigation
		this.container.tabIndex = 0;
		this.container.setAttribute('role', this.options.icon ? 'button' : 'tab');

		// Try hard to prevent keyboard only focus feedback when using mouse
		this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_DOWN, () => {
			dom.addClass(this.container, 'clicked');
		}));

		this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_UP, () => {
			if (this.mouseUpTimeout) {
				clearTimeout(this.mouseUpTimeout);
			}

			this.mouseUpTimeout = setTimeout(() => {
				dom.removeClass(this.container, 'clicked');
			}, 800); // delayed to prevent focus feedback from showing on mouse up
		}));

		// Label
		this.label = dom.append(this.element!, dom.$('a'));

		// Badge
		this.badge = dom.append(this.element!, dom.$('.badge'));
		this.badgeContent = dom.append(this.badge, dom.$('.badge-content'));

		dom.hide(this.badge);

		this.updateActivity();
		this.updateStyles();
	}

	private onThemeChange(theme: ITheme): void {
		this.updateStyles();
	}

	protected updateActivity(): void {
		this.updateLabel();
		this.updateTitle(this.activity.name);
		this.updateBadge();
	}

	protected updateBadge(): void {
		const action = this.getAction();
		if (!this.badge || !this.badgeContent || !(action instanceof ActivityAction)) {
			return;
		}

		const badge = action.getBadge();
		const clazz = action.getClass();

		this.badgeDisposable.clear();

		dom.clearNode(this.badgeContent);
		dom.hide(this.badge);

		if (badge) {

			// Number
			if (badge instanceof NumberBadge) {
				if (badge.number) {
					let number = badge.number.toString();
					if (badge.number > 999) {
						const noOfThousands = badge.number / 1000;
						const floor = Math.floor(noOfThousands);
						if (noOfThousands > floor) {
							number = `${floor}K+`;
						} else {
							number = `${noOfThousands}K`;
						}
					}
					this.badgeContent.textContent = number;
					dom.show(this.badge);
				}
			}

			// Text
			else if (badge instanceof TextBadge) {
				this.badgeContent.textContent = badge.text;
				dom.show(this.badge);
			}

			// Text
			else if (badge instanceof IconBadge) {
				dom.show(this.badge);
			}

			// Progress
			else if (badge instanceof ProgressBadge) {
				dom.show(this.badge);
			}

			if (clazz) {
				dom.addClasses(this.badge, clazz);
				this.badgeDisposable.value = toDisposable(() => dom.removeClasses(this.badge, clazz));
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
		this.updateTitle(title);
	}

	protected updateLabel(): void {
		this.label.className = 'action-label';
		if (this.activity.cssClass) {
			dom.addClass(this.label, this.activity.cssClass);
		}
		if (!this.options.icon) {
			this.label.textContent = this.getAction().label;
		}
	}

	private updateTitle(title: string): void {
		[this.label, this.badge, this.container].forEach(element => {
			if (element) {
				element.setAttribute('aria-label', title);
				element.title = title;
			}
		});
	}

	dispose(): void {
		super.dispose();

		if (this.mouseUpTimeout) {
			clearTimeout(this.mouseUpTimeout);
		}

		this.badge.remove();
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

	run(event: any): Promise<any> {
		this.showMenu();

		return Promise.resolve(true);
	}
}

export class CompositeOverflowActivityActionViewItem extends ActivityActionViewItem {
	private actions: Action[] | undefined;

	constructor(
		action: ActivityAction,
		private getOverflowingComposites: () => { id: string, name: string }[],
		private getActiveCompositeId: () => string,
		private getBadge: (compositeId: string) => IBadge,
		private getCompositeOpenAction: (compositeId: string) => Action,
		colors: (theme: ITheme) => ICompositeBarColors,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService
	) {
		super(action, { icon: true, colors }, themeService);
	}

	showMenu(): void {
		if (this.actions) {
			dispose(this.actions);
		}

		this.actions = this.getActions();

		this.contextMenuService.showContextMenu({
			getAnchor: () => this.element!,
			getActions: () => this.actions!,
			onHide: () => dispose(this.actions!)
		});
	}

	private getActions(): Action[] {
		return this.getOverflowingComposites().map(composite => {
			const action = this.getCompositeOpenAction(composite.id);
			action.radio = this.getActiveCompositeId() === action.id;

			const badge = this.getBadge(composite.id);
			let suffix: string | number | undefined;
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

	dispose(): void {
		super.dispose();

		if (this.actions) {
			this.actions = dispose(this.actions);
		}
	}
}

class ManageExtensionAction extends Action {

	constructor(
		@ICommandService private readonly commandService: ICommandService
	) {
		super('activitybar.manage.extension', nls.localize('manageExtension', "Manage Extension"));
	}

	run(id: string): Promise<any> {
		return this.commandService.executeCommand('_extensions.manage', id);
	}
}

export class DraggedCompositeIdentifier {
	constructor(private _compositeId: string) { }

	get id(): string {
		return this._compositeId;
	}
}

export class CompositeActionViewItem extends ActivityActionViewItem {

	private static manageExtensionAction: ManageExtensionAction;

	private compositeActivity: IActivity | undefined;
	private compositeTransfer: LocalSelectionTransfer<DraggedCompositeIdentifier>;

	constructor(
		private compositeActivityAction: ActivityAction,
		private toggleCompositePinnedAction: Action,
		private contextMenuActionsProvider: () => Action[],
		colors: (theme: ITheme) => ICompositeBarColors,
		icon: boolean,
		private compositeBar: ICompositeBar,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(compositeActivityAction, { draggable: true, colors, icon }, themeService);

		this.compositeTransfer = LocalSelectionTransfer.getInstance<DraggedCompositeIdentifier>();

		if (!CompositeActionViewItem.manageExtensionAction) {
			CompositeActionViewItem.manageExtensionAction = instantiationService.createInstance(ManageExtensionAction);
		}

		this._register(compositeActivityAction.onDidChangeActivity(() => { this.compositeActivity = undefined; this.updateActivity(); }, this));
	}

	protected get activity(): IActivity {
		if (!this.compositeActivity) {
			let activityName: string;
			const keybinding = typeof this.compositeActivityAction.activity.keybindingId === 'string' ? this.getKeybindingLabel(this.compositeActivityAction.activity.keybindingId) : null;
			if (keybinding) {
				activityName = nls.localize('titleKeybinding', "{0} ({1})", this.compositeActivityAction.activity.name, keybinding);
			} else {
				activityName = this.compositeActivityAction.activity.name;
			}

			this.compositeActivity = {
				id: this.compositeActivityAction.activity.id,
				cssClass: this.compositeActivityAction.activity.cssClass,
				name: activityName
			};
		}

		return this.compositeActivity;
	}

	private getKeybindingLabel(id: string): string | null {
		const kb = this.keybindingService.lookupKeybinding(id);
		if (kb) {
			return kb.getLabel();
		}

		return null;
	}

	render(container: HTMLElement): void {
		super.render(container);

		this.updateChecked();
		this.updateEnabled();

		this._register(dom.addDisposableListener(this.container, dom.EventType.CONTEXT_MENU, e => {
			dom.EventHelper.stop(e, true);

			this.showContextMenu(container);
		}));

		// Allow to drag
		this._register(dom.addDisposableListener(this.container, dom.EventType.DRAG_START, (e: DragEvent) => {
			e.dataTransfer!.effectAllowed = 'move';

			// Registe as dragged to local transfer
			this.compositeTransfer.setData([new DraggedCompositeIdentifier(this.activity.id)], DraggedCompositeIdentifier.prototype);

			// Trigger the action even on drag start to prevent clicks from failing that started a drag
			if (!this.getAction().checked) {
				this.getAction().run();
			}
		}));

		this._register(new DragAndDropObserver(this.container, {
			onDragEnter: e => {
				if (this.compositeTransfer.hasData(DraggedCompositeIdentifier.prototype) && this.compositeTransfer.getData(DraggedCompositeIdentifier.prototype)![0].id !== this.activity.id) {
					this.updateFromDragging(container, true);
				}
			},

			onDragLeave: e => {
				if (this.compositeTransfer.hasData(DraggedCompositeIdentifier.prototype)) {
					this.updateFromDragging(container, false);
				}
			},

			onDragEnd: e => {
				if (this.compositeTransfer.hasData(DraggedCompositeIdentifier.prototype)) {
					this.updateFromDragging(container, false);

					this.compositeTransfer.clearData(DraggedCompositeIdentifier.prototype);
				}
			},

			onDrop: e => {
				dom.EventHelper.stop(e, true);

				if (this.compositeTransfer.hasData(DraggedCompositeIdentifier.prototype)) {
					const draggedCompositeId = this.compositeTransfer.getData(DraggedCompositeIdentifier.prototype)![0].id;
					if (draggedCompositeId !== this.activity.id) {
						this.updateFromDragging(container, false);
						this.compositeTransfer.clearData(DraggedCompositeIdentifier.prototype);

						this.compositeBar.move(draggedCompositeId, this.activity.id);
					}
				}
			}
		}));

		// Activate on drag over to reveal targets
		[this.badge, this.label].forEach(b => this._register(new DelayedDragHandler(b, () => {
			if (!this.compositeTransfer.hasData(DraggedCompositeIdentifier.prototype) && !this.getAction().checked) {
				this.getAction().run();
			}
		})));

		this.updateStyles();
	}

	private updateFromDragging(element: HTMLElement, isDragging: boolean): void {
		const theme = this.themeService.getTheme();
		const dragBackground = this.options.colors(theme).dragAndDropBackground;

		element.style.backgroundColor = isDragging && dragBackground ? dragBackground.toString() : null;
	}

	private showContextMenu(container: HTMLElement): void {
		const actions: Action[] = [this.toggleCompositePinnedAction];
		if ((<any>this.compositeActivityAction.activity).extensionId) {
			actions.push(new Separator());
			actions.push(CompositeActionViewItem.manageExtensionAction);
		}

		const isPinned = this.compositeBar.isPinned(this.activity.id);
		if (isPinned) {
			this.toggleCompositePinnedAction.label = nls.localize('hide', "Hide");
			this.toggleCompositePinnedAction.checked = false;
		} else {
			this.toggleCompositePinnedAction.label = nls.localize('keep', "Keep");
		}

		const otherActions = this.contextMenuActionsProvider();
		if (otherActions.length) {
			actions.push(new Separator());
			actions.push(...otherActions);
		}

		const elementPosition = dom.getDomNodePagePosition(container);
		const anchor = {
			x: Math.floor(elementPosition.left + (elementPosition.width / 2)),
			y: elementPosition.top + elementPosition.height
		};

		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActionsContext: () => this.activity.id,
			getActions: () => actions
		});
	}

	focus(): void {
		this.container.focus();
	}

	protected updateChecked(): void {
		if (this.getAction().checked) {
			dom.addClass(this.container, 'checked');
			this.container.setAttribute('aria-label', nls.localize('compositeActive', "{0} active", this.container.title));
		} else {
			dom.removeClass(this.container, 'checked');
			this.container.setAttribute('aria-label', this.container.title);
		}
		this.updateStyles();
	}

	protected updateEnabled(): void {
		if (!this.element) {
			return;
		}

		if (this.getAction().enabled) {
			dom.removeClass(this.element, 'disabled');
		} else {
			dom.addClass(this.element, 'disabled');
		}
	}

	dispose(): void {
		super.dispose();

		this.compositeTransfer.clearData(DraggedCompositeIdentifier.prototype);

		this.label.remove();
	}
}

export class ToggleCompositePinnedAction extends Action {

	constructor(
		private activity: IActivity | undefined,
		private compositeBar: ICompositeBar
	) {
		super('show.toggleCompositePinned', activity ? activity.name : nls.localize('toggle', "Toggle View Pinned"));

		this.checked = !!this.activity && this.compositeBar.isPinned(this.activity.id);
	}

	run(context: string): Promise<any> {
		const id = this.activity ? this.activity.id : context;

		if (this.compositeBar.isPinned(id)) {
			this.compositeBar.unpin(id);
		} else {
			this.compositeBar.pin(id);
		}

		return Promise.resolve(true);
	}
}

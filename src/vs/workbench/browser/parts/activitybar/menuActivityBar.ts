/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/menuActivityBar.css';
import { $, addDisposableListener, append, EventHelper, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ActionsOrientation, IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { ActionRunner, IAction, toAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IActivity, IBadge, NumberBadge } from '../../../services/activity/common/activity.js';

/** The activity reported for the entries of a {@link MenuActivityBar}, by the command of the entry. */
export interface IMenuActivityBarActivities {
	readonly onDidChangeActivity: Event<string>;
	getActivity(commandId: string): readonly IActivity[];
}

/** The size of a {@link MenuActivityBar}. */
export const enum MenuActivityBarSize {
	/** Like the workbench activity bar of the Modern UI, at the layout density of the window. */
	Normal = 'normal',
	/** Minimum-size entries around base-size icons, whatever the layout density. */
	Compact = 'compact',
}

export interface IMenuActivityBarOptions {
	/** The menu whose entries the bar shows; each of its groups is set apart by a separator. */
	readonly menuId: MenuId;
	/** The menu whose actions the bar's context menu shows after the entries that can be shown and hidden. */
	readonly contextMenuId: MenuId;
	readonly ariaLabel: string;
	readonly telemetrySource: string;
	/** The size of the bar. Defaults to {@link MenuActivityBarSize.Normal}. */
	readonly size?: IObservable<MenuActivityBarSize>;
	/** Whether the bar shows; it also shows only while it has entries. Defaults to always. */
	readonly enabled?: IObservable<boolean>;
	/** Where the hovers of the entries show, away from the edge the bar is at. Defaults to the right. */
	readonly hoverPosition?: HoverPosition;
	/** The context the entries that run without one of their own run with, read as they run. */
	readonly getActionsContext?: () => unknown;
	/** The activity whose badges the entries show. */
	readonly activities?: IMenuActivityBarActivities;
	/**
	 * The view of an entry, for entries that need their own, such as a submenu that opens a flyout, created with
	 * `instantiationService`, which has the bar's context keys. Entries it gives none for show as
	 * {@link MenuActivityBarActionViewItem}s.
	 */
	readonly actionViewItemProvider?: (action: IAction, options: IActionViewItemOptions, instantiationService: IInstantiationService) => IActionViewItem | undefined;
}

/**
 * A vertical activity bar of the icon-only entries of a menu, sized and colored like the workbench activity bar of the
 * Modern UI at the layout density of the window (see `media/menuActivityBar.css`). Contributions add entries to its
 * menu, show their activity as badges, and can be shown and hidden from its context menu, which it offers anywhere on
 * the bar. Hosts place it.
 */
export class MenuActivityBar extends Disposable {

	/** The size of an entry, and the width of the column of entries. */
	static readonly ITEM_SIZE = 36;
	static readonly COMPACT_ITEM_SIZE = 24;

	/** The space beside the column of entries, inside the bar's border, at the default and compact layout densities. */
	static readonly LANE = 8;
	static readonly COMPACT_DENSITY_LANE = 4;
	static readonly COMPACT_SIZE_LANE = 6;

	/** The width of the bar at a size and layout density, its border included. */
	static getWidth(compactDensity: boolean, size = MenuActivityBarSize.Normal): number {
		if (size === MenuActivityBarSize.Compact) {
			return MenuActivityBar.COMPACT_ITEM_SIZE + MenuActivityBar.COMPACT_SIZE_LANE;
		}
		return MenuActivityBar.ITEM_SIZE + (compactDensity ? MenuActivityBar.COMPACT_DENSITY_LANE : MenuActivityBar.LANE);
	}

	readonly element: HTMLElement;

	/** The context key service of the bar's entries, for the `when` conditions of its menu. */
	readonly contextKeyService: IContextKeyService;

	private readonly _visible = observableValue(this, false);
	/** Whether the bar is enabled and has entries. */
	readonly visible: IObservable<boolean> = this._visible;

	private readonly toolbar: MenuWorkbenchToolBar;
	private readonly itemsChanged = observableSignal(this);
	/** Signals that the bar's entries changed, and so may its height. */
	readonly onDidChangeEntries: IObservable<void> = this.itemsChanged;

	constructor(
		container: HTMLElement,
		options: IMenuActivityBarOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		super();

		this.element = append(container, $('.menu-activity-bar'));
		const scopedContextKeyService = this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		// The entries' show and hide toggles, which the context menu of the rest of the bar lists like an entry's does.
		const menu = this._register(menuService.createMenu(options.menuId, scopedContextKeyService));

		// Like the workbench activity bar, once an entry's hover has shown, moving to another entry shows its hover instantly.
		const hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'element', { instantHover: true }, { position: { hoverPosition: options.hoverPosition ?? HoverPosition.RIGHT } }));
		const getActionsContext = options.getActionsContext;
		const actionRunner = this._register(new MenuActivityBarActionRunner(() => getActionsContext?.()));
		const toolbar = this.toolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.element, options.menuId, {
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: options.ariaLabel,
			telemetrySource: options.telemetrySource,
			hoverDelegate,
			actionRunner,
			// Entries hidden from the context menu leave the bar; a vertical bar has no overflow menu.
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			contextMenu: options.contextMenuId,
			menuOptions: { shouldForwardArgs: true },
			// Every group shows in the bar, each set apart by a separator.
			toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
			actionViewItemProvider: (action, itemOptions) => {
				const item = options.actionViewItemProvider?.(action, itemOptions, scopedInstantiationService);
				if (item) {
					return item;
				}
				if (action instanceof MenuItemAction) {
					return scopedInstantiationService.createInstance(MenuActivityBarActionViewItem, action, itemOptions, options.activities);
				}
				return undefined;
			},
		}));

		this._register(toolbar.onDidChangeMenuItems(() => this.itemsChanged.trigger(undefined)));
		if (options.size) {
			const size = options.size;
			this._register(autorun(reader => this.element.classList.toggle('size-compact', size.read(reader) === MenuActivityBarSize.Compact)));
		}
		this._register(autorun(reader => {
			this.itemsChanged.read(reader);
			const visible = (options.enabled?.read(reader) ?? true) && toolbar.getItemsLength() > 0;
			this.element.classList.toggle('hidden', !visible);
			this._visible.set(visible, undefined);
		}));

		// Entries show the toolbar's own context menu: their own actions, then the toggles of all entries, then these actions.
		// The rest of the bar shows the same menu without the actions of an entry.
		this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, (e: MouseEvent) => {
			EventHelper.stop(e, true);
			contextMenuService.showContextMenu({
				getAnchor: () => new StandardMouseEvent(getWindow(this.element), e),
				getActions: () => getEntryToggles(menu.getActions({ shouldForwardArgs: true }).flatMap(([, actions]) => actions)),
				menuId: options.contextMenuId,
				menuActionOptions: { renderShortTitle: true, shouldForwardArgs: true },
				contextKeyService,
			});
		}));
	}

	/** Renders the entries again, such as after the views {@link IMenuActivityBarOptions.actionViewItemProvider} gives change. */
	refresh(): void {
		this.toolbar.refresh();
		this.itemsChanged.trigger(undefined);
	}
}

/**
 * The show and hide toggles of the bar's entries, as the toolbar lists them in an entry's context menu: the last entry
 * shown cannot be hidden, as the bar has no other place to show it again.
 */
function getEntryToggles(actions: readonly IAction[]): IAction[] {
	const toggles = actions.flatMap(action => (action instanceof MenuItemAction || action instanceof SubmenuItemAction) && action.hideActions ? [action.hideActions.toggle] : []);
	const checked = toggles.filter(toggle => toggle.checked);
	if (checked.length !== 1) {
		return toggles;
	}
	return toggles.map(toggle => toggle === checked[0] ? toAction({ id: toggle.id, label: toggle.label, checked: true, enabled: false, run: () => { } }) : toggle);
}

/** Runs the entries of the bar with the context it supplies to those that run without one of their own. */
class MenuActivityBarActionRunner extends ActionRunner {

	constructor(private readonly getContext: () => unknown) {
		super();
	}

	protected override runAction(action: IAction, context?: unknown): Promise<void> {
		return super.runAction(action, context ?? this.getContext());
	}
}

/**
 * An entry of a {@link MenuActivityBar} that shows the activity reported for its command, using the most recent
 * activity: a count for a number badge, and a dot for other badges. The badge description is appended to the entry's
 * hover and accessible label.
 */
export class MenuActivityBarActionViewItem extends MenuEntryActionViewItem {

	private badgeElement: HTMLElement | undefined;

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		private readonly activities: IMenuActivityBarActivities | undefined,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);

		if (activities) {
			this._register(activities.onDidChangeActivity(commandId => {
				if (commandId === this._menuItemAction.id) {
					this.updateActivity();
				}
			}));
		}
		this._register(themeService.onDidColorThemeChange(() => this.updateActivity()));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		// The entry's label and tooltip announce the activity.
		this.badgeElement = append(container, $('.menu-activity-bar-badge', { 'aria-hidden': 'true' }));
		this.updateActivity();
	}

	/** The badge of the most recent activity reported for the entry's command, which the entry shows. */
	protected getBadge(): IBadge | undefined {
		return this.activities?.getActivity(this._menuItemAction.id).at(-1)?.badge;
	}

	protected override getTooltip(): string {
		const title = super.getTooltip();
		const description = this.getBadge()?.getDescription();
		return description ? localize('menuActivityBar.titleWithActivity', "{0} - {1}", title, description) : title;
	}

	private updateActivity(): void {
		const badgeElement = this.badgeElement;
		if (!badgeElement) {
			return;
		}

		const badge = this.getBadge();
		const count = badge instanceof NumberBadge ? badge.number : 0;
		badgeElement.classList.toggle('visible', !!badge && (!(badge instanceof NumberBadge) || count > 0));
		badgeElement.classList.toggle('count', count > 0);
		badgeElement.textContent = count > 99 ? '99+' : count > 0 ? `${count}` : '';

		const colors = badge?.getColors(this._themeService.getColorTheme());
		badgeElement.style.backgroundColor = colors?.badgeBackground?.toString() ?? '';
		badgeElement.style.color = colors?.badgeForeground?.toString() ?? '';
		badgeElement.style.borderColor = colors?.badgeBorder?.toString() ?? '';

		this.updateTooltip();
	}
}

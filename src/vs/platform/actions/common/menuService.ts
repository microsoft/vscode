/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IMenu, IMenuActionOptions, IMenuCreateOptions, IMenuItem, IMenuService, isIMenuItem, ISubmenuItem, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export class MenuService implements IMenuService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService
	) {
		//
	}

	/**
	 * Create a new menu for the given menu identifier. A menu sends events when it's entries
	 * have changed (placement, enablement, checked-state). By default it does send events for
	 * sub menu entries. That is more expensive and must be explicitly enabled with the
	 * `emitEventsForSubmenuChanges` flag.
	 */
	createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu {
		return new Menu(id, { emitEventsForSubmenuChanges: false, eventDebounceDelay: 50, ...options }, this._commandService, contextKeyService, this);
	}
}


type MenuItemGroup = [string, Array<IMenuItem | ISubmenuItem>];

class Menu implements IMenu {

	private readonly _disposables = new DisposableStore();

	private readonly _onDidChange: Emitter<IMenu>;
	readonly onDidChange: Event<IMenu>;

	private _menuGroups: MenuItemGroup[] = [];
	private _contextKeys: Set<string> = new Set();

	constructor(
		private readonly _id: MenuId,
		private readonly _options: Required<IMenuCreateOptions>,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService
	) {
		this._build();

		// Rebuild this menu whenever the menu registry reports an event for this MenuId.
		// This usually happen while code and extensions are loaded and affects the over
		// structure of the menu
		const rebuildMenuSoon = new RunOnceScheduler(() => {
			this._build();
			this._onDidChange.fire(this);
		}, _options.eventDebounceDelay);
		this._disposables.add(rebuildMenuSoon);
		this._disposables.add(MenuRegistry.onDidChangeMenu(e => {
			if (e.has(_id)) {
				rebuildMenuSoon.schedule();
			}
		}));

		// When context keys change we need to check if the menu also has changed. However,
		// we only do that when someone listens on this menu because (1) context key events are
		// firing often and (2) menu are often leaked
		const contextKeyListener = this._disposables.add(new DisposableStore());
		const startContextKeyListener = () => {
			const fireChangeSoon = new RunOnceScheduler(() => this._onDidChange.fire(this), _options.eventDebounceDelay);
			contextKeyListener.add(fireChangeSoon);
			contextKeyListener.add(_contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(this._contextKeys)) {
					fireChangeSoon.schedule();
				}
			}));
		};

		this._onDidChange = new Emitter({
			// start/stop context key listener
			onFirstListenerAdd: startContextKeyListener,
			onLastListenerRemove: contextKeyListener.clear.bind(contextKeyListener)
		});
		this.onDidChange = this._onDidChange.event;

	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidChange.dispose();
	}

	private _build(): void {

		// reset
		this._menuGroups.length = 0;
		this._contextKeys.clear();

		const menuItems = MenuRegistry.getMenuItems(this._id);

		let group: MenuItemGroup | undefined;
		menuItems.sort(Menu._compareMenuItems);

		for (const item of menuItems) {
			// group by groupId
			const groupName = item.group || '';
			if (!group || group[0] !== groupName) {
				group = [groupName, []];
				this._menuGroups.push(group);
			}
			group![1].push(item);

			// keep keys for eventing
			this._collectContextKeys(item);
		}
	}

	private _collectContextKeys(item: IMenuItem | ISubmenuItem): void {

		Menu._fillInKbExprKeys(item.when, this._contextKeys);

		if (isIMenuItem(item)) {
			// keep precondition keys for event if applicable
			if (item.command.precondition) {
				Menu._fillInKbExprKeys(item.command.precondition, this._contextKeys);
			}
			// keep toggled keys for event if applicable
			if (item.command.toggled) {
				const toggledExpression: ContextKeyExpression = (item.command.toggled as { condition: ContextKeyExpression }).condition || item.command.toggled;
				Menu._fillInKbExprKeys(toggledExpression, this._contextKeys);
			}

		} else if (this._options.emitEventsForSubmenuChanges) {
			// recursively collect context keys from submenus so that this
			// menu fires events when context key changes affect submenus
			MenuRegistry.getMenuItems(item.submenu).forEach(this._collectContextKeys, this);
		}
	}

	getActions(options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][] {
		const result: [string, Array<MenuItemAction | SubmenuItemAction>][] = [];
		for (const group of this._menuGroups) {
			const [id, items] = group;
			const activeActions: Array<MenuItemAction | SubmenuItemAction> = [];
			for (const item of items) {
				if (this._contextKeyService.contextMatchesRules(item.when)) {
					let action: MenuItemAction | SubmenuItemAction | undefined;
					if (isIMenuItem(item)) {
						action = new MenuItemAction(item.command, item.alt, options, this._contextKeyService, this._commandService);
					} else {
						action = new SubmenuItemAction(item, this._menuService, this._contextKeyService, options);
						if (action.actions.length === 0) {
							action.dispose();
							action = undefined;
						}
					}

					if (action) {
						activeActions.push(action);
					}
				}
			}
			if (activeActions.length > 0) {
				result.push([id, activeActions]);
			}
		}
		return result;
	}

	private static _fillInKbExprKeys(exp: ContextKeyExpression | undefined, set: Set<string>): void {
		if (exp) {
			for (const key of exp.keys()) {
				set.add(key);
			}
		}
	}

	private static _compareMenuItems(a: IMenuItem | ISubmenuItem, b: IMenuItem | ISubmenuItem): number {

		const aGroup = a.group;
		const bGroup = b.group;

		if (aGroup !== bGroup) {

			// Falsy groups come last
			if (!aGroup) {
				return 1;
			} else if (!bGroup) {
				return -1;
			}

			// 'navigation' group comes first
			if (aGroup === 'navigation') {
				return -1;
			} else if (bGroup === 'navigation') {
				return 1;
			}

			// lexical sort for groups
			const value = aGroup.localeCompare(bGroup);
			if (value !== 0) {
				return value;
			}
		}

		// sort on priority - default is 0
		const aPrio = a.order || 0;
		const bPrio = b.order || 0;
		if (aPrio < bPrio) {
			return -1;
		} else if (aPrio > bPrio) {
			return 1;
		}

		// sort on titles
		return Menu._compareTitles(
			isIMenuItem(a) ? a.command.title : a.title,
			isIMenuItem(b) ? b.command.title : b.title
		);
	}

	private static _compareTitles(a: string | ILocalizedString, b: string | ILocalizedString) {
		const aStr = typeof a === 'string' ? a : a.original;
		const bStr = typeof b === 'string' ? b : b.original;
		return aStr.localeCompare(bStr);
	}
}

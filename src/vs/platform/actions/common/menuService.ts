/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IMenu, IMenuActionOptions, IMenuCreateOptions, IMenuItem, IMenuService, isIMenuItem, isISubmenuItem, ISubmenuItem, MenuId, MenuItemAction, MenuItemActionManageActions, MenuRegistry, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandAction, ILocalizedString } from 'vs/platform/action/common/action';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IAction, SubmenuAction } from 'vs/base/common/actions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { removeFastWithoutKeepingOrder } from 'vs/base/common/arrays';
import { localize } from 'vs/nls';

export class MenuService implements IMenuService {

	declare readonly _serviceBrand: undefined;

	private readonly _hiddenStates: PersistedMenuHideState;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IStorageService storageService: IStorageService,
	) {
		this._hiddenStates = new PersistedMenuHideState(storageService);
	}

	createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu {
		return new Menu(id, this._hiddenStates, { emitEventsForSubmenuChanges: false, eventDebounceDelay: 50, ...options }, this._commandService, contextKeyService, this);
	}

	resetHiddenStates(): void {
		this._hiddenStates.reset();
	}
}

class PersistedMenuHideState {

	private static readonly _key = 'menu.hiddenCommands';

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _ignoreChangeEvent: boolean = false;
	private _data: Record<string, string[] | undefined>;

	constructor(@IStorageService private readonly _storageService: IStorageService) {
		try {
			const raw = _storageService.get(PersistedMenuHideState._key, StorageScope.PROFILE, '{}');
			this._data = JSON.parse(raw);
		} catch (err) {
			this._data = Object.create(null);
		}

		this._disposables.add(_storageService.onDidChangeValue(e => {
			if (e.key !== PersistedMenuHideState._key) {
				return;
			}
			if (!this._ignoreChangeEvent) {
				try {
					const raw = _storageService.get(PersistedMenuHideState._key, StorageScope.PROFILE, '{}');
					this._data = JSON.parse(raw);
				} catch (err) {
					console.log('FAILED to read storage after UPDATE', err);
				}
			}
			this._onDidChange.fire();
		}));
	}

	dispose() {
		this._onDidChange.dispose();
		this._disposables.dispose();
	}

	isHidden(menu: MenuId, commandId: string): boolean {
		return this._data[menu.id]?.includes(commandId) ?? false;
	}

	updateHidden(menu: MenuId, commandId: string, hidden: boolean): void {
		const entries = this._data[menu.id];
		if (!hidden) {
			// remove and cleanup
			if (entries) {
				const idx = entries.indexOf(commandId);
				if (idx >= 0) {
					removeFastWithoutKeepingOrder(entries, idx);
				}
				if (entries.length === 0) {
					delete this._data[menu.id];
				}
			}
		} else {
			// add unless already added
			if (!entries) {
				this._data[menu.id] = [commandId];
			} else {
				const idx = entries.indexOf(commandId);
				if (idx < 0) {
					entries.push(commandId);
				}
			}
		}
		this._persist();
	}

	reset(): void {
		this._data = Object.create(null);
		this._persist();
	}

	private _persist(): void {
		try {
			this._ignoreChangeEvent = true;
			const raw = JSON.stringify(this._data);
			this._storageService.store(PersistedMenuHideState._key, raw, StorageScope.PROFILE, StorageTarget.USER);
		} finally {
			this._ignoreChangeEvent = false;
		}
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
		private readonly _hiddenStates: PersistedMenuHideState,
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

		// When context keys or storage state changes we need to check if the menu also has changed. However,
		// we only do that when someone listens on this menu because (1) these events are
		// firing often and (2) menu are often leaked
		const lazyListener = this._disposables.add(new DisposableStore());
		const startLazyListener = () => {
			const fireChangeSoon = new RunOnceScheduler(() => this._onDidChange.fire(this), _options.eventDebounceDelay);
			lazyListener.add(fireChangeSoon);
			lazyListener.add(_contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(this._contextKeys)) {
					fireChangeSoon.schedule();
				}
			}));
			lazyListener.add(_hiddenStates.onDidChange(() => {
				fireChangeSoon.schedule();
			}));
		};

		this._onDidChange = new Emitter({
			// start/stop context key listener
			onFirstListenerAdd: startLazyListener,
			onLastListenerRemove: lazyListener.clear.bind(lazyListener)
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
		const allToggleActions: IAction[][] = [];

		for (const group of this._menuGroups) {
			const [id, items] = group;

			const toggleActions: IAction[] = [];

			const activeActions: Array<MenuItemAction | SubmenuItemAction> = [];
			for (const item of items) {
				if (this._contextKeyService.contextMatchesRules(item.when)) {
					let action: MenuItemAction | SubmenuItemAction | undefined;
					const isMenuItem = isIMenuItem(item);
					const hideActions = new MenuItemActionManageActions(new HideMenuItemAction(this._id, isMenuItem ? item.command : item, this._hiddenStates), allToggleActions);

					if (isMenuItem) {
						if (!this._hiddenStates.isHidden(this._id, item.command.id)) {
							action = new MenuItemAction(item.command, item.alt, options, hideActions, this._contextKeyService, this._commandService);
						}
						// add toggle commmand
						toggleActions.push(new ToggleMenuItemAction(this._id, item.command, this._hiddenStates));
					} else {
						action = new SubmenuItemAction(item, hideActions, this._menuService, this._contextKeyService, options);
						if (action.actions.length === 0) {
							action.dispose();
							action = undefined;
						}
						// add toggle submenu - this re-creates ToggleMenuItemAction-instances for submenus but that's OK...
						if (action) {
							const makeToggleCommand = (id: MenuId, action: IAction): IAction => {
								if (action instanceof SubmenuItemAction) {
									return new SubmenuAction(action.id, action.label, action.actions.map(a => makeToggleCommand(action.item.submenu, a)));
								} else if (action instanceof MenuItemAction) {
									return new ToggleMenuItemAction(id, action.item, this._hiddenStates);
								} else {
									return action;
								}
							};
							toggleActions.push(makeToggleCommand(this._id, action));
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
			if (toggleActions.length > 0) {
				allToggleActions.push(toggleActions);
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

class ToggleMenuItemAction implements IAction {

	readonly id: string;
	readonly label: string;
	readonly enabled: boolean = true;
	readonly tooltip: string = '';

	readonly checked: boolean;
	readonly class: undefined;

	run: () => void;

	constructor(id: MenuId, command: ICommandAction, hiddenStates: PersistedMenuHideState) {
		this.id = `toggle/${id.id}/${command.id}`;
		this.label = typeof command.title === 'string' ? command.title : command.title.value;

		let isHidden = hiddenStates.isHidden(id, command.id);
		this.checked = !isHidden;
		this.run = () => {
			isHidden = !isHidden;
			hiddenStates.updateHidden(id, command.id, isHidden);
		};
	}

	dispose(): void {
		// NOTHING
	}
}

class HideMenuItemAction implements IAction {

	readonly id: string;
	readonly label: string;
	readonly enabled: boolean = true;
	readonly tooltip: string = '';

	readonly checked: undefined;
	readonly class: undefined;

	run: () => void;

	constructor(menu: MenuId, command: ICommandAction | ISubmenuItem, hiddenStates: PersistedMenuHideState) {
		const id = isISubmenuItem(command) ? command.submenu.id : command.id;
		this.id = `hide/${menu.id}/${id}`;
		this.label = localize('hide.label', 'Hide \'{0}\'', typeof command.title === 'string' ? command.title : command.title.value);
		this.run = () => { hiddenStates.updateHidden(menu, id, true); };
	}

	dispose(): void {
		// NOTHING
	}
}

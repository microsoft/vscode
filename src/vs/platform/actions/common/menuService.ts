/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { DebounceEmitter, Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IMenu, IMenuActionOptions, IMenuChangeEvent, IMenuCreateOptions, IMenuItem, IMenuItemHide, IMenuService, isIMenuItem, isISubmenuItem, ISubmenuItem, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandAction, ILocalizedString } from 'vs/platform/action/common/action';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IAction, Separator, toAction } from 'vs/base/common/actions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { removeFastWithoutKeepingOrder } from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class MenuService implements IMenuService {

	declare readonly _serviceBrand: undefined;

	private readonly _hiddenStates: PersistedMenuHideState;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IStorageService storageService: IStorageService,
	) {
		this._hiddenStates = new PersistedMenuHideState(storageService);
	}

	createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu {
		return new MenuImpl(id, this._hiddenStates, { emitEventsForSubmenuChanges: false, eventDebounceDelay: 50, ...options }, this._commandService, this._keybindingService, contextKeyService);
	}

	resetHiddenStates(ids?: MenuId[]): void {
		this._hiddenStates.reset(ids);
	}
}

class PersistedMenuHideState {

	private static readonly _key = 'menu.hiddenCommands';

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _ignoreChangeEvent: boolean = false;
	private _data: Record<string, string[] | undefined>;

	private _hiddenByDefaultCache = new Map<string, boolean>();

	constructor(@IStorageService private readonly _storageService: IStorageService) {
		try {
			const raw = _storageService.get(PersistedMenuHideState._key, StorageScope.PROFILE, '{}');
			this._data = JSON.parse(raw);
		} catch (err) {
			this._data = Object.create(null);
		}

		this._disposables.add(_storageService.onDidChangeValue(StorageScope.PROFILE, PersistedMenuHideState._key, this._disposables)(() => {
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

	private _isHiddenByDefault(menu: MenuId, commandId: string) {
		return this._hiddenByDefaultCache.get(`${menu.id}/${commandId}`) ?? false;
	}

	setDefaultState(menu: MenuId, commandId: string, hidden: boolean): void {
		this._hiddenByDefaultCache.set(`${menu.id}/${commandId}`, hidden);
	}

	isHidden(menu: MenuId, commandId: string): boolean {
		const hiddenByDefault = this._isHiddenByDefault(menu, commandId);
		const state = this._data[menu.id]?.includes(commandId) ?? false;
		return hiddenByDefault ? !state : state;
	}

	updateHidden(menu: MenuId, commandId: string, hidden: boolean): void {
		const hiddenByDefault = this._isHiddenByDefault(menu, commandId);
		if (hiddenByDefault) {
			hidden = !hidden;
		}
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

	reset(menus?: MenuId[]): void {
		if (menus === undefined) {
			// reset all
			this._data = Object.create(null);
			this._persist();
		} else {
			// reset only for a specific menu
			for (const { id } of menus) {
				if (this._data[id]) {
					delete this._data[id];
				}
			}
			this._persist();
		}
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

class MenuInfo {

	private _menuGroups: MenuItemGroup[] = [];
	private _structureContextKeys: Set<string> = new Set();
	private _preconditionContextKeys: Set<string> = new Set();
	private _toggledContextKeys: Set<string> = new Set();

	constructor(
		private readonly _id: MenuId,
		private readonly _hiddenStates: PersistedMenuHideState,
		private readonly _collectContextKeysForSubmenus: boolean,
		@ICommandService private readonly _commandService: ICommandService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		this.refresh();
	}

	get structureContextKeys(): ReadonlySet<string> {
		return this._structureContextKeys;
	}

	get preconditionContextKeys(): ReadonlySet<string> {
		return this._preconditionContextKeys;
	}

	get toggledContextKeys(): ReadonlySet<string> {
		return this._toggledContextKeys;
	}

	refresh(): void {

		// reset
		this._menuGroups.length = 0;
		this._structureContextKeys.clear();
		this._preconditionContextKeys.clear();
		this._toggledContextKeys.clear();

		const menuItems = MenuRegistry.getMenuItems(this._id);

		let group: MenuItemGroup | undefined;
		menuItems.sort(MenuInfo._compareMenuItems);

		for (const item of menuItems) {
			// group by groupId
			const groupName = item.group || '';
			if (!group || group[0] !== groupName) {
				group = [groupName, []];
				this._menuGroups.push(group);
			}
			group[1].push(item);

			// keep keys for eventing
			this._collectContextKeys(item);
		}
	}

	private _collectContextKeys(item: IMenuItem | ISubmenuItem): void {

		MenuInfo._fillInKbExprKeys(item.when, this._structureContextKeys);

		if (isIMenuItem(item)) {
			// keep precondition keys for event if applicable
			if (item.command.precondition) {
				MenuInfo._fillInKbExprKeys(item.command.precondition, this._preconditionContextKeys);
			}
			// keep toggled keys for event if applicable
			if (item.command.toggled) {
				const toggledExpression: ContextKeyExpression = (item.command.toggled as { condition: ContextKeyExpression }).condition || item.command.toggled;
				MenuInfo._fillInKbExprKeys(toggledExpression, this._toggledContextKeys);
			}

		} else if (this._collectContextKeysForSubmenus) {
			// recursively collect context keys from submenus so that this
			// menu fires events when context key changes affect submenus
			MenuRegistry.getMenuItems(item.submenu).forEach(this._collectContextKeys, this);
		}
	}

	createActionGroups(options: IMenuActionOptions | undefined): [string, Array<MenuItemAction | SubmenuItemAction>][] {
		const result: [string, Array<MenuItemAction | SubmenuItemAction>][] = [];

		for (const group of this._menuGroups) {
			const [id, items] = group;

			let activeActions: Array<MenuItemAction | SubmenuItemAction> | undefined;
			for (const item of items) {
				if (this._contextKeyService.contextMatchesRules(item.when)) {
					const isMenuItem = isIMenuItem(item);
					if (isMenuItem) {
						this._hiddenStates.setDefaultState(this._id, item.command.id, !!item.isHiddenByDefault);
					}

					const menuHide = createMenuHide(this._id, isMenuItem ? item.command : item, this._hiddenStates);
					if (isMenuItem) {
						// MenuItemAction
						const menuKeybinding = createConfigureKeybindingAction(this._commandService, this._keybindingService, item.command.id, item.when);
						(activeActions ??= []).push(new MenuItemAction(item.command, item.alt, options, menuHide, menuKeybinding, this._contextKeyService, this._commandService));
					} else {
						// SubmenuItemAction
						const groups = new MenuInfo(item.submenu, this._hiddenStates, this._collectContextKeysForSubmenus, this._commandService, this._keybindingService, this._contextKeyService).createActionGroups(options);
						const submenuActions = Separator.join(...groups.map(g => g[1]));
						if (submenuActions.length > 0) {
							(activeActions ??= []).push(new SubmenuItemAction(item, menuHide, submenuActions));
						}
					}
				}
			}
			if (activeActions && activeActions.length > 0) {
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
		return MenuInfo._compareTitles(
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

class MenuImpl implements IMenu {

	private readonly _menuInfo: MenuInfo;
	private readonly _disposables = new DisposableStore();

	private readonly _onDidChange: Emitter<IMenuChangeEvent>;
	readonly onDidChange: Event<IMenuChangeEvent>;

	constructor(
		id: MenuId,
		hiddenStates: PersistedMenuHideState,
		options: Required<IMenuCreateOptions>,
		@ICommandService commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this._menuInfo = new MenuInfo(id, hiddenStates, options.emitEventsForSubmenuChanges, commandService, keybindingService, contextKeyService);

		// Rebuild this menu whenever the menu registry reports an event for this MenuId.
		// This usually happen while code and extensions are loaded and affects the over
		// structure of the menu
		const rebuildMenuSoon = new RunOnceScheduler(() => {
			this._menuInfo.refresh();
			this._onDidChange.fire({ menu: this, isStructuralChange: true, isEnablementChange: true, isToggleChange: true });
		}, options.eventDebounceDelay);
		this._disposables.add(rebuildMenuSoon);
		this._disposables.add(MenuRegistry.onDidChangeMenu(e => {
			if (e.has(id)) {
				rebuildMenuSoon.schedule();
			}
		}));

		// When context keys or storage state changes we need to check if the menu also has changed. However,
		// we only do that when someone listens on this menu because (1) these events are
		// firing often and (2) menu are often leaked
		const lazyListener = this._disposables.add(new DisposableStore());

		const merge = (events: IMenuChangeEvent[]): IMenuChangeEvent => {

			let isStructuralChange = false;
			let isEnablementChange = false;
			let isToggleChange = false;

			for (const item of events) {
				isStructuralChange = isStructuralChange || item.isStructuralChange;
				isEnablementChange = isEnablementChange || item.isEnablementChange;
				isToggleChange = isToggleChange || item.isToggleChange;
				if (isStructuralChange && isEnablementChange && isToggleChange) {
					// everything is TRUE, no need to continue iterating
					break;
				}
			}

			return { menu: this, isStructuralChange, isEnablementChange, isToggleChange };
		};

		const startLazyListener = () => {

			lazyListener.add(contextKeyService.onDidChangeContext(e => {
				const isStructuralChange = e.affectsSome(this._menuInfo.structureContextKeys);
				const isEnablementChange = e.affectsSome(this._menuInfo.preconditionContextKeys);
				const isToggleChange = e.affectsSome(this._menuInfo.toggledContextKeys);
				if (isStructuralChange || isEnablementChange || isToggleChange) {
					this._onDidChange.fire({ menu: this, isStructuralChange, isEnablementChange, isToggleChange });
				}
			}));
			lazyListener.add(hiddenStates.onDidChange(e => {
				this._onDidChange.fire({ menu: this, isStructuralChange: true, isEnablementChange: false, isToggleChange: false });
			}));
		};

		this._onDidChange = new DebounceEmitter({
			// start/stop context key listener
			onWillAddFirstListener: startLazyListener,
			onDidRemoveLastListener: lazyListener.clear.bind(lazyListener),
			delay: options.eventDebounceDelay,
			merge
		});
		this.onDidChange = this._onDidChange.event;
	}

	getActions(options?: IMenuActionOptions | undefined): [string, (MenuItemAction | SubmenuItemAction)[]][] {
		return this._menuInfo.createActionGroups(options);
	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidChange.dispose();
	}
}

function createMenuHide(menu: MenuId, command: ICommandAction | ISubmenuItem, states: PersistedMenuHideState): IMenuItemHide {

	const id = isISubmenuItem(command) ? command.submenu.id : command.id;
	const title = typeof command.title === 'string' ? command.title : command.title.value;

	const hide = toAction({
		id: `hide/${menu.id}/${id}`,
		label: localize('hide.label', 'Hide \'{0}\'', title),
		run() { states.updateHidden(menu, id, true); }
	});

	const toggle = toAction({
		id: `toggle/${menu.id}/${id}`,
		label: title,
		get checked() { return !states.isHidden(menu, id); },
		run() { states.updateHidden(menu, id, !!this.checked); }
	});

	return {
		hide,
		toggle,
		get isHidden() { return !toggle.checked; },
	};
}

export function createConfigureKeybindingAction(commandService: ICommandService, keybindingService: IKeybindingService, commandId: string, when: ContextKeyExpression | undefined = undefined, enabled = true): IAction {
	return toAction({
		id: `configureKeybinding/${commandId}`,
		label: localize('configure keybinding', "Configure Keybinding"),
		enabled,
		run() {
			// Only set the when clause when there is no keybinding
			// It is possible that the action and the keybinding have different when clauses
			const hasKeybinding = !!keybindingService.lookupKeybinding(commandId); // This may only be called inside the `run()` method as it can be expensive on startup. #210529
			const whenValue = !hasKeybinding && when ? when.serialize() : undefined;
			commandService.executeCommand('workbench.action.openGlobalKeybindings', `@command:${commandId}` + (whenValue ? ` +when:${whenValue}` : ''));
		}
	});
}

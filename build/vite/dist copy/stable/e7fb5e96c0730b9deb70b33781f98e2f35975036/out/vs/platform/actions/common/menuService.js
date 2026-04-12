/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PersistedMenuHideState_1, MenuInfo_1;
import { RunOnceScheduler } from '../../../base/common/async.js';
import { DebounceEmitter, Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { isIMenuItem, isISubmenuItem, MenuItemAction, MenuRegistry, SubmenuItemAction } from './actions.js';
import { ICommandService } from '../../commands/common/commands.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { Separator, toAction } from '../../../base/common/actions.js';
import { IStorageService } from '../../storage/common/storage.js';
import { removeFastWithoutKeepingOrder } from '../../../base/common/arrays.js';
import { localize } from '../../../nls.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
let MenuService = class MenuService {
    constructor(_commandService, _keybindingService, storageService) {
        this._commandService = _commandService;
        this._keybindingService = _keybindingService;
        this._hiddenStates = new PersistedMenuHideState(storageService);
    }
    createMenu(id, contextKeyService, options) {
        return new MenuImpl(id, this._hiddenStates, { emitEventsForSubmenuChanges: false, eventDebounceDelay: 50, ...options }, this._commandService, this._keybindingService, contextKeyService);
    }
    getMenuActions(id, contextKeyService, options) {
        const menu = new MenuImpl(id, this._hiddenStates, { emitEventsForSubmenuChanges: false, eventDebounceDelay: 50, ...options }, this._commandService, this._keybindingService, contextKeyService);
        const actions = menu.getActions(options);
        menu.dispose();
        return actions;
    }
    getMenuContexts(id) {
        const menuInfo = new MenuInfoSnapshot(id, false);
        return new Set([...menuInfo.structureContextKeys, ...menuInfo.preconditionContextKeys, ...menuInfo.toggledContextKeys]);
    }
    resetHiddenStates(ids) {
        this._hiddenStates.reset(ids);
    }
};
MenuService = __decorate([
    __param(0, ICommandService),
    __param(1, IKeybindingService),
    __param(2, IStorageService)
], MenuService);
export { MenuService };
let PersistedMenuHideState = class PersistedMenuHideState {
    static { PersistedMenuHideState_1 = this; }
    static { this._key = 'menu.hiddenCommands'; }
    constructor(_storageService) {
        this._storageService = _storageService;
        this._disposables = new DisposableStore();
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this._ignoreChangeEvent = false;
        this._hiddenByDefaultCache = new Map();
        try {
            const raw = _storageService.get(PersistedMenuHideState_1._key, 0 /* StorageScope.PROFILE */, '{}');
            this._data = JSON.parse(raw);
        }
        catch (err) {
            this._data = Object.create(null);
        }
        this._disposables.add(_storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, PersistedMenuHideState_1._key, this._disposables)(() => {
            if (!this._ignoreChangeEvent) {
                try {
                    const raw = _storageService.get(PersistedMenuHideState_1._key, 0 /* StorageScope.PROFILE */, '{}');
                    this._data = JSON.parse(raw);
                }
                catch (err) {
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
    _isHiddenByDefault(menu, commandId) {
        return this._hiddenByDefaultCache.get(`${menu.id}/${commandId}`) ?? false;
    }
    setDefaultState(menu, commandId, hidden) {
        this._hiddenByDefaultCache.set(`${menu.id}/${commandId}`, hidden);
    }
    isHidden(menu, commandId) {
        const hiddenByDefault = this._isHiddenByDefault(menu, commandId);
        const state = this._data[menu.id]?.includes(commandId) ?? false;
        return hiddenByDefault ? !state : state;
    }
    updateHidden(menu, commandId, hidden) {
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
        }
        else {
            // add unless already added
            if (!entries) {
                this._data[menu.id] = [commandId];
            }
            else {
                const idx = entries.indexOf(commandId);
                if (idx < 0) {
                    entries.push(commandId);
                }
            }
        }
        this._persist();
    }
    reset(menus) {
        if (menus === undefined) {
            // reset all
            this._data = Object.create(null);
            this._persist();
        }
        else {
            // reset only for a specific menu
            for (const { id } of menus) {
                if (this._data[id]) {
                    delete this._data[id];
                }
            }
            this._persist();
        }
    }
    _persist() {
        try {
            this._ignoreChangeEvent = true;
            const raw = JSON.stringify(this._data);
            this._storageService.store(PersistedMenuHideState_1._key, raw, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
        finally {
            this._ignoreChangeEvent = false;
        }
    }
};
PersistedMenuHideState = PersistedMenuHideState_1 = __decorate([
    __param(0, IStorageService)
], PersistedMenuHideState);
class MenuInfoSnapshot {
    constructor(_id, _collectContextKeysForSubmenus) {
        this._id = _id;
        this._collectContextKeysForSubmenus = _collectContextKeysForSubmenus;
        this._menuGroups = [];
        this._allMenuIds = new Set();
        this._structureContextKeys = new Set();
        this._preconditionContextKeys = new Set();
        this._toggledContextKeys = new Set();
        this.refresh();
    }
    get allMenuIds() {
        return this._allMenuIds;
    }
    get structureContextKeys() {
        return this._structureContextKeys;
    }
    get preconditionContextKeys() {
        return this._preconditionContextKeys;
    }
    get toggledContextKeys() {
        return this._toggledContextKeys;
    }
    refresh() {
        // reset
        this._menuGroups.length = 0;
        this._allMenuIds.clear();
        this._structureContextKeys.clear();
        this._preconditionContextKeys.clear();
        this._toggledContextKeys.clear();
        const menuItems = this._sort(MenuRegistry.getMenuItems(this._id));
        let group;
        for (const item of menuItems) {
            // group by groupId
            const groupName = item.group || '';
            if (!group || group[0] !== groupName) {
                group = [groupName, []];
                this._menuGroups.push(group);
            }
            group[1].push(item);
            // keep keys and submenu ids for eventing
            this._collectContextKeysAndSubmenuIds(item);
        }
        this._allMenuIds.add(this._id);
    }
    _sort(menuItems) {
        // no sorting needed in snapshot
        return menuItems;
    }
    _collectContextKeysAndSubmenuIds(item) {
        MenuInfoSnapshot._fillInKbExprKeys(item.when, this._structureContextKeys);
        if (isIMenuItem(item)) {
            // keep precondition keys for event if applicable
            if (item.command.precondition) {
                MenuInfoSnapshot._fillInKbExprKeys(item.command.precondition, this._preconditionContextKeys);
            }
            // keep toggled keys for event if applicable
            if (item.command.toggled) {
                const toggledExpression = item.command.toggled.condition || item.command.toggled;
                MenuInfoSnapshot._fillInKbExprKeys(toggledExpression, this._toggledContextKeys);
            }
        }
        else if (this._collectContextKeysForSubmenus) {
            // recursively collect context keys from submenus so that this
            // menu fires events when context key changes affect submenus
            MenuRegistry.getMenuItems(item.submenu).forEach(this._collectContextKeysAndSubmenuIds, this);
            this._allMenuIds.add(item.submenu);
        }
    }
    static _fillInKbExprKeys(exp, set) {
        if (exp) {
            for (const key of exp.keys()) {
                set.add(key);
            }
        }
    }
}
let MenuInfo = MenuInfo_1 = class MenuInfo extends MenuInfoSnapshot {
    constructor(_id, _hiddenStates, _collectContextKeysForSubmenus, _commandService, _keybindingService, _contextKeyService) {
        super(_id, _collectContextKeysForSubmenus);
        this._hiddenStates = _hiddenStates;
        this._commandService = _commandService;
        this._keybindingService = _keybindingService;
        this._contextKeyService = _contextKeyService;
        this.refresh();
    }
    createActionGroups(options) {
        const result = [];
        for (const group of this._menuGroups) {
            const [id, items] = group;
            let activeActions;
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
                    }
                    else {
                        // SubmenuItemAction
                        const groups = new MenuInfo_1(item.submenu, this._hiddenStates, this._collectContextKeysForSubmenus, this._commandService, this._keybindingService, this._contextKeyService).createActionGroups(options);
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
    _sort(menuItems) {
        return menuItems.sort(MenuInfo_1._compareMenuItems);
    }
    static _compareMenuItems(a, b) {
        const aGroup = a.group;
        const bGroup = b.group;
        if (aGroup !== bGroup) {
            // Falsy groups come last
            if (!aGroup) {
                return 1;
            }
            else if (!bGroup) {
                return -1;
            }
            // 'navigation' group comes first
            if (aGroup === 'navigation') {
                return -1;
            }
            else if (bGroup === 'navigation') {
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
        }
        else if (aPrio > bPrio) {
            return 1;
        }
        // sort on titles
        return MenuInfo_1._compareTitles(isIMenuItem(a) ? a.command.title : a.title, isIMenuItem(b) ? b.command.title : b.title);
    }
    static _compareTitles(a, b) {
        const aStr = typeof a === 'string' ? a : a.original;
        const bStr = typeof b === 'string' ? b : b.original;
        return aStr.localeCompare(bStr);
    }
};
MenuInfo = MenuInfo_1 = __decorate([
    __param(3, ICommandService),
    __param(4, IKeybindingService),
    __param(5, IContextKeyService)
], MenuInfo);
let MenuImpl = class MenuImpl {
    constructor(id, hiddenStates, options, commandService, keybindingService, contextKeyService) {
        this._disposables = new DisposableStore();
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
            for (const id of this._menuInfo.allMenuIds) {
                if (e.has(id)) {
                    rebuildMenuSoon.schedule();
                    break;
                }
            }
        }));
        // When context keys or storage state changes we need to check if the menu also has changed. However,
        // we only do that when someone listens on this menu because (1) these events are
        // firing often and (2) menu are often leaked
        const lazyListener = this._disposables.add(new DisposableStore());
        const merge = (events) => {
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
    getActions(options) {
        return this._menuInfo.createActionGroups(options);
    }
    dispose() {
        this._disposables.dispose();
        this._onDidChange.dispose();
    }
};
MenuImpl = __decorate([
    __param(3, ICommandService),
    __param(4, IKeybindingService),
    __param(5, IContextKeyService)
], MenuImpl);
function createMenuHide(menu, command, states) {
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
export function createConfigureKeybindingAction(commandService, keybindingService, commandId, when = undefined, enabled = true) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9tZW51U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUEyRyxXQUFXLEVBQUUsY0FBYyxFQUF3QixjQUFjLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRTNPLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQXdCLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakcsT0FBTyxFQUFXLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGlDQUFpQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVwRSxJQUFNLFdBQVcsR0FBakIsTUFBTSxXQUFXO0lBTXZCLFlBQ21DLGVBQWdDLEVBQzdCLGtCQUFzQyxFQUMxRCxjQUErQjtRQUZkLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUM3Qix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBRzNFLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsVUFBVSxDQUFDLEVBQVUsRUFBRSxpQkFBcUMsRUFBRSxPQUE0QjtRQUN6RixPQUFPLElBQUksUUFBUSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLEVBQUUsMkJBQTJCLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsRUFBRSxHQUFHLE9BQU8sRUFBRSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDM0wsQ0FBQztJQUVELGNBQWMsQ0FBQyxFQUFVLEVBQUUsaUJBQXFDLEVBQUUsT0FBNEI7UUFDN0YsTUFBTSxJQUFJLEdBQUcsSUFBSSxRQUFRLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsRUFBRSwyQkFBMkIsRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsRUFBRSxFQUFFLEdBQUcsT0FBTyxFQUFFLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUNoTSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNmLE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxlQUFlLENBQUMsRUFBVTtRQUN6QixNQUFNLFFBQVEsR0FBRyxJQUFJLGdCQUFnQixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxPQUFPLElBQUksR0FBRyxDQUFTLENBQUMsR0FBRyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO0lBQ2pJLENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxHQUFjO1FBQy9CLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQy9CLENBQUM7Q0FDRCxDQUFBO0FBakNZLFdBQVc7SUFPckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsZUFBZSxDQUFBO0dBVEwsV0FBVyxDQWlDdkI7O0FBRUQsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBc0I7O2FBRUgsU0FBSSxHQUFHLHFCQUFxQixBQUF4QixDQUF5QjtJQVdyRCxZQUE2QixlQUFpRDtRQUFoQyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFUN0QsaUJBQVksR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3JDLGlCQUFZLEdBQUcsSUFBSSxPQUFPLEVBQVEsQ0FBQztRQUMzQyxnQkFBVyxHQUFnQixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUVwRCx1QkFBa0IsR0FBWSxLQUFLLENBQUM7UUFHcEMsMEJBQXFCLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7UUFHMUQsSUFBSSxDQUFDO1lBQ0osTUFBTSxHQUFHLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyx3QkFBc0IsQ0FBQyxJQUFJLGdDQUF3QixJQUFJLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUIsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUVELElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsK0JBQXVCLHdCQUFzQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxFQUFFO1lBQ2pJLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztnQkFDOUIsSUFBSSxDQUFDO29CQUNKLE1BQU0sR0FBRyxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsd0JBQXNCLENBQUMsSUFBSSxnQ0FBd0IsSUFBSSxDQUFDLENBQUM7b0JBQ3pGLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDOUIsQ0FBQztnQkFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO29CQUNkLE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ3pELENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVPLGtCQUFrQixDQUFDLElBQVksRUFBRSxTQUFpQjtRQUN6RCxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsRUFBRSxJQUFJLFNBQVMsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDO0lBQzNFLENBQUM7SUFFRCxlQUFlLENBQUMsSUFBWSxFQUFFLFNBQWlCLEVBQUUsTUFBZTtRQUMvRCxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsSUFBSSxTQUFTLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRUQsUUFBUSxDQUFDLElBQVksRUFBRSxTQUFpQjtRQUN2QyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxLQUFLLENBQUM7UUFDaEUsT0FBTyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDekMsQ0FBQztJQUVELFlBQVksQ0FBQyxJQUFZLEVBQUUsU0FBaUIsRUFBRSxNQUFlO1FBQzVELE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDakUsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNyQixNQUFNLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDbEIsQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLHFCQUFxQjtZQUNyQixJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNiLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNkLDZCQUE2QixDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDN0MsQ0FBQztnQkFDRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQzFCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzVCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQzthQUFNLENBQUM7WUFDUCwyQkFBMkI7WUFDM0IsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNkLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbkMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNiLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3pCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNqQixDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQWdCO1FBQ3JCLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pCLFlBQVk7WUFDWixJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pCLENBQUM7YUFBTSxDQUFDO1lBQ1AsaUNBQWlDO1lBQ2pDLEtBQUssTUFBTSxFQUFFLEVBQUUsRUFBRSxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUM1QixJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDcEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN2QixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNqQixDQUFDO0lBQ0YsQ0FBQztJQUVPLFFBQVE7UUFDZixJQUFJLENBQUM7WUFDSixJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO1lBQy9CLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLHdCQUFzQixDQUFDLElBQUksRUFBRSxHQUFHLDJEQUEyQyxDQUFDO1FBQ3hHLENBQUM7Z0JBQVMsQ0FBQztZQUNWLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7UUFDakMsQ0FBQztJQUNGLENBQUM7O0FBNUdJLHNCQUFzQjtJQWFkLFdBQUEsZUFBZSxDQUFBO0dBYnZCLHNCQUFzQixDQTZHM0I7QUFJRCxNQUFNLGdCQUFnQjtJQU9yQixZQUNvQixHQUFXLEVBQ1gsOEJBQXVDO1FBRHZDLFFBQUcsR0FBSCxHQUFHLENBQVE7UUFDWCxtQ0FBOEIsR0FBOUIsOEJBQThCLENBQVM7UUFSakQsZ0JBQVcsR0FBb0IsRUFBRSxDQUFDO1FBQ3BDLGdCQUFXLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDckMsMEJBQXFCLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDL0MsNkJBQXdCLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDbEQsd0JBQW1CLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7UUFNcEQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxJQUFJLFVBQVU7UUFDYixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVELElBQUksb0JBQW9CO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDO0lBQ25DLENBQUM7SUFFRCxJQUFJLHVCQUF1QjtRQUMxQixPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztJQUN0QyxDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDckIsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUM7SUFDakMsQ0FBQztJQUVELE9BQU87UUFFTixRQUFRO1FBQ1IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN0QyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFakMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLElBQUksS0FBZ0MsQ0FBQztRQUVyQyxLQUFLLE1BQU0sSUFBSSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQzlCLG1CQUFtQjtZQUNuQixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDdEMsS0FBSyxHQUFHLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM5QixDQUFDO1lBQ0QsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVwQix5Q0FBeUM7WUFDekMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVTLEtBQUssQ0FBQyxTQUF1QztRQUN0RCxnQ0FBZ0M7UUFDaEMsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVPLGdDQUFnQyxDQUFDLElBQThCO1FBRXRFLGdCQUFnQixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFFMUUsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN2QixpREFBaUQ7WUFDakQsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUMvQixnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUM5RixDQUFDO1lBQ0QsNENBQTRDO1lBQzVDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxpQkFBaUIsR0FBMEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUErQyxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQztnQkFDaEosZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDakYsQ0FBQztRQUVGLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxDQUFDO1lBQ2hELDhEQUE4RDtZQUM5RCw2REFBNkQ7WUFDN0QsWUFBWSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU3RixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEMsQ0FBQztJQUNGLENBQUM7SUFFTyxNQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBcUMsRUFBRSxHQUFnQjtRQUN2RixJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ1QsS0FBSyxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDOUIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNkLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUVEO0FBRUQsSUFBTSxRQUFRLGdCQUFkLE1BQU0sUUFBUyxTQUFRLGdCQUFnQjtJQUV0QyxZQUNDLEdBQVcsRUFDTSxhQUFxQyxFQUN0RCw4QkFBdUMsRUFDTCxlQUFnQyxFQUM3QixrQkFBc0MsRUFDdEMsa0JBQXNDO1FBRTNFLEtBQUssQ0FBQyxHQUFHLEVBQUUsOEJBQThCLENBQUMsQ0FBQztRQU4xQixrQkFBYSxHQUFiLGFBQWEsQ0FBd0I7UUFFcEIsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzdCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDdEMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUczRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVELGtCQUFrQixDQUFDLE9BQXVDO1FBQ3pELE1BQU0sTUFBTSxHQUEwRCxFQUFFLENBQUM7UUFFekUsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdEMsTUFBTSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUM7WUFFMUIsSUFBSSxhQUFvRSxDQUFDO1lBQ3pFLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQzFCLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUM1RCxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3JDLElBQUksVUFBVSxFQUFFLENBQUM7d0JBQ2hCLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO29CQUN6RixDQUFDO29CQUVELE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDaEcsSUFBSSxVQUFVLEVBQUUsQ0FBQzt3QkFDaEIsaUJBQWlCO3dCQUNqQixNQUFNLGNBQWMsR0FBRywrQkFBK0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ2xJLENBQUMsYUFBYSxLQUFLLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO29CQUMzSixDQUFDO3lCQUFNLENBQUM7d0JBQ1Asb0JBQW9CO3dCQUNwQixNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLDhCQUE4QixFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUN2TSxNQUFNLGNBQWMsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2hFLElBQUksY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQzs0QkFDL0IsQ0FBQyxhQUFhLEtBQUssRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksaUJBQWlCLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO3dCQUNwRixDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLGFBQWEsSUFBSSxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUMvQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFDbEMsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFa0IsS0FBSyxDQUFDLFNBQXVDO1FBQy9ELE9BQU8sU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQTJCLEVBQUUsQ0FBMkI7UUFFeEYsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUN2QixNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBRXZCLElBQUksTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBRXZCLHlCQUF5QjtZQUN6QixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxDQUFDLENBQUM7WUFDVixDQUFDO2lCQUFNLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDcEIsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNYLENBQUM7WUFFRCxpQ0FBaUM7WUFDakMsSUFBSSxNQUFNLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDWCxDQUFDO2lCQUFNLElBQUksTUFBTSxLQUFLLFlBQVksRUFBRSxDQUFDO2dCQUNwQyxPQUFPLENBQUMsQ0FBQztZQUNWLENBQUM7WUFFRCwwQkFBMEI7WUFDMUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzQyxJQUFJLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakIsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUMzQixNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUMzQixJQUFJLEtBQUssR0FBRyxLQUFLLEVBQUUsQ0FBQztZQUNuQixPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ1gsQ0FBQzthQUFNLElBQUksS0FBSyxHQUFHLEtBQUssRUFBRSxDQUFDO1lBQzFCLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUVELGlCQUFpQjtRQUNqQixPQUFPLFVBQVEsQ0FBQyxjQUFjLENBQzdCLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQzFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQzFDLENBQUM7SUFDSCxDQUFDO0lBRU8sTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUE0QixFQUFFLENBQTRCO1FBQ3ZGLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1FBQ3BELE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1FBQ3BELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0QsQ0FBQTtBQXZHSyxRQUFRO0lBTVgsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsa0JBQWtCLENBQUE7R0FSZixRQUFRLENBdUdiO0FBRUQsSUFBTSxRQUFRLEdBQWQsTUFBTSxRQUFRO0lBUWIsWUFDQyxFQUFVLEVBQ1YsWUFBb0MsRUFDcEMsT0FBcUMsRUFDcEIsY0FBK0IsRUFDNUIsaUJBQXFDLEVBQ3JDLGlCQUFxQztRQVh6QyxpQkFBWSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFhckQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxFQUFFLEVBQUUsWUFBWSxFQUFFLE9BQU8sQ0FBQywyQkFBMkIsRUFBRSxjQUFjLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUUzSSxpRkFBaUY7UUFDakYsZ0ZBQWdGO1FBQ2hGLHdCQUF3QjtRQUN4QixNQUFNLGVBQWUsR0FBRyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsRUFBRTtZQUNqRCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2xILENBQUMsRUFBRSxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3RELEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7b0JBQ2YsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUMzQixNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLHFHQUFxRztRQUNyRyxpRkFBaUY7UUFDakYsNkNBQTZDO1FBQzdDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUVsRSxNQUFNLEtBQUssR0FBRyxDQUFDLE1BQTBCLEVBQW9CLEVBQUU7WUFFOUQsSUFBSSxrQkFBa0IsR0FBRyxLQUFLLENBQUM7WUFDL0IsSUFBSSxrQkFBa0IsR0FBRyxLQUFLLENBQUM7WUFDL0IsSUFBSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1lBRTNCLEtBQUssTUFBTSxJQUFJLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQzNCLGtCQUFrQixHQUFHLGtCQUFrQixJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztnQkFDbkUsa0JBQWtCLEdBQUcsa0JBQWtCLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDO2dCQUNuRSxjQUFjLEdBQUcsY0FBYyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUM7Z0JBQ3ZELElBQUksa0JBQWtCLElBQUksa0JBQWtCLElBQUksY0FBYyxFQUFFLENBQUM7b0JBQ2hFLG9EQUFvRDtvQkFDcEQsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztZQUVELE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxDQUFDO1FBQy9FLENBQUMsQ0FBQztRQUVGLE1BQU0saUJBQWlCLEdBQUcsR0FBRyxFQUFFO1lBRTlCLFlBQVksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3pELE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQzlFLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLENBQUM7Z0JBQ2pGLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUN4RSxJQUFJLGtCQUFrQixJQUFJLGtCQUFrQixJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNoRSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztnQkFDaEcsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDSixZQUFZLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQzdDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQ3BILENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksZUFBZSxDQUFDO1lBQ3ZDLGtDQUFrQztZQUNsQyxzQkFBc0IsRUFBRSxpQkFBaUI7WUFDekMsdUJBQXVCLEVBQUUsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDO1lBQzlELEtBQUssRUFBRSxPQUFPLENBQUMsa0JBQWtCO1lBQ2pDLEtBQUs7U0FDTCxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO0lBQzVDLENBQUM7SUFFRCxVQUFVLENBQUMsT0FBd0M7UUFDbEQsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxPQUFPO1FBQ04sSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzdCLENBQUM7Q0FDRCxDQUFBO0FBNUZLLFFBQVE7SUFZWCxXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxrQkFBa0IsQ0FBQTtHQWRmLFFBQVEsQ0E0RmI7QUFFRCxTQUFTLGNBQWMsQ0FBQyxJQUFZLEVBQUUsT0FBc0MsRUFBRSxNQUE4QjtJQUUzRyxNQUFNLEVBQUUsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO0lBQ3JFLE1BQU0sS0FBSyxHQUFHLE9BQU8sT0FBTyxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBRXRGLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQztRQUNyQixFQUFFLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUMzQixLQUFLLEVBQUUsUUFBUSxDQUFDLFlBQVksRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDO1FBQ3BELEdBQUcsS0FBSyxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQzlDLENBQUMsQ0FBQztJQUVILE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQztRQUN2QixFQUFFLEVBQUUsVUFBVSxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUM3QixLQUFLLEVBQUUsS0FBSztRQUNaLElBQUksT0FBTyxLQUFLLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEQsR0FBRyxLQUFLLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN4RCxDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ04sSUFBSTtRQUNKLE1BQU07UUFDTixJQUFJLFFBQVEsS0FBSyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7S0FDMUMsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNLFVBQVUsK0JBQStCLENBQUMsY0FBK0IsRUFBRSxpQkFBcUMsRUFBRSxTQUFpQixFQUFFLE9BQXlDLFNBQVMsRUFBRSxPQUFPLEdBQUcsSUFBSTtJQUM1TSxPQUFPLFFBQVEsQ0FBQztRQUNmLEVBQUUsRUFBRSx1QkFBdUIsU0FBUyxFQUFFO1FBQ3RDLEtBQUssRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsc0JBQXNCLENBQUM7UUFDL0QsT0FBTztRQUNQLEdBQUc7WUFDRix1REFBdUQ7WUFDdkQsZ0ZBQWdGO1lBQ2hGLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLCtGQUErRjtZQUN0SyxNQUFNLFNBQVMsR0FBRyxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ3hFLGNBQWMsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLEVBQUUsWUFBWSxTQUFTLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsVUFBVSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3SSxDQUFDO0tBQ0QsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9
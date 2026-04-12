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
import { Extensions as ViewExtensions, defaultViewIcon, VIEWS_LOG_ID, VIEWS_LOG_NAME } from '../../../common/views.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { coalesce, move } from '../../../../base/common/arrays.js';
import { isUndefined, isUndefinedOrNull } from '../../../../base/common/types.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { CounterSet } from '../../../../base/common/map.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { windowLogGroup } from '../../log/common/logConstants.js';
export function getViewsStateStorageId(viewContainerStorageId) { return `${viewContainerStorageId}.hidden`; }
let ViewDescriptorsState = class ViewDescriptorsState extends Disposable {
    constructor(viewContainerStorageId, viewContainerName, storageService, loggerService) {
        super();
        this.viewContainerName = viewContainerName;
        this.storageService = storageService;
        this._onDidChangeStoredState = this._register(new Emitter());
        this.onDidChangeStoredState = this._onDidChangeStoredState.event;
        this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, group: windowLogGroup }));
        this.globalViewsStateStorageId = getViewsStateStorageId(viewContainerStorageId);
        this.workspaceViewsStateStorageId = viewContainerStorageId;
        this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, this.globalViewsStateStorageId, this._store)(() => this.onDidStorageChange()));
        this.state = this.initialize();
    }
    set(id, state) {
        this.state.set(id, state);
    }
    get(id) {
        return this.state.get(id);
    }
    updateState(viewDescriptors) {
        this.updateWorkspaceState(viewDescriptors);
        this.updateGlobalState(viewDescriptors);
    }
    updateWorkspaceState(viewDescriptors) {
        const storedViewsStates = this.getStoredWorkspaceState();
        for (const viewDescriptor of viewDescriptors) {
            const viewState = this.get(viewDescriptor.id);
            if (viewState) {
                storedViewsStates[viewDescriptor.id] = {
                    collapsed: !!viewState.collapsed,
                    isHidden: !viewState.visibleWorkspace,
                    size: viewState.size,
                    order: viewDescriptor.workspace && viewState ? viewState.order : undefined
                };
            }
        }
        if (Object.keys(storedViewsStates).length > 0) {
            this.storageService.store(this.workspaceViewsStateStorageId, JSON.stringify(storedViewsStates), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(this.workspaceViewsStateStorageId, 1 /* StorageScope.WORKSPACE */);
        }
    }
    updateGlobalState(viewDescriptors) {
        const storedGlobalState = this.getStoredGlobalState();
        for (const viewDescriptor of viewDescriptors) {
            const state = this.get(viewDescriptor.id);
            storedGlobalState.set(viewDescriptor.id, {
                id: viewDescriptor.id,
                isHidden: state && viewDescriptor.canToggleVisibility ? !state.visibleGlobal : false,
                order: !viewDescriptor.workspace && state ? state.order : undefined
            });
        }
        this.setStoredGlobalState(storedGlobalState);
    }
    onDidStorageChange() {
        if (this.globalViewsStatesValue !== this.getStoredGlobalViewsStatesValue() /* This checks if current window changed the value or not */) {
            this._globalViewsStatesValue = undefined;
            const storedViewsVisibilityStates = this.getStoredGlobalState();
            const storedWorkspaceViewsStates = this.getStoredWorkspaceState();
            const changedStates = [];
            for (const [id, storedState] of storedViewsVisibilityStates) {
                const state = this.get(id);
                if (state) {
                    if (state.visibleGlobal !== !storedState.isHidden) {
                        if (!storedState.isHidden) {
                            this.logger.value.trace(`View visibility state changed: ${id} is now visible`, this.viewContainerName);
                        }
                        changedStates.push({ id, visible: !storedState.isHidden });
                    }
                }
                else {
                    const workspaceViewState = storedWorkspaceViewsStates[id];
                    this.set(id, {
                        active: false,
                        visibleGlobal: !storedState.isHidden,
                        visibleWorkspace: isUndefined(workspaceViewState?.isHidden) ? undefined : !workspaceViewState?.isHidden,
                        collapsed: workspaceViewState?.collapsed,
                        order: workspaceViewState?.order,
                        size: workspaceViewState?.size,
                    });
                }
            }
            if (changedStates.length) {
                this._onDidChangeStoredState.fire(changedStates);
                // Update the in memory state after firing the event
                // so that the views can update their state accordingly
                for (const changedState of changedStates) {
                    const state = this.get(changedState.id);
                    if (state) {
                        state.visibleGlobal = changedState.visible;
                    }
                }
            }
        }
    }
    initialize() {
        const viewStates = new Map();
        const workspaceViewsStates = this.getStoredWorkspaceState();
        for (const id of Object.keys(workspaceViewsStates)) {
            const workspaceViewState = workspaceViewsStates[id];
            viewStates.set(id, {
                active: false,
                visibleGlobal: undefined,
                visibleWorkspace: isUndefined(workspaceViewState.isHidden) ? undefined : !workspaceViewState.isHidden,
                collapsed: workspaceViewState.collapsed,
                order: workspaceViewState.order,
                size: workspaceViewState.size,
            });
        }
        // Migrate to `viewletStateStorageId`
        const value = this.storageService.get(this.globalViewsStateStorageId, 1 /* StorageScope.WORKSPACE */, '[]');
        const { state: workspaceVisibilityStates } = this.parseStoredGlobalState(value);
        if (workspaceVisibilityStates.size > 0) {
            for (const { id, isHidden } of workspaceVisibilityStates.values()) {
                const viewState = viewStates.get(id);
                // Not migrated to `viewletStateStorageId`
                if (viewState) {
                    if (isUndefined(viewState.visibleWorkspace)) {
                        viewState.visibleWorkspace = !isHidden;
                    }
                }
                else {
                    viewStates.set(id, {
                        active: false,
                        collapsed: undefined,
                        visibleGlobal: undefined,
                        visibleWorkspace: !isHidden,
                    });
                }
            }
            this.storageService.remove(this.globalViewsStateStorageId, 1 /* StorageScope.WORKSPACE */);
        }
        const { state, hasDuplicates } = this.parseStoredGlobalState(this.globalViewsStatesValue);
        if (hasDuplicates) {
            this.setStoredGlobalState(state);
        }
        for (const { id, isHidden, order } of state.values()) {
            const viewState = viewStates.get(id);
            if (viewState) {
                viewState.visibleGlobal = !isHidden;
                if (!isUndefined(order)) {
                    viewState.order = order;
                }
            }
            else {
                viewStates.set(id, {
                    active: false,
                    visibleGlobal: !isHidden,
                    order,
                    collapsed: undefined,
                    visibleWorkspace: undefined,
                });
            }
        }
        return viewStates;
    }
    getStoredWorkspaceState() {
        return JSON.parse(this.storageService.get(this.workspaceViewsStateStorageId, 1 /* StorageScope.WORKSPACE */, '{}'));
    }
    getStoredGlobalState() {
        return this.parseStoredGlobalState(this.globalViewsStatesValue).state;
    }
    setStoredGlobalState(storedGlobalState) {
        this.globalViewsStatesValue = JSON.stringify([...storedGlobalState.values()]);
    }
    parseStoredGlobalState(value) {
        const storedValue = JSON.parse(value);
        let hasDuplicates = false;
        const state = storedValue.reduce((result, storedState) => {
            if (typeof storedState === 'string' /* migration */) {
                hasDuplicates = hasDuplicates || result.has(storedState);
                result.set(storedState, { id: storedState, isHidden: true });
            }
            else {
                hasDuplicates = hasDuplicates || result.has(storedState.id);
                result.set(storedState.id, storedState);
            }
            return result;
        }, new Map());
        return { state, hasDuplicates };
    }
    get globalViewsStatesValue() {
        if (!this._globalViewsStatesValue) {
            this._globalViewsStatesValue = this.getStoredGlobalViewsStatesValue();
        }
        return this._globalViewsStatesValue;
    }
    set globalViewsStatesValue(globalViewsStatesValue) {
        if (this.globalViewsStatesValue !== globalViewsStatesValue) {
            this._globalViewsStatesValue = globalViewsStatesValue;
            this.setStoredGlobalViewsStatesValue(globalViewsStatesValue);
        }
    }
    getStoredGlobalViewsStatesValue() {
        return this.storageService.get(this.globalViewsStateStorageId, 0 /* StorageScope.PROFILE */, '[]');
    }
    setStoredGlobalViewsStatesValue(value) {
        this.storageService.store(this.globalViewsStateStorageId, value, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
};
ViewDescriptorsState = __decorate([
    __param(2, IStorageService),
    __param(3, ILoggerService)
], ViewDescriptorsState);
let ViewContainerModel = class ViewContainerModel extends Disposable {
    get title() { return this._title; }
    get icon() { return this._icon; }
    get keybindingId() { return this._keybindingId; }
    // All View Descriptors
    get allViewDescriptors() { return this.viewDescriptorItems.map(item => item.viewDescriptor); }
    // Active View Descriptors
    get activeViewDescriptors() { return this.viewDescriptorItems.filter(item => item.state.active).map(item => item.viewDescriptor); }
    // Visible View Descriptors
    get visibleViewDescriptors() { return this.viewDescriptorItems.filter(item => this.isViewDescriptorVisible(item)).map(item => item.viewDescriptor); }
    constructor(viewContainer, instantiationService, contextKeyService, loggerService) {
        super();
        this.viewContainer = viewContainer;
        this.contextKeyService = contextKeyService;
        this.contextKeys = new CounterSet();
        this.viewDescriptorItems = [];
        this._onDidChangeContainerInfo = this._register(new Emitter());
        this.onDidChangeContainerInfo = this._onDidChangeContainerInfo.event;
        this._onDidChangeAllViewDescriptors = this._register(new Emitter());
        this.onDidChangeAllViewDescriptors = this._onDidChangeAllViewDescriptors.event;
        this._onDidChangeActiveViewDescriptors = this._register(new Emitter());
        this.onDidChangeActiveViewDescriptors = this._onDidChangeActiveViewDescriptors.event;
        this._onDidAddVisibleViewDescriptors = this._register(new Emitter());
        this.onDidAddVisibleViewDescriptors = this._onDidAddVisibleViewDescriptors.event;
        this._onDidRemoveVisibleViewDescriptors = this._register(new Emitter());
        this.onDidRemoveVisibleViewDescriptors = this._onDidRemoveVisibleViewDescriptors.event;
        this._onDidMoveVisibleViewDescriptors = this._register(new Emitter());
        this.onDidMoveVisibleViewDescriptors = this._onDidMoveVisibleViewDescriptors.event;
        this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, group: windowLogGroup }));
        this._register(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys))(() => this.onDidChangeContext()));
        this.viewDescriptorsState = this._register(instantiationService.createInstance(ViewDescriptorsState, viewContainer.storageId || `${viewContainer.id}.state`, typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.original));
        this._register(this.viewDescriptorsState.onDidChangeStoredState(items => this.updateVisibility(items)));
        this.updateContainerInfo();
    }
    updateContainerInfo() {
        /* Use default container info if one of the visible view descriptors belongs to the current container by default */
        const useDefaultContainerInfo = this.viewContainer.alwaysUseContainerInfo || this.visibleViewDescriptors.length === 0 || this.visibleViewDescriptors.some(v => Registry.as(ViewExtensions.ViewsRegistry).getViewContainer(v.id) === this.viewContainer);
        const title = useDefaultContainerInfo ? (typeof this.viewContainer.title === 'string' ? this.viewContainer.title : this.viewContainer.title.value) : this.visibleViewDescriptors[0]?.containerTitle || this.visibleViewDescriptors[0]?.name?.value || '';
        let titleChanged = false;
        if (this._title !== title) {
            this._title = title;
            titleChanged = true;
        }
        const icon = useDefaultContainerInfo ? this.viewContainer.icon : this.visibleViewDescriptors[0]?.containerIcon || defaultViewIcon;
        let iconChanged = false;
        if (!this.isEqualIcon(icon)) {
            this._icon = icon;
            iconChanged = true;
        }
        const keybindingId = this.viewContainer.openCommandActionDescriptor?.id ?? this.activeViewDescriptors.find(v => v.openCommandActionDescriptor)?.openCommandActionDescriptor?.id;
        let keybindingIdChanged = false;
        if (this._keybindingId !== keybindingId) {
            this._keybindingId = keybindingId;
            keybindingIdChanged = true;
        }
        if (titleChanged || iconChanged || keybindingIdChanged) {
            this._onDidChangeContainerInfo.fire({ title: titleChanged, icon: iconChanged, keybindingId: keybindingIdChanged });
        }
    }
    isEqualIcon(icon) {
        if (URI.isUri(icon)) {
            return URI.isUri(this._icon) && isEqual(icon, this._icon);
        }
        else if (ThemeIcon.isThemeIcon(icon)) {
            return ThemeIcon.isThemeIcon(this._icon) && ThemeIcon.isEqual(icon, this._icon);
        }
        return icon === this._icon;
    }
    isVisible(id) {
        const viewDescriptorItem = this.viewDescriptorItems.find(v => v.viewDescriptor.id === id);
        if (!viewDescriptorItem) {
            throw new Error(`Unknown view ${id}`);
        }
        return this.isViewDescriptorVisible(viewDescriptorItem);
    }
    setVisible(id, visible) {
        this.updateVisibility([{ id, visible }]);
    }
    updateVisibility(viewDescriptors) {
        // First: Update and remove the view descriptors which are asked to be hidden
        const viewDescriptorItemsToHide = coalesce(viewDescriptors.filter(({ visible }) => !visible)
            .map(({ id }) => this.findAndIgnoreIfNotFound(id)));
        const removed = [];
        for (const { viewDescriptorItem, visibleIndex } of viewDescriptorItemsToHide) {
            if (this.updateViewDescriptorItemVisibility(viewDescriptorItem, false)) {
                removed.push({ viewDescriptor: viewDescriptorItem.viewDescriptor, index: visibleIndex });
            }
        }
        if (removed.length) {
            this.broadCastRemovedVisibleViewDescriptors(removed);
        }
        // Second: Update and add the view descriptors which are asked to be shown
        const added = [];
        for (const { id, visible } of viewDescriptors) {
            if (!visible) {
                continue;
            }
            const foundViewDescriptor = this.findAndIgnoreIfNotFound(id);
            if (!foundViewDescriptor) {
                continue;
            }
            const { viewDescriptorItem, visibleIndex } = foundViewDescriptor;
            if (this.updateViewDescriptorItemVisibility(viewDescriptorItem, true)) {
                added.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
            }
        }
        if (added.length) {
            this.broadCastAddedVisibleViewDescriptors(added);
        }
    }
    updateViewDescriptorItemVisibility(viewDescriptorItem, visible) {
        if (!viewDescriptorItem.viewDescriptor.canToggleVisibility) {
            return false;
        }
        if (this.isViewDescriptorVisibleWhenActive(viewDescriptorItem) === visible) {
            return false;
        }
        // update visibility
        if (viewDescriptorItem.viewDescriptor.workspace) {
            viewDescriptorItem.state.visibleWorkspace = visible;
        }
        else {
            viewDescriptorItem.state.visibleGlobal = visible;
            if (visible) {
                this.logger.value.trace(`Showing view ${viewDescriptorItem.viewDescriptor.id} in the container ${this.viewContainer.id}`);
            }
        }
        // return `true` only if visibility is changed
        return this.isViewDescriptorVisible(viewDescriptorItem) === visible;
    }
    isCollapsed(id) {
        return !!this.find(id).viewDescriptorItem.state.collapsed;
    }
    setCollapsed(id, collapsed) {
        const { viewDescriptorItem } = this.find(id);
        if (viewDescriptorItem.state.collapsed !== collapsed) {
            viewDescriptorItem.state.collapsed = collapsed;
        }
        this.viewDescriptorsState.updateState(this.allViewDescriptors);
    }
    getSize(id) {
        return this.find(id).viewDescriptorItem.state.size;
    }
    setSizes(newSizes) {
        for (const { id, size } of newSizes) {
            const { viewDescriptorItem } = this.find(id);
            if (viewDescriptorItem.state.size !== size) {
                viewDescriptorItem.state.size = size;
            }
        }
        this.viewDescriptorsState.updateState(this.allViewDescriptors);
    }
    move(from, to) {
        const fromIndex = this.viewDescriptorItems.findIndex(v => v.viewDescriptor.id === from);
        const toIndex = this.viewDescriptorItems.findIndex(v => v.viewDescriptor.id === to);
        const fromViewDescriptor = this.viewDescriptorItems[fromIndex];
        const toViewDescriptor = this.viewDescriptorItems[toIndex];
        move(this.viewDescriptorItems, fromIndex, toIndex);
        for (let index = 0; index < this.viewDescriptorItems.length; index++) {
            this.viewDescriptorItems[index].state.order = index;
        }
        this.broadCastMovedViewDescriptors({ index: fromIndex, viewDescriptor: fromViewDescriptor.viewDescriptor }, { index: toIndex, viewDescriptor: toViewDescriptor.viewDescriptor });
    }
    add(addedViewDescriptorStates) {
        const addedItems = [];
        for (const addedViewDescriptorState of addedViewDescriptorStates) {
            const viewDescriptor = addedViewDescriptorState.viewDescriptor;
            if (viewDescriptor.when) {
                for (const key of viewDescriptor.when.keys()) {
                    this.contextKeys.add(key);
                }
            }
            let state = this.viewDescriptorsState.get(viewDescriptor.id);
            if (state) {
                // set defaults if not set
                if (viewDescriptor.workspace) {
                    state.visibleWorkspace = isUndefinedOrNull(addedViewDescriptorState.visible) ? (isUndefinedOrNull(state.visibleWorkspace) ? !viewDescriptor.hideByDefault : state.visibleWorkspace) : addedViewDescriptorState.visible;
                }
                else {
                    const isVisible = state.visibleGlobal;
                    state.visibleGlobal = isUndefinedOrNull(addedViewDescriptorState.visible) ? (isUndefinedOrNull(state.visibleGlobal) ? !viewDescriptor.hideByDefault : state.visibleGlobal) : addedViewDescriptorState.visible;
                    if (state.visibleGlobal && !isVisible) {
                        this.logger.value.trace(`Added view ${viewDescriptor.id} in the container ${this.viewContainer.id} and showing it.`, `${isVisible}`, `${viewDescriptor.hideByDefault}`, `${addedViewDescriptorState.visible}`);
                    }
                }
                state.collapsed = isUndefinedOrNull(addedViewDescriptorState.collapsed) ? (isUndefinedOrNull(state.collapsed) ? !!viewDescriptor.collapsed : state.collapsed) : addedViewDescriptorState.collapsed;
            }
            else {
                state = {
                    active: false,
                    visibleGlobal: isUndefinedOrNull(addedViewDescriptorState.visible) ? !viewDescriptor.hideByDefault : addedViewDescriptorState.visible,
                    visibleWorkspace: isUndefinedOrNull(addedViewDescriptorState.visible) ? !viewDescriptor.hideByDefault : addedViewDescriptorState.visible,
                    collapsed: isUndefinedOrNull(addedViewDescriptorState.collapsed) ? !!viewDescriptor.collapsed : addedViewDescriptorState.collapsed,
                };
            }
            this.viewDescriptorsState.set(viewDescriptor.id, state);
            state.active = this.contextKeyService.contextMatchesRules(viewDescriptor.when);
            addedItems.push({ viewDescriptor, state });
        }
        this.viewDescriptorItems.push(...addedItems);
        this.viewDescriptorItems.sort(this.compareViewDescriptors.bind(this));
        this._onDidChangeAllViewDescriptors.fire({ added: addedItems.map(({ viewDescriptor }) => viewDescriptor), removed: [] });
        const addedActiveItems = [];
        for (const viewDescriptorItem of addedItems) {
            if (viewDescriptorItem.state.active) {
                addedActiveItems.push({ viewDescriptorItem, visible: this.isViewDescriptorVisible(viewDescriptorItem) });
            }
        }
        if (addedActiveItems.length) {
            this._onDidChangeActiveViewDescriptors.fire(({ added: addedActiveItems.map(({ viewDescriptorItem }) => viewDescriptorItem.viewDescriptor), removed: [] }));
        }
        const addedVisibleDescriptors = [];
        for (const { viewDescriptorItem, visible } of addedActiveItems) {
            if (visible && this.isViewDescriptorVisible(viewDescriptorItem)) {
                const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
                addedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
            }
        }
        this.broadCastAddedVisibleViewDescriptors(addedVisibleDescriptors);
    }
    remove(viewDescriptors) {
        const removed = [];
        const removedItems = [];
        const removedActiveDescriptors = [];
        const removedVisibleDescriptors = [];
        for (const viewDescriptor of viewDescriptors) {
            if (viewDescriptor.when) {
                for (const key of viewDescriptor.when.keys()) {
                    this.contextKeys.delete(key);
                }
            }
            const index = this.viewDescriptorItems.findIndex(i => i.viewDescriptor.id === viewDescriptor.id);
            if (index !== -1) {
                removed.push(viewDescriptor);
                const viewDescriptorItem = this.viewDescriptorItems[index];
                if (viewDescriptorItem.state.active) {
                    removedActiveDescriptors.push(viewDescriptorItem.viewDescriptor);
                }
                if (this.isViewDescriptorVisible(viewDescriptorItem)) {
                    const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
                    removedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor });
                }
                removedItems.push(viewDescriptorItem);
            }
        }
        // update state
        removedItems.forEach(item => this.viewDescriptorItems.splice(this.viewDescriptorItems.indexOf(item), 1));
        this.broadCastRemovedVisibleViewDescriptors(removedVisibleDescriptors);
        if (removedActiveDescriptors.length) {
            this._onDidChangeActiveViewDescriptors.fire(({ added: [], removed: removedActiveDescriptors }));
        }
        if (removed.length) {
            this._onDidChangeAllViewDescriptors.fire({ added: [], removed });
        }
    }
    onDidChangeContext() {
        const addedActiveItems = [];
        const removedActiveItems = [];
        for (const item of this.viewDescriptorItems) {
            const wasActive = item.state.active;
            const isActive = this.contextKeyService.contextMatchesRules(item.viewDescriptor.when);
            if (wasActive !== isActive) {
                if (isActive) {
                    addedActiveItems.push({ item, visibleWhenActive: this.isViewDescriptorVisibleWhenActive(item) });
                }
                else {
                    removedActiveItems.push(item);
                }
            }
        }
        const removedVisibleDescriptors = [];
        for (const item of removedActiveItems) {
            if (this.isViewDescriptorVisible(item)) {
                const { visibleIndex } = this.find(item.viewDescriptor.id);
                removedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor });
            }
        }
        // Update the State
        removedActiveItems.forEach(item => item.state.active = false);
        addedActiveItems.forEach(({ item }) => item.state.active = true);
        this.broadCastRemovedVisibleViewDescriptors(removedVisibleDescriptors);
        if (addedActiveItems.length || removedActiveItems.length) {
            this._onDidChangeActiveViewDescriptors.fire(({ added: addedActiveItems.map(({ item }) => item.viewDescriptor), removed: removedActiveItems.map(item => item.viewDescriptor) }));
        }
        const addedVisibleDescriptors = [];
        for (const { item, visibleWhenActive } of addedActiveItems) {
            if (visibleWhenActive && this.isViewDescriptorVisible(item)) {
                const { visibleIndex } = this.find(item.viewDescriptor.id);
                addedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor, size: item.state.size, collapsed: !!item.state.collapsed });
            }
        }
        this.broadCastAddedVisibleViewDescriptors(addedVisibleDescriptors);
    }
    broadCastAddedVisibleViewDescriptors(added) {
        if (added.length) {
            this._onDidAddVisibleViewDescriptors.fire(added.sort((a, b) => a.index - b.index));
            this.updateState(`Added views:${added.map(v => v.viewDescriptor.id).join(',')} in ${this.viewContainer.id}`);
        }
    }
    broadCastRemovedVisibleViewDescriptors(removed) {
        if (removed.length) {
            this._onDidRemoveVisibleViewDescriptors.fire(removed.sort((a, b) => b.index - a.index));
            this.updateState(`Removed views:${removed.map(v => v.viewDescriptor.id).join(',')} from ${this.viewContainer.id}`);
        }
    }
    broadCastMovedViewDescriptors(from, to) {
        this._onDidMoveVisibleViewDescriptors.fire({ from, to });
        this.updateState(`Moved view ${from.viewDescriptor.id} to ${to.viewDescriptor.id} in ${this.viewContainer.id}`);
    }
    updateState(reason) {
        this.logger.value.trace(reason);
        this.viewDescriptorsState.updateState(this.allViewDescriptors);
        this.updateContainerInfo();
    }
    isViewDescriptorVisible(viewDescriptorItem) {
        if (!viewDescriptorItem.state.active) {
            return false;
        }
        return this.isViewDescriptorVisibleWhenActive(viewDescriptorItem);
    }
    isViewDescriptorVisibleWhenActive(viewDescriptorItem) {
        if (viewDescriptorItem.viewDescriptor.workspace) {
            return !!viewDescriptorItem.state.visibleWorkspace;
        }
        return !!viewDescriptorItem.state.visibleGlobal;
    }
    find(id) {
        const result = this.findAndIgnoreIfNotFound(id);
        if (result) {
            return result;
        }
        throw new Error(`view descriptor ${id} not found`);
    }
    findAndIgnoreIfNotFound(id) {
        for (let i = 0, visibleIndex = 0; i < this.viewDescriptorItems.length; i++) {
            const viewDescriptorItem = this.viewDescriptorItems[i];
            if (viewDescriptorItem.viewDescriptor.id === id) {
                return { index: i, visibleIndex, viewDescriptorItem: viewDescriptorItem };
            }
            if (this.isViewDescriptorVisible(viewDescriptorItem)) {
                visibleIndex++;
            }
        }
        return undefined;
    }
    compareViewDescriptors(a, b) {
        if (a.viewDescriptor.id === b.viewDescriptor.id) {
            return 0;
        }
        return (this.getViewOrder(a) - this.getViewOrder(b)) || this.getGroupOrderResult(a.viewDescriptor, b.viewDescriptor);
    }
    getViewOrder(viewDescriptorItem) {
        const viewOrder = typeof viewDescriptorItem.state.order === 'number' ? viewDescriptorItem.state.order : viewDescriptorItem.viewDescriptor.order;
        return typeof viewOrder === 'number' ? viewOrder : Number.MAX_VALUE;
    }
    getGroupOrderResult(a, b) {
        if (!a.group || !b.group) {
            return 0;
        }
        if (a.group === b.group) {
            return 0;
        }
        return a.group < b.group ? -1 : 1;
    }
};
ViewContainerModel = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextKeyService),
    __param(3, ILoggerService)
], ViewContainerModel);
export { ViewContainerModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0NvbnRhaW5lck1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3Q29udGFpbmVyTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFrRCxVQUFVLElBQUksY0FBYyxFQUErRixlQUFlLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BRLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBVyxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFD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
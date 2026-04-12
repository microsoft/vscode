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
var EditorParts_1;
import { localize } from '../../../../nls.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { MainEditorPart } from './editorPart.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { distinct } from '../../../../base/common/arrays.js';
import { AuxiliaryEditorPart } from './auxiliaryEditorPart.js';
import { ModalEditorPart } from './modalEditorPart.js';
import { MultiWindowParts } from '../../part.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { getActiveElement, isAncestor, isHTMLElement } from '../../../../base/browser/dom.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { mainWindow } from '../../../../base/browser/window.js';
let EditorParts = class EditorParts extends MultiWindowParts {
    static { EditorParts_1 = this; }
    constructor(instantiationService, storageService, themeService, auxiliaryWindowService, contextKeyService) {
        super('workbench.editorParts', themeService, storageService);
        this.instantiationService = instantiationService;
        this.storageService = storageService;
        this.auxiliaryWindowService = auxiliaryWindowService;
        this.contextKeyService = contextKeyService;
        //#region Scoped Instantiation Services
        this.mapPartToInstantiationService = new Map();
        //#endregion
        //#region Auxiliary Editor Parts
        this._onDidCreateAuxiliaryEditorPart = this._register(new Emitter());
        this.onDidCreateAuxiliaryEditorPart = this._onDidCreateAuxiliaryEditorPart.event;
        this.modalEditorMaximized = false;
        this.workspaceMemento = this.getMemento(1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
        this.profileMemento = this.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._isReady = false;
        this.whenReadyPromise = new DeferredPromise();
        this.whenReady = this.whenReadyPromise.p;
        this.whenRestoredPromise = new DeferredPromise();
        this.whenRestored = this.whenRestoredPromise.p;
        //#endregion
        //#region Events
        this._onDidActiveGroupChange = this._register(new Emitter());
        this.onDidChangeActiveGroup = this._onDidActiveGroupChange.event;
        this._onDidAddGroup = this._register(new Emitter());
        this.onDidAddGroup = this._onDidAddGroup.event;
        this._onDidRemoveGroup = this._register(new Emitter());
        this.onDidRemoveGroup = this._onDidRemoveGroup.event;
        this._onDidMoveGroup = this._register(new Emitter());
        this.onDidMoveGroup = this._onDidMoveGroup.event;
        this._onDidActivateGroup = this._register(new Emitter());
        this.onDidActivateGroup = this._onDidActivateGroup.event;
        this._onDidChangeGroupIndex = this._register(new Emitter());
        this.onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;
        this._onDidChangeGroupLocked = this._register(new Emitter());
        this.onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;
        this._onDidChangeGroupMaximized = this._register(new Emitter());
        this.onDidChangeGroupMaximized = this._onDidChangeGroupMaximized.event;
        //#endregion
        //#region Editor Group Context Key Handling
        this.globalContextKeys = new Map();
        this.scopedContextKeys = new Map();
        this.contextKeyProviders = new Map();
        this.registeredContextKeys = new Map();
        this.contextKeyProviderDisposables = this._register(new DisposableMap());
        this.editorWorkingSets = (() => {
            const workingSetsRaw = this.storageService.get(EditorParts_1.EDITOR_WORKING_SETS_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
            if (workingSetsRaw) {
                return JSON.parse(workingSetsRaw);
            }
            return [];
        })();
        const modalState = this.profileMemento[EditorParts_1.MODAL_EDITOR_STATE_STORAGE_KEY];
        if (modalState) {
            this.modalEditorMaximized = modalState.maximized;
            this.modalEditorSize = modalState.size;
            this.modalEditorPosition = modalState.position;
            this.modalEditorSidebarWidth = modalState.sidebarWidth;
            this.modalEditorSidebarHidden = modalState.sidebarHidden;
        }
        this.mainPart = this._register(this.createMainEditorPart());
        this._register(this.registerPart(this.mainPart));
        this.mostRecentActiveParts = [this.mainPart];
        this.restoreParts();
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.onDidChangeMementoValue(1 /* StorageScope.WORKSPACE */, this._store)(e => this.onDidChangeMementoState(e)));
        this.whenReady.then(() => this.registerGroupsContextKeyListeners());
    }
    createMainEditorPart() {
        return this.instantiationService.createInstance(MainEditorPart, this);
    }
    getScopedInstantiationService(part) {
        // Main Part
        if (part === this.mainPart) {
            let mainPartInstantiationService = this.mapPartToInstantiationService.get(part.windowId);
            if (!mainPartInstantiationService) {
                mainPartInstantiationService = this.instantiationService.invokeFunction(accessor => {
                    const editorService = accessor.get(IEditorService);
                    const statusbarService = accessor.get(IStatusbarService);
                    const mainPartInstantiationService = this._register(this.mainPart.scopedInstantiationService.createChild(new ServiceCollection([IEditorService, editorService.createScoped(this.mainPart, this._store)], [IStatusbarService, statusbarService.createScoped(statusbarService, this._store)])));
                    this.mapPartToInstantiationService.set(part.windowId, mainPartInstantiationService);
                    return mainPartInstantiationService;
                });
            }
            return mainPartInstantiationService;
        }
        // Modal Part (if opened)
        if (part === this.modalEditorPart && this.modalPartInstantiationService) {
            return this.modalPartInstantiationService;
        }
        return this.mapPartToInstantiationService.get(part.windowId) ?? this.instantiationService;
    }
    async createAuxiliaryEditorPart(options) {
        const { part, instantiationService, disposables } = await this.instantiationService.createInstance(AuxiliaryEditorPart, this).create(this.getGroupsLabel(this._parts.size), options);
        // Keep instantiation service
        this.mapPartToInstantiationService.set(part.windowId, instantiationService);
        disposables.add(toDisposable(() => this.mapPartToInstantiationService.delete(part.windowId)));
        // Events
        this._onDidAddGroup.fire(part.activeGroup);
        this._onDidCreateAuxiliaryEditorPart.fire(part);
        return part;
    }
    get activeModalEditorPart() { return this.modalEditorPart; }
    async createModalEditorPart(options) {
        // Reuse existing modal editor part if it exists
        if (this.modalEditorPart) {
            this.modalEditorPart.updateOptions(options);
            return this.modalEditorPart;
        }
        const { part, instantiationService, disposables } = await this.instantiationService.createInstance(ModalEditorPart, this).create({
            ...options,
            maximized: options?.maximized ?? this.modalEditorMaximized,
            size: options?.size ?? this.modalEditorSize,
            position: options?.position ?? this.modalEditorPosition,
            sidebar: options?.sidebar ? {
                ...options.sidebar,
                sidebarWidth: options.sidebar.sidebarWidth ?? this.modalEditorSidebarWidth,
                sidebarHidden: options.sidebar.sidebarHidden ?? this.modalEditorSidebarHidden
            } : undefined
        });
        // Keep instantiation service and reference to reuse
        this.modalEditorPart = part;
        this.modalPartInstantiationService = instantiationService;
        // Remember state on dispose to restore when opening next time
        disposables.add(toDisposable(() => {
            this.modalEditorMaximized = part.maximized;
            this.modalEditorSize = part.size;
            this.modalEditorPosition = part.position;
            if (part.hasSidebar) {
                this.modalEditorSidebarWidth = part.sidebarWidth;
                this.modalEditorSidebarHidden = part.sidebarHidden || undefined;
            }
            this.modalPartInstantiationService = undefined;
            this.modalEditorPart = undefined;
        }));
        // Events
        this._onDidAddGroup.fire(part.activeGroup);
        return part;
    }
    //#endregion
    //#region Registration
    registerPart(part) {
        const disposables = this._register(new DisposableStore());
        disposables.add(super.registerPart(part));
        this.registerEditorPartListeners(part, disposables);
        return disposables;
    }
    unregisterPart(part) {
        super.unregisterPart(part);
        // Notify all parts about a groups label change
        // given it is computed based on the index
        this.parts.forEach((part, index) => {
            if (part === this.mainPart) {
                return;
            }
            part.notifyGroupsLabelChange(this.getGroupsLabel(index));
        });
    }
    registerEditorPartListeners(part, disposables) {
        disposables.add(part.onDidFocus(() => {
            this.doUpdateMostRecentActive(part, true);
            if (this._parts.size > 1) {
                // Either main or auxiliary editor part got focus
                // which we have to treat as a group change event.
                this._onDidActiveGroupChange.fire(this.activeGroup);
            }
        }));
        disposables.add(toDisposable(() => {
            this.doUpdateMostRecentActive(part);
            if (part.windowId !== mainWindow.vscodeWindowId) {
                // An auxiliary editor part is closing which we have
                // to treat as group change event for the next editor
                // part that becomes active.
                // Refs: https://github.com/microsoft/vscode/issues/257058
                this._onDidActiveGroupChange.fire(this.activeGroup);
            }
        }));
        disposables.add(part.onDidChangeActiveGroup(group => this._onDidActiveGroupChange.fire(group)));
        disposables.add(part.onDidAddGroup(group => this._onDidAddGroup.fire(group)));
        disposables.add(part.onDidRemoveGroup(group => this._onDidRemoveGroup.fire(group)));
        disposables.add(part.onDidMoveGroup(group => this._onDidMoveGroup.fire(group)));
        disposables.add(part.onDidActivateGroup(e => this._onDidActivateGroup.fire(e)));
        disposables.add(part.onDidChangeGroupMaximized(maximized => this._onDidChangeGroupMaximized.fire(maximized)));
        disposables.add(part.onDidChangeGroupIndex(group => this._onDidChangeGroupIndex.fire(group)));
        disposables.add(part.onDidChangeGroupLocked(group => this._onDidChangeGroupLocked.fire(group)));
    }
    doUpdateMostRecentActive(part, makeMostRecentlyActive) {
        const index = this.mostRecentActiveParts.indexOf(part);
        // Remove from MRU list
        if (index !== -1) {
            this.mostRecentActiveParts.splice(index, 1);
        }
        // Add to front as needed
        if (makeMostRecentlyActive) {
            this.mostRecentActiveParts.unshift(part);
        }
    }
    getGroupsLabel(index) {
        return localize('groupLabel', "Window {0}", index + 1);
    }
    //#endregion
    //#region Helpers
    getPartByDocument(document) {
        if (this._parts.size > 1) {
            const activeElement = getActiveElement();
            // Find parts that match the document and check if any
            // non-main part contains the active element. This handles
            // modal parts that share the same document as the main part.
            for (const part of this._parts) {
                if (part !== this.mainPart && part.element?.ownerDocument === document) {
                    const container = part.getContainer();
                    if (container && isAncestor(activeElement, container)) {
                        return part;
                    }
                }
            }
        }
        return super.getPartByDocument(document);
    }
    getPart(groupOrElement) {
        if (this._parts.size > 1) {
            if (isHTMLElement(groupOrElement)) {
                const element = groupOrElement;
                return this.getPartByDocument(element.ownerDocument);
            }
            else {
                const group = groupOrElement;
                let id;
                if (typeof group === 'number') {
                    id = group;
                }
                else {
                    id = group.id;
                }
                for (const part of this._parts) {
                    if (part.hasGroup(id)) {
                        return part;
                    }
                }
            }
        }
        return this.mainPart;
    }
    //#endregion
    //#region Lifecycle / State
    static { this.EDITOR_PARTS_UI_STATE_STORAGE_KEY = 'editorparts.state'; }
    static { this.MODAL_EDITOR_STATE_STORAGE_KEY = 'editorparts.modalState'; }
    get isReady() { return this._isReady; }
    async restoreParts() {
        // Join on the main part being ready to pick
        // the right moment to begin restoring.
        // The main part is automatically being created
        // as part of the overall startup process.
        await this.mainPart.whenReady;
        // Only attempt to restore auxiliary editor parts
        // when the main part did restore. It is possible
        // that restoring was not attempted because specific
        // editors were opened.
        if (this.mainPart.willRestoreState) {
            const state = this.loadState();
            if (state) {
                await this.restoreState(state);
            }
        }
        const mostRecentActivePart = this.mostRecentActiveParts.at(0);
        mostRecentActivePart?.activeGroup.focus();
        this._isReady = true;
        this.whenReadyPromise.complete();
        // Await restored
        await Promise.allSettled(this.parts.map(part => part.whenRestored));
        this.whenRestoredPromise.complete();
    }
    loadState() {
        return this.workspaceMemento[EditorParts_1.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
    }
    saveState() {
        const state = this.createState();
        if (state.auxiliary.length === 0) {
            delete this.workspaceMemento[EditorParts_1.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
        }
        else {
            this.workspaceMemento[EditorParts_1.EDITOR_PARTS_UI_STATE_STORAGE_KEY] = state;
        }
        this.saveModalState();
    }
    saveModalState() {
        // Also capture state from any currently open modal editor part
        if (this.modalEditorPart) {
            this.modalEditorMaximized = this.modalEditorPart.maximized;
            this.modalEditorSize = this.modalEditorPart.size;
            this.modalEditorPosition = this.modalEditorPart.position;
            if (this.modalEditorPart.hasSidebar) {
                this.modalEditorSidebarWidth = this.modalEditorPart.sidebarWidth;
                this.modalEditorSidebarHidden = this.modalEditorPart.sidebarHidden || undefined;
            }
        }
        // Only persist when there is meaningful state to restore.
        // When all values are at their defaults (not maximized, no
        // custom size or position), we delete the key to avoid
        // storing unnecessary data.
        if (this.modalEditorMaximized || this.modalEditorSize || this.modalEditorPosition || this.modalEditorSidebarWidth || this.modalEditorSidebarHidden) {
            this.profileMemento[EditorParts_1.MODAL_EDITOR_STATE_STORAGE_KEY] = {
                maximized: this.modalEditorMaximized,
                size: this.modalEditorSize ? { width: this.modalEditorSize.width, height: this.modalEditorSize.height } : undefined,
                position: this.modalEditorPosition,
                sidebarWidth: this.modalEditorSidebarWidth,
                sidebarHidden: this.modalEditorSidebarHidden,
            };
        }
        else {
            delete this.profileMemento[EditorParts_1.MODAL_EDITOR_STATE_STORAGE_KEY];
        }
    }
    createState() {
        return {
            auxiliary: this.parts
                .map(part => ({ part, auxiliaryWindow: this.auxiliaryWindowService.getWindow(part.windowId) }))
                .filter(({ auxiliaryWindow }) => auxiliaryWindow !== undefined)
                .map(({ part, auxiliaryWindow }) => ({
                state: part.createState(),
                ...auxiliaryWindow.createState()
            })),
            mru: this.mostRecentActiveParts.map(part => this.parts.indexOf(part))
        };
    }
    async restoreState(state) {
        if (state.auxiliary.length) {
            const auxiliaryEditorPartPromises = [];
            // Create auxiliary editor parts
            for (const auxiliaryEditorPartState of state.auxiliary) {
                auxiliaryEditorPartPromises.push(this.createAuxiliaryEditorPart(auxiliaryEditorPartState));
            }
            // Await creation
            await Promise.allSettled(auxiliaryEditorPartPromises);
            // Update MRU list
            if (state.mru.length === this.parts.length) {
                this.mostRecentActiveParts = state.mru.map(index => this.parts[index]);
            }
            else {
                this.mostRecentActiveParts = [...this.parts];
            }
            // Await ready
            await Promise.allSettled(this.parts.map(part => part.whenReady));
        }
    }
    get hasRestorableState() {
        return this.parts.some(part => part.hasRestorableState);
    }
    onDidChangeMementoState(e) {
        if (e.external && e.scope === 1 /* StorageScope.WORKSPACE */) {
            this.reloadMemento(e.scope);
            const state = this.loadState();
            if (state) {
                this.applyState(state);
            }
        }
    }
    async applyState(state) {
        // Before closing windows, try to close as many editors as
        // possible, but skip over those that would trigger a dialog
        // (for example when being dirty). This is to be able to have
        // them merge into the main part.
        for (const part of this.parts) {
            if (part === this.mainPart) {
                continue; // main part takes care on its own
            }
            for (const group of part.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
                await group.closeAllEditors({ excludeConfirming: true });
            }
            const closed = part.close(); // will move remaining editors to main part
            if (!closed) {
                return false; // this indicates that closing was vetoed
            }
        }
        // Restore auxiliary state unless we are in an empty state
        if (state !== 'empty') {
            await this.restoreState(state);
        }
        return true;
    }
    //#endregion
    //#region Working Sets
    static { this.EDITOR_WORKING_SETS_STORAGE_KEY = 'editor.workingSets'; }
    saveWorkingSet(name) {
        const workingSet = {
            id: generateUuid(),
            name,
            main: this.mainPart.createState(),
            auxiliary: this.createState()
        };
        this.editorWorkingSets.push(workingSet);
        this.saveWorkingSets();
        return {
            id: workingSet.id,
            name: workingSet.name
        };
    }
    getWorkingSets() {
        return this.editorWorkingSets.map(workingSet => ({ id: workingSet.id, name: workingSet.name }));
    }
    deleteWorkingSet(workingSet) {
        const index = this.indexOfWorkingSet(workingSet);
        if (typeof index === 'number') {
            this.editorWorkingSets.splice(index, 1);
            this.saveWorkingSets();
        }
    }
    async applyWorkingSet(workingSet, options) {
        let workingSetState;
        if (workingSet === 'empty') {
            workingSetState = 'empty';
        }
        else {
            workingSetState = this.editorWorkingSets[this.indexOfWorkingSet(workingSet) ?? -1];
        }
        if (!workingSetState) {
            return false;
        }
        // Apply state: begin with auxiliary windows first because it helps to keep
        // editors around that need confirmation by moving them into the main part.
        // Also, in rare cases, the auxiliary part may not be able to apply the state
        // for certain editors that cannot move to the main part.
        const applied = await this.applyState(workingSetState === 'empty' ? workingSetState : workingSetState.auxiliary);
        if (!applied) {
            return false;
        }
        await this.mainPart.applyState(workingSetState === 'empty' ? workingSetState : workingSetState.main, options);
        // Restore Focus unless instructed otherwise
        if (!options?.preserveFocus) {
            const mostRecentActivePart = this.mostRecentActiveParts.at(0);
            if (mostRecentActivePart) {
                await mostRecentActivePart.whenReady;
                mostRecentActivePart.activeGroup.focus();
            }
        }
        return true;
    }
    indexOfWorkingSet(workingSet) {
        for (let i = 0; i < this.editorWorkingSets.length; i++) {
            if (this.editorWorkingSets[i].id === workingSet.id) {
                return i;
            }
        }
        return undefined;
    }
    saveWorkingSets() {
        this.storageService.store(EditorParts_1.EDITOR_WORKING_SETS_STORAGE_KEY, JSON.stringify(this.editorWorkingSets), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    //#endregion
    //#region Group Management
    get activeGroup() {
        return this.activePart.activeGroup;
    }
    get sideGroup() {
        return this.activePart.sideGroup;
    }
    get groups() {
        return this.getGroups();
    }
    get count() {
        return this.groups.length;
    }
    getGroups(order = 0 /* GroupsOrder.CREATION_TIME */) {
        if (this._parts.size > 1) {
            let parts;
            switch (order) {
                case 2 /* GroupsOrder.GRID_APPEARANCE */: // we currently do not have a way to compute by appearance over multiple windows
                case 0 /* GroupsOrder.CREATION_TIME */:
                    parts = this.parts;
                    break;
                case 1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */:
                    parts = distinct([...this.mostRecentActiveParts, ...this.parts]); // always ensure all parts are included
                    break;
            }
            return parts.flatMap(part => part.getGroups(order));
        }
        return this.mainPart.getGroups(order);
    }
    getGroup(identifier) {
        if (this._parts.size > 1) {
            for (const part of this._parts) {
                const group = part.getGroup(identifier);
                if (group) {
                    return group;
                }
            }
        }
        return this.mainPart.getGroup(identifier);
    }
    assertGroupView(group) {
        let groupView;
        if (typeof group === 'number') {
            groupView = this.getGroup(group);
        }
        else {
            groupView = group;
        }
        if (!groupView) {
            throw new Error('Invalid editor group provided!');
        }
        return groupView;
    }
    activateGroup(group) {
        return this.getPart(group).activateGroup(group);
    }
    getSize(group) {
        return this.getPart(group).getSize(group);
    }
    setSize(group, size) {
        this.getPart(group).setSize(group, size);
    }
    arrangeGroups(arrangement, group = this.activePart.activeGroup) {
        this.getPart(group).arrangeGroups(arrangement, group);
    }
    toggleMaximizeGroup(group = this.activePart.activeGroup) {
        this.getPart(group).toggleMaximizeGroup(group);
    }
    toggleExpandGroup(group = this.activePart.activeGroup) {
        this.getPart(group).toggleExpandGroup(group);
    }
    restoreGroup(group) {
        return this.getPart(group).restoreGroup(group);
    }
    applyLayout(layout) {
        this.activePart.applyLayout(layout);
    }
    getLayout() {
        return this.activePart.getLayout();
    }
    get orientation() {
        return this.activePart.orientation;
    }
    setGroupOrientation(orientation) {
        this.activePart.setGroupOrientation(orientation);
    }
    findGroup(scope, source = this.activeGroup, wrap) {
        const sourcePart = this.getPart(source);
        if (this._parts.size > 1) {
            const groups = this.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */);
            // Ensure that FIRST/LAST dispatches globally over all parts
            if (scope.location === 0 /* GroupLocation.FIRST */ || scope.location === 1 /* GroupLocation.LAST */) {
                return scope.location === 0 /* GroupLocation.FIRST */ ? groups[0] : groups[groups.length - 1];
            }
            // Try to find in target part first without wrapping
            const group = sourcePart.findGroup(scope, source, false);
            if (group) {
                return group;
            }
            // Ensure that NEXT/PREVIOUS dispatches globally over all parts
            if (scope.location === 2 /* GroupLocation.NEXT */ || scope.location === 3 /* GroupLocation.PREVIOUS */) {
                const sourceGroup = this.assertGroupView(source);
                const index = groups.indexOf(sourceGroup);
                if (scope.location === 2 /* GroupLocation.NEXT */) {
                    let nextGroup = groups[index + 1];
                    if (!nextGroup && wrap) {
                        nextGroup = groups[0];
                    }
                    return nextGroup;
                }
                else {
                    let previousGroup = groups[index - 1];
                    if (!previousGroup && wrap) {
                        previousGroup = groups[groups.length - 1];
                    }
                    return previousGroup;
                }
            }
        }
        return sourcePart.findGroup(scope, source, wrap);
    }
    addGroup(location, direction) {
        return this.getPart(location).addGroup(location, direction);
    }
    removeGroup(group) {
        this.getPart(group).removeGroup(group);
    }
    moveGroup(group, location, direction) {
        return this.getPart(group).moveGroup(group, location, direction);
    }
    mergeGroup(group, target, options) {
        return this.getPart(group).mergeGroup(group, target, options);
    }
    mergeAllGroups(target, options) {
        return this.activePart.mergeAllGroups(target, options);
    }
    copyGroup(group, location, direction) {
        return this.getPart(group).copyGroup(group, location, direction);
    }
    createEditorDropTarget(container, delegate) {
        return this.getPart(container).createEditorDropTarget(container, delegate);
    }
    registerGroupsContextKeyListeners() {
        this._register(this.onDidChangeActiveGroup(() => this.updateGlobalContextKeys()));
        this.groups.forEach(group => this.registerGroupContextKeyProvidersListeners(group));
        this._register(this.onDidAddGroup(group => this.registerGroupContextKeyProvidersListeners(group)));
        this._register(this.onDidRemoveGroup(group => {
            this.scopedContextKeys.delete(group.id);
            this.registeredContextKeys.delete(group.id);
            this.contextKeyProviderDisposables.deleteAndDispose(group.id);
        }));
    }
    updateGlobalContextKeys() {
        const activeGroupScopedContextKeys = this.scopedContextKeys.get(this.activeGroup.id);
        if (!activeGroupScopedContextKeys) {
            return;
        }
        for (const [key, globalContextKey] of this.globalContextKeys) {
            const scopedContextKey = activeGroupScopedContextKeys.get(key);
            if (scopedContextKey) {
                globalContextKey.set(scopedContextKey.get());
            }
            else {
                globalContextKey.reset();
            }
        }
    }
    bind(contextKey, group) {
        // Ensure we only bind to the same context key once globaly
        let globalContextKey = this.globalContextKeys.get(contextKey.key);
        if (!globalContextKey) {
            globalContextKey = contextKey.bindTo(this.contextKeyService);
            this.globalContextKeys.set(contextKey.key, globalContextKey);
        }
        // Ensure we only bind to the same context key once per group
        let groupScopedContextKeys = this.scopedContextKeys.get(group.id);
        if (!groupScopedContextKeys) {
            groupScopedContextKeys = new Map();
            this.scopedContextKeys.set(group.id, groupScopedContextKeys);
        }
        let scopedContextKey = groupScopedContextKeys.get(contextKey.key);
        if (!scopedContextKey) {
            scopedContextKey = contextKey.bindTo(group.scopedContextKeyService);
            groupScopedContextKeys.set(contextKey.key, scopedContextKey);
        }
        const that = this;
        return {
            get() {
                return scopedContextKey.get();
            },
            set(value) {
                if (that.activeGroup === group) {
                    globalContextKey.set(value);
                }
                scopedContextKey.set(value);
            },
            reset() {
                if (that.activeGroup === group) {
                    globalContextKey.reset();
                }
                scopedContextKey.reset();
            },
        };
    }
    registerContextKeyProvider(provider) {
        if (this.contextKeyProviders.has(provider.contextKey.key) || this.globalContextKeys.has(provider.contextKey.key)) {
            throw new Error(`A context key provider for key ${provider.contextKey.key} already exists.`);
        }
        this.contextKeyProviders.set(provider.contextKey.key, provider);
        const setContextKeyForGroups = () => {
            for (const group of this.groups) {
                this.updateRegisteredContextKey(group, provider);
            }
        };
        // Run initially and on change
        setContextKeyForGroups();
        const onDidChange = provider.onDidChange?.(() => setContextKeyForGroups());
        return toDisposable(() => {
            onDidChange?.dispose();
            this.globalContextKeys.delete(provider.contextKey.key);
            this.scopedContextKeys.forEach(scopedContextKeys => scopedContextKeys.delete(provider.contextKey.key));
            this.contextKeyProviders.delete(provider.contextKey.key);
            this.registeredContextKeys.forEach(registeredContextKeys => registeredContextKeys.delete(provider.contextKey.key));
        });
    }
    registerGroupContextKeyProvidersListeners(group) {
        // Update context keys from providers for the group when its active editor changes
        const disposable = group.onDidActiveEditorChange(() => {
            for (const contextKeyProvider of this.contextKeyProviders.values()) {
                this.updateRegisteredContextKey(group, contextKeyProvider);
            }
        });
        this.contextKeyProviderDisposables.set(group.id, disposable);
    }
    updateRegisteredContextKey(group, provider) {
        // Get the group scoped context keys for the provider
        // If the providers context key has not yet been bound
        // to the group, do so now.
        let groupRegisteredContextKeys = this.registeredContextKeys.get(group.id);
        if (!groupRegisteredContextKeys) {
            groupRegisteredContextKeys = new Map();
            this.registeredContextKeys.set(group.id, groupRegisteredContextKeys);
        }
        let scopedRegisteredContextKey = groupRegisteredContextKeys.get(provider.contextKey.key);
        if (!scopedRegisteredContextKey) {
            scopedRegisteredContextKey = this.bind(provider.contextKey, group);
            groupRegisteredContextKeys.set(provider.contextKey.key, scopedRegisteredContextKey);
        }
        // Set the context key value for the group context
        scopedRegisteredContextKey.set(provider.getGroupContextKeyValue(group));
    }
    //#endregion
    //#region Main Editor Part Only
    get partOptions() { return this.mainPart.partOptions; }
    get onDidChangeEditorPartOptions() { return this.mainPart.onDidChangeEditorPartOptions; }
    enforcePartOptions(options) {
        return this.mainPart.enforcePartOptions(options);
    }
};
EditorParts = EditorParts_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, IStorageService),
    __param(2, IThemeService),
    __param(3, IAuxiliaryWindowService),
    __param(4, IContextKeyService)
], EditorParts);
export { EditorParts };
registerSingleton(IEditorGroupsService, EditorParts, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUGFydHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFydHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQXVMLG9CQUFvQixFQUFrSyxNQUFNLHdEQUF3RCxDQUFDO0FBQ25iLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqSCxPQUFPLEVBQWtDLGNBQWMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRWpGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLG1CQUFtQixFQUFtQyxNQUFNLDBCQUEwQixDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDakQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxlQUFlLEVBQXlELE1BQU0sZ0RBQWdELENBQUM7QUFDeEksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBK0IsdUJBQXVCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUMzSSxPQUFPLEVBQUUs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
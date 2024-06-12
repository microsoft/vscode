/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { EditorGroupLayout, GroupDirection, GroupLocation, GroupOrientation, GroupsArrangement, GroupsOrder, IAuxiliaryEditorPart, IAuxiliaryEditorPartCreateEvent, IEditorGroupContextKeyProvider, IEditorDropTargetDelegate, IEditorGroupsService, IEditorSideGroup, IEditorWorkingSet, IFindGroupScope, IMergeGroupOptions, IEditorWorkingSetOptions } from 'vs/workbench/services/editor/common/editorGroupsService';
import { Emitter } from 'vs/base/common/event';
import { DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { EditorPart, IEditorPartUIState, MainEditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorGroupView, IEditorPartsView } from 'vs/workbench/browser/parts/editor/editor';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { distinct, firstOrDefault } from 'vs/base/common/arrays';
import { AuxiliaryEditorPart, IAuxiliaryEditorPartOpenOptions } from 'vs/workbench/browser/parts/editor/auxiliaryEditorPart';
import { MultiWindowParts } from 'vs/workbench/browser/part';
import { DeferredPromise } from 'vs/base/common/async';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { generateUuid } from 'vs/base/common/uuid';
import { ContextKeyValue, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { isHTMLElement } from 'vs/base/browser/dom';

interface IEditorPartsUIState {
	readonly auxiliary: IAuxiliaryEditorPartState[];
	readonly mru: number[];
	// main state is managed by the main part
}

interface IAuxiliaryEditorPartState extends IAuxiliaryWindowOpenOptions {
	readonly state: IEditorPartUIState;
}

interface IEditorWorkingSetState extends IEditorWorkingSet {
	readonly main: IEditorPartUIState;
	readonly auxiliary: IEditorPartsUIState;
}

export class EditorParts extends MultiWindowParts<EditorPart> implements IEditorGroupsService, IEditorPartsView {

	declare readonly _serviceBrand: undefined;

	readonly mainPart = this._register(this.createMainEditorPart());

	private mostRecentActiveParts = [this.mainPart];

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super('workbench.editorParts', themeService, storageService);

		this._register(this.registerPart(this.mainPart));

		this.restoreParts();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onDidChangeMementoValue(StorageScope.WORKSPACE, this._store)(e => this.onDidChangeMementoState(e)));
		this.whenReady.then(() => this.registerGroupsContextKeyListeners());
	}

	protected createMainEditorPart(): MainEditorPart {
		return this.instantiationService.createInstance(MainEditorPart, this);
	}

	//#region Auxiliary Editor Parts

	private readonly _onDidCreateAuxiliaryEditorPart = this._register(new Emitter<IAuxiliaryEditorPartCreateEvent>());
	readonly onDidCreateAuxiliaryEditorPart = this._onDidCreateAuxiliaryEditorPart.event;

	async createAuxiliaryEditorPart(options?: IAuxiliaryEditorPartOpenOptions): Promise<IAuxiliaryEditorPart> {
		const { part, instantiationService, disposables } = await this.instantiationService.createInstance(AuxiliaryEditorPart, this).create(this.getGroupsLabel(this._parts.size), options);

		// Events
		this._onDidAddGroup.fire(part.activeGroup);

		const eventDisposables = disposables.add(new DisposableStore());
		this._onDidCreateAuxiliaryEditorPart.fire({ part, instantiationService, disposables: eventDisposables });

		return part;
	}

	//#endregion

	//#region Registration

	override registerPart(part: EditorPart): IDisposable {
		const disposables = this._register(new DisposableStore());
		disposables.add(super.registerPart(part));

		this.registerEditorPartListeners(part, disposables);

		return disposables;
	}

	protected override unregisterPart(part: EditorPart): void {
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

	private registerEditorPartListeners(part: EditorPart, disposables: DisposableStore): void {
		disposables.add(part.onDidFocus(() => {
			this.doUpdateMostRecentActive(part, true);

			if (this._parts.size > 1) {
				this._onDidActiveGroupChange.fire(this.activeGroup); // this can only happen when we have more than 1 editor part
			}
		}));
		disposables.add(toDisposable(() => this.doUpdateMostRecentActive(part)));

		disposables.add(part.onDidChangeActiveGroup(group => this._onDidActiveGroupChange.fire(group)));
		disposables.add(part.onDidAddGroup(group => this._onDidAddGroup.fire(group)));
		disposables.add(part.onDidRemoveGroup(group => this._onDidRemoveGroup.fire(group)));
		disposables.add(part.onDidMoveGroup(group => this._onDidMoveGroup.fire(group)));
		disposables.add(part.onDidActivateGroup(group => this._onDidActivateGroup.fire(group)));
		disposables.add(part.onDidChangeGroupMaximized(maximized => this._onDidChangeGroupMaximized.fire(maximized)));

		disposables.add(part.onDidChangeGroupIndex(group => this._onDidChangeGroupIndex.fire(group)));
		disposables.add(part.onDidChangeGroupLocked(group => this._onDidChangeGroupLocked.fire(group)));
	}

	private doUpdateMostRecentActive(part: EditorPart, makeMostRecentlyActive?: boolean): void {
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

	private getGroupsLabel(index: number): string {
		return localize('groupLabel', "Window {0}", index + 1);
	}

	//#endregion

	//#region Helpers

	override getPart(group: IEditorGroupView | GroupIdentifier): EditorPart;
	override getPart(element: HTMLElement): EditorPart;
	override getPart(groupOrElement: IEditorGroupView | GroupIdentifier | HTMLElement): EditorPart {
		if (this._parts.size > 1) {
			if (isHTMLElement(groupOrElement)) {
				const element = groupOrElement;

				return this.getPartByDocument(element.ownerDocument);
			} else {
				const group = groupOrElement;

				let id: GroupIdentifier;
				if (typeof group === 'number') {
					id = group;
				} else {
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

	private static readonly EDITOR_PARTS_UI_STATE_STORAGE_KEY = 'editorparts.state';

	private readonly workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.USER);

	private _isReady = false;
	get isReady(): boolean { return this._isReady; }

	private readonly whenReadyPromise = new DeferredPromise<void>();
	readonly whenReady = this.whenReadyPromise.p;

	private readonly whenRestoredPromise = new DeferredPromise<void>();
	readonly whenRestored = this.whenRestoredPromise.p;

	private async restoreParts(): Promise<void> {

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

		const mostRecentActivePart = firstOrDefault(this.mostRecentActiveParts);
		mostRecentActivePart?.activeGroup.focus();

		this._isReady = true;
		this.whenReadyPromise.complete();

		// Await restored
		await Promise.allSettled(this.parts.map(part => part.whenRestored));
		this.whenRestoredPromise.complete();
	}

	private loadState(): IEditorPartsUIState | undefined {
		return this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
	}

	protected override saveState(): void {
		const state = this.createState();
		if (state.auxiliary.length === 0) {
			delete this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
		} else {
			this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY] = state;
		}
	}

	private createState(): IEditorPartsUIState {
		return {
			auxiliary: this.parts.filter(part => part !== this.mainPart).map(part => {
				const auxiliaryWindow = this.auxiliaryWindowService.getWindow(part.windowId);

				return {
					state: part.createState(),
					...auxiliaryWindow?.createState()
				};
			}),
			mru: this.mostRecentActiveParts.map(part => this.parts.indexOf(part))
		};
	}

	private async restoreState(state: IEditorPartsUIState): Promise<void> {
		if (state.auxiliary.length) {
			const auxiliaryEditorPartPromises: Promise<IAuxiliaryEditorPart>[] = [];

			// Create auxiliary editor parts
			for (const auxiliaryEditorPartState of state.auxiliary) {
				auxiliaryEditorPartPromises.push(this.createAuxiliaryEditorPart(auxiliaryEditorPartState));
			}

			// Await creation
			await Promise.allSettled(auxiliaryEditorPartPromises);

			// Update MRU list
			if (state.mru.length === this.parts.length) {
				this.mostRecentActiveParts = state.mru.map(index => this.parts[index]);
			} else {
				this.mostRecentActiveParts = [...this.parts];
			}

			// Await ready
			await Promise.allSettled(this.parts.map(part => part.whenReady));
		}
	}

	get hasRestorableState(): boolean {
		return this.parts.some(part => part.hasRestorableState);
	}

	private onDidChangeMementoState(e: IStorageValueChangeEvent): void {
		if (e.external && e.scope === StorageScope.WORKSPACE) {
			this.reloadMemento(e.scope);

			const state = this.loadState();
			if (state) {
				this.applyState(state);
			}
		}
	}

	private async applyState(state: IEditorPartsUIState | 'empty'): Promise<boolean> {

		// Before closing windows, try to close as many editors as
		// possible, but skip over those that would trigger a dialog
		// (for example when being dirty). This is to be able to have
		// them merge into the main part.

		for (const part of this.parts) {
			if (part === this.mainPart) {
				continue; // main part takes care on its own
			}

			for (const group of part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
				await group.closeAllEditors({ excludeConfirming: true });
			}

			const closed = (part as unknown as IAuxiliaryEditorPart).close(); // will move remaining editors to main part
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

	private static readonly EDITOR_WORKING_SETS_STORAGE_KEY = 'editor.workingSets';

	private editorWorkingSets: IEditorWorkingSetState[] = (() => {
		const workingSetsRaw = this.storageService.get(EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (workingSetsRaw) {
			return JSON.parse(workingSetsRaw);
		}

		return [];
	})();

	saveWorkingSet(name: string): IEditorWorkingSet {
		const workingSet: IEditorWorkingSetState = {
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

	getWorkingSets(): IEditorWorkingSet[] {
		return this.editorWorkingSets.map(workingSet => ({ id: workingSet.id, name: workingSet.name }));
	}

	deleteWorkingSet(workingSet: IEditorWorkingSet): void {
		const index = this.indexOfWorkingSet(workingSet);
		if (typeof index === 'number') {
			this.editorWorkingSets.splice(index, 1);

			this.saveWorkingSets();
		}
	}

	async applyWorkingSet(workingSet: IEditorWorkingSet | 'empty', options?: IEditorWorkingSetOptions): Promise<boolean> {
		let workingSetState: IEditorWorkingSetState | 'empty' | undefined;
		if (workingSet === 'empty') {
			workingSetState = 'empty';
		} else {
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
			const mostRecentActivePart = firstOrDefault(this.mostRecentActiveParts);
			if (mostRecentActivePart) {
				await mostRecentActivePart.whenReady;
				mostRecentActivePart.activeGroup.focus();
			}
		}

		return true;
	}

	private indexOfWorkingSet(workingSet: IEditorWorkingSet): number | undefined {
		for (let i = 0; i < this.editorWorkingSets.length; i++) {
			if (this.editorWorkingSets[i].id === workingSet.id) {
				return i;
			}
		}

		return undefined;
	}

	private saveWorkingSets(): void {
		this.storageService.store(EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY, JSON.stringify(this.editorWorkingSets), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	//#endregion

	//#region Events

	private readonly _onDidActiveGroupChange = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeActiveGroup = this._onDidActiveGroupChange.event;

	private readonly _onDidAddGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidAddGroup = this._onDidAddGroup.event;

	private readonly _onDidRemoveGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidRemoveGroup = this._onDidRemoveGroup.event;

	private readonly _onDidMoveGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidMoveGroup = this._onDidMoveGroup.event;

	private readonly _onDidActivateGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidActivateGroup = this._onDidActivateGroup.event;

	private readonly _onDidChangeGroupIndex = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;

	private readonly _onDidChangeGroupLocked = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;

	private readonly _onDidChangeGroupMaximized = this._register(new Emitter<boolean>());
	readonly onDidChangeGroupMaximized = this._onDidChangeGroupMaximized.event;

	//#endregion

	//#region Group Management

	get activeGroup(): IEditorGroupView {
		return this.activePart.activeGroup;
	}

	get sideGroup(): IEditorSideGroup {
		return this.activePart.sideGroup;
	}

	get groups(): IEditorGroupView[] {
		return this.getGroups();
	}

	get count(): number {
		return this.groups.length;
	}

	getGroups(order = GroupsOrder.CREATION_TIME): IEditorGroupView[] {
		if (this._parts.size > 1) {
			let parts: EditorPart[];
			switch (order) {
				case GroupsOrder.GRID_APPEARANCE: // we currently do not have a way to compute by appearance over multiple windows
				case GroupsOrder.CREATION_TIME:
					parts = this.parts;
					break;
				case GroupsOrder.MOST_RECENTLY_ACTIVE:
					parts = distinct([...this.mostRecentActiveParts, ...this.parts]); // always ensure all parts are included
					break;
			}

			return parts.map(part => part.getGroups(order)).flat();
		}

		return this.mainPart.getGroups(order);
	}

	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined {
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

	private assertGroupView(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		let groupView: IEditorGroupView | undefined;
		if (typeof group === 'number') {
			groupView = this.getGroup(group);
		} else {
			groupView = group;
		}

		if (!groupView) {
			throw new Error('Invalid editor group provided!');
		}

		return groupView;
	}

	activateGroup(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		return this.getPart(group).activateGroup(group);
	}

	getSize(group: IEditorGroupView | GroupIdentifier): { width: number; height: number } {
		return this.getPart(group).getSize(group);
	}

	setSize(group: IEditorGroupView | GroupIdentifier, size: { width: number; height: number }): void {
		this.getPart(group).setSize(group, size);
	}

	arrangeGroups(arrangement: GroupsArrangement, group: IEditorGroupView | GroupIdentifier = this.activePart.activeGroup): void {
		this.getPart(group).arrangeGroups(arrangement, group);
	}

	toggleMaximizeGroup(group: IEditorGroupView | GroupIdentifier = this.activePart.activeGroup): void {
		this.getPart(group).toggleMaximizeGroup(group);
	}

	toggleExpandGroup(group: IEditorGroupView | GroupIdentifier = this.activePart.activeGroup): void {
		this.getPart(group).toggleExpandGroup(group);
	}

	restoreGroup(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		return this.getPart(group).restoreGroup(group);
	}

	applyLayout(layout: EditorGroupLayout): void {
		this.activePart.applyLayout(layout);
	}

	getLayout(): EditorGroupLayout {
		return this.activePart.getLayout();
	}

	get orientation() {
		return this.activePart.orientation;
	}

	setGroupOrientation(orientation: GroupOrientation): void {
		this.activePart.setGroupOrientation(orientation);
	}

	findGroup(scope: IFindGroupScope, source: IEditorGroupView | GroupIdentifier = this.activeGroup, wrap?: boolean): IEditorGroupView | undefined {
		const sourcePart = this.getPart(source);
		if (this._parts.size > 1) {
			const groups = this.getGroups(GroupsOrder.GRID_APPEARANCE);

			// Ensure that FIRST/LAST dispatches globally over all parts
			if (scope.location === GroupLocation.FIRST || scope.location === GroupLocation.LAST) {
				return scope.location === GroupLocation.FIRST ? groups[0] : groups[groups.length - 1];
			}

			// Try to find in target part first without wrapping
			const group = sourcePart.findGroup(scope, source, false);
			if (group) {
				return group;
			}

			// Ensure that NEXT/PREVIOUS dispatches globally over all parts
			if (scope.location === GroupLocation.NEXT || scope.location === GroupLocation.PREVIOUS) {
				const sourceGroup = this.assertGroupView(source);
				const index = groups.indexOf(sourceGroup);

				if (scope.location === GroupLocation.NEXT) {
					let nextGroup: IEditorGroupView | undefined = groups[index + 1];
					if (!nextGroup && wrap) {
						nextGroup = groups[0];
					}

					return nextGroup;
				} else {
					let previousGroup: IEditorGroupView | undefined = groups[index - 1];
					if (!previousGroup && wrap) {
						previousGroup = groups[groups.length - 1];
					}

					return previousGroup;
				}
			}
		}

		return sourcePart.findGroup(scope, source, wrap);
	}

	addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		return this.getPart(location).addGroup(location, direction);
	}

	removeGroup(group: IEditorGroupView | GroupIdentifier): void {
		this.getPart(group).removeGroup(group);
	}

	moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		return this.getPart(group).moveGroup(group, location, direction);
	}

	mergeGroup(group: IEditorGroupView | GroupIdentifier, target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): boolean {
		return this.getPart(group).mergeGroup(group, target, options);
	}

	mergeAllGroups(target: IEditorGroupView | GroupIdentifier): boolean {
		return this.activePart.mergeAllGroups(target);
	}

	copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		return this.getPart(group).copyGroup(group, location, direction);
	}

	createEditorDropTarget(container: HTMLElement, delegate: IEditorDropTargetDelegate): IDisposable {
		return this.getPart(container).createEditorDropTarget(container, delegate);
	}

	//#endregion

	//#region Editor Group Context Key Handling

	private readonly globalContextKeys = new Map<string, IContextKey<ContextKeyValue>>();
	private readonly scopedContextKeys = new Map<GroupIdentifier, Map<string, IContextKey<ContextKeyValue>>>();

	private registerGroupsContextKeyListeners(): void {
		this._register(this.onDidChangeActiveGroup(() => this.updateGlobalContextKeys()));
		this.groups.forEach(group => this.registerGroupContextKeyProvidersListeners(group));
		this._register(this.onDidAddGroup(group => this.registerGroupContextKeyProvidersListeners(group)));
		this._register(this.onDidRemoveGroup(group => {
			this.scopedContextKeys.delete(group.id);
			this.registeredContextKeys.delete(group.id);
			this.contextKeyProviderDisposables.deleteAndDispose(group.id);
		}));
	}

	private updateGlobalContextKeys(): void {
		const activeGroupScopedContextKeys = this.scopedContextKeys.get(this.activeGroup.id);
		if (!activeGroupScopedContextKeys) {
			return;
		}

		for (const [key, globalContextKey] of this.globalContextKeys) {
			const scopedContextKey = activeGroupScopedContextKeys.get(key);
			if (scopedContextKey) {
				globalContextKey.set(scopedContextKey.get());
			} else {
				globalContextKey.reset();
			}
		}
	}

	bind<T extends ContextKeyValue>(contextKey: RawContextKey<T>, group: IEditorGroupView): IContextKey<T> {

		// Ensure we only bind to the same context key once globaly
		let globalContextKey = this.globalContextKeys.get(contextKey.key);
		if (!globalContextKey) {
			globalContextKey = contextKey.bindTo(this.contextKeyService);
			this.globalContextKeys.set(contextKey.key, globalContextKey);
		}

		// Ensure we only bind to the same context key once per group
		let groupScopedContextKeys = this.scopedContextKeys.get(group.id);
		if (!groupScopedContextKeys) {
			groupScopedContextKeys = new Map<string, IContextKey<ContextKeyValue>>();
			this.scopedContextKeys.set(group.id, groupScopedContextKeys);
		}
		let scopedContextKey = groupScopedContextKeys.get(contextKey.key);
		if (!scopedContextKey) {
			scopedContextKey = contextKey.bindTo(group.scopedContextKeyService);
			groupScopedContextKeys.set(contextKey.key, scopedContextKey);
		}

		const that = this;
		return {
			get(): T | undefined {
				return scopedContextKey.get() as T | undefined;
			},
			set(value: T): void {
				if (that.activeGroup === group) {
					globalContextKey.set(value);
				}
				scopedContextKey.set(value);
			},
			reset(): void {
				if (that.activeGroup === group) {
					globalContextKey.reset();
				}
				scopedContextKey.reset();
			},
		};
	}

	private readonly contextKeyProviders = new Map<string, IEditorGroupContextKeyProvider<ContextKeyValue>>();
	private readonly registeredContextKeys = new Map<GroupIdentifier, Map<string, IContextKey>>();

	registerContextKeyProvider<T extends ContextKeyValue>(provider: IEditorGroupContextKeyProvider<T>): IDisposable {
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

	private readonly contextKeyProviderDisposables = this._register(new DisposableMap<GroupIdentifier, IDisposable>());
	private registerGroupContextKeyProvidersListeners(group: IEditorGroupView): void {

		// Update context keys from providers for the group when its active editor changes
		const disposable = group.onDidActiveEditorChange(() => {
			for (const contextKeyProvider of this.contextKeyProviders.values()) {
				this.updateRegisteredContextKey(group, contextKeyProvider);
			}
		});

		this.contextKeyProviderDisposables.set(group.id, disposable);
	}

	private updateRegisteredContextKey<T extends ContextKeyValue>(group: IEditorGroupView, provider: IEditorGroupContextKeyProvider<T>): void {

		// Get the group scoped context keys for the provider
		// If the providers context key has not yet been bound
		// to the group, do so now.

		let groupRegisteredContextKeys = this.registeredContextKeys.get(group.id);
		if (!groupRegisteredContextKeys) {
			groupRegisteredContextKeys = new Map<string, IContextKey>();
			this.scopedContextKeys.set(group.id, groupRegisteredContextKeys);
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

	//#endregion
}

registerSingleton(IEditorGroupsService, EditorParts, InstantiationType.Eager);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/editor/editor.contribution';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { Dimension, isAncestor, toggleClass, addClass, clearNode } from 'vs/base/browser/dom';
import { Event, Emitter, once } from 'vs/base/common/event';
import { contrastBorder, editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { GroupDirection, IAddGroupOptions, GroupsArrangement, GroupOrientation, IMergeGroupOptions, MergeGroupMode, ICopyEditorOptions, GroupsOrder, GroupChangeKind, GroupLocation, IFindGroupScope, EditorGroupLayout, GroupLayoutArgument } from 'vs/workbench/services/group/common/editorGroupsService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Direction, SerializableGrid, Sizing, ISerializedGrid, Orientation, ISerializedNode, GridBranchNode, isGridBranchNode, GridNode, createSerializedGrid } from 'vs/base/browser/ui/grid/grid';
import { GroupIdentifier, IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { values } from 'vs/base/common/map';
import { EDITOR_GROUP_BORDER } from 'vs/workbench/common/theme';
import { distinct } from 'vs/base/common/arrays';
import { IEditorGroupsAccessor, IEditorGroupView, IEditorPartOptions, getEditorPartOptions, impactsEditorPartOptions, IEditorPartOptionsChangeEvent, EditorGroupsServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { EditorGroupView } from 'vs/workbench/browser/parts/editor/editorGroupView';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Scope } from 'vs/workbench/common/memento';
import { ISerializedEditorGroup, isSerializedEditorGroup } from 'vs/workbench/common/editor/editorGroup';
import { TValueCallback, TPromise } from 'vs/base/common/winjs.base';
import { always } from 'vs/base/common/async';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { EditorDropTarget } from 'vs/workbench/browser/parts/editor/editorDropTarget';
import { localize } from 'vs/nls';
import { Color } from 'vs/base/common/color';

interface IEditorPartUIState {
	serializedGrid: ISerializedGrid;
	activeGroup: GroupIdentifier;
	mostRecentActiveGroups: GroupIdentifier[];
}

export class EditorPart extends Part implements EditorGroupsServiceImpl, IEditorGroupsAccessor {

	_serviceBrand: any;

	private static readonly EDITOR_PART_UI_STATE_STORAGE_KEY = 'editorpart.state';

	//#region Events

	private _onDidLayout: Emitter<Dimension> = this._register(new Emitter<Dimension>());
	get onDidLayout(): Event<Dimension> { return this._onDidLayout.event; }

	private _onDidActiveGroupChange: Emitter<IEditorGroupView> = this._register(new Emitter<IEditorGroupView>());
	get onDidActiveGroupChange(): Event<IEditorGroupView> { return this._onDidActiveGroupChange.event; }

	private _onDidAddGroup: Emitter<IEditorGroupView> = this._register(new Emitter<IEditorGroupView>());
	get onDidAddGroup(): Event<IEditorGroupView> { return this._onDidAddGroup.event; }

	private _onDidRemoveGroup: Emitter<IEditorGroupView> = this._register(new Emitter<IEditorGroupView>());
	get onDidRemoveGroup(): Event<IEditorGroupView> { return this._onDidRemoveGroup.event; }

	private _onDidMoveGroup: Emitter<IEditorGroupView> = this._register(new Emitter<IEditorGroupView>());
	get onDidMoveGroup(): Event<IEditorGroupView> { return this._onDidMoveGroup.event; }

	private _onDidPreferredSizeChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidPreferredSizeChange(): Event<void> { return this._onDidPreferredSizeChange.event; }

	//#endregion

	private dimension: Dimension;
	private _preferredSize: Dimension;

	private memento: object;
	private _partOptions: IEditorPartOptions;

	private _activeGroup: IEditorGroupView;
	private groupViews: Map<GroupIdentifier, IEditorGroupView> = new Map<GroupIdentifier, IEditorGroupView>();
	private mostRecentActiveGroups: GroupIdentifier[] = [];

	private container: HTMLElement;
	private gridWidget: SerializableGrid<IEditorGroupView>;

	private _whenRestored: TPromise<void>;
	private whenRestoredComplete: TValueCallback<void>;

	private previousUIState: IEditorPartUIState;

	constructor(
		id: string,
		private restorePreviousState: boolean,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IStorageService private storageService: IStorageService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		super(id, { hasTitle: false }, themeService);

		this._partOptions = getEditorPartOptions(this.configurationService.getValue<IWorkbenchEditorConfiguration>());
		this.memento = this.getMemento(this.storageService, Scope.WORKSPACE);

		this._whenRestored = new TPromise(resolve => {
			this.whenRestoredComplete = resolve;
		});

		this.registerListeners();
	}

	//#region IEditorGroupsAccessor

	private enforcedPartOptions: IEditorPartOptions[] = [];

	private _onDidEditorPartOptionsChange: Emitter<IEditorPartOptionsChangeEvent> = this._register(new Emitter<IEditorPartOptionsChangeEvent>());
	get onDidEditorPartOptionsChange(): Event<IEditorPartOptionsChangeEvent> { return this._onDidEditorPartOptionsChange.event; }

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (impactsEditorPartOptions(event)) {
			this.handleChangedPartOptions();
		}
	}

	private handleChangedPartOptions(): void {
		const oldPartOptions = this._partOptions;
		const newPartOptions = getEditorPartOptions(this.configurationService.getValue<IWorkbenchEditorConfiguration>());

		this.enforcedPartOptions.forEach(enforcedPartOptions => {
			assign(newPartOptions, enforcedPartOptions); // check for overrides
		});

		this._partOptions = newPartOptions;

		this._onDidEditorPartOptionsChange.fire({ oldPartOptions, newPartOptions });
	}

	get partOptions(): IEditorPartOptions {
		return this._partOptions;
	}

	enforcePartOptions(options: IEditorPartOptions): IDisposable {
		this.enforcedPartOptions.push(options);
		this.handleChangedPartOptions();

		return toDisposable(() => {
			this.enforcedPartOptions.splice(this.enforcedPartOptions.indexOf(options), 1);
			this.handleChangedPartOptions();
		});
	}

	//#endregion

	//#region IEditorGroupsService

	get activeGroup(): IEditorGroupView {
		return this._activeGroup;
	}

	get groups(): IEditorGroupView[] {
		return values(this.groupViews);
	}

	get count(): number {
		return this.groupViews.size;
	}

	get orientation(): GroupOrientation {
		if (!this.gridWidget) {
			return void 0; // we have not been created yet
		}

		return this.gridWidget.orientation === Orientation.VERTICAL ? GroupOrientation.VERTICAL : GroupOrientation.HORIZONTAL;
	}

	get whenRestored(): TPromise<void> {
		return this._whenRestored;
	}

	getGroups(order = GroupsOrder.CREATION_TIME): IEditorGroupView[] {
		switch (order) {
			case GroupsOrder.CREATION_TIME:
				return this.groups;

			case GroupsOrder.MOST_RECENTLY_ACTIVE:
				const mostRecentActive = this.mostRecentActiveGroups.map(groupId => this.getGroup(groupId));

				// there can be groups that got never active, even though they exist. in this case
				// make sure to ust append them at the end so that all groups are returned properly
				return distinct([...mostRecentActive, ...this.groups]);

			case GroupsOrder.GRID_APPEARANCE:
				const views: IEditorGroupView[] = [];
				if (this.gridWidget) {
					this.fillGridNodes(views, this.gridWidget.getViews());
				}

				return views;
		}
	}

	private fillGridNodes(target: IEditorGroupView[], node: GridBranchNode<IEditorGroupView> | GridNode<IEditorGroupView>): void {
		if (isGridBranchNode(node)) {
			node.children.forEach(child => this.fillGridNodes(target, child));
		} else {
			target.push(node.view);
		}
	}

	getGroup(identifier: GroupIdentifier): IEditorGroupView {
		return this.groupViews.get(identifier);
	}

	findGroup(scope: IFindGroupScope, source: IEditorGroupView | GroupIdentifier = this.activeGroup, wrap?: boolean): IEditorGroupView {

		// by direction
		if (typeof scope.direction === 'number') {
			return this.doFindGroupByDirection(scope.direction, source, wrap);
		}

		// by location
		return this.doFindGroupByLocation(scope.location, source, wrap);
	}

	private doFindGroupByDirection(direction: GroupDirection, source: IEditorGroupView | GroupIdentifier, wrap?: boolean): IEditorGroupView {
		const sourceGroupView = this.assertGroupView(source);

		// Find neighbours and sort by our MRU list
		const neighbours = this.gridWidget.getNeighborViews(sourceGroupView, this.toGridViewDirection(direction), wrap);
		neighbours.sort(((n1, n2) => this.mostRecentActiveGroups.indexOf(n1.id) - this.mostRecentActiveGroups.indexOf(n2.id)));

		return neighbours[0];
	}

	private doFindGroupByLocation(location: GroupLocation, source: IEditorGroupView | GroupIdentifier, wrap?: boolean): IEditorGroupView {
		const sourceGroupView = this.assertGroupView(source);
		const groups = this.getGroups(GroupsOrder.CREATION_TIME);
		const index = groups.indexOf(sourceGroupView);

		switch (location) {
			case GroupLocation.FIRST:
				return groups[0];
			case GroupLocation.LAST:
				return groups[groups.length - 1];
			case GroupLocation.NEXT:
				let nextGroup = groups[index + 1];
				if (!nextGroup && wrap) {
					nextGroup = this.doFindGroupByLocation(GroupLocation.FIRST, source);
				}

				return nextGroup;
			case GroupLocation.PREVIOUS:
				let previousGroup = groups[index - 1];
				if (!previousGroup && wrap) {
					previousGroup = this.doFindGroupByLocation(GroupLocation.LAST, source);
				}

				return previousGroup;
		}
	}

	activateGroup(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		const groupView = this.assertGroupView(group);
		this.doSetGroupActive(groupView);

		return groupView;
	}

	getSize(group: IEditorGroupView | GroupIdentifier): number {
		const groupView = this.assertGroupView(group);

		return this.gridWidget.getViewSize(groupView);
	}

	setSize(group: IEditorGroupView | GroupIdentifier, size: number): void {
		const groupView = this.assertGroupView(group);

		this.gridWidget.resizeView(groupView, size);
	}

	arrangeGroups(arrangement: GroupsArrangement): void {
		if (this.count < 2) {
			return; // require at least 2 groups to show
		}

		if (!this.gridWidget) {
			return; // we have not been created yet
		}

		// Even all group sizes
		if (arrangement === GroupsArrangement.EVEN) {
			this.gridWidget.distributeViewSizes();
		}

		// Maximize the current active group
		else {
			this.gridWidget.maximizeViewSize(this.activeGroup);
		}
	}

	setGroupOrientation(orientation: GroupOrientation): void {
		if (!this.gridWidget) {
			return; // we have not been created yet
		}

		const newOrientation = (orientation === GroupOrientation.HORIZONTAL) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
		if (this.gridWidget.orientation !== newOrientation) {
			this.gridWidget.orientation = newOrientation;

			// Mark preferred size as changed
			this.resetPreferredSize();
		}
	}

	applyLayout(layout: EditorGroupLayout): void {
		const gridHasFocus = isAncestor(document.activeElement, this.container);

		// Determine how many groups we need overall
		let layoutGroupsCount = 0;
		function countGroups(groups: GroupLayoutArgument[]): void {
			groups.forEach(group => {
				if (Array.isArray(group.groups)) {
					countGroups(group.groups);
				} else {
					layoutGroupsCount++;
				}
			});
		}
		countGroups(layout.groups);

		// If we currently have too many groups, merge them into the last one
		let currentGroupViews = this.getGroups(GroupsOrder.GRID_APPEARANCE);
		if (layoutGroupsCount < currentGroupViews.length) {
			const lastGroupInLayout = currentGroupViews[layoutGroupsCount - 1];
			currentGroupViews.forEach((group, index) => {
				if (index >= layoutGroupsCount) {
					this.mergeGroup(group, lastGroupInLayout);
				}
			});

			currentGroupViews = this.getGroups(GroupsOrder.GRID_APPEARANCE);
		}

		const activeGroup = this.activeGroup;

		// Prepare grid descriptor to create new grid from
		const gridDescriptor = createSerializedGrid({
			orientation: this.toGridViewOrientation(layout.orientation, this.gridWidget.orientation),
			groups: layout.groups
		});

		// Recreate gridwidget with descriptor
		this.doCreateGridControlWithState(this.container, gridDescriptor, activeGroup.id, currentGroupViews);

		// Layout
		this.doLayout(this.dimension);

		// Update container
		this.updateContainer();

		// Mark preferred size as changed
		this.resetPreferredSize();

		// Events for groupd that got added
		this.getGroups(GroupsOrder.GRID_APPEARANCE).forEach(groupView => {
			if (currentGroupViews.indexOf(groupView) === -1) {
				this._onDidAddGroup.fire(groupView);
			}
		});

		// Restore focus as needed
		if (gridHasFocus) {
			this._activeGroup.focus();
		}
	}

	addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection, options?: IAddGroupOptions): IEditorGroupView {
		const locationView = this.assertGroupView(location);

		const group = this.doAddGroup(locationView, direction);

		if (options && options.activate) {
			this.doSetGroupActive(group);
		}

		return group;
	}

	private doAddGroup(locationView: IEditorGroupView, direction: GroupDirection, groupToCopy?: IEditorGroupView): IEditorGroupView {
		const newGroupView = this.doCreateGroupView(groupToCopy);

		// Add to grid widget
		this.gridWidget.addView(
			newGroupView,
			Sizing.Distribute,
			locationView,
			this.toGridViewDirection(direction),
		);

		// Update container
		this.updateContainer();

		// Mark preferred size as changed
		this.resetPreferredSize();

		// Event
		this._onDidAddGroup.fire(newGroupView);

		return newGroupView;
	}

	private doCreateGroupView(from?: IEditorGroupView | ISerializedEditorGroup): IEditorGroupView {

		// Label: just use the number of existing groups as label
		const label = this.getGroupLabel(this.count + 1);

		// Create group view
		let groupView: IEditorGroupView;
		if (from instanceof EditorGroupView) {
			groupView = EditorGroupView.createCopy(from, this, label, this.instantiationService);
		} else if (isSerializedEditorGroup(from)) {
			groupView = EditorGroupView.createFromSerialized(from, this, label, this.instantiationService);
		} else {
			groupView = EditorGroupView.createNew(this, label, this.instantiationService);
		}

		// Keep in map
		this.groupViews.set(groupView.id, groupView);

		// Track focus
		let groupDisposables: IDisposable[] = [];
		groupDisposables.push(groupView.onDidFocus(() => {
			this.doSetGroupActive(groupView);
		}));

		// Track editor change
		groupDisposables.push(groupView.onDidGroupChange(e => {
			if (e.kind === GroupChangeKind.EDITOR_ACTIVE) {
				this.updateContainer();
			}
		}));

		// Track dispose
		once(groupView.onWillDispose)(() => {
			groupDisposables = dispose(groupDisposables);
			this.groupViews.delete(groupView.id);
			this.doUpdateMostRecentActive(groupView);
		});

		return groupView;
	}

	private doSetGroupActive(group: IEditorGroupView): void {
		if (this._activeGroup === group) {
			return; // return if this is already the active group
		}

		const previousActiveGroup = this._activeGroup;
		this._activeGroup = group;

		// Update list of most recently active groups
		this.doUpdateMostRecentActive(group, true);

		// Mark previous one as inactive
		if (previousActiveGroup) {
			previousActiveGroup.setActive(false);
		}

		// Mark group as new active
		group.setActive(true);

		// Event
		this._onDidActiveGroupChange.fire(group);
	}

	private doUpdateMostRecentActive(group: IEditorGroupView, makeMostRecentlyActive?: boolean): void {
		const index = this.mostRecentActiveGroups.indexOf(group.id);

		// Remove from MRU list
		if (index !== -1) {
			this.mostRecentActiveGroups.splice(index, 1);
		}

		// Add to front as needed
		if (makeMostRecentlyActive) {
			this.mostRecentActiveGroups.unshift(group.id);
		}
	}

	private toGridViewDirection(direction: GroupDirection): Direction {
		switch (direction) {
			case GroupDirection.UP: return Direction.Up;
			case GroupDirection.DOWN: return Direction.Down;
			case GroupDirection.LEFT: return Direction.Left;
			case GroupDirection.RIGHT: return Direction.Right;
		}
	}

	private toGridViewOrientation(orientation: GroupOrientation, fallback?: Orientation): Orientation {
		if (typeof orientation === 'number') {
			return orientation === GroupOrientation.HORIZONTAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
		}

		return fallback;
	}

	removeGroup(group: IEditorGroupView | GroupIdentifier): void {
		const groupView = this.assertGroupView(group);
		if (this.groupViews.size === 1) {
			return; // Cannot remove the last root group
		}

		// Remove empty group
		if (groupView.isEmpty()) {
			return this.doRemoveEmptyGroup(groupView);
		}

		// Remove group with editors
		this.doRemoveGroupWithEditors(groupView);
	}

	private doRemoveGroupWithEditors(groupView: IEditorGroupView): void {
		const mostRecentlyActiveGroups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);

		let lastActiveGroup: IEditorGroupView;
		if (this._activeGroup === groupView) {
			lastActiveGroup = mostRecentlyActiveGroups[1];
		} else {
			lastActiveGroup = mostRecentlyActiveGroups[0];
		}

		// Removing a group with editors should merge these editors into the
		// last active group and then remove this group.
		this.mergeGroup(groupView, lastActiveGroup);
	}

	private doRemoveEmptyGroup(groupView: IEditorGroupView): void {
		const gridHasFocus = isAncestor(document.activeElement, this.container);

		// Activate next group if the removed one was active
		if (this._activeGroup === groupView) {
			const mostRecentlyActiveGroups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
			const nextActiveGroup = mostRecentlyActiveGroups[1]; // [0] will be the current group we are about to dispose
			this.activateGroup(nextActiveGroup);
		}

		// Remove from grid widget & dispose
		this.gridWidget.removeView(groupView, Sizing.Distribute);
		groupView.dispose();

		// Restore focus if we had it previously (we run this after gridWidget.removeView() is called
		// because removing a view can mean to reparent it and thus focus would be removed otherwise)
		if (gridHasFocus) {
			this._activeGroup.focus();
		}

		// Update labels: since our labels are created using the index of the
		// group, removing a group might produce gaps. So we iterate over all
		// groups and reassign the label based on the index.
		this.getGroups(GroupsOrder.CREATION_TIME).forEach((group, index) => {
			group.setLabel(this.getGroupLabel(index + 1));
		});

		// Update container
		this.updateContainer();

		// Mark preferred size as changed
		this.resetPreferredSize();

		// Event
		this._onDidRemoveGroup.fire(groupView);
	}

	private getGroupLabel(index: number): string {
		return localize('groupLabel', "Group {0}", index);
	}

	moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		const sourceView = this.assertGroupView(group);
		const targetView = this.assertGroupView(location);

		if (sourceView.id === targetView.id) {
			throw new Error('Cannot move group into its own');
		}

		const groupHasFocus = isAncestor(document.activeElement, sourceView.element);

		// Move is a simple remove and add of the same view
		this.gridWidget.removeView(sourceView, Sizing.Distribute);
		this.gridWidget.addView(sourceView, Sizing.Distribute, targetView, this.toGridViewDirection(direction));

		// Restore focus if we had it previously (we run this after gridWidget.removeView() is called
		// because removing a view can mean to reparent it and thus focus would be removed otherwise)
		if (groupHasFocus) {
			sourceView.focus();
		}

		// Event
		this._onDidMoveGroup.fire(sourceView);

		return sourceView;
	}

	copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		const groupView = this.assertGroupView(group);
		const locationView = this.assertGroupView(location);

		const groupHasFocus = isAncestor(document.activeElement, groupView.element);

		// Copy the group view
		const copiedGroupView = this.doAddGroup(locationView, direction, groupView);

		// Restore focus if we had it
		if (groupHasFocus) {
			copiedGroupView.focus();
		}

		return copiedGroupView;
	}

	mergeGroup(group: IEditorGroupView | GroupIdentifier, target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): IEditorGroupView {
		const sourceView = this.assertGroupView(group);
		const targetView = this.assertGroupView(target);

		// Move/Copy editors over into target
		let index = (options && typeof options.index === 'number') ? options.index : targetView.count;
		sourceView.editors.forEach(editor => {
			const inactive = !sourceView.isActive(editor);
			const copyOptions: ICopyEditorOptions = { index, inactive, preserveFocus: inactive };

			if (options && options.mode === MergeGroupMode.COPY_EDITORS) {
				sourceView.copyEditor(editor, targetView, copyOptions);
			} else {
				sourceView.moveEditor(editor, targetView, copyOptions);
			}

			index++;
		});

		// Remove source if the view is now empty and not already removed
		if (sourceView.isEmpty() && !sourceView.disposed /* could have been disposed already via workbench.editor.closeEmptyGroups setting */) {
			this.removeGroup(sourceView);
		}

		return targetView;
	}

	private assertGroupView(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		if (typeof group === 'number') {
			group = this.getGroup(group);
		}

		if (!group) {
			throw new Error('Invalid editor group provided!');
		}

		return group;
	}

	//#endregion

	//#region Part

	get preferredSize(): Dimension {
		if (!this._preferredSize) {
			this._preferredSize = new Dimension(this.gridWidget.minimumWidth, this.gridWidget.minimumHeight);
		}

		return this._preferredSize;
	}

	private resetPreferredSize(): void {

		// Reset (will be computed upon next access)
		this._preferredSize = void 0;

		// Event
		this._onDidPreferredSizeChange.fire();
	}

	private get gridSeparatorBorder(): Color {
		return this.theme.getColor(EDITOR_GROUP_BORDER) || this.theme.getColor(contrastBorder) || Color.transparent;
	}

	protected updateStyles(): void {
		this.container.style.backgroundColor = this.getColor(editorBackground);

		this.gridWidget.style({ separatorBorder: this.gridSeparatorBorder });
	}

	createContentArea(parent: HTMLElement): HTMLElement {

		// Container
		this.container = document.createElement('div');
		addClass(this.container, 'content');
		parent.appendChild(this.container);

		// Grid control
		this.doCreateGridControl(this.container);

		// Drop support
		this._register(this.instantiationService.createInstance(EditorDropTarget, this, this.container));

		return this.container;
	}

	private doCreateGridControl(container: HTMLElement): void {

		// Grid Widget (with previous UI state)
		if (this.restorePreviousState) {
			this.doCreateGridControlWithPreviousState(container);
		}

		// Grid Widget (no previous UI state or failed to restore)
		if (!this.gridWidget) {
			const initialGroup = this.doCreateGroupView();
			this.gridWidget = new SerializableGrid(container, initialGroup);

			// Ensure a group is active
			this.doSetGroupActive(initialGroup);
		}

		// Signal restored
		always(TPromise.join(this.groups.map(group => group.whenRestored)), () => this.whenRestoredComplete(void 0));

		// Update container
		this.updateContainer();
	}

	private doCreateGridControlWithPreviousState(container: HTMLElement): void {
		const uiState = this.doGetPreviousState();
		if (uiState && uiState.serializedGrid) {
			try {
				this.previousUIState = uiState;

				// MRU
				this.mostRecentActiveGroups = uiState.mostRecentActiveGroups;

				// Grid Widget
				this.doCreateGridControlWithState(container, uiState.serializedGrid, uiState.activeGroup);

				// Ensure last active group has focus
				this._activeGroup.focus();
			} catch (error) {
				if (this.gridWidget) {
					this.gridWidget.dispose();
					this.gridWidget = void 0;
				}

				clearNode(container);
				this.groupViews.forEach(group => group.dispose());
				this.groupViews.clear();
				this._activeGroup = void 0;
				this.mostRecentActiveGroups = [];

				this.gridError(error); // TODO@ben remove this safe guard once the grid is stable
			}
		}
	}

	private doCreateGridControlWithState(container: HTMLElement, serializedGrid: ISerializedGrid, activeGroupId: GroupIdentifier, editorGroupViewsToReuse?: IEditorGroupView[]): void {

		// Dispose old
		if (this.gridWidget) {
			this.gridWidget.dispose();
		}

		// Determine group views to reuse if any
		let reuseGroupViews: IEditorGroupView[];
		if (editorGroupViewsToReuse) {
			reuseGroupViews = editorGroupViewsToReuse.slice(0); // do not modify original array
		} else {
			reuseGroupViews = [];
		}

		// Create new
		this.gridWidget = SerializableGrid.deserialize(container, serializedGrid, {
			fromJSON: (serializedEditorGroup: ISerializedEditorGroup) => {
				let groupView: IEditorGroupView;
				if (reuseGroupViews.length > 0) {
					groupView = reuseGroupViews.shift();
				} else {
					groupView = this.doCreateGroupView(serializedEditorGroup);
				}

				if (groupView.id === activeGroupId) {
					this.doSetGroupActive(groupView);
				}

				return groupView;
			}
		}, { styles: { separatorBorder: this.gridSeparatorBorder } });
	}

	private doGetPreviousState(): IEditorPartUIState {
		const legacyState = this.doGetPreviousLegacyState();
		if (legacyState) {
			return legacyState; // TODO@ben remove after a while
		}

		return this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY] as IEditorPartUIState;
	}

	private doGetPreviousLegacyState(): IEditorPartUIState {
		const LEGACY_EDITOR_PART_UI_STATE_STORAGE_KEY = 'editorpart.uiState';
		const LEGACY_STACKS_MODEL_STORAGE_KEY = 'editorStacks.model';

		interface ILegacyEditorPartUIState {
			ratio: number[];
			groupOrientation: 'vertical' | 'horizontal';
		}

		interface ISerializedLegacyEditorStacksModel {
			groups: ISerializedEditorGroup[];
			active: number;
		}

		let legacyUIState: ISerializedLegacyEditorStacksModel;
		const legacyUIStateRaw = this.storageService.get(LEGACY_STACKS_MODEL_STORAGE_KEY, StorageScope.WORKSPACE);
		if (legacyUIStateRaw) {
			try {
				legacyUIState = JSON.parse(legacyUIStateRaw);
			} catch (error) { /* ignore */ }
		}

		if (legacyUIState) {
			this.storageService.remove(LEGACY_STACKS_MODEL_STORAGE_KEY, StorageScope.WORKSPACE);
		}

		const legacyPartState = this.memento[LEGACY_EDITOR_PART_UI_STATE_STORAGE_KEY] as ILegacyEditorPartUIState;
		if (legacyPartState) {
			delete this.memento[LEGACY_EDITOR_PART_UI_STATE_STORAGE_KEY];
		}

		if (legacyUIState && Array.isArray(legacyUIState.groups) && legacyUIState.groups.length > 0) {
			const splitHorizontally = legacyPartState && legacyPartState.groupOrientation === 'horizontal';

			const legacyState: IEditorPartUIState = Object.create(null);

			const positionOneGroup = legacyUIState.groups[0];
			const positionTwoGroup = legacyUIState.groups[1];
			const positionThreeGroup = legacyUIState.groups[2];

			legacyState.activeGroup = legacyUIState.active;
			legacyState.mostRecentActiveGroups = [legacyUIState.active];

			if (positionTwoGroup || positionThreeGroup) {
				if (!positionThreeGroup) {
					legacyState.mostRecentActiveGroups.push(legacyState.activeGroup === 0 ? 1 : 0);
				} else {
					if (legacyState.activeGroup === 0) {
						legacyState.mostRecentActiveGroups.push(1, 2);
					} else if (legacyState.activeGroup === 1) {
						legacyState.mostRecentActiveGroups.push(0, 2);
					} else {
						legacyState.mostRecentActiveGroups.push(0, 1);
					}
				}
			}

			const toNode = function (group: ISerializedEditorGroup, size: number): ISerializedNode {
				return {
					data: group,
					size,
					type: 'leaf'
				};
			};

			const baseSize = 1200; // just some number because layout() was not called yet, but we only need the proportions

			// No split editor
			if (!positionTwoGroup) {
				legacyState.serializedGrid = {
					width: baseSize,
					height: baseSize,
					orientation: splitHorizontally ? Orientation.VERTICAL : Orientation.HORIZONTAL,
					root: toNode(positionOneGroup, baseSize)
				};
			}

			// Split editor (2 or 3 columns)
			else {
				const children: ISerializedNode[] = [];

				const size = positionThreeGroup ? baseSize / 3 : baseSize / 2;

				children.push(toNode(positionOneGroup, size));
				children.push(toNode(positionTwoGroup, size));

				if (positionThreeGroup) {
					children.push(toNode(positionThreeGroup, size));
				}

				legacyState.serializedGrid = {
					width: baseSize,
					height: baseSize,
					orientation: splitHorizontally ? Orientation.VERTICAL : Orientation.HORIZONTAL,
					root: {
						data: children,
						size: baseSize,
						type: 'branch'
					}
				};
			}

			return legacyState;
		}

		return void 0;
	}

	private updateContainer(): void {
		toggleClass(this.container, 'empty', this.isEmpty());
	}

	private isEmpty(): boolean {
		return this.groupViews.size === 1 && this._activeGroup.isEmpty();
	}

	// TODO@ben this should be removed once the gridwidget is stable
	private gridError(error: Error): void {
		console.error(error);

		if (this.previousUIState) {
			console.error('Serialized Grid State: ', this.previousUIState);
		}

		this.lifecycleService.when(LifecyclePhase.Running).then(() => {
			this.notificationService.prompt(Severity.Error, `Grid Issue: ${error}. Please report this error stack with reproducible steps.`, [{ label: 'Open DevTools', run: () => this.windowService.openDevTools() }]);
		});
	}

	layout(dimension: Dimension): Dimension[] {
		const sizes = super.layout(dimension);

		this.doLayout(sizes[1]);

		return sizes;
	}

	private doLayout(dimension: Dimension): void {
		this.dimension = dimension;

		// Layout Grid
		try {
			this.gridWidget.layout(this.dimension.width, this.dimension.height);
		} catch (error) {
			this.gridError(error);
		}

		// Event
		this._onDidLayout.fire(dimension);
	}

	shutdown(): void {

		// Persist grid UI state
		if (this.gridWidget) {
			const uiState: IEditorPartUIState = {
				serializedGrid: this.gridWidget.serialize(),
				activeGroup: this._activeGroup.id,
				mostRecentActiveGroups: this.mostRecentActiveGroups
			};

			if (this.isEmpty()) {
				delete this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
			} else {
				this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY] = uiState;
			}
		}

		// Forward to all groups
		this.groupViews.forEach(group => group.shutdown());

		super.shutdown();
	}

	dispose(): void {

		// Forward to all groups
		this.groupViews.forEach(group => group.dispose());
		this.groupViews.clear();

		// Grid widget
		if (this.gridWidget) {
			this.gridWidget = dispose(this.gridWidget);
		}

		super.dispose();
	}

	//#endregion
}

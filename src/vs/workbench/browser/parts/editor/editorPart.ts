/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { Part } from '../../part.js';
import { Dimension, $, EventHelper, addDisposableGenericMouseDownListener, getWindow, isAncestorOfActiveElement, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Event, Emitter, Relay, PauseableEmitter } from '../../../../base/common/event.js';
import { contrastBorder, editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { GroupDirection, GroupsArrangement, GroupOrientation, IMergeGroupOptions, MergeGroupMode, GroupsOrder, GroupLocation, IFindGroupScope, EditorGroupLayout, GroupLayoutArgument, IEditorSideGroup, IEditorDropTargetDelegate, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IView, orthogonal, LayoutPriority, IViewSize, Direction, SerializableGrid, Sizing, ISerializedGrid, ISerializedNode, Orientation, GridBranchNode, isGridBranchNode, GridNode, createSerializedGrid, Grid } from '../../../../base/browser/ui/grid/grid.js';
import { GroupIdentifier, EditorInputWithOptions, IEditorPartOptions, IEditorPartOptionsChangeEvent, GroupModelChangeKind } from '../../../common/editor.js';
import { EDITOR_GROUP_BORDER, EDITOR_PANE_BACKGROUND } from '../../../common/theme.js';
import { distinct, coalesce } from '../../../../base/common/arrays.js';
import { IEditorGroupView, getEditorPartOptions, impactsEditorPartOptions, IEditorPartCreationOptions, IEditorPartsView, IEditorGroupsView, IEditorGroupViewOptions } from './editor.js';
import { EditorGroupView } from './editorGroupView.js';
import { IConfigurationService, IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { IDisposable, dispose, toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISerializedEditorGroupModel, isSerializedEditorGroupModel } from '../../../common/editor/editorGroupModel.js';
import { EditorDropTarget } from './editorDropTarget.js';
import { Color } from '../../../../base/common/color.js';
import { CenteredViewLayout } from '../../../../base/browser/ui/centered/centeredViewLayout.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Parts, IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { DeepPartial, assertIsDefined, assertType } from '../../../../base/common/types.js';
import { CompositeDragAndDropObserver } from '../../dnd.js';
import { DeferredPromise, Promises } from '../../../../base/common/async.js';
import { findGroup } from '../../../services/editor/common/editorGroupFinder.js';
import { SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IBoundarySashes } from '../../../../base/browser/ui/sash/sash.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { EditorPartMaximizedEditorGroupContext, EditorPartMultipleEditorGroupsContext, IsAuxiliaryEditorPartContext } from '../../../common/contextkeys.js';
import { mainWindow } from '../../../../base/browser/window.js';

export interface IEditorPartUIState {
	readonly serializedGrid: ISerializedGrid;
	readonly activeGroup: GroupIdentifier;
	readonly mostRecentActiveGroups: GroupIdentifier[];
}

class GridWidgetView<T extends IView> implements IView {

	readonly element: HTMLElement = $('.grid-view-container');

	get minimumWidth(): number { return this.gridWidget ? this.gridWidget.minimumWidth : 0; }
	get maximumWidth(): number { return this.gridWidget ? this.gridWidget.maximumWidth : Number.POSITIVE_INFINITY; }
	get minimumHeight(): number { return this.gridWidget ? this.gridWidget.minimumHeight : 0; }
	get maximumHeight(): number { return this.gridWidget ? this.gridWidget.maximumHeight : Number.POSITIVE_INFINITY; }

	private _onDidChange = new Relay<{ width: number; height: number } | undefined>();
	readonly onDidChange = this._onDidChange.event;

	private _gridWidget: Grid<T> | undefined;

	get gridWidget(): Grid<T> | undefined {
		return this._gridWidget;
	}

	set gridWidget(grid: Grid<T> | undefined) {
		this.element.innerText = '';

		if (grid) {
			this.element.appendChild(grid.element);
			this._onDidChange.input = grid.onDidChange;
		} else {
			this._onDidChange.input = Event.None;
		}

		this._gridWidget = grid;
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.gridWidget?.layout(width, height, top, left);
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

export class EditorPart extends Part implements IEditorPart, IEditorGroupsView {

	private static readonly EDITOR_PART_UI_STATE_STORAGE_KEY = 'editorpart.state';
	private static readonly EDITOR_PART_CENTERED_VIEW_STORAGE_KEY = 'editorpart.centeredview';

	//#region Events

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private readonly _onDidLayout = this._register(new Emitter<Dimension>());
	readonly onDidLayout = this._onDidLayout.event;

	private readonly _onDidChangeActiveGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;

	private readonly _onDidChangeGroupIndex = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;

	private readonly _onDidChangeGroupLabel = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeGroupLabel = this._onDidChangeGroupLabel.event;

	private readonly _onDidChangeGroupLocked = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;

	private readonly _onDidChangeGroupMaximized = this._register(new Emitter<boolean>());
	readonly onDidChangeGroupMaximized = this._onDidChangeGroupMaximized.event;

	private readonly _onDidActivateGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidActivateGroup = this._onDidActivateGroup.event;

	private readonly _onDidAddGroup = this._register(new PauseableEmitter<IEditorGroupView>());
	readonly onDidAddGroup = this._onDidAddGroup.event;

	private readonly _onDidRemoveGroup = this._register(new PauseableEmitter<IEditorGroupView>());
	readonly onDidRemoveGroup = this._onDidRemoveGroup.event;

	private readonly _onDidMoveGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidMoveGroup = this._onDidMoveGroup.event;

	private readonly onDidSetGridWidget = this._register(new Emitter<{ width: number; height: number } | undefined>());

	private readonly _onDidChangeSizeConstraints = this._register(new Relay<{ width: number; height: number } | undefined>());
	readonly onDidChangeSizeConstraints = Event.any(this.onDidSetGridWidget.event, this._onDidChangeSizeConstraints.event);

	private readonly _onDidScroll = this._register(new Relay<void>());
	readonly onDidScroll = Event.any(this.onDidSetGridWidget.event, this._onDidScroll.event);

	private readonly _onDidChangeEditorPartOptions = this._register(new Emitter<IEditorPartOptionsChangeEvent>());
	readonly onDidChangeEditorPartOptions = this._onDidChangeEditorPartOptions.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion

	private readonly workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.USER);
	private readonly profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);

	private readonly groupViews = new Map<GroupIdentifier, IEditorGroupView>();
	private mostRecentActiveGroups: GroupIdentifier[] = [];

	protected container: HTMLElement | undefined;

	private scopedInstantiationService!: IInstantiationService;

	private centeredLayoutWidget!: CenteredViewLayout;

	private gridWidget!: SerializableGrid<IEditorGroupView>;
	private readonly gridWidgetDisposables = this._register(new DisposableStore());
	private readonly gridWidgetView = this._register(new GridWidgetView<IEditorGroupView>());

	constructor(
		protected readonly editorPartsView: IEditorPartsView,
		id: string,
		private readonly groupsLabel: string,
		readonly windowId: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService private readonly hostService: IHostService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super(id, { hasTitle: false }, themeService, storageService, layoutService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
		this._register(this.themeService.onDidFileIconThemeChange(() => this.handleChangedPartOptions()));
		this._register(this.onDidChangeMementoValue(StorageScope.WORKSPACE, this._store)(e => this.onDidChangeMementoState(e)));
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (impactsEditorPartOptions(event)) {
			this.handleChangedPartOptions();
		}
	}

	private handleChangedPartOptions(): void {
		const oldPartOptions = this._partOptions;
		const newPartOptions = getEditorPartOptions(this.configurationService, this.themeService);

		for (const enforcedPartOptions of this.enforcedPartOptions) {
			Object.assign(newPartOptions, enforcedPartOptions); // check for overrides
		}

		this._partOptions = newPartOptions;

		this._onDidChangeEditorPartOptions.fire({ oldPartOptions, newPartOptions });
	}

	private enforcedPartOptions: DeepPartial<IEditorPartOptions>[] = [];

	private _partOptions = getEditorPartOptions(this.configurationService, this.themeService);
	get partOptions(): IEditorPartOptions { return this._partOptions; }

	enforcePartOptions(options: DeepPartial<IEditorPartOptions>): IDisposable {
		this.enforcedPartOptions.push(options);
		this.handleChangedPartOptions();

		return toDisposable(() => {
			this.enforcedPartOptions.splice(this.enforcedPartOptions.indexOf(options), 1);
			this.handleChangedPartOptions();
		});
	}

	private top = 0;
	private left = 0;
	private _contentDimension!: Dimension;
	get contentDimension(): Dimension { return this._contentDimension; }

	private _activeGroup!: IEditorGroupView;
	get activeGroup(): IEditorGroupView {
		return this._activeGroup;
	}

	readonly sideGroup: IEditorSideGroup = {
		openEditor: (editor, options) => {
			const [group] = this.scopedInstantiationService.invokeFunction(accessor => findGroup(accessor, { editor, options }, SIDE_GROUP));

			return group.openEditor(editor, options);
		}
	};

	get groups(): IEditorGroupView[] {
		return Array.from(this.groupViews.values());
	}

	get count(): number {
		return this.groupViews.size;
	}

	get orientation(): GroupOrientation {
		return (this.gridWidget && this.gridWidget.orientation === Orientation.VERTICAL) ? GroupOrientation.VERTICAL : GroupOrientation.HORIZONTAL;
	}

	private _isReady = false;
	get isReady(): boolean { return this._isReady; }

	private readonly whenReadyPromise = new DeferredPromise<void>();
	readonly whenReady = this.whenReadyPromise.p;

	private readonly whenRestoredPromise = new DeferredPromise<void>();
	readonly whenRestored = this.whenRestoredPromise.p;

	get hasRestorableState(): boolean {
		return !!this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
	}

	private _willRestoreState = false;
	get willRestoreState(): boolean { return this._willRestoreState; }

	getGroups(order = GroupsOrder.CREATION_TIME): IEditorGroupView[] {
		switch (order) {
			case GroupsOrder.CREATION_TIME:
				return this.groups;

			case GroupsOrder.MOST_RECENTLY_ACTIVE: {
				const mostRecentActive = coalesce(this.mostRecentActiveGroups.map(groupId => this.getGroup(groupId)));

				// there can be groups that got never active, even though they exist. in this case
				// make sure to just append them at the end so that all groups are returned properly
				return distinct([...mostRecentActive, ...this.groups]);
			}
			case GroupsOrder.GRID_APPEARANCE: {
				const views: IEditorGroupView[] = [];
				if (this.gridWidget) {
					this.fillGridNodes(views, this.gridWidget.getViews());
				}

				return views;
			}
		}
	}

	private fillGridNodes(target: IEditorGroupView[], node: GridBranchNode<IEditorGroupView> | GridNode<IEditorGroupView>): void {
		if (isGridBranchNode(node)) {
			node.children.forEach(child => this.fillGridNodes(target, child));
		} else {
			target.push(node.view);
		}
	}

	hasGroup(identifier: GroupIdentifier): boolean {
		return this.groupViews.has(identifier);
	}

	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined {
		return this.groupViews.get(identifier);
	}

	findGroup(scope: IFindGroupScope, source: IEditorGroupView | GroupIdentifier = this.activeGroup, wrap?: boolean): IEditorGroupView | undefined {

		// by direction
		if (typeof scope.direction === 'number') {
			return this.doFindGroupByDirection(scope.direction, source, wrap);
		}

		// by location
		if (typeof scope.location === 'number') {
			return this.doFindGroupByLocation(scope.location, source, wrap);
		}

		throw new Error('invalid arguments');
	}

	private doFindGroupByDirection(direction: GroupDirection, source: IEditorGroupView | GroupIdentifier, wrap?: boolean): IEditorGroupView | undefined {
		const sourceGroupView = this.assertGroupView(source);

		// Find neighbours and sort by our MRU list
		const neighbours = this.gridWidget.getNeighborViews(sourceGroupView, this.toGridViewDirection(direction), wrap);
		neighbours.sort(((n1, n2) => this.mostRecentActiveGroups.indexOf(n1.id) - this.mostRecentActiveGroups.indexOf(n2.id)));

		return neighbours[0];
	}

	private doFindGroupByLocation(location: GroupLocation, source: IEditorGroupView | GroupIdentifier, wrap?: boolean): IEditorGroupView | undefined {
		const sourceGroupView = this.assertGroupView(source);
		const groups = this.getGroups(GroupsOrder.GRID_APPEARANCE);
		const index = groups.indexOf(sourceGroupView);

		switch (location) {
			case GroupLocation.FIRST:
				return groups[0];
			case GroupLocation.LAST:
				return groups[groups.length - 1];
			case GroupLocation.NEXT: {
				let nextGroup: IEditorGroupView | undefined = groups[index + 1];
				if (!nextGroup && wrap) {
					nextGroup = this.doFindGroupByLocation(GroupLocation.FIRST, source);
				}

				return nextGroup;
			}
			case GroupLocation.PREVIOUS: {
				let previousGroup: IEditorGroupView | undefined = groups[index - 1];
				if (!previousGroup && wrap) {
					previousGroup = this.doFindGroupByLocation(GroupLocation.LAST, source);
				}

				return previousGroup;
			}
		}
	}

	activateGroup(group: IEditorGroupView | GroupIdentifier, preserveWindowOrder?: boolean): IEditorGroupView {
		const groupView = this.assertGroupView(group);
		this.doSetGroupActive(groupView);

		// Ensure window on top unless disabled
		if (!preserveWindowOrder) {
			this.hostService.moveTop(getWindow(this.element));
		}

		return groupView;
	}

	restoreGroup(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		const groupView = this.assertGroupView(group);
		this.doRestoreGroup(groupView);

		return groupView;
	}

	getSize(group: IEditorGroupView | GroupIdentifier): { width: number; height: number } {
		const groupView = this.assertGroupView(group);

		return this.gridWidget.getViewSize(groupView);
	}

	setSize(group: IEditorGroupView | GroupIdentifier, size: { width: number; height: number }): void {
		const groupView = this.assertGroupView(group);

		this.gridWidget.resizeView(groupView, size);
	}

	arrangeGroups(arrangement: GroupsArrangement, target: IEditorGroupView | GroupIdentifier = this.activeGroup): void {
		if (this.count < 2) {
			return; // require at least 2 groups to show
		}

		if (!this.gridWidget) {
			return; // we have not been created yet
		}

		const groupView = this.assertGroupView(target);

		switch (arrangement) {
			case GroupsArrangement.EVEN:
				this.gridWidget.distributeViewSizes();
				break;
			case GroupsArrangement.MAXIMIZE:
				if (this.groups.length < 2) {
					return; // need at least 2 groups to be maximized
				}
				this.gridWidget.maximizeView(groupView);
				groupView.focus();
				break;
			case GroupsArrangement.EXPAND:
				this.gridWidget.expandView(groupView);
				break;
		}
	}

	toggleMaximizeGroup(target: IEditorGroupView | GroupIdentifier = this.activeGroup): void {
		if (this.hasMaximizedGroup()) {
			this.unmaximizeGroup();
		} else {
			this.arrangeGroups(GroupsArrangement.MAXIMIZE, target);
		}
	}

	toggleExpandGroup(target: IEditorGroupView | GroupIdentifier = this.activeGroup): void {
		if (this.isGroupExpanded(this.activeGroup)) {
			this.arrangeGroups(GroupsArrangement.EVEN);
		} else {
			this.arrangeGroups(GroupsArrangement.EXPAND, target);
		}
	}

	private unmaximizeGroup(): void {
		this.gridWidget.exitMaximizedView();
		this._activeGroup.focus(); // When making views visible the focus can be affected, so restore it
	}

	hasMaximizedGroup(): boolean {
		return this.gridWidget.hasMaximizedView();
	}

	private isGroupMaximized(targetGroup: IEditorGroupView): boolean {
		return this.gridWidget.isViewMaximized(targetGroup);
	}

	isGroupExpanded(targetGroup: IEditorGroupView): boolean {
		return this.gridWidget.isViewExpanded(targetGroup);
	}

	setGroupOrientation(orientation: GroupOrientation): void {
		if (!this.gridWidget) {
			return; // we have not been created yet
		}

		const newOrientation = (orientation === GroupOrientation.HORIZONTAL) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
		if (this.gridWidget.orientation !== newOrientation) {
			this.gridWidget.orientation = newOrientation;
		}
	}

	applyLayout(layout: EditorGroupLayout): void {
		const restoreFocus = this.shouldRestoreFocus(this.container);

		// Determine how many groups we need overall
		let layoutGroupsCount = 0;
		function countGroups(groups: GroupLayoutArgument[]): void {
			for (const group of groups) {
				if (Array.isArray(group.groups)) {
					countGroups(group.groups);
				} else {
					layoutGroupsCount++;
				}
			}
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
			orientation: this.toGridViewOrientation(
				layout.orientation,
				this.isTwoDimensionalGrid() ?
					this.gridWidget.orientation :			// preserve original orientation for 2-dimensional grids
					orthogonal(this.gridWidget.orientation) // otherwise flip (fix https://github.com/microsoft/vscode/issues/52975)
			),
			groups: layout.groups
		});

		// Recreate gridwidget with descriptor
		this.doApplyGridState(gridDescriptor, activeGroup.id, currentGroupViews);

		// Restore focus as needed
		if (restoreFocus) {
			this._activeGroup.focus();
		}
	}

	getLayout(): EditorGroupLayout {

		// Example return value:
		// { orientation: 0, groups: [ { groups: [ { size: 0.4 }, { size: 0.6 } ], size: 0.5 }, { groups: [ {}, {} ], size: 0.5 } ] }

		const serializedGrid = this.gridWidget.serialize();
		const orientation = serializedGrid.orientation === Orientation.HORIZONTAL ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
		const root = this.serializedNodeToGroupLayoutArgument(serializedGrid.root);

		return {
			orientation,
			groups: root.groups as GroupLayoutArgument[]
		};
	}

	private serializedNodeToGroupLayoutArgument(serializedNode: ISerializedNode): GroupLayoutArgument {
		if (serializedNode.type === 'branch') {
			return {
				size: serializedNode.size,
				groups: serializedNode.data.map(node => this.serializedNodeToGroupLayoutArgument(node))
			};
		}

		return { size: serializedNode.size };
	}

	protected shouldRestoreFocus(target: Element | undefined): boolean {
		if (!target) {
			return false;
		}

		const activeElement = getActiveElement();
		if (activeElement === target.ownerDocument.body) {
			return true; // always restore focus if nothing is focused currently
		}

		// otherwise check for the active element being an ancestor of the target
		return isAncestorOfActiveElement(target);
	}

	private isTwoDimensionalGrid(): boolean {
		const views = this.gridWidget.getViews();
		if (isGridBranchNode(views)) {
			// the grid is 2-dimensional if any children
			// of the grid is a branch node
			return views.children.some(child => isGridBranchNode(child));
		}

		return false;
	}

	addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection, groupToCopy?: IEditorGroupView): IEditorGroupView {
		const locationView = this.assertGroupView(location);

		let newGroupView: IEditorGroupView;

		// Same groups view: add to grid widget directly
		if (locationView.groupsView === this) {
			const restoreFocus = this.shouldRestoreFocus(locationView.element);

			const shouldExpand = this.groupViews.size > 1 && this.isGroupExpanded(locationView);
			newGroupView = this.doCreateGroupView(groupToCopy);

			// Add to grid widget
			this.gridWidget.addView(
				newGroupView,
				this.getSplitSizingStyle(),
				locationView,
				this.toGridViewDirection(direction),
			);

			// Update container
			this.updateContainer();

			// Event
			this._onDidAddGroup.fire(newGroupView);

			// Notify group index change given a new group was added
			this.notifyGroupIndexChange();

			// Expand new group, if the reference view was previously expanded
			if (shouldExpand) {
				this.arrangeGroups(GroupsArrangement.EXPAND, newGroupView);
			}

			// Restore focus if we had it previously after completing the grid
			// operation. That operation might cause reparenting of grid views
			// which moves focus to the <body> element otherwise.
			if (restoreFocus) {
				locationView.focus();
			}
		}

		// Different group view: add to grid widget of that group
		else {
			newGroupView = locationView.groupsView.addGroup(locationView, direction, groupToCopy);
		}

		return newGroupView;
	}

	private getSplitSizingStyle(): Sizing {
		switch (this._partOptions.splitSizing) {
			case 'distribute':
				return Sizing.Distribute;
			case 'split':
				return Sizing.Split;
			default:
				return Sizing.Auto;
		}
	}

	private doCreateGroupView(from?: IEditorGroupView | ISerializedEditorGroupModel | null, options?: IEditorGroupViewOptions): IEditorGroupView {

		// Create group view
		let groupView: IEditorGroupView;
		if (from instanceof EditorGroupView) {
			groupView = EditorGroupView.createCopy(from, this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, options);
		} else if (isSerializedEditorGroupModel(from)) {
			groupView = EditorGroupView.createFromSerialized(from, this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, options);
		} else {
			groupView = EditorGroupView.createNew(this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, options);
		}

		// Keep in map
		this.groupViews.set(groupView.id, groupView);

		// Track focus
		const groupDisposables = new DisposableStore();
		groupDisposables.add(groupView.onDidFocus(() => {
			this.doSetGroupActive(groupView);

			this._onDidFocus.fire();
		}));

		// Track group changes
		groupDisposables.add(groupView.onDidModelChange(e => {
			switch (e.kind) {
				case GroupModelChangeKind.GROUP_LOCKED:
					this._onDidChangeGroupLocked.fire(groupView);
					break;
				case GroupModelChangeKind.GROUP_INDEX:
					this._onDidChangeGroupIndex.fire(groupView);
					break;
				case GroupModelChangeKind.GROUP_LABEL:
					this._onDidChangeGroupLabel.fire(groupView);
					break;
			}
		}));

		// Track active editor change after it occurred
		groupDisposables.add(groupView.onDidActiveEditorChange(() => {
			this.updateContainer();
		}));

		// Track dispose
		Event.once(groupView.onWillDispose)(() => {
			dispose(groupDisposables);
			this.groupViews.delete(groupView.id);
			this.doUpdateMostRecentActive(groupView);
		});

		return groupView;
	}

	private doSetGroupActive(group: IEditorGroupView): void {
		if (this._activeGroup !== group) {
			const previousActiveGroup = this._activeGroup;
			this._activeGroup = group;

			// Update list of most recently active groups
			this.doUpdateMostRecentActive(group, true);

			// Mark previous one as inactive
			if (previousActiveGroup && !previousActiveGroup.disposed) {
				previousActiveGroup.setActive(false);
			}

			// Mark group as new active
			group.setActive(true);

			// Expand the group if it is currently minimized
			this.doRestoreGroup(group);

			// Event
			this._onDidChangeActiveGroup.fire(group);
		}

		// Always fire the event that a group has been activated
		// even if its the same group that is already active to
		// signal the intent even when nothing has changed.
		this._onDidActivateGroup.fire(group);
	}

	private doRestoreGroup(group: IEditorGroupView): void {
		if (!this.gridWidget) {
			return; // method is called as part of state restore very early
		}

		try {
			if (this.hasMaximizedGroup() && !this.isGroupMaximized(group)) {
				this.unmaximizeGroup();
			}

			const viewSize = this.gridWidget.getViewSize(group);
			if (viewSize.width === group.minimumWidth || viewSize.height === group.minimumHeight) {
				this.arrangeGroups(GroupsArrangement.EXPAND, group);
			}
		} catch (error) {
			// ignore: method might be called too early before view is known to grid
		}
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

	private toGridViewOrientation(orientation: GroupOrientation, fallback: Orientation): Orientation {
		if (typeof orientation === 'number') {
			return orientation === GroupOrientation.HORIZONTAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
		}

		return fallback;
	}

	removeGroup(group: IEditorGroupView | GroupIdentifier, preserveFocus?: boolean): void {
		const groupView = this.assertGroupView(group);
		if (this.count === 1) {
			return; // Cannot remove the last root group
		}

		// Remove empty group
		if (groupView.isEmpty) {
			this.doRemoveEmptyGroup(groupView, preserveFocus);
		}

		// Remove group with editors
		else {
			this.doRemoveGroupWithEditors(groupView);
		}
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

	private doRemoveEmptyGroup(groupView: IEditorGroupView, preserveFocus?: boolean): void {
		const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);

		// Activate next group if the removed one was active
		if (this._activeGroup === groupView) {
			const mostRecentlyActiveGroups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
			const nextActiveGroup = mostRecentlyActiveGroups[1]; // [0] will be the current group we are about to dispose
			this.doSetGroupActive(nextActiveGroup);
		}

		// Remove from grid widget & dispose
		this.gridWidget.removeView(groupView, this.getSplitSizingStyle());
		groupView.dispose();

		// Restore focus if we had it previously after completing the grid
		// operation. That operation might cause reparenting of grid views
		// which moves focus to the <body> element otherwise.
		if (restoreFocus) {
			this._activeGroup.focus();
		}

		// Notify group index change given a group was removed
		this.notifyGroupIndexChange();

		// Update container
		this.updateContainer();

		// Event
		this._onDidRemoveGroup.fire(groupView);
	}

	moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		const sourceView = this.assertGroupView(group);
		const targetView = this.assertGroupView(location);

		if (sourceView.id === targetView.id) {
			throw new Error('Cannot move group into its own');
		}

		const restoreFocus = this.shouldRestoreFocus(sourceView.element);
		let movedView: IEditorGroupView;

		// Same groups view: move via grid widget API
		if (sourceView.groupsView === targetView.groupsView) {
			this.gridWidget.moveView(sourceView, this.getSplitSizingStyle(), targetView, this.toGridViewDirection(direction));
			movedView = sourceView;
		}

		// Different groups view: move via groups view API
		else {
			movedView = targetView.groupsView.addGroup(targetView, direction, sourceView);
			sourceView.closeAllEditors();
			this.removeGroup(sourceView, restoreFocus);
		}

		// Restore focus if we had it previously after completing the grid
		// operation. That operation might cause reparenting of grid views
		// which moves focus to the <body> element otherwise.
		if (restoreFocus) {
			movedView.focus();
		}

		// Event
		this._onDidMoveGroup.fire(movedView);

		// Notify group index change given a group was moved
		this.notifyGroupIndexChange();

		return movedView;
	}

	copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		const groupView = this.assertGroupView(group);
		const locationView = this.assertGroupView(location);

		const restoreFocus = this.shouldRestoreFocus(groupView.element);

		// Copy the group view
		const copiedGroupView = this.addGroup(locationView, direction, groupView);

		// Restore focus if we had it
		if (restoreFocus) {
			copiedGroupView.focus();
		}

		return copiedGroupView;
	}

	mergeGroup(group: IEditorGroupView | GroupIdentifier, target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): boolean {
		const sourceView = this.assertGroupView(group);
		const targetView = this.assertGroupView(target);

		// Collect editors to move/copy
		const editors: EditorInputWithOptions[] = [];
		let index = (options && typeof options.index === 'number') ? options.index : targetView.count;
		for (const editor of sourceView.editors) {
			const inactive = !sourceView.isActive(editor) || this._activeGroup !== sourceView;

			let actualIndex: number | undefined;
			if (targetView.contains(editor) &&
				(
					// Do not configure an `index` for editors that are sticky in
					// the target, otherwise there is a chance of losing that state
					// when the editor is moved.
					// See https://github.com/microsoft/vscode/issues/239549
					targetView.isSticky(editor) ||
					// Do not configure an `index` when we are explicitly instructed
					options?.preserveExistingIndex
				)
			) {
				// leave `index` as `undefined`
			} else {
				actualIndex = index;
				index++;
			}

			editors.push({
				editor,
				options: {
					index: actualIndex,
					inactive,
					preserveFocus: inactive
				}
			});
		}

		// Move/Copy editors over into target
		let result = true;
		if (options?.mode === MergeGroupMode.COPY_EDITORS) {
			sourceView.copyEditors(editors, targetView);
		} else {
			result = sourceView.moveEditors(editors, targetView);
		}

		// Remove source if the view is now empty and not already removed
		if (sourceView.isEmpty && !sourceView.disposed /* could have been disposed already via workbench.editor.closeEmptyGroups setting */) {
			this.removeGroup(sourceView, true);
		}

		return result;
	}

	mergeAllGroups(target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): boolean {
		const targetView = this.assertGroupView(target);

		let result = true;
		for (const group of this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			if (group === targetView) {
				continue; // keep target
			}

			const merged = this.mergeGroup(group, targetView, options);
			if (!merged) {
				result = false;
			}
		}

		return result;
	}

	protected assertGroupView(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		let groupView: IEditorGroupView | undefined;
		if (typeof group === 'number') {
			groupView = this.editorPartsView.getGroup(group);
		} else {
			groupView = group;
		}

		if (!groupView) {
			throw new Error('Invalid editor group provided!');
		}

		return groupView;
	}

	createEditorDropTarget(container: unknown, delegate: IEditorDropTargetDelegate): IDisposable {
		assertType(isHTMLElement(container));

		return this.scopedInstantiationService.createInstance(EditorDropTarget, container, delegate);
	}

	//#region Part

	// TODO @sbatten @joao find something better to prevent editor taking over #79897
	get minimumWidth(): number { return Math.min(this.centeredLayoutWidget.minimumWidth, this.layoutService.getMaximumEditorDimensions(this.layoutService.getContainer(getWindow(this.container))).width); }
	get maximumWidth(): number { return this.centeredLayoutWidget.maximumWidth; }
	get minimumHeight(): number { return Math.min(this.centeredLayoutWidget.minimumHeight, this.layoutService.getMaximumEditorDimensions(this.layoutService.getContainer(getWindow(this.container))).height); }
	get maximumHeight(): number { return this.centeredLayoutWidget.maximumHeight; }

	get snap(): boolean { return this.layoutService.getPanelAlignment() === 'center'; }

	override get onDidChange(): Event<IViewSize | undefined> { return Event.any(this.centeredLayoutWidget.onDidChange, this.onDidSetGridWidget.event); }
	readonly priority: LayoutPriority = LayoutPriority.High;

	private get gridSeparatorBorder(): Color {
		return this.theme.getColor(EDITOR_GROUP_BORDER) || this.theme.getColor(contrastBorder) || Color.transparent;
	}

	override updateStyles(): void {
		const container = assertIsDefined(this.container);
		container.style.backgroundColor = this.getColor(editorBackground) || '';

		const separatorBorderStyle = { separatorBorder: this.gridSeparatorBorder, background: this.theme.getColor(EDITOR_PANE_BACKGROUND) || Color.transparent };
		this.gridWidget.style(separatorBorderStyle);
		this.centeredLayoutWidget.styles(separatorBorderStyle);
	}

	protected override createContentArea(parent: HTMLElement, options?: IEditorPartCreationOptions): HTMLElement {

		// Container
		this.element = parent;
		this.container = document.createElement('div');
		this.container.classList.add('content');
		if (this.windowId !== mainWindow.vscodeWindowId) {
			this.container.classList.add('auxiliary');
		}
		parent.appendChild(this.container);

		// Scoped instantiation service
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));
		this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService]
		)));

		// Grid control
		this._willRestoreState = !options || options.restorePreviousState;
		this.doCreateGridControl();

		// Centered layout widget
		this.centeredLayoutWidget = this._register(new CenteredViewLayout(this.container, this.gridWidgetView, this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY], this._partOptions.centeredLayoutFixedWidth));
		this._register(this.onDidChangeEditorPartOptions(e => this.centeredLayoutWidget.setFixedWidth(e.newPartOptions.centeredLayoutFixedWidth ?? false)));

		// Drag & Drop support
		this.setupDragAndDropSupport(parent, this.container);

		// Context keys
		this.handleContextKeys(scopedContextKeyService);

		// Signal ready
		this.whenReadyPromise.complete();
		this._isReady = true;

		// Signal restored
		Promises.settled(this.groups.map(group => group.whenRestored)).finally(() => {
			this.whenRestoredPromise.complete();
		});

		return this.container;
	}

	private handleContextKeys(contextKeyService: IContextKeyService): void {
		const isAuxiliaryEditorPartContext = IsAuxiliaryEditorPartContext.bindTo(contextKeyService);
		isAuxiliaryEditorPartContext.set(this.windowId !== mainWindow.vscodeWindowId);

		const multipleEditorGroupsContext = EditorPartMultipleEditorGroupsContext.bindTo(contextKeyService);
		const maximizedEditorGroupContext = EditorPartMaximizedEditorGroupContext.bindTo(contextKeyService);

		const updateContextKeys = () => {
			const groupCount = this.count;
			if (groupCount > 1) {
				multipleEditorGroupsContext.set(true);
			} else {
				multipleEditorGroupsContext.reset();
			}

			if (this.hasMaximizedGroup()) {
				maximizedEditorGroupContext.set(true);
			} else {
				maximizedEditorGroupContext.reset();
			}
		};

		updateContextKeys();

		this._register(this.onDidAddGroup(() => updateContextKeys()));
		this._register(this.onDidRemoveGroup(() => updateContextKeys()));
		this._register(this.onDidChangeGroupMaximized(() => updateContextKeys()));
	}

	private setupDragAndDropSupport(parent: HTMLElement, container: HTMLElement): void {

		// Editor drop target
		this._register(this.createEditorDropTarget(container, Object.create(null)));

		// No drop in the editor
		const overlay = document.createElement('div');
		overlay.classList.add('drop-block-overlay');
		parent.appendChild(overlay);

		// Hide the block if a mouse down event occurs #99065
		this._register(addDisposableGenericMouseDownListener(overlay, () => overlay.classList.remove('visible')));

		this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.element, {
			onDragStart: e => overlay.classList.add('visible'),
			onDragEnd: e => overlay.classList.remove('visible')
		}));

		let horizontalOpenerTimeout: any;
		let verticalOpenerTimeout: any;
		let lastOpenHorizontalPosition: Position | undefined;
		let lastOpenVerticalPosition: Position | undefined;
		const openPartAtPosition = (position: Position) => {
			if (!this.layoutService.isVisible(Parts.PANEL_PART) && position === this.layoutService.getPanelPosition()) {
				this.layoutService.setPartHidden(false, Parts.PANEL_PART);
			} else if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART) && position === (this.layoutService.getSideBarPosition() === Position.RIGHT ? Position.LEFT : Position.RIGHT)) {
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}
		};

		const clearAllTimeouts = () => {
			if (horizontalOpenerTimeout) {
				clearTimeout(horizontalOpenerTimeout);
				horizontalOpenerTimeout = undefined;
			}

			if (verticalOpenerTimeout) {
				clearTimeout(verticalOpenerTimeout);
				verticalOpenerTimeout = undefined;
			}
		};

		this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(overlay, {
			onDragOver: e => {
				EventHelper.stop(e.eventData, true);
				if (e.eventData.dataTransfer) {
					e.eventData.dataTransfer.dropEffect = 'none';
				}

				const boundingRect = overlay.getBoundingClientRect();

				let openHorizontalPosition: Position | undefined = undefined;
				let openVerticalPosition: Position | undefined = undefined;
				const proximity = 100;
				if (e.eventData.clientX < boundingRect.left + proximity) {
					openHorizontalPosition = Position.LEFT;
				}

				if (e.eventData.clientX > boundingRect.right - proximity) {
					openHorizontalPosition = Position.RIGHT;
				}

				if (e.eventData.clientY > boundingRect.bottom - proximity) {
					openVerticalPosition = Position.BOTTOM;
				}

				if (e.eventData.clientY < boundingRect.top + proximity) {
					openVerticalPosition = Position.TOP;
				}

				if (horizontalOpenerTimeout && openHorizontalPosition !== lastOpenHorizontalPosition) {
					clearTimeout(horizontalOpenerTimeout);
					horizontalOpenerTimeout = undefined;
				}

				if (verticalOpenerTimeout && openVerticalPosition !== lastOpenVerticalPosition) {
					clearTimeout(verticalOpenerTimeout);
					verticalOpenerTimeout = undefined;
				}

				if (!horizontalOpenerTimeout && openHorizontalPosition !== undefined) {
					lastOpenHorizontalPosition = openHorizontalPosition;
					horizontalOpenerTimeout = setTimeout(() => openPartAtPosition(openHorizontalPosition), 200);
				}

				if (!verticalOpenerTimeout && openVerticalPosition !== undefined) {
					lastOpenVerticalPosition = openVerticalPosition;
					verticalOpenerTimeout = setTimeout(() => openPartAtPosition(openVerticalPosition), 200);
				}
			},
			onDragLeave: () => clearAllTimeouts(),
			onDragEnd: () => clearAllTimeouts(),
			onDrop: () => clearAllTimeouts()
		}));
	}

	centerLayout(active: boolean): void {
		this.centeredLayoutWidget.activate(active);
	}

	isLayoutCentered(): boolean {
		if (this.centeredLayoutWidget) {
			return this.centeredLayoutWidget.isActive();
		}

		return false;
	}

	private doCreateGridControl(): void {

		// Grid Widget (with previous UI state)
		let restoreError = false;
		if (this._willRestoreState) {
			restoreError = !this.doCreateGridControlWithPreviousState();
		}

		// Grid Widget (no previous UI state or failed to restore)
		if (!this.gridWidget || restoreError) {
			const initialGroup = this.doCreateGroupView();
			this.doSetGridWidget(new SerializableGrid(initialGroup));

			// Ensure a group is active
			this.doSetGroupActive(initialGroup);
		}

		// Update container
		this.updateContainer();

		// Notify group index change we created the entire grid
		this.notifyGroupIndexChange();
	}

	private doCreateGridControlWithPreviousState(): boolean {
		const state: IEditorPartUIState | undefined = this.loadState();
		if (state?.serializedGrid) {
			try {

				// MRU
				this.mostRecentActiveGroups = state.mostRecentActiveGroups;

				// Grid Widget
				this.doCreateGridControlWithState(state.serializedGrid, state.activeGroup);
			} catch (error) {

				// Log error
				onUnexpectedError(new Error(`Error restoring editor grid widget: ${error} (with state: ${JSON.stringify(state)})`));

				// Clear any state we have from the failing restore
				this.disposeGroups();

				return false; // failure
			}
		}

		return true; // success
	}

	private doCreateGridControlWithState(serializedGrid: ISerializedGrid, activeGroupId: GroupIdentifier, editorGroupViewsToReuse?: IEditorGroupView[], options?: IEditorGroupViewOptions): void {

		// Determine group views to reuse if any
		let reuseGroupViews: IEditorGroupView[];
		if (editorGroupViewsToReuse) {
			reuseGroupViews = editorGroupViewsToReuse.slice(0); // do not modify original array
		} else {
			reuseGroupViews = [];
		}

		// Create new
		const groupViews: IEditorGroupView[] = [];
		const gridWidget = SerializableGrid.deserialize(serializedGrid, {
			fromJSON: (serializedEditorGroup: ISerializedEditorGroupModel | null) => {
				let groupView: IEditorGroupView;
				if (reuseGroupViews.length > 0) {
					groupView = reuseGroupViews.shift()!;
				} else {
					groupView = this.doCreateGroupView(serializedEditorGroup, options);
				}

				groupViews.push(groupView);

				if (groupView.id === activeGroupId) {
					this.doSetGroupActive(groupView);
				}

				return groupView;
			}
		}, { styles: { separatorBorder: this.gridSeparatorBorder } });

		// If the active group was not found when restoring the grid
		// make sure to make at least one group active. We always need
		// an active group.
		if (!this._activeGroup) {
			this.doSetGroupActive(groupViews[0]);
		}

		// Validate MRU group views matches grid widget state
		if (this.mostRecentActiveGroups.some(groupId => !this.getGroup(groupId))) {
			this.mostRecentActiveGroups = groupViews.map(group => group.id);
		}

		// Set it
		this.doSetGridWidget(gridWidget);
	}

	private doSetGridWidget(gridWidget: SerializableGrid<IEditorGroupView>): void {
		let boundarySashes: IBoundarySashes = {};

		if (this.gridWidget) {
			boundarySashes = this.gridWidget.boundarySashes;
			this.gridWidget.dispose();
		}

		this.gridWidget = gridWidget;
		this.gridWidget.boundarySashes = boundarySashes;
		this.gridWidgetView.gridWidget = gridWidget;

		this._onDidChangeSizeConstraints.input = gridWidget.onDidChange;
		this._onDidScroll.input = gridWidget.onDidScroll;
		this.gridWidgetDisposables.clear();
		this.gridWidgetDisposables.add(gridWidget.onDidChangeViewMaximized(maximized => this._onDidChangeGroupMaximized.fire(maximized)));

		this.onDidSetGridWidget.fire(undefined);
	}

	private updateContainer(): void {
		const container = assertIsDefined(this.container);
		container.classList.toggle('empty', this.isEmpty);
	}

	private notifyGroupIndexChange(): void {
		this.getGroups(GroupsOrder.GRID_APPEARANCE).forEach((group, index) => group.notifyIndexChanged(index));
	}

	notifyGroupsLabelChange(newLabel: string) {
		for (const group of this.groups) {
			group.notifyLabelChanged(newLabel);
		}
	}

	private get isEmpty(): boolean {
		return this.count === 1 && this._activeGroup.isEmpty;
	}

	setBoundarySashes(sashes: IBoundarySashes): void {
		this.gridWidget.boundarySashes = sashes;
		this.centeredLayoutWidget.boundarySashes = sashes;
	}

	override layout(width: number, height: number, top: number, left: number): void {
		this.top = top;
		this.left = left;

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout editor container
		this.doLayout(Dimension.lift(contentAreaSize), top, left);
	}

	private doLayout(dimension: Dimension, top = this.top, left = this.left): void {
		this._contentDimension = dimension;

		// Layout Grid
		this.centeredLayoutWidget.layout(this._contentDimension.width, this._contentDimension.height, top, left);

		// Event
		this._onDidLayout.fire(dimension);
	}

	protected override saveState(): void {

		// Persist grid UI state
		if (this.gridWidget) {
			if (this.isEmpty) {
				delete this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
			} else {
				this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY] = this.createState();
			}
		}

		// Persist centered view state
		if (this.centeredLayoutWidget) {
			const centeredLayoutState = this.centeredLayoutWidget.state;
			if (this.centeredLayoutWidget.isDefault(centeredLayoutState)) {
				delete this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY];
			} else {
				this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY] = centeredLayoutState;
			}
		}

		super.saveState();
	}

	protected loadState(): IEditorPartUIState | undefined {
		return this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
	}

	createState(): IEditorPartUIState {
		return {
			serializedGrid: this.gridWidget.serialize(),
			activeGroup: this._activeGroup.id,
			mostRecentActiveGroups: this.mostRecentActiveGroups
		};
	}

	applyState(state: IEditorPartUIState | 'empty', options?: IEditorGroupViewOptions): Promise<void> {
		if (state === 'empty') {
			return this.doApplyEmptyState();
		} else {
			return this.doApplyState(state, options);
		}
	}

	private async doApplyState(state: IEditorPartUIState, options?: IEditorGroupViewOptions): Promise<void> {
		const groups = await this.doPrepareApplyState();

		// Pause add/remove events for groups during the duration of applying the state
		// This ensures that we can do this transition atomically with the new state
		// being ready when the events are fired. This is important because usually there
		// is never the state where no groups are present, but for this transition we
		// need to temporarily dispose all groups to restore the new set.

		this._onDidAddGroup.pause();
		this._onDidRemoveGroup.pause();

		this.disposeGroups();

		// MRU
		this.mostRecentActiveGroups = state.mostRecentActiveGroups;

		// Grid Widget
		try {
			this.doApplyGridState(state.serializedGrid, state.activeGroup, undefined, options);
		} finally {
			// It is very important to keep this order: first resume the events for
			// removed groups and then for added groups. Many listeners may store
			// groups in sets by their identifier and groups can have the same
			// identifier before and after.
			this._onDidRemoveGroup.resume();
			this._onDidAddGroup.resume();
		}

		// Restore editors that were not closed before and are now opened now
		await this.activeGroup.openEditors(
			groups
				.flatMap(group => group.editors)
				.filter(editor => this.editorPartsView.groups.every(groupView => !groupView.contains(editor)))
				.map(editor => ({
					editor, options: { pinned: true, preserveFocus: true, inactive: true }
				}))
		);
	}

	private async doApplyEmptyState(): Promise<void> {
		await this.doPrepareApplyState();

		this.mergeAllGroups(this.activeGroup);
	}

	private async doPrepareApplyState(): Promise<IEditorGroupView[]> {

		// Before disposing groups, try to close as many editors as
		// possible, but skip over those that would trigger a dialog
		// (for example when being dirty). This is to be able to later
		// restore these editors after state has been applied.

		const groups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		for (const group of groups) {
			await group.closeAllEditors({ excludeConfirming: true });
		}

		return groups;
	}

	private doApplyGridState(gridState: ISerializedGrid, activeGroupId: GroupIdentifier, editorGroupViewsToReuse?: IEditorGroupView[], options?: IEditorGroupViewOptions): void {

		// Recreate grid widget from state
		this.doCreateGridControlWithState(gridState, activeGroupId, editorGroupViewsToReuse, options);

		// Layout
		this.doLayout(this._contentDimension);

		// Update container
		this.updateContainer();

		// Events for groups that got added
		for (const groupView of this.getGroups(GroupsOrder.GRID_APPEARANCE)) {
			if (!editorGroupViewsToReuse?.includes(groupView)) {
				this._onDidAddGroup.fire(groupView);
			}
		}

		// Notify group index change given layout has changed
		this.notifyGroupIndexChange();
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

	toJSON(): object {
		return {
			type: Parts.EDITOR_PART
		};
	}

	private disposeGroups(): void {
		for (const group of this.groups) {
			group.dispose();

			this._onDidRemoveGroup.fire(group);
		}

		this.groupViews.clear();
		this.mostRecentActiveGroups = [];
	}

	override dispose(): void {

		// Event
		this._onWillDispose.fire();

		// Forward to all groups
		this.disposeGroups();

		// Grid widget
		this.gridWidget?.dispose();

		super.dispose();
	}

	//#endregion
}

export class MainEditorPart extends EditorPart {

	constructor(
		editorPartsView: IEditorPartsView,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editorPartsView, Parts.EDITOR_PART, '', mainWindow.vscodeWindowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
	}
}

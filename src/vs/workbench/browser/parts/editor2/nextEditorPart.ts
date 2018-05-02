/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorpart';
import 'vs/workbench/browser/parts/editor2/editor2.contribution';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { Dimension, addClass, isAncestor } from 'vs/base/browser/dom';
import { Event, Emitter, once } from 'vs/base/common/event';
import { editorBackground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { INextEditorGroupsService, Direction, IAddGroupOptions } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SplitGridView, Direction as GridViewDirection } from 'vs/base/browser/ui/grid/gridview';
import { NextEditorGroupView, IGroupsAccessor } from 'vs/workbench/browser/parts/editor2/nextEditorGroupView';
import { GroupIdentifier, EditorOptions } from 'vs/workbench/common/editor';
import { values } from 'vs/base/common/map';
import { EDITOR_GROUP_BORDER } from 'vs/workbench/common/theme';

// TODO@grid provide DND support of groups/editors:
// - editor: move/copy to existing group, move/copy to new split group (up, down, left, right)
// - group: move/copy to existing group (merges?), move/copy to new split group (up, down, left, right)

// TODO@grid enable centered editor layout if one group is visible and centered editor layout is enabled (IPartService#isEditorLayoutCentered(), should this move here?)

// TODO@grid enable double click on sash to even out widths in one dimension

// TODO@grid enable minimized/maximized groups in one dimension

export class NextEditorPart extends Part implements INextEditorGroupsService {

	_serviceBrand: any;

	//#region Events

	private _onDidLayout: Emitter<Dimension> = this._register(new Emitter<Dimension>());
	get onDidLayout(): Event<Dimension> { return this._onDidLayout.event; }

	private _onDidActiveGroupChange: Emitter<NextEditorGroupView> = this._register(new Emitter<NextEditorGroupView>());
	get onDidActiveGroupChange(): Event<NextEditorGroupView> { return this._onDidActiveGroupChange.event; }

	//#endregion

	private dimension: Dimension;

	private _activeGroup: NextEditorGroupView;
	private groupViews: Map<GroupIdentifier, NextEditorGroupView> = new Map<GroupIdentifier, NextEditorGroupView>();
	private mostRecentActive: GroupIdentifier[] = [];

	private gridContainer: HTMLElement;
	private gridWidget: SplitGridView<NextEditorGroupView>;

	constructor(
		id: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(id, { hasTitle: false }, themeService);

		this.doCreateGridView();
	}

	//#region INextEditorGroupsService

	get activeGroup(): NextEditorGroupView {
		return this._activeGroup;
	}

	get groups(): NextEditorGroupView[] {
		return values(this.groupViews);
	}

	getGroup(identifier: GroupIdentifier): NextEditorGroupView {
		return this.groupViews.get(identifier);
	}

	activateGroup(group: NextEditorGroupView | GroupIdentifier): NextEditorGroupView {
		const groupView = this.asGroupView(group);
		if (groupView) {
			this.doSetGroupActive(groupView);
		}

		return groupView;
	}

	focusGroup(group: NextEditorGroupView | GroupIdentifier): NextEditorGroupView {
		const groupView = this.asGroupView(group);
		if (groupView) {
			groupView.focus();
		}

		return groupView;
	}

	addGroup(fromGroup: NextEditorGroupView | GroupIdentifier, direction: Direction, options: IAddGroupOptions = Object.create(null)): NextEditorGroupView {
		const { copyGroup, copyEditor } = options;

		const fromGroupView = this.asGroupView(fromGroup);
		const newGroupView = this.doCreateGroupView(copyGroup ? fromGroupView : void 0);

		// Add to grid widget
		this.gridWidget.splitView(
			fromGroupView,
			this.toGridViewDirection(direction),
			newGroupView,
			direction === Direction.DOWN ? fromGroupView.dimension.height / 2 : fromGroupView.dimension.width / 2 /* TODO@grid what size? */
		);

		// Check for options
		const activeEditor = fromGroupView.activeEditor;
		if ((copyGroup || copyEditor) && activeEditor) {
			let options: EditorOptions;
			if (copyGroup) {
				options = EditorOptions.create({ pinned: fromGroupView.isPinned(activeEditor) }); // copy group preserves all pinned state
			} else {
				options = EditorOptions.create({ pinned: true }); // copy of single editor is a sign of importance, so pin it
			}

			newGroupView.openEditor(activeEditor, options);
		}

		return newGroupView;
	}

	removeGroup(group: NextEditorGroupView | GroupIdentifier): void {
		const groupView = this.asGroupView(group);
		if (
			!groupView ||
			this.groupViews.size === 1 ||	// Cannot remove the last root group
			!groupView.isEmpty()			// TODO@grid what about removing a group with editors, move them to other group?
		) {
			return;
		}

		const hasFocus = isAncestor(document.activeElement, groupView.element);

		// Remove from grid widget & dispose
		this.gridWidget.removeView(groupView);
		groupView.dispose();

		// Remove as active group if it was
		if (this._activeGroup === groupView) {
			this._activeGroup = void 0;
		}

		// Activate next group if the removed one was active
		if (!this._activeGroup) {
			const nextActiveGroup = this.asGroupView(this.mostRecentActive[this.mostRecentActive.length - 1]);
			this.activateGroup(nextActiveGroup);

			// Restore focus if we had it previously
			if (hasFocus) {
				nextActiveGroup.focus();
			}
		}
	}

	private toGridViewDirection(direction: Direction): GridViewDirection {
		switch (direction) {
			case Direction.UP: return GridViewDirection.Up;
			case Direction.DOWN: return GridViewDirection.Down;
			case Direction.LEFT: return GridViewDirection.Left;
			case Direction.RIGHT: return GridViewDirection.Right;
		}
	}

	private asGroupView(group: NextEditorGroupView | GroupIdentifier): NextEditorGroupView {
		if (typeof group === 'number') {
			return this.getGroup(group);
		}

		return group;
	}

	private doCreateGridView(): void {

		// Container
		this.gridContainer = document.createElement('div');
		addClass(this.gridContainer, 'content');

		// Grid widget
		const initialGroup = this.doCreateGroupView();
		this.gridWidget = this._register(new SplitGridView(this.gridContainer, initialGroup)); // TODO@grid restore UI state

		// Set group active
		this.doSetGroupActive(initialGroup);
	}

	private doSetGroupActive(group: NextEditorGroupView): void {
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

		// TODO@grid if this part emits a active editor change event, it also needs to fire now

		// TODO@grid if the group is minimized, it should now restore to be maximized
	}

	private doUpdateMostRecentActive(group: NextEditorGroupView, makeMostRecentlyActive?: boolean): void {
		const index = this.mostRecentActive.indexOf(group.id);
		if (index !== -1) {
			this.mostRecentActive.splice(index, 1);
		}

		if (makeMostRecentlyActive) {
			this.mostRecentActive.push(group.id);
		}
	}

	private doCreateGroupView(sourceView?: NextEditorGroupView): NextEditorGroupView {
		const groupView = this.instantiationService.createInstance(NextEditorGroupView, sourceView, { getGroups: () => this.groups } as IGroupsAccessor);

		// Keep in map
		this.groupViews.set(groupView.id, groupView);

		// Track focus
		const focusListener = groupView.onDidFocus(() => {
			this.doSetGroupActive(groupView);
		});

		// Track dispose
		once(groupView.onWillDispose)(() => {
			focusListener.dispose();
			this.groupViews.delete(groupView.id);
			this.doUpdateMostRecentActive(groupView);
		});

		// TODO@grid if the view gets minimized, the previous active group should become active

		return groupView;
	}

	//#endregion

	//#region Part

	protected updateStyles(): void {

		// Part container
		const container = this.getContainer();
		container.style.backgroundColor = this.getColor(editorBackground);
	}

	createContentArea(parent: HTMLElement): HTMLElement {
		const contentArea = this.gridContainer;

		// Connect parent to viewer
		parent.appendChild(contentArea);

		return contentArea;
	}

	layout(dimension: Dimension): Dimension[] {
		const sizes = super.layout(dimension);

		this.dimension = sizes[1];

		// Layout Grid
		this.gridWidget.layout(this.dimension.width, this.dimension.height);

		// Event
		this._onDidLayout.fire(dimension);

		return sizes;
	}

	shutdown(): void {

		// TODO@grid persist some UI state in the memento (note: a group can turn empty if none of the inputs can be serialized!)

		// Forward to all groups
		this.groupViews.forEach(group => group.shutdown());

		super.shutdown();
	}

	dispose(): void {

		// Forward to all groups
		this.groupViews.forEach(group => group.dispose());
		this.groupViews.clear();

		super.dispose();
	}

	//#endregion
}

// Group borders (TODO@grid this should be a color the GridView exposes)
registerThemingParticipant((theme, collector) => {
	const groupBorderColor = theme.getColor(EDITOR_GROUP_BORDER) || theme.getColor(contrastBorder);
	if (groupBorderColor) {
		collector.addRule(`
			.monaco-workbench > .part.editor > .content .split-view-view {
				position: relative;
			}

			.monaco-workbench > .part.editor > .content .monaco-grid-view .monaco-split-view2 > .split-view-container > .split-view-view:not(:first-child)::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				z-index: 100;
				pointer-events: none;
				background: ${groupBorderColor}
			}

			.monaco-workbench > .part.editor > .content .monaco-grid-view .monaco-split-view2.horizontal > .split-view-container>.split-view-view:not(:first-child)::before {
				height: 100%;
				width: 1px;
			}

			.monaco-workbench > .part.editor > .content .monaco-grid-view .monaco-split-view2.vertical > .split-view-container > .split-view-view:not(:first-child)::before {
				height: 1px;
				width: 100%;
			}
		`);
	}
});
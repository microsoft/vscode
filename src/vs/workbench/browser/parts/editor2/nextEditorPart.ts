/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorpart';
import 'vs/workbench/browser/parts/editor2/editor2.contribution';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { Event, Emitter, once } from 'vs/base/common/event';
import { editorBackground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { INextEditorGroupsService, Direction } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SplitGridView, Direction as GridViewDirection } from 'vs/base/browser/ui/grid/gridview';
import { NextEditorGroupView } from 'vs/workbench/browser/parts/editor2/nextEditorGroupView';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { values } from 'vs/base/common/map';
import { EDITOR_GROUP_BORDER } from 'vs/workbench/common/theme';

export class NextEditorPart extends Part implements INextEditorGroupsService {

	_serviceBrand: any;

	private _onDidLayout: Emitter<Dimension> = this._register(new Emitter<Dimension>());
	private _onDidActiveGroupChange: Emitter<NextEditorGroupView> = this._register(new Emitter<NextEditorGroupView>());

	private dimension: Dimension;

	private _activeGroup: NextEditorGroupView;
	private _groups: Map<GroupIdentifier, NextEditorGroupView> = new Map<GroupIdentifier, NextEditorGroupView>();

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

	//#region INextEditorGroupsService Implementation

	get onDidActiveGroupChange(): Event<NextEditorGroupView> {
		return this._onDidActiveGroupChange.event;
	}

	get activeGroup(): NextEditorGroupView {
		return this._activeGroup;
	}

	get groups(): NextEditorGroupView[] {
		return values(this._groups);
	}

	getGroup(identifier: GroupIdentifier): NextEditorGroupView {
		return this._groups.get(identifier);
	}

	isGroupActive(group: NextEditorGroupView | GroupIdentifier): boolean {
		return this._activeGroup && this._activeGroup === this.asGroupView(group);
	}

	setGroupActive(group: NextEditorGroupView | GroupIdentifier): NextEditorGroupView {
		const groupView = this.asGroupView(group);
		if (groupView) {
			this.doSetGroupActive(groupView);
		}

		return groupView;
	}

	addGroup(fromGroup: NextEditorGroupView | GroupIdentifier, direction: Direction): NextEditorGroupView {
		const groupView = this.doCreateGroupView();

		this.gridWidget.splitView(
			this.asGroupView(fromGroup),
			this.toGridViewDirection(direction),
			groupView, direction === Direction.DOWN ? this.dimension.height / 2 : this.dimension.width / 2 /* TODO@grid what size? */
		);

		return groupView;
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
		this.gridWidget = this._register(new SplitGridView(this.gridContainer, initialGroup));

		// Set group active
		this.doSetGroupActive(initialGroup);
	}

	private doSetGroupActive(group: NextEditorGroupView): void {
		if (this._activeGroup === group) {
			return; // return if this is already the active group
		}

		const previousActiveGroup = this._activeGroup;
		this._activeGroup = group;

		// Mark previous one as inactive
		if (previousActiveGroup) {
			previousActiveGroup.setActive(false);
		}

		// Mark group as new active
		group.setActive(true);

		// Event
		this._onDidActiveGroupChange.fire(group);
	}

	private doCreateGroupView(): NextEditorGroupView {
		const groupView = this.instantiationService.createInstance(NextEditorGroupView);

		// Keep in map
		this._groups.set(groupView.id, groupView);

		// Track focus
		const focusListener = groupView.onDidFocus(() => {
			this.doSetGroupActive(groupView);
		});

		// Track dispose
		once(groupView.onWillDispose)(() => {
			focusListener.dispose();
			this._groups.delete(groupView.id);
		});

		return groupView;
	}

	//#endregion

	//#region Part Implementation

	get onDidLayout(): Event<Dimension> {
		return this._onDidLayout.event;
	}

	protected updateStyles(): void {
		super.updateStyles();

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

		// Forward to all groups
		this._groups.forEach(group => group.shutdown());

		super.shutdown();
	}

	dispose(): void {

		// Forward to all groups
		this._groups.forEach(group => group.dispose());
		this._groups.clear();

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
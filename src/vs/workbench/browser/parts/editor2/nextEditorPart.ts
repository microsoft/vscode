/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorpart';
import 'vs/workbench/browser/parts/editor2/editor2.contribution';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { INextEditorGroupsService, INextEditorGroup, SplitDirection } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { GridView } from 'vs/base/browser/ui/grid/gridview';
import { NextEditorGroupView } from 'vs/workbench/browser/parts/editor2/nextEditorGroupView';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { values } from 'vs/base/common/map';

export class NextEditorPart extends Part implements INextEditorGroupsService {

	_serviceBrand: any;

	private readonly _onLayout: Emitter<Dimension>;

	private dimension: Dimension;

	private _activeGroup: NextEditorGroupView;
	private _groups: Map<GroupIdentifier, NextEditorGroupView> = new Map<GroupIdentifier, NextEditorGroupView>();

	// TODO@grid temporary until GridView can provide this
	private groupToLocation: Map<GroupIdentifier, number[]> = new Map<GroupIdentifier, number[]>();

	private grid: GridView<NextEditorGroupView>;
	private gridContainer: HTMLElement;

	constructor(
		id: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(id, { hasTitle: false }, themeService);

		this._onLayout = this._register(new Emitter<Dimension>());

		this.doCreateGridView();
	}

	//#region Service Implementation

	get activeGroup(): INextEditorGroup {
		return this._activeGroup;
	}

	get groups(): INextEditorGroup[] {
		return values(this._groups);
	}

	getGroup(identifier: GroupIdentifier): INextEditorGroup {
		return this._groups.get(identifier);
	}

	addGroup(fromGroup: INextEditorGroup, direction: SplitDirection): INextEditorGroup {
		const fromGroupLocation = this.groupToLocation.get(fromGroup.id);

		// TODO@grid properly compute the right location based on the "fromGroup" and "direction"
		// arguments by finding out the current direction at the location from where to add a group to
		return this.doCreateGroup([
			...fromGroupLocation.slice(0, fromGroupLocation.length - 1), 	// parent location
			fromGroupLocation[fromGroupLocation.length - 1] + 1				// just append after last view for now
		]);

		// TODO@grid once 2 groups exist, set the orientation on the GridView so that we have an
		// initial orientation for the entire grid
	}

	private doCreateGroup(location: number[]): NextEditorGroupView {
		const groupView = this.instantiationService.createInstance(NextEditorGroupView);
		this.grid.addView(groupView, null /* TODO@grid what size? */, location);

		this._groups.set(groupView.id, groupView);
		this.groupToLocation.set(groupView.id, location);

		return groupView;
	}

	//#endregion

	//#region Part Implementation

	get onLayout(): Event<Dimension> {
		return this._onLayout.event;
	}

	private doCreateGridView(): void {

		// Container
		this.gridContainer = document.createElement('div');
		addClass(this.gridContainer, 'content');

		// Widget
		this.grid = this._register(new GridView<NextEditorGroupView>(this.gridContainer));

		// Initial View
		this._activeGroup = this.doCreateGroup([0]);
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
		this.grid.layout(this.dimension.width, this.dimension.height);

		// Event
		this._onLayout.fire(dimension);

		return sizes;
	}

	//#endregion
}
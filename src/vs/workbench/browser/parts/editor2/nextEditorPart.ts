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
import { INextEditorPartService, INextEditorGroup, SplitDirection, INextEditor } from 'vs/workbench/services/editor/common/nextEditorPartService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { GridView } from 'vs/base/browser/ui/grid/gridview';
import { NextEditorGroupView } from 'vs/workbench/browser/parts/editor2/nextEditorGroupView';
import { GroupIdentifier, EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { values } from 'vs/base/common/map';

export class NextEditorPart extends Part implements INextEditorPartService {

	_serviceBrand: any;

	private readonly _onLayout: Emitter<Dimension>;

	private dimension: Dimension;

	private _activeGroup: NextEditorGroup;
	private _groups: Map<GroupIdentifier, NextEditorGroup> = new Map<GroupIdentifier, NextEditorGroup>();

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

		this.createGrid();
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

	//#endregion

	//#region Grid Controller

	splitGroup(group: GroupIdentifier, direction: SplitDirection): INextEditorGroup {
		const groupController = this.getGroup(group);
		const groupLocation = this.groupToLocation.get(groupController.id);

		// TODO@grid respect direction
		return this.doCreateGroup(groupLocation);
	}

	private doCreateGroup(location: number[]): NextEditorGroup {

		// View
		const groupView = this.instantiationService.createInstance(NextEditorGroupView);
		this.grid.addView(groupView, null /* TODO@grid what size? */, location);

		// Controller
		const groupController = new NextEditorGroup(this, groupView);
		this._groups.set(groupView.id, groupController);

		this.groupToLocation.set(groupController.id, location);

		return groupController;
	}

	//#endregion

	//#region Part Implementation

	get onLayout(): Event<Dimension> {
		return this._onLayout.event;
	}

	private createGrid(): void {

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

export class NextEditorGroup implements INextEditorGroup {

	constructor(
		private controller: NextEditorPart,
		private _view: NextEditorGroupView
	) { }

	get id(): GroupIdentifier {
		return this._view.id;
	}

	get view(): NextEditorGroupView {
		return this._view;
	}

	openEditor(input: EditorInput, options?: EditorOptions): INextEditor {
		return this._view.openEditor(input, options);
	}

	splitGroup(direction: SplitDirection): INextEditorGroup {
		return this.controller.splitGroup(this.id, direction);
	}
}
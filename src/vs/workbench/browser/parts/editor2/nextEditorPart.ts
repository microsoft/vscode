/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorpart';
import 'vs/workbench/browser/parts/editor2/editor2.contribution';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { Dimension, addClass, createCSSRule } from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join } from 'vs/base/common/paths';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { INextEditorPartService } from 'vs/workbench/services/editor/common/nextEditorPartService';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { NextEditorsViewer, GridOrientation } from 'vs/workbench/browser/parts/editor2/nextEditorsViewer';
// import { IStorageService } from 'vs/platform/storage/common/storage';

export class NextEditorPart extends Part implements INextEditorPartService {

	public _serviceBrand: any;

	private readonly _onLayout: Emitter<Dimension>;

	// private dimension: Dimension;
	// private memento: object;

	private viewer: NextEditorsViewer;

	constructor(
		id: string,
		@IEnvironmentService private environmentService: IEnvironmentService,
		// @IStorageService private storageService: IStorageService,
		@IThemeService themeService: IThemeService
	) {
		super(id, { hasTitle: false }, themeService);

		this._onLayout = new Emitter<Dimension>();

		// this.memento = this.getMemento(this.storageService, Scope.WORKSPACE);

		this.viewer = new NextEditorsViewer();

		this.initStyles();
	}

	public openEditor(input: EditorInput, options?: EditorOptions): TPromise<void> {

		// TODO@grid arguments validation
		// TODO@grid editor opening event and prevention
		// TODO@grid support options

		// TODO@grid delegate the management of instantiated ("live"?) editors into a helper class
		// that associates editors to a group id. editors should get disposed once a group closes

		// Flow
		// - editors viewer is the main grid control that owns EditorGroups and GridViews to add HTML into (this enables empty groups too!)
		// - a helper class manages instantiation/lifecycle of ("live") editors (maybe also the title control? maybe all UI associated to show a group?)
		// - how does the input gets opened in the editor group? is it 2 calls, one for editorgroup and one for showing it as HTML?
		// - ^ is a bit fishy, would be nice to have this all combined somehow?
		// - idea: have a EditorGroupView helper that is the thing added into a GridView and it also has a openEditor method which sets
		//   the editor to the editor group as well as renders the UI pieces

		const group = this.viewer.split([], GridOrientation.HORIZONTAL);

		return TPromise.as(void 0);
	}

	private initStyles(): void {

		// Letterpress Background when Empty
		createCSSRule('.vs .monaco-workbench > .part.editor.empty', `background-image: url('${join(this.environmentService.appRoot, 'resources/letterpress.svg')}')`);
		createCSSRule('.vs-dark .monaco-workbench > .part.editor.empty', `background-image: url('${join(this.environmentService.appRoot, 'resources/letterpress-dark.svg')}')`);
		createCSSRule('.hc-black .monaco-workbench > .part.editor.empty', `background-image: url('${join(this.environmentService.appRoot, 'resources/letterpress-hc.svg')}')`);
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();
		container.style.backgroundColor = this.getColor(editorBackground);

		// TODO@grid set editor group color depending on group size

		// Content area
		// const content = this.getContentArea();

		// const groupCount = this.stacks.groups.length;
		// if (groupCount > 1) {
		// 	addClass(content, 'multiple-groups');
		// } else {
		// 	removeClass(content, 'multiple-groups');
		// }

		// content.style.backgroundColor = groupCount > 0 ? this.getColor(EDITOR_GROUP_BACKGROUND) : null;
	}

	public get onLayout(): Event<Dimension> {
		return this._onLayout.event;
	}

	public createContentArea(parent: HTMLElement): HTMLElement {

		// Container
		const contentArea = document.createElement('div');
		addClass(contentArea, 'content');
		parent.appendChild(contentArea);

		// Viewer
		contentArea.appendChild(this.viewer.element);

		return contentArea;
	}

	public layout(dimension: Dimension): Dimension[] {
		const sizes = super.layout(dimension);

		// this.dimension = sizes[1];

		// TODO@grid propagate layout

		this._onLayout.fire(dimension);

		return sizes;
	}

	public shutdown(): void {

		// TODO@grid shutdown
		// - persist part view state
		// - pass on to instantiated editors

		super.shutdown();
	}

	public dispose(): void {

		// Emitters
		this._onLayout.dispose();

		// TODO@grid dispose
		// - all visible and instantiated editors
		// - tokens for opening

		super.dispose();
	}
}
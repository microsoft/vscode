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
import { NextEditorGroupsViewer, EditorGroupsOrientation } from 'vs/workbench/browser/parts/editor2/nextEditorGroupsViewer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class NextEditorPart extends Part implements INextEditorPartService {

	_serviceBrand: any;

	private readonly _onLayout: Emitter<Dimension>;

	// private dimension: Dimension;
	// private memento: object;

	private viewer: NextEditorGroupsViewer;

	constructor(
		id: string,
		@IEnvironmentService private environmentService: IEnvironmentService,
		// @IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(id, { hasTitle: false }, themeService);

		this._onLayout = new Emitter<Dimension>();

		// this.memento = this.getMemento(this.storageService, Scope.WORKSPACE);

		this.viewer = this.instantiationService.createInstance(NextEditorGroupsViewer);

		this.initStyles();
	}

	openEditor(input: EditorInput, options?: EditorOptions): TPromise<void> {

		// TODO@grid arguments validation
		// TODO@grid editor opening event and prevention
		// TODO@grid support options

		let editorGroup = this.viewer.groupAt([0]);
		if (!editorGroup) {
			editorGroup = this.viewer.split([], EditorGroupsOrientation.HORIZONTAL);
		}

		editorGroup.openEditor(input, options);

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

	get onLayout(): Event<Dimension> {
		return this._onLayout.event;
	}

	createContentArea(parent: HTMLElement): HTMLElement {

		// Container
		const contentArea = document.createElement('div');
		addClass(contentArea, 'content');
		parent.appendChild(contentArea);

		// Viewer
		contentArea.appendChild(this.viewer.element);

		return contentArea;
	}

	layout(dimension: Dimension): Dimension[] {
		const sizes = super.layout(dimension);

		// this.dimension = sizes[1];

		// TODO@grid propagate layout

		this._onLayout.fire(dimension);

		return sizes;
	}

	shutdown(): void {

		// TODO@grid shutdown
		// - persist part view state
		// - pass on to instantiated editors

		super.shutdown();
	}

	dispose(): void {

		// Emitters
		this._onLayout.dispose();

		// TODO@grid dispose
		// - all visible and instantiated editors
		// - tokens for opening

		super.dispose();
	}
}
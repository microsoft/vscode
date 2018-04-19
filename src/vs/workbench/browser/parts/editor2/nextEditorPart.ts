/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorpart';
import 'vs/workbench/browser/parts/editor/editor.contribution';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { Dimension, addClass, createCSSRule } from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { INextWorkbenchEditorService } from 'vs/workbench/services/editor/common/nextEditorService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join } from 'vs/base/common/paths';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { INextEditorPartService } from 'vs/workbench/services/editor/common/nextEditorPartService';

export class NextEditorPart extends Part implements INextWorkbenchEditorService, INextEditorPartService {

	public _serviceBrand: any;

	private readonly _onLayout: Emitter<Dimension>;

	// private dimension: Dimension;

	constructor(
		id: string,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IThemeService themeService: IThemeService
	) {
		super(id, { hasTitle: false }, themeService);

		this._onLayout = new Emitter<Dimension>();

		this.initStyles();
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

		// TODO@next set editor group color depending on group size

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
		const contentArea = document.createElement('div');
		addClass(contentArea, 'content');
		parent.appendChild(contentArea);

		return contentArea;
	}

	public layout(dimension: Dimension): Dimension[] {
		const sizes = super.layout(dimension);

		// this.dimension = sizes[1];

		// TODO@next propagate layout

		this._onLayout.fire(dimension);

		return sizes;
	}

	public dispose(): void {

		// Emitters
		this._onLayout.dispose();

		// TODO@next dispose
		// - all visible and instantiated editors
		// - tokens for opening

		super.dispose();
	}
}
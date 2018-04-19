/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/editor/editor.contribution';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Part } from 'vs/workbench/browser/part';
import { INextEditorGroupService } from 'vs/workbench/services/group/common/nextGroupService';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { INextWorkbenchEditorService } from 'vs/workbench/services/editor/common/nextEditorService';

export class NextEditorPart extends Part implements INextWorkbenchEditorService, INextEditorGroupService {

	public _serviceBrand: any;

	private readonly _onLayout: Emitter<Dimension>;

	// private dimension: Dimension;

	constructor(
		id: string,
		@IThemeService themeService: IThemeService
	) {
		super(id, { hasTitle: false }, themeService);

		this._onLayout = new Emitter<Dimension>();
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

	protected updateStyles(): void {
		super.updateStyles();

		// TODO@next update styles
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
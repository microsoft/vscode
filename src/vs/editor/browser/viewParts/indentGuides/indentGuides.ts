/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./indentGuides';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {DynamicViewOverlay} from 'vs/editor/browser/view/dynamicViewOverlay';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {IRenderingContext} from 'vs/editor/common/view/renderingContext';

export class IndentGuidesOverlay extends DynamicViewOverlay {

	private _context:ViewContext;
	private _lineHeight: number;
	private _spaceWidth: number;
	private _renderResult: string[];
	private _enabled: boolean;

	constructor(context:ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		this._enabled = this._context.configuration.editor.viewInfo.renderIndentGuides;
		this._renderResult = null;

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._renderResult = null;
	}

	// --- begin event handlers
	public onModelFlushed(): boolean {
		return true;
	}
	public onModelLinesDeleted(e:editorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLineChanged(e:editorCommon.IViewLineChangedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.fontInfo) {
			this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		}
		if (e.viewInfo.renderIndentGuides) {
			this._enabled = this._context.configuration.editor.viewInfo.renderIndentGuides;
		}
		return true;
	}
	public onLayoutChanged(layoutInfo:editorCommon.EditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.scrollTopChanged;// || e.scrollWidthChanged;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx:IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

		if (!this._enabled) {
			this._renderResult = null;
			return;
		}

		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		const tabSize = this._context.model.getTabSize();
		const tabWidth = tabSize * this._spaceWidth;
		const lineHeight = this._lineHeight;

		let output:string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;
			let indent = this._context.model.getLineIndentGuide(lineNumber);

			let result = '';
			let left = 0;
			for (let i = 0; i < indent; i++) {
				result += `<div class="cigr" style="left:${left}px;height:${lineHeight}px;"></div>`;
				left += tabWidth;
			}

			output[lineIndex] = result;
		}
		this._renderResult = output;
	}

	public render(startLineNumber:number, lineNumber:number): string {
		if (!this._renderResult) {
			return '';
		}
		let lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			throw new Error('Unexpected render request');
		}
		return this._renderResult[lineIndex];
	}
}

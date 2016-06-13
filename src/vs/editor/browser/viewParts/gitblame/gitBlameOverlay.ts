/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gitBlameOverlay';
import * as platform from 'vs/base/common/platform';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {DynamicViewOverlay} from 'vs/editor/browser/view/dynamicViewOverlay';
import {ClassNames} from 'vs/editor/browser/editorBrowser';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {IRenderingContext} from 'vs/editor/common/view/renderingContext';

export class GitBlameOverlay extends DynamicViewOverlay {


	private _context:ViewContext;
	private _lineHeight:number;
	private _gitBlame:any;
	private _gitBlameLeft:number;
	private _gitBlameWidth:number;
	private _renderResult:string[];

	constructor(context:ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._gitBlame = this._context.configuration.editor.viewInfo.gitBlame;
		this._gitBlameLeft = 0;
		this._gitBlameWidth = 0;
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
	public onModelDecorationsChanged(e:editorCommon.IViewDecorationsChangedEvent): boolean {
		return false;
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
	public onCursorPositionChanged(e:editorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e:editorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		this._gitBlame = !!this._context.configuration.editor.layoutInfo.gitBlameWidth;
		return true;
	}
	public onLayoutChanged(layoutInfo:editorCommon.EditorLayoutInfo): boolean {
		this._gitBlameLeft = layoutInfo.gitBlameLeft;
		this._gitBlameWidth = layoutInfo.gitBlameWidth;
		this._gitBlame = !!this._context.configuration.editor.layoutInfo.gitBlameWidth;
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.scrollTopChanged;
	}
	public onZonesChanged(): boolean {
		return true;
	}

	// --- end event handlers

	public prepareRender(ctx:IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

		if (!this._gitBlame) {
			this._renderResult = null;
			return;
		}

		let lineHeightClassName = (platform.isLinux ? (this._lineHeight % 2 === 0 ? ' lh-even': ' lh-odd') : '');
		let lineHeight = this._lineHeight.toString();
		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		let common = '<div class="' + ClassNames.GIT_BLAME_ANNOTATION + lineHeightClassName + '" style="left:' + this._gitBlameLeft.toString() + 'px;width:' + this._gitBlameWidth.toString() + 'px;height:' + lineHeight + 'px;">';

		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;

			let renderGitBlame = this._context.model.getLineBlameData(lineNumber);
			if (renderGitBlame) {
				output[lineIndex] = (
					common
					+ renderGitBlame
					+ '</div>'
				);
			} else {
				output[lineIndex] = '';
			}
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
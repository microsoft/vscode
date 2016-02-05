/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./currentLineHighlight';

import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

export class CurrentLineHighlightOverlay extends ViewEventHandler implements EditorBrowser.IDynamicViewOverlay {
	private _context:EditorBrowser.IViewContext;
	private _layoutProvider:EditorBrowser.ILayoutProvider;
	private _selectionIsEmpty:boolean;
	private _primaryCursorIsInEditableRange:boolean;
	private _primaryCursorLineNumber:number;
	private _scrollWidth:number;

	constructor(context:EditorBrowser.IViewContext, layoutProvider:EditorBrowser.ILayoutProvider) {
		super();
		this._context = context;
		this._layoutProvider = layoutProvider;

		this._selectionIsEmpty = true;
		this._primaryCursorIsInEditableRange = true;
		this._primaryCursorLineNumber = 1;
		this._scrollWidth = this._layoutProvider.getScrollWidth();

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		this._primaryCursorIsInEditableRange = true;
		this._selectionIsEmpty = true;
		this._primaryCursorLineNumber = 1;
		this._scrollWidth = this._layoutProvider.getScrollWidth();
		return true;
	}
	public onModelLinesDeleted(e:EditorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e:EditorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		var hasChanged = false;
		if (this._primaryCursorIsInEditableRange !== e.isInEditableRange) {
			this._primaryCursorIsInEditableRange = e.isInEditableRange;
			hasChanged = true;
		}
		if (this._primaryCursorLineNumber !== e.position.lineNumber) {
			this._primaryCursorLineNumber = e.position.lineNumber;
			hasChanged = true;
		}
		return hasChanged;
	}
	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		var isEmpty = e.selection.isEmpty();
		if (this._selectionIsEmpty !== isEmpty) {
			this._selectionIsEmpty = isEmpty;
			return true;
		}
		return false;
	}
	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		return true;
	}
	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		return true;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		if (this._scrollWidth !== scrollWidth) {
			this._scrollWidth = scrollWidth;
			return true;
		}
		return false;
	}
	// --- end event handlers

	public shouldCallRender2(ctx:EditorBrowser.IRenderingContext): boolean {
		if (!this.shouldRender) {
			return false;
		}
		this.shouldRender = false;
		this._scrollWidth = ctx.scrollWidth;
		return true;
	}

	public render2(lineNumber:number): string[] {
		if (lineNumber === this._primaryCursorLineNumber) {
			if (this._shouldShowCurrentLine()) {
				return [
					'<div class="current-line" style="width:',
					String(this._scrollWidth),
					'px; height:',
					String(this._context.configuration.editor.lineHeight),
					'px;"></div>'
				];
			} else {
				return null;
			}
		}
		return null;
	}

	private _shouldShowCurrentLine(): boolean {
		return this._selectionIsEmpty && this._primaryCursorIsInEditableRange && !this._context.configuration.editor.readOnly;
	}
}

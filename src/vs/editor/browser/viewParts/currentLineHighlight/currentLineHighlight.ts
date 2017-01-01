/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./currentLineHighlight';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ILayoutProvider } from 'vs/editor/browser/viewLayout/layoutProvider';

export class CurrentLineHighlightOverlay extends DynamicViewOverlay {
	private _context: ViewContext;
	private _lineHeight: number;
	private _readOnly: boolean;
	private _renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	private _layoutProvider: ILayoutProvider;
	private _selectionIsEmpty: boolean;
	private _primaryCursorIsInEditableRange: boolean;
	private _primaryCursorLineNumber: number;
	private _scrollWidth: number;
	private _contentWidth: number;

	constructor(context: ViewContext, layoutProvider: ILayoutProvider) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._readOnly = this._context.configuration.editor.readOnly;
		this._renderLineHighlight = this._context.configuration.editor.viewInfo.renderLineHighlight;

		this._layoutProvider = layoutProvider;

		this._selectionIsEmpty = true;
		this._primaryCursorIsInEditableRange = true;
		this._primaryCursorLineNumber = 1;
		this._scrollWidth = this._layoutProvider.getScrollWidth();
		this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;

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
	public onModelLinesDeleted(e: editorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e: editorCommon.IViewCursorPositionChangedEvent): boolean {
		let hasChanged = false;
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
	public onCursorSelectionChanged(e: editorCommon.IViewCursorSelectionChangedEvent): boolean {
		let isEmpty = e.selection.isEmpty();
		if (this._selectionIsEmpty !== isEmpty) {
			this._selectionIsEmpty = isEmpty;
			return true;
		}
		return false;
	}
	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.readOnly) {
			this._readOnly = this._context.configuration.editor.readOnly;
		}
		if (e.viewInfo.renderLineHighlight) {
			this._renderLineHighlight = this._context.configuration.editor.viewInfo.renderLineHighlight;
		}
		if (e.layoutInfo) {
			this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		}
		return true;
	}
	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		this._scrollWidth = e.scrollWidth;
		return e.scrollWidthChanged;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx: IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}
		this._scrollWidth = ctx.scrollWidth;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (lineNumber === this._primaryCursorLineNumber) {
			if (this._shouldShowCurrentLine()) {
				return (
					'<div class="current-line" style="width:'
					+ String(Math.max(this._scrollWidth, this._contentWidth))
					+ 'px; height:'
					+ String(this._lineHeight)
					+ 'px;"></div>'
				);
			} else {
				return '';
			}
		}
		return '';
	}

	private _shouldShowCurrentLine(): boolean {
		return (this._renderLineHighlight === 'line' || this._renderLineHighlight === 'all') &&
			this._selectionIsEmpty &&
			this._primaryCursorIsInEditableRange;
	}
}

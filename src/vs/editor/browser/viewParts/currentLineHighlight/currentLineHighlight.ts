/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./currentLineHighlight';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorLineHighlight, editorLineHighlightBorder } from 'vs/editor/common/view/editorColorRegistry';

export class CurrentLineHighlightOverlay extends DynamicViewOverlay {
	private _context: ViewContext;
	private _lineHeight: number;
	private _readOnly: boolean;
	private _renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	private _selectionIsEmpty: boolean;
	private _primaryCursorIsInEditableRange: boolean;
	private _primaryCursorLineNumber: number;
	private _scrollWidth: number;
	private _contentWidth: number;

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._readOnly = this._context.configuration.editor.readOnly;
		this._renderLineHighlight = this._context.configuration.editor.viewInfo.renderLineHighlight;

		this._selectionIsEmpty = true;
		this._primaryCursorIsInEditableRange = true;
		this._primaryCursorLineNumber = 1;
		this._scrollWidth = 0;
		this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
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
	public onCursorPositionChanged(e: viewEvents.ViewCursorPositionChangedEvent): boolean {
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
	public onCursorSelectionChanged(e: viewEvents.ViewCursorSelectionChangedEvent): boolean {
		let isEmpty = e.selection.isEmpty();
		if (this._selectionIsEmpty !== isEmpty) {
			this._selectionIsEmpty = isEmpty;
			return true;
		}
		return false;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		this._primaryCursorIsInEditableRange = true;
		this._selectionIsEmpty = true;
		this._primaryCursorLineNumber = 1;
		return true;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollWidthChanged;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
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

registerThemingParticipant((theme, collector) => {
	let lineHighlight = theme.getColor(editorLineHighlight);
	if (lineHighlight) {
		collector.addRule(`.monaco-editor.${theme.selector} .view-overlays .current-line { background-color: ${lineHighlight}; border: none; }`);
	} else {
		let lineHighlightBorder = theme.getColor(editorLineHighlightBorder);
		if (lineHighlightBorder) {
			collector.addRule(`.monaco-editor.${theme.selector} .view-overlays .current-line { border: 2px solid ${lineHighlightBorder}; }`);
		}
	}
});

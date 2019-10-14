/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./currentLineHighlight';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { editorLineHighlight, editorLineHighlightBorder } from 'vs/editor/common/view/editorColorRegistry';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';


export class CurrentLineHighlightOverlay extends DynamicViewOverlay {
	private readonly _context: ViewContext;
	private _lineHeight: number;
	private _renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	private _contentWidth: number;
	private _selectionIsEmpty: boolean;
	private _primaryCursorLineNumber: number;
	private _scrollWidth: number;

	constructor(context: ViewContext) {
		super();
		this._context = context;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._renderLineHighlight = options.get(EditorOption.renderLineHighlight);
		this._contentWidth = layoutInfo.contentWidth;

		this._selectionIsEmpty = true;
		this._primaryCursorLineNumber = 1;
		this._scrollWidth = 0;


		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		super.dispose();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._renderLineHighlight = options.get(EditorOption.renderLineHighlight);
		this._contentWidth = layoutInfo.contentWidth;
		return true;
	}
	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		let hasChanged = false;

		const primaryCursorLineNumber = e.selections[0].positionLineNumber;
		if (this._primaryCursorLineNumber !== primaryCursorLineNumber) {
			this._primaryCursorLineNumber = primaryCursorLineNumber;
			hasChanged = true;
		}

		const selectionIsEmpty = e.selections[0].isEmpty();
		if (this._selectionIsEmpty !== selectionIsEmpty) {
			this._selectionIsEmpty = selectionIsEmpty;
			return true;
		}

		return hasChanged;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
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
				const paintedInMargin = this._willRenderMarginCurrentLine();
				const className = 'current-line' + (paintedInMargin ? ' current-line-both' : '');
				return (
					'<div class="'
					+ className
					+ '" style="width:'
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
		return (
			(this._renderLineHighlight === 'line' || this._renderLineHighlight === 'all')
			&& this._selectionIsEmpty
		);
	}

	private _willRenderMarginCurrentLine(): boolean {
		return (
			(this._renderLineHighlight === 'gutter' || this._renderLineHighlight === 'all')
		);
	}
}

registerThemingParticipant((theme, collector) => {
	const lineHighlight = theme.getColor(editorLineHighlight);
	if (lineHighlight) {
		collector.addRule(`.monaco-editor .view-overlays .current-line { background-color: ${lineHighlight}; }`);
	}
	if (!lineHighlight || lineHighlight.isTransparent() || theme.defines(editorLineHighlightBorder)) {
		const lineHighlightBorder = theme.getColor(editorLineHighlightBorder);
		if (lineHighlightBorder) {
			collector.addRule(`.monaco-editor .view-overlays .current-line { border: 2px solid ${lineHighlightBorder}; }`);
			if (theme.type === 'hc') {
				collector.addRule(`.monaco-editor .view-overlays .current-line { border-width: 1px; }`);
			}
		}
	}
});

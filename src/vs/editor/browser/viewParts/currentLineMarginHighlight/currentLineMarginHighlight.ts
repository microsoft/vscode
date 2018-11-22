/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./currentLineMarginHighlight';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { editorLineHighlight, editorLineHighlightBorder } from 'vs/editor/common/view/editorColorRegistry';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';

export class CurrentLineMarginHighlightOverlay extends DynamicViewOverlay {
	private _context: ViewContext;
	private _lineHeight: number;
	private _renderLineHighlight: 'none' | 'gutter' | 'line' | 'all';
	private _selectionIsEmpty: boolean;
	private _primaryCursorLineNumber: number;
	private _contentLeft: number;

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._renderLineHighlight = this._context.configuration.editor.viewInfo.renderLineHighlight;

		this._selectionIsEmpty = true;
		this._primaryCursorLineNumber = 1;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		super.dispose();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.viewInfo) {
			this._renderLineHighlight = this._context.configuration.editor.viewInfo.renderLineHighlight;
		}
		if (e.layoutInfo) {
			this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		}
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
			hasChanged = true;
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
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (lineNumber === this._primaryCursorLineNumber) {
			let className = 'current-line';
			if (this._shouldShowCurrentLine()) {
				const paintedInContent = this._willRenderContentCurrentLine();
				className = 'current-line current-line-margin' + (paintedInContent ? ' current-line-margin-both' : '');
			}

			return (
				'<div class="'
				+ className
				+ '" style="width:'
				+ String(this._contentLeft)
				+ 'px; height:'
				+ String(this._lineHeight)
				+ 'px;"></div>'
			);
		}
		return '';
	}

	private _shouldShowCurrentLine(): boolean {
		return (
			(this._renderLineHighlight === 'gutter' || this._renderLineHighlight === 'all')
		);
	}

	private _willRenderContentCurrentLine(): boolean {
		return (
			(this._renderLineHighlight === 'line' || this._renderLineHighlight === 'all')
			&& this._selectionIsEmpty
		);
	}
}

registerThemingParticipant((theme, collector) => {
	const lineHighlight = theme.getColor(editorLineHighlight);
	if (lineHighlight) {
		collector.addRule(`.monaco-editor .margin-view-overlays .current-line-margin { background-color: ${lineHighlight}; border: none; }`);
	} else {
		const lineHighlightBorder = theme.getColor(editorLineHighlightBorder);
		if (lineHighlightBorder) {
			collector.addRule(`.monaco-editor .margin-view-overlays .current-line-margin { border: 2px solid ${lineHighlightBorder}; }`);
		}
		if (theme.type === 'hc') {
			collector.addRule(`.monaco-editor .margin-view-overlays .current-line-margin { border-width: 1px; }`);
		}
	}
});

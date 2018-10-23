/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./indentGuides';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { Position } from 'vs/editor/common/core/position';
import { editorActiveIndentGuides, editorIndentGuides } from 'vs/editor/common/view/editorColorRegistry';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';

export class IndentGuidesOverlay extends DynamicViewOverlay {

	private _context: ViewContext;
	private _primaryLineNumber: number;
	private _lineHeight: number;
	private _spaceWidth: number;
	private _renderResult: string[] | null;
	private _enabled: boolean;
	private _activeIndentEnabled: boolean;

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._primaryLineNumber = 0;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		this._enabled = this._context.configuration.editor.viewInfo.renderIndentGuides;
		this._activeIndentEnabled = this._context.configuration.editor.viewInfo.highlightActiveIndentGuide;
		this._renderResult = null;

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
		super.dispose();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.fontInfo) {
			this._spaceWidth = this._context.configuration.editor.fontInfo.spaceWidth;
		}
		if (e.viewInfo) {
			this._enabled = this._context.configuration.editor.viewInfo.renderIndentGuides;
			this._activeIndentEnabled = this._context.configuration.editor.viewInfo.highlightActiveIndentGuide;
		}
		return true;
	}
	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		const selection = e.selections[0];
		const newPrimaryLineNumber = selection.isEmpty() ? selection.positionLineNumber : 0;

		if (this._primaryLineNumber !== newPrimaryLineNumber) {
			this._primaryLineNumber = newPrimaryLineNumber;
			return true;
		}

		return false;
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		// true for inline decorations
		return true;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged;// || e.scrollWidthChanged;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	public onLanguageConfigurationChanged(e: viewEvents.ViewLanguageConfigurationEvent): boolean {
		return true;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (!this._enabled) {
			this._renderResult = null;
			return;
		}

		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		const tabSize = this._context.model.getTabSize();
		const tabWidth = tabSize * this._spaceWidth;
		const scrollWidth = ctx.scrollWidth;
		const lineHeight = this._lineHeight;
		const indentGuideWidth = tabWidth;

		const indents = this._context.model.getLinesIndentGuides(visibleStartLineNumber, visibleEndLineNumber);

		let activeIndentStartLineNumber = 0;
		let activeIndentEndLineNumber = 0;
		let activeIndentLevel = 0;
		if (this._activeIndentEnabled && this._primaryLineNumber) {
			const activeIndentInfo = this._context.model.getActiveIndentGuide(this._primaryLineNumber, visibleStartLineNumber, visibleEndLineNumber);
			activeIndentStartLineNumber = activeIndentInfo.startLineNumber;
			activeIndentEndLineNumber = activeIndentInfo.endLineNumber;
			activeIndentLevel = activeIndentInfo.indent;
		}

		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const containsActiveIndentGuide = (activeIndentStartLineNumber <= lineNumber && lineNumber <= activeIndentEndLineNumber);
			const lineIndex = lineNumber - visibleStartLineNumber;
			const indent = indents[lineIndex];

			let result = '';
			let leftMostVisiblePosition = ctx.visibleRangeForPosition(new Position(lineNumber, 1));
			let left = leftMostVisiblePosition ? leftMostVisiblePosition.left : 0;
			for (let i = 1; i <= indent; i++) {
				let className = (containsActiveIndentGuide && i === activeIndentLevel ? 'cigra' : 'cigr');
				result += `<div class="${className}" style="left:${left}px;height:${lineHeight}px;width:${indentGuideWidth}px"></div>`;
				left += tabWidth;
				if (left > scrollWidth) {
					break;
				}
			}

			output[lineIndex] = result;
		}
		this._renderResult = output;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderResult) {
			return '';
		}
		let lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			return '';
		}
		return this._renderResult[lineIndex];
	}
}

registerThemingParticipant((theme, collector) => {
	const editorIndentGuidesColor = theme.getColor(editorIndentGuides);
	if (editorIndentGuidesColor) {
		collector.addRule(`.monaco-editor .lines-content .cigr { box-shadow: 1px 0 0 0 ${editorIndentGuidesColor} inset; }`);
	}
	const editorActiveIndentGuidesColor = theme.getColor(editorActiveIndentGuides) || editorIndentGuidesColor;
	if (editorActiveIndentGuidesColor) {
		collector.addRule(`.monaco-editor .lines-content .cigra { box-shadow: 1px 0 0 0 ${editorActiveIndentGuidesColor} inset; }`);
	}
});

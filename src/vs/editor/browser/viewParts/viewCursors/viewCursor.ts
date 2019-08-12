/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import * as strings from 'vs/base/common/strings';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { TextEditorCursorStyle } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export interface IViewCursorRenderData {
	domNode: HTMLElement;
	position: Position;
	contentLeft: number;
	width: number;
	height: number;
}

class ViewCursorRenderData {
	constructor(
		public readonly top: number,
		public readonly left: number,
		public readonly width: number,
		public readonly height: number,
		public readonly textContent: string,
		public readonly textContentClassName: string
	) { }
}

export class ViewCursor {
	private readonly _context: ViewContext;
	private readonly _domNode: FastDomNode<HTMLElement>;

	private _cursorStyle: TextEditorCursorStyle;
	private _lineCursorWidth: number;
	private _lineHeight: number;
	private _typicalHalfwidthCharacterWidth: number;

	private _isVisible: boolean;

	private _position: Position;

	private _lastRenderedContent: string;
	private _renderData: ViewCursorRenderData | null;

	constructor(context: ViewContext) {
		this._context = context;

		this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
		this._lineCursorWidth = Math.min(this._context.configuration.editor.viewInfo.cursorWidth, this._typicalHalfwidthCharacterWidth);

		this._isVisible = true;

		// Create the dom node
		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setClassName('cursor');
		this._domNode.setHeight(this._lineHeight);
		this._domNode.setTop(0);
		this._domNode.setLeft(0);
		Configuration.applyFontInfo(this._domNode, this._context.configuration.editor.fontInfo);
		this._domNode.setDisplay('none');

		this._position = new Position(1, 1);

		this._lastRenderedContent = '';
		this._renderData = null;
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	public getPosition(): Position {
		return this._position;
	}

	public show(): void {
		if (!this._isVisible) {
			this._domNode.setVisibility('inherit');
			this._isVisible = true;
		}
	}

	public hide(): void {
		if (this._isVisible) {
			this._domNode.setVisibility('hidden');
			this._isVisible = false;
		}
	}

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.fontInfo) {
			Configuration.applyFontInfo(this._domNode, this._context.configuration.editor.fontInfo);
			this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
		}
		if (e.viewInfo) {
			this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
			this._lineCursorWidth = Math.min(this._context.configuration.editor.viewInfo.cursorWidth, this._typicalHalfwidthCharacterWidth);
		}

		return true;
	}

	public onCursorPositionChanged(position: Position): boolean {
		this._position = position;
		return true;
	}

	private _prepareRender(ctx: RenderingContext): ViewCursorRenderData | null {
		let textContent = '';
		let textContentClassName = '';

		if (this._cursorStyle === TextEditorCursorStyle.Line || this._cursorStyle === TextEditorCursorStyle.LineThin) {
			const visibleRange = ctx.visibleRangeForPosition(this._position);
			if (!visibleRange) {
				// Outside viewport
				return null;
			}
			let width: number;
			if (this._cursorStyle === TextEditorCursorStyle.Line) {
				width = dom.computeScreenAwareSize(this._lineCursorWidth > 0 ? this._lineCursorWidth : 2);
				if (width > 2) {
					const lineContent = this._context.model.getLineContent(this._position.lineNumber);
					textContent = lineContent.charAt(this._position.column - 1);
				}
			} else {
				width = dom.computeScreenAwareSize(1);
			}
			let left = visibleRange.left;
			if (width >= 2 && left >= 1) {
				// try to center cursor
				left -= 1;
			}
			const top = ctx.getVerticalOffsetForLineNumber(this._position.lineNumber) - ctx.bigNumbersDelta;
			return new ViewCursorRenderData(top, left, width, this._lineHeight, textContent, textContentClassName);
		}

		const visibleRangeForCharacter = ctx.linesVisibleRangesForRange(new Range(this._position.lineNumber, this._position.column, this._position.lineNumber, this._position.column + 1), false);

		if (!visibleRangeForCharacter || visibleRangeForCharacter.length === 0 || visibleRangeForCharacter[0].ranges.length === 0) {
			// Outside viewport
			return null;
		}

		const range = visibleRangeForCharacter[0].ranges[0];
		const width = range.width < 1 ? this._typicalHalfwidthCharacterWidth : range.width;

		if (this._cursorStyle === TextEditorCursorStyle.Block) {
			const lineData = this._context.model.getViewLineData(this._position.lineNumber);
			textContent = lineData.content.charAt(this._position.column - 1);
			if (strings.isHighSurrogate(lineData.content.charCodeAt(this._position.column - 1))) {
				textContent += lineData.content.charAt(this._position.column);
			}
			const tokenIndex = lineData.tokens.findTokenIndexAtOffset(this._position.column - 1);
			textContentClassName = lineData.tokens.getClassName(tokenIndex);
		}

		let top = ctx.getVerticalOffsetForLineNumber(this._position.lineNumber) - ctx.bigNumbersDelta;
		let height = this._lineHeight;

		// Underline might interfere with clicking
		if (this._cursorStyle === TextEditorCursorStyle.Underline || this._cursorStyle === TextEditorCursorStyle.UnderlineThin) {
			top += this._lineHeight - 2;
			height = 2;
		}

		return new ViewCursorRenderData(top, range.left, width, height, textContent, textContentClassName);
	}

	public prepareRender(ctx: RenderingContext): void {
		this._renderData = this._prepareRender(ctx);
	}

	public render(ctx: RestrictedRenderingContext): IViewCursorRenderData | null {
		if (!this._renderData) {
			this._domNode.setDisplay('none');
			return null;
		}

		if (this._lastRenderedContent !== this._renderData.textContent) {
			this._lastRenderedContent = this._renderData.textContent;
			this._domNode.domNode.textContent = this._lastRenderedContent;
		}

		this._domNode.setClassName('cursor ' + this._renderData.textContentClassName);

		this._domNode.setDisplay('block');
		this._domNode.setTop(this._renderData.top);
		this._domNode.setLeft(this._renderData.left);
		this._domNode.setWidth(this._renderData.width);
		this._domNode.setLineHeight(this._renderData.height);
		this._domNode.setHeight(this._renderData.height);

		return {
			domNode: this._domNode.domNode,
			position: this._position,
			contentLeft: this._renderData.left,
			height: this._renderData.height,
			width: 2
		};
	}
}

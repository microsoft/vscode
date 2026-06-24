/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import * as strings from '../../../../base/common/strings.js';
import { applyFontInfo } from '../../config/domFontInfo.js';
import { TextEditorCursorStyle, EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../base/browser/ui/mouseCursor/mouseCursor.js';

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
		public readonly paddingLeft: number,
		public readonly width: number,
		public readonly height: number,
		public readonly textContent: string,
		public readonly textContentClassName: string
	) { }
}

export enum CursorPlurality {
	Single,
	MultiPrimary,
	MultiSecondary,
}

export class ViewCursor {
	private readonly _context: ViewContext;
	private readonly _domNode: FastDomNode<HTMLElement>;

	private _cursorStyle: TextEditorCursorStyle;
	private _lineCursorWidth: number;
	private _lineCursorHeight: number;
	private _typicalHalfwidthCharacterWidth: number;

	private _isVisible: boolean;

	private _position: Position;
	private _pluralityClass: string;

	private _lastRenderedContent: string;
	private _renderData: ViewCursorRenderData | null;

	constructor(context: ViewContext, plurality: CursorPlurality) {
		this._context = context;
		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);

		this._cursorStyle = options.get(EditorOption.effectiveCursorStyle);
		this._typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
		this._lineCursorWidth = Math.min(options.get(EditorOption.cursorWidth), this._typicalHalfwidthCharacterWidth);
		this._lineCursorHeight = options.get(EditorOption.cursorHeight);

		this._isVisible = true;

		// Create the dom node
		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setClassName(`cursor ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
		this._domNode.setHeight(this._context.viewLayout.getLineHeightForLineNumber(1));
		this._domNode.setTop(0);
		this._domNode.setLeft(0);
		applyFontInfo(this._domNode, fontInfo);
		this._domNode.setDisplay('none');

		this._position = new Position(1, 1);
		this._pluralityClass = '';
		this.setPlurality(plurality);

		this._lastRenderedContent = '';
		this._renderData = null;
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	public getPosition(): Position {
		return this._position;
	}

	public setPlurality(plurality: CursorPlurality) {
		switch (plurality) {
			default:
			case CursorPlurality.Single:
				this._pluralityClass = '';
				break;

			case CursorPlurality.MultiPrimary:
				this._pluralityClass = 'cursor-primary';
				break;

			case CursorPlurality.MultiSecondary:
				this._pluralityClass = 'cursor-secondary';
				break;
		}
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
		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);

		this._cursorStyle = options.get(EditorOption.effectiveCursorStyle);
		this._typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
		this._lineCursorWidth = Math.min(options.get(EditorOption.cursorWidth), this._typicalHalfwidthCharacterWidth);
		this._lineCursorHeight = options.get(EditorOption.cursorHeight);
		applyFontInfo(this._domNode, fontInfo);

		return true;
	}

	public onCursorPositionChanged(position: Position, pauseAnimation: boolean): boolean {
		if (pauseAnimation) {
			this._domNode.domNode.style.transitionProperty = 'none';
		} else {
			this._domNode.domNode.style.transitionProperty = '';
		}
		this._position = position;
		return true;
	}

	/**
	 * If `this._position` is inside a grapheme, returns the position where the grapheme starts.
	 * Also returns the next grapheme.
	 */
	private _getGraphemeAwarePosition(): [Position, string] {
		const { lineNumber, column } = this._position;
		const lineContent = this._context.viewModel.getLineContent(lineNumber);
		const [startOffset, endOffset] = strings.getCharContainingOffset(lineContent, column - 1);
		return [new Position(lineNumber, startOffset + 1), lineContent.substring(startOffset, endOffset)];
	}

	private _prepareRender(ctx: RenderingContext): ViewCursorRenderData | null {
		let textContent = '';
		let textContentClassName = '';
		const [position, nextGrapheme] = this._getGraphemeAwarePosition();
		const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(position.lineNumber);
		const lineCursorHeight = (
			this._lineCursorHeight === 0
				? lineHeight // 0 indicates that the cursor should take the full line height
				: Math.min(lineHeight, this._lineCursorHeight)
		);
		const lineHeightAdjustment = (lineHeight - lineCursorHeight) / 2;

		if (this._cursorStyle === TextEditorCursorStyle.Line || this._cursorStyle === TextEditorCursorStyle.LineThin) {
			const visibleRange = ctx.visibleRangeForPosition(position);
			if (!visibleRange || visibleRange.outsideRenderedLine) {
				// Outside viewport
				return null;
			}

			const window = dom.getWindow(this._domNode.domNode);
			let width: number;
			if (this._cursorStyle === TextEditorCursorStyle.Line) {
				width = dom.computeScreenAwareSize(window, this._lineCursorWidth > 0 ? this._lineCursorWidth : 2);
				if (width > 2) {
					textContent = nextGrapheme;
					textContentClassName = this._getTokenClassName(position);
				}
			} else {
				width = dom.computeScreenAwareSize(window, 1);
			}

			let left = visibleRange.left;
			let paddingLeft = 0;
			if (width >= 2 && left >= 1) {
				// shift the cursor a bit between the characters
				paddingLeft = 1;
				left -= paddingLeft;
			}

			const top = ctx.getVerticalOffsetForLineNumber(position.lineNumber) - ctx.bigNumbersDelta + lineHeightAdjustment;
			return new ViewCursorRenderData(top, left, paddingLeft, width, lineCursorHeight, textContent, textContentClassName);
		}

		const visibleRangeForCharacter = ctx.linesVisibleRangesForRange(new Range(position.lineNumber, position.column, position.lineNumber, position.column + nextGrapheme.length), false);
		if (!visibleRangeForCharacter || visibleRangeForCharacter.length === 0) {
			// Outside viewport
			return null;
		}

		const firstVisibleRangeForCharacter = visibleRangeForCharacter[0];
		if (firstVisibleRangeForCharacter.outsideRenderedLine || firstVisibleRangeForCharacter.ranges.length === 0) {
			// Outside viewport
			return null;
		}

		const range = firstVisibleRangeForCharacter.ranges[0];
		const width = (
			nextGrapheme === '\t'
				? this._typicalHalfwidthCharacterWidth
				: (range.width < 1
					? this._typicalHalfwidthCharacterWidth
					: range.width)
		);

		if (this._cursorStyle === TextEditorCursorStyle.Block) {
			textContent = nextGrapheme;
			textContentClassName = this._getTokenClassName(position);
		}

		let top = ctx.getVerticalOffsetForLineNumber(position.lineNumber) - ctx.bigNumbersDelta;
		let height = lineHeight;

		// Underline might interfere with clicking
		if (this._cursorStyle === TextEditorCursorStyle.Underline || this._cursorStyle === TextEditorCursorStyle.UnderlineThin) {
			top += lineHeight - 2;
			height = 2;
		}

		return new ViewCursorRenderData(top, range.left, 0, width, height, textContent, textContentClassName);
	}

	private _getTokenClassName(position: Position): string {
		const lineData = this._context.viewModel.getViewLineData(position.lineNumber);
		const tokenIndex = lineData.tokens.findTokenIndexAtOffset(position.column - 1);
		return lineData.tokens.getClassName(tokenIndex);
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

		this._domNode.setClassName(`cursor ${this._pluralityClass} ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME} ${this._renderData.textContentClassName}`);

		this._domNode.setDisplay('block');
		this._domNode.setTop(this._renderData.top);
		this._domNode.setLeft(this._renderData.left);
		this._domNode.setPaddingLeft(this._renderData.paddingLeft);
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

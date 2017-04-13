/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { TextEditorCursorStyle } from 'vs/editor/common/editorCommon';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export interface IViewCursorRenderData {
	domNode: HTMLElement;
	position: Position;
	contentLeft: number;
	width: number;
	height: number;
}

class ViewCursorRenderData {
	public readonly top: number;
	public readonly left: number;
	public readonly width: number;
	public readonly textContent: string;

	constructor(top: number, left: number, width: number, textContent: string) {
		this.top = top;
		this.left = left;
		this.width = width;
		this.textContent = textContent;
	}
}

export class ViewCursor {
	private readonly _context: ViewContext;
	private readonly _isSecondary: boolean;
	private readonly _domNode: FastDomNode<HTMLElement>;

	private _cursorStyle: TextEditorCursorStyle;
	private _lineHeight: number;
	private _typicalHalfwidthCharacterWidth: number;

	private _isVisible: boolean;

	private _position: Position;
	private _isInEditableRange: boolean;

	private _lastRenderedContent: string;
	private _renderData: ViewCursorRenderData;

	constructor(context: ViewContext, isSecondary: boolean) {
		this._context = context;
		this._isSecondary = isSecondary;

		this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;

		this._isVisible = true;

		// Create the dom node
		this._domNode = createFastDomNode(document.createElement('div'));
		if (this._isSecondary) {
			this._domNode.setClassName('cursor secondary');
		} else {
			this._domNode.setClassName('cursor');
		}
		this._domNode.setHeight(this._lineHeight);
		this._domNode.setTop(0);
		this._domNode.setLeft(0);
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.setAttribute('aria-hidden', 'true');
		Configuration.applyFontInfo(this._domNode, this._context.configuration.editor.fontInfo);
		this._domNode.setDisplay('none');

		this.updatePosition(new Position(1, 1));
		this._isInEditableRange = true;

		this._lastRenderedContent = '';
		this._renderData = null;
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	public getIsInEditableRange(): boolean {
		return this._isInEditableRange;
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
		if (e.viewInfo.cursorStyle) {
			this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		}
		if (e.fontInfo) {
			Configuration.applyFontInfo(this._domNode, this._context.configuration.editor.fontInfo);
			this._typicalHalfwidthCharacterWidth = this._context.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth;
		}
		return true;
	}

	public onCursorPositionChanged(position: Position, isInEditableRange: boolean): boolean {
		this.updatePosition(position);
		this._isInEditableRange = isInEditableRange;
		return true;
	}

	public onFlushed(): boolean {
		this.updatePosition(new Position(1, 1));
		this._isInEditableRange = true;
		return true;
	}

	private _prepareRender(ctx: RenderingContext): ViewCursorRenderData {
		if (this._cursorStyle === TextEditorCursorStyle.Line || this._cursorStyle === TextEditorCursorStyle.LineThin) {
			const visibleRange = ctx.visibleRangeForPosition(this._position);
			if (!visibleRange) {
				// Outside viewport
				return null;
			}
			let width: number;
			if (this._cursorStyle === TextEditorCursorStyle.Line) {
				width = 2;
			} else {
				width = 1;
			}
			const top = ctx.getVerticalOffsetForLineNumber(this._position.lineNumber) - ctx.bigNumbersDelta;
			return new ViewCursorRenderData(top, visibleRange.left, width, '');
		}

		const visibleRangeForCharacter = ctx.linesVisibleRangesForRange(new Range(this._position.lineNumber, this._position.column, this._position.lineNumber, this._position.column + 1), false);

		if (!visibleRangeForCharacter || visibleRangeForCharacter.length === 0 || visibleRangeForCharacter[0].ranges.length === 0) {
			// Outside viewport
			return null;
		}

		const range = visibleRangeForCharacter[0].ranges[0];
		const width = range.width < 1 ? this._typicalHalfwidthCharacterWidth : range.width;

		let textContent = '';
		if (this._cursorStyle === TextEditorCursorStyle.Block) {
			const lineContent = this._context.model.getLineContent(this._position.lineNumber);
			textContent = lineContent.charAt(this._position.column - 1);
		}

		const top = ctx.getVerticalOffsetForLineNumber(this._position.lineNumber) - ctx.bigNumbersDelta;
		return new ViewCursorRenderData(top, range.left, width, textContent);
	}

	public prepareRender(ctx: RenderingContext): void {
		this._renderData = this._prepareRender(ctx);
	}

	public render(ctx: RestrictedRenderingContext): IViewCursorRenderData {
		if (!this._renderData) {
			this._domNode.setDisplay('none');
			return null;
		}

		if (this._lastRenderedContent !== this._renderData.textContent) {
			this._lastRenderedContent = this._renderData.textContent;
			this._domNode.domNode.textContent = this._lastRenderedContent;
		}

		this._domNode.setDisplay('block');
		this._domNode.setTop(this._renderData.top);
		this._domNode.setLeft(this._renderData.left);
		this._domNode.setWidth(this._renderData.width);
		this._domNode.setLineHeight(this._lineHeight);
		this._domNode.setHeight(this._lineHeight);

		return {
			domNode: this._domNode.domNode,
			position: this._position,
			contentLeft: this._renderData.left,
			height: this._lineHeight,
			width: 2
		};
	}

	private updatePosition(newPosition: Position): void {
		this._position = newPosition;
	}
}

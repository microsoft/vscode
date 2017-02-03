/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IConfigurationChangedEvent, TextEditorCursorStyle } from 'vs/editor/common/editorCommon';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';

export interface IViewCursorRenderData {
	position: Position;
	contentTop: number;
	contentLeft: number;
	width: number;
	height: number;
}

export class ViewCursorRenderData {
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
	private readonly _domNode: FastDomNode;

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

	public onModelFlushed(): boolean {
		this.updatePosition(new Position(1, 1));
		this._isInEditableRange = true;
		return true;
	}

	public onCursorPositionChanged(position: Position, isInEditableRange: boolean): boolean {
		this.updatePosition(position);
		this._isInEditableRange = isInEditableRange;
		return true;
	}

	public onConfigurationChanged(e: IConfigurationChangedEvent): boolean {
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

	private _prepareRender(ctx: IRenderingContext): ViewCursorRenderData {
		if (this._cursorStyle === TextEditorCursorStyle.Line) {
			let visibleRange = ctx.visibleRangeForPosition(this._position);
			if (!visibleRange) {
				// Outside viewport
				return null;
			}
			let width = this._isSecondary ? 1 : 2;
			return new ViewCursorRenderData(visibleRange.top, visibleRange.left, width, '');
		}

		let visibleRangeForCharacter = ctx.linesVisibleRangesForRange(new Range(this._position.lineNumber, this._position.column, this._position.lineNumber, this._position.column + 1), false);

		if (!visibleRangeForCharacter || visibleRangeForCharacter.length === 0 || visibleRangeForCharacter[0].ranges.length === 0) {
			// Outside viewport
			return null;
		}

		let range = visibleRangeForCharacter[0].ranges[0];
		let top = ctx.getViewportVerticalOffsetForLineNumber(this._position.lineNumber);
		let width = range.width < 1 ? this._typicalHalfwidthCharacterWidth : range.width;

		let textContent = '';
		if (this._cursorStyle === TextEditorCursorStyle.Block) {
			let lineContent = this._context.model.getLineContent(this._position.lineNumber);
			textContent = lineContent.charAt(this._position.column - 1);
		}

		return new ViewCursorRenderData(top, range.left, width, textContent);
	}

	public prepareRender(ctx: IRenderingContext): void {
		this._renderData = this._prepareRender(ctx);
	}

	public render(ctx: IRestrictedRenderingContext): IViewCursorRenderData {
		if (!this._renderData) {
			this._domNode.setDisplay('none');
			return null;
		}

		if (this._lastRenderedContent !== this._renderData.textContent) {
			this._lastRenderedContent = this._renderData.textContent;
			this._domNode.domNode.textContent = this._lastRenderedContent;
		}

		let top = this._renderData.top + ctx.viewportTop - ctx.bigNumbersDelta;
		this._domNode.setDisplay('block');
		this._domNode.setTop(top);
		this._domNode.setLeft(this._renderData.left);
		this._domNode.setWidth(this._renderData.width);
		this._domNode.setLineHeight(this._lineHeight);
		this._domNode.setHeight(this._lineHeight);

		return {
			position: this._position,
			contentTop: top,
			contentLeft: this._renderData.left,
			height: this._lineHeight,
			width: 2
		};
	}

	private updatePosition(newPosition: Position): void {
		this._position = newPosition;
	}
}

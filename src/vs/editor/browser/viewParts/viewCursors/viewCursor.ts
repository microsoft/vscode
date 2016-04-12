/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {StyleMutator} from 'vs/base/browser/styleMutator';
import {IConfigurationChangedEvent, IPosition, TextEditorCursorStyle} from 'vs/editor/common/editorCommon';
import {IRenderingContext, IRestrictedRenderingContext, IViewContext} from 'vs/editor/browser/editorBrowser';

export class ViewCursor {
	private _context:IViewContext;
	private _position: IPosition;
	private _domNode:HTMLElement;
	private _positionTop:number;
	private _positionLeft:number;
	private _isInEditableRange:boolean;
	private _isVisible:boolean;
	private _isInViewport:boolean;
	private _cursorStyle: TextEditorCursorStyle;
	private _lastRenderedContent: string;
	private _lineHeight: number;

	constructor(context:IViewContext, isSecondary:boolean) {
		this._context = context;
		this._cursorStyle = this._context.configuration.editor.cursorStyle;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._lastRenderedContent = '';

		this._isInEditableRange = true;

		this._domNode = this._createCursorDomNode(isSecondary);
		this._isVisible = true;
		StyleMutator.setDisplay(this._domNode, 'none');
		this.updatePosition({
			lineNumber: 1,
			column: 1
		});
	}

	private _createCursorDomNode(isSecondary: boolean): HTMLElement {
		var domNode = document.createElement('div');
		domNode.className = 'cursor';
		if (isSecondary) {
			domNode.className += ' secondary';
		}
		StyleMutator.setHeight(domNode, this._lineHeight);
		StyleMutator.setTop(domNode, 0);
		StyleMutator.setLeft(domNode, 0);
		domNode.setAttribute('role', 'presentation');
		domNode.setAttribute('aria-hidden', 'true');
		return domNode;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getIsInEditableRange(): boolean {
		return this._isInEditableRange;
	}

	public getPositionTop(): number {
		return this._positionTop;
	}

	public getPosition(): IPosition {
		return this._position;
	}

	public show(): void {
		if (!this._isVisible) {
			StyleMutator.setVisibility(this._domNode, 'inherit');
			this._isVisible = true;
		}
	}

	public hide(): void {
		if (this._isVisible) {
			StyleMutator.setVisibility(this._domNode, 'hidden');
			this._isVisible = false;
		}
	}

	public onModelFlushed(): boolean {
		this.updatePosition({
			lineNumber: 1,
			column: 1
		});
		this._isInEditableRange = true;
		return true;
	}

	public onCursorPositionChanged(position: IPosition, isInEditableRange: boolean): boolean {
		this.updatePosition(position);
		this._isInEditableRange = isInEditableRange;
		return true;
	}

	public onConfigurationChanged(e:IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;

		}
		if (e.cursorStyle) {
			this._cursorStyle = this._context.configuration.editor.cursorStyle;
		}
		return true;
	}

	public prepareRender(ctx:IRenderingContext): void {
		var visibleRange = ctx.visibleRangeForPosition(this._position);
		if (visibleRange) {
			this._positionTop = visibleRange.top;
			this._positionLeft = visibleRange.left;
			this._isInViewport = true;
		} else {
			this._isInViewport = false;
		}
	}

	private _getRenderedContent(): string {
		if (this._cursorStyle === TextEditorCursorStyle.Block) {
			let lineContent = this._context.model.getLineContent(this._position.lineNumber);
			return lineContent.charAt(this._position.column - 1);
		}
		return '';
	}

	public render(ctx:IRestrictedRenderingContext): void {
		if (this._isInViewport) {
			let renderContent = this._getRenderedContent();
			if (this._lastRenderedContent !== renderContent) {
				this._lastRenderedContent = renderContent;
				this._domNode.textContent = this._lastRenderedContent;
			}

			StyleMutator.setDisplay(this._domNode, 'block');
			StyleMutator.setLeft(this._domNode, this._positionLeft);
			StyleMutator.setTop(this._domNode, this._positionTop + ctx.viewportTop - ctx.bigNumbersDelta);
			StyleMutator.setLineHeight(this._domNode, this._lineHeight);
			StyleMutator.setHeight(this._domNode, this._lineHeight);
		} else {
			StyleMutator.setDisplay(this._domNode, 'none');
		}
	}

	private updatePosition(newPosition:IPosition): void {
		this._position = newPosition;
		this._domNode.setAttribute('lineNumber', this._position.lineNumber.toString());
		this._domNode.setAttribute('column', this._position.column.toString());
		this._isInViewport = false;
	}
}

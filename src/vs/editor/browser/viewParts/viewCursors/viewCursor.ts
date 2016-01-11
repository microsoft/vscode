/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import DomUtils = require('vs/base/browser/dom');

import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

export enum CursorStyle {
	line,
	block
}

const CursorStyleNames = ((e:any) => {
	let i = 0, items = [];
	while (true) {
		if (e[i]) {
			items.push(e[i]);
		} else {
		return items;
		}
		i++;
	}
})(CursorStyle);

const CursorClassNames = CursorStyleNames.map(n => 'cursor-' + n);

export class ViewCursor {
	private _context:EditorBrowser.IViewContext;
	private _position: EditorCommon.IPosition;
	private _domNode:HTMLElement;
	private _positionTop:number;
	private _positionLeft:number;
	private _isInEditableRange:boolean;
	private _isVisible:boolean;
	private _isInViewport:boolean;
	private _cursorStyle:CursorStyle;

	constructor(context:EditorBrowser.IViewContext, isSecondary:boolean) {
		this._context = context;

		this._isInEditableRange = true;

		this._domNode = this._createCursorDomNode(isSecondary);
		this.setStyle(CursorStyle[context.configuration.editor.cursorStyle || 'line'] || CursorStyle.line);
		this._isVisible = true;
		DomUtils.StyleMutator.setDisplay(this._domNode, 'none');
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
		DomUtils.StyleMutator.setHeight(domNode, this._context.configuration.editor.lineHeight);
		DomUtils.StyleMutator.setTop(domNode, 0);
		DomUtils.StyleMutator.setLeft(domNode, 0);
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

	public getPosition(): EditorCommon.IPosition {
		return this._position;
	}

	public show(): void {
		if (!this._isVisible) {
			DomUtils.StyleMutator.setVisibility(this._domNode, 'inherit');
			this._isVisible = true;
		}
	}

	public hide(): void {
		if (this._isVisible) {
			DomUtils.StyleMutator.setVisibility(this._domNode, 'hidden');
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

	public onCursorPositionChanged(position: EditorCommon.IPosition, isInEditableRange: boolean): boolean {
		this.updatePosition(position);
		this._isInEditableRange = isInEditableRange;
		return true;
	}

	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			DomUtils.StyleMutator.setHeight(this._domNode, this._context.configuration.editor.lineHeight);
		}
		return true;
	}

	public prepareRender(ctx:EditorBrowser.IRenderingContext): void {
		var visibleRange = ctx.visibleRangeForPosition(this._position);
		if (visibleRange) {
			this._positionTop = visibleRange.top;
			this._positionLeft = visibleRange.left;
			this._isInViewport = true;
		} else {
			this._isInViewport = false;
		}
	}

	public render(ctx:EditorBrowser.IRestrictedRenderingContext): void {
		if (this._isInViewport) {
			DomUtils.StyleMutator.setDisplay(this._domNode, 'block');
			DomUtils.StyleMutator.setLeft(this._domNode, this._positionLeft);
			DomUtils.StyleMutator.setTop(this._domNode, this._positionTop + ctx.viewportTop - ctx.bigNumbersDelta);
		} else {
			DomUtils.StyleMutator.setDisplay(this._domNode, 'none');
		}
	}

	public setStyle(style:CursorStyle): void {
		if (this._cursorStyle === style) {
			return;
		}
		this._cursorStyle = style;

		let newStyleClass = 'cursor-' + CursorStyle[style];
		if (this._domNode.classList.contains(newStyleClass)) {
			return;
		}

		this._domNode.classList.remove(...CursorClassNames);
		this._domNode.classList.add('cursor-' + CursorStyle[style]);
	}

	private removeCursorClass(c:string) {
		if (this._domNode.classList.contains(c)) {
			this._domNode.classList.remove(c);
		}
	}

	private updatePosition(newPosition:EditorCommon.IPosition): void {
		this._position = newPosition;
		this._domNode.setAttribute('lineNumber', this._position.lineNumber.toString());
		this._domNode.setAttribute('column', this._position.column.toString());
		this._isInViewport = false;
	}
}

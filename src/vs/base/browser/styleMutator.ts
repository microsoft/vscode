/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';

export abstract class FastDomNode {

	private _domNode: HTMLElement;
	private _maxWidth: number;
	private _width: number;
	private _height: number;
	private _top: number;
	private _left: number;
	private _bottom: number;
	private _right: number;
	private _fontFamily: string;
	private _fontWeight: string;
	private _fontSize: number;
	private _lineHeight: number;
	private _className: string;
	private _display: string;
	private _position: string;
	private _visibility: string;
	private _transform: string;

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	constructor(domNode: HTMLElement) {
		this._domNode = domNode;
		this._maxWidth = -1;
		this._width = -1;
		this._height = -1;
		this._top = -1;
		this._left = -1;
		this._bottom = -1;
		this._right = -1;
		this._fontFamily = '';
		this._fontWeight = '';
		this._fontSize = -1;
		this._lineHeight = -1;
		this._className = '';
		this._display = '';
		this._position = '';
		this._visibility = '';
		this._transform = '';
	}

	public setMaxWidth(maxWidth: number): void {
		if (this._maxWidth === maxWidth) {
			return;
		}
		this._maxWidth = maxWidth;
		this._domNode.style.maxWidth = this._maxWidth + 'px';
	}

	public setWidth(width: number): void {
		if (this._width === width) {
			return;
		}
		this._width = width;
		this._domNode.style.width = this._width + 'px';
	}

	public setHeight(height: number): void {
		if (this._height === height) {
			return;
		}
		this._height = height;
		this._domNode.style.height = this._height + 'px';
	}

	public setTop(top: number): void {
		if (this._top === top) {
			return;
		}
		this._top = top;
		this._domNode.style.top = this._top + 'px';
	}

	public setLeft(left: number): void {
		if (this._left === left) {
			return;
		}
		this._left = left;
		this._domNode.style.left = this._left + 'px';
	}

	public setBottom(bottom: number): void {
		if (this._bottom === bottom) {
			return;
		}
		this._bottom = bottom;
		this._domNode.style.bottom = this._bottom + 'px';
	}

	public setRight(right: number): void {
		if (this._right === right) {
			return;
		}
		this._right = right;
		this._domNode.style.right = this._right + 'px';
	}

	public setFontFamily(fontFamily: string): void {
		if (this._fontFamily === fontFamily) {
			return;
		}
		this._fontFamily = fontFamily;
		this._domNode.style.fontFamily = this._fontFamily;
	}

	public setFontWeight(fontWeight: string): void {
		if (this._fontWeight === fontWeight) {
			return;
		}
		this._fontWeight = fontWeight;
		this._domNode.style.fontWeight = this._fontWeight;
	}

	public setFontSize(fontSize: number): void {
		if (this._fontSize === fontSize) {
			return;
		}
		this._fontSize = fontSize;
		this._domNode.style.fontSize = this._fontSize + 'px';
	}

	public setLineHeight(lineHeight: number): void {
		if (this._lineHeight === lineHeight) {
			return;
		}
		this._lineHeight = lineHeight;
		this._domNode.style.lineHeight = this._lineHeight + 'px';
	}

	public setClassName(className: string): void {
		if (this._className === className) {
			return;
		}
		this._className = className;
		this._domNode.className = this._className;
	}

	public toggleClassName(className: string, shouldHaveIt?: boolean): void {
		dom.toggleClass(this._domNode, className, shouldHaveIt);
		this._className = this._domNode.className;
	}

	public setDisplay(display: string): void {
		if (this._display === display) {
			return;
		}
		this._display = display;
		this._domNode.style.display = this._display;
	}

	public setPosition(position: string): void {
		if (this._position === position) {
			return;
		}
		this._position = position;
		this._domNode.style.position = this._position;
	}

	public setVisibility(visibility: string): void {
		if (this._visibility === visibility) {
			return;
		}
		this._visibility = visibility;
		this._domNode.style.visibility = this._visibility;
	}

	public setTransform(transform: string): void {
		if (this._transform === transform) {
			return;
		}
		this._transform = transform;
		this._setTransform(this._domNode, this._transform);
	}

	protected abstract _setTransform(domNode: HTMLElement, transform: string): void;

	public setAttribute(name: string, value: string): void {
		this._domNode.setAttribute(name, value);
	}
}

class WebKitFastDomNode extends FastDomNode {
	protected _setTransform(domNode: HTMLElement, transform: string): void {
		(<any>domNode.style).webkitTransform = transform;
	}
}

class StandardFastDomNode extends FastDomNode {
	protected _setTransform(domNode: HTMLElement, transform: string): void {
		domNode.style.transform = transform;
	}
}

let useWebKitFastDomNode = false;
(function () {
	let testDomNode = document.createElement('div');
	if (typeof (<any>testDomNode.style).webkitTransform !== 'undefined') {
		useWebKitFastDomNode = true;
	}
})();
export function createFastDomNode(domNode: HTMLElement): FastDomNode {
	if (useWebKitFastDomNode) {
		return new WebKitFastDomNode(domNode);
	} else {
		return new StandardFastDomNode(domNode);
	}
}

export const StyleMutator = {
	setMaxWidth: (domNode: HTMLElement, maxWidth: number) => {
		let desiredValue = maxWidth + 'px';
		if (domNode.style.maxWidth !== desiredValue) {
			domNode.style.maxWidth = desiredValue;
		}
	},
	setWidth: (domNode: HTMLElement, width: number) => {
		let desiredValue = width + 'px';
		if (domNode.style.width !== desiredValue) {
			domNode.style.width = desiredValue;
		}
	},
	setHeight: (domNode: HTMLElement, height: number) => {
		let desiredValue = height + 'px';
		if (domNode.style.height !== desiredValue) {
			domNode.style.height = desiredValue;
		}
	},
	setTop: (domNode: HTMLElement, top: number) => {
		let desiredValue = top + 'px';
		if (domNode.style.top !== desiredValue) {
			domNode.style.top = desiredValue;
			return true;
		}
		return false;
	},
	setLeft: (domNode: HTMLElement, left: number) => {
		let desiredValue = left + 'px';
		if (domNode.style.left !== desiredValue) {
			domNode.style.left = desiredValue;
			return true;
		}
		return false;
	},
	setBottom: (domNode: HTMLElement, bottom: number) => {
		let desiredValue = bottom + 'px';
		if (domNode.style.bottom !== desiredValue) {
			domNode.style.bottom = desiredValue;
		}
	},
	setRight: (domNode: HTMLElement, right: number) => {
		let desiredValue = right + 'px';
		if (domNode.style.right !== desiredValue) {
			domNode.style.right = desiredValue;
		}
	},
	setFontSize: (domNode: HTMLElement, fontSize: number) => {
		let desiredValue = fontSize + 'px';
		if (domNode.style.fontSize !== desiredValue) {
			domNode.style.fontSize = desiredValue;
		}
	},
	setLineHeight: (domNode: HTMLElement, lineHeight: number) => {
		let desiredValue = lineHeight + 'px';
		if (domNode.style.lineHeight !== desiredValue) {
			domNode.style.lineHeight = desiredValue;
		}
	},
	setTransform: null,
	setDisplay: (domNode: HTMLElement, desiredValue: string) => {
		if (domNode.style.display !== desiredValue) {
			domNode.style.display = desiredValue;
		}
	},
	setVisibility: (domNode: HTMLElement, desiredValue: string) => {
		if (domNode.style.visibility !== desiredValue) {
			domNode.style.visibility = desiredValue;
		}
	},
};

// Define setTransform
function setWebkitTransform(domNode: HTMLElement, desiredValue: string): boolean {
	if (domNode.getAttribute('data-transform') !== desiredValue) {
		domNode.setAttribute('data-transform', desiredValue);
		(<any>domNode.style).webkitTransform = desiredValue;
		return true;
	}
	return false;
}
function setTransform(domNode: HTMLElement, desiredValue: string): boolean {
	if (domNode.getAttribute('data-transform') !== desiredValue) {
		domNode.setAttribute('data-transform', desiredValue);
		domNode.style.transform = desiredValue;
		return true;
	}
	return false;
}
(function () {
	let testDomNode = document.createElement('div');
	if (typeof (<any>testDomNode.style).webkitTransform !== 'undefined') {
		StyleMutator.setTransform = setWebkitTransform;
	} else {
		StyleMutator.setTransform = setTransform;
	}
})();
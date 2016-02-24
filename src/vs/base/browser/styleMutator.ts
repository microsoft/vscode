/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
		}
	},
	setLeft: (domNode: HTMLElement, left: number) => {
		let desiredValue = left + 'px';
		if (domNode.style.left !== desiredValue) {
			domNode.style.left = desiredValue;
		}
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
function setWebkitTransform(domNode: HTMLElement, desiredValue: string): void {
	if (domNode.getAttribute('data-transform') !== desiredValue) {
		domNode.setAttribute('data-transform', desiredValue);
		(<any>domNode.style).webkitTransform = desiredValue;
	}
}
function setTransform(domNode: HTMLElement, desiredValue: string): void {
	if (domNode.getAttribute('data-transform') !== desiredValue) {
		domNode.setAttribute('data-transform', desiredValue);
		domNode.style.transform = desiredValue;
	}
}
(function() {
	let testDomNode = document.createElement('div');
	if (typeof (<any>testDomNode.style).webkitTransform !== 'undefined') {
		StyleMutator.setTransform = setWebkitTransform;
	} else {
		StyleMutator.setTransform = setTransform;
	}
})();
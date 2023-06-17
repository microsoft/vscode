/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import 'vs/css!./aria';

// Use a max length since we are inserting the whole msg in the DOM and that can cause browsers to freeze for long messages #94233
const MAX_MESSAGE_LENGTH = 20000;
let ariaContainer: HTMLElement;
let alertContainer: HTMLElement;
let alertContainer2: HTMLElement;
let statusContainer: HTMLElement;
let statusContainer2: HTMLElement;
export function setARIAContainer(parent: HTMLElement) {
	ariaContainer = document.createElement('div');
	ariaContainer.className = 'monaco-aria-container';

	const createAlertContainer = () => {
		const element = document.createElement('div');
		element.className = 'monaco-alert';
		element.setAttribute('role', 'alert');
		element.setAttribute('aria-atomic', 'true');
		ariaContainer.appendChild(element);
		return element;
	};
	alertContainer = createAlertContainer();
	alertContainer2 = createAlertContainer();

	const createStatusContainer = () => {
		const element = document.createElement('div');
		element.className = 'monaco-status';
		element.setAttribute('role', 'complementary');
		element.setAttribute('aria-live', 'polite');
		element.setAttribute('aria-atomic', 'true');
		ariaContainer.appendChild(element);
		return element;
	};
	statusContainer = createStatusContainer();
	statusContainer2 = createStatusContainer();

	parent.appendChild(ariaContainer);
}
/**
 * Given the provided message, will make sure that it is read as alert to screen readers.
 */
export function alert(msg: string): void {
	if (!ariaContainer) {
		return;
	}

	// Use alternate containers such that duplicated messages get read out by screen readers #99466
	if (alertContainer.textContent !== msg) {
		dom.clearNode(alertContainer2);
		insertMessage(alertContainer, msg);
	} else {
		dom.clearNode(alertContainer);
		insertMessage(alertContainer2, msg);
	}
}

/**
 * Given the provided message, will make sure that it is read as status to screen readers.
 */
export function status(msg: string): void {
	if (!ariaContainer) {
		return;
	}

	if (statusContainer.textContent !== msg) {
		dom.clearNode(statusContainer2);
		insertMessage(statusContainer, msg);
	} else {
		dom.clearNode(statusContainer);
		insertMessage(statusContainer2, msg);
	}
}

function insertMessage(target: HTMLElement, msg: string): void {
	dom.clearNode(target);
	if (msg.length > MAX_MESSAGE_LENGTH) {
		msg = msg.substr(0, MAX_MESSAGE_LENGTH);
	}
	target.textContent = msg;

	// See https://www.paciellogroup.com/blog/2012/06/html5-accessibility-chops-aria-rolealert-browser-support/
	target.style.visibility = 'hidden';
	target.style.visibility = 'visible';
}

// Copied from @types/react which original came from https://www.w3.org/TR/wai-aria-1.1/#role_definitions
export type AriaRole =
	| 'alert'
	| 'alertdialog'
	| 'application'
	| 'article'
	| 'banner'
	| 'button'
	| 'cell'
	| 'checkbox'
	| 'columnheader'
	| 'combobox'
	| 'complementary'
	| 'contentinfo'
	| 'definition'
	| 'dialog'
	| 'directory'
	| 'document'
	| 'feed'
	| 'figure'
	| 'form'
	| 'grid'
	| 'gridcell'
	| 'group'
	| 'heading'
	| 'img'
	| 'link'
	| 'list'
	| 'listbox'
	| 'listitem'
	| 'log'
	| 'main'
	| 'marquee'
	| 'math'
	| 'menu'
	| 'menubar'
	| 'menuitem'
	| 'menuitemcheckbox'
	| 'menuitemradio'
	| 'navigation'
	| 'none'
	| 'note'
	| 'option'
	| 'presentation'
	| 'progressbar'
	| 'radio'
	| 'radiogroup'
	| 'region'
	| 'row'
	| 'rowgroup'
	| 'rowheader'
	| 'scrollbar'
	| 'search'
	| 'searchbox'
	| 'separator'
	| 'slider'
	| 'spinbutton'
	| 'status'
	| 'switch'
	| 'tab'
	| 'table'
	| 'tablist'
	| 'tabpanel'
	| 'term'
	| 'textbox'
	| 'timer'
	| 'toolbar'
	| 'tooltip'
	| 'tree'
	| 'treegrid'
	| 'treeitem'
	| (string & {}) // Prevent type collapsing to `string`
	;

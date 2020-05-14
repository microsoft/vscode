/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./hover';
import * as dom from 'vs/base/browser/dom';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';

const $ = dom.$;

export class HoverWidget extends Disposable {

	public readonly containerDomNode: HTMLElement;
	public readonly domNode: HTMLElement;
	private readonly _scrollbar: DomScrollableElement;

	constructor() {
		super();

		this.containerDomNode = document.createElement('div');
		this.containerDomNode.classList.add('terminal-hover-widget', 'fadeIn', 'monaco-editor-hover', 'xterm-hover');
		this.containerDomNode.tabIndex = 0;
		this.containerDomNode.setAttribute('role', 'tooltip');

		this.domNode = document.createElement('div');
		this.domNode.className = 'monaco-editor-hover-content';

		this._scrollbar = this._register(new DomScrollableElement(this.domNode, {}));
		this.containerDomNode.appendChild(this._scrollbar.getDomNode());
	}

	public onContentsChange(): void {
		this._scrollbar.scanDomNode();
	}
}

export function renderHoverAction(parent: HTMLElement, actionOptions: { label: string, iconClass?: string, run: (target: HTMLElement) => void, commandId: string }, keybindingLabel: string | null): IDisposable {
	const actionContainer = dom.append(parent, $('div.action-container'));
	const action = dom.append(actionContainer, $('a.action'));
	action.setAttribute('href', '#');
	action.setAttribute('role', 'button');
	if (actionOptions.iconClass) {
		dom.append(action, $(`span.icon.${actionOptions.iconClass}`));
	}
	const label = dom.append(action, $('span'));
	label.textContent = keybindingLabel ? `${actionOptions.label} (${keybindingLabel})` : actionOptions.label;
	return dom.addDisposableListener(actionContainer, dom.EventType.CLICK, e => {
		e.stopPropagation();
		e.preventDefault();
		actionOptions.run(actionContainer);
	});
}

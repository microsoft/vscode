/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./hover';
import * as dom from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { IDisposable } from 'vs/base/common/lifecycle';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';

const $ = dom.$;

export abstract class BaseHoverWidget extends Widget {
	protected readonly _containerDomNode: HTMLElement;
	protected readonly _domNode: HTMLElement;
	private readonly _scrollbar: DomScrollableElement;

	constructor() {
		super();

		this._containerDomNode = document.createElement('div');
		this._containerDomNode.classList.add('terminal-hover-widget', 'fadeIn', 'monaco-editor-hover', 'xterm-hover');
		this._containerDomNode.tabIndex = 0;
		this._containerDomNode.setAttribute('role', 'tooltip');

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-editor-hover-content';

		this._scrollbar = new DomScrollableElement(this._domNode, {});
		this._register(this._scrollbar);
		this._containerDomNode.appendChild(this._scrollbar.getDomNode());
	}

	protected _onContentsChange(): void {
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

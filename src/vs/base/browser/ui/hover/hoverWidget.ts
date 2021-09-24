/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./hover';

const $ = dom.$;

export const enum HoverPosition {
	LEFT, RIGHT, BELOW, ABOVE
}

export class HoverWidget extends Disposable {

	public readonly containerDomNode: HTMLElement;
	public readonly contentsDomNode: HTMLElement;
	private readonly _scrollbar: DomScrollableElement;

	constructor() {
		super();

		this.containerDomNode = document.createElement('div');
		this.containerDomNode.className = 'monaco-hover';
		this.containerDomNode.tabIndex = 0;
		this.containerDomNode.setAttribute('role', 'tooltip');

		this.contentsDomNode = document.createElement('div');
		this.contentsDomNode.className = 'monaco-hover-content';

		this._scrollbar = this._register(new DomScrollableElement(this.contentsDomNode, {
			consumeMouseWheelIfScrollbarIsNeeded: true
		}));
		this.containerDomNode.appendChild(this._scrollbar.getDomNode());
	}

	public onContentsChanged(): void {
		this._scrollbar.scanDomNode();
	}
}

export class HoverAction extends Disposable {
	public static render(parent: HTMLElement, actionOptions: { label: string, iconClass?: string, run: (target: HTMLElement) => void, commandId: string }, keybindingLabel: string | null) {
		return new HoverAction(parent, actionOptions, keybindingLabel);
	}

	private readonly actionContainer: HTMLElement;
	private readonly action: HTMLElement;

	private constructor(parent: HTMLElement, actionOptions: { label: string, iconClass?: string, run: (target: HTMLElement) => void, commandId: string }, keybindingLabel: string | null) {
		super();

		this.actionContainer = dom.append(parent, $('div.action-container'));
		this.action = dom.append(this.actionContainer, $('a.action'));
		this.action.setAttribute('href', '#');
		this.action.setAttribute('role', 'button');
		if (actionOptions.iconClass) {
			dom.append(this.action, $(`span.icon.${actionOptions.iconClass}`));
		}
		const label = dom.append(this.action, $('span'));
		label.textContent = keybindingLabel ? `${actionOptions.label} (${keybindingLabel})` : actionOptions.label;

		this._register(dom.addDisposableListener(this.actionContainer, dom.EventType.MOUSE_DOWN, e => {
			e.stopPropagation();
			e.preventDefault();
			actionOptions.run(this.actionContainer);
		}));

		this.setEnabled(true);
	}

	public setEnabled(enabled: boolean): void {
		if (enabled) {
			this.actionContainer.classList.remove('disabled');
			this.actionContainer.removeAttribute('aria-disabled');
		} else {
			this.actionContainer.classList.add('disabled');
			this.actionContainer.setAttribute('aria-disabled', 'true');
		}
	}
}

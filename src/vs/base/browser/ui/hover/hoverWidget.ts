/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./hover';
import { localize } from 'vs/nls';

const $ = dom.$;

export const enum HoverPosition {
	LEFT, RIGHT, BELOW, ABOVE
}

export class HoverWidget extends Disposable {

	public readonly containerDomNode: HTMLElement;
	public readonly contentsDomNode: HTMLElement;
	public readonly scrollbar: DomScrollableElement;

	constructor() {
		super();

		this.containerDomNode = document.createElement('div');
		this.containerDomNode.className = 'monaco-hover';
		this.containerDomNode.tabIndex = 0;
		this.containerDomNode.setAttribute('role', 'tooltip');

		this.contentsDomNode = document.createElement('div');
		this.contentsDomNode.className = 'monaco-hover-content';

		this.scrollbar = this._register(new DomScrollableElement(this.contentsDomNode, {
			consumeMouseWheelIfScrollbarIsNeeded: true
		}));
		this.containerDomNode.appendChild(this.scrollbar.getDomNode());
	}

	public onContentsChanged(): void {
		this.scrollbar.scanDomNode();
	}
}

export class HoverAction extends Disposable {
	public static render(parent: HTMLElement, actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string }, keybindingLabel: string | null) {
		return new HoverAction(parent, actionOptions, keybindingLabel);
	}

	private readonly _actionContainer: HTMLElement;
	private readonly _action: HTMLElement;

	private constructor(parent: HTMLElement, actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string }, keybindingLabel: string | null) {
		super();

		this._actionContainer = dom.append(parent, $('div.action-container'));
		this._actionContainer.setAttribute('tabindex', '0');

		this._action = dom.append(this._actionContainer, $('a.action'));
		this._action.setAttribute('role', 'button');
		if (actionOptions.iconClass) {
			dom.append(this._action, $(`span.icon.${actionOptions.iconClass}`));
		}
		const label = dom.append(this._action, $('span'));
		label.textContent = keybindingLabel ? `${actionOptions.label} (${keybindingLabel})` : actionOptions.label;

		this._register(dom.addDisposableListener(this._actionContainer, dom.EventType.CLICK, e => {
			e.stopPropagation();
			e.preventDefault();
			actionOptions.run(this._actionContainer);
		}));

		this._register(dom.addDisposableListener(this._actionContainer, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				e.stopPropagation();
				e.preventDefault();
				actionOptions.run(this._actionContainer);
			}
		}));

		this.setEnabled(true);
	}

	public setEnabled(enabled: boolean): void {
		if (enabled) {
			this._actionContainer.classList.remove('disabled');
			this._actionContainer.removeAttribute('aria-disabled');
		} else {
			this._actionContainer.classList.add('disabled');
			this._actionContainer.setAttribute('aria-disabled', 'true');
		}
	}

	public get actionContainer(): HTMLElement {
		return this._actionContainer;
	}
}

export function getHoverAccessibleViewHint(shouldHaveHint?: boolean, keybinding?: string | null): string | undefined {
	return shouldHaveHint && keybinding ? localize('acessibleViewHint', "Inspect this in the accessible view with {0}.", keybinding) : shouldHaveHint ? localize('acessibleViewHintNoKbOpen', "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.") : '';
}

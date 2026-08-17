/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { $ } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

/**
 * A compact on/off switch for turning a customization on or off directly from a list row.
 *
 * Enablement used to be reachable only through a right-click menu, which meant the most common
 * thing someone wants to do with a server was also the least discoverable. This gives every row
 * one control in one place, so the eye learns a single target while scanning a long list.
 *
 * The widget is deliberately dumb: it renders state and reports intent. Callers decide what
 * toggling means, and own any hover text, because the surrounding scope rules differ per list.
 */
export class EnablementSwitch extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidToggle = this._register(new Emitter<void>());
	/** Fired when the user asks to flip the switch. The caller applies the change. */
	readonly onDidToggle: Event<void> = this._onDidToggle.event;

	private _checked = false;

	constructor(parent: HTMLElement) {
		super();

		// A real <button role="switch"> rather than a styled div: it is focusable, announces its
		// on/off state, and responds to Enter and Space without us reimplementing any of it.
		this.element = DOM.append(parent, $('button.ai-customization-switch'));
		this.element.setAttribute('role', 'switch');
		this.element.setAttribute('type', 'button');
		// A bare <button> is focusable, but List.onTab finds the control inside a row with
		// querySelector('[tabIndex]'), which only matches the content attribute. Assigning the
		// property reflects it, so Tab from the row reaches the switch.
		this.element.tabIndex = 0;
		DOM.append(this.element, $('span.ai-customization-switch-knob'));

		this._register(DOM.addDisposableListener(this.element, DOM.EventType.CLICK, e => {
			// Rows react to clicks too; a click on the switch is about the switch alone.
			e.stopPropagation();
			e.preventDefault();
			this._onDidToggle.fire();
		}));

		// Space would otherwise scroll the list before the button ever sees it.
		this._register(DOM.addDisposableListener(this.element, DOM.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
				event.stopPropagation();
				event.preventDefault();
				this._onDidToggle.fire();
			}
		}));
	}

	/** Rows share one template, so the switch is hidden rather than rebuilt when a row has none. */
	setVisible(visible: boolean): void {
		this.element.style.display = visible ? '' : 'none';
	}

	get checked(): boolean {
		return this._checked;
	}

	/**
	 * @param checked whether the customization is currently on.
	 * @param ariaLabel the customization this switch acts on. Deliberately the subject rather
	 * than the act: `role="switch"` announces on/off from `aria-checked`, so an action phrase
	 * would read "Disable Redis, switch, on" -- a label arguing with the state beside it.
	 */
	update(checked: boolean, ariaLabel: string): void {
		this._checked = checked;
		this.element.classList.toggle('checked', checked);
		this.element.setAttribute('aria-checked', String(checked));
		this.element.setAttribute('aria-label', ariaLabel);
	}
}

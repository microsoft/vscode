/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { DomScrollableElement } from '../scrollbar/scrollableElement.js';
import { KeyCode } from '../../../common/keyCodes.js';
import type { Event } from '../../../common/event.js';
import { Disposable } from '../../../common/lifecycle.js';
import './hoverWidget.css';
import { localize } from '../../../../nls.js';

const $ = dom.$;

export const enum HoverPosition {
	LEFT,
	RIGHT,
	BELOW,
	ABOVE,
}

export class HoverWidget extends Disposable {

	public readonly containerDomNode: HTMLElement;
	public readonly contentsDomNode: HTMLElement;
	public readonly scrollbar: DomScrollableElement;

	constructor(fadeIn: boolean) {
		super();

		this.containerDomNode = document.createElement('div');
		this.containerDomNode.className = 'monaco-hover';
		this.containerDomNode.classList.toggle('fade-in', !!fadeIn);
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

interface IHoverActionOptions {
	readonly label: string;
	readonly iconClass?: string;
	readonly commandId: string;
	/** Fires when {@link label} or {@link iconClass} change, re-rendering the action in place. */
	readonly onDidChange?: Event<void>;
	run(target: HTMLElement): void;
}

export class HoverAction extends Disposable {
	public static render(parent: HTMLElement, actionOptions: IHoverActionOptions, keybindingLabel: string | null) {
		return new HoverAction(parent, actionOptions, keybindingLabel);
	}

	private _actionLabel = '';
	public get actionLabel(): string { return this._actionLabel; }
	public readonly actionKeybindingLabel: string | null;

	private _actionRenderedLabel = '';
	public get actionRenderedLabel(): string { return this._actionRenderedLabel; }
	public readonly actionContainer: HTMLElement;

	private readonly action: HTMLElement;

	private constructor(parent: HTMLElement, actionOptions: IHoverActionOptions, keybindingLabel: string | null) {
		super();

		this.actionKeybindingLabel = keybindingLabel;

		this.actionContainer = dom.append(parent, $('div.action-container'));
		this.actionContainer.setAttribute('tabindex', '0');

		this.action = dom.append(this.actionContainer, $('a.action'));
		this.action.setAttribute('role', 'button');
		this.renderContents(actionOptions);
		if (actionOptions.onDidChange) {
			this._store.add(actionOptions.onDidChange(() => this.renderContents(actionOptions)));
		}

		this._store.add(new ClickAction(this.actionContainer, actionOptions.run));
		this._store.add(new KeyDownAction(this.actionContainer, actionOptions.run, [KeyCode.Enter, KeyCode.Space]));
		this.setEnabled(true);
	}

	private renderContents(actionOptions: IHoverActionOptions): void {
		this._actionLabel = actionOptions.label;
		this._actionRenderedLabel = this.actionKeybindingLabel ? `${actionOptions.label} (${this.actionKeybindingLabel})` : actionOptions.label;
		const children: HTMLElement[] = [];
		if (actionOptions.iconClass) {
			const iconElement = $('span.icon');
			iconElement.classList.add(...actionOptions.iconClass.split(' '));
			children.push(iconElement);
		}
		const label = $('span');
		label.textContent = this._actionRenderedLabel;
		children.push(label);
		this.action.replaceChildren(...children);
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

export function getHoverAccessibleViewHint(shouldHaveHint?: boolean, keybinding?: string | null): string | undefined {
	return shouldHaveHint && keybinding ? localize('acessibleViewHint', "Inspect this in the accessible view with {0}.", keybinding) : shouldHaveHint ? localize('acessibleViewHintNoKbOpen', "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.") : '';
}

export class ClickAction extends Disposable {
	constructor(container: HTMLElement, run: (container: HTMLElement) => void) {
		super();
		this._register(dom.addDisposableListener(container, dom.EventType.CLICK, e => {
			e.stopPropagation();
			e.preventDefault();
			run(container);
		}));
	}
}

export class KeyDownAction extends Disposable {
	constructor(container: HTMLElement, run: (container: HTMLElement) => void, keyCodes: KeyCode[]) {
		super();
		this._register(dom.addDisposableListener(container, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (keyCodes.some(keyCode => event.equals(keyCode))) {
				e.stopPropagation();
				e.preventDefault();
				run(container);
			}
		}));
	}
}

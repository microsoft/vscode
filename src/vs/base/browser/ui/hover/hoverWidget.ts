/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { DomScrollableElement } from '../scrollbar/scrollableElement.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../common/lifecycle.js';
import './hoverWidget.css';
import { localize } from '../../../../nls.js';

const $ = dom.$;

// Distance in pixels from the top/bottom edge of the hover's scrollable content
// at which dragging a selection starts auto-scrolling it.
const SELECTION_SCROLL_EDGE_THRESHOLD = 20;

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

	private readonly _selectionScrollDisposables = this._register(new DisposableStore());
	private _selectionScrollMouseY: number | undefined;

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

		this._register(dom.addDisposableListener(this.contentsDomNode, dom.EventType.MOUSE_DOWN, e => this._trackSelectionScroll(e)));
	}

	public onContentsChanged(): void {
		this.scrollbar.scanDomNode();
	}

	// Auto-scroll the hover's content while the user drags a text selection past its top/bottom edge,
	// mirroring how a normal scrollable text area behaves.
	private _trackSelectionScroll(e: MouseEvent): void {
		if (e.button !== 0) {
			return;
		}
		this._selectionScrollDisposables.clear();
		const targetWindow = dom.getWindow(e);
		this._selectionScrollDisposables.add(dom.addDisposableListener(targetWindow, dom.EventType.MOUSE_MOVE, (moveEvent: MouseEvent) => {
			if (moveEvent.buttons === 0) {
				this._selectionScrollDisposables.clear();
				this._selectionScrollMouseY = undefined;
				return;
			}
			this._selectionScrollMouseY = moveEvent.pageY;
		}));
		this._selectionScrollDisposables.add(dom.animate(targetWindow, () => this._scrollWhileSelecting()));
		this._selectionScrollDisposables.add(dom.addDisposableListener(targetWindow, dom.EventType.MOUSE_UP, () => {
			this._selectionScrollDisposables.clear();
			this._selectionScrollMouseY = undefined;
		}));
	}

	private _scrollWhileSelecting(): void {
		if (this._selectionScrollMouseY === undefined) {
			return;
		}
		const { top, height } = dom.getDomNodePagePosition(this.contentsDomNode);
		const distanceFromTop = this._selectionScrollMouseY - top;
		const distanceFromBottom = (top + height) - this._selectionScrollMouseY;
		let delta = 0;
		if (distanceFromTop < SELECTION_SCROLL_EDGE_THRESHOLD) {
			delta = Math.max(-14, Math.floor(0.3 * (distanceFromTop - SELECTION_SCROLL_EDGE_THRESHOLD)));
		} else if (distanceFromBottom < SELECTION_SCROLL_EDGE_THRESHOLD) {
			delta = Math.min(14, Math.floor(0.3 * (SELECTION_SCROLL_EDGE_THRESHOLD - distanceFromBottom)));
		}
		if (delta !== 0) {
			const scrollTop = this.scrollbar.getScrollPosition().scrollTop;
			this.scrollbar.setScrollPosition({ scrollTop: scrollTop + delta });
		}
	}
}

export class HoverAction extends Disposable {
	public static render(parent: HTMLElement, actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string }, keybindingLabel: string | null) {
		return new HoverAction(parent, actionOptions, keybindingLabel);
	}

	public readonly actionLabel: string;
	public readonly actionKeybindingLabel: string | null;

	public readonly actionRenderedLabel: string;
	public readonly actionContainer: HTMLElement;

	private readonly action: HTMLElement;

	private constructor(parent: HTMLElement, actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string }, keybindingLabel: string | null) {
		super();

		this.actionLabel = actionOptions.label;
		this.actionKeybindingLabel = keybindingLabel;

		this.actionContainer = dom.append(parent, $('div.action-container'));
		this.actionContainer.setAttribute('tabindex', '0');

		this.action = dom.append(this.actionContainer, $('a.action'));
		this.action.setAttribute('role', 'button');
		if (actionOptions.iconClass) {
			const iconElement = dom.append(this.action, $(`span.icon`));
			iconElement.classList.add(...actionOptions.iconClass.split(' '));
		}
		this.actionRenderedLabel = keybindingLabel ? `${actionOptions.label} (${keybindingLabel})` : actionOptions.label;
		const label = dom.append(this.action, $('span'));
		label.textContent = this.actionRenderedLabel;

		this._store.add(new ClickAction(this.actionContainer, actionOptions.run));
		this._store.add(new KeyDownAction(this.actionContainer, actionOptions.run, [KeyCode.Enter, KeyCode.Space]));
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

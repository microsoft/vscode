/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileSessionFilterChips.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { EventType } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';

const $ = DOM.$;

/** Phone-only Sort and Find actions for the sessions list. */
export class MobileSessionFilterChips extends Disposable {

	private readonly container: HTMLElement;
	/**
	 * Inner horizontally scrollable region that hosts the "Sort" chip. The "Find" chip lives OUTSIDE
	 * this scroll area, pinned to the right edge of {@link container} so
	 * it's always reachable on phone-width viewports without scrolling.
	 */
	private readonly scrollContainer: HTMLElement;
	private readonly chipDisposables = this._register(new DisposableStore());

	private readonly _onDidRequestSortGroup = this._register(new Emitter<HTMLElement>());
	/**
	 * Fired when the user taps the "Sort" chip. The argument is
	 * the chip's DOM element so the host can anchor a sheet/menu to it.
	 */
	readonly onDidRequestSortGroup: Event<HTMLElement> = this._onDidRequestSortGroup.event;

	private readonly _onDidRequestFind = this._register(new Emitter<void>());
	/**
	 * Fired when the user taps the "Find" chip. The host should open the
	 * sessions find widget.
	 */
	readonly onDidRequestFind: Event<void> = this._onDidRequestFind.event;

	constructor(parent: HTMLElement) {
		super();

		this.container = DOM.append(parent, $('.mobile-session-filter-chips'));
		this.container.setAttribute('role', 'toolbar');
		this.container.setAttribute('aria-label', localize('sessionListActions', "Session list actions"));

		this.scrollContainer = DOM.append(this.container, $('.mobile-session-filter-chips-scroll'));

		this.renderChips();
	}

	private renderChips(): void {
		this.chipDisposables.clear();
		DOM.clearNode(this.scrollContainer);
		// The Find chip lives directly on `container` (sibling of
		// `scrollContainer`) so we need to remove it too on re-render.
		// `scrollContainer` itself must be preserved.
		for (const child of Array.from(this.container.children)) {
			if (child !== this.scrollContainer) {
				child.remove();
			}
		}

		this.createSortGroupChip();
		this.createFindChip();
	}

	private createSortGroupChip(): void {
		const chip = DOM.append(this.scrollContainer, $('.mobile-session-filter-chip.mobile-session-filter-chip-action'));
		chip.setAttribute('role', 'button');
		chip.setAttribute('tabindex', '0');
		chip.setAttribute('aria-label', localize('sortGroupAriaLabel', "Sort and group options"));

		const icon = DOM.append(chip, $('span.chip-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.listFilter));

		const label = DOM.append(chip, $('span.chip-label'));
		label.textContent = localize('sortGroup', "Sort");

		const fire = () => this._onDidRequestSortGroup.fire(chip);

		this.chipDisposables.add(Gesture.addTarget(chip));
		this.chipDisposables.add(DOM.addDisposableListener(chip, EventType.CLICK, (e) => {
			e.preventDefault();
			fire();
		}));
		this.chipDisposables.add(DOM.addDisposableListener(chip, TouchEventType.Tap, () => {
			fire();
		}));

		this.chipDisposables.add(DOM.addDisposableListener(chip, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fire();
			}
		}));
	}

	private createFindChip(): void {
		const chip = DOM.append(this.container, $('.mobile-session-filter-chip.mobile-session-filter-chip-action.icon-only'));
		chip.setAttribute('role', 'button');
		chip.setAttribute('tabindex', '0');
		chip.setAttribute('aria-label', localize('findAriaLabel', "Find session"));

		const icon = DOM.append(chip, $('span.chip-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.search));

		const fire = () => this._onDidRequestFind.fire();

		this.chipDisposables.add(Gesture.addTarget(chip));
		this.chipDisposables.add(DOM.addDisposableListener(chip, EventType.CLICK, (e) => {
			e.preventDefault();
			fire();
		}));
		this.chipDisposables.add(DOM.addDisposableListener(chip, TouchEventType.Tap, () => {
			fire();
		}));

		this.chipDisposables.add(DOM.addDisposableListener(chip, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fire();
			}
		}));
	}

	get element(): HTMLElement {
		return this.container;
	}
}

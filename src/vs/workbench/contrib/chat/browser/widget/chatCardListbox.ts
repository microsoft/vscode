/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The ARIA scaffolding for the small single select lists inside chat cards.
 *
 * Keeps the active row's class, `aria-selected`, and `aria-activedescendant` in agreement, which is
 * silent to get wrong. Keyboard handling and row rendering stay with the caller, since the
 * consumers differ on wrapping, digit shortcuts, and what a selection change commits.
 */
export class ChatCardListbox {

	private readonly options: HTMLElement[] = [];
	private _activeIndex = -1;

	constructor(
		readonly domNode: HTMLElement,
		ariaLabel: string,
		/** Class toggled on the active row. */
		private readonly activeClass: string,
	) {
		this.domNode.setAttribute('role', 'listbox');
		this.domNode.setAttribute('aria-label', ariaLabel);
		this.domNode.tabIndex = 0;
	}

	get activeIndex(): number {
		return this._activeIndex;
	}

	get length(): number {
		return this.options.length;
	}

	/**
	 * Registers a row as an option. The element is given an id, because
	 * `aria-activedescendant` can only refer to one.
	 */
	addOption(element: HTMLElement, idPrefix: string): void {
		element.id = `${idPrefix}-option-${this.options.length}`;
		element.setAttribute('role', 'option');
		element.setAttribute('aria-selected', 'false');
		this.options.push(element);
	}

	/** Moves the active option. Pass -1 to clear it, which some callers use for freeform input. */
	setActive(index: number): void {
		this._activeIndex = index;
		this.options.forEach((option, i) => {
			const isActive = i === index;
			option.classList.toggle(this.activeClass, isActive);
			option.setAttribute('aria-selected', String(isActive));
		});

		const active = this.options[index];
		if (active) {
			this.domNode.setAttribute('aria-activedescendant', active.id);
		} else {
			this.domNode.removeAttribute('aria-activedescendant');
		}
	}

	/**
	 * Focuses the container. `aria-activedescendant` is only honoured on the element that actually
	 * has DOM focus, so focus must never move into an option or arrowing goes unannounced.
	 */
	focus(): void {
		this.domNode.focus();
	}

	/** Clamps to the ends, matching the workbench lists. */
	clampedIndex(index: number): number {
		return Math.max(0, Math.min(index, this.options.length - 1));
	}

	/** Wraps around the ends. */
	wrappedIndex(index: number): number {
		if (this.options.length === 0) {
			return -1;
		}
		return (index + this.options.length) % this.options.length;
	}
}

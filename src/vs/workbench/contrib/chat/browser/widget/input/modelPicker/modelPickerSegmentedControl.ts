/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';

export interface ISegmentedOption {
	readonly label: string;
	/** Hover text and, with the label, the accessible name. */
	readonly description?: string;
	readonly checked: boolean;
}

export interface ISegmentedControlOptions {
	readonly ariaLabel: string;
	readonly options: readonly ISegmentedOption[];
	readonly onSelect: (index: number) => void;
}

/**
 * A row of short mutually exclusive choices, e.g. how hard a model thinks or how Auto
 * routes. The row sits in a recessed track with the chosen option raised out of it, so
 * the options that are not chosen still read as things you can press.
 *
 * One tab stop for the whole row and arrows move within it, but choosing takes Enter or
 * Space. Committing on arrow would be right for a cheap, reversible choice; these
 * settings close the picker, so the user has to be able to travel past an option
 * without picking it.
 */
export class SegmentedControl extends Disposable {

	readonly domNode = dom.$('.chat-model-picker-segments');

	private readonly _segments: HTMLButtonElement[] = [];

	constructor(options: ISegmentedControlOptions) {
		super();
		this.domNode.setAttribute('role', 'radiogroup');
		this.domNode.ariaLabel = options.ariaLabel;

		const segments = this._segments;
		// Arrows move the focus without committing. Selecting is what closes the picker,
		// so committing on the way past would strand the user on whichever option they
		// arrowed onto first.
		const focus = (index: number) => {
			for (const [candidate, segment] of segments.entries()) {
				segment.tabIndex = candidate === index ? 0 : -1;
			}
			segments[index].focus();
		};
		for (const [index, option] of options.options.entries()) {
			const segment = dom.append(this.domNode, dom.$<HTMLButtonElement>('button.chat-model-picker-segment'));
			segment.type = 'button';
			segment.textContent = option.label;
			segment.classList.toggle('checked', option.checked);
			segment.setAttribute('role', 'radio');
			segment.setAttribute('aria-checked', String(option.checked));
			segment.tabIndex = option.checked ? 0 : -1;
			if (option.description) {
				segment.title = option.description;
				segment.ariaLabel = `${option.label}, ${option.description}`;
			}
			segments.push(segment);

			this._register(dom.addDisposableListener(segment, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				options.onSelect(index);
			}));
			this._register(dom.addDisposableListener(segment, dom.EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					dom.EventHelper.stop(e, true);
					options.onSelect(index);
					return;
				}
				const delta = event.equals(KeyCode.RightArrow) ? 1 : event.equals(KeyCode.LeftArrow) ? -1 : 0;
				if (delta === 0) {
					return;
				}
				dom.EventHelper.stop(e, true);
				focus((index + delta + segments.length) % segments.length);
			}));
		}
	}

	/** Focuses the chosen option, for callers that rebuild the row after a selection. */
	focusChecked(): void {
		this._segments.find(segment => segment.classList.contains('checked'))?.focus();
	}

}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import type { IManagedHover } from '../hover/hover.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../iconLabel/iconLabels.js';
import { Disposable } from '../../../common/lifecycle.js';
import * as objects from '../../../common/objects.js';

/**
 * A range to be highlighted.
 */
export interface IHighlight {
	start: number;
	end: number;
	readonly extraClasses?: readonly string[];
}

export interface IHighlightedLabelOptions {

	/**
	 * Whether the label supports rendering icons.
	 */
	readonly supportIcons?: boolean;

	readonly hoverDelegate?: IHoverDelegate;
}

/**
 * A widget which can render a label with substring highlights, often
 * originating from a filter function like the fuzzy matcher.
 */
export class HighlightedLabel extends Disposable {

	private readonly domNode: HTMLElement;
	private text: string = '';
	private title: string = '';
	private highlights: readonly IHighlight[] = [];
	private supportIcons: boolean;
	private didEverRender: boolean = false;
	private customHover: IManagedHover | undefined;

	/**
	 * Create a new {@link HighlightedLabel}.
	 *
	 * @param container The parent container to append to.
	 */
	constructor(container: HTMLElement, private readonly options?: IHighlightedLabelOptions) {
		super();

		this.supportIcons = options?.supportIcons ?? false;
		this.domNode = dom.append(container, dom.$('span.monaco-highlighted-label'));
	}

	/**
	 * The label's DOM node.
	 */
	get element(): HTMLElement {
		return this.domNode;
	}

	/**
	 * Set the label and highlights.
	 *
	 * @param text The label to display.
	 * @param highlights The ranges to highlight.
	 * @param title An optional title for the hover tooltip.
	 * @param escapeNewLines Whether to escape new lines.
	 * @returns
	 */
	set(text: string | undefined, highlights: readonly IHighlight[] = [], title: string = '', escapeNewLines?: boolean) {
		if (!text) {
			text = '';
		}

		if (escapeNewLines) {
			// adjusts highlights inplace
			text = HighlightedLabel.escapeNewLines(text, highlights);
		}

		if (this.didEverRender && this.text === text && this.title === title && objects.equals(this.highlights, highlights)) {
			return;
		}

		this.text = text;
		this.title = title;
		this.highlights = highlights;
		this.render();
	}

	private render(): void {

		const children: Array<HTMLSpanElement | string> = [];
		let pos = 0;

		for (const highlight of this.highlights) {
			if (highlight.end === highlight.start) {
				continue;
			}

			if (pos < highlight.start) {
				const substring = this.text.substring(pos, highlight.start);
				if (this.supportIcons) {
					children.push(...renderLabelWithIcons(substring));
				} else {
					children.push(substring);
				}
				pos = highlight.start;
			}

			const substring = this.text.substring(pos, highlight.end);
			const element = dom.$('span.highlight', undefined, ...this.supportIcons ? renderLabelWithIcons(substring) : [substring]);

			if (highlight.extraClasses) {
				element.classList.add(...highlight.extraClasses);
			}

			children.push(element);
			pos = highlight.end;
		}

		if (pos < this.text.length) {
			const substring = this.text.substring(pos,);
			if (this.supportIcons) {
				children.push(...renderLabelWithIcons(substring));
			} else {
				children.push(substring);
			}
		}

		dom.reset(this.domNode, ...children);

		if (this.options?.hoverDelegate?.showNativeHover) {
			/* While custom hover is not inside custom hover */
			this.domNode.title = this.title;
		} else {
			if (!this.customHover && this.title !== '') {
				const hoverDelegate = this.options?.hoverDelegate ?? getDefaultHoverDelegate('mouse');
				this.customHover = this._register(getBaseLayerHoverDelegate().setupManagedHover(hoverDelegate, this.domNode, this.title));
			} else if (this.customHover) {
				this.customHover.update(this.title);
			}
		}

		this.didEverRender = true;
	}

	static escapeNewLines(text: string, highlights: readonly IHighlight[]): string {
		let total = 0;
		let extra = 0;

		return text.replace(/\r\n|\r|\n/g, (match, offset) => {
			extra = match === '\r\n' ? -1 : 0;
			offset += total;

			for (const highlight of highlights) {
				if (highlight.end <= offset) {
					continue;
				}
				if (highlight.start >= offset) {
					highlight.start += extra;
				}
				if (highlight.end >= offset) {
					highlight.end += extra;
				}
			}

			total += extra;
			return '\u23CE';
		});
	}
}

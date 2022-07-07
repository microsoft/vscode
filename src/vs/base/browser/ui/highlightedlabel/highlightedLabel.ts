/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import * as objects from 'vs/base/common/objects';

/**
 * A range to be highlighted.
 */
export interface IHighlight {
	start: number;
	end: number;
	extraClasses?: string[];
}

export interface IOptions {

	/**
	 * Whether
	 */
	readonly supportIcons?: boolean;
}

/**
 * A widget which can render a label with substring highlights, often
 * originating from a filter function like the fuzzy matcher.
 */
export class HighlightedLabel {

	private readonly domNode: HTMLElement;
	private text: string = '';
	private title: string = '';
	private highlights: IHighlight[] = [];
	private supportIcons: boolean;
	private didEverRender: boolean = false;

	/**
	 * Create a new {@link HighlightedLabel}.
	 *
	 * @param container The parent container to append to.
	 */
	constructor(container: HTMLElement, options?: IOptions) {
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
	set(text: string | undefined, highlights: IHighlight[] = [], title: string = '', escapeNewLines?: boolean) {
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

		const children: HTMLSpanElement[] = [];
		let pos = 0;

		for (const highlight of this.highlights) {
			let { start, end } = highlight;
			if (end === start) {
				continue;
			}

			// First get everything leading up to the highlight
			if (pos < start) {
				let substring = this.text.substring(pos, start);

				// If the highlight starts with spaces, we add those spaces to the text that won't be highlighted.
				// This is to prevent the space character from being bolded (the bolding causes a visual shift in characters).
				const hasExtraSpaces = this.text.charAt(start) === ' ';
				if (hasExtraSpaces) {
					while (start < this.text.length && this.text.charAt(start) === ' ') {
						substring += ' ';
						start++;
					}
				}

				children.push(dom.$('span', undefined, ...this.supportIcons ? renderLabelWithIcons(substring) : [substring]));
			}

			// If the highlight ends with spaces, we remove those spaces from the text that will be highlighted.
			// This is to prevent the space character from being bolded (the bolding causes a visual shift in characters).
			let substring = this.text.substring(start, end);
			const extraSpaces = substring.length - substring.trimEnd().length;
			if (extraSpaces > 0) {
				substring = substring.trimEnd();
				end -= extraSpaces;
			}

			// At this point, substring might be empty so if it is, just don't render a highlighted span
			if (substring.length > 0) {
				const element = dom.$('span.highlight', undefined, ...this.supportIcons ? renderLabelWithIcons(substring) : [substring]);

				if (highlight.extraClasses) {
					element.classList.add(...highlight.extraClasses);
				}

				children.push(element);
			}

			// Set the new position to the end of the highlight
			pos = end;
		}

		if (pos < this.text.length) {
			const substring = this.text.substring(pos,);
			children.push(dom.$('span', undefined, ...this.supportIcons ? renderLabelWithIcons(substring) : [substring]));
		}

		dom.reset(this.domNode, ...children);

		if (this.title) {
			this.domNode.title = this.title;
		} else {
			this.domNode.removeAttribute('title');
		}

		this.didEverRender = true;
	}

	static escapeNewLines(text: string, highlights: IHighlight[]): string {
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

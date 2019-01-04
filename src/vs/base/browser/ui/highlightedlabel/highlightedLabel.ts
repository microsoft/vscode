/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import * as objects from 'vs/base/common/objects';
import { renderOcticons } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { escape } from 'vs/base/common/strings';

export interface IHighlight {
	start: number;
	end: number;
}

export class HighlightedLabel implements IDisposable {

	private domNode: HTMLElement;
	private text: string;
	private title: string;
	private highlights: IHighlight[];
	private didEverRender: boolean;

	constructor(container: HTMLElement, private supportOcticons: boolean) {
		this.domNode = document.createElement('span');
		this.domNode.className = 'monaco-highlighted-label';
		this.didEverRender = false;
		container.appendChild(this.domNode);
	}

	get element(): HTMLElement {
		return this.domNode;
	}

	set(text: string, highlights: IHighlight[] = [], title: string = '', escapeNewLines?: boolean) {
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

		if (!Array.isArray(highlights)) {
			highlights = [];
		}

		this.text = text;
		this.title = title;
		this.highlights = highlights;
		this.render();
	}

	private render() {
		dom.clearNode(this.domNode);

		let htmlContent: string[] = [];
		let pos = 0;

		for (const highlight of this.highlights) {
			if (highlight.end === highlight.start) {
				continue;
			}
			if (pos < highlight.start) {
				htmlContent.push('<span>');
				const substring = this.text.substring(pos, highlight.start);
				htmlContent.push(this.supportOcticons ? renderOcticons(substring) : escape(substring));
				htmlContent.push('</span>');
				pos = highlight.end;
			}
			htmlContent.push('<span class="highlight">');
			const substring = this.text.substring(highlight.start, highlight.end);
			htmlContent.push(this.supportOcticons ? renderOcticons(substring) : escape(substring));
			htmlContent.push('</span>');
			pos = highlight.end;
		}

		if (pos < this.text.length) {
			htmlContent.push('<span>');
			const substring = this.text.substring(pos);
			htmlContent.push(this.supportOcticons ? renderOcticons(substring) : escape(substring));
			htmlContent.push('</span>');
		}

		this.domNode.innerHTML = htmlContent.join('');
		this.domNode.title = this.title;
		this.didEverRender = true;
	}

	dispose() {
		this.text = null!; // StrictNullOverride: nulling out ok in dispose
		this.highlights = null!; // StrictNullOverride: nulling out ok in dispose
	}

	static escapeNewLines(text: string, highlights: IHighlight[]): string {

		let total = 0;
		let extra = 0;

		return text.replace(/\r\n|\r|\n/, (match, offset) => {
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

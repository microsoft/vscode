/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const MarkdownIt = require('markdown-it');

export function activate() {
	let markdownIt = new MarkdownIt({
		html: true
	});

	return {
		renderOutputItem: (outputInfo: { text(): string }, element: HTMLElement) => {
			const rendered = markdownIt.render(outputInfo.text());
			element.innerHTML = rendered;

			// Insert styles into markdown preview shadow dom so that they are applied
			for (const markdownStyleNode of document.getElementsByClassName('markdown-style')) {
				element.insertAdjacentElement('beforebegin', markdownStyleNode.cloneNode(true) as Element);
			}
		},
		extendMarkdownIt: (f: (md: typeof markdownIt) => void) => {
			f(markdownIt);
		}
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as markdownIt from 'markdown-it';

declare const extendMarkdownIt: undefined | (
	(f: (md: markdownIt.MarkdownIt) => void) => void
);

(function () {
	const katex = require('@iktakahiro/markdown-it-katex');

	// Insert math css
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.type = 'text/css';
	link.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.11.1/katex.min.css';
	document.getElementsByTagName('head')[0].appendChild(link);

	if (typeof extendMarkdownIt !== 'undefined') {
		extendMarkdownIt((md: markdownIt.MarkdownIt) => {
			md.use(katex);
		});
	}
}());

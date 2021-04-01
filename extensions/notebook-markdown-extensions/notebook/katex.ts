/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as markdownIt from 'markdown-it';

declare const extendMarkdownIt: undefined | (
	(f: (md: markdownIt.MarkdownIt) => void) => void
);

const styleHref = (document.currentScript as any).src.replace(/katex.js$/, 'katex.min.css');

const link = document.createElement('link');
link.rel = 'stylesheet';
link.classList.add('markdown-style');
link.href = styleHref;

document.head.append(link);

(function () {
	const katex = require('@iktakahiro/markdown-it-katex');
	if (typeof extendMarkdownIt !== 'undefined') {

		extendMarkdownIt((md: markdownIt.MarkdownIt) => {
			md.use(katex);
		});
	}
}());

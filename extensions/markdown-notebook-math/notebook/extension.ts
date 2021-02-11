/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as markdownIt from 'markdown-it';

import 'katex/dist/katex.min.css';

declare const extendMarkdownIt: undefined | (
	(f: (md: markdownIt.MarkdownIt) => void) => void
);

(function () {
	const katex = require('@iktakahiro/markdown-it-katex');

	if (typeof extendMarkdownIt !== 'undefined') {
		extendMarkdownIt((md: markdownIt.MarkdownIt) => {
			md.use(katex);
		});
	}
}());


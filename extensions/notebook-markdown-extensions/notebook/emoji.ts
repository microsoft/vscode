/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as markdownIt from 'markdown-it';

declare const extendMarkdownIt: undefined | (
	(f: (md: markdownIt.MarkdownIt) => void) => void
);

(function () {
	if (typeof extendMarkdownIt !== 'undefined') {
		const emoji = require('markdown-it-emoji');

		extendMarkdownIt((md: markdownIt.MarkdownIt) => {
			md.use(emoji);
		});
	}
}());


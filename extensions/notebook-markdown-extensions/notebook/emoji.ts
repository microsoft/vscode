/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as markdownIt from 'markdown-it';

const emoji = require('markdown-it-emoji');

export function activate(ctx: {
	getRenderer: (id: string) => any
}) {
	const markdownItRenderer = ctx.getRenderer('markdownItRenderer');

	markdownItRenderer.extendMarkdownIt((md: markdownIt.MarkdownIt) => {
		return md.use(emoji);
	});
}

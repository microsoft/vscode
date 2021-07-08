/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as markdownIt from 'markdown-it';

const styleHref = import.meta.url.replace(/task-lists.js$/, 'task-lists.min.css');

export async function activate(ctx: {
	getRenderer: (id: string) => Promise<any | undefined>
}) {
	const markdownItRenderer = await ctx.getRenderer('markdownItRenderer');
	if (!markdownItRenderer) {
		throw new Error('Could not load markdownItRenderer');
	}

	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.classList.add('markdown-style');
	link.href = styleHref;

	const style = document.createElement('style');
	style.textContent = `
	.contains-task-list {
		padding-left: 0;
	}

	.contains-task-list li {
		margin-left: 24px;
	}

	.contains-task-list .task-list-item {
		list-style: none;
		padding-left: 0;
		margin-left: 0;
	}

	.contains-task-list .contains-task-list {
		padding-left: 20px;
	}
	`;

	// Put Everything into a template
	const styleTemplate = document.createElement('template');
	styleTemplate.classList.add('markdown-style');
	styleTemplate.content.appendChild(style);
	styleTemplate.content.appendChild(link);
	document.head.appendChild(styleTemplate);
	markdownItRenderer.extendMarkdownIt((md: markdownIt.MarkdownIt) => {
		return md.use(require('markdown-it-task-lists'));
	});
}

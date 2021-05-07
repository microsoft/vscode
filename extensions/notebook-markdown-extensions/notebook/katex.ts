/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as markdownIt from 'markdown-it';

const styleHref = import.meta.url.replace(/katex.js$/, 'katex.min.css');

const link = document.createElement('link');
link.rel = 'stylesheet';
link.classList.add('markdown-style');
link.href = styleHref;
document.head.append(link);

const style = document.createElement('style');
style.classList.add('markdown-style');
style.textContent = `
	.katex-error {
		color: var(--vscode-editorError-foreground);
	}
`;
document.head.append(style);

const katex = require('@iktakahiro/markdown-it-katex');

export function extendMarkdownIt(md: markdownIt.MarkdownIt) {
	return md.use(katex);
}

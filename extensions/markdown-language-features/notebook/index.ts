/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as MarkdownIt from 'markdown-it';

declare const acquireNotebookRendererApi: any;
type extendMarkdownItFnType = (
	(f: (md: MarkdownIt.MarkdownIt) => void) => void
);

(function () {
	const markdownIt = new MarkdownIt({
		html: true
	});

	(globalThis as any).extendMarkdownIt = ((f: (md: MarkdownIt.MarkdownIt) => void) => {
		f(markdownIt);
	}) as extendMarkdownItFnType;

	const notebook = acquireNotebookRendererApi('notebookCoreTestRenderer');

	notebook.onDidCreateMarkdown(({ element, content }: any) => {
		const rendered = markdownIt.render(content);
		element.innerHTML = rendered;

		// Insert styles into markdown preview shadow dom so that they are applied
		for (const markdownStyleNode of document.getElementsByClassName('markdown-style')) {
			element.appendChild(markdownStyleNode.cloneNode(true));
		}
	});
}());

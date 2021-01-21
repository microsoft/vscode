/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as MarkdownIt from 'markdown-it';

declare const acquireNotebookRendererApi: any;
type extendMarkdownFnType = (
	(f: (md: MarkdownIt.MarkdownIt) => void) => void
);

(function () {
	const markdownIt = new MarkdownIt();

	(globalThis as any).extendMarkdown = ((f: (md: MarkdownIt.MarkdownIt) => void) => {
		f(markdownIt);
	}) as extendMarkdownFnType;

	const notebook = acquireNotebookRendererApi('notebookCoreTestRenderer');

	notebook.onDidCreateMarkdown(({ element, content }: any) => {
		console.log('did create markdown cell');
		const rendered = markdownIt.render(content);
		element.innerHTML = rendered;
	});
}());

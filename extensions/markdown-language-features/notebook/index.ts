/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as MarkdownIt from 'markdown-it';


declare const acquireNotebookRendererApi: any;



{
	console.log('Hello notebook!');

	const notebook = acquireNotebookRendererApi('notebookCoreTestRenderer');

	const markdownIt = new MarkdownIt();

	notebook.onDidCreateOutput(({ element, mimeType }: any) => {
		console.log('did create output');
		const div = document.createElement('div');
		div.innerText = `Hello ${mimeType}!`;
		element.appendChild(div);
	});

	notebook.onDidCreateMarkdown(({ element, content }: any) => {
		console.log('did create markdown');
		const rendered = markdownIt.render(content);
		element.innerHTML = rendered;
	});
}

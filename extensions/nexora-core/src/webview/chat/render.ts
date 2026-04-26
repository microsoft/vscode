/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function formatContent(content: string): string {
	let html = escapeHtml(content);

	// Code blocks ```...```
	const codeBlockRegex = /```([\s\S]*?)```/g;
	html = html.replace(codeBlockRegex, (_match, code) => {
		const trimmed = String(code).trim();
		const copyId = 'code-' + Math.random().toString(36).slice(2, 11);
		return (
			'<div class="nx-codeHeader">' +
			'<span class="nx-codeTitle">Code</span>' +
			'<button class="nx-copyBtn" data-copy-target="' + copyId + '">Copy</button>' +
			'</div>' +
			'<pre class="nx-codeBlock" id="' + copyId + '">' +
			trimmed +
			'</pre>'
		);
	});

	// Inline code `...`
	html = html.replace(/`([^`]+)`/g, '<code class="nx-inlineCode">$1</code>');

	// Bold **...**
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

	// Line breaks
	html = html.replace(/\n/g, '<br/>');

	return html;
}


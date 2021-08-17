/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const MarkdownIt = require('markdown-it');
const insane = require('insane');
import type { InsaneOptions } from 'insane';

function _extInsaneOptions(opts: InsaneOptions, allowedAttributesForAll: string[]): InsaneOptions {
	const allowedAttributes: Record<string, string[]> = opts.allowedAttributes ?? {};
	if (opts.allowedTags) {
		for (const tag of opts.allowedTags) {
			let array = allowedAttributes[tag];
			if (!array) {
				array = allowedAttributesForAll;
			} else {
				array = array.concat(allowedAttributesForAll);
			}
			allowedAttributes[tag] = array;
		}
	}

	return { ...opts, allowedAttributes };
}

const insaneOptions: InsaneOptions = _extInsaneOptions({
	allowedTags: ['a', 'button', 'blockquote', 'code', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'input', 'label', 'li', 'p', 'pre', 'select', 'small', 'span', 'strong', 'textarea', 'ul', 'ol'],
	allowedAttributes: {
		'a': ['href', 'x-dispatch'],
		'button': ['data-href', 'x-dispatch'],
		'img': ['src'],
		'input': ['type', 'placeholder', 'checked', 'required'],
		'label': ['for'],
		'select': ['required'],
		'span': ['data-command', 'role'],
		'textarea': ['name', 'placeholder', 'required'],
	},
	allowedSchemes: ['http', 'https']
}, [
	'align',
	'class',
	'id',
	'style',
	'aria-hidden',
]);

export function activate(ctx: { workspace: { isTrusted: boolean } }) {
	let markdownIt = new MarkdownIt({
		html: true
	});

	const style = document.createElement('style');
	style.textContent = `
		.emptyMarkdownCell::before {
			content: "${document.documentElement.style.getPropertyValue('--notebook-cell-markup-empty-content')}";
			font-style: italic;
			opacity: 0.6;
		}

		img {
			max-width: 100%;
			max-height: 100%;
		}

		a {
			text-decoration: none;
		}

		a:hover {
			text-decoration: underline;
		}

		a:focus,
		input:focus,
		select:focus,
		textarea:focus {
			outline: 1px solid -webkit-focus-ring-color;
			outline-offset: -1px;
		}

		hr {
			border: 0;
			height: 2px;
			border-bottom: 2px solid;
		}

		h1 {
			font-size: 26px;
			line-height: 31px;
			margin: 0;
			margin-bottom: 13px;
		}

		h2 {
			font-size: 19px;
			margin: 0;
			margin-bottom: 10px;
		}

		h1,
		h2,
		h3 {
			font-weight: normal;
		}

		div {
			width: 100%;
		}

		/* Adjust margin of first item in markdown cell */
		*:first-child {
			margin-top: 0px;
		}

		/* h1 tags don't need top margin */
		h1:first-child {
			margin-top: 0;
		}

		/* Removes bottom margin when only one item exists in markdown cell */
		*:only-child,
		*:last-child {
			margin-bottom: 0;
			padding-bottom: 0;
		}

		/* makes all markdown cells consistent */
		div {
			min-height: var(--notebook-markdown-min-height);
		}

		table {
			border-collapse: collapse;
			border-spacing: 0;
		}

		table th,
		table td {
			border: 1px solid;
		}

		table > thead > tr > th {
			text-align: left;
			border-bottom: 1px solid;
		}

		table > thead > tr > th,
		table > thead > tr > td,
		table > tbody > tr > th,
		table > tbody > tr > td {
			padding: 5px 10px;
		}

		table > tbody > tr + tr > td {
			border-top: 1px solid;
		}

		blockquote {
			margin: 0 7px 0 5px;
			padding: 0 16px 0 10px;
			border-left-width: 5px;
			border-left-style: solid;
		}

		code,
		.code {
			font-size: 1em;
			line-height: 1.357em;
		}

		.code {
			white-space: pre-wrap;
		}
	`;
	const template = document.createElement('template');
	template.classList.add('markdown-style');
	template.content.appendChild(style);
	document.head.appendChild(template);

	return {
		renderOutputItem: (outputInfo: { text(): string }, element: HTMLElement) => {
			let previewNode: HTMLElement;
			if (!element.shadowRoot) {
				const previewRoot = element.attachShadow({ mode: 'open' });

				// Insert styles into markdown preview shadow dom so that they are applied.
				// First add default webview style
				const defaultStyles = document.getElementById('_defaultStyles') as HTMLStyleElement;
				previewRoot.appendChild(defaultStyles.cloneNode(true));

				// And then contributed styles
				for (const element of document.getElementsByClassName('markdown-style')) {
					if (element instanceof HTMLTemplateElement) {
						previewRoot.appendChild(element.content.cloneNode(true));
					} else {
						previewRoot.appendChild(element.cloneNode(true));
					}
				}

				previewNode = document.createElement('div');
				previewNode.id = 'preview';
				previewRoot.appendChild(previewNode);
			} else {
				previewNode = element.shadowRoot.getElementById('preview')!;
			}

			const text = outputInfo.text();
			if (text.trim().length === 0) {
				previewNode.innerText = '';
				previewNode.classList.add('emptyMarkdownCell');
			} else {
				previewNode.classList.remove('emptyMarkdownCell');

				const unsanitizedRenderedMarkdown = markdownIt.render(text);
				previewNode.innerHTML = ctx.workspace.isTrusted
					? unsanitizedRenderedMarkdown
					: insane(unsanitizedRenderedMarkdown, insaneOptions);
			}
		},
		extendMarkdownIt: (f: (md: typeof markdownIt) => void) => {
			f(markdownIt);
		}
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DOM-based HTML-to-Markdown converter.
 *
 * Handles common inline and block elements so that content pasted from
 * web pages keeps its basic structure (headings, links, bold, italic,
 * code, lists) when inserted into a Markdown-aware surface such as the
 * chat input.
 */

import { createTrustedTypesPolicy } from './trustedTypes.js';

const maxInputLength = 200_000;

const ttPolicy = createTrustedTypesPolicy('htmlToMarkdown', { createHTML: value => value });

export function convertHtmlToMarkdown(html: string): string {
	// Bail out on very large inputs to limit DOM parsing cost
	if (html.length > maxInputLength) {
		return html.replace(/<[^>]+>/g, '');
	}

	const trustedHtml = ttPolicy?.createHTML(html) ?? html;
	const doc = new DOMParser().parseFromString(trustedHtml as string, 'text/html');
	let result = convertChildren(doc.body);

	// Convert non-breaking spaces to regular spaces
	result = result.replace(/\u00A0/g, ' ');

	// Collapse runs of 3+ newlines into 2
	result = result.replace(/\n{3,}/g, '\n\n');

	return result.trim();
}

function convertNode(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent ?? '';
	}

	if (node.nodeType !== Node.ELEMENT_NODE) {
		return '';
	}

	const el = node as HTMLElement;
	const tag = el.tagName.toLowerCase();

	switch (tag) {
		case 'h1': return `\n# ${convertChildren(el).trim()}\n`;
		case 'h2': return `\n## ${convertChildren(el).trim()}\n`;
		case 'h3': return `\n### ${convertChildren(el).trim()}\n`;
		case 'h4': return `\n#### ${convertChildren(el).trim()}\n`;
		case 'h5': return `\n##### ${convertChildren(el).trim()}\n`;
		case 'h6': return `\n###### ${convertChildren(el).trim()}\n`;

		case 'pre': {
			// eslint-disable-next-line no-restricted-syntax -- querying a detached DOMParser document, not the live DOM
			const codeEl = el.querySelector('code');
			const text = (codeEl ?? el).textContent ?? '';
			return `\n\`\`\`\n${text.replace(/^\n+|\n+$/g, '')}\n\`\`\`\n`;
		}

		case 'code':
			return `\`${el.textContent ?? ''}\``;

		case 'blockquote': {
			const inner = convertChildren(el).trim();
			const lines = inner.split('\n').map(l => `> ${l.trim()}`);
			return `\n${lines.join('\n')}\n`;
		}

		case 'ol': {
			let index = 0;
			let result = '\n';
			for (const child of el.children) {
				if (child.tagName.toLowerCase() === 'li') {
					index++;
					result += `${index}. ${convertChildren(child).trim()}\n`;
				}
			}
			return result;
		}

		case 'ul': {
			let result = '\n';
			for (const child of el.children) {
				if (child.tagName.toLowerCase() === 'li') {
					result += `- ${convertChildren(child).trim()}\n`;
				}
			}
			return result;
		}

		case 'li':
			return `- ${convertChildren(el).trim()}\n`;

		case 'p':
			return `${convertChildren(el)}\n\n`;

		case 'div':
			return `${convertChildren(el)}\n`;

		case 'br':
			return '\n';

		case 'hr':
			return '\n---\n';

		case 'a': {
			const href = el.getAttribute('href') ?? '';
			return sanitizeLink(href, convertChildren(el).trim());
		}

		case 'img': {
			const src = el.getAttribute('src') ?? '';
			const alt = el.getAttribute('alt') ?? '';
			return `![${alt}](${src})`;
		}

		case 'strong':
		case 'b':
			return `**${convertChildren(el)}**`;

		case 'em':
		case 'i':
			return `*${convertChildren(el)}*`;

		case 'del':
		case 's':
		case 'strike':
			return `~~${convertChildren(el)}~~`;

		default:
			return convertChildren(el);
	}
}

function convertChildren(node: Node): string {
	let result = '';
	for (const child of node.childNodes) {
		result += convertNode(child);
	}
	return result;
}

/** Produce a markdown link, stripping dangerous schemes like `javascript:`. */
function sanitizeLink(href: string, text: string): string {
	if (/^(javascript|vbscript|data):/i.test(href.trim())) {
		return text;
	}
	return `[${text}](${href})`;
}

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

import { appendEscapedMarkdownInlineCode, isPortableMarkdownTarget } from '../common/htmlContent.js';
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
			return appendEscapedMarkdownInlineCode(el.textContent ?? '');

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
			return sanitizeLink(linkTargetOf(el), convertChildren(el).trim(), (el.textContent ?? '').trim());
		}

		case 'img': {
			const src = el.getAttribute('src') ?? '';
			const alt = el.getAttribute('alt') ?? '';
			if (!isPortableMarkdownTarget(src)) {
				return alt ? appendEscapedMarkdownInlineCode(alt) : '';
			}
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

/**
 * Reads the target of an anchor. Rendered VS Code links route clicks through `data-href`, so
 * that attribute is consulted when `href` cannot be shared — but never ahead of a usable
 * `href`, since arbitrary pages use the same attribute name and could redirect a link.
 */
function linkTargetOf(el: HTMLElement): string {
	const href = (el.getAttribute('href') ?? '').trim();
	if (href && isPortableMarkdownTarget(href)) {
		return href;
	}
	return (el.getAttribute('data-href') ?? '').trim() || href;
}

/**
 * Renders an anchor as markdown, keeping only targets that still mean something wherever the
 * markdown is pasted. Everything else falls back to the text the reader actually saw.
 */
function sanitizeLink(href: string, text: string, plainText: string): string {
	const target = href.trim();

	// An executable target carries no label worth marking up as code.
	if (/^(javascript|vbscript|data):/i.test(target)) {
		return text;
	}

	if (!target || !isPortableMarkdownTarget(target)) {
		// Emphasis markers around the label would be read literally inside a code span.
		return plainText ? appendEscapedMarkdownInlineCode(plainText) : '';
	}

	return `[${text}](${target})`;
}

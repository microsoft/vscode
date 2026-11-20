/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as marked from './marked/marked.js';
import { hasKey } from './types.js';

const entities = new Map([
	['amp', '&'], ['lt', '<'], ['gt', '>'], ['apos', '\''], ['quot', '"'], ['nbsp', '\u00a0'],
]);

function decodeEntities(text: string): string {
	return text.replace(/&(?<entity>amp|lt|gt|apos|quot|nbsp|#\d+|#x[\da-f]+);/gi, (match, entity: string) => {
		if (!entity.startsWith('#')) {
			return entities.get(entity.toLowerCase()) ?? match;
		}
		const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
		return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
	});
}

function inlineText(tokens: readonly marked.Token[]): string {
	let text = '';
	let hiddenHtml = false;
	for (const entry of tokens) {
		const token = entry as marked.MarkedToken;
		if (token.type === 'html') {
			if (/^<(?:script|style)\b/i.test(token.raw)) {
				hiddenHtml = true;
			} else if (/^<\/(?:script|style)>/i.test(token.raw)) {
				hiddenHtml = false;
			} else if (!hiddenHtml && /^<br\s*\/?>$/i.test(token.raw)) {
				text += '\n';
			}
		} else if (!hiddenHtml) {
			switch (token.type) {
				case 'link':
				case 'strong':
				case 'em':
				case 'del':
					text += inlineText(token.tokens);
					break;
				case 'codespan':
				case 'escape':
				case 'text':
					text += decodeEntities(token.text);
					break;
				case 'br':
					text += '\n';
					break;
			}
		}
	}
	return text;
}

function blockText(tokens: readonly marked.Token[]): string {
	const blocks: string[] = [];
	for (const entry of tokens) {
		const token = entry as marked.MarkedToken;
		switch (token.type) {
			case 'code':
				blocks.push(token.text);
				break;
			case 'list':
				blocks.push(...token.items.map(item => blockText(item.tokens)));
				break;
			case 'blockquote':
				blocks.push(blockText(token.tokens));
				break;
			case 'table':
				for (const row of [token.header, ...token.rows]) {
					blocks.push(...row.map(cell => inlineText(cell.tokens)));
				}
				break;
			case 'paragraph':
			case 'heading':
				blocks.push(inlineText(token.tokens));
				break;
			case 'text':
				blocks.push(!hasKey(token, { inRawBlock: true }) && token.tokens ? inlineText(token.tokens) : decodeEntities(token.text));
				break;
		}
	}
	return blocks.filter(Boolean).join('\n');
}

/** Searchable text of one displayed Markdown part, without link targets, formatting or image metadata. */
export function markdownToPlainText(markdown: string): string {
	return blockText(marked.lexer(markdown));
}

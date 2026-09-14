/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, tokTypes } from 'acorn';
import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp';
import type { TextEdit } from '../next/private-to-property.ts';

interface SourceMapReference {
	readonly url: string;
	readonly start: number;
	readonly end: number;
	readonly commentEnd: number;
}

export interface EscapedJavaScript {
	readonly code: string;
	readonly edits: readonly TextEdit[];
	readonly regularExpressions: number;
	readonly comments: number;
	readonly sourceMap: SourceMapReference | undefined;
}

const wideCharacter = /[^\x00-\xFF]/;

function escapeCodePoint(value: number): string {
	return value > 0xFFFF ? `\\u{${value.toString(16)}}` : `\\u${value.toString(16).padStart(4, '0')}`;
}

/** Escapes regex spellings and ordinary comments without rewriting runtime strings or raw templates. */
export function escapeJavaScriptUnicode(code: string, fileName: string): EscapedJavaScript {
	if (!wideCharacter.test(code)) {
		return { code, edits: [], regularExpressions: 0, comments: 0, sourceMap: undefined };
	}

	const edits: TextEdit[] = [];
	const regexParser = new RegExpParser({ ecmaVersion: 2025 });
	let regularExpressions = 0;
	let comments = 0;
	let sourceMap: SourceMapReference | undefined;

	function escapeName(literal: string, start: number, end: number, base: number): void {
		for (let offset = start; offset < end;) {
			const value = literal.codePointAt(offset)!;
			const width = value > 0xFFFF ? 2 : 1;
			if (value > 0xFF) {
				edits.push({ start: base + offset, end: base + offset + width, newText: escapeCodePoint(value) });
			}
			offset += width;
		}
	}

	try {
		parse(code, {
			ecmaVersion: 'latest',
			sourceType: 'script',
			allowImportExportEverywhere: true,
			allowAwaitOutsideFunction: true,
			allowReturnOutsideFunction: true,
			onToken(token) {
				if (token.type !== tokTypes.regexp) {
					return;
				}
				const literal = code.slice(token.start, token.end);
				if (!wideCharacter.test(literal)) {
					return;
				}
				const expression = regexParser.parseLiteral(literal);
				const before = edits.length;
				visitRegExpAST(expression, {
					onCharacterEnter(node) {
						if (wideCharacter.test(node.raw)) {
							edits.push({ start: token.start + node.start, end: token.start + node.end, newText: escapeCodePoint(node.value) });
						}
					},
					onCapturingGroupEnter(node) {
						if (node.name && wideCharacter.test(node.name)) {
							escapeName(literal, node.start + 3, literal.indexOf('>', node.start + 3), token.start);
						}
					},
					onBackreferenceEnter(node) {
						if (typeof node.ref === 'string' && wideCharacter.test(node.ref)) {
							escapeName(literal, node.start + 3, node.end - 1, token.start);
						}
					},
				});
				if (edits.length > before) {
					regularExpressions++;
				}
			},
			onComment(block, text, start, end) {
				const reference = /^\s*[#@]\s*sourceMappingURL\s*=\s*(?<url>\S+)/d.exec(text);
				if (reference?.groups && reference.indices?.groups) {
					const url = reference.groups.url;
					const urlStart = start + 2 + reference.indices.groups.url[0];
					sourceMap = { url, start: urlStart, end: urlStart + url.length, commentEnd: end };
				}
				// Preserve notices and interpreter/debugger directives verbatim.
				if (code.startsWith('#!', start) || /^!|@(?:license|preserve)\b|\bcopyright\b/i.test(text) ||
					/^\s*[#@]\s*(?:sourceMappingURL|sourceURL)\s*=/.test(text)) {
					return;
				}
				let changed = false;
				for (let offset = start + 2; offset < end - (block ? 2 : 0);) {
					const value = code.codePointAt(offset)!;
					const width = value > 0xFFFF ? 2 : 1;
					if (value > 0xFF) {
						// Block-comment line terminators still participate in automatic semicolon insertion.
						const newText = value === 0x2028 || value === 0x2029 ? '\n' : escapeCodePoint(value);
						edits.push({ start: offset, end: offset + width, newText });
						changed = true;
					}
					offset += width;
				}
				comments += changed ? 1 : 0;
			},
		});
	} catch (error) {
		throw new Error(`Unable to escape Unicode in emitted JavaScript ${fileName}`, { cause: error });
	}

	edits.sort((a, b) => a.start - b.start || a.end - b.end);
	const parts: string[] = [];
	let offset = 0;
	for (const edit of edits) {
		if (edit.start < offset || edit.end <= edit.start) {
			throw new Error(`Overlapping Unicode edits in ${fileName}`);
		}
		parts.push(code.slice(offset, edit.start), edit.newText);
		offset = edit.end;
	}
	parts.push(code.slice(offset));
	return { code: parts.join(''), edits, regularExpressions, comments, sourceMap };
}

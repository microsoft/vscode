/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type MarkdownIt from 'markdown-it';

const mermaidLanguageId = 'mermaid';
const containerTokenName = 'mermaidContainer';

const minMarkers = 3;
const markerStr = ':';
const markerChar = markerStr.charCodeAt(0);
const markerLen = markerStr.length;

/**
 * Extends markdown-it so that it can render mermaid diagrams.
 *
 * This does not actually implement rendering of mermaid diagrams. Instead we just make sure that mermaid
 * block syntax is properly parsed by markdown-it. All actual mermaid rendering happens in the webview
 * where the markdown is rendered.
 */
export function extendMarkdownItWithMermaid(md: MarkdownIt, config: { languageIds(): readonly string[] }): MarkdownIt {
	md.use((md: MarkdownIt) => {
		function container(state: MarkdownIt.StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
			let pos: number;
			let autoClosed = false;
			let start = state.bMarks[startLine] + state.tShift[startLine];
			let max = state.eMarks[startLine];

			if (markerChar !== state.src.charCodeAt(start)) {
				return false;
			}

			for (pos = start + 1; pos <= max; pos++) {
				if (markerStr[(pos - start) % markerLen] !== state.src[pos]) {
					break;
				}
			}

			const markerCount = Math.floor((pos - start) / markerLen);
			if (markerCount < minMarkers) {
				return false;
			}
			pos -= (pos - start) % markerLen;

			const markup = state.src.slice(start, pos);
			const params = state.src.slice(pos, max);
			if (params.trim().split(' ')[0].toLowerCase() !== mermaidLanguageId) {
				return false;
			}

			if (silent) {
				return true;
			}

			let nextLine = startLine;

			for (; ;) {
				nextLine++;
				if (nextLine >= endLine) {
					break;
				}

				start = state.bMarks[nextLine] + state.tShift[nextLine];
				max = state.eMarks[nextLine];

				if (start < max && state.sCount[nextLine] < state.blkIndent) {
					break;
				}

				if (markerChar !== state.src.charCodeAt(start)) {
					continue;
				}

				if (state.sCount[nextLine] - state.blkIndent >= 4) {
					continue;
				}

				for (pos = start + 1; pos <= max; pos++) {
					if (markerStr[(pos - start) % markerLen] !== state.src[pos]) {
						break;
					}
				}

				if (Math.floor((pos - start) / markerLen) < markerCount) {
					continue;
				}

				pos -= (pos - start) % markerLen;
				pos = state.skipSpaces(pos);

				if (pos < max) {
					continue;
				}

				autoClosed = true;
				break;
			}

			const oldParent = state.parentType;
			const oldLineMax = state.lineMax;
			state.parentType = 'container' as MarkdownIt.StateBlock.ParentType;

			state.lineMax = nextLine;

			const containerToken = state.push(containerTokenName, 'div', 1);
			containerToken.markup = markup;
			containerToken.block = true;
			containerToken.info = params;
			containerToken.map = [startLine, nextLine];
			containerToken.content = state.getLines(startLine + 1, nextLine, state.blkIndent, true);

			state.parentType = oldParent;
			state.lineMax = oldLineMax;
			state.line = nextLine + (autoClosed ? 1 : 0);

			return true;
		}

		md.block.ruler.before('fence', containerTokenName, container, {
			alt: ['paragraph', 'reference', 'blockquote', 'list']
		});
		md.renderer.rules[containerTokenName] = (tokens: MarkdownIt.Token[], idx: number) => {
			const token = tokens[idx];
			const src = token.content;
			return `<div class="${mermaidLanguageId}">${preProcess(src)}</div>`;
		};
	});

	const highlight = md.options.highlight;
	md.options.highlight = (code: string, lang: string, attrs: string) => {
		const reg = new RegExp('\\b(' + config.languageIds().map(escapeRegExp).join('|') + ')\\b', 'i');
		if (lang && reg.test(lang)) {
			return `<pre class="${mermaidLanguageId}" style="all: unset;">${preProcess(code)}</pre>`;
		}
		return highlight?.(code, lang, attrs) ?? code;
	};
	return md;
}

function preProcess(source: string): string {
	return source
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\n+$/, '')
		.trimStart();
}

function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

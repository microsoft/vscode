/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as marked from '../../../../base/common/marked/marked.js';
import { escape, htmlAttributeEncodeValue } from '../../../../base/common/strings.js';

export const mathDollarsInlineRegExp = /(?<![a-zA-Z0-9])(?<dollars>\${1,2})(?!\.|\(["'])((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\k<dollars>(?![a-zA-Z0-9])/; // Non-standard, but ensure opening $ is not preceded and closing $ is not followed by word/number characters, opening $ not followed by ., (", ('
export const mathParenthesesInlineRegExp = /(?<!\\)\\\(((?:\\.|[^\r\n\\]|\r?\n(?!\r?\n))+?)\\\)/;
export const mathBracketsInlineRegExp = /(?<!\\)\\\[((?:\\.|[^\r\n\\]|\r?\n(?!\r?\n))+?)\\\]/;

export const mathInlineRegExp = new RegExp(`(?:${mathDollarsInlineRegExp.source})|(?:${mathParenthesesInlineRegExp.source})|(?:${mathBracketsInlineRegExp.source})`);
export const katexContainerClassName = 'vscode-katex-container';
export const katexContainerLatexAttributeName = 'data-latex';

const inlineRule = new RegExp(`^(?:${mathInlineRegExp.source})`);

export namespace MarkedKatexExtension {
	type KatexOptions = import('katex').KatexOptions;

	// From https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
	// From https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
	export interface MarkedKatexOptions extends KatexOptions { }

	const blockRule = /^(?:(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1| {0,3}\\\[((?:\\[^]|[^\\])+?)\\\][ \t]*)(?:\n|$)/;

	export function extension(katex: typeof import('katex').default, options: MarkedKatexOptions = {}): marked.MarkedExtension {
		return {
			extensions: [
				inlineKatex(options, createRenderer(katex, options, false)),
				blockKatex(options, createRenderer(katex, options, true)),
			],
		};
	}

	function createRenderer(katex: typeof import('katex').default, options: MarkedKatexOptions, isBlock: boolean): marked.RendererExtensionFunction {
		return (token: marked.Tokens.Generic) => {
			let out: string;
			try {
				const html = katex.renderToString(token.text, {
					...options,
					throwOnError: true,
					displayMode: token.displayMode,
				});

				// Wrap in a container with attribute as a fallback for extracting the original LaTeX source
				// This ensures we can always retrieve the source even if the annotation element is not present.
				// Encode `$` so that theme icon rendering, which runs on the rendered HTML, cannot insert tags into the attribute.
				out = `<span class="${katexContainerClassName}" ${katexContainerLatexAttributeName}="${htmlAttributeEncodeValue(token.text).replaceAll('$', '&#36;')}">${html}</span>`;
			} catch {
				// On failure, just show the original text including the wrapping $ or $$.
				// Escape it: this output is inserted as HTML, also when the Markdown does not support HTML.
				out = escape(token.raw);
			}
			return out + (isBlock ? '\n' : '');
		};
	}

	function inlineKatex(options: MarkedKatexOptions, renderer: marked.RendererExtensionFunction): marked.TokenizerAndRendererExtension {
		const ruleReg = inlineRule;
		return {
			name: 'inlineKatex',
			level: 'inline',
			start(src: string) {
				return src.match(mathInlineRegExp)?.index;
			},
			tokenizer(src: string, tokens: marked.Token[]) {
				const match = src.match(ruleReg);
				if (match) {
					if (match[0].startsWith('\\(')) {
						return {
							type: 'inlineKatex',
							raw: match[0],
							text: match[0].slice(2, -2).trim(),
							displayMode: false,
						};
					} else if (match[0].startsWith('\\[')) {
						return {
							type: 'inlineKatex',
							raw: match[0],
							text: match[0].slice(2, -2).trim(),
							displayMode: true,
						};
					} else {
						return {
							type: 'inlineKatex',
							raw: match[0],
							text: match[2].trim(),
							displayMode: match[1].length === 2,
						};
					}
				}
				return;
			},
			renderer,
		};
	}

	function blockKatex(options: MarkedKatexOptions, renderer: marked.RendererExtensionFunction): marked.TokenizerAndRendererExtension {
		return {
			name: 'blockKatex',
			level: 'block',
			start(src: string) {
				return src.match(new RegExp(blockRule.source, 'm'))?.index;
			},
			tokenizer(src: string, tokens: marked.Token[]) {
				const match = src.match(blockRule);
				if (match) {
					const isLatexBlock = match[3] !== undefined;
					return {
						type: 'blockKatex',
						raw: match[0],
						text: (isLatexBlock ? match[3] : match[2]).trim(),
						displayMode: isLatexBlock ? true : match[1].length === 2,
					};
				}
				return;
			},
			renderer,
		};
	}
}

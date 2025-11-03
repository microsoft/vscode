/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as marked from '../../../../base/common/marked/marked.js';
import { htmlAttributeEncodeValue } from '../../../../base/common/strings.js';

export const mathInlineRegExp = /(?<![a-zA-Z0-9])(?<dollars>\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\k<dollars>(?![a-zA-Z0-9])/; // Non-standard, but ensure opening $ is not preceded and closing $ is not followed by word/number characters
export const katexContainerClassName = 'vscode-katex-container';
export const katexContainerLatexAttributeName = 'data-latex';

const inlineRule = new RegExp('^' + mathInlineRegExp.source);


export namespace MarkedKatexExtension {
	type KatexOptions = import('katex').KatexOptions;

	// From https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
	// From https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
	export interface MarkedKatexOptions extends KatexOptions { }

	const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

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
				// This ensures we can always retrieve the source even if the annotation element is not present
				out = `<span class="${katexContainerClassName}" ${katexContainerLatexAttributeName}="${htmlAttributeEncodeValue(token.text)}">${html}</span>`;
			} catch {
				// On failure, just use the original text including the wrapping $ or $$
				out = token.raw;
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
				let index;
				let indexSrc = src;

				while (indexSrc) {
					index = indexSrc.indexOf('$');
					if (index === -1) {
						return;
					}

					const possibleKatex = indexSrc.substring(index);
					if (possibleKatex.match(ruleReg)) {
						return index;
					}

					indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
				}
				return;
			},
			tokenizer(src: string, tokens: marked.Token[]) {
				const match = src.match(ruleReg);
				if (match) {
					return {
						type: 'inlineKatex',
						raw: match[0],
						text: match[2].trim(),
						displayMode: match[1].length === 2,
					};
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
					return {
						type: 'blockKatex',
						raw: match[0],
						text: match[2].trim(),
						displayMode: match[1].length === 2,
					};
				}
				return;
			},
			renderer,
		};
	}
}

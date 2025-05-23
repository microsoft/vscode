/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule, resolveAmdNodeModulePath } from '../../../../../amdX.js';
import * as dom from '../../../../../base/browser/dom.js';
import type * as marked from '../../../../../base/common/marked/marked.js';

export class MarkedKatexSupport {

	public static _katex?: typeof import('katex').default;

	static {
		importAMDNodeModule<typeof import('katex')>('katex', 'dist/katex.js').then(katex => {
			this._katex = katex;
		});
	}

	public static getExtension(container: HTMLElement): marked.MarkedExtension | undefined {
		if (!this._katex) {
			return undefined;
		}

		this.ensureKatexStyles(container);
		return MarkedKatexExtension.extension(this._katex);
	}

	public static ensureKatexStyles(container: HTMLElement) {
		const doc = dom.getWindow(container).document;
		if (!doc.querySelector('link.katex')) {
			const katexStyle = document.createElement('link');
			katexStyle.classList.add('katex');
			katexStyle.rel = 'stylesheet';
			katexStyle.href = resolveAmdNodeModulePath('katex', 'dist/katex.min.css');
			doc.head.appendChild(katexStyle);
		}
	}
}


namespace MarkedKatexExtension {

	// From https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
	export interface MarkedKatexOptions {
		nonStandard?: boolean;
	}

	// allow-any-unicode-next-line
	const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1(?=[\s?!\.,:？！。，：]|$)/;
	const inlineRuleNonStandard = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/; // Non-standard, even if there are no spaces before and after $ or $$, try to parse

	const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

	export function extension(katex: typeof import('katex').default, options = {}): marked.MarkedExtension {
		return {
			extensions: [
				inlineKatex(options, createRenderer(katex, options, false)),
				blockKatex(options, createRenderer(katex, options, true)),
			],
		};
	}

	function createRenderer(katex: typeof import('katex').default, options: MarkedKatexOptions, newlineAfter: boolean): marked.RendererExtensionFunction {
		return (token: marked.Tokens.Generic) => katex.renderToString(token.text, { ...options, displayMode: token.displayMode }) + (newlineAfter ? '\n' : '');
	}

	function inlineKatex(options: MarkedKatexOptions, renderer: marked.RendererExtensionFunction): marked.TokenizerAndRendererExtension {
		const nonStandard = options && options.nonStandard;
		const ruleReg = nonStandard ? inlineRuleNonStandard : inlineRule;
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
					const f = nonStandard ? index > -1 : index === 0 || indexSrc.charAt(index - 1) === ' ';
					if (f) {
						const possibleKatex = indexSrc.substring(index);

						if (possibleKatex.match(ruleReg)) {
							return index;
						}
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

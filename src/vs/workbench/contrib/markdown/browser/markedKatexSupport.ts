/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the MIT License. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule, resolveAmdNodeModulePath } from '../../../../amdX.js';
import { MarkdownSanitizerConfig } from '../../../../base/browser/markdownRenderer.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Lazy } from '../../../../base/common/lazy.js';
import type * as marked from '../../../../base/common/marked/marked.js';

export class MarkedKatexSupport {

	public static getSanitizerOptions(baseConfig: {
		readonly allowedTags: readonly string[];
		readonly allowedAttributes: readonly string[];
	}): MarkdownSanitizerConfig {
		return {
			allowedTags: [
				...baseConfig.allowedTags,
				...trustedMathMlTags,
			],
		};
	}



	private static _katex?: typeof import('katex').default;
	private static _katexPromise = new Lazy(async () => {
		this._katex = await importAMDNodeModule<typeof import('katex').default>('katex', 'dist/katex.min.js');
		return this._katex;
	});

	public static getExtension(window: CodeWindow, options: MarkedKatexExtension.MarkedKatexOptions = {}): marked.MarkedExtension | undefined {
		if (!this._katex) {
			return undefined;
		}

		this.ensureKatexStyles(window);
		return MarkedKatexExtension.extension(this._katex, options);
	}

	public static async loadExtension(window: CodeWindow, options: MarkedKatexExtension.MarkedKatexOptions = {}): Promise<marked.MarkedExtension> {
		const katex = await this._katexPromise.value;
		this.ensureKatexStyles(window);
		return MarkedKatexExtension.extension(katex, options);
	}

	public static ensureKatexStyles(window: CodeWindow) {
		const doc = window.document;
		if (!doc.querySelector('link.katex')) {
			const katexStyle = document.createElement('link');
			katexStyle.classList.add('katex');
			katexStyle.rel = 'stylesheet';
			katexStyle.href = resolveAmdNodeModulePath('katex', 'dist/katex.min.css');
			doc.head.appendChild(katexStyle);
		}
	}
}


export namespace MarkedKatexExtension {
	type KatexOptions = import('katex').KatexOptions;

	// From https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
	// From https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
	export interface MarkedKatexOptions extends KatexOptions { }

	const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1(?=[\s?!\.,:'\uff1f\uff01\u3002\uff0c\uff1a']|$)/;
	const inlineRuleNonStandard = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/; // Non-standard, even if there are no spaces before and after $ or $$, try to parse

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
				out = katex.renderToString(token.text, {
					...options,
					throwOnError: true,
					displayMode: token.displayMode,
				});
			} catch {
				// On failure, just use the original text including the wrapping $ or $$
				out = token.raw;
			}
			return out + (isBlock ? '\n' : '');
		};
	}

	function inlineKatex(options: MarkedKatexOptions, renderer: marked.RendererExtensionFunction): marked.TokenizerAndRendererExtension {
		const nonStandard = true;
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
const trustedMathMlTags = Object.freeze([
	'semantics',
	'annotation',
	'math',
	'menclose',
	'merror',
	'mfenced',
	'mfrac',
	'mglyph',
	'mi',
	'mlabeledtr',
	'mmultiscripts',
	'mn',
	'mo',
	'mover',
	'mpadded',
	'mphantom',
	'mroot',
	'mrow',
	'ms',
	'mspace',
	'msqrt',
	'mstyle',
	'msub',
	'msup',
	'msubsup',
	'mtable',
	'mtd',
	'mtext',
	'mtr',
	'munder',
	'munderover',
	'mprescripts',

	// svg tags
	'svg',
	'altglyph',
	'altglyphdef',
	'altglyphitem',
	'circle',
	'clippath',
	'defs',
	'desc',
	'ellipse',
	'filter',
	'font',
	'g',
	'glyph',
	'glyphref',
	'hkern',
	'line',
	'lineargradient',
	'marker',
	'mask',
	'metadata',
	'mpath',
	'path',
	'pattern',
	'polygon',
	'polyline',
	'radialgradient',
	'rect',
	'stop',
	'style',
	'switch',
	'symbol',
	'text',
	'textpath',
	'title',
	'tref',
	'tspan',
	'view',
	'vkern',
]);
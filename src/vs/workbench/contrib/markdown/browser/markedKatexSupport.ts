/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule, resolveAmdNodeModulePath } from '../../../../amdX.js';
import * as domSanitize from '../../../../base/browser/domSanitize.js';
import { MarkdownSanitizerConfig } from '../../../../base/browser/markdownRenderer.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Lazy } from '../../../../base/common/lazy.js';
import type * as marked from '../../../../base/common/marked/marked.js';
import { katexContainerLatexAttributeName, MarkedKatexExtension } from '../common/markedKatexExtension.js';

export class MarkedKatexSupport {

	public static getSanitizerOptions(baseConfig: {
		readonly allowedTags: readonly string[];
		readonly allowedAttributes: ReadonlyArray<string | domSanitize.SanitizeAttributeRule>;
	}): MarkdownSanitizerConfig {
		return {
			allowedTags: {
				override: [
					...baseConfig.allowedTags,
					...trustedMathMlTags,
				]
			},
			allowedAttributes: {
				override: [
					...baseConfig.allowedAttributes,

					// Math
					'stretchy',
					'encoding',
					'accent',
					katexContainerLatexAttributeName,

					// SVG
					'd',
					'viewBox',
					'preserveAspectRatio',

					// Allow all classes since we don't have a list of allowed katex classes
					'class',

					// Sanitize allowed styles for katex
					{
						attributeName: 'style',
						shouldKeep: (_el, data) => this.sanitizeKatexStyles(data.attrValue),
					},
				]
			},
		};
	}

	private static tempSanitizerRule = new Lazy(() => {
		// Create a CSSStyleDeclaration object via a style sheet rule
		const styleSheet = new CSSStyleSheet();
		styleSheet.insertRule(`.temp{}`);
		const rule = styleSheet.cssRules[0];
		if (!(rule instanceof CSSStyleRule)) {
			throw new Error('Invalid CSS rule');
		}
		return rule.style;
	});

	private static sanitizeStyles(styleString: string, allowedProperties: readonly string[]): string {
		const style = this.tempSanitizerRule.value;
		style.cssText = styleString;

		const sanitizedProps = [];

		for (let i = 0; i < style.length; i++) {
			const prop = style[i];
			if (allowedProperties.includes(prop)) {
				const value = style.getPropertyValue(prop);
				// Allow through lists of numbers with units or bare words like 'block'
				// Main goal is to block things like 'url()'.
				if (/^(([\d\.\-]+\w*\s?)+|\w+)$/.test(value)) {
					sanitizedProps.push(`${prop}: ${value}`);
				}
			}
		}

		return sanitizedProps.join('; ');
	}

	private static sanitizeKatexStyles(styleString: string): string {
		const allowedProperties = [
			'display',
			'position',
			'font-family',
			'font-style',
			'font-weight',
			'font-size',
			'height',
			'min-height',
			'max-height',
			'width',
			'min-width',
			'max-width',
			'margin',
			'margin-top',
			'margin-right',
			'margin-bottom',
			'margin-left',
			'padding',
			'padding-top',
			'padding-right',
			'padding-bottom',
			'padding-left',
			'top',
			'left',
			'right',
			'bottom',
			'vertical-align',
			'transform',
			'border',
			'border-top-width',
			'border-right-width',
			'border-bottom-width',
			'border-left-width',
			'color',
			'white-space',
			'text-align',
			'line-height',
			'float',
			'clear',
		];
		return this.sanitizeStyles(styleString, allowedProperties);
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
		// eslint-disable-next-line no-restricted-syntax
		if (!doc.querySelector('link.katex')) {
			const katexStyle = document.createElement('link');
			katexStyle.classList.add('katex');
			katexStyle.rel = 'stylesheet';
			katexStyle.href = resolveAmdNodeModulePath('katex', 'dist/katex.min.css');
			doc.head.appendChild(katexStyle);
		}
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


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
import { generateUuid } from '../../../../base/common/uuid.js';
import { katexContainerLatexAttributeName, katexOutputMarkerAttributeName, MarkedKatexExtension } from '../common/markedKatexExtension.js';

/**
 * Identifies math rendered by this process. Unlike other HTML, rendered math may use arbitrary classes and
 * a restricted set of inline styles, so content must not be able to claim to be math by guessing this value.
 */
const katexOutputMarker = generateUuid();

/**
 * Math containers whose marker has been verified. The sanitizer removes the marker attribute, so it must
 * remember the containers to recognize their descendants.
 */
const verifiedKatexOutputRoots = new WeakSet<Element>();

function isKatexOutput(element: Element): boolean {
	for (let node: Element | null = element; node; node = node.parentElement) {
		if (verifiedKatexOutputRoots.has(node) || node.getAttribute(katexOutputMarkerAttributeName) === katexOutputMarker) {
			return true;
		}
	}
	return false;
}

/**
 * Returns how the base configuration treats an attribute, following the sanitizer's rule that later entries win.
 */
function getBaseAttributePredicate(allowedAttributes: ReadonlyArray<string | domSanitize.SanitizeAttributeRule>, attributeName: string): domSanitize.SanitizeAttributePredicate {
	let predicate: domSanitize.SanitizeAttributePredicate = () => false;
	for (const attr of allowedAttributes) {
		if (typeof attr === 'string') {
			if (attr.toLowerCase() === attributeName) {
				predicate = () => true;
			}
		} else if (attr.attributeName.toLowerCase() === attributeName) {
			predicate = attr.shouldKeep;
		}
	}
	return predicate;
}

export class MarkedKatexSupport {

	public static getSanitizerOptions(baseConfig: {
		readonly allowedTags: readonly string[];
		readonly allowedAttributes: ReadonlyArray<string | domSanitize.SanitizeAttributeRule>;
	}): MarkdownSanitizerConfig {
		const baseClassPredicate = getBaseAttributePredicate(baseConfig.allowedAttributes, 'class');
		const baseStylePredicate = getBaseAttributePredicate(baseConfig.allowedAttributes, 'style');
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

					// Verify and remove the marker of rendered math
					{
						attributeName: katexOutputMarkerAttributeName,
						shouldKeep: (el, data) => {
							if (data.attrValue === katexOutputMarker) {
								verifiedKatexOutputRoots.add(el);
							}
							return false;
						},
					},

					// Allow all classes in rendered math since we don't have a list of allowed katex classes.
					// Other HTML must not use them to borrow the styles of the workbench.
					{
						attributeName: 'class',
						shouldKeep: (el, data) => isKatexOutput(el) || baseClassPredicate(el, data),
					},

					// Sanitize allowed styles for katex. Other HTML must not use them to place content over other UI.
					{
						attributeName: 'style',
						shouldKeep: (el, data) => isKatexOutput(el) ? this.sanitizeKatexStyles(data.attrValue) : baseStylePredicate(el, data),
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
				// KaTeX only positions elements relative to their normal position.
				if (prop === 'position' && value !== 'relative') {
					continue;
				}
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
		return MarkedKatexExtension.extension(this._katex, options, katexOutputMarker);
	}

	public static async loadExtension(window: CodeWindow, options: MarkedKatexExtension.MarkedKatexOptions = {}): Promise<marked.MarkedExtension> {
		const katex = await this._katexPromise.value;
		this.ensureKatexStyles(window);
		return MarkedKatexExtension.extension(katex, options, katexOutputMarker);
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mathjax } from 'mathjax-full/js/mathjax';
import { TeX } from 'mathjax-full/js/input/tex';
import { SVG } from 'mathjax-full/js/output/svg';
import { liteAdaptor, LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import type { MathDocument } from 'mathjax-full/js/core/MathDocument';

// Note: We import TeX package extensions via the TeX input constructor's packages option

/**
 * Options for typesetting math expressions
 */
export interface TypesetOptions {
	/** Scale factor for the rendered SVG */
	scale: number;
	/** Color for the rendered math */
	color: string;
}

/**
 * Base extensions for MathJax
 */
const BASE_EXTENSIONS = [
	'ams',
	'base',
	'boldsymbol',
	'color',
	'configmacros',
	'mathtools',
	'newcommand',
	'noerrors',
	'noundefined'
];

/**
 * Available MathJax extensions that can be loaded
 */
export const MATHJAX_EXTENSIONS = [
	'ams',
	'autoload',
	'base',
	'boldsymbol',
	'braket',
	'bussproofs',
	'cancel',
	'centernot',
	'color',
	'colortbl',
	'configmacros',
	'enclose',
	'extpfeil',
	'gensymb',
	'html',
	'mathtools',
	'mhchem',
	'newcommand',
	'noerrors',
	'noundefined',
	'physics',
	'setoptions',
	'tagformat',
	'textcomp',
	'textmacros',
	'unicode',
	'upgreek',
	'verb'
];

let adaptor: LiteAdaptor | null = null;
let html: MathDocument<any, any, any> | null = null;
let currentExtensions: string[] = [];

/**
 * Create a new HTML converter with the specified extensions
 */
function createHtmlConverter(extensions: string[]): MathDocument<any, any, any> {
	// Initialize adaptor if not already done
	if (!adaptor) {
		adaptor = liteAdaptor();
		RegisterHTMLHandler(adaptor);
	}

	// Macro definitions for common shortcuts
	const macrosOption: Record<string, [string, number]> = {
		bm: ['\\boldsymbol{#1}', 1],
	};

	const baseTexOption = {
		packages: extensions,
		macros: macrosOption,
		formatError: (_jax: any, error: any) => { throw new Error(error.message); }
	};

	const texInput = new TeX(baseTexOption);
	const svgOption = { fontCache: 'local' as const };
	const svgOutput = new SVG(svgOption);

	return mathjax.document('', { InputJax: texInput, OutputJax: svgOutput });
}

/**
 * Initialize MathJax with the base extensions
 */
export function initializeMathJax(): void {
	if (!html) {
		currentExtensions = [...BASE_EXTENSIONS];
		html = createHtmlConverter(currentExtensions);
	}
}

/**
 * Load additional MathJax extensions
 *
 * @param extensions Array of extension names to load
 */
export function loadExtensions(extensions: string[]): void {
	// Filter to only valid extensions
	const validExtensions = extensions.filter(ext => MATHJAX_EXTENSIONS.includes(ext));

	// Combine base extensions with additional ones
	const newExtensions = [...BASE_EXTENSIONS, ...validExtensions];

	// Only recreate if extensions changed
	if (JSON.stringify(newExtensions) !== JSON.stringify(currentExtensions)) {
		currentExtensions = newExtensions;
		html = createHtmlConverter(currentExtensions);
	}
}

/**
 * Typeset a LaTeX math expression to SVG
 *
 * @param arg The LaTeX expression to typeset (including any macro definitions)
 * @param opts Typesetting options (scale and color)
 * @returns The SVG HTML string
 */
export function typeset(arg: string, opts: TypesetOptions): string {
	// Ensure MathJax is initialized
	if (!html || !adaptor) {
		initializeMathJax();
	}

	const convertOption = {
		display: true,
		em: 18,
		ex: 9,
		containerWidth: 80 * 18
	};

	const node = html!.convert(arg, convertOption);
	const css = `svg {font-size: ${100 * opts.scale}%;} * { color: ${opts.color} }`;
	let svgHtml = adaptor!.innerHTML(node);

	// Inject CSS into the SVG
	svgHtml = svgHtml.replace(/<defs>/, `<defs><style>${css}</style>`);

	return svgHtml;
}

/**
 * Typeset a LaTeX math expression with a timeout
 *
 * @param arg The LaTeX expression to typeset
 * @param opts Typesetting options
 * @param timeoutMs Timeout in milliseconds (default: 3000)
 * @returns Promise resolving to the SVG HTML string
 */
export async function typesetWithTimeout(arg: string, opts: TypesetOptions, timeoutMs: number = 3000): Promise<string> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error('MathJax typesetting timed out'));
		}, timeoutMs);

		try {
			const result = typeset(arg, opts);
			clearTimeout(timer);
			resolve(result);
		} catch (error) {
			clearTimeout(timer);
			reject(error);
		}
	});
}

/**
 * Dispose of MathJax resources
 */
export function disposeMathJax(): void {
	html = null;
	adaptor = null;
	currentExtensions = [];
}


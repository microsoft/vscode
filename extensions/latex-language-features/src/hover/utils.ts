/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Get the appropriate color for the current color theme
 * @returns '#000000' for light themes, '#ffffff' for dark themes
 */
export function getColor(): string {
	return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? '#000000' : '#ffffff';
}

/**
 * Prepare TeX string for MathJax rendering
 * - Removes comments
 * - Removes \label{...}
 * - Wraps certain environments in equation
 * - Handles special cases like subeqnarray and llbracket/rrbracket
 *
 * @param tex The raw TeX string
 * @param envname The environment name
 * @param opt Options for processing
 * @returns The processed TeX string ready for MathJax
 */
export function mathjaxify(tex: string, envname: string, opt = { stripLabel: true }): string {
	// Remove TeX comments
	let s = stripComments(tex);

	// Remove \label{...}
	if (opt.stripLabel) {
		s = s.replace(/\\label\{.*?\}/g, '');
	}

	// Wrap certain environments in equation
	if (envname.match(/^(aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|gathered|matrix|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)$/)) {
		s = '\\begin{equation}' + s + '\\end{equation}';
	}

	// Handle subeqnarray
	if (envname.match(/^subeqnarray\*?$/)) {
		s = s.replace(/\\(begin|end){subeqnarray\*?}/g, '\\$1{eqnarray}');
	}

	// Handle llbracket/rrbracket (issue #4528 in latex-workshop)
	s = s.replace(/\\llbracket(?!\w)/g, '\\left[\\!\\left[')
		.replace(/\\rrbracket(?!\w)/g, '\\right]\\!\\right]');

	return s;
}

/**
 * Strip the math environment delimiters from TeX string
 *
 * @param tex The TeX string with delimiters
 * @param macros String containing newcommand definitions
 * @returns The TeX string without delimiters
 */
export function stripTeX(tex: string, macros: string): string {
	// First remove math env declaration
	if (tex.startsWith('$$') && tex.endsWith('$$')) {
		tex = tex.slice(2, tex.length - 2);
	} else if (tex.startsWith('$') && tex.endsWith('$')) {
		tex = tex.slice(1, tex.length - 1);
	} else if (tex.startsWith('\\(') && tex.endsWith('\\)')) {
		tex = tex.slice(2, tex.length - 2);
	} else if (tex.startsWith('\\[') && tex.endsWith('\\]')) {
		tex = tex.slice(2, tex.length - 2);
	}

	// Then remove the star variant of new macros
	[...macros.matchAll(/\\newcommand\{(.*?)\}/g)].forEach(match => {
		tex = tex.replaceAll(match[1] + '*', match[1]);
	});

	return tex;
}

/**
 * Add dummy code block to make hover wider
 * VS Code hovers are narrow by default, adding empty code blocks makes them wider
 *
 * @param md The markdown content
 * @returns The markdown with dummy code blocks
 */
export function addDummyCodeBlock(md: string): string {
	const dummyCodeBlock = '```\n```';
	return dummyCodeBlock + '\n' + md + '\n' + dummyCodeBlock;
}

/**
 * Convert SVG XML to a data URL for embedding in markdown
 *
 * @param xml The SVG XML string
 * @returns A base64-encoded data URL
 */
export function svg2DataUrl(xml: string): string {
	// We have to call encodeURIComponent and unescape because SVG can include non-ASCII characters.
	// We have to encode them before converting them to base64.
	// Use btoa for browser compatibility, with fallback for Node.js
	let base64: string;
	if (typeof btoa === 'function') {
		// Browser environment
		base64 = btoa(unescape(encodeURIComponent(xml)));
	} else {
		// Node.js environment
		base64 = Buffer.from(unescape(encodeURIComponent(xml)), 'binary').toString('base64');
	}
	const b64Start = 'data:image/svg+xml;base64,';
	return b64Start + base64;
}

/**
 * Remove comments from LaTeX text
 *
 * @param text The LaTeX text
 * @returns The text with comments removed
 */
export function stripComments(text: string): string {
	// Match % that is not escaped and not in a URL-like pattern
	const reg = /(^|[^\\]|(?:(?<!\\)(?:\\\\)+))%(?![2-9A-F][0-9A-F]).*$/gm;
	return text.replace(reg, '$1');
}

/**
 * Remove comments and verbatim content from LaTeX text
 *
 * @param text The LaTeX text
 * @returns The text with comments and verbatim content removed
 */
export function stripCommentsAndVerbatim(text: string): string {
	let content = stripComments(text);
	// Remove \verb*?...
	content = content.replace(/\\verb\*?([^a-zA-Z0-9]).*?\1/g, '');
	return content;
}

/**
 * Remove specified environments from LaTeX text
 *
 * @param text The LaTeX text
 * @param envs Array of environment names to remove
 * @returns The text with environments removed
 */
export function stripEnvironments(text: string, envs: string[]): string {
	const envsAlt = envs.join('|');
	const pattern = `\\\\begin{(${envsAlt})}.*?\\\\end{\\1}`;
	const reg = RegExp(pattern, 'gms');
	return text.replace(reg, (match, ..._args) => {
		const len = Math.max(match.split('\n').length, 1);
		return '\n'.repeat(len - 1);
	});
}

/**
 * Escape special regex characters in a string
 *
 * @param str The string to escape
 * @returns The escaped string safe for use in RegExp
 */
export function escapeRegExp(str: string): string {
	return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

/**
 * Escape HTML special characters
 *
 * @param s The string to escape
 * @returns The HTML-escaped string
 */
export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}


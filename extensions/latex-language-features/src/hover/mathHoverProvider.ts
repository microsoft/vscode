/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { findTeX, TeXMathEnv } from './mathFinder';
import { getColor, mathjaxify, stripTeX, addDummyCodeBlock, svg2DataUrl } from './utils';
import { typesetWithTimeout, initializeMathJax, loadExtensions, MATHJAX_EXTENSIONS, disposeMathJax } from './mathjaxService';

/**
 * Provides hover previews for LaTeX math expressions
 */
export class MathHoverProvider implements vscode.HoverProvider, vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private configChangeListener: vscode.Disposable | undefined;

	constructor() {
		// Initialize MathJax when provider is created
		initializeMathJax();

		// Listen for configuration changes
		this.configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('latex.hover.preview.mathjax.extensions')) {
				this.updateExtensions();
			}
		});
		this.disposables.push(this.configChangeListener);

		// Load initial extensions from configuration
		this.updateExtensions();
	}

	/**
	 * Update MathJax extensions based on configuration
	 */
	private updateExtensions(): void {
		const config = vscode.workspace.getConfiguration('latex');
		const extensions = config.get<string[]>('hover.preview.mathjax.extensions', []);
		const validExtensions = extensions.filter(ext => MATHJAX_EXTENSIONS.includes(ext));
		loadExtensions(validExtensions);
	}

	/**
	 * Provide hover for LaTeX math expressions
	 */
	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.Hover | undefined> {
		const config = vscode.workspace.getConfiguration('latex');
		const hoverEnabled = config.get<boolean>('hover.preview.enabled', true);

		if (!hoverEnabled) {
			return undefined;
		}

		// Try to find a math expression at the current position
		const tex = findTeX(document, position);
		if (!tex) {
			return undefined;
		}

		try {
			// Render the math expression
			const hover = await this.renderMathHover(document, tex);
			return hover;
		} catch (error) {
			// Log the error but don't show it to the user
			console.error('[MathHoverProvider] Failed to render math hover:', error);
			return undefined;
		}
	}

	/**
	 * Render a math expression to a hover
	 */
	private async renderMathHover(document: vscode.TextDocument, tex: TeXMathEnv): Promise<vscode.Hover> {
		const config = vscode.workspace.getConfiguration('latex');
		const scale = config.get<number>('hover.preview.scale', 1);

		// Process the TeX string for MathJax
		let processedTex = mathjaxify(tex.texString, tex.envname);

		// Add cursor indicator if enabled and cursor is inside the math
		processedTex = await this.renderCursor(document, tex, processedTex, getColor());

		// Strip outer delimiters for typesetting
		const typesetArg = stripTeX(processedTex, '');

		const typesetOpts = { scale, color: getColor() };

		try {
			const svg = await typesetWithTimeout(typesetArg, typesetOpts);
			const dataUrl = svg2DataUrl(svg);
			const markdown = new vscode.MarkdownString(addDummyCodeBlock(`![equation](${dataUrl})`));
			return new vscode.Hover(markdown, tex.range);
		} catch (error) {
			// If typesetting fails, try without macros
			console.warn('[MathHoverProvider] MathJax rendering failed, trying simpler approach');
			throw error;
		}
	}

	/**
	 * Add cursor indicator to the math expression if cursor is inside
	 */
	private async renderCursor(
		document: vscode.TextDocument,
		tex: TeXMathEnv,
		processedTex: string,
		color: string
	): Promise<string> {
		const config = vscode.workspace.getConfiguration('latex');
		const cursorEnabled = config.get<boolean>('hover.preview.cursor.enabled', true);

		if (!cursorEnabled) {
			return processedTex;
		}

		const cursorPos = vscode.window.activeTextEditor?.selection.active;
		if (!cursorPos) {
			return processedTex;
		}

		// Check if cursor is inside the math range
		if (!this.isCursorInsideTexMath(tex.range, cursorPos)) {
			return processedTex;
		}

		// Check if cursor is in a TeX macro (e.g., \begin{...}, \end{...})
		if (this.isCursorInTeXMacro(document, cursorPos)) {
			return processedTex;
		}

		// Insert cursor symbol
		const symbol = config.get<string>('hover.preview.cursor.symbol', '\\!|\\!');
		const cursorColor = config.get<string>('hover.preview.cursor.color', 'auto');
		const cursorString = cursorColor === 'auto'
			? `{\\color{${color}}${symbol}}`
			: `{\\color{${cursorColor}}${symbol}}`;

		return this.insertCursor(tex, processedTex, cursorPos, cursorString);
	}

	/**
	 * Check if cursor position is inside the math range
	 */
	private isCursorInsideTexMath(texMathRange: vscode.Range, cursorPos: vscode.Position): boolean {
		return texMathRange.contains(cursorPos)
			&& !texMathRange.start.isEqual(cursorPos)
			&& !texMathRange.end.isEqual(cursorPos);
	}

	/**
	 * Check if cursor is inside a TeX macro (e.g., \begin{...}, \end{...})
	 */
	private isCursorInTeXMacro(document: vscode.TextDocument, cursorPos: vscode.Position): boolean {
		const r = document.getWordRangeAtPosition(
			cursorPos,
			/\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[()[\]]|\\\\/
		);
		if (r && r.start.isBefore(cursorPos) && r.end.isAfter(cursorPos)) {
			return true;
		}
		return false;
	}

	/**
	 * Insert cursor symbol into the TeX string at the cursor position
	 */
	private insertCursor(
		tex: TeXMathEnv,
		processedTex: string,
		cursorPos: vscode.Position,
		cursorString: string
	): string {
		// Calculate cursor position within the TeX snippet
		const line = cursorPos.line - tex.range.start.line;
		const character = line === 0
			? cursorPos.character - tex.range.start.character
			: cursorPos.character;

		const texLines = processedTex.split('\n');

		if (line >= 0 && line < texLines.length) {
			const lineContent = texLines[line];
			if (character >= 0 && character <= lineContent.length) {
				texLines[line] = lineContent.slice(0, character) + cursorString + lineContent.slice(character);
			}
		}

		return texLines.join('\n');
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
		disposeMathJax();
	}
}

/**
 * Register the math hover provider
 */
export function registerMathHoverProvider(context: vscode.ExtensionContext): vscode.Disposable {
	const provider = new MathHoverProvider();

	const selector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];

	const registration = vscode.languages.registerHoverProvider(selector, provider);

	context.subscriptions.push(provider);
	context.subscriptions.push(registration);

	return registration;
}


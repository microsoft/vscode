/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { compileToSvg, isWasmLoaded } from '../wasm';

/**
 * Represents a found Typst math expression
 */
export interface TypstMathEnv {
	/** The full text of the math expression including delimiters */
	mathString: string;
	/** The range in the document */
	range: vscode.Range;
	/** Whether it's display (block) math or inline math */
	isDisplay: boolean;
}

/**
 * Provides hover previews for Typst math expressions using the Typst WASM compiler
 */
export class TypstMathHoverProvider implements vscode.HoverProvider {

	/**
	 * Provide hover for Typst math expressions
	 */
	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.Hover | undefined> {
		const config = vscode.workspace.getConfiguration('typst');
		const hoverEnabled = config.get<boolean>('hover.preview.math.enabled', true);

		if (!hoverEnabled) {
			return undefined;
		}

		// Check if WASM compiler is ready
		if (!isWasmLoaded()) {
			return undefined;
		}

		// Try to find a math expression at the current position
		const mathEnv = this.findMath(document, position);
		if (!mathEnv) {
			return undefined;
		}

		try {
			// Render the math expression
			const hover = await this.renderMathHover(mathEnv);
			return hover;
		} catch (error) {
			// Log the error but don't show it to the user
			console.error('[TypstMathHoverProvider] Failed to render math hover:', error);
			return undefined;
		}
	}

	/**
	 * Find a Typst math expression at the given position
	 *
	 * Typst math syntax:
	 * - Inline math: $x^2 + y^2$ (no space after opening $ or before closing $)
	 * - Display math: $ x^2 + y^2 $ (space after opening $ and before closing $)
	 */
	private findMath(document: vscode.TextDocument, position: vscode.Position): TypstMathEnv | undefined {
		// First, try to find math on the current line
		const lineText = document.lineAt(position.line).text;

		// Find all math expressions on this line
		const mathMatches = this.findMathInLine(lineText, position.line);

		// Check if cursor is inside any of them
		for (const match of mathMatches) {
			if (match.range.contains(position)) {
				return match;
			}
		}

		// For multiline display math, search backwards
		const multilineMath = this.findMultilineMath(document, position);
		if (multilineMath) {
			return multilineMath;
		}

		return undefined;
	}

	/**
	 * Find all math expressions in a single line
	 */
	private findMathInLine(lineText: string, lineNumber: number): TypstMathEnv[] {
		const results: TypstMathEnv[] = [];

		// Match $...$ - both inline and display math
		// Display math has a space after opening $ and before closing $
		// Inline math does not have those spaces
		// We need to be careful not to match $$
		const mathRegex = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)*)(?<!\$)\$(?!\$)/g;

		let match;
		while ((match = mathRegex.exec(lineText)) !== null) {
			const startChar = match.index;
			const endChar = match.index + match[0].length;
			const mathContent = match[1];

			// Check if it's display math (has space padding)
			const isDisplay = mathContent.startsWith(' ') && mathContent.endsWith(' ');

			results.push({
				mathString: match[0],
				range: new vscode.Range(lineNumber, startChar, lineNumber, endChar),
				isDisplay
			});
		}

		return results;
	}

	/**
	 * Find multiline display math that contains the position
	 * Typst display math can span multiple lines
	 */
	private findMultilineMath(document: vscode.TextDocument, position: vscode.Position): TypstMathEnv | undefined {
		const maxSearchLines = 50;

		// Search backwards for an unclosed $
		let startLine = position.line;
		let startChar = 0;
		let foundStart = false;
		let dollarCount = 0;

		// First check: count $ on current line before cursor
		const currentLine = document.lineAt(position.line).text;
		const beforeCursor = currentLine.substring(0, position.character);

		// Count unescaped $ signs
		for (let i = 0; i < beforeCursor.length; i++) {
			if (beforeCursor[i] === '$' && (i === 0 || beforeCursor[i - 1] !== '\\')) {
				// Skip $$
				if (i + 1 < beforeCursor.length && beforeCursor[i + 1] === '$') {
					i++; // skip next $
					continue;
				}
				if (i > 0 && beforeCursor[i - 1] === '$') {
					continue;
				}
				dollarCount++;
				if (dollarCount % 2 === 1) {
					startLine = position.line;
					startChar = i;
					foundStart = true;
				}
			}
		}

		// If we're inside a math block on this line, search forward for the closing $
		if (foundStart && dollarCount % 2 === 1) {
			const afterCursor = currentLine.substring(position.character);
			const closingMatch = afterCursor.match(/(?<!\\)\$/);

			if (closingMatch && closingMatch.index !== undefined) {
				// Found closing $ on same line
				const endChar = position.character + closingMatch.index + 1;
				const mathString = currentLine.substring(startChar, endChar);

				return {
					mathString,
					range: new vscode.Range(startLine, startChar, position.line, endChar),
					isDisplay: this.isDisplayMath(mathString)
				};
			}

			// Search forward for closing $ on subsequent lines
			for (let line = position.line + 1; line < Math.min(document.lineCount, position.line + maxSearchLines); line++) {
				const lineText = document.lineAt(line).text;
				const closeMatch = lineText.match(/(?<!\\)\$/);

				if (closeMatch && closeMatch.index !== undefined) {
					// Build the full math string
					let mathString = currentLine.substring(startChar) + '\n';
					for (let l = position.line + 1; l < line; l++) {
						mathString += document.lineAt(l).text + '\n';
					}
					mathString += lineText.substring(0, closeMatch.index + 1);

					return {
						mathString,
						range: new vscode.Range(startLine, startChar, line, closeMatch.index + 1),
						isDisplay: true // Multiline math is always display
					};
				}
			}
		}

		// Search backwards if we haven't found a starting $ on this line
		if (!foundStart) {
			for (let line = position.line; line >= Math.max(0, position.line - maxSearchLines); line--) {
				const lineText = document.lineAt(line).text;
				const checkUpTo = line === position.line ? position.character : lineText.length;

				// Count $ on this line
				dollarCount = 0;
				for (let i = 0; i < checkUpTo; i++) {
					if (lineText[i] === '$' && (i === 0 || lineText[i - 1] !== '\\')) {
						if (i + 1 < lineText.length && lineText[i + 1] === '$') {
							i++;
							continue;
						}
						if (i > 0 && lineText[i - 1] === '$') {
							continue;
						}
						dollarCount++;
						if (dollarCount % 2 === 1) {
							startLine = line;
							startChar = i;
							foundStart = true;
						}
					}
				}

				// If we found an unclosed $ on a previous line
				if (foundStart && line < position.line && dollarCount % 2 === 1) {
					// Search forward from position for closing $
					for (let fwdLine = position.line; fwdLine < Math.min(document.lineCount, position.line + maxSearchLines); fwdLine++) {
						const fwdLineText = document.lineAt(fwdLine).text;
						const searchFrom = fwdLine === position.line ? position.character : 0;
						const searchIn = fwdLineText.substring(searchFrom);
						const closeMatch = searchIn.match(/(?<!\\)\$/);

						if (closeMatch && closeMatch.index !== undefined) {
							// Build the full math string
							let mathString = lineText.substring(startChar) + '\n';
							for (let l = line + 1; l < fwdLine; l++) {
								mathString += document.lineAt(l).text + '\n';
							}
							mathString += fwdLineText.substring(0, searchFrom + closeMatch.index + 1);

							return {
								mathString,
								range: new vscode.Range(startLine, startChar, fwdLine, searchFrom + closeMatch.index + 1),
								isDisplay: true
							};
						}
					}
				}
			}
		}

		return undefined;
	}

	/**
	 * Check if a math string is display math (block) or inline
	 */
	private isDisplayMath(mathString: string): boolean {
		// Remove the outer $ delimiters
		if (mathString.startsWith('$') && mathString.endsWith('$')) {
			const inner = mathString.slice(1, -1);
			// Display math has leading and trailing spaces
			return inner.startsWith(' ') && inner.endsWith(' ');
		}
		return false;
	}

	/**
	 * Render a math expression to a hover using Typst WASM
	 */
	private async renderMathHover(mathEnv: TypstMathEnv): Promise<vscode.Hover> {
		// Get theme color for text
		const color = this.getColor();

		// Create a minimal Typst document that renders just the math
		// We set the page size to auto so it fits the content
		const typstSource = this.createTypstDocument(mathEnv, color);

		try {
			const result = await compileToSvg(typstSource);

			if (result.success && result.svg) {
				// The SVG from typst.ts might be a string or need processing
				let svgContent: string = result.svg;

				// If it's an array (multiple pages), take the first one
				if (Array.isArray(svgContent)) {
					svgContent = svgContent[0] || '';
				}

				// Ensure it's a string
				if (typeof svgContent !== 'string') {
					throw new Error('Invalid SVG format');
				}

				// Convert SVG to data URL (this also processes/fixes the SVG)
				const dataUrl = this.svg2DataUrl(svgContent);

				// Use markdown image syntax with dummy code blocks (same as LaTeX extension)
				const dummyCodeBlock = '```\n```';
				const markdownContent = dummyCodeBlock + '\n' + `![math](${dataUrl})` + '\n' + dummyCodeBlock;
				const markdown = new vscode.MarkdownString(markdownContent);
				return new vscode.Hover(markdown, mathEnv.range);
			} else {
				// If compilation fails, return a hover with the error
				console.warn('[TypstMathHoverProvider] SVG compilation failed:', result.errors);
				throw new Error(result.errors?.[0]?.message ?? 'Compilation failed');
			}
		} catch (error) {
			console.error('[TypstMathHoverProvider] Render error:', error);
			throw error;
		}
	}

	/**
	 * Create a minimal Typst document for rendering math
	 */
	private createTypstDocument(mathEnv: TypstMathEnv, color: string): string {
		// Use auto page dimensions to fit content
		const mathContent = mathEnv.mathString;

		// Render with larger text size for better visibility in hover
		return `#set page(width: auto, height: auto, margin: 4pt)
#set text(size: 22pt, fill: rgb("${color.replace('#', '')}"))
${mathContent}`;
	}

	/**
	 * Get the appropriate color for the current color theme
	 */
	private getColor(): string {
		return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? '#000000' : '#ffffff';
	}

	/**
	 * Convert SVG XML to a data URL for embedding in markdown
	 * Uses the same encoding as LaTeX extension for compatibility
	 */
	private svg2DataUrl(xml: string): string {
		// Clean up the SVG - remove XML declaration if present
		let cleanSvg = xml.trim();
		if (cleanSvg.startsWith('<?xml')) {
			const endOfDecl = cleanSvg.indexOf('?>');
			if (endOfDecl !== -1) {
				cleanSvg = cleanSvg.substring(endOfDecl + 2).trim();
			}
		}

		// Extract viewBox and add width/height if missing
		cleanSvg = this.fixSvgDimensions(cleanSvg);

		// Use the exact same encoding as LaTeX extension
		// We have to call encodeURIComponent and unescape because SVG can include non-ASCII characters.
		let base64: string;
		if (typeof btoa === 'function') {
			// Browser environment - same as LaTeX
			base64 = btoa(unescape(encodeURIComponent(cleanSvg)));
		} else {
			// Node.js environment
			base64 = Buffer.from(unescape(encodeURIComponent(cleanSvg)), 'binary').toString('base64');
		}
		return 'data:image/svg+xml;base64,' + base64;
	}

	/**
	 * Fix SVG for embedding as data URL
	 * - Removes foreignObject elements (don't work in data URLs)
	 * - Removes external font/resource references
	 * - Adds width/height attributes based on viewBox
	 */
	private fixSvgDimensions(svg: string): string {
		let fixedSvg = svg;

		// CRITICAL: Remove foreignObject elements - they don't work in data URL SVGs
		// These are used for text selection overlays but break the rendering
		let iterations = 0;
		const maxIterations = 100; // Safety limit

		while (fixedSvg.includes('<foreignObject') && iterations < maxIterations) {
			iterations++;
			const startIdx = fixedSvg.indexOf('<foreignObject');
			const endTag = '</foreignObject>';
			const endIdx = fixedSvg.indexOf(endTag, startIdx);

			if (startIdx !== -1 && endIdx !== -1) {
				fixedSvg = fixedSvg.substring(0, startIdx) + fixedSvg.substring(endIdx + endTag.length);
			} else {
				break;
			}
		}

		// Remove empty g elements that contained foreignObject
		let prevLength = 0;
		while (prevLength !== fixedSvg.length) {
			prevLength = fixedSvg.length;
			fixedSvg = fixedSvg.replace(/<g[^>]*>\s*<\/g>/g, '');
		}

		// Remove ALL script tags and their content (they can contain JS that creates foreignObject)
		while (fixedSvg.includes('<script')) {
			const scriptStart = fixedSvg.indexOf('<script');
			const scriptEnd = fixedSvg.indexOf('</script>', scriptStart);
			if (scriptStart !== -1 && scriptEnd !== -1) {
				fixedSvg = fixedSvg.substring(0, scriptStart) + fixedSvg.substring(scriptEnd + '</script>'.length);
			} else {
				break;
			}
		}

		// Remove external stylesheet references (like @import or link elements)
		fixedSvg = fixedSvg.replace(/<link[^>]*>/gi, '');
		fixedSvg = fixedSvg.replace(/@import\s+url\([^)]+\)\s*;?/gi, '');

		// Remove the h5 namespace since we removed foreignObject
		fixedSvg = fixedSvg.replace(/\s*xmlns:h5="[^"]*"/gi, '');

		// Add width and height if missing
		if (!fixedSvg.match(/<svg[^>]*\swidth\s*=/i) || !fixedSvg.match(/<svg[^>]*\sheight\s*=/i)) {
			const viewBoxMatch = fixedSvg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
			if (viewBoxMatch) {
				const viewBoxParts = viewBoxMatch[1].trim().split(/\s+/);
				if (viewBoxParts.length === 4) {
					const width = parseFloat(viewBoxParts[2]);
					const height = parseFloat(viewBoxParts[3]);

					if (!isNaN(width) && !isNaN(height)) {
						const scale = 4.9; // Scale up for better visibility in hover
						const displayWidth = Math.ceil(width * scale);
						const displayHeight = Math.ceil(height * scale);

						fixedSvg = fixedSvg.replace(
							/<svg(\s)/i,
							`<svg width="${displayWidth}" height="${displayHeight}"$1`
						);
					}
				}
			}
		}

		return fixedSvg;
	}

}

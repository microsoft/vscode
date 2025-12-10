/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Stack item for tracking environment/region opening positions
 */
interface FoldingStackItem {
	keyword: string;
	index: number;
}

/**
 * Section tracking for hierarchical section folding
 */
interface SectionFoldingInfo {
	level: number;
	from: number;
	to: number;
}

/**
 * Folding Range Provider for LaTeX documents
 * Provides folding for:
 * - Sections (part, chapter, section, subsection, etc.)
 * - Environments (\begin{...}...\end{...})
 * - Preamble (documentclass to \begin{document})
 * - Regions (% region / % endregion)
 * - Groups (\begingroup...\endgroup)
 *
 * Ported from latex-workshop with adaptations for latex-language-features
 */
export class LaTeXFoldingProvider implements vscode.FoldingRangeProvider {
	private sectionRegex: RegExp[] = [];

	constructor() {
		this.refreshConfiguration();
	}

	/**
	 * Refresh section regex from configuration
	 */
	private refreshConfiguration(): void {
		const configuration = vscode.workspace.getConfiguration('latex');
		const sections = configuration.get<string[]>('outline.sections', [
			'part',
			'chapter',
			'section',
			'subsection',
			'subsubsection',
			'paragraph',
			'subparagraph'
		]);
		this.sectionRegex = this.buildSectionRegex(sections);
	}

	/**
	 * Build regex patterns for section commands
	 * Note: Braces around capture group are NOT escaped (matches original latex-workshop)
	 */
	protected buildSectionRegex(sections: string[]): RegExp[] {
		return sections.map(section =>
			RegExp(`\\\\(?:${section})(?:\\*)?(?:\\[[^\\[\\]\\{\\}]*\\])?{(.*)}`, 'm')
		);
	}

	/**
	 * Provide folding ranges for the document
	 */
	provideFoldingRanges(
		document: vscode.TextDocument,
		_context: vscode.FoldingContext,
		_token: vscode.CancellationToken
	): vscode.FoldingRange[] {
		// Refresh configuration in case it changed
		this.refreshConfiguration();

		return [
			...this.getSectionFoldingRanges(document),
			...this.getEnvironmentFoldingRanges(document)
		];
	}

	/**
	 * Get folding ranges for sections
	 * Handles hierarchical section nesting
	 */
	private getSectionFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
		const startingIndices: number[] = this.sectionRegex.map(() => -1);
		const lines = document.getText().split(/\r?\n/g);
		let documentClassLine = -1;
		const sections: SectionFoldingInfo[] = [];
		let index = -1;
		let lastNonemptyLineIndex = -1;

		for (const line of lines) {
			index++;

			// Check each section level
			for (const regex of this.sectionRegex) {
				const result = regex.exec(line);
				if (!result) {
					continue;
				}

				const regIndex = this.sectionRegex.indexOf(regex);
				const originalIndex = startingIndices[regIndex];

				if (originalIndex === -1) {
					startingIndices[regIndex] = index;
					continue;
				}

				// Close all sections at this level and below (matching original latex-workshop)
				let i = regIndex;
				while (i < this.sectionRegex.length) {
					sections.push({
						level: i,
						from: startingIndices[i],
						to: lastNonemptyLineIndex
					});
					startingIndices[i] = regIndex === i ? index : -1;
					++i;
				}
			}

			// Track preamble (documentclass to \begin{document})
			if (/\\documentclass/.exec(line)) {
				documentClassLine = index;
			}

			if (/\\begin\{document\}/.exec(line) && documentClassLine > -1) {
				sections.push({
					level: 0,
					from: documentClassLine,
					to: lastNonemptyLineIndex
				});
				documentClassLine = -1; // Reset to avoid duplicate folding
			}

			// End of document - close all open sections
			if (/\\end\{document\}/.exec(line) || index === lines.length - 1) {
				for (let i = 0; i < startingIndices.length; ++i) {
					if (startingIndices[i] === -1) {
						continue;
					}
					sections.push({
						level: i,
						from: startingIndices[i],
						to: lastNonemptyLineIndex
					});
				}
			}

			// Track last non-empty line for accurate folding end
			if (!line.match(/^\s*$/)) {
				lastNonemptyLineIndex = index;
			}
		}

		return sections.map(section => new vscode.FoldingRange(section.from, section.to));
	}

	/**
	 * Get folding ranges for environments, groups, and regions
	 */
	protected getEnvironmentFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
		const ranges: vscode.FoldingRange[] = [];
		const opStack: FoldingStackItem[] = [];
		const text = document.getText();

		// Regex to match:
		// - \begin{envname}
		// - \end{envname}
		// - \begingroup
		// - \endgroup
		// - % region / % #region
		// - % endregion / % #endregion
		// - Multi-line comments (consecutive % lines)
		const envRegex = /\\(begin)\{(.*?)\}|\\(begingroup)[%\s\\]|\\(end)\{(.*?)\}|\\(endgroup)[%\s\\]|^%\s*#?([rR]egion)|^%\s*#?([eE]ndregion)/gm;

		while (true) {
			const match = envRegex.exec(text);
			if (match === null) {
				return ranges;
			}

			// Determine the keyword based on what matched:
			// match[1] = 'begin', match[2] = environment name
			// match[3] = 'begingroup'
			// match[4] = 'end', match[5] = environment name
			// match[6] = 'endgroup'
			// match[7] = 'region'
			// match[8] = 'endregion'
			let keyword = '';
			if (match[1]) {
				keyword = match[2];
			} else if (match[4]) {
				keyword = match[5];
			} else if (match[3] || match[6]) {
				keyword = 'group';
			} else if (match[7] || match[8]) {
				keyword = 'region';
			}

			const item: FoldingStackItem = {
				keyword,
				index: match.index
			};

			const lastItem = opStack[opStack.length - 1];

			// Check if this is a closing tag that matches an opening tag
			if ((match[4] || match[6] || match[8]) && lastItem && lastItem.keyword === item.keyword) {
				opStack.pop();
				const startLine = document.positionAt(lastItem.index).line;
				const endLine = document.positionAt(item.index).line - 1;

				// Only add if there's at least one line to fold
				if (endLine > startLine) {
					ranges.push(new vscode.FoldingRange(startLine, endLine));
				}
			} else if (match[1] || match[3] || match[7]) {
				// This is an opening tag
				opStack.push(item);
			}
		}
	}
}

/**
 * Folding provider for DocTeX (.dtx) files
 * Extends LaTeX folding with DocTeX-specific patterns
 */
export class DocTeXFoldingProvider extends LaTeXFoldingProvider {
	/**
	 * Build regex patterns for DocTeX section commands (prefixed with %)
	 */
	protected override buildSectionRegex(sections: string[]): RegExp[] {
		return sections.map(section =>
			RegExp(`%\\s*\\\\(?:${section})(?:\\*)?(?:\\[[^\\[\\]\\{\\}]*\\])?{(.*)}`, 'm')
		);
	}

	/**
	 * Get folding ranges for DocTeX environments
	 * Includes DocTeX-specific patterns like %<*tag> and % \iffalse
	 */
	protected override getEnvironmentFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
		const ranges: vscode.FoldingRange[] = [];
		const opStack: Array<{ keyword: string; index: number }> = [];
		const text = document.getText();

		// Extended regex for DocTeX:
		// - Standard LaTeX environments
		// - %<*tag> / %</tag> guards
		// - % \iffalse meta-comment / % \fi
		const envRegex = /\\(begin)\{(.*?)\}|\\(begingroup)[%\s\\]|\\(end)\{(.*?)\}|\\(endgroup)[%\s\\]|^%\s*#?([rR]egion)|^%\s*#?([eE]ndregion)|^%\s*<\*([|,&!()_\-a-zA-Z0-9]+)>|^%\s*<\/([|,&!()_\-a-zA-Z0-9]+)>|^%\s*\\iffalse\s*(meta-comment)|^%\s*\\(fi)/gm;

		while (true) {
			const match = envRegex.exec(text);
			if (match === null) {
				return ranges;
			}

			let keyword = '';
			if (match[1]) {
				keyword = match[2];
			} else if (match[4]) {
				keyword = match[5];
			} else if (match[3] || match[6]) {
				keyword = 'group';
			} else if (match[7] || match[8]) {
				keyword = 'region';
			} else if (match[9]) {
				// %<*tag>
				keyword = '%<' + match[9] + '>';
			} else if (match[10]) {
				// %</tag>
				keyword = '%<' + match[10] + '>';
			} else if (match[11] || match[12]) {
				// % \iffalse meta-comment / % \fi
				keyword = '%\\iffalse meta-comment';
			}

			const item = {
				keyword,
				index: match.index
			};

			// Check for closing patterns
			if (match[4] || match[6] || match[8] || match[10] || match[12]) {
				// Find matching opening item (may not be the last one)
				for (let openingIndex = opStack.length - 1; openingIndex >= 0; openingIndex--) {
					const openingItem = opStack[openingIndex];
					if (openingItem && openingItem.keyword === item.keyword) {
						const lastLineTune = match[10] || match[12] ? 0 : -1;
						const startLine = document.positionAt(openingItem.index).line;
						const endLine = document.positionAt(item.index).line + lastLineTune;

						if (endLine > startLine) {
							ranges.push(new vscode.FoldingRange(startLine, endLine));
						}
						opStack.splice(openingIndex, 1);
						break;
					}
				}
			} else {
				opStack.push(item);
			}
		}
	}
}

/**
 * Register folding providers for LaTeX documents
 */
export function registerFoldingProviders(_context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// LaTeX folding provider
	const latexSelector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];
	disposables.push(
		vscode.languages.registerFoldingRangeProvider(latexSelector, new LaTeXFoldingProvider())
	);

	// DocTeX folding provider
	const doctexSelector: vscode.DocumentSelector = [
		{ language: 'doctex', scheme: '*' }
	];
	disposables.push(
		vscode.languages.registerFoldingRangeProvider(doctexSelector, new DocTeXFoldingProvider())
	);

	return disposables;
}


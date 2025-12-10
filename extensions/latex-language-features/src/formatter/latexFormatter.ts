/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Configuration options for LaTeX formatting
 */
interface FormatterConfig {
	tabSize: number;
	insertSpaces: boolean;
	indentEnvironments: boolean;
	alignTableColumns: boolean;
	wrapLongLines: boolean;
	lineWidth: number;
	trimTrailingWhitespace: boolean;
	insertFinalNewline: boolean;
	alignEquationEnvironments: boolean;
}

/**
 * Environments that should have their content indented
 */
const INDENTABLE_ENVIRONMENTS = new Set([
	// Document structure
	'document', 'abstract',
	// Lists
	'itemize', 'enumerate', 'description', 'list',
	// Floats
	'figure', 'table', 'subfigure', 'subtable',
	// Math environments
	'equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
	'multline', 'multline*', 'flalign', 'flalign*', 'alignat', 'alignat*',
	'eqnarray', 'eqnarray*', 'split', 'cases', 'dcases',
	// Theorems and proofs
	'theorem', 'lemma', 'proposition', 'corollary', 'definition',
	'example', 'remark', 'proof', 'exercise', 'solution',
	// Code and verbatim
	'verbatim', 'lstlisting', 'minted', 'algorithm', 'algorithmic',
	// Tables
	'tabular', 'tabular*', 'tabularx', 'longtable', 'array',
	// Boxes
	'minipage', 'parbox', 'fbox', 'framebox', 'center', 'flushleft', 'flushright',
	// TikZ
	'tikzpicture', 'scope', 'axis',
	// Beamer
	'frame', 'block', 'alertblock', 'exampleblock', 'columns', 'column',
	// Others
	'quote', 'quotation', 'verse', 'appendix', 'thebibliography'
]);

/**
 * Environments where content should NOT be formatted (verbatim-like)
 */
const VERBATIM_ENVIRONMENTS = new Set([
	'verbatim', 'verbatim*', 'lstlisting', 'minted', 'alltt',
	'comment', 'filecontents', 'filecontents*'
]);

/**
 * Table-like environments for column alignment
 * Used in alignTableColumns to identify which environments to align
 */
const TABLE_ENVIRONMENTS = [
	'tabular', 'tabular*', 'tabularx', 'longtable', 'array',
	'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix',
	'cases', 'dcases', 'rcases', 'aligned', 'alignedat', 'gathered'
];

/**
 * State tracking for the formatter
 */
interface FormatterState {
	indentLevel: number;
	inVerbatim: boolean;
	inMath: boolean;
	verbatimEnvName: string | null;
}

/**
 * Pure JavaScript LaTeX Formatter
 * Works in both desktop and web environments
 */
class LaTeXFormatter {
	private config: FormatterConfig;

	constructor(config: FormatterConfig) {
		this.config = config;
	}

	/**
	 * Format a LaTeX document
	 */
	format(text: string): string {
		const lines = text.split(/\r?\n/);
		const formattedLines: string[] = [];
		const state: FormatterState = {
			indentLevel: 0,
			inVerbatim: false,
			inMath: false,
			verbatimEnvName: null
		};

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const formattedLine = this.formatLine(line, state);
			formattedLines.push(formattedLine);
		}

		let result = formattedLines.join('\n');

		// Post-processing
		if (this.config.trimTrailingWhitespace) {
			result = result.split('\n').map(l => l.trimEnd()).join('\n');
		}

		if (this.config.insertFinalNewline && !result.endsWith('\n')) {
			result += '\n';
		}

		// Align table columns if enabled
		if (this.config.alignTableColumns) {
			result = this.alignTableColumns(result);
		}

		return result;
	}

	/**
	 * Format a single line
	 */
	private formatLine(line: string, state: FormatterState): string {
		// Handle verbatim environments - don't format
		if (state.inVerbatim) {
			// Check for end of verbatim
			const endMatch = line.match(/\\end\{([^}]+)\}/);
			if (endMatch && endMatch[1] === state.verbatimEnvName) {
				state.inVerbatim = false;
				state.verbatimEnvName = null;
			}
			return line; // Return unchanged
		}

		// Check for start of verbatim
		const verbatimStart = line.match(/\\begin\{(verbatim\*?|lstlisting|minted|alltt|comment|filecontents\*?)\}/);
		if (verbatimStart) {
			state.inVerbatim = true;
			state.verbatimEnvName = verbatimStart[1];
		}

		// Trim the line for processing
		const trimmedLine = line.trim();

		// Empty lines - preserve but normalize
		if (trimmedLine === '') {
			return '';
		}

		// Comment-only lines - preserve indentation
		if (trimmedLine.startsWith('%')) {
			return this.getIndent(state.indentLevel) + trimmedLine;
		}

		// Calculate indent adjustment BEFORE this line
		const dedentBefore = this.shouldDedentBefore(trimmedLine);
		if (dedentBefore) {
			state.indentLevel = Math.max(0, state.indentLevel - 1);
		}

		// Build the formatted line
		const formattedLine = this.getIndent(state.indentLevel) + this.formatLineContent(trimmedLine);

		// Calculate indent adjustment AFTER this line
		const indentAfter = this.shouldIndentAfter(trimmedLine);
		if (indentAfter) {
			state.indentLevel++;
		}

		// Handle \end on the same line as \begin (net change = 0)
		// Already handled by the order of operations

		return formattedLine;
	}

	/**
	 * Check if we should decrease indent before this line
	 */
	private shouldDedentBefore(line: string): boolean {
		// \end{...} should dedent before
		const endMatch = line.match(/^\\end\{([^}]+)\}/);
		if (endMatch && this.config.indentEnvironments) {
			const envName = endMatch[1];
			if (INDENTABLE_ENVIRONMENTS.has(envName) || INDENTABLE_ENVIRONMENTS.has(envName.replace('*', ''))) {
				return true;
			}
		}

		// Closing braces at start of line
		if (/^\}/.test(line)) {
			return true;
		}

		// \] for display math
		if (/^\\\]/.test(line)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if we should increase indent after this line
	 */
	private shouldIndentAfter(line: string): boolean {
		// \begin{...} should indent after (unless \end is on same line)
		const beginMatch = line.match(/\\begin\{([^}]+)\}/);
		const endMatch = line.match(/\\end\{([^}]+)\}/);

		if (beginMatch && this.config.indentEnvironments) {
			const envName = beginMatch[1];
			// Check if \end is on the same line
			if (endMatch && endMatch[1] === envName) {
				return false; // Same line begin/end, no net indent
			}
			if (INDENTABLE_ENVIRONMENTS.has(envName) || INDENTABLE_ENVIRONMENTS.has(envName.replace('*', ''))) {
				// Don't indent after verbatim environments
				if (!VERBATIM_ENVIRONMENTS.has(envName)) {
					return true;
				}
			}
		}

		// Opening brace at end of line (for multi-line macro definitions)
		if (/\{[^}]*$/.test(line) && !/\\begin\{/.test(line)) {
			// Count braces
			const openBraces = (line.match(/\{/g) || []).length;
			const closeBraces = (line.match(/\}/g) || []).length;
			if (openBraces > closeBraces) {
				return true;
			}
		}

		// \[ for display math
		if (/\\\[$/.test(line)) {
			return true;
		}

		return false;
	}

	/**
	 * Format the content of a line (spacing, etc.)
	 */
	private formatLineContent(line: string): string {
		let result = line;

		// Normalize multiple spaces to single space (but not in commands)
		result = result.replace(/([^\\])  +/g, '$1 ');

		// Space after certain commands
		result = result.replace(/\\(item|label|ref|cite|eqref|caption|section|subsection|subsubsection|paragraph|chapter|part)(\[|\{)/g, '\\$1$2');

		// Normalize space around binary operators in math (careful not to affect text)
		// This is tricky, so we keep it simple

		return result;
	}

	/**
	 * Get indentation string for given level
	 */
	private getIndent(level: number): string {
		if (level <= 0) {
			return '';
		}
		const indentChar = this.config.insertSpaces ? ' '.repeat(this.config.tabSize) : '\t';
		return indentChar.repeat(level);
	}

	/**
	 * Align columns in table environments
	 */
	private alignTableColumns(text: string): string {
		const lines = text.split('\n');
		const result: string[] = [];
		let inTable = false;
		let tableLines: string[] = [];
		let tableIndent = '';
		let currentTableEnv = '';

		// Build regex pattern from TABLE_ENVIRONMENTS
		const tableEnvPattern = TABLE_ENVIRONMENTS.join('|').replace(/\*/g, '\\*');

		for (const line of lines) {
			// Check for table environment start
			const tableStartRegex = new RegExp(`^(\\s*)\\\\begin\\{(${tableEnvPattern})\\}`);
			const tableStartMatch = line.match(tableStartRegex);
			if (tableStartMatch && !inTable) {
				inTable = true;
				tableIndent = tableStartMatch[1];
				currentTableEnv = tableStartMatch[2];
				tableLines = [line];
				continue;
			}

			// Check for table environment end
			if (inTable) {
				const tableEndRegex = new RegExp(`\\\\end\\{${currentTableEnv.replace(/\*/g, '\\*')}\\}`);
				if (line.match(tableEndRegex)) {
					tableLines.push(line);
					// Align the table
					const alignedTable = this.alignTable(tableLines, tableIndent);
					result.push(...alignedTable);
					inTable = false;
					tableLines = [];
					currentTableEnv = '';
					continue;
				}
			}

			if (inTable) {
				tableLines.push(line);
			} else {
				result.push(line);
			}
		}

		// If we ended inside a table (malformed), just add the lines
		if (tableLines.length > 0) {
			result.push(...tableLines);
		}

		return result.join('\n');
	}

	/**
	 * Align a single table
	 */
	private alignTable(lines: string[], baseIndent: string): string[] {
		if (lines.length < 3) {
			return lines; // Too short to align (begin, end only)
		}

		// Find content lines (between begin and end)
		const beginLine = lines[0];
		const endLine = lines[lines.length - 1];
		const contentLines = lines.slice(1, -1);

		// Parse rows into cells
		const rows: string[][] = [];
		let maxColumns = 0;

		for (const line of contentLines) {
			const trimmed = line.trim();

			// Skip empty lines, comments, and \hline
			if (trimmed === '' || trimmed.startsWith('%') || trimmed.startsWith('\\hline') || trimmed.startsWith('\\toprule') || trimmed.startsWith('\\midrule') || trimmed.startsWith('\\bottomrule') || trimmed.startsWith('\\cline')) {
				rows.push([line]); // Keep as-is
				continue;
			}

			// Remove trailing \\ and anything after (like [1ex])
			let content = trimmed;
			const rowEndMatch = content.match(/(.*)\\\\.*$/);
			if (rowEndMatch) {
				content = rowEndMatch[1];
			}

			// Split by & but be careful with nested braces
			const cells = this.splitTableRow(content);
			rows.push(cells);
			maxColumns = Math.max(maxColumns, cells.length);
		}

		// Calculate max width for each column
		const columnWidths: number[] = new Array(maxColumns).fill(0);
		for (const row of rows) {
			if (row.length === 1 && (row[0].trim().startsWith('%') || row[0].trim().startsWith('\\hline') || row[0].trim().startsWith('\\toprule') || row[0].trim().startsWith('\\midrule') || row[0].trim().startsWith('\\bottomrule') || row[0].trim().startsWith('\\cline') || row[0].trim() === '')) {
				continue; // Skip special lines
			}
			for (let i = 0; i < row.length; i++) {
				columnWidths[i] = Math.max(columnWidths[i], row[i].trim().length);
			}
		}

		// Rebuild the table with aligned columns
		const result: string[] = [beginLine];
		const contentIndent = baseIndent + this.getIndent(1);

		let rowIndex = 0;
		for (const originalLine of contentLines) {
			const row = rows[rowIndex++];
			const trimmed = originalLine.trim();

			// Keep special lines as-is
			if (row.length === 1 && (trimmed.startsWith('%') || trimmed.startsWith('\\hline') || trimmed.startsWith('\\toprule') || trimmed.startsWith('\\midrule') || trimmed.startsWith('\\bottomrule') || trimmed.startsWith('\\cline') || trimmed === '')) {
				result.push(contentIndent + trimmed);
				continue;
			}

			// Check for row end
			const rowEndMatch = originalLine.match(/(\\\\.*$)/);
			const rowEnd = rowEndMatch ? ' ' + rowEndMatch[1].trim() : '';

			// Align cells
			const alignedCells: string[] = [];
			for (let i = 0; i < row.length; i++) {
				const cell = row[i].trim();
				const width = columnWidths[i];
				// Pad with spaces (left-align by default)
				alignedCells.push(cell.padEnd(width));
			}

			// Join with ' & ' and add row end
			const alignedRow = contentIndent + alignedCells.join(' & ') + rowEnd;
			result.push(alignedRow);
		}

		result.push(endLine);
		return result;
	}

	/**
	 * Split a table row by & while respecting brace nesting
	 */
	private splitTableRow(content: string): string[] {
		const cells: string[] = [];
		let current = '';
		let braceLevel = 0;

		for (let i = 0; i < content.length; i++) {
			const char = content[i];

			if (char === '{') {
				braceLevel++;
				current += char;
			} else if (char === '}') {
				braceLevel--;
				current += char;
			} else if (char === '&' && braceLevel === 0) {
				cells.push(current);
				current = '';
			} else {
				current += char;
			}
		}

		cells.push(current);
		return cells;
	}
}

/**
 * VS Code Document Formatting Provider for LaTeX
 */
class LaTeXFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {

	provideDocumentFormattingEdits(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		_token: vscode.CancellationToken
	): vscode.TextEdit[] {
		const config = this.getConfig(options);
		const formatter = new LaTeXFormatter(config);

		const text = document.getText();
		const formatted = formatter.format(text);

		if (text === formatted) {
			return [];
		}

		const fullRange = new vscode.Range(
			document.positionAt(0),
			document.positionAt(text.length)
		);

		return [vscode.TextEdit.replace(fullRange, formatted)];
	}

	provideDocumentRangeFormattingEdits(
		document: vscode.TextDocument,
		range: vscode.Range,
		options: vscode.FormattingOptions,
		_token: vscode.CancellationToken
	): vscode.TextEdit[] {
		// For range formatting, we format the whole document but only return edits for the range
		// This ensures consistent indentation
		const config = this.getConfig(options);
		const formatter = new LaTeXFormatter(config);

		// Get the full lines that contain the range
		const startLine = range.start.line;
		const endLine = range.end.line;

		// Format the entire document to get correct indentation
		const text = document.getText();
		const formatted = formatter.format(text);
		const formattedLines = formatted.split('\n');
		const originalLines = text.split('\n');

		// Build edits only for lines in range
		const edits: vscode.TextEdit[] = [];
		for (let i = startLine; i <= endLine && i < formattedLines.length; i++) {
			if (originalLines[i] !== formattedLines[i]) {
				const lineRange = document.lineAt(i).range;
				edits.push(vscode.TextEdit.replace(lineRange, formattedLines[i]));
			}
		}

		return edits;
	}

	private getConfig(options: vscode.FormattingOptions): FormatterConfig {
		const latexConfig = vscode.workspace.getConfiguration('latex');

		return {
			tabSize: options.tabSize,
			insertSpaces: options.insertSpaces,
			indentEnvironments: latexConfig.get<boolean>('format.indentEnvironments', true),
			alignTableColumns: latexConfig.get<boolean>('format.alignTableColumns', true),
			wrapLongLines: latexConfig.get<boolean>('format.wrapLongLines', false),
			lineWidth: latexConfig.get<number>('format.lineWidth', 80),
			trimTrailingWhitespace: latexConfig.get<boolean>('format.trimTrailingWhitespace', true),
			insertFinalNewline: latexConfig.get<boolean>('format.insertFinalNewline', true),
			alignEquationEnvironments: latexConfig.get<boolean>('format.alignEquationEnvironments', false)
		};
	}
}

/**
 * Register the LaTeX formatter
 */
export function registerLaTeXFormatter(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	const provider = new LaTeXFormattingProvider();

	// Register for LaTeX documents
	const latexSelector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];

	disposables.push(
		vscode.languages.registerDocumentFormattingEditProvider(latexSelector, provider)
	);

	disposables.push(
		vscode.languages.registerDocumentRangeFormattingEditProvider(latexSelector, provider)
	);

	return disposables;
}


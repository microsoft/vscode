/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Table-like environments that can be previewed
 */
const TABLE_ENVIRONMENTS = [
	'tabular', 'tabular*', 'tabularx', 'longtable', 'array',
	'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix'
];

/**
 * Parsed table cell
 */
interface TableCell {
	content: string;
	colspan?: number;
	rowspan?: number;
}

/**
 * Parsed table row
 */
interface TableRow {
	cells: TableCell[];
	isHline: boolean;
}

/**
 * Hover provider for LaTeX tables
 * Shows a visual preview of the table structure
 */
class TableHoverProvider implements vscode.HoverProvider {

	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): vscode.Hover | null {

		// Check if we're on a table environment
		const tableInfo = this.findTableAtPosition(document, position);
		if (!tableInfo) {
			return null;
		}

		// Parse the table content
		const rows = this.parseTable(tableInfo.content);
		if (rows.length === 0) {
			return null;
		}

		// Generate preview
		const preview = this.generatePreview(rows, tableInfo.envName);

		const markdown = new vscode.MarkdownString();
		markdown.isTrusted = true;
		markdown.supportHtml = true;
		markdown.appendMarkdown(preview);

		return new vscode.Hover(markdown, tableInfo.range);
	}

	/**
	 * Find table environment at the given position
	 */
	private findTableAtPosition(document: vscode.TextDocument, position: vscode.Position): {
		content: string;
		range: vscode.Range;
		envName: string;
		columnSpec: string;
	} | null {

		const text = document.getText();
		const offset = document.offsetAt(position);

		// Build regex for table environments
		const envPattern = TABLE_ENVIRONMENTS.join('|').replace(/\*/g, '\\*');
		const beginRegex = new RegExp(`\\\\begin\\{(${envPattern})\\}(?:\\{([^}]*)\\})?`, 'g');

		let match: RegExpExecArray | null;
		while ((match = beginRegex.exec(text)) !== null) {
			const envName = match[1];
			const columnSpec = match[2] || '';
			const beginPos = match.index;
			const beginEnd = match.index + match[0].length;

			// Find matching \end
			const endRegex = new RegExp(`\\\\end\\{${envName.replace(/\*/g, '\\*')}\\}`);
			const afterBegin = text.substring(beginEnd);
			const endMatch = afterBegin.match(endRegex);

			if (endMatch && endMatch.index !== undefined) {
				const endPos = beginEnd + endMatch.index + endMatch[0].length;

				// Check if position is within this table
				if (offset >= beginPos && offset <= endPos) {
					const content = text.substring(beginEnd, beginEnd + endMatch.index);
					const range = new vscode.Range(
						document.positionAt(beginPos),
						document.positionAt(endPos)
					);

					return { content, range, envName, columnSpec };
				}
			}
		}

		return null;
	}

	/**
	 * Parse table content into rows and cells
	 */
	private parseTable(content: string): TableRow[] {
		const rows: TableRow[] = [];

		// Split by \\ (row separator)
		const lines = content.split(/\\\\/);

		for (const line of lines) {
			const trimmed = line.trim();

			// Skip empty lines
			if (trimmed === '') {
				continue;
			}

			// Check for \hline, \toprule, \midrule, \bottomrule
			if (/^\\(hline|toprule|midrule|bottomrule|cline)/.test(trimmed)) {
				rows.push({ cells: [], isHline: true });
				// If there's content after the hline on same line, process it
				const afterHline = trimmed.replace(/^\\(hline|toprule|midrule|bottomrule|cline(\{[^}]*\})?)/, '').trim();
				if (afterHline && !afterHline.startsWith('%')) {
					const cells = this.parseCells(afterHline);
					if (cells.length > 0) {
						rows.push({ cells, isHline: false });
					}
				}
				continue;
			}

			// Parse cells
			const cells = this.parseCells(trimmed);
			if (cells.length > 0) {
				rows.push({ cells, isHline: false });
			}
		}

		return rows;
	}

	/**
	 * Parse a row into cells, respecting brace nesting
	 */
	private parseCells(line: string): TableCell[] {
		const cells: TableCell[] = [];
		let current = '';
		let braceLevel = 0;

		// Remove comments
		const commentIndex = line.indexOf('%');
		const cleanLine = commentIndex >= 0 ? line.substring(0, commentIndex) : line;

		for (let i = 0; i < cleanLine.length; i++) {
			const char = cleanLine[i];

			if (char === '{') {
				braceLevel++;
				current += char;
			} else if (char === '}') {
				braceLevel--;
				current += char;
			} else if (char === '&' && braceLevel === 0) {
				cells.push({ content: this.cleanCellContent(current) });
				current = '';
			} else {
				current += char;
			}
		}

		// Don't forget the last cell
		const lastCell = this.cleanCellContent(current);
		if (lastCell || cells.length > 0) {
			cells.push({ content: lastCell });
		}

		return cells;
	}

	/**
	 * Clean cell content for display
	 */
	private cleanCellContent(content: string): string {
		let result = content.trim();

		// Remove \multicolumn{n}{spec}{content} and extract content
		result = result.replace(/\\multicolumn\{[^}]*\}\{[^}]*\}\{([^}]*)\}/g, '$1');

		// Remove \textbf, \textit, \emph wrappers but keep content
		result = result.replace(/\\(textbf|textit|emph|textrm|texttt|textsf)\{([^}]*)\}/g, '$2');

		// Remove \bfseries, \itshape etc
		result = result.replace(/\\(bfseries|itshape|mdseries|upshape|slshape|scshape|rmfamily|sffamily|ttfamily)/g, '');

		// Clean up math mode markers for simple content
		result = result.replace(/\$([^$]+)\$/g, '$1');

		// Remove extra whitespace
		result = result.replace(/\s+/g, ' ').trim();

		return result;
	}

	/**
	 * Generate HTML preview of the table
	 */
	private generatePreview(rows: TableRow[], envName: string): string {
		// Filter out hlines for cell count
		const dataRows = rows.filter(r => !r.isHline);
		if (dataRows.length === 0) {
			return `*Empty ${envName} environment*`;
		}

		// Find max columns
		const maxCols = Math.max(...dataRows.map(r => r.cells.length));

		// Determine if it's a matrix (no borders)
		const isMatrix = envName.includes('matrix');

		// Build HTML table
		let html = '<table style="border-collapse: collapse; margin: 8px 0;">\n';

		let rowIndex = 0;
		for (const row of rows) {
			if (row.isHline) {
				// We'll handle borders with CSS
				continue;
			}

			html += '<tr>\n';

			// Determine if this is a header row (first data row, or after hline)
			const isHeader = rowIndex === 0 && rows.length > 1 && rows[1]?.isHline;

			for (let i = 0; i < maxCols; i++) {
				const cell = row.cells[i];
				const content = cell?.content || '';
				const tag = isHeader ? 'th' : 'td';

				const borderStyle = isMatrix
					? 'padding: 2px 8px;'
					: 'border: 1px solid #666; padding: 4px 8px;';

				const bgStyle = isHeader ? 'background: #444;' : '';

				html += `  <${tag} style="${borderStyle} ${bgStyle}">${this.escapeHtml(content)}</${tag}>\n`;
			}

			html += '</tr>\n';
			rowIndex++;
		}

		html += '</table>\n';

		// Add info line
		const info = `\n\n*${envName}: ${dataRows.length} row(s) × ${maxCols} column(s)*`;

		return html + info;
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}

/**
 * Register the table hover provider
 */
export function registerTableHoverProvider(_context: vscode.ExtensionContext): vscode.Disposable {
	const provider = new TableHoverProvider();

	const selector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];

	return vscode.languages.registerHoverProvider(selector, provider);
}


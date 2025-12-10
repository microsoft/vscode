/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * BibTeX entry field
 */
interface BibField {
	name: string;
	value: string;
	startLine: number;
	endLine: number;
}

/**
 * BibTeX entry
 */
interface BibEntry {
	type: string;
	key: string;
	fields: BibField[];
	startLine: number;
	endLine: number;
	raw: string;
}

/**
 * Format configuration
 */
interface FormatConfig {
	tab: string;
	alignOnEqual: boolean;
	sortFields: boolean;
	fieldsOrder: string[];
	trailingComma: boolean;
	sortBy: string[];
}

/**
 * Parse a BibTeX file into entries
 */
function parseBibTeX(text: string): BibEntry[] {
	const entries: BibEntry[] = [];
	const lines = text.split('\n');

	let currentEntry: Partial<BibEntry> | null = null;
	let braceDepth = 0;
	let fieldBuffer = '';
	let currentFieldName = '';
	let fieldStartLine = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Check for new entry start
		const entryMatch = line.match(/^@(\w+)\s*\{\s*([^,\s]*)/i);
		if (entryMatch && braceDepth === 0) {
			currentEntry = {
				type: entryMatch[1].toLowerCase(),
				key: entryMatch[2],
				fields: [],
				startLine: i,
				raw: ''
			};
			braceDepth = 1;
			fieldBuffer = '';
			continue;
		}

		if (currentEntry) {
			currentEntry.raw = (currentEntry.raw || '') + line + '\n';

			// Count braces
			for (const char of line) {
				if (char === '{') {
					braceDepth++;
				} else if (char === '}') {
					braceDepth--;
				}
			}

			// Check for field assignment
			const fieldMatch = line.match(/^\s*(\w+)\s*=\s*(.*)$/);
			if (fieldMatch && braceDepth >= 1) {
				// Save previous field if any
				if (currentFieldName && fieldBuffer) {
					currentEntry.fields?.push({
						name: currentFieldName,
						value: fieldBuffer.trim().replace(/,\s*$/, ''),
						startLine: fieldStartLine,
						endLine: i - 1
					});
				}

				currentFieldName = fieldMatch[1].toLowerCase();
				fieldBuffer = fieldMatch[2];
				fieldStartLine = i;
			} else if (currentFieldName && braceDepth >= 1) {
				fieldBuffer += '\n' + line;
			}

			// Entry complete
			if (braceDepth === 0) {
				// Save last field
				if (currentFieldName && fieldBuffer) {
					let value = fieldBuffer.trim().replace(/,\s*$/, '');

					// Only remove trailing } if it's the entry's closing brace, not the value's closing brace
					// We check if removing the trailing } would leave the braces unbalanced
					if (value.endsWith('}')) {
						const withoutTrailingBrace = value.slice(0, -1);
						const openBraces = (withoutTrailingBrace.match(/{/g) || []).length;
						const closeBraces = (withoutTrailingBrace.match(/}/g) || []).length;
						// If open braces > close braces, the trailing } is needed for balance (value's brace)
						// If open braces <= close braces, the trailing } is extra (entry's closing brace)
						if (openBraces <= closeBraces) {
							value = withoutTrailingBrace;
						}
					}

					currentEntry.fields?.push({
						name: currentFieldName,
						value: value,
						startLine: fieldStartLine,
						endLine: i
					});
				}

				currentEntry.endLine = i;
				entries.push(currentEntry as BibEntry);
				currentEntry = null;
				currentFieldName = '';
				fieldBuffer = '';
			}
		}
	}

	return entries;
}

/**
 * Get field value, cleaning up braces and quotes
 */
function getFieldValue(entry: BibEntry, fieldName: string): string {
	const field = entry.fields.find(f => f.name === fieldName);
	if (!field) {
		return '';
	}
	return field.value.replace(/^[{"']|[}"']$/g, '').trim();
}

/**
 * Sort entries by the specified keys
 */
function sortEntries(entries: BibEntry[], sortBy: string[]): BibEntry[] {
	return [...entries].sort((a, b) => {
		for (const key of sortBy) {
			let comparison = 0;

			if (key === 'key') {
				comparison = a.key.localeCompare(b.key);
			} else if (key === 'type') {
				comparison = a.type.localeCompare(b.type);
			} else if (key === 'year-desc') {
				const yearA = parseInt(getFieldValue(a, 'year')) || 0;
				const yearB = parseInt(getFieldValue(b, 'year')) || 0;
				comparison = yearB - yearA;
			} else {
				// Sort by field value
				const valueA = getFieldValue(a, key);
				const valueB = getFieldValue(b, key);
				comparison = valueA.localeCompare(valueB);
			}

			if (comparison !== 0) {
				return comparison;
			}
		}
		return 0;
	});
}

/**
 * Sort fields within an entry
 */
function sortFields(fields: BibField[], order: string[]): BibField[] {
	return [...fields].sort((a, b) => {
		const indexA = order.indexOf(a.name);
		const indexB = order.indexOf(b.name);

		if (indexA === -1 && indexB === -1) {
			return a.name.localeCompare(b.name);
		} else if (indexA === -1) {
			return 1;
		} else if (indexB === -1) {
			return -1;
		}
		return indexA - indexB;
	});
}

/**
 * Format a single entry
 */
function formatEntry(entry: BibEntry, config: FormatConfig): string {
	let result = `@${entry.type}{${entry.key}`;

	// Get fields and optionally sort them
	let fields = entry.fields;
	if (config.sortFields) {
		fields = sortFields(fields, config.fieldsOrder);
	}

	// Find max field name length for alignment
	let maxNameLength = 0;
	if (config.alignOnEqual) {
		maxNameLength = Math.max(...fields.map(f => f.name.length));
	}

	// Format each field
	for (const field of fields) {
		result += ',\n' + config.tab + field.name;

		if (config.alignOnEqual) {
			result += ' '.repeat(maxNameLength - field.name.length);
		}

		result += ' = ';

		// Clean and format value
		let value = field.value;
		if (!value.startsWith('{') && !value.startsWith('"') && !/^\d+$/.test(value)) {
			value = '{' + value + '}';
		}
		result += value;
	}

	if (config.trailingComma) {
		result += ',';
	}

	result += '\n}';
	return result;
}

/**
 * Get format configuration from settings
 */
function getFormatConfig(): FormatConfig {
	const config = vscode.workspace.getConfiguration('latex');

	return {
		tab: config.get<string>('bibtex.format.tab', '  '),
		alignOnEqual: config.get<boolean>('bibtex.format.alignOnEqual', true),
		sortFields: config.get<boolean>('bibtex.format.sortFields', false),
		fieldsOrder: config.get<string[]>('bibtex.format.fieldsOrder', ['author', 'title', 'journal', 'booktitle', 'year', 'volume', 'number', 'pages', 'doi', 'url']),
		trailingComma: config.get<boolean>('bibtex.format.trailingComma', false),
		sortBy: config.get<string[]>('bibtex.format.sortBy', ['key'])
	};
}

/**
 * Format BibTeX: Sort entries
 */
export async function bibSort(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'bibtex') {
		vscode.window.showInformationMessage('BibTeX sort only works with .bib files.');
		return;
	}

	const config = getFormatConfig();
	const text = editor.document.getText();
	const entries = parseBibTeX(text);

	if (entries.length === 0) {
		vscode.window.showInformationMessage('No BibTeX entries found.');
		return;
	}

	const sortedEntries = sortEntries(entries, config.sortBy);

	// Rebuild the document
	let result = '';

	// Get text before first entry
	if (entries.length > 0) {
		const firstEntryStart = editor.document.offsetAt(new vscode.Position(entries[0].startLine, 0));
		result = text.substring(0, firstEntryStart);
	}

	// Add sorted entries
	for (let i = 0; i < sortedEntries.length; i++) {
		const entry = sortedEntries[i];
		result += entry.raw;
		if (i < sortedEntries.length - 1) {
			result += '\n';
		}
	}

	// Apply edit
	const fullRange = new vscode.Range(
		new vscode.Position(0, 0),
		editor.document.lineAt(editor.document.lineCount - 1).range.end
	);

	await editor.edit(editBuilder => {
		editBuilder.replace(fullRange, result);
	});

	vscode.window.showInformationMessage(`Sorted ${entries.length} BibTeX entries.`);
}

/**
 * Format BibTeX: Align entries
 */
export async function bibAlign(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'bibtex') {
		vscode.window.showInformationMessage('BibTeX align only works with .bib files.');
		return;
	}

	const config = getFormatConfig();
	const text = editor.document.getText();
	const entries = parseBibTeX(text);

	if (entries.length === 0) {
		vscode.window.showInformationMessage('No BibTeX entries found.');
		return;
	}

	// Format each entry
	let result = '';

	// Get text before first entry
	if (entries.length > 0) {
		const firstEntryStart = editor.document.offsetAt(new vscode.Position(entries[0].startLine, 0));
		result = text.substring(0, firstEntryStart);
	}

	for (let i = 0; i < entries.length; i++) {
		result += formatEntry(entries[i], config);
		if (i < entries.length - 1) {
			result += '\n\n';
		}
	}

	// Apply edit
	const fullRange = new vscode.Range(
		new vscode.Position(0, 0),
		editor.document.lineAt(editor.document.lineCount - 1).range.end
	);

	await editor.edit(editBuilder => {
		editBuilder.replace(fullRange, result);
	});

	vscode.window.showInformationMessage(`Aligned ${entries.length} BibTeX entries.`);
}

/**
 * Format BibTeX: Sort and Align
 */
export async function bibSortAlign(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'bibtex') {
		vscode.window.showInformationMessage('BibTeX format only works with .bib files.');
		return;
	}

	const config = getFormatConfig();
	const text = editor.document.getText();
	const entries = parseBibTeX(text);

	if (entries.length === 0) {
		vscode.window.showInformationMessage('No BibTeX entries found.');
		return;
	}

	// Sort entries
	const sortedEntries = sortEntries(entries, config.sortBy);

	// Format each entry
	let result = '';

	// Get text before first entry (preamble, comments)
	if (entries.length > 0) {
		const firstEntryStart = editor.document.offsetAt(new vscode.Position(entries[0].startLine, 0));
		result = text.substring(0, firstEntryStart);
	}

	for (let i = 0; i < sortedEntries.length; i++) {
		result += formatEntry(sortedEntries[i], config);
		if (i < sortedEntries.length - 1) {
			result += '\n\n';
		}
	}

	// Apply edit
	const fullRange = new vscode.Range(
		new vscode.Position(0, 0),
		editor.document.lineAt(editor.document.lineCount - 1).range.end
	);

	await editor.edit(editBuilder => {
		editBuilder.replace(fullRange, result);
	});

	vscode.window.showInformationMessage(`Sorted and aligned ${entries.length} BibTeX entries.`);
}

/**
 * Register BibTeX formatter commands
 */
export function registerBibTeXFormatter(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('latex.bibSort', bibSort)
	);

	disposables.push(
		vscode.commands.registerCommand('latex.bibAlign', bibAlign)
	);

	disposables.push(
		vscode.commands.registerCommand('latex.bibSortAlign', bibSortAlign)
	);

	return disposables;
}


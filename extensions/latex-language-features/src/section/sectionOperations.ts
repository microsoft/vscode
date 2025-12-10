/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Section levels in LaTeX, from highest to lowest
 */
const SECTION_LEVELS = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

/**
 * Maps each section to its upper (promoted) level
 */
const UPPER_LEVELS: Record<string, string> = {};

/**
 * Maps each section to its lower (demoted) level
 */
const LOWER_LEVELS: Record<string, string> = {};

// Build the level mappings
for (let i = 0; i < SECTION_LEVELS.length; i++) {
	const current = SECTION_LEVELS[i];
	const upper = SECTION_LEVELS[Math.max(i - 1, 0)];
	const lower = SECTION_LEVELS[Math.min(i + 1, SECTION_LEVELS.length - 1)];
	UPPER_LEVELS[current] = upper;
	LOWER_LEVELS[current] = lower;
}

/**
 * Pattern to match sectioning commands
 * Captures: section name, asterisk (optional), options (optional), title
 */
const SECTION_PATTERN = new RegExp(
	'\\\\(' + SECTION_LEVELS.join('|') + ')(\\*)?(\\[.+?\\])?(\\{.*?\\})',
	'g'
);

/**
 * Shift section levels in the selection
 * @param change 'promote' (up) or 'demote' (down)
 */
export async function shiftSectionLevel(change: 'promote' | 'demote'): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const document = editor.document;
	if (document.languageId !== 'latex' && document.languageId !== 'tex') {
		return;
	}

	const levelMap = change === 'promote' ? UPPER_LEVELS : LOWER_LEVELS;

	const replacer = (
		_match: string,
		sectionName: string,
		asterisk: string | undefined,
		options: string | undefined,
		contents: string
	): string => {
		const newLevel = levelMap[sectionName] || sectionName;
		return '\\' + newLevel + (asterisk ?? '') + (options ?? '') + contents;
	};

	/**
	 * Get the length of the last line in a text block
	 */
	function getLastLineLength(text: string): number {
		const lines = text.split(/\n/);
		return lines[lines.length - 1].length;
	}

	const selections = editor.selections;
	const newSelections: vscode.Selection[] = [];
	const edit = new vscode.WorkspaceEdit();

	for (let selection of selections) {
		let mode: 'selection' | 'cursor' = 'selection';
		let oldSelection: vscode.Selection | null = null;

		// If selection is empty, expand to current line
		if (selection.isEmpty) {
			mode = 'cursor';
			oldSelection = selection;
			const line = document.lineAt(selection.anchor);
			selection = new vscode.Selection(line.range.start, line.range.end);
		}

		const selectionText = document.getText(selection);
		const pattern = new RegExp(SECTION_PATTERN.source, 'g');
		const newText = selectionText.replace(pattern, replacer);

		edit.replace(document.uri, selection, newText);

		const changeInEndCharacterPosition = getLastLineLength(newText) - getLastLineLength(selectionText);

		if (mode === 'selection') {
			newSelections.push(new vscode.Selection(
				selection.start,
				new vscode.Position(selection.end.line, selection.end.character + changeInEndCharacterPosition)
			));
		} else if (oldSelection) {
			const anchorPosition = Math.max(0, oldSelection.anchor.character + changeInEndCharacterPosition);
			const activePosition = Math.max(0, oldSelection.active.character + changeInEndCharacterPosition);
			newSelections.push(new vscode.Selection(
				new vscode.Position(oldSelection.anchor.line, anchorPosition),
				new vscode.Position(oldSelection.active.line, activePosition)
			));
		}
	}

	const success = await vscode.workspace.applyEdit(edit);
	if (success) {
		editor.selections = newSelections;
	}
}

/**
 * Remove comments and verbatim content from text
 */
function stripCommentsAndVerbatim(text: string): string {
	// Remove line comments (not escaped)
	let result = text.replace(/(?<!\\)%.*/g, '');
	// Remove verbatim content (simplified)
	result = result.replace(/\\verb\*?([^a-zA-Z0-9]).*?\1/g, '');
	return result;
}

/**
 * Search upward for the first sectioning command
 */
function searchLevelUp(
	pos: vscode.Position,
	doc: vscode.TextDocument
): { level: string; pos: vscode.Position } | undefined {
	const range = new vscode.Range(
		new vscode.Position(0, 0),
		pos.with(undefined, doc.lineAt(pos.line).range.end.character)
	);
	const content = stripCommentsAndVerbatim(doc.getText(range)).split('\n');
	const pattern = new RegExp('\\\\(' + SECTION_LEVELS.join('|') + ')\\*?(?:\\[.+?\\])?\\{.*?\\}');

	for (let i = pos.line; i >= 0; i--) {
		const res = content[i]?.match(pattern);
		if (res) {
			return { level: res[1], pos: new vscode.Position(i, 0) };
		}
	}
	return undefined;
}

/**
 * Search downward for the next sectioning command at or above a given level
 */
function searchLevelDown(
	remainLevels: string[],
	pos: vscode.Position,
	doc: vscode.TextDocument
): vscode.Position {
	const range = new vscode.Range(pos, new vscode.Position(doc.lineCount, 0));
	const content = stripCommentsAndVerbatim(doc.getText(range)).split('\n');
	const pattern = new RegExp(
		'\\\\(?:(' + remainLevels.join('|') + ')\\*?(?:\\[.+?\\])?\\{.*?\\})|appendix|\\\\end\\{document\\}'
	);

	for (let i = 0; i < content.length; i++) {
		const res = content[i]?.match(pattern);
		if (res) {
			const prevLineLength = i > 0 ? (content[i - 1]?.length ?? 0) : 0;
			return new vscode.Position(i + pos.line - 1, Math.max(prevLineLength - 1, 0));
		}
	}

	// Return the end of file position
	return new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
}

/**
 * Select the current section (from its heading to the next section at the same or higher level)
 */
export function selectSection(): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const document = editor.document;
	if (document.languageId !== 'latex' && document.languageId !== 'tex') {
		return;
	}

	const beginLevel = searchLevelUp(editor.selection.anchor, document);
	if (!beginLevel) {
		vscode.window.showInformationMessage('No section macro found above cursor position');
		return;
	}

	const levelIndex = SECTION_LEVELS.indexOf(beginLevel.level);
	const endPosition = searchLevelDown(
		SECTION_LEVELS.slice(0, levelIndex + 1),
		editor.selection.end,
		document
	);

	editor.selection = new vscode.Selection(beginLevel.pos, endPosition);
}

/**
 * Register section operation commands
 */
export function registerSectionCommands(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('latex.promoteSectioning', () => shiftSectionLevel('promote'))
	);

	disposables.push(
		vscode.commands.registerCommand('latex.demoteSectioning', () => shiftSectionLevel('demote'))
	);

	disposables.push(
		vscode.commands.registerCommand('latex.selectSection', selectSection)
	);

	return disposables;
}


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Section levels in LaTeX hierarchy (from highest to lowest)
 */
const SECTION_LEVELS = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

/**
 * Maps each level to its upper level
 */
const upperLevels: Record<string, string> = {};

/**
 * Maps each level to its lower level
 */
const lowerLevels: Record<string, string> = {};

// Initialize level mappings
for (let i = 0; i < SECTION_LEVELS.length; i++) {
	const current = SECTION_LEVELS[i];
	const upper = SECTION_LEVELS[Math.max(i - 1, 0)];
	const lower = SECTION_LEVELS[Math.min(i + 1, SECTION_LEVELS.length - 1)];
	upperLevels[current] = upper;
	lowerLevels[current] = lower;
}

/**
 * Strip comments from LaTeX text (preserves line count)
 */
function stripComments(text: string): string {
	// Matches comments that are not escaped and not URL-encoded (like %2F)
	const reg = /(^|[^\\]|(?:(?<!\\)(?:\\\\)+))%(?![2-9A-F][0-9A-F]).*$/gm;
	return text.replace(reg, '$1');
}

/**
 * Strip verbatim environments from text (preserves line count)
 */
function stripVerbatim(text: string): string {
	// Remove \verb commands
	const content = text.replace(/\\verb\*?([^a-zA-Z0-9]).*?\1/g, '');

	// Remove verbatim environments
	const verbatimEnvs = ['verbatim', 'Verbatim', 'lstlisting', 'minted'];
	const envsAlt = verbatimEnvs.join('|');
	const pattern = `\\\\begin{(${envsAlt}\\*?)}[\\s\\S]*?\\\\end{\\1}`;
	const reg = new RegExp(pattern, 'gm');

	return content.replace(reg, (match) => {
		const len = Math.max(match.split('\n').length, 1);
		return '\n'.repeat(len - 1);
	});
}

/**
 * Strip comments and verbatim content from text
 */
function stripCommentsAndVerbatim(text: string): string {
	return stripVerbatim(stripComments(text));
}

/**
 * Shift the level of all sectioning commands in selection (promote or demote)
 */
export async function shiftSection(change: 'promote' | 'demote'): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	const replacer = (_match: string, sectionName: string, asterisk?: string, options?: string, contents?: string): string => {
		const newLevel = change === 'promote' ? upperLevels[sectionName] : lowerLevels[sectionName];
		return '\\' + newLevel + (asterisk ?? '') + (options ?? '') + (contents ?? '');
	};

	// Pattern to match sectioning commands with optional asterisk, optional [...] args, and required {...} args
	const pattern = '\\\\(' + SECTION_LEVELS.join('|') + ')(\\*)?(\\[.+?\\])?(\\{.*?\\})';
	const regex = new RegExp(pattern, 'g');

	function getLastLineLength(someText: string): number {
		const lines = someText.split(/\n/);
		return lines[lines.length - 1].length;
	}

	const document = editor.document;
	const selections = editor.selections;
	const newSelections: vscode.Selection[] = [];
	const edit = new vscode.WorkspaceEdit();

	for (let selection of selections) {
		let mode: 'selection' | 'cursor' = 'selection';
		let oldSelection: vscode.Selection | null = null;

		// If selection is empty, expand to entire line
		if (selection.isEmpty) {
			mode = 'cursor';
			oldSelection = selection;
			const line = document.lineAt(selection.anchor);
			selection = new vscode.Selection(line.range.start, line.range.end);
		}

		const selectionText = document.getText(selection);
		const newText = selectionText.replace(regex, replacer);
		edit.replace(document.uri, selection, newText);

		const changeInEndCharacterPosition = getLastLineLength(newText) - getLastLineLength(selectionText);

		if (mode === 'selection') {
			newSelections.push(new vscode.Selection(
				selection.start,
				new vscode.Position(selection.end.line, selection.end.character + changeInEndCharacterPosition)
			));
		} else if (oldSelection) {
			const anchorPosition = oldSelection.anchor.character + changeInEndCharacterPosition;
			const activePosition = oldSelection.active.character + changeInEndCharacterPosition;
			newSelections.push(new vscode.Selection(
				new vscode.Position(oldSelection.anchor.line, Math.max(0, anchorPosition)),
				new vscode.Position(oldSelection.active.line, Math.max(0, activePosition))
			));
		}
	}

	const success = await vscode.workspace.applyEdit(edit);
	if (success) {
		editor.selections = newSelections;
	}
}

/**
 * Search for the first sectioning macro above the current position
 */
function searchLevelUp(pos: vscode.Position, doc: vscode.TextDocument): { level: string; pos: vscode.Position } | undefined {
	const range = new vscode.Range(
		new vscode.Position(0, 0),
		pos.with(undefined, doc.lineAt(pos.line).range.end.character)
	);
	const content = stripCommentsAndVerbatim(doc.getText(range)).split('\n');
	const pattern = '\\\\(' + SECTION_LEVELS.join('|') + ')\\*?(?:\\[.+?\\])?\\{.*?\\}';
	const regex = new RegExp(pattern);

	for (let i = pos.line; i >= 0; i -= 1) {
		const res = content[i].match(regex);
		if (res) {
			return { level: res[1], pos: new vscode.Position(i, 0) };
		}
	}
	return undefined;
}

/**
 * Search for the first sectioning macro below the current position
 * Stop at \appendix or \end{document}
 */
function searchLevelDown(remainingLevels: string[], pos: vscode.Position, doc: vscode.TextDocument): vscode.Position {
	const range = new vscode.Range(pos, new vscode.Position(doc.lineCount, 0));
	const content = stripCommentsAndVerbatim(doc.getText(range)).split('\n');
	const pattern = '\\\\(?:(' + remainingLevels.join('|') + ')\\*?(?:\\[.+?\\])?\\{.*?\\})|appendix|\\\\end\\{document\\}';
	const regex = new RegExp(pattern);

	for (let i = 0; i < content.length; i += 1) {
		const res = content[i].match(regex);
		if (res) {
			return new vscode.Position(i + pos.line - 1, Math.max((content[i - 1] || '').length - 1, 0));
		}
	}

	// Return end of file
	return new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
}

/**
 * Select the current section (from section heading to next same-level heading)
 */
export function selectSection(): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	const beginLevel = searchLevelUp(editor.selection.anchor, editor.document);
	if (!beginLevel) {
		vscode.window.showInformationMessage('No section found above cursor position.');
		return;
	}

	const levelIndex = SECTION_LEVELS.indexOf(beginLevel.level);
	const endPosition = searchLevelDown(SECTION_LEVELS.slice(0, levelIndex + 1), editor.selection.end, editor.document);

	editor.selection = new vscode.Selection(beginLevel.pos, endPosition);
}

/**
 * Register section commands
 */
export function registerSectionCommands(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('latex.promoteSection', () => shiftSection('promote'))
	);

	disposables.push(
		vscode.commands.registerCommand('latex.demoteSection', () => shiftSection('demote'))
	);

	disposables.push(
		vscode.commands.registerCommand('latex.selectSection', selectSection)
	);

	return disposables;
}


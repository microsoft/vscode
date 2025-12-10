/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Word count statistics
 */
interface WordCountStats {
	words: number;
	characters: number;
	charactersNoSpaces: number;
	lines: number;
	wordsInText: number; // Words excluding LaTeX commands
}

/**
 * Status bar item for word count
 */
let statusBarItem: vscode.StatusBarItem;

/**
 * Debounce timer for updates
 */
let updateTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Configuration
 */
let showInStatusBar = true;

/**
 * Patterns to strip from text for accurate word count
 */
const LATEX_COMMAND_PATTERN = /\\[a-zA-Z]+(\*)?(\[[^\]]*\])?(\{[^}]*\})?/g;
const LATEX_MATH_INLINE_PATTERN = /\$[^$]+\$/g;
const LATEX_MATH_DISPLAY_PATTERN = /\\\[[\s\S]*?\\\]/g;
const LATEX_COMMENT_PATTERN = /(?<!\\)%.*$/gm;

/**
 * Count words in text, with option to exclude LaTeX commands
 */
function countWords(text: string, excludeLatex: boolean = false): WordCountStats {
	const lines = text.split('\n').length;
	const characters = text.length;
	const charactersNoSpaces = text.replace(/\s/g, '').length;

	// Count all words
	const words = text.split(/\s+/).filter(word => word.length > 0).length;

	// Count words excluding LaTeX
	let wordsInText = words;
	if (excludeLatex) {
		let cleanText = text;

		// Remove comments first
		cleanText = cleanText.replace(LATEX_COMMENT_PATTERN, '');

		// Remove math environments (they contain technical content, not prose)
		cleanText = cleanText.replace(LATEX_MATH_DISPLAY_PATTERN, ' ');
		cleanText = cleanText.replace(LATEX_MATH_INLINE_PATTERN, ' ');

		// Remove environments like verbatim, lstlisting
		cleanText = cleanText.replace(/\\begin\{(verbatim|lstlisting|minted)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ');

		// Remove commands but keep their text arguments
		// e.g., \textbf{hello} → hello
		cleanText = cleanText.replace(/\\(?:textbf|textit|emph|underline|textrm|texttt|textsc|textsf)\{([^}]*)\}/g, '$1');

		// Remove section commands but keep title
		cleanText = cleanText.replace(/\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, '$1');

		// Remove remaining commands
		cleanText = cleanText.replace(LATEX_COMMAND_PATTERN, ' ');

		// Remove braces
		cleanText = cleanText.replace(/[{}]/g, ' ');

		// Remove common LaTeX symbols
		cleanText = cleanText.replace(/\\[&%$#_{}~^]/g, ' ');

		// Count remaining words
		wordsInText = cleanText.split(/\s+/).filter(word => word.length > 0 && /[a-zA-Z]/.test(word)).length;
	}

	return {
		words,
		characters,
		charactersNoSpaces,
		lines,
		wordsInText
	};
}

/**
 * Update the status bar with current word count
 */
function updateStatusBar(): void {
	const editor = vscode.window.activeTextEditor;

	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		statusBarItem.hide();
		return;
	}

	if (!showInStatusBar) {
		statusBarItem.hide();
		return;
	}

	const text = editor.document.getText();
	const stats = countWords(text, true);

	// Format: "pencil icon 1,234 words"
	// allow-any-unicode-next-line
	statusBarItem.text = `$(pencil) ${stats.wordsInText.toLocaleString()} words`;
	statusBarItem.tooltip = new vscode.MarkdownString(
		`**LaTeX Word Count**\n\n` +
		`| Metric | Count |\n` +
		`|--------|-------|\n` +
		`| Words (text only) | ${stats.wordsInText.toLocaleString()} |\n` +
		`| Words (all) | ${stats.words.toLocaleString()} |\n` +
		`| Characters | ${stats.characters.toLocaleString()} |\n` +
		`| Characters (no spaces) | ${stats.charactersNoSpaces.toLocaleString()} |\n` +
		`| Lines | ${stats.lines.toLocaleString()} |\n\n` +
		`*Click for detailed count*`
	);
	statusBarItem.show();
}

/**
 * Debounced update to avoid performance issues
 */
function scheduleUpdate(): void {
	if (updateTimer) {
		clearTimeout(updateTimer);
	}
	updateTimer = setTimeout(updateStatusBar, 500);
}

/**
 * Show detailed word count in a message
 */
async function showDetailedWordCount(): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		vscode.window.showInformationMessage('Word count is only available for LaTeX documents.');
		return;
	}

	// Check if there's a selection
	const hasSelection = !editor.selection.isEmpty;
	const text = hasSelection
		? editor.document.getText(editor.selection)
		: editor.document.getText();

	const stats = countWords(text, true);
	const statsAll = countWords(text, false);

	const scope = hasSelection ? 'Selection' : 'Document';

	const message = `${scope}: ${stats.wordsInText.toLocaleString()} words (text), ` +
		`${statsAll.words.toLocaleString()} total, ` +
		`${stats.characters.toLocaleString()} chars, ` +
		`${stats.lines.toLocaleString()} lines`;

	vscode.window.showInformationMessage(message);
}

/**
 * Register the word count provider
 */
export function registerWordCountProvider(_context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Create status bar item (priority 100.45 puts it near line/column info)
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100.45);
	statusBarItem.command = 'latex.wordCount';
	disposables.push(statusBarItem);

	// Initial update
	updateStatusBar();

	// Update on editor change
	disposables.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			updateStatusBar();
		})
	);

	// Update on document change (debounced)
	disposables.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (vscode.window.activeTextEditor?.document === event.document) {
				scheduleUpdate();
			}
		})
	);

	// Update on selection change (for selection word count in tooltip)
	disposables.push(
		vscode.window.onDidChangeTextEditorSelection(() => {
			scheduleUpdate();
		})
	);

	// Configuration change
	disposables.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('latex.wordCount.showInStatusBar')) {
				showInStatusBar = vscode.workspace.getConfiguration('latex').get<boolean>('wordCount.showInStatusBar', true);
				updateStatusBar();
			}
		})
	);

	// Load initial configuration
	showInStatusBar = vscode.workspace.getConfiguration('latex').get<boolean>('wordCount.showInStatusBar', true);

	// Register command for detailed word count
	disposables.push(
		vscode.commands.registerCommand('latex.wordCount', showDetailedWordCount)
	);

	return disposables;
}


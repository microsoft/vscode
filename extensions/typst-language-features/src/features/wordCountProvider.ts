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
	wordsInText: number; // Words excluding Typst markup
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
// Typst function calls like #heading(), #image(), etc.
const TYPST_FUNCTION_PATTERN = /#[a-zA-Z_][a-zA-Z0-9_-]*\s*(\([^)]*\))?/g;
// Typst inline math $...$
const TYPST_MATH_INLINE_PATTERN = /\$[^$]+\$/g;
// Typst display math $...$$ (multiline)
const TYPST_MATH_DISPLAY_PATTERN = /\$\$[\s\S]*?\$\$/g;
// Typst comments starting with //
const TYPST_COMMENT_PATTERN = /\/\/.*$/gm;
// Typst block comments /* ... */
const TYPST_BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
// Typst labels like <label-name>
const TYPST_LABEL_PATTERN = /<[a-zA-Z0-9_-]+>/g;
// Typst references like @label-name
const TYPST_REFERENCE_PATTERN = /@[a-zA-Z0-9_-]+/g;
// Typst raw blocks ```...```
const TYPST_RAW_BLOCK_PATTERN = /```[\s\S]*?```/g;
// Typst raw inline `...`
const TYPST_RAW_INLINE_PATTERN = /`[^`]+`/g;
// Typst set/show rules
const TYPST_SET_SHOW_PATTERN = /#(?:set|show)\s+[^\n]+/g;
// Typst import statements
const TYPST_IMPORT_PATTERN = /#import\s+"[^"]*"/g;

/**
 * Count words in text, with option to exclude Typst markup
 */
function countWords(text: string, excludeTypst: boolean = false): WordCountStats {
	const lines = text.split('\n').length;
	const characters = text.length;
	const charactersNoSpaces = text.replace(/\s/g, '').length;

	// Count all words
	const words = text.split(/\s+/).filter(word => word.length > 0).length;

	// Count words excluding Typst markup
	let wordsInText = words;
	if (excludeTypst) {
		let cleanText = text;

		// Remove comments first
		cleanText = cleanText.replace(TYPST_COMMENT_PATTERN, '');
		cleanText = cleanText.replace(TYPST_BLOCK_COMMENT_PATTERN, ' ');

		// Remove raw blocks and inline raw (code, not prose)
		cleanText = cleanText.replace(TYPST_RAW_BLOCK_PATTERN, ' ');
		cleanText = cleanText.replace(TYPST_RAW_INLINE_PATTERN, ' ');

		// Remove math environments (they contain technical content, not prose)
		cleanText = cleanText.replace(TYPST_MATH_DISPLAY_PATTERN, ' ');
		cleanText = cleanText.replace(TYPST_MATH_INLINE_PATTERN, ' ');

		// Remove set/show rules and imports
		cleanText = cleanText.replace(TYPST_SET_SHOW_PATTERN, ' ');
		cleanText = cleanText.replace(TYPST_IMPORT_PATTERN, ' ');

		// Remove functions but try to keep content inside brackets
		// e.g., #text(weight: "bold")[hello] → hello
		// First, extract content from square brackets after functions
		cleanText = cleanText.replace(/#[a-zA-Z_][a-zA-Z0-9_-]*\s*(?:\([^)]*\))?\s*\[([^\]]*)\]/g, '$1');

		// Remove remaining function calls without content
		cleanText = cleanText.replace(TYPST_FUNCTION_PATTERN, ' ');

		// Remove labels and references
		cleanText = cleanText.replace(TYPST_LABEL_PATTERN, ' ');
		cleanText = cleanText.replace(TYPST_REFERENCE_PATTERN, ' ');

		// Remove heading markers (=, ==, ===, etc.) but keep the text
		cleanText = cleanText.replace(/^=+\s*/gm, '');

		// Remove emphasis markers (* for bold, _ for italic)
		// But keep the content: *bold* → bold, _italic_ → italic
		cleanText = cleanText.replace(/\*([^*]+)\*/g, '$1');
		cleanText = cleanText.replace(/_([^_]+)_/g, '$1');

		// Remove square and curly brackets
		cleanText = cleanText.replace(/[[\]{}]/g, ' ');

		// Remove hash symbol standalone
		cleanText = cleanText.replace(/#/g, ' ');

		// Count remaining words (must contain at least one letter)
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

	if (!editor || editor.document.languageId !== 'typst') {
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
		`**Typst Word Count**\n\n` +
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

	if (!editor || editor.document.languageId !== 'typst') {
		vscode.window.showInformationMessage('Word count is only available for Typst documents.');
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
	statusBarItem.command = 'typst.wordCount';
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
			if (event.affectsConfiguration('typst.wordCount.showInStatusBar')) {
				showInStatusBar = vscode.workspace.getConfiguration('typst').get<boolean>('wordCount.showInStatusBar', true);
				updateStatusBar();
			}
		})
	);

	// Load initial configuration
	showInStatusBar = vscode.workspace.getConfiguration('typst').get<boolean>('wordCount.showInStatusBar', true);

	// Register command for detailed word count
	disposables.push(
		vscode.commands.registerCommand('typst.wordCount', showDetailedWordCount)
	);

	return disposables;
}


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Toggle bold formatting (*text*)
 * If selection is empty and cursor is inside *text*, remove the formatting
 * If selection is empty and cursor is not inside *text*, insert a snippet
 * If selection is not empty and is already bold, remove the formatting
 * If selection is not empty and is not bold, wrap with *text*
 */
export async function toggleBold(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'typst') {
		return;
	}

	interface EditAction {
		range: vscode.Range | vscode.Selection;
		text: string;
	}

	const editActions: EditAction[] = [];
	const snippetPositions: vscode.Position[] = [];

	for (const selection of editor.selections) {
		// If the selection is empty, check if cursor is inside *text*
		if (selection.isEmpty) {
			const surroundingRange = getSurroundingBoldRange(selection.anchor, editor.document);
			if (surroundingRange) {
				// Remove the formatting, keep only the text
				editActions.push({ range: surroundingRange.range, text: surroundingRange.text });
			} else {
				// Insert a snippet
				snippetPositions.push(selection.anchor);
			}
			continue;
		}

		// Selection is not empty
		const text = editor.document.getText(selection);

		// Check if selection is already wrapped with *text*
		if (text.startsWith('*') && text.endsWith('*') && text.length >= 2) {
			// Remove the formatting
			const insideText = text.slice(1, -1);
			editActions.push({ range: selection, text: insideText });
		} else {
			// Wrap with bold
			editActions.push({ range: selection, text: `*${text}*` });
		}
	}

	// Apply edits or insert snippets
	if (editActions.length === 0 && snippetPositions.length > 0) {
		// Only snippets to insert
		const snippet = new vscode.SnippetString('*${1:text}*$0');
		await editor.insertSnippet(snippet, snippetPositions);
	} else if (editActions.length > 0 && snippetPositions.length === 0) {
		// Only edits to apply
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	} else if (editActions.length > 0 && snippetPositions.length > 0) {
		// Mixed - apply edits first
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	}
}

/**
 * Toggle italic formatting (_text_)
 * If selection is empty and cursor is inside _text_, remove the formatting
 * If selection is empty and cursor is not inside _text_, insert a snippet
 * If selection is not empty and is already italic, remove the formatting
 * If selection is not empty and is not italic, wrap with _text_
 */
export async function toggleItalic(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'typst') {
		return;
	}

	interface EditAction {
		range: vscode.Range | vscode.Selection;
		text: string;
	}

	const editActions: EditAction[] = [];
	const snippetPositions: vscode.Position[] = [];

	for (const selection of editor.selections) {
		// If the selection is empty, check if cursor is inside _text_
		if (selection.isEmpty) {
			const surroundingRange = getSurroundingItalicRange(selection.anchor, editor.document);
			if (surroundingRange) {
				// Remove the formatting, keep only the text
				editActions.push({ range: surroundingRange.range, text: surroundingRange.text });
			} else {
				// Insert a snippet
				snippetPositions.push(selection.anchor);
			}
			continue;
		}

		// Selection is not empty
		const text = editor.document.getText(selection);

		// Check if selection is already wrapped with _text_
		if (text.startsWith('_') && text.endsWith('_') && text.length >= 2) {
			// Remove the formatting
			const insideText = text.slice(1, -1);
			editActions.push({ range: selection, text: insideText });
		} else {
			// Wrap with italic
			editActions.push({ range: selection, text: `_${text}_` });
		}
	}

	// Apply edits or insert snippets
	if (editActions.length === 0 && snippetPositions.length > 0) {
		// Only snippets to insert
		const snippet = new vscode.SnippetString('_${1:text}_$0');
		await editor.insertSnippet(snippet, snippetPositions);
	} else if (editActions.length > 0 && snippetPositions.length === 0) {
		// Only edits to apply
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	} else if (editActions.length > 0 && snippetPositions.length > 0) {
		// Mixed - apply edits first
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	}
}

/**
 * Toggle underline formatting (#underline[text])
 * If selection is empty and cursor is inside #underline[...], remove the formatting
 * If selection is empty and cursor is not inside #underline[...], insert a snippet
 * If selection is not empty and is already underlined, remove the formatting
 * If selection is not empty and is not underlined, wrap with #underline[...]
 */
export async function toggleUnderline(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'typst') {
		return;
	}

	interface EditAction {
		range: vscode.Range | vscode.Selection;
		text: string;
	}

	const editActions: EditAction[] = [];
	const snippetPositions: vscode.Position[] = [];

	for (const selection of editor.selections) {
		// If the selection is empty, check if cursor is inside #underline[...]
		if (selection.isEmpty) {
			const surroundingRange = getSurroundingUnderlineRange(selection.anchor, editor.document);
			if (surroundingRange) {
				// Remove the formatting, keep only the text
				editActions.push({ range: surroundingRange.range, text: surroundingRange.text });
			} else {
				// Insert a snippet
				snippetPositions.push(selection.anchor);
			}
			continue;
		}

		// Selection is not empty
		const text = editor.document.getText(selection);

		// Check if selection is already wrapped with #underline[...]
		const underlineMatch = text.match(/^#underline\[(.*)\]$/);
		if (underlineMatch) {
			// Remove the formatting
			editActions.push({ range: selection, text: underlineMatch[1] });
		} else {
			// Wrap with underline
			editActions.push({ range: selection, text: `#underline[${text}]` });
		}
	}

	// Apply edits or insert snippets
	if (editActions.length === 0 && snippetPositions.length > 0) {
		// Only snippets to insert
		const snippet = new vscode.SnippetString('#underline[${1:text}]$0');
		await editor.insertSnippet(snippet, snippetPositions);
	} else if (editActions.length > 0 && snippetPositions.length === 0) {
		// Only edits to apply
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	} else if (editActions.length > 0 && snippetPositions.length > 0) {
		// Mixed - apply edits first
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	}
}

/**
 * Find if the cursor is inside *text* formatting
 * Returns the range of the entire formatting and the text inside
 */
function getSurroundingBoldRange(
	position: vscode.Position,
	document: vscode.TextDocument
): { range: vscode.Range; text: string } | undefined {
	const line = document.lineAt(position.line).text;

	// Find all *text* patterns on this line
	const regex = /\*([^*]+)\*/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(line)) !== null) {
		const startPos = match.index;
		const endPos = startPos + match[0].length;

		if (position.character >= startPos && position.character <= endPos) {
			const start = new vscode.Position(position.line, startPos);
			const end = new vscode.Position(position.line, endPos);
			const text = match[1];
			return { range: new vscode.Range(start, end), text };
		}
	}

	return undefined;
}

/**
 * Find if the cursor is inside _text_ formatting
 * Returns the range of the entire formatting and the text inside
 */
function getSurroundingItalicRange(
	position: vscode.Position,
	document: vscode.TextDocument
): { range: vscode.Range; text: string } | undefined {
	const line = document.lineAt(position.line).text;

	// Find all _text_ patterns on this line (but not __text__ which is different)
	// We need to match _text_ but not __text__ or _text__ or __text_
	const regex = /(?<!_)_([^_]+)_(?!_)/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(line)) !== null) {
		const startPos = match.index;
		const endPos = startPos + match[0].length;

		if (position.character >= startPos && position.character <= endPos) {
			const start = new vscode.Position(position.line, startPos);
			const end = new vscode.Position(position.line, endPos);
			const text = match[1];
			return { range: new vscode.Range(start, end), text };
		}
	}

	// Fallback: simpler regex that works in JavaScript (no lookbehind)
	// Match _text_ but try to avoid matching __text__
	const simpleRegex = /_([^_]+)_/g;
	let simpleMatch: RegExpExecArray | null;

	while ((simpleMatch = simpleRegex.exec(line)) !== null) {
		const startPos = simpleMatch.index;
		const endPos = startPos + simpleMatch[0].length;

		// Check if this is not part of __text__
		const before = line[startPos - 1];
		const after = line[endPos];
		if (before === '_' || after === '_') {
			continue; // Skip if it's part of __text__
		}

		if (position.character >= startPos && position.character <= endPos) {
			const start = new vscode.Position(position.line, startPos);
			const end = new vscode.Position(position.line, endPos);
			const text = simpleMatch[1];
			return { range: new vscode.Range(start, end), text };
		}
	}

	return undefined;
}

/**
 * Find if the cursor is inside #underline[...] formatting
 * Returns the range of the entire formatting and the text inside
 */
function getSurroundingUnderlineRange(
	position: vscode.Position,
	document: vscode.TextDocument
): { range: vscode.Range; text: string } | undefined {
	const line = document.lineAt(position.line).text;

	// Find #underline[...] patterns
	const regex = /#underline\[([^\]]+)\]/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(line)) !== null) {
		const startPos = match.index;
		const endPos = startPos + match[0].length;

		if (position.character >= startPos && position.character <= endPos) {
			const start = new vscode.Position(position.line, startPos);
			const end = new vscode.Position(position.line, endPos);
			const text = match[1];
			return { range: new vscode.Range(start, end), text };
		}
	}

	return undefined;
}

/**
 * Register all text formatting commands
 */
export function registerTextCommands(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Text formatting shortcuts
	disposables.push(
		vscode.commands.registerCommand('typst.shortcut.bold', toggleBold)
	);
	disposables.push(
		vscode.commands.registerCommand('typst.shortcut.italic', toggleItalic)
	);
	disposables.push(
		vscode.commands.registerCommand('typst.shortcut.underline', toggleUnderline)
	);

	return disposables;
}

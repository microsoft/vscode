/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Common text formatting macros available for surround command
 */
const SURROUND_MACROS = [
	{ label: '\\textbf', macro: 'textbf{$1}', detail: 'Bold text' },
	{ label: '\\textit', macro: 'textit{$1}', detail: 'Italic text' },
	{ label: '\\underline', macro: 'underline{$1}', detail: 'Underlined text' },
	{ label: '\\emph', macro: 'emph{$1}', detail: 'Emphasized text' },
	{ label: '\\textrm', macro: 'textrm{$1}', detail: 'Roman text' },
	{ label: '\\texttt', macro: 'texttt{$1}', detail: 'Typewriter text' },
	{ label: '\\textsc', macro: 'textsc{$1}', detail: 'Small caps' },
	{ label: '\\textsl', macro: 'textsl{$1}', detail: 'Slanted text' },
	{ label: '\\textsf', macro: 'textsf{$1}', detail: 'Sans-serif text' },
	{ label: '\\textnormal', macro: 'textnormal{$1}', detail: 'Normal text' },
	{ label: '\\textsuperscript', macro: 'textsuperscript{$1}', detail: 'Superscript' },
	{ label: '\\textsubscript', macro: 'textsubscript{$1}', detail: 'Subscript' },
	{ label: '\\mathbf', macro: 'mathbf{$1}', detail: 'Math bold' },
	{ label: '\\mathit', macro: 'mathit{$1}', detail: 'Math italic' },
	{ label: '\\mathrm', macro: 'mathrm{$1}', detail: 'Math roman' },
	{ label: '\\mathtt', macro: 'mathtt{$1}', detail: 'Math typewriter' },
	{ label: '\\mathsf', macro: 'mathsf{$1}', detail: 'Math sans-serif' },
	{ label: '\\mathbb', macro: 'mathbb{$1}', detail: 'Math blackboard bold' },
	{ label: '\\mathcal', macro: 'mathcal{$1}', detail: 'Math calligraphic' },
	{ label: '\\mathfrak', macro: 'mathfrak{$1}', detail: 'Math fraktur' },
	{ label: '\\href', macro: 'href{${2:url}}{$1}', detail: 'Hyperlink' },
	{ label: '\\url', macro: 'url{$1}', detail: 'URL' },
	{ label: '\\footnote', macro: 'footnote{$1}', detail: 'Footnote' },
	{ label: '\\textcolor', macro: 'textcolor{${2:color}}{$1}', detail: 'Colored text' },
	{ label: '\\colorbox', macro: 'colorbox{${2:color}}{$1}', detail: 'Colored box' },
];

/**
 * Wrap selection with an environment
 * Inserts \begin{env}...\end{env} around the selected text
 */
export async function wrapEnvironment(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	// Use a snippet to wrap the selection
	const snippet = new vscode.SnippetString('\\begin{${1:environment}}\n\t${TM_SELECTED_TEXT}$0\n\\end{${1:environment}}');
	await editor.insertSnippet(snippet);
}

/**
 * Surround selection with a LaTeX command from a QuickPick menu
 */
export async function surroundWithCommand(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	// Show quick pick with available macros
	const selected = await vscode.window.showQuickPick(SURROUND_MACROS, {
		placeHolder: 'Select a command to surround the selection',
		matchOnDetail: true
	});

	if (!selected) {
		return;
	}

	await editor.edit(editBuilder => {
		for (const selection of editor.selections) {
			const selectedText = editor.document.getText(selection);
			// Replace $1 placeholder with selected text
			const newText = '\\' + selected.macro.replace(/\$1/g, selectedText).replace(/\$\{[^}]+\}/g, '');
			editBuilder.replace(selection, newText);
		}
	});
}

/**
 * Get the longest balanced string inside braces
 */
function getLongestBalancedString(s: string): string | undefined {
	const bracketStack: string[] = [];
	const opener = '{';

	if (s[0] !== opener) {
		bracketStack.push(opener);
	}

	for (let i = 0; i < s.length; ++i) {
		const char = s[i];
		if (char === '{' || char === '[' || char === '(') {
			bracketStack.push(char);
		} else if (char === '}') {
			const openPos = bracketStack.lastIndexOf('{');
			if (openPos > -1) {
				bracketStack.splice(openPos, 1);
			}
		} else if (char === ']') {
			const openPos = bracketStack.lastIndexOf('[');
			if (openPos > -1) {
				bracketStack.splice(openPos, 1);
			}
		} else if (char === ')') {
			const lastBracket = bracketStack[bracketStack.length - 1];
			if (lastBracket === '(' || lastBracket === '[') {
				bracketStack.pop();
			}
		}

		if (bracketStack.lastIndexOf(opener) < 0) {
			return s.substring(s[0] === opener ? 1 : 0, i);
		}
	}

	return undefined;
}

/**
 * Find if the cursor is inside a macro like \keyword{...}
 * Returns the range of the entire macro and its argument
 */
function getSurroundingMacroRange(
	macro: string,
	position: vscode.Position,
	document: vscode.TextDocument
): { range: vscode.Range; arg: string } | undefined {
	if (!macro.startsWith('\\')) {
		macro = '\\' + macro;
	}

	const line = document.lineAt(position.line).text;
	const escapedMacro = macro.replace(/\\/g, '\\\\');
	const regex = new RegExp(escapedMacro + '\\{', 'g');

	let match: RegExpExecArray | null;
	while ((match = regex.exec(line)) !== null) {
		const matchPos = match.index;
		const openingBracePos = matchPos + macro.length;
		const arg = getLongestBalancedString(line.slice(openingBracePos));

		if (arg !== undefined &&
			position.character >= openingBracePos &&
			position.character <= openingBracePos + arg.length + 1) {
			const start = new vscode.Position(position.line, matchPos);
			const end = new vscode.Position(position.line, openingBracePos + arg.length + 1);
			return { range: new vscode.Range(start, end), arg };
		}
	}

	return undefined;
}

/**
 * Toggle a keyword command around the selection or cursor position
 * If selection is empty and cursor is inside \keyword{...}, remove the command
 * If selection is empty and cursor is not inside \keyword{...}, insert a snippet
 * If selection is not empty and starts with \keyword{, remove the command
 * If selection is not empty and doesn't start with \keyword{, wrap with the command
 *
 * @param keyword The LaTeX command without backslash (e.g., 'textbf', 'emph')
 */
export async function toggleKeyword(keyword: string): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	interface EditAction {
		range: vscode.Range | vscode.Selection;
		text: string;
	}

	const editActions: EditAction[] = [];
	const snippetPositions: vscode.Position[] = [];

	for (const selection of editor.selections) {
		// If the selection is empty, check if cursor is inside \keyword{...}
		if (selection.isEmpty) {
			const surroundingRange = getSurroundingMacroRange(keyword, selection.anchor, editor.document);
			if (surroundingRange) {
				// Remove the command, keep only the argument
				editActions.push({ range: surroundingRange.range, text: surroundingRange.arg });
			} else {
				// Insert a snippet
				snippetPositions.push(selection.anchor);
			}
			continue;
		}

		// Selection is not empty
		const text = editor.document.getText(selection);

		// Check if selection starts with \keyword{ or keyword{
		if (text.startsWith(`\\${keyword}{`) || text.startsWith(`${keyword}{`)) {
			// Remove the command
			const start = text.indexOf('{') + 1;
			const insideText = text.slice(start, -1); // Remove last }
			editActions.push({ range: selection, text: insideText });
		} else {
			// Wrap with the command
			editActions.push({ range: selection, text: `\\${keyword}{${text}}` });
		}
	}

	// Apply edits or insert snippets
	if (editActions.length === 0 && snippetPositions.length > 0) {
		// Only snippets to insert
		const snippet = new vscode.SnippetString(`\\${keyword}{\${1}}`);
		await editor.insertSnippet(snippet, snippetPositions);
	} else if (editActions.length > 0 && snippetPositions.length === 0) {
		// Only edits to apply
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	} else if (editActions.length > 0 && snippetPositions.length > 0) {
		// Mixed - apply edits first, then snippets would be complex
		// For simplicity, just apply edits
		await editor.edit(editBuilder => {
			editActions.forEach(action => {
				editBuilder.replace(action.range, action.text);
			});
		});
	}
}

/**
 * Toggle between different equation environments
 */
export async function toggleEquationEnvironment(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	const equationEnvs = ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*'];

	const selected = await vscode.window.showQuickPick(equationEnvs, {
		placeHolder: 'Select equation environment to toggle to'
	});

	if (!selected) {
		return;
	}

	// Find the current environment at cursor position
	const cursorPos = editor.selection.active;
	const document = editor.document;

	// Search backwards for \begin{...}
	let beginLine = -1;
	let beginEnv = '';
	let beginCol = -1;

	for (let line = cursorPos.line; line >= 0; line--) {
		const lineText = document.lineAt(line).text;
		const match = lineText.match(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}/);
		if (match) {
			beginLine = line;
			beginEnv = match[1];
			beginCol = match.index || 0;
			break;
		}
	}

	if (beginLine === -1) {
		vscode.window.showInformationMessage('No equation environment found at cursor position.');
		return;
	}

	// Search forwards for \end{...}
	let endLine = -1;
	let endCol = -1;

	for (let line = cursorPos.line; line < document.lineCount; line++) {
		const lineText = document.lineAt(line).text;
		const endPattern = new RegExp(`\\\\end\\{${beginEnv.replace('*', '\\*')}\\}`);
		const match = lineText.match(endPattern);
		if (match) {
			endLine = line;
			endCol = match.index || 0;
			break;
		}
	}

	if (endLine === -1) {
		vscode.window.showInformationMessage('Could not find matching \\end for the environment.');
		return;
	}

	// Replace both \begin and \end
	await editor.edit(editBuilder => {
		// Replace \begin{oldEnv}
		const beginRange = new vscode.Range(
			beginLine, beginCol,
			beginLine, beginCol + `\\begin{${beginEnv}}`.length
		);
		editBuilder.replace(beginRange, `\\begin{${selected}}`);

		// Replace \end{oldEnv}
		const endRange = new vscode.Range(
			endLine, endCol,
			endLine, endCol + `\\end{${beginEnv}}`.length
		);
		editBuilder.replace(endRange, `\\end{${selected}}`);
	});
}

/**
 * Register all text manipulation commands
 */
export function registerTextCommands(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Wrap environment command
	disposables.push(
		vscode.commands.registerCommand('latex.wrapEnvironment', wrapEnvironment)
	);

	// Surround with command
	disposables.push(
		vscode.commands.registerCommand('latex.surroundWithCommand', surroundWithCommand)
	);

	// Toggle equation environment
	disposables.push(
		vscode.commands.registerCommand('latex.toggleEquationEnv', toggleEquationEnvironment)
	);

	// Text formatting shortcuts
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textbf', () => toggleKeyword('textbf'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textit', () => toggleKeyword('textit'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.underline', () => toggleKeyword('underline'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.emph', () => toggleKeyword('emph'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textrm', () => toggleKeyword('textrm'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.texttt', () => toggleKeyword('texttt'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textsc', () => toggleKeyword('textsc'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textsf', () => toggleKeyword('textsf'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textnormal', () => toggleKeyword('textnormal'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textsuperscript', () => toggleKeyword('textsuperscript'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.textsubscript', () => toggleKeyword('textsubscript'))
	);

	// Math formatting shortcuts
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.mathbf', () => toggleKeyword('mathbf'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.mathit', () => toggleKeyword('mathit'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.mathrm', () => toggleKeyword('mathrm'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.mathtt', () => toggleKeyword('mathtt'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.mathsf', () => toggleKeyword('mathsf'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.mathbb', () => toggleKeyword('mathbb'))
	);
	disposables.push(
		vscode.commands.registerCommand('latex.shortcut.mathcal', () => toggleKeyword('mathcal'))
	);

	return disposables;
}


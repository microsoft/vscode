/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getOrCreateDocumentManager } from './documentManager';

export interface SetDecorations {
	(
		editor: vscode.TextEditor,
		decorationType: vscode.TextEditorDecorationType,
		ranges: vscode.Range[]
	): void;
}

function defaultSetDecorations(
	editor: vscode.TextEditor,
	decorationType: vscode.TextEditorDecorationType,
	ranges: vscode.Range[]
): void {
	editor.setDecorations(decorationType, ranges);
}

// Theme colors for cell decorations
const activeCellBorderThemeColor = new vscode.ThemeColor('interactive.activeCodeBorder');
const activeCellBackgroundThemeColor = new vscode.ThemeColor('notebook.selectedCellBackground');

// Create decoration types for focused cell borders
export const focusedCellTopDecorationType =
	vscode.window.createTextEditorDecorationType({
		borderColor: activeCellBorderThemeColor,
		borderWidth: '2px 0px 0px 0px',
		borderStyle: 'solid',
		isWholeLine: true,
	});

export const focusedCellBottomDecorationType =
	vscode.window.createTextEditorDecorationType({
		borderColor: activeCellBorderThemeColor,
		borderWidth: '0px 0px 1px 0px',
		borderStyle: 'solid',
		isWholeLine: true,
	});

export const focusedCellBackgroundDecorationType =
	vscode.window.createTextEditorDecorationType({
		backgroundColor: activeCellBackgroundThemeColor,
		isWholeLine: true,
	});

/** The style of code cell decorations. */
enum CellStyle {
	/** Highlight the active cell's border. */
	Background = 'background',

	/** Highlight the active cell's background. */
	Border = 'border',

	/** Highlight the active cell's border and background. */
	Both = 'both',
}

export function activateDecorations(
	disposables: vscode.Disposable[],
	setDecorations: SetDecorations = defaultSetDecorations,
): void {
	let timeout: NodeJS.Timeout | undefined = undefined;
	let activeEditor = vscode.window.activeTextEditor;

	// Update the active editor's cell decorations.
	function updateDecorations() {
		const docManager = activeEditor && getOrCreateDocumentManager(activeEditor.document);
		if (!activeEditor || !docManager) {
			return;
		}

		// Get the relevant decoration ranges.
		const cells = docManager.getCells();

		// Configurable: cellStyle `background`/`border`/`both`
		const config = vscode.workspace.getConfiguration('codeCells');
		const decorationStyle = config.get<CellStyle>('cellStyle');
		const useCellBorders = (decorationStyle === CellStyle.Border || decorationStyle === CellStyle.Both);
		const useCellBackground = (decorationStyle === CellStyle.Background || decorationStyle === CellStyle.Both);

		const activeCellBackgroundRanges: vscode.Range[] = [];
		const activeTopBorderRanges: vscode.Range[] = [];
		const activeBottomBorderRanges: vscode.Range[] = [];
		for (const cell of cells) {
			if (cell.range.contains(activeEditor.selection.active)) {
				if (useCellBackground) {
					activeCellBackgroundRanges.push(cell.range);
				}
				if (useCellBorders) {
					activeTopBorderRanges.push(new vscode.Range(cell.range.start.line, 0, cell.range.start.line, 0));
					activeBottomBorderRanges.push(new vscode.Range(cell.range.end.line, 0, cell.range.end.line, 0));
				}
			}
		}

		setDecorations(
			activeEditor,
			focusedCellBackgroundDecorationType,
			activeCellBackgroundRanges
		);
		setDecorations(
			activeEditor,
			focusedCellTopDecorationType,
			activeTopBorderRanges
		);
		setDecorations(
			activeEditor,
			focusedCellBottomDecorationType,
			activeBottomBorderRanges
		);


	}

	// Trigger an update of the active editor's cell decorations, with optional throttling.
	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(updateDecorations, 250);
		} else {
			updateDecorations();
		}
	}

	// Trigger a decorations update for the current active editor.
	if (activeEditor) {
		triggerUpdateDecorations();
	}

	disposables.push(
		// Trigger a decorations update when the active editor changes.
		vscode.window.onDidChangeActiveTextEditor(editor => {
			activeEditor = editor;
			if (editor) {
				triggerUpdateDecorations();
			}
		}),

		// Trigger a decorations update when the active editor's content changes.
		vscode.workspace.onDidChangeTextDocument(event => {
			if (activeEditor && event.document === activeEditor.document) {
				triggerUpdateDecorations(true);
			}
		}),

		// Trigger a decorations update when the active editor's selection changes.
		vscode.window.onDidChangeTextEditorSelection(event => {
			if (activeEditor && event.textEditor === activeEditor) {
				triggerUpdateDecorations();
			}
		}),

		// Trigger a decorations update when the cell style setting changes.
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('codeCells.cellStyle')) {
				triggerUpdateDecorations();
			}
		}),
	);
}

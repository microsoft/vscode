/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { canHaveCells, getOrCreateDocumentManager } from './documentManager';

export enum ContextKey {
	SupportsCodeCells = 'erdos.supportsCodeCells',
	HasCodeCells = 'erdos.hasCodeCells',
}

export const contexts: Map<ContextKey, boolean | undefined> = new Map([
	[ContextKey.SupportsCodeCells, false],
	[ContextKey.HasCodeCells, false],
]);

function setSupportsCodeCellsContext(editor: vscode.TextEditor | undefined): void {
	const value = editor && canHaveCells(editor.document);
	contexts.set(ContextKey.SupportsCodeCells, value);
	vscode.commands.executeCommand(
		'setContext',
		ContextKey.SupportsCodeCells,
		value,
	);
}

function setHasCodeCellsContext(editor: vscode.TextEditor | undefined): void {
	const docManager = editor && getOrCreateDocumentManager(editor.document);
	const value = (docManager && docManager.getCells().length > 0) ?? false;
	contexts.set(ContextKey.HasCodeCells, value);
	vscode.commands.executeCommand(
		'setContext',
		'erdos.hasCodeCells',
		value,
	);
}

export function activateContextKeys(disposables: vscode.Disposable[]): void {
	let activeEditor = vscode.window.activeTextEditor;

	if (activeEditor) {
		setSupportsCodeCellsContext(activeEditor);
		setHasCodeCellsContext(activeEditor);
	}

	disposables.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			// Update the active editor.
			activeEditor = editor;

			// Set the context keys.
			setSupportsCodeCellsContext(editor);
			setHasCodeCellsContext(editor);
		}),

		vscode.workspace.onDidChangeTextDocument((event) => {
			// Set the hasCodeCells context key when the active editor's document changes.
			if (activeEditor && event.document === activeEditor.document) {
				setHasCodeCellsContext(activeEditor);
			}
		})
	);
}

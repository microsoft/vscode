/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { trace } from './logging';
import { Cell, getParser, parseCells, supportedLanguageIds } from './parser';
import { IGNORED_SCHEMES } from './extension';

// List of opened documents
// export const documentManagers: DocumentManager[] = [];
const documentManagers: Map<vscode.Uri, DocumentManager> = new Map();

// Creates a cached document that handles parsing code cells for supported languages
export class DocumentManager implements vscode.Disposable {
	private cells: Cell[] = [];

	constructor(
		private document: vscode.TextDocument,
	) {
		// This path is not expected since getOrCreateDocumentManager will check `canHaveCells(document)`
		if (!getParser(this.document.languageId)) {
			throw new Error(`Code cells not configured for language ${this.document.languageId}`);
		}

		documentManagers.set(this.document.uri, this);
		trace(`Constructing document manager for:\nURI: ${this.document.uri}\nlanguage: ${this.document.languageId}\n`);
	}

	public dispose() {
		documentManagers.delete(this.document.uri);
	}

	public parseCells() {
		this.cells = parseCells(this.document);
	}

	public getCells() {
		return this.cells;
	}

	public getDocument() {
		return this.document;
	}
}

export function canHaveCells(document: vscode.TextDocument) {
	// inmemory:/repl-python-a4ddf396-a44e-4f6b-a092-5c54a301887b
	// const is_repl = (document.uri.scheme === 'inmemory') && (document.uri.authority.startsWith('repl'));
	// TODO: check on this
	return !IGNORED_SCHEMES.includes(document.uri.scheme) && supportedLanguageIds.includes(document.languageId);
}

export function getOrCreateDocumentManager(document: vscode.TextDocument): DocumentManager | undefined {
	if (!canHaveCells(document)) {
		return undefined;
	}

	let docManager = documentManagers.get(document.uri);
	if (!docManager) {
		docManager = new DocumentManager(document);
		docManager.parseCells();
	}
	return docManager;
}

// Initialize code cells in all open documents and set up on text change event to reparse cells
export function activateDocumentManagers(disposables: vscode.Disposable[]): void {
	// When starting extension, fill documentManagers
	vscode.window.visibleTextEditors.forEach((editor) => {
		getOrCreateDocumentManager(editor.document);
	});

	disposables.push(
		// When opening file, create new document
		vscode.workspace.onDidOpenTextDocument(document => {
			getOrCreateDocumentManager(document);
		}),

		// When closing file, destroy that document manager
		vscode.workspace.onDidCloseTextDocument(document => {
			documentManagers.get(document.uri)?.dispose();
		}),

		// Trigger a decorations update when the active editor's content changes.
		vscode.workspace.onDidChangeTextDocument(event => {
			getOrCreateDocumentManager(event.document)?.parseCells();
		})
	);
}




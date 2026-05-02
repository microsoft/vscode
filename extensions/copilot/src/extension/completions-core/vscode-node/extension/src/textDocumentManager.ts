/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { window, workspace } from 'vscode';
import { detectLanguage } from '../../lib/src/language/languageDetection';
import { CopilotTextDocument, INotebookCell, INotebookDocument, ITextDocument } from '../../lib/src/textDocument';
import { TextDocumentManager, WorkspaceFoldersChangeEvent } from '../../lib/src/textDocumentManager';
import { transformEvent } from '../../lib/src/util/event';
import { normalizeUri } from '../../lib/src/util/uri';

// List of document URI schemes that avoid ghost text suggestions
const ignoreUriSchemes = new Set([
	'output', // vscode output pane (important: avoids infinite log loop)
	'search-editor', // search results virtual document
	'comment', // very little context available and suggestions are often bad
	'git', // virtual file tracked by git
	'chat-editing-snapshot-text-model', // VS Code Chat temporary editing snapshot
]);

export function wrapDoc(doc: vscode.TextDocument): ITextDocument | undefined {
	if (ignoreUriSchemes.has(doc.uri.scheme)) {
		return;
	}
	let text: string;
	try {
		text = doc.getText();
	} catch (e) {
		// "Invalid string length", it's too big to fit in a string
		if (e instanceof RangeError) {
			return;
		}
		throw e;
	}
	const languageId = detectLanguage({ uri: doc.uri.toString(), languageId: doc.languageId });
	return CopilotTextDocument.create(doc.uri.toString(), doc.languageId, doc.version, text, languageId);
}

export class ExtensionTextDocumentManager extends TextDocumentManager {
	override onDidFocusTextDocument = transformEvent(window.onDidChangeActiveTextEditor, event => {
		return { document: event && { uri: event.document.uri.toString() } };
	});

	override onDidChangeTextDocument = transformEvent(workspace.onDidChangeTextDocument, e => {
		const document = wrapDoc(e.document);
		return document && { document, contentChanges: e.contentChanges };
	});

	override onDidOpenTextDocument = transformEvent(workspace.onDidOpenTextDocument, e => {
		// use wrapDoc() to handle the "Invalid string length" case
		const text = wrapDoc(e)?.getText();
		if (text === undefined) {
			return;
		}
		return { document: { uri: e.uri.toString(), languageId: e.languageId, version: e.version, text } };
	});

	override onDidCloseTextDocument = transformEvent(workspace.onDidCloseTextDocument, e => {
		return { document: { uri: normalizeUri(e.uri.toString()) } };
	});

	override onDidChangeWorkspaceFolders = transformEvent(
		workspace.onDidChangeWorkspaceFolders,
		(e): WorkspaceFoldersChangeEvent => {
			return {
				workspaceFolders: this.getWorkspaceFolders(),
				added: e.added.map(f => ({ uri: f.uri.toString(), name: f.name })),
				removed: e.removed.map(f => ({ uri: f.uri.toString(), name: f.name })),
			};
		}
	);

	getTextDocumentsUnsafe(): ITextDocument[] {
		const docs: ITextDocument[] = [];
		for (const vscodeDoc of workspace.textDocuments) {
			const doc = wrapDoc(vscodeDoc);
			if (doc) {
				docs.push(doc);
			}
		}
		return docs;
	}

	findNotebook(doc: { uri: string }): INotebookDocument | undefined {
		for (const notebook of workspace.notebookDocuments) {
			if (notebook.getCells().some(cell => cell.document.uri.toString() === doc.uri.toString())) {
				return {
					getCells: () => notebook.getCells().map(cell => this.wrapCell(cell)),
					getCellFor: ({ uri }: { uri: string }) => {
						const cell = notebook.getCells().find(cell => cell.document.uri.toString() === uri.toString());
						return cell ? this.wrapCell(cell) : undefined;
					},
				};
			}
		}
	}

	wrapCell(cell: vscode.NotebookCell): INotebookCell {
		return {
			...cell,
			get document(): ITextDocument {
				return CopilotTextDocument.create(
					cell.document.uri.toString(),
					cell.document.languageId,
					cell.document.version,
					cell.document.getText(),
					// use the original language id as cells have no metadata to leverage for language detection
					cell.document.languageId
				);
			},
		};
	}

	getWorkspaceFolders() {
		return (
			workspace.workspaceFolders?.map(f => {
				return { uri: f.uri.toString(), name: f.name };
			}) ?? []
		);
	}
}

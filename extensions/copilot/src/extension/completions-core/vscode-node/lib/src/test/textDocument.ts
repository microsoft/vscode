/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolder } from '../../../types/src';
import { CopilotTextDocument, INotebookCell, INotebookDocument, ITextDocument } from '../textDocument';
import {
	TextDocumentChangeEvent,
	TextDocumentCloseEvent,
	TextDocumentFocusedEvent,
	TextDocumentManager,
	TextDocumentOpenEvent,
	WorkspaceFoldersChangeEvent,
} from '../textDocumentManager';
import { Emitter } from '../util/event';
import { basename, validateUri } from '../util/uri';

export function createTextDocument(
	uri: string,
	clientAndDetectedLanguageId: string,
	version: number,
	text: string
): ITextDocument {
	return CopilotTextDocument.create(
		validateUri(uri),
		clientAndDetectedLanguageId,
		version,
		text,
		clientAndDetectedLanguageId
	);
}

interface JupyterCellVSCodeMetadata {
	languageId?: string;
}

interface JupyterCellMetadata {
	vscode?: JupyterCellVSCodeMetadata;
	[key: string]: unknown;
}

interface JupyterCell {
	cell_type: 'code' | 'markdown';
	source: string[];
	metadata: JupyterCellMetadata;
}

interface JupyterNotebook {
	cells: JupyterCell[];
	metadata: Record<string, unknown>;
	nbformat: number;
	nbformat_minor: number;
}

export function parseNotebook(doc: ITextDocument): INotebookDocument {
	const notebook: JupyterNotebook = JSON.parse(doc.getText()) as JupyterNotebook;
	const cells: INotebookCell[] = notebook.cells.map((cell, index) => {
		const cellUri = `${doc.uri.replace(/#.*/, '')}#${index}`;
		const cellText = Array.isArray(cell.source) ? cell.source.join('') : cell.source;

		const languageId =
			(cell.metadata?.['vscode']?.['languageId'] as string) ||
			(cell.cell_type === 'code' ? 'python' : 'markdown');

		const document = CopilotTextDocument.create(cellUri, languageId, 0, cellText, languageId);

		return {
			index,
			document,
			metadata: cell.metadata,
			kind: cell.cell_type === 'code' ? 2 : 1,
		};
	});
	return new InMemoryNotebookDocument(cells);
}

export class InMemoryNotebookDocument implements INotebookDocument {
	constructor(private readonly _cells: INotebookCell[]) { }
	getCells(): INotebookCell[] {
		return this._cells;
	}
	getCellFor({ uri }: { uri: string }): INotebookCell | undefined {
		return this._cells.find(cell => cell.document.uri === uri);
	}
}

/**
 * A concrete implementation of TextDocumentManager intended for use with the FakeFileSystem.
 */
export class SimpleTestTextDocumentManager extends TextDocumentManager {
	private _openTextDocuments: ITextDocument[] = [];
	private _notebookDocuments: Map<string, INotebookDocument> = new Map();
	private _workspaceFolders: WorkspaceFolder[] = [];

	init(workspaceFolders: { readonly uri: string; readonly name?: string }[]) {
		this._workspaceFolders = workspaceFolders.map(f => ({ uri: f.uri, name: f.name ?? basename(f.uri) }));
	}

	// Make public to allow for stubbing
	override async readTextDocumentFromDisk(uri: string): Promise<string | undefined> {
		return super.readTextDocumentFromDisk(uri);
	}

	override getTextDocumentsUnsafe(): ITextDocument[] {
		return this._openTextDocuments;
	}

	readonly didFocusTextDocumentEmitter = new Emitter<TextDocumentFocusedEvent>();
	onDidFocusTextDocument = this.didFocusTextDocumentEmitter.event;

	readonly didChangeTextDocumentEmitter = new Emitter<TextDocumentChangeEvent>();
	onDidChangeTextDocument = this.didChangeTextDocumentEmitter.event;

	readonly didOpenTextDocumentEmitter = new Emitter<TextDocumentOpenEvent>();
	onDidOpenTextDocument = this.didOpenTextDocumentEmitter.event;

	readonly didCloseTextDocumentEmitter = new Emitter<TextDocumentCloseEvent>();
	onDidCloseTextDocument = this.didCloseTextDocumentEmitter.event;

	readonly didChangeWorkspaceFoldersEmitter = new Emitter<WorkspaceFoldersChangeEvent>();
	onDidChangeWorkspaceFolders = this.didChangeWorkspaceFoldersEmitter.event;

	setTextDocument(uri: string, languageId: string, text: string): ITextDocument {
		const doc = createTextDocument(uri, languageId, 0, text);
		this._openTextDocuments.push(doc);
		return doc;
	}

	updateTextDocument(uri: string, newText: string) {
		const idx = this._openTextDocuments.findIndex(t => t.uri === uri.toString());
		if (idx < 0) {
			throw new Error('Document not found');
		}

		const oldDoc = this._openTextDocuments[idx];
		this._openTextDocuments[idx] = createTextDocument(uri, oldDoc.clientLanguageId, oldDoc.version + 1, newText);
	}

	setNotebookDocument(doc: ITextDocument, notebook: INotebookDocument) {
		// Document URIs in the same notebook differ only by fragment
		this._notebookDocuments.set(doc.uri.replace(/#.*/, ''), notebook);
	}

	findNotebook({ uri }: { uri: string }): INotebookDocument | undefined {
		return this._notebookDocuments.get(uri.replace(/#.*/, ''));
	}

	getWorkspaceFolders() {
		return this._workspaceFolders;
	}
}

/**
 * An implementation of TextDocumentManager that is limited to documents you
 * provide it. It will not attempt to open documents from the file system, but
 * you may provide it with "closed" documents available for opening.
 */
export class TestTextDocumentManager extends SimpleTestTextDocumentManager {
	private contents = new Map<string, string>();

	override readTextDocumentFromDisk(uri: string): Promise<string | undefined> {
		return Promise.resolve(this.contents.get(uri));
	}

	setDiskContents(uri: string, text: string) {
		this.contents.set(uri, text);
	}
}

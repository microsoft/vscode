/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ATTACHMENT_CLEANUP_COMMANDID, JUPYTER_NOTEBOOK_MARKDOWN_SELECTOR } from './constants';
import { deepClone, objectEquals, Delayer } from './helper';

interface AttachmentCleanRequest {
	notebook: vscode.NotebookDocument;
	document: vscode.TextDocument;
	cell: vscode.NotebookCell;
}

interface IAttachmentData {
	[key: string /** mimetype */]: string;/** b64-encoded */
}

interface IAttachmentDiagnostic {
	name: string;
	ranges: vscode.Range[];
}

export enum DiagnosticCode {
	missing_attachment = 'notebook.missing-attachment'
}

export class AttachmentCleaner implements vscode.CodeActionProvider {
	private _attachmentCache:
		Map<string /** uri */, Map<string /** cell fragment*/, Map<string /** attachment filename */, IAttachmentData>>> = new Map();

	private _disposables: vscode.Disposable[];
	private _imageDiagnosticCollection: vscode.DiagnosticCollection;
	private readonly _delayer = new Delayer(750);

	constructor() {
		this._disposables = [];
		this._imageDiagnosticCollection = vscode.languages.createDiagnosticCollection('Notebook Image Attachment');
		this._disposables.push(this._imageDiagnosticCollection);

		this._disposables.push(vscode.commands.registerCommand(ATTACHMENT_CLEANUP_COMMANDID, async (document: vscode.Uri, range: vscode.Range) => {
			const workspaceEdit = new vscode.WorkspaceEdit();
			workspaceEdit.delete(document, range);
			await vscode.workspace.applyEdit(workspaceEdit);
		}));

		this._disposables.push(vscode.languages.registerCodeActionsProvider(JUPYTER_NOTEBOOK_MARKDOWN_SELECTOR, this, {
			providedCodeActionKinds: [
				vscode.CodeActionKind.QuickFix
			],
		}));

		this._disposables.push(vscode.workspace.onDidChangeNotebookDocument(e => {
			this._delayer.trigger(() => {

				e.cellChanges.forEach(change => {
					if (!change.document) {
						return;
					}

					if (change.cell.kind !== vscode.NotebookCellKind.Markup) {
						return;
					}

					const metadataEdit = this.cleanNotebookAttachments({
						notebook: e.notebook,
						cell: change.cell,
						document: change.document
					});
					if (metadataEdit) {
						const workspaceEdit = new vscode.WorkspaceEdit();
						workspaceEdit.set(e.notebook.uri, [metadataEdit]);
						vscode.workspace.applyEdit(workspaceEdit);
					}
				});
			});
		}));


		this._disposables.push(vscode.workspace.onWillSaveNotebookDocument(e => {
			if (e.reason === vscode.TextDocumentSaveReason.Manual) {
				this._delayer.dispose();
				if (e.notebook.getCells().length === 0) {
					return;
				}
				const notebookEdits: vscode.NotebookEdit[] = [];
				for (const cell of e.notebook.getCells()) {
					if (cell.kind !== vscode.NotebookCellKind.Markup) {
						continue;
					}

					const metadataEdit = this.cleanNotebookAttachments({
						notebook: e.notebook,
						cell: cell,
						document: cell.document
					});

					if (metadataEdit) {
						notebookEdits.push(metadataEdit);
					}
				}
				if (!notebookEdits.length) {
					return;
				}
				const workspaceEdit = new vscode.WorkspaceEdit();
				workspaceEdit.set(e.notebook.uri, notebookEdits);
				e.waitUntil(Promise.resolve(workspaceEdit));
			}
		}));

		this._disposables.push(vscode.workspace.onDidCloseNotebookDocument(e => {
			this._attachmentCache.delete(e.uri.toString());
		}));

		this._disposables.push(vscode.workspace.onWillRenameFiles(e => {
			const re = /\.ipynb$/;
			for (const file of e.files) {
				if (!re.exec(file.oldUri.toString())) {
					continue;
				}

				// transfer cache to new uri
				if (this._attachmentCache.has(file.oldUri.toString())) {
					this._attachmentCache.set(file.newUri.toString(), this._attachmentCache.get(file.oldUri.toString())!);
					this._attachmentCache.delete(file.oldUri.toString());
				}
			}
		}));

		this._disposables.push(vscode.workspace.onDidOpenTextDocument(e => {
			this.analyzeMissingAttachments(e);
		}));

		this._disposables.push(vscode.workspace.onDidCloseTextDocument(e => {
			this.analyzeMissingAttachments(e);
		}));

		vscode.workspace.textDocuments.forEach(document => {
			this.analyzeMissingAttachments(document);
		});
	}

	provideCodeActions(document: vscode.TextDocument, _range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, _token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		const fixes: vscode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			switch (diagnostic.code) {
				case DiagnosticCode.missing_attachment:
					{
						const fix = new vscode.CodeAction(
							'Remove invalid image attachment reference',
							vscode.CodeActionKind.QuickFix);

						fix.command = {
							command: ATTACHMENT_CLEANUP_COMMANDID,
							title: 'Remove invalid image attachment reference',
							arguments: [document.uri, diagnostic.range],
						};
						fixes.push(fix);
					}
					break;
			}
		}

		return fixes;
	}

	/**
	 * take in a NotebookDocumentChangeEvent, and clean the attachment data for the cell(s) that have had their markdown source code changed
	 * @param e NotebookDocumentChangeEvent from the onDidChangeNotebookDocument listener
	 * @returns vscode.NotebookEdit, the metadata alteration performed on the json behind the ipynb
	 */
	private cleanNotebookAttachments(e: AttachmentCleanRequest): vscode.NotebookEdit | undefined {

		if (e.notebook.isClosed) {
			return;
		}
		const document = e.document;
		const cell = e.cell;

		const markdownAttachmentsInUse: { [key: string /** filename */]: IAttachmentData } = {};
		const cellFragment = cell.document.uri.fragment;
		const notebookUri = e.notebook.uri.toString();
		const diagnostics: IAttachmentDiagnostic[] = [];
		const markdownAttachmentsRefedInCell = this.getAttachmentNames(document);

		if (markdownAttachmentsRefedInCell.size === 0) {
			// no attachments used in this cell, cache all images from cell metadata
			this.saveAllAttachmentsToCache(cell.metadata, notebookUri, cellFragment);
		}

		if (this.checkMetadataHasAttachmentsField(cell.metadata)) {
			// the cell metadata contains attachments, check if any are used in the markdown source

			for (const [currFilename, attachment] of Object.entries(cell.metadata.attachments)) {
				// means markdown reference is present in the metadata, rendering will work properly
				// therefore, we don't need to check it in the next loop either
				if (markdownAttachmentsRefedInCell.has(currFilename)) {
					// attachment reference is present in the markdown source, no need to cache it
					markdownAttachmentsRefedInCell.get(currFilename)!.valid = true;
					markdownAttachmentsInUse[currFilename] = attachment as IAttachmentData;
				} else {
					// attachment reference is not present in the markdown source, cache it
					this.saveAttachmentToCache(notebookUri, cellFragment, currFilename, cell.metadata);
				}
			}
		}

		for (const [currFilename, attachment] of markdownAttachmentsRefedInCell) {
			if (attachment.valid) {
				// attachment reference is present in both the markdown source and the metadata, no op
				continue;
			}

			// if image is referenced in markdown source but not in metadata -> check if we have image in the cache
			const cachedImageAttachment = this._attachmentCache.get(notebookUri)?.get(cellFragment)?.get(currFilename);
			if (cachedImageAttachment) {
				markdownAttachmentsInUse[currFilename] = cachedImageAttachment;
				this._attachmentCache.get(notebookUri)?.get(cellFragment)?.delete(currFilename);
			} else {
				// if image is not in the cache, show warning
				diagnostics.push({ name: currFilename, ranges: attachment.ranges });
			}
		}

		this.updateDiagnostics(cell.document.uri, diagnostics);

		if (cell.index > -1 && !objectEquals(markdownAttachmentsInUse || {}, cell.metadata.attachments || {})) {
			const updateMetadata: { [key: string]: any } = deepClone(cell.metadata);
			if (Object.keys(markdownAttachmentsInUse).length === 0) {
				updateMetadata.attachments = undefined;
			} else {
				updateMetadata.attachments = markdownAttachmentsInUse;
			}
			const metadataEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, updateMetadata);
			return metadataEdit;
		}
		return;
	}

	private analyzeMissingAttachments(document: vscode.TextDocument): void {
		if (document.uri.scheme !== 'vscode-notebook-cell') {
			// not notebook
			return;
		}

		if (document.isClosed) {
			this.updateDiagnostics(document.uri, []);
			return;
		}

		let notebook: vscode.NotebookDocument | undefined;
		let activeCell: vscode.NotebookCell | undefined;
		for (const notebookDocument of vscode.workspace.notebookDocuments) {
			const cell = notebookDocument.getCells().find(cell => cell.document === document);
			if (cell) {
				notebook = notebookDocument;
				activeCell = cell;
				break;
			}
		}

		if (!notebook || !activeCell) {
			return;
		}

		const diagnostics: IAttachmentDiagnostic[] = [];
		const markdownAttachments = this.getAttachmentNames(document);
		if (this.checkMetadataHasAttachmentsField(activeCell.metadata)) {
			for (const [currFilename, attachment] of markdownAttachments) {
				if (!activeCell.metadata.attachments[currFilename]) {
					// no attachment reference in the metadata
					diagnostics.push({ name: currFilename, ranges: attachment.ranges });
				}
			}
		}

		this.updateDiagnostics(activeCell.document.uri, diagnostics);
	}

	private updateDiagnostics(cellUri: vscode.Uri, diagnostics: IAttachmentDiagnostic[]) {
		const vscodeDiagnostics: vscode.Diagnostic[] = [];
		for (const currDiagnostic of diagnostics) {
			currDiagnostic.ranges.forEach(range => {
				const diagnostic = new vscode.Diagnostic(range, `The image named: '${currDiagnostic.name}' is not present in cell metadata.`, vscode.DiagnosticSeverity.Warning);
				diagnostic.code = DiagnosticCode.missing_attachment;
				vscodeDiagnostics.push(diagnostic);
			});
		}

		this._imageDiagnosticCollection.set(cellUri, vscodeDiagnostics);
	}

	/**
	 * remove attachment from metadata and add it to the cache
	 * @param notebookUri uri of the notebook currently being edited
	 * @param cellFragment fragment of the cell currently being edited
	 * @param currFilename filename of the image being pulled into the cell
	 * @param metadata metadata of the cell currently being edited
	 */
	private saveAttachmentToCache(notebookUri: string, cellFragment: string, currFilename: string, metadata: { [key: string]: any }): void {
		const documentCache = this._attachmentCache.get(notebookUri);
		if (!documentCache) {
			// no cache for this notebook yet
			const cellCache = new Map<string, IAttachmentData>();
			cellCache.set(currFilename, this.getMetadataAttachment(metadata, currFilename));
			const documentCache = new Map();
			documentCache.set(cellFragment, cellCache);
			this._attachmentCache.set(notebookUri, documentCache);
		} else if (!documentCache.has(cellFragment)) {
			// no cache for this cell yet
			const cellCache = new Map<string, IAttachmentData>();
			cellCache.set(currFilename, this.getMetadataAttachment(metadata, currFilename));
			documentCache.set(cellFragment, cellCache);
		} else {
			// cache for this cell already exists
			// add to cell cache
			documentCache.get(cellFragment)?.set(currFilename, this.getMetadataAttachment(metadata, currFilename));
		}
	}

	/**
	 * get an attachment entry from the given metadata
	 * @param metadata metadata to extract image data from
	 * @param currFilename filename of image being extracted
	 * @returns
	 */
	private getMetadataAttachment(metadata: { [key: string]: any }, currFilename: string): { [key: string]: any } {
		return metadata.attachments[currFilename];
	}

	/**
	 * returns a boolean that represents if there are any images in the attachment field of a cell's metadata
	 * @param metadata metadata of cell
	 * @returns boolean representing the presence of any attachments
	 */
	private checkMetadataHasAttachmentsField(metadata: { [key: string]: unknown }): metadata is { readonly attachments: Record<string, unknown> } {
		return !!metadata.attachments && typeof metadata.attachments === 'object';
	}

	/**
	 * given metadata from a cell, cache every image (used in cases with no image links in markdown source)
	 * @param metadata metadata for a cell with no images in markdown source
	 * @param notebookUri uri for the notebook being edited
	 * @param cellFragment fragment of cell being edited
	 */
	private saveAllAttachmentsToCache(metadata: { [key: string]: unknown }, notebookUri: string, cellFragment: string): void {
		const documentCache = this._attachmentCache.get(notebookUri) ?? new Map();
		this._attachmentCache.set(notebookUri, documentCache);
		const cellCache = documentCache.get(cellFragment) ?? new Map<string, IAttachmentData>();
		documentCache.set(cellFragment, cellCache);

		if (metadata.attachments && typeof metadata.attachments === 'object') {
			for (const [currFilename, attachment] of Object.entries(metadata.attachments)) {
				cellCache.set(currFilename, attachment);
			}
		}
	}

	/**
	 * pass in all of the markdown source code, and get a dictionary of all images referenced in the markdown. keys are image filenames, values are render state
	 * @param document the text document for the cell, formatted as a string
	 */
	private getAttachmentNames(document: vscode.TextDocument) {
		const source = document.getText();
		const filenames: Map<string, { valid: boolean; ranges: vscode.Range[] }> = new Map();
		const re = /!\[.*?\]\(<?attachment:(?<filename>.*?)>?\)/gm;

		let match;
		while ((match = re.exec(source))) {
			if (match.groups?.filename) {
				const index = match.index;
				const length = match[0].length;
				const startPosition = document.positionAt(index);
				const endPosition = document.positionAt(index + length);
				const range = new vscode.Range(startPosition, endPosition);
				const filename = filenames.get(match.groups.filename) ?? { valid: false, ranges: [] };
				filenames.set(match.groups.filename, filename);
				filename.ranges.push(range);
			}
		}
		return filenames;
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
		this._delayer.dispose();
	}
}


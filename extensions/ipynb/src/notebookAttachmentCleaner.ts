/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DebounceTrigger, deepClone, objectEquals } from './helper';

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

export class AttachmentCleaner {
	private _attachmentCache:
		Map<string /** uri */, Map<string /** cell fragment*/, Map<string /** attachment filename */, IAttachmentData>>> = new Map();

	private _disposables: vscode.Disposable[];
	private _imageDiagnosticCollection: vscode.DiagnosticCollection;
	constructor() {
		this._disposables = [];
		const debounceTrigger = new DebounceTrigger<AttachmentCleanRequest>({
			callback: (change: AttachmentCleanRequest) => {
				this.cleanNotebookAttachments(change);
			},
			delay: 500
		});

		this._imageDiagnosticCollection = vscode.languages.createDiagnosticCollection('Notebook Image Attachment');
		this._disposables.push(this._imageDiagnosticCollection);

		this._disposables.push(vscode.workspace.onDidChangeNotebookDocument(e => {
			e.cellChanges.forEach(change => {
				if (!change.document) {
					return;
				}

				if (change.cell.kind !== vscode.NotebookCellKind.Markup) {
					return;
				}

				debounceTrigger.trigger({
					notebook: e.notebook,
					cell: change.cell,
					document: change.document
				});
			});
		}));

		this._disposables.push(vscode.workspace.onDidCloseNotebookDocument(e => {
			this._attachmentCache.delete(e.uri.toString());
		}));

		// TODO@rebornix, is this necessary? rename will trigger notebook document close
		this._disposables.push(vscode.workspace.onDidRenameFiles(e => {
			const re = /\.ipynb$/;
			for (const file of e.files) {
				if (!re.exec(file.oldUri.toString())) {
					continue;
				}
				if (this._attachmentCache.has(file.oldUri.toString())) {
					this._attachmentCache.set(file.newUri.toString(), this._attachmentCache.get(file.oldUri.toString())!);
					this._attachmentCache.delete(file.oldUri.toString());
				}
			}
		}));
	}

	/**
	 * take in a NotebookDocumentChangeEvent, and clean the attachment data for the cell(s) that have had their markdown source code changed
	 * @param e NotebookDocumentChangeEvent from the onDidChangeNotebookDocument listener
	 */
	private cleanNotebookAttachments(e: AttachmentCleanRequest) {
		if (e.notebook.isClosed) {
			return;
		}
		const document = e.document;
		const cell = e.cell;

		const updateMetadata: { [key: string]: any } = deepClone(cell.metadata);
		const cellFragment = cell.document.uri.fragment;
		const notebookUri = e.notebook.uri.toString();
		const mkdnSource = document.getText();
		const diagnostics: IAttachmentDiagnostic[] = [];

		if (mkdnSource.length === 0) { // cell with 0 content
			this.cacheAllImages(updateMetadata, notebookUri, cellFragment);
		} else {
			const markdownAttachments = this.getAttachmentNames(document);
			if (markdownAttachments.size === 0) {
				// no attachments used in this cell, cache all images from cell metadata
				this.cacheAllImages(updateMetadata, notebookUri, cellFragment);
			}

			if (this.checkMetadataAttachments(updateMetadata)) {
				// the cell metadata contains attachments, check if any are used in the markdown source

				for (const currFilename of Object.keys(updateMetadata.custom.attachments)) {
					// means markdown reference is present in the metadata, rendering will work properly
					// therefore, we don't need to check it in the next loop either
					if (markdownAttachments.has(currFilename)) {
						// attachment reference is present in the markdown source, no need to cache it
						markdownAttachments.get(currFilename)!.rendered = true;
					} else {
						// attachment reference is not present in the markdown source, cache it
						this.cacheAttachment(notebookUri, cellFragment, currFilename, updateMetadata);
					}
				}
			}

			for (const [currFilename, attachment] of markdownAttachments) {
				if (attachment.rendered) {
					// attachment reference is present in both the markdown source and the metadata, no op
					continue;
				}

				// if image is referenced in markdown source but not in metadata -> check if we have image in the cache
				if (this._attachmentCache.get(notebookUri)?.get(cellFragment)?.has(currFilename)) {
					this.addImageToCellMetadata(notebookUri, cellFragment, currFilename, updateMetadata);
				} else {
					// if image is not in the cache, show warning
					diagnostics.push({ name: currFilename, ranges: attachment.ranges });
				}
			}
		}

		if (!objectEquals(updateMetadata, cell.metadata)) {
			const metadataEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, updateMetadata);
			const workspaceEdit = new vscode.WorkspaceEdit();
			workspaceEdit.set(e.notebook.uri, [metadataEdit]);
			vscode.workspace.applyEdit(workspaceEdit);
		}

		this.updateDiagnostics(cell.document.uri, diagnostics);
	}

	private updateDiagnostics(cellUri: vscode.Uri, diagnostics: IAttachmentDiagnostic[]) {
		const vscodeDiagnostics: vscode.Diagnostic[] = [];
		for (const currDiagnostic of diagnostics) {
			currDiagnostic.ranges.forEach(range => {
				vscodeDiagnostics.push(new vscode.Diagnostic(range, `Attachment ${currDiagnostic.name} not available`, vscode.DiagnosticSeverity.Warning));
			});
		}

		this._imageDiagnosticCollection.set(cellUri, vscodeDiagnostics);
	}

	/**
	 * take image from cache and place into new metadata for the cell
	 * @param notebookUri uri of the notebook currently being edited
	 * @param cellFragment fragment of the cell currently being edited
	 * @param currFilename filename of the image being pulled into the cell
	 * @param metadata metadata of the cell currently being edited
	 */
	private addImageToCellMetadata(notebookUri: string, cellFragment: string, currFilename: string, metadata: { [key: string]: any }) {
		metadata.custom.attachments[currFilename] = this._attachmentCache.get(notebookUri)?.get(cellFragment)?.get(currFilename);
		this._attachmentCache.get(notebookUri)?.get(cellFragment)?.delete(currFilename);
	}

	/**
	 * remove attachment from metadata and add it to the cache
	 * @param notebookUri uri of the notebook currently being edited
	 * @param cellFragment fragment of the cell currently being edited
	 * @param currFilename filename of the image being pulled into the cell
	 * @param metadata metadata of the cell currently being edited
	 */
	private cacheAttachment(notebookUri: string, cellFragment: string, currFilename: string, metadata: { [key: string]: any }): void {
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

		delete metadata.custom.attachments[currFilename];
	}

	/**
	 * get an attachment entry from the given metadata
	 * @param metadata metadata to extract image data from
	 * @param currFilename filename of image being extracted
	 * @returns
	 */
	private getMetadataAttachment(metadata: { [key: string]: any }, currFilename: string): { [key: string]: any } {
		return metadata.custom.attachments[currFilename];
	}

	/**
	 * returns a boolean that represents if there are any images in the attachment field of a cell's metadata
	 * @param metadata metadata of cell
	 * @returns boolean representing the presence of any attachments
	 */
	private checkMetadataAttachments(metadata: { [key: string]: any }): boolean {
		return !!(metadata.custom?.attachments);
	}

	/**
	 * given metadata from a cell, cache every image (used in cases with no image links in markdown source)
	 * @param metadata metadata for a cell with no images in markdown source
	 * @param notebookUri uri for the notebook being edited
	 * @param cellFragment fragment of cell being edited
	 */
	private cacheAllImages(metadata: { [key: string]: any }, notebookUri: string, cellFragment: string): void {
		const documentCache = this._attachmentCache.get(notebookUri) ?? new Map();
		this._attachmentCache.set(notebookUri, documentCache);
		const cellCache = documentCache.get(cellFragment) ?? new Map<string, IAttachmentData>();
		documentCache.set(cellFragment, cellCache);

		for (const currFilename of Object.keys(metadata.custom.attachments)) {
			cellCache.set(currFilename, metadata.custom.attachments[currFilename]);
			delete metadata.custom.attachments[currFilename];
		}
	}

	/**
	 * pass in all of the markdown source code, and get a dictionary of all images referenced in the markdown. keys are image filenames, values are render state
	 * @param document the text document for the cell, formatted as a string
	 * @returns a dictionary with all markdown names and a boolean representing their rendering state (true = will render properly // false = won't render or not checked yet)
	 */
	private getAttachmentNames(document: vscode.TextDocument) {
		const source = document.getText();
		const filenames: Map<string, { rendered: boolean; ranges: vscode.Range[] }> = new Map();
		const re = /!\[.*?\]\(attachment:(?<filename>.*?)\)/gm;

		let match;
		while ((match = re.exec(source))) {
			if (match.groups?.filename) {
				const index = match.index;
				const length = match[0].length;
				const startPosition = document.positionAt(index);
				const endPosition = document.positionAt(index + length);
				const range = new vscode.Range(startPosition, endPosition);
				const filename = filenames.get(match.groups.filename) ?? { rendered: false, ranges: [] };
				filenames.set(match.groups.filename, filename);
				filename.ranges.push(range);
			}
		}
		return filenames;
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}


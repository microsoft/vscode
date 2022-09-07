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
class AttachmentCleaner {

	// FIXME: potentially just turn this into a map
	attachmentCache:
		{ [key: string/*uri*/]: { [key: string/*cellFragment*/]: { [key: string/*filename*/]: { [key: string/*mime*/]: string/*b64*/ } } } } = {};

	private _disposables: vscode.Disposable[];
	constructor() {
		const debounceTrigger = new DebounceTrigger<AttachmentCleanRequest>({
			callback: (change: AttachmentCleanRequest) => {
				this.cleanNotebookAttachments(change);
			},
			delay: 500
		});

		this._disposables = [];

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
			this.deleteCacheUri(e);
		}));

		this._disposables.push(vscode.workspace.onDidRenameFiles(e => {
			this.renameCacheUri(e);
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
		const mkdnSource = document?.getText();

		if (!mkdnSource) { // cell with 0 content
			this.cacheAllImages(updateMetadata, notebookUri, cellFragment);
		} else {
			const markdownAttachments = this.getAttachmentNames(mkdnSource);
			if (!markdownAttachments) {
				this.cacheAllImages(updateMetadata, notebookUri, cellFragment);
			}

			if (this.checkMetadataAttachments(updateMetadata)) {
				for (const currFilename of Object.keys(updateMetadata.custom.attachments)) {
					// means markdown reference is present in the metadata, rendering will work properly
					// therefore, we don't need to check it in the next loop either
					if (currFilename in markdownAttachments) {
						markdownAttachments[currFilename] = true;
					} else {
						this.cacheAttachment(notebookUri, cellFragment, currFilename, updateMetadata);
					}
				}
			}

			for (const currFilename of Object.keys(markdownAttachments)) {
				// if image is addressed already --> continue, attachment will function as normal
				if (markdownAttachments[currFilename]) {
					continue;
				}

				// if image is referenced in mkdn && image is not in metadata -> check if image IS inside cache
				if (this.checkCacheValidity(notebookUri, cellFragment) && Object.keys(this.attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
					this.addImageToCellMetadata(notebookUri, cellFragment, currFilename, updateMetadata);
				}
				//TODO: ELSE: diagnostic squiggle, image not present
			}
		}

		if (!objectEquals(updateMetadata, cell.metadata)) {
			const metadataEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, updateMetadata);
			const workspaceEdit = new vscode.WorkspaceEdit();
			workspaceEdit.set(e.notebook.uri, [metadataEdit]);
			vscode.workspace.applyEdit(workspaceEdit);
		}
	}

	/**
	 * delete a URI entry in the cache when a notebook editor is closed
	 * @param e NotebookDocument that was closed
	 */
	deleteCacheUri(e: vscode.NotebookDocument) {
		for (const entry of Object.keys(this.attachmentCache)) {
			if (entry === e.uri.toString()) {
				delete this.attachmentCache[entry];
			}
		}
	}

	/**
	 * rename cache entries to maintain the attachment cache across file renamings
	 * @param e FileRenameEvent
	 */
	renameCacheUri(e: vscode.FileRenameEvent) {
		const re = /\.ipynb$/;
		for (const file of e.files) {
			if (!re.exec(file.oldUri.toString())) {
				continue;
			}
			if (Object.keys(this.attachmentCache).includes(file.oldUri.toString())) {
				this.attachmentCache[file.newUri.toString()] = this.attachmentCache[file.oldUri.toString()];
				delete this.attachmentCache[file.oldUri.toString()];
			}
		}
	}

	/**
	 * take image from cache and place into new metadata for the cell
	 * @param notebookUri uri of the notebook currently being edited
	 * @param cellFragment fragment of the cell currently being edited
	 * @param currFilename filename of the image being pulled into the cell
	 * @param metadata metadata of the cell currently being edited
	 */
	private addImageToCellMetadata(notebookUri: string, cellFragment: string, currFilename: string, metadata: { [key: string]: any }) {
		metadata.custom.attachments[currFilename] = this.attachmentCache[notebookUri][cellFragment][currFilename];
		delete this.attachmentCache[notebookUri][cellFragment][currFilename];
	}

	/**
	 * remove attachment from metadata and add it to the cache
	 * @param notebookUri uri of the notebook currently being edited
	 * @param cellFragment fragment of the cell currently being edited
	 * @param currFilename filename of the image being pulled into the cell
	 * @param metadata metadata of the cell currently being edited
	 */
	private cacheAttachment(notebookUri: string, cellFragment: string, currFilename: string, metadata: { [key: string]: any }): void {
		if (!this.attachmentCache[notebookUri]) {
			this.attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: this.getMetadataAttachment(metadata, currFilename) } };
		} else if (!this.attachmentCache[notebookUri][cellFragment]) {
			this.attachmentCache[notebookUri][cellFragment] = { [currFilename]: this.getMetadataAttachment(metadata, currFilename) };
		} else {
			this.attachmentCache[notebookUri][cellFragment][currFilename] = this.getMetadataAttachment(metadata, currFilename);
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
	 * check if there is an entry in the cache for the cell being edited/cleaned
	 * @param notebookUri uri of the notebook currently being edited
	 * @param cellFragment fragment of the cell currently being edited
	 * @returns boolean representing validity of cache entry
	 */
	private checkCacheValidity(notebookUri: string, cellFragment: string): boolean {
		if (!this.attachmentCache[notebookUri]) {
			return false;
		} else if (!this.attachmentCache[notebookUri][cellFragment]) {
			return false;
		}
		return true;
	}

	/**
	 * given metadata from a cell, cache every image (used in cases with no image links in markdown source)
	 * @param metadata metadata for a cell with no images in markdown source
	 * @param notebookUri uri for the notebook being edited
	 * @param cellFragment fragment of cell being edited
	 */
	private cacheAllImages(metadata: { [key: string]: any }, notebookUri: string, cellFragment: string): void {
		for (const currFilename of Object.keys(metadata.custom.attachments)) {
			if (!this.attachmentCache[notebookUri]) {
				this.attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: metadata.custom.attachments[currFilename] } };
			} else if (!this.attachmentCache[notebookUri][cellFragment]) {
				this.attachmentCache[notebookUri][cellFragment] = { [currFilename]: metadata.custom.attachments[currFilename] };
			} else {
				this.attachmentCache[notebookUri][cellFragment][currFilename] = metadata.custom.attachments[currFilename];
			}
			delete metadata.custom.attachments[currFilename];
		}
	}

	/**
	 * pass in all of the markdown source code, and get a dictionary of all images referenced in the markdown. keys are image filenames, values are render state
	 * @param source the markdown source code for the cell, formatted as a string
	 * @returns a dictionary with all markdown names and a boolean representing their rendering state (true = will render properly // false = won't render or not checked yet)
	 */
	private getAttachmentNames(source: string) {
		const filenames: any = {};
		const re = /!\[.*?\]\(attachment:(?<filename>.*?)\)/gm;

		let match;
		while ((match = re.exec(source))) {
			if (match.groups?.filename) {
				filenames[match.groups?.filename] = false;
			}
		}
		return filenames;
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}

export function notebookAttachmentCleanerSetup(context: vscode.ExtensionContext) {

	const enabled = vscode.workspace.getConfiguration('ipynb').get('experimental.pasteImages.enabled', false);
	if (!enabled) {
		return;
	}

	const cleaner = new AttachmentCleaner();
	context.subscriptions.push(cleaner);
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

class AttachmentCleaner {

	// FIXME: potentially just turn this into a map
	attachmentCache:
		{ [key: string/*uri*/]: { [key: string/*cellFragment*/]: { [key: string/*filename*/]: { [key: string/*mime*/]: string/*b64*/ } } } } = {};

	/**
	 * take in a NotebookDocumentChangeEvent, and clean the attachment data for the cell(s) that have had their markdown source code changed
	 * @param e NotebookDocumentChangeEvent from the onDidChangeNotebookDocument listener
	 */
	cleanNotebookAttachments(e: vscode.NotebookDocumentChangeEvent) {
		if (e.notebook.isClosed) {
			return;
		}

		for (const currentChange of e.cellChanges) {
			// undefined is a specific case including workspace edit etc
			if (currentChange.document === undefined || currentChange.document.languageId !== 'markdown') { //document lang ID
				continue;
			}

			const updateMetadata: { [key: string]: any } = { ...currentChange.cell.metadata };
			const cellFragment = currentChange.cell.document.uri.fragment;
			const notebookUri = e.notebook.uri.toString();
			const mkdnSource = currentChange.document?.getText();

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
					if (this.attachmentCache[notebookUri][cellFragment] && Object.keys(this.attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
						this.addImageToCellMetadata(notebookUri, cellFragment, currFilename, updateMetadata);
					}
					//TODO: ELSE: diagnostic squiggle, image not present
				}
			}

			if (!this.equals(updateMetadata, currentChange.cell.metadata)) {
				const metadataEdit = vscode.NotebookEdit.updateCellMetadata(currentChange.cell.index, updateMetadata);
				const workspaceEdit = new vscode.WorkspaceEdit();
				workspaceEdit.set(e.notebook.uri, [metadataEdit]);
				vscode.workspace.applyEdit(workspaceEdit);
			}
		} // for loop of all changes
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

	// from https://github.com/microsoft/vscode/blob/43ae27a30e7b5e8711bf6b218ee39872ed2b8ef6/src/vs/base/common/objects.ts#L117
	private equals(one: any, other: any): boolean {
		if (one === other) {
			return true;
		}
		if (one === null || one === undefined || other === null || other === undefined) {
			return false;
		}
		if (typeof one !== typeof other) {
			return false;
		}
		if (typeof one !== 'object') {
			return false;
		}
		if ((Array.isArray(one)) !== (Array.isArray(other))) {
			return false;
		}

		let i: number;
		let key: string;

		if (Array.isArray(one)) {
			if (one.length !== other.length) {
				return false;
			}
			for (i = 0; i < one.length; i++) {
				if (!this.equals(one[i], other[i])) {
					return false;
				}
			}
		} else {
			const oneKeys: string[] = [];

			for (key in one) {
				oneKeys.push(key);
			}
			oneKeys.sort();
			const otherKeys: string[] = [];
			for (key in other) {
				otherKeys.push(key);
			}
			otherKeys.sort();
			if (!this.equals(oneKeys, otherKeys)) {
				return false;
			}
			for (i = 0; i < oneKeys.length; i++) {
				if (!this.equals(one[oneKeys[i]], other[oneKeys[i]])) {
					return false;
				}
			}
		}
		return true;
	}
}

class DelayedTrigger implements vscode.Disposable {
	private timerId: NodeJS.Timeout | undefined;

	/**
	 * Delay calling the function in callback for a predefined amount of time.
	 * @param callback : Callback that should be called after some time has passed.
	 * @param ms : Amount of time after the last trigger that the call to callback
	 *             should be delayed.
	 */
	constructor(
		private readonly callback: (...args: any[]) => void,
		private readonly ms: number,
	) { }

	public trigger(...args: unknown[]): void {
		if (this.timerId) {
			clearTimeout(this.timerId);
		}

		this.timerId = setTimeout(() => {
			this.callback(...args);
		}, this.ms);
	}

	public dispose(): void {
		if (this.timerId) {
			clearTimeout(this.timerId);
		}
	}
}

export function notebookAttachmentCleanerSetup(context: vscode.ExtensionContext) {

	const enabled = vscode.workspace.getConfiguration('ipynb').get('experimental.pasteImages.enabled', false);
	if (!enabled) {
		return;
	}

	const cleaner = new AttachmentCleaner();
	// const changeList: (vscode.NotebookDocumentChangeEvent|vscode.NotebookDocument)[] = [];

	const delayTrigger = new DelayedTrigger(
		(e) => {
			cleaner.cleanNotebookAttachments(e);
			// for(const change in changeList){
			// 	if ( typeof change === ){

			// 	}
			// }
		},
		500
	);

	context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument(e => {
		// changeList.push(e);
		delayTrigger.trigger(e);
	}));

	context.subscriptions.push(vscode.workspace.onDidCloseNotebookDocument(e => {
		// changeList.push(e);
		cleaner.deleteCacheUri(e);
	}));

	context.subscriptions.push(vscode.workspace.onDidRenameFiles(e => {
		cleaner.renameCacheUri(e);
	}));
}

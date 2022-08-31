/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/*	Format:
 *	attachmentCache : { notebookUri : { cellFragment : { filename : { mime : b64 } } } }
 */
const attachmentCache: { [key: string]: any } = {};

// class AttachmentCleaner {
// 	// TODO: everything
// 	attachmentCache: { [key: string]: any } = {};

// 	deleteCacheUri(e: vscode.NotebookDocument) {
// 		for (const entry of Object.keys(this.attachmentCache)) {
// 			if (entry === e.uri.toString()) {
// 				delete this.attachmentCache[entry];
// 			}
// 		}
// 	}

// 	renameCacheUri(e: vscode.FileRenameEvent) {
// 		const re = /\.ipynb$/;
// 		for (const file of e.files) {
// 			if (!re.exec(file.oldUri.toString())) {
// 				continue;
// 			}
// 			if (Object.keys(this.attachmentCache).includes(file.oldUri.toString())) {
// 				this.attachmentCache[file.newUri.toString()] = this.attachmentCache[file.oldUri.toString()];
// 				delete this.attachmentCache[file.oldUri.toString()];
// 			}
// 		}
// 	}

// 	cleanNotebookAttachments(e: vscode.NotebookDocumentChangeEvent) {

// 		// return if there are no sources changes in event
// 		if (!e.cellChanges.length) {
// 			return;
// 		}

// 		// *should* only iterate once
// 		for (const currentChange of e.cellChanges) {
// 			// undefined is a specific case including workspace edit etc
// 			if(currentChange.document === undefined){
// 				continue;
// 			}

// 			const updateMetadata: { [key: string]: any } = { ...currentChange.cell.metadata };
// 			const cellFragment = currentChange.cell.document.uri.fragment;
// 			const notebookUri = e.notebook.uri.toString();
// 			const mkdnSource = currentChange.document?.getText();

// 			if (!mkdnSource) { // cell with 0 content
// 				this.cacheAllImages(updateMetadata, notebookUri, cellFragment);
// 			} else {
// 				const markdownAttachments = this.getAttachmentNames(mkdnSource);
// 				if (!markdownAttachments) {
// 					this.cacheAllImages(updateMetadata, notebookUri, cellFragment);
// 				}

// 				if (!updateMetadata.custom?.attachments) { // no attachments to begin with
// 					// iterate second through the markdown names, pull in any cached images that we might need based on a paste, undo, etc
// 					if (this.attachmentCache[notebookUri] && this.attachmentCache[notebookUri][cellFragment]) {
// 						for (const currFilename of Object.keys(markdownAttachments)) {
// 							// check if image IS inside cache
// 							if (Object.keys(this.attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
// 								updateMetadata.custom.attachments[currFilename] = this.attachmentCache[notebookUri][cellFragment][currFilename];
// 								delete this.attachmentCache[notebookUri][cellFragment][currFilename];
// 							}
// 							//TODO: ELSE: diagnostic squiggle, image not present

// 						}
// 					}
// 				} else {
// 					// iterate first through the attachments stored in cell metadata
// 					for (const currFilename of Object.keys(updateMetadata.custom.attachments)) {
// 						// means markdown reference is present in the metadata, rendering will work properly
// 						// therefore, we don't need to check it in the next loop either
// 						if (currFilename in markdownAttachments) {
// 							markdownAttachments[currFilename] = true;
// 							continue;
// 						} else {
// 							if (!this.attachmentCache[notebookUri]) {
// 								this.attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: updateMetadata.custom.attachments[currFilename] } };
// 							} else if (!this.attachmentCache[notebookUri][cellFragment]) {
// 								this.attachmentCache[notebookUri][cellFragment] = { [currFilename]: updateMetadata.custom.attachments[currFilename] };
// 							} else {
// 								this.attachmentCache[notebookUri][cellFragment][currFilename] = updateMetadata.custom.attachments[currFilename];
// 							}
// 							delete updateMetadata.custom.attachments[currFilename];
// 						}
// 					}

// 					// iterate second through the markdown names, pull in any cached images that we might need based on a paste, undo, etc
// 					for (const currFilename of Object.keys(markdownAttachments)) {
// 						// if image is addressed already --> continue, attachment will function as normal
// 						if (markdownAttachments[currFilename]) {
// 							continue;
// 						}

// 						// if image is referenced in mkdn && image is not in metadata -> check if image IS inside cache
// 						if (this.attachmentCache[notebookUri][cellFragment] && Object.keys(this.attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
// 							updateMetadata.custom.attachments[currFilename] = this.attachmentCache[notebookUri][cellFragment][currFilename];
// 							delete this.attachmentCache[notebookUri][cellFragment][currFilename];
// 						}
// 						//TODO: ELSE: diagnostic squiggle, image not present

// 					}
// 				}
// 			}
// 			const metadataEdit = vscode.NotebookEdit.updateCellMetadata(currentChange.cell.index, updateMetadata);
// 			const workspaceEdit = new vscode.WorkspaceEdit();
// 			workspaceEdit.set(e.notebook.uri, [metadataEdit]);
// 			vscode.workspace.applyEdit(workspaceEdit);
// 		} // for loop of all changes
// 	}

// 	cacheAllImages(metadata: { [key: string]: any }, notebookUri: string, cellFragment: string) {
// 		for (const currFilename of Object.keys(metadata.custom.attachments)) {
// 			if (!this.attachmentCache[notebookUri]) {
// 				this.attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: metadata.custom.attachments[currFilename] } };
// 			} else if (!this.attachmentCache[notebookUri][cellFragment]) {
// 				this.attachmentCache[notebookUri][cellFragment] = { [currFilename]: metadata.custom.attachments[currFilename] };
// 			} else {
// 				this.attachmentCache[notebookUri][cellFragment][currFilename] = metadata.custom.attachments[currFilename];
// 			}
// 			delete metadata.custom.attachments[currFilename];
// 		}
// 	}

// 	getAttachmentNames(source: string) {
// 		const filenames: any = {};
// 		const re = /!\[.*?\]\(attachment:(?<filename>.*?)\)/gm;

// 		let match;
// 		while ((match = re.exec(source))) {
// 			if (match.groups?.filename) {
// 				filenames[match.groups?.filename] = false;
// 			}
// 		}
// 		return filenames;
// 	}

// }

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

function deleteCacheUri(e: vscode.NotebookDocument) {
	for (const entry of Object.keys(attachmentCache)) {
		if (entry === e.uri.toString()) {
			delete attachmentCache[entry];
		}
	}
}

function renameCacheUri(e: vscode.FileRenameEvent) {
	const re = /\.ipynb$/;
	for (const file of e.files) {
		if (!re.exec(file.oldUri.toString())) {
			continue;
		}
		if (Object.keys(attachmentCache).includes(file.oldUri.toString())) {
			attachmentCache[file.newUri.toString()] = attachmentCache[file.oldUri.toString()];
			delete attachmentCache[file.oldUri.toString()];
		}
	}
}

function cleanNotebookAttachments(e: vscode.NotebookDocumentChangeEvent) {

	// return if there are no sources changes in event
	if (!e.cellChanges.length) {
		return;
	}

	// *should* only iterate once
	for (const currentChange of e.cellChanges) {
		// undefined is a specific case including workspace edit etc
		if (currentChange.document === undefined) {
			continue;
		}

		const updateMetadata: { [key: string]: any } = { ...currentChange.cell.metadata };
		const cellFragment = currentChange.cell.document.uri.fragment;
		const notebookUri = e.notebook.uri.toString();
		const mkdnSource = currentChange.document?.getText();

		if (!mkdnSource) { // cell with 0 content
			cacheAllImages(updateMetadata, notebookUri, cellFragment);
		} else {
			const markdownAttachments = getAttachmentNames(mkdnSource);
			if (!markdownAttachments) {
				cacheAllImages(updateMetadata, notebookUri, cellFragment);
			}

			if (!updateMetadata.custom?.attachments) { // no attachments to begin with
				// iterate second through the markdown names, pull in any cached images that we might need based on a paste, undo, etc
				if (attachmentCache[notebookUri] && attachmentCache[notebookUri][cellFragment]) {
					for (const currFilename of Object.keys(markdownAttachments)) {
						// check if image IS inside cache
						if (Object.keys(attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
							updateMetadata.custom.attachments[currFilename] = attachmentCache[notebookUri][cellFragment][currFilename];
							delete attachmentCache[notebookUri][cellFragment][currFilename];
						}
						//TODO: ELSE: diagnostic squiggle, image not present

					}
				}
			} else {
				// iterate first through the attachments stored in cell metadata
				for (const currFilename of Object.keys(updateMetadata.custom.attachments)) {
					// means markdown reference is present in the metadata, rendering will work properly
					// therefore, we don't need to check it in the next loop either
					if (currFilename in markdownAttachments) {
						markdownAttachments[currFilename] = true;
						continue;
					} else {
						if (!attachmentCache[notebookUri]) {
							attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: updateMetadata.custom.attachments[currFilename] } };
						} else if (!attachmentCache[notebookUri][cellFragment]) {
							attachmentCache[notebookUri][cellFragment] = { [currFilename]: updateMetadata.custom.attachments[currFilename] };
						} else {
							attachmentCache[notebookUri][cellFragment][currFilename] = updateMetadata.custom.attachments[currFilename];
						}
						delete updateMetadata.custom.attachments[currFilename];
					}
				}

				// iterate second through the markdown names, pull in any cached images that we might need based on a paste, undo, etc
				for (const currFilename of Object.keys(markdownAttachments)) {
					// if image is addressed already --> continue, attachment will function as normal
					if (markdownAttachments[currFilename]) {
						continue;
					}

					// if image is referenced in mkdn && image is not in metadata -> check if image IS inside cache
					if (attachmentCache[notebookUri][cellFragment] && Object.keys(attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
						updateMetadata.custom.attachments[currFilename] = attachmentCache[notebookUri][cellFragment][currFilename];
						delete attachmentCache[notebookUri][cellFragment][currFilename];
					}
					//TODO: ELSE: diagnostic squiggle, image not present

				}
			}
		}
		const metadataEdit = vscode.NotebookEdit.updateCellMetadata(currentChange.cell.index, updateMetadata);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(e.notebook.uri, [metadataEdit]);
		vscode.workspace.applyEdit(workspaceEdit);
	} // for loop of all changes
}

function cacheAllImages(metadata: { [key: string]: any }, notebookUri: string, cellFragment: string) {
	for (const currFilename of Object.keys(metadata.custom.attachments)) {
		if (!attachmentCache[notebookUri]) {
			attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: metadata.custom.attachments[currFilename] } };
		} else if (!attachmentCache[notebookUri][cellFragment]) {
			attachmentCache[notebookUri][cellFragment] = { [currFilename]: metadata.custom.attachments[currFilename] };
		} else {
			attachmentCache[notebookUri][cellFragment][currFilename] = metadata.custom.attachments[currFilename];
		}
		delete metadata.custom.attachments[currFilename];
	}
}

function getAttachmentNames(source: string) {
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

export function notebookAttachmentCleanerSetup(context: vscode.ExtensionContext) {

	const cleaner = new AttachmentCleaner();

	const delayTrigger = new DelayedTrigger(
		(e) => {
			cleaner.cleanNotebookAttachments(e);
		},
		500
	);

	context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument(e => {
		delayTrigger.trigger(e);
	}));

	context.subscriptions.push(vscode.workspace.onDidCloseNotebookDocument(e => {
		cleaner.deleteCacheUri(e);
	}));

	context.subscriptions.push(vscode.workspace.onDidRenameFiles(e => {
		cleaner.renameCacheUri(e);
	}));
}

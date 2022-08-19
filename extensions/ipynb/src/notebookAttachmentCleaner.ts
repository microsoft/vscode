/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* 	TODO: LIST, FIXME: == priority
 *	[]  FIXME: functionality
 *		[X] add case for deleting all markdown in a cell --> cache all images
 *		[X] add case where there are no file names within the markdown
 *		[X] debounce
 *
 *	[] bugs
 *		[X] sometimes in a new cell it does a weird thing and pastes image-2 first... weird edge case only with new cells
 *
 *	[] general cleaning
 *		[] see about cleaning things so the code is a bit more readable?
 *		[] stress test -- how many images etc
 *
 *	[] cache notebook URI complications
 *		[X] bring ext context into this to have both onDidClose and onDidChange running
 *		[X] setup onDidClose to delete cache entries per URI
 *		[] some way to handle renaming of files -- vscode.workspace.onDidRenameFiles()
 *
 *	[] stretch goals
 *		[] problem matcher for if the image does not exist in JSON or
 * close -> clean diagnostic collection
 * diagnostic collection -- vsc ext API
 *
 */

import * as vscode from 'vscode';
import { clearTimeout, setTimeout } from 'timers';

/*	Format:
 *	attachmentCache : { notebookUri : { cellFragment : { filename : { mime : b64 } } } }
 */
const attachmentCache: any = [];

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

	// return if there are no content changes to the cell source
	if (!e.cellChanges.length || e.cellChanges[0].document === undefined) {
		return;
	}

	for (const currentChange of e.cellChanges) {
		const currentCell = currentChange.cell;
		const cellFragment = currentCell.document.uri.fragment;
		const notebookUri = e.notebook.uri.toString();
		const mkdnSource = currentChange.document?.getText();


		if (!mkdnSource) { // cell with 0 content
			cacheAllImages(currentCell, notebookUri, cellFragment);
		} else {
			const markdownAttachments = getAttachmentNames(mkdnSource);
			if (!markdownAttachments) {
				cacheAllImages(currentCell, notebookUri, cellFragment);
			}

			if (!currentCell.metadata.custom?.attachments) { // no attachments to begin with
				// iterate second through the markdown names, pull in any cached images that we might need based on a paste, undo, etc
				if (attachmentCache[notebookUri] && attachmentCache[notebookUri][cellFragment]) {
					for (const currFilename of Object.keys(markdownAttachments)) {
						// check if image IS inside cache
						if (Object.keys(attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
							currentCell.metadata.custom.attachments[currFilename] = attachmentCache[notebookUri][cellFragment][currFilename];
							delete attachmentCache[notebookUri][cellFragment][currFilename];
						}
						//TODO: ELSE: red squiggle, image not present

					}
				}
			} else {
				// iterate first through the attachments stored in cell metadata
				for (const currFilename of Object.keys(currentCell.metadata.custom.attachments)) {
					// means markdown reference is present in the metadata, rendering will work properly
					// therefore, we don't need to check it in the next loop either
					if (currFilename in markdownAttachments) {
						markdownAttachments[currFilename] = true;
						continue;
					} else {
						if (!attachmentCache[notebookUri]) {
							attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: currentCell.metadata.custom.attachments[currFilename] } };
						} else if (!attachmentCache[notebookUri][cellFragment]) {
							attachmentCache[notebookUri][cellFragment] = { [currFilename]: currentCell.metadata.custom.attachments[currFilename] };
						} else {
							attachmentCache[notebookUri][cellFragment][currFilename] = currentCell.metadata.custom.attachments[currFilename];
						}
						delete currentCell.metadata.custom.attachments[currFilename];
					}
				}

				// iterate second through the markdown names, pull in any cached images that we might need based on a paste, undo, etc
				for (const currFilename of Object.keys(markdownAttachments)) {
					// if image is addressed already --> continue, attachment will function as normal
					if (markdownAttachments[currFilename]) {
						continue;
					}

					// if image is referenced in mkdn -> image is not in metadata -> check if image IS inside cache
					if (Object.keys(attachmentCache[notebookUri][cellFragment]).includes(currFilename)) {
						currentCell.metadata.custom.attachments[currFilename] = attachmentCache[notebookUri][cellFragment][currFilename];
						delete attachmentCache[notebookUri][cellFragment][currFilename];
					}
					//TODO: ELSE: red squiggle, image not present

				}
			}
		}
		const metadataEdit = vscode.NotebookEdit.updateCellMetadata(currentCell.index, currentCell.metadata);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(e.notebook.uri, [metadataEdit]);
		vscode.workspace.applyEdit(workspaceEdit);
	} // for loop of all changes
}

function cacheAllImages(currentCell: vscode.NotebookCell, notebookUri: string, cellFragment: string) {
	for (const currFilename of Object.keys(currentCell.metadata.custom.attachments)) {
		if (!attachmentCache[notebookUri]) {
			attachmentCache[notebookUri] = { [cellFragment]: { [currFilename]: currentCell.metadata.custom.attachments[currFilename] } };
		} else if (!attachmentCache[notebookUri][cellFragment]) {
			attachmentCache[notebookUri][cellFragment] = { [currFilename]: currentCell.metadata.custom.attachments[currFilename] };
		} else {
			attachmentCache[notebookUri][cellFragment][currFilename] = currentCell.metadata.custom.attachments[currFilename];
		}
		delete currentCell.metadata.custom.attachments[currFilename];
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

	const delayTrigger = new DelayedTrigger(
		(e) => {
			cleanNotebookAttachments(e);
		},
		500
	);

	context.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument(e => {
		delayTrigger.trigger(e);
	}));

	context.subscriptions.push(vscode.workspace.onDidCloseNotebookDocument(e => {
		deleteCacheUri(e);
	}));

	context.subscriptions.push(vscode.workspace.onDidRenameFiles(e => {
		renameCacheUri(e);
	}));
}

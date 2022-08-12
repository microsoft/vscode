/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';


/*	Format:
 *	attachmentCache : { uri.toString() : {cellIndex : {filename : {mime : b64} } } }
 */
const attachmentCache: any = [];

export function notebookAttachmentCleanerSetup() {
	return vscode.workspace.onDidChangeNotebookDocument(e => {
		// TODO: debounce
		cleanNotebookAttachments(e);
	});
}

function cleanNotebookAttachments(e: vscode.NotebookDocumentChangeEvent) {
	// console.log('trigger');

	// return if there are no content changes to the cell source
	if (!e.cellChanges || e.cellChanges[0].document === undefined) {
		return;
	}

	for (const currentChange of e.cellChanges) {
		const currentCell = currentChange.cell;
		const mkdnSource = currentChange.document?.getText();

		if (!mkdnSource) { // cell with 0 content, ie ''

		} else {
			const markdownAttachments = getAttachmentNames(mkdnSource);
			if (!currentCell.metadata.custom.attachments) { // TODO: no attachments to begin with... return?

			} else {
				// iterate first through the attachments stored in cell metadata
				for (const currFilename of Object.keys(currentCell.metadata.custom.attachments)) {
					// means markdown reference is present in the metadata, rendering will work properly
					// therefore, we don't need to check it in the next loop either
					if (currFilename in markdownAttachments) {
						markdownAttachments[currFilename] = true;
						continue;
					} else {
						if (!attachmentCache[e.notebook.uri.toString()]) {
							attachmentCache[e.notebook.uri.toString()] = { [currFilename]: currentCell.metadata.custom.attachments[currFilename] };
						}
						attachmentCache[e.notebook.uri.toString()][currFilename] = currentCell.metadata.custom.attachments[currFilename];
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
					if (Object.keys(attachmentCache[e.notebook.uri.toString()]).includes(currFilename)) {
						currentCell.metadata.custom.attachments[currFilename] = attachmentCache[e.notebook.uri.toString()][currFilename];
						delete attachmentCache[e.notebook.uri.toString()][currFilename];
						// TODO: delete from cache
					} else {
						// image is broke, poor user, nothing we can do.
						// throw error mayb? syntax highlighting? red squiggly? problem area? meh.
						// TODO: problem matcher thing? stretch goal
					}
				}
			}
		}
		const metadataEdit = vscode.NotebookEdit.updateCellMetadata(currentCell.index, currentCell.metadata);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(e.notebook.uri, [metadataEdit]);
		vscode.workspace.applyEdit(workspaceEdit);
	} // for loop of all changes
	// console.log('complete');
} // clean()

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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as interfaces from './interfaces';
import { DocumentMergeConflict } from './documentMergeConflict';

const startMarker = '<<<<<<<';
const splitterMarker = '=======';
const endMarker = '>>>>>>>';

interface IPartialMergeConflictDescriptor {
	currentHeader: vscode.Range;
	splitter?: vscode.Range;
	incomingFooter?: vscode.Range;
}

export class MergeConflictParser {

	static scanDocument(document: vscode.TextDocument): interfaces.IDocumentMergeConflict[] {

		// Scan each line in the document, we already know there is atleast a <<<<<<< and
		// >>>>>> marker within the document, we need to group these into conflict ranges.

		let currentConflict: IPartialMergeConflictDescriptor | null = null;

		const conflictDescriptors: interfaces.IDocumentMergeConflictDescriptor[] = [];

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);

			if (line.text.startsWith(startMarker)) {
				if (currentConflict !== null) {
					// Error, we should not see a startMarker before we've seen an endMarker
					currentConflict = null;
					break;
				}

				currentConflict = {
					currentHeader: line.range
				};
			}
			else if (line.text.startsWith(splitterMarker)) {

				if (currentConflict === null) {
					continue; // Ignore
				}

				currentConflict.splitter = line.range;
			}
			else if (line.text.startsWith(endMarker)) {
				if (currentConflict === null) {
					continue; // Ignore
				}

				currentConflict.incomingFooter = line.range;

				let completeDescriptor = MergeConflictParser.completePartialMergeDescriptor(currentConflict);

				if (completeDescriptor !== null) {
					conflictDescriptors.push(completeDescriptor);
				}

				currentConflict = null;
			}
		}

		return conflictDescriptors
			.filter(Boolean)
			.map(descriptor => new DocumentMergeConflict(document, descriptor));
	}

	private static completePartialMergeDescriptor(partial: IPartialMergeConflictDescriptor): interfaces.IDocumentMergeConflictDescriptor | null {
		// Assume that descriptor.current.header, descriptor.incoming.header and descriptor.spliiter
		// have valid ranges, fill in content and total ranges from these parts.

		if (!partial.currentHeader || !partial.splitter || !partial.incomingFooter) {
			return null;
		}

		return {
			current: {
				header: partial.currentHeader,
				// Current content is range between header and splitter
				content: new vscode.Range(partial.currentHeader.end, partial.splitter.start),
				name: ''
			},
			splitter: partial.splitter,
			incoming: {
				header: partial.incomingFooter,
				// Incoming content is range between splitter and footer
				content: new vscode.Range(partial.splitter.end, partial.incomingFooter.end),
				name: ''
			},
			// Entire range is between current header start and incoming header end
			range: new vscode.Range(partial.currentHeader.start, partial.incomingFooter.end)
		};
	}

	static containsConflict(document: vscode.TextDocument): boolean {
		if (!document) {
			return false;
		}

		// TODO: Ask source control if the file contains a conflict
		let text = document.getText();
		return text.includes('<<<<<<<') && text.includes('>>>>>>>');
	}
}

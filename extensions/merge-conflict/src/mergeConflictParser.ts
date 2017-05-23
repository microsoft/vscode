/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as interfaces from './interfaces';
import { DocumentMergeConflict } from './documentMergeConflict';

const startMarker = '<<<<<<< ';
const splitterMarker = '=======';
const endMarker = '>>>>>>> ';

interface IPartialMergeConflictDescriptor {
	currentHeader: vscode.TextLine;
	splitter?: vscode.TextLine;
	incomingFooter?: vscode.TextLine;
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

				currentConflict = { currentHeader: line };
			}
			else if (line.text.startsWith(splitterMarker)) {

				if (currentConflict === null) {
					continue; // Ignore
				}

				currentConflict.splitter = line;
			}
			else if (line.text.startsWith(endMarker)) {
				if (currentConflict === null) {
					continue; // Ignore
				}

				currentConflict.incomingFooter = line;

				let completeDescriptor = MergeConflictParser.completePartialMergeDescriptor(document, currentConflict);

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

	private static completePartialMergeDescriptor(document: vscode.TextDocument, partial: IPartialMergeConflictDescriptor): interfaces.IDocumentMergeConflictDescriptor | null {
		// Validate we have valid ranges
		if (!partial.currentHeader || !partial.splitter || !partial.incomingFooter) {
			return null;
		}

		// Assume that descriptor.current.header, descriptor.incoming.header and descriptor.spliiter
		// have valid ranges, fill in content and total ranges from these parts.
		// NOTE: We need to shift the decortator range back one character so the splitter does not end up with
		// two decoration colors (current and splitter), if we take the new line from the content into account
		// the decorator will wrap to the next line.
		return {
			current: {
				header: partial.currentHeader.range,
				decoratorContent: new vscode.Range(
					partial.currentHeader.rangeIncludingLineBreak.end,
					MergeConflictParser.shiftBackOneCharacter(document, partial.splitter.range.start)),
				// Current content is range between header (shifted for linebreak) and splitter start
				content: new vscode.Range(
					partial.currentHeader.rangeIncludingLineBreak.end,
					partial.splitter.range.start),
				name: document.getText(partial.currentHeader.range).substring(startMarker.length)
			},
			splitter: partial.splitter.range,
			incoming: {
				header: partial.incomingFooter.range,
				decoratorContent: new vscode.Range(
					partial.splitter.rangeIncludingLineBreak.end,
					MergeConflictParser.shiftBackOneCharacter(document, partial.incomingFooter.range.start)),
				// Incoming content is range between splitter (shifted for linebreak) and footer start
				content: new vscode.Range(
					partial.splitter.rangeIncludingLineBreak.end,
					partial.incomingFooter.range.start),
				name: document.getText(partial.incomingFooter.range).substring(endMarker.length)
			},
			// Entire range is between current header start and incoming header end (including line break)
			range: new vscode.Range(partial.currentHeader.range.start, partial.incomingFooter.rangeIncludingLineBreak.end)
		};
	}

	static containsConflict(document: vscode.TextDocument): boolean {
		if (!document) {
			return false;
		}

		let text = document.getText();
		return text.includes(startMarker) && text.includes(endMarker);
	}

	private static shiftBackOneCharacter(document: vscode.TextDocument, range: vscode.Position): vscode.Position {
		let line = range.line;
		let character = range.character - 1;

		if (character < 0) {
			line--;
			character = document.lineAt(line).range.end.character;
		}

		return new vscode.Position(line, character);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as interfaces from './interfaces';
import { DocumentMergeConflict } from './documentMergeConflict';
import * as vm from 'vm';

export class MergeConflictParser {

	static scanDocument(document: vscode.TextDocument): interfaces.IDocumentMergeConflict[] {

		// Conflict matching regex, comments are in the format of "description - [group index] group name"
		// Premise is: Match the current change (<<<<<<), match anything up to the splitter (======) then
		// match anything up to the incoming change (>>>>>>), this leaves some oddities with newlines not being
		// pulled into the "body" of each change, DocumentMergeConflict.applyEdit will deal with these cases
		// and append newlines when needed

		const conflictMatcher = new RegExp([
			/(^<<<<<<<\s(.+)\r?\n)/,             // "Current" conflict header - [1] entire line, [2] name
			/([\s\S]*?)/,                        // "Current" conflict body - [3] body text
			/(^=======\r?\n)/,                   // Splitter - [4] entire line
			/([\s\S]*?)/,                        // Incoming conflict body - [5]
			/(^>>>>>>>\s(.+)\r?\n)/              // Incoming conflict header - [6] entire line, [7] name
		].map(r => r.source).join(''), 'mg');

		const offsetGroups = [1, 3, 4, 5, 6]; // Skip inner matches when calculating length

		let text = document.getText();
		let sandboxScope = {
			result: [],
			conflictMatcher,
			text: text
		};
		const context = vm.createContext(sandboxScope);
		const script = new vm.Script(`
			let match;
			while (match = conflictMatcher.exec(text)) {
				// Ensure we don't get stuck in an infinite loop
				if (match.index === conflictMatcher.lastIndex) {
					conflictMatcher.lastIndex++;
				}

				result.push(match);
			}`);

		try {
			// If the regex takes longer than 1s consider it dead
			script.runInContext(context, { timeout: 1000 });
		}
		catch (ex) {
			return [];
		}

		return sandboxScope.result.map(match => new DocumentMergeConflict(document, MergeConflictParser.matchesToDescriptor(document, match, offsetGroups)));
	}

	static containsConflict(document: vscode.TextDocument): boolean {
		if (!document) {
			return false;
		}

		// TODO: Ask source control if the file contains a conflict
		let text = document.getText();
		return text.includes('<<<<<<<') && text.includes('>>>>>>>');
	}

	static matchesToDescriptor(document: vscode.TextDocument, match: RegExpExecArray, offsets?: number[]): interfaces.IDocumentMergeConflictDescriptor {

		var item: interfaces.IDocumentMergeConflictDescriptor = {
			range: new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length)),
			current: {
				name: match[2],
				header: this.getMatchPositions(document, match, 1, offsets),
				content: this.getMatchPositions(document, match, 3, offsets),
			},
			splitter: this.getMatchPositions(document, match, 4, offsets),
			incoming: {
				name: match[9],
				header: this.getMatchPositions(document, match, 6, offsets),
				content: this.getMatchPositions(document, match, 5, offsets),
			}
		};

		return item;
	}


	static getMatchPositions(document: vscode.TextDocument, match: RegExpExecArray, groupIndex: number, offsetGroups?: number[]): vscode.Range {
		// Javascript doesnt give of offsets within the match, we need to calculate these
		// based of the prior groups, skipping nested matches (yuck).
		if (!offsetGroups) {
			offsetGroups = match.map((i, idx) => idx);
		}

		let start = match.index;

		for (var i = 0; i < offsetGroups.length; i++) {
			let value = offsetGroups[i];

			if (value >= groupIndex) {
				break;
			}

			start += match[value] !== undefined ? match[value].length : 0;
		}

		const groupMatch = match[groupIndex];
		let targetMatchLength = groupMatch !== undefined ? groupMatch.length : -1;
		let end = (start + targetMatchLength);

		if (groupMatch !== undefined) {
			// Move the end up if it's capped by a trailing \r\n, this is so regions don't expand into
			// the line below, and can be "pulled down" by editing the line below
			if (match[groupIndex].lastIndexOf('\n') === targetMatchLength - 1) {
				end--;

				// .. for windows encodings of new lines
				if (match[groupIndex].lastIndexOf('\r') === targetMatchLength - 2) {
					end--;
				}
			}
		}

		return new vscode.Range(document.positionAt(start), document.positionAt(end));
	}

}

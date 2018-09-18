/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as assert from 'assert';
import { applyLineChanges } from "../staging";

suite("git.staging", () => {
	suite("applyLineChanges", () => {
		suite("single changes", () => {
			testSingleChange("insert start", "OOOO", "MOOOO", createLineChange(0, 0, 1, 1), patternToText("MOOOO", "11234"));
			testSingleChange("insert middle", "OOOO", "OOMOO", createLineChange(2, 0, 3, 3), patternToText("OOMOO", "12334"));
			testSingleChange("insert end", "OOOO", "OOOOM", createLineChange(4, 0, 5, 5), patternToText("OOOOM"));

			testSingleChange("modify start", "OOOO", "MOOO", createLineChange(1, 1, 1, 1), patternToText("MOOO"));
			testSingleChange("modify middle", "OOOO", "OMMO", createLineChange(2, 3, 2, 3), patternToText("OMMO"));
			testSingleChange("modify end", "OOOO", "OOMM", createLineChange(3, 4, 3, 4), patternToText("OOMM"));

			testSingleChange("remove start", "OOOO", "OO", createLineChange(1, 2, 0, 0), patternToText("OO", "34"));
			testSingleChange("remove middle", "OOOO", "OO", createLineChange(2, 3, 1, 0), patternToText("OO", "14"));
			testSingleChange("remove end", "OOOO", "OO", createLineChange(3, 4, 2, 0), patternToText("OO"));
		});
		suite("edge cases", () => {
			testSingleChange("remove all", "OOOO", "", createLineChange(1, 4, 1, 1), patternToText(""));
			testSingleChange("remove all but one", "OOOO", "O", createLineChange(2, 4, 1, 0), patternToText("O"));
		});
	});
});

function testSingleChange(testName: string, originalPattern: string, modifiedPattern: string, change: vscode.LineChange, expected: string) {
	test(testName, () => {
		const oldDocPromise = patternToDocument(originalPattern);
		const newDocPromise = patternToDocument(modifiedPattern);

		return Promise.all([oldDocPromise, newDocPromise]).then(docs => {
			const [oldDoc, newDoc] = docs as vscode.TextDocument[];

			const result = applyLineChanges(oldDoc, newDoc, [change]);

			assert.equal(result, expected);
		}).catch(assert.fail);
	});
}

function patternToDocument(pattern: string): Thenable<vscode.TextDocument> {
	return vscode.workspace.openTextDocument({ content: patternToText(pattern) });
}

function patternToText(pattern: string, numbering?: string) {
	const PATTERNS: { [text: string]: string } = {
		O: "original",
		M: "modified",
	};

	return pattern.split('').map((c, i) => `${PATTERNS[c]} ${(numbering && numbering[i]) || i + 1}`).join('\n');
}

function createLineChange(originalStartLineNumber: number, originalEndLineNumber: number, modifiedStartLineNumber: number, modifiedEndLineNumber: number): vscode.LineChange {
	return { originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber };
}
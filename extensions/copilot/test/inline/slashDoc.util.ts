/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';

export function assertDocLines(fileContents: string | string[], line: string, lineAssertion = (line: string) => { }) {

	const fileLines = (Array.isArray(fileContents)) ? fileContents : fileContents.split('\n');

	const lineNum = fileLines.findIndex(s => s.startsWith(line));
	assert.ok(lineNum >= 0, 'missing or unterminated doc comment');

	assert.strictEqual(fileLines[lineNum - 1].trim(), '*/', 'has closing */');

	for (let i = lineNum - 2; i >= 0; --i) {
		const line = fileLines[i];
		if (line.trimStart().startsWith('/**')) {
			return;
		}
		assert.ok(line.trimStart().startsWith('*'), 'has middle *');
		lineAssertion(line);
	}

}

/**
 * Golang & Ruby use inline comments for doc comments, ie golang uses `//` both for implementation & doc comments
 */
export function assertDocLinesForInlineComments(fileContents: string | string[], line: string, docCommentPrefix: string) {

	const fileLines = (Array.isArray(fileContents)) ? fileContents : fileContents.split('\n');

	const lineNum = fileLines.lastIndexOf(line);

	if (lineNum === -1) { throw new Error(`given line cannot be found: either original line was changed or test was incorrectly created`); }

	const indentation = fileLines[lineNum].match(/^\s+/)?.[0] ?? '';
	const expectedPrefix = `${indentation}${docCommentPrefix}`;

	let hadDoc = false;
	for (let i = lineNum - 1; i >= 0; --i) {
		const line = fileLines[i];
		if (line.startsWith(expectedPrefix)) {
			hadDoc = true;
		} else {
			break;
		}
	}
	assert.ok(hadDoc, 'did not see comments');
}

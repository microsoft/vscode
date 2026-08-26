/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTextDocument } from './textDocument';

suite('TextDocument Tests', function () {
	const newLineChars = ['\n', '\r\n', '\r'];

	for (const newLineChar of newLineChars) {
		test(`new lines are handled correctly (${JSON.stringify(newLineChar)} separator)`, function () {
			const doc = createTextDocument('file:///test.ts', 'typescript', 1, `hello${newLineChar}goodbye`);

			assert.deepStrictEqual(doc.lineCount, 2);

			const firstLine = doc.lineAt(0).text;
			const lastLine = doc.lineAt(doc.lineCount - 1).text;

			assert.deepStrictEqual(firstLine, 'hello');
			assert.deepStrictEqual(lastLine, 'goodbye');
		});
	}
});

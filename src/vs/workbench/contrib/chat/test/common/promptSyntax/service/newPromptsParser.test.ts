/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { NewPromptsParser } from '../../../../common/promptSyntax/service/newPromptsParser.js';

suite('NewPromptsParser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();


	test('provides cached parser instance', async () => {
		const uri = URI.parse('file:///test/prompt1.md');
		const content = [
			/* 01 */"---",
			/* 02 */`description: "Agent mode test"`,
			/* 03 */"mode: agent",
			/* 04 */"tools: ['tool1', 'tool2']",
			/* 05 */"---",
			/* 06 */"This is a builtin agent mode test.",
			/* 07 */"Here is a #tool1 variable and a #file:./reference1.md as well as a [reference](./reference2.md).",
		].join('\n');
		const result = new NewPromptsParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.deepEqual(result.header?.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 5, endColumn: 1 });
		assert.deepEqual(result.header?.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 31) },
			{ key: 'mode', range: new Range(3, 1, 3, 12) },
			{ key: 'tools', range: new Range(4, 1, 4, 26) },
		]);


		assert.deepEqual(result.body?.range, { startLineNumber: 6, startColumn: 1, endLineNumber: 8, endColumn: 1 });
		assert.deepEqual(result.body?.fileReferences, [
			{ range: new Range(7, 39, 7, 54), content: './reference1.md' },
			{ range: new Range(7, 80, 7, 95), content: './reference2.md' }
		]);
		assert.deepEqual(result.body?.variableReferences, [
			{ range: new Range(7, 12, 7, 17), content: 'tool1' }
		]);
	});

});

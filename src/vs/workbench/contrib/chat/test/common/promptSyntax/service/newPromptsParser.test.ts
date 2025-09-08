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

	test('mode', async () => {
		const uri = URI.parse('file:///test/chatmode.md');
		const content = [
			/* 01 */"---",
			/* 02 */`description: "Agent mode test"`,
			/* 03 */"model: GPT 4.1",
			/* 04 */"tools: ['tool1', 'tool2']",
			/* 05 */"---",
			/* 06 */"This is a chat mode test.",
			/* 07 */"Here is a #tool1 variable and a #file:./reference1.md as well as a [reference](./reference2.md).",
		].join('\n');
		const result = new NewPromptsParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 5, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 31), value: { type: 'string', value: 'Agent mode test', range: new Range(2, 14, 2, 31) } },
			{ key: 'model', range: new Range(3, 1, 3, 15), value: { type: 'string', value: 'GPT 4.1', range: new Range(3, 8, 3, 15) } },
			{
				key: 'tools', range: new Range(4, 1, 4, 26), value: {
					type: 'array',
					items: [{ type: 'string', value: 'tool1', range: new Range(4, 9, 4, 16) }, { type: 'string', value: 'tool2', range: new Range(4, 18, 4, 25) }],
					range: new Range(4, 8, 4, 26)
				}
			},
		]);
		assert.deepEqual(result.body.range, { startLineNumber: 6, startColumn: 1, endLineNumber: 8, endColumn: 1 });
		assert.deepEqual(result.body.fileReferences, [
			{ range: new Range(7, 39, 7, 54), content: './reference1.md' },
			{ range: new Range(7, 80, 7, 95), content: './reference2.md' }
		]);
		assert.deepEqual(result.body.variableReferences, [
			{ range: new Range(7, 12, 7, 17), content: 'tool1' }
		]);
		assert.deepEqual(result.header.description, 'Agent mode test');
		assert.deepEqual(result.header.model, 'GPT 4.1');
		assert.ok(result.header.tools);
		assert.deepEqual([...result.header.tools.entries()], [['tool1', true], ['tool2', true]]);
	});

	test('instructions', async () => {
		const uri = URI.parse('file:///test/prompt1.md');
		const content = [
			/* 01 */"---",
			/* 02 */`description: "Code style instructions for TypeScript"`,
			/* 03 */"applyTo: *.ts",
			/* 04 */"---",
			/* 05 */"Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)",
		].join('\n');
		const result = new NewPromptsParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 4, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 54), value: { type: 'string', value: 'Code style instructions for TypeScript', range: new Range(2, 14, 2, 54) } },
			{ key: 'applyTo', range: new Range(3, 1, 3, 14), value: { type: 'string', value: '*.ts', range: new Range(3, 10, 3, 14) } },
		]);
		assert.deepEqual(result.body.range, { startLineNumber: 5, startColumn: 1, endLineNumber: 6, endColumn: 1 });
		assert.deepEqual(result.body.fileReferences, [
			{ range: new Range(5, 64, 5, 103), content: 'https://mycomp/guidelines#typescript.md' },
		]);
		assert.deepEqual(result.body.variableReferences, []);
		assert.deepEqual(result.header.description, 'Code style instructions for TypeScript');
		assert.deepEqual(result.header.applyTo, '*.ts');
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';

suite('NewPromptsParser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('agent', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			/* 01 */'---',
			/* 02 */`description: "Agent test"`,
			/* 03 */'model: GPT 4.1',
			/* 04 */`tools: ['tool1', 'tool2']`,
			/* 05 */'---',
			/* 06 */'This is an agent test.',
			/* 07 */'Here is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md).',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 5, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 26), value: { type: 'string', value: 'Agent test', range: new Range(2, 14, 2, 26) } },
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
		assert.equal(result.body.offset, 75);
		assert.equal(result.body.getContent(), 'This is an agent test.\nHere is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md).');

		assert.deepEqual(result.body.fileReferences, [
			{ range: new Range(7, 99, 7, 114), content: './reference1.md', isMarkdownLink: false },
			{ range: new Range(7, 140, 7, 155), content: './reference2.md', isMarkdownLink: true }
		]);
		assert.deepEqual(result.body.variableReferences, [
			{ range: new Range(7, 17, 7, 22), name: 'tool1', offset: 108 },
			{ range: new Range(7, 79, 7, 85), name: 'tool-2', offset: 170 }
		]);
		assert.deepEqual(result.header.description, 'Agent test');
		assert.deepEqual(result.header.model, 'GPT 4.1');
		assert.ok(result.header.tools);
		assert.deepEqual(result.header.tools, ['tool1', 'tool2']);
	});

	test('mode with handoff', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			/* 01 */'---',
			/* 02 */`description: "Agent test"`,
			/* 03 */'model: GPT 4.1',
			/* 04 */'handoffs:',
			/* 05 */'  - label: "Implement"',
			/* 06 */'    agent: Default',
			/* 07 */'    prompt: "Implement the plan"',
			/* 08 */'    send: false',
			/* 09 */'  - label: "Save"',
			/* 10 */'    agent: Default',
			/* 11 */'    prompt: "Save the plan to a file"',
			/* 12 */'    send: true',
			/* 13 */'---',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 13, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 26), value: { type: 'string', value: 'Agent test', range: new Range(2, 14, 2, 26) } },
			{ key: 'model', range: new Range(3, 1, 3, 15), value: { type: 'string', value: 'GPT 4.1', range: new Range(3, 8, 3, 15) } },
			{
				key: 'handoffs', range: new Range(4, 1, 12, 15), value: {
					type: 'array',
					range: new Range(5, 3, 12, 15),
					items: [
						{
							type: 'object', range: new Range(5, 5, 8, 16),
							properties: [
								{ key: { type: 'string', value: 'label', range: new Range(5, 5, 5, 10) }, value: { type: 'string', value: 'Implement', range: new Range(5, 12, 5, 23) } },
								{ key: { type: 'string', value: 'agent', range: new Range(6, 5, 6, 10) }, value: { type: 'string', value: 'Default', range: new Range(6, 12, 6, 19) } },
								{ key: { type: 'string', value: 'prompt', range: new Range(7, 5, 7, 11) }, value: { type: 'string', value: 'Implement the plan', range: new Range(7, 13, 7, 33) } },
								{ key: { type: 'string', value: 'send', range: new Range(8, 5, 8, 9) }, value: { type: 'boolean', value: false, range: new Range(8, 11, 8, 16) } },
							]
						},
						{
							type: 'object', range: new Range(9, 5, 12, 15),
							properties: [
								{ key: { type: 'string', value: 'label', range: new Range(9, 5, 9, 10) }, value: { type: 'string', value: 'Save', range: new Range(9, 12, 9, 18) } },
								{ key: { type: 'string', value: 'agent', range: new Range(10, 5, 10, 10) }, value: { type: 'string', value: 'Default', range: new Range(10, 12, 10, 19) } },
								{ key: { type: 'string', value: 'prompt', range: new Range(11, 5, 11, 11) }, value: { type: 'string', value: 'Save the plan to a file', range: new Range(11, 13, 11, 38) } },
								{ key: { type: 'string', value: 'send', range: new Range(12, 5, 12, 9) }, value: { type: 'boolean', value: true, range: new Range(12, 11, 12, 15) } },
							]
						},
					]
				}
			},
		]);
		assert.deepEqual(result.header.description, 'Agent test');
		assert.deepEqual(result.header.model, 'GPT 4.1');
		assert.ok(result.header.handOffs);
		assert.deepEqual(result.header.handOffs, [
			{ label: 'Implement', agent: 'Default', prompt: 'Implement the plan', send: false },
			{ label: 'Save', agent: 'Default', prompt: 'Save the plan to a file', send: true }
		]);
	});

	test('mode with handoff and showContinueOn per handoff', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			/* 01 */'---',
			/* 02 */`description: "Agent test"`,
			/* 03 */'model: GPT 4.1',
			/* 04 */'handoffs:',
			/* 05 */'  - label: "Implement"',
			/* 06 */'    agent: Default',
			/* 07 */'    prompt: "Implement the plan"',
			/* 08 */'    send: false',
			/* 09 */'    showContinueOn: false',
			/* 10 */'  - label: "Save"',
			/* 11 */'    agent: Default',
			/* 12 */'    prompt: "Save the plan"',
			/* 13 */'    send: true',
			/* 14 */'    showContinueOn: true',
			/* 15 */'---',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.header.handOffs);
		assert.deepEqual(result.header.handOffs, [
			{ label: 'Implement', agent: 'Default', prompt: 'Implement the plan', send: false, showContinueOn: false },
			{ label: 'Save', agent: 'Default', prompt: 'Save the plan', send: true, showContinueOn: true }
		]);
	});

	test('showContinueOn defaults to undefined when not specified per handoff', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			/* 01 */'---',
			/* 02 */`description: "Agent test"`,
			/* 03 */'handoffs:',
			/* 04 */'  - label: "Save"',
			/* 05 */'    agent: Default',
			/* 06 */'    prompt: "Save the plan"',
			/* 07 */'---',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.header.handOffs);
		assert.deepEqual(result.header.handOffs[0].showContinueOn, undefined);
	});

	test('instructions', async () => {
		const uri = URI.parse('file:///test/prompt1.md');
		const content = [
			/* 01 */'---',
			/* 02 */`description: "Code style instructions for TypeScript"`,
			/* 03 */'applyTo: *.ts',
			/* 04 */'---',
			/* 05 */'Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 4, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 54), value: { type: 'string', value: 'Code style instructions for TypeScript', range: new Range(2, 14, 2, 54) } },
			{ key: 'applyTo', range: new Range(3, 1, 3, 14), value: { type: 'string', value: '*.ts', range: new Range(3, 10, 3, 14) } },
		]);
		assert.deepEqual(result.body.range, { startLineNumber: 5, startColumn: 1, endLineNumber: 6, endColumn: 1 });
		assert.equal(result.body.offset, 76);
		assert.equal(result.body.getContent(), 'Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)');

		assert.deepEqual(result.body.fileReferences, [
			{ range: new Range(5, 64, 5, 103), content: 'https://mycomp/guidelines#typescript.md', isMarkdownLink: true },
		]);
		assert.deepEqual(result.body.variableReferences, []);
		assert.deepEqual(result.header.description, 'Code style instructions for TypeScript');
		assert.deepEqual(result.header.applyTo, '*.ts');
	});

	test('prompt file', async () => {
		const uri = URI.parse('file:///test/prompt2.md');
		const content = [
			/* 01 */'---',
			/* 02 */`description: "General purpose coding assistant"`,
			/* 03 */'agent: agent',
			/* 04 */'model: GPT 4.1',
			/* 05 */`tools: ['search', 'terminal']`,
			/* 06 */'---',
			/* 07 */'This is a prompt file body referencing #tool:search and [docs](https://example.com/docs).',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 6, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 48), value: { type: 'string', value: 'General purpose coding assistant', range: new Range(2, 14, 2, 48) } },
			{ key: 'agent', range: new Range(3, 1, 3, 13), value: { type: 'string', value: 'agent', range: new Range(3, 8, 3, 13) } },
			{ key: 'model', range: new Range(4, 1, 4, 15), value: { type: 'string', value: 'GPT 4.1', range: new Range(4, 8, 4, 15) } },
			{
				key: 'tools', range: new Range(5, 1, 5, 30), value: {
					type: 'array',
					items: [{ type: 'string', value: 'search', range: new Range(5, 9, 5, 17) }, { type: 'string', value: 'terminal', range: new Range(5, 19, 5, 29) }],
					range: new Range(5, 8, 5, 30)
				}
			},
		]);
		assert.deepEqual(result.body.range, { startLineNumber: 7, startColumn: 1, endLineNumber: 8, endColumn: 1 });
		assert.equal(result.body.offset, 114);
		assert.equal(result.body.getContent(), 'This is a prompt file body referencing #tool:search and [docs](https://example.com/docs).');
		assert.deepEqual(result.body.fileReferences, [
			{ range: new Range(7, 64, 7, 88), content: 'https://example.com/docs', isMarkdownLink: true },
		]);
		assert.deepEqual(result.body.variableReferences, [
			{ range: new Range(7, 46, 7, 52), name: 'search', offset: 153 }
		]);
		assert.deepEqual(result.header.description, 'General purpose coding assistant');
		assert.deepEqual(result.header.agent, 'agent');
		assert.deepEqual(result.header.model, 'GPT 4.1');
		assert.ok(result.header.tools);
		assert.deepEqual(result.header.tools, ['search', 'terminal']);
	});

	test('prompt file tools as map', async () => {
		const uri = URI.parse('file:///test/prompt2.md');
		const content = [
			/* 01 */'---',
			/* 02 */'tools:',
			/* 03 */'  built-in: true',
			/* 04 */'  mcp:',
			/* 05 */'    vscode-playright-mcp:',
			/* 06 */'      browser-click: true',
			/* 07 */'  extensions:',
			/* 08 */'    github.vscode-pull-request-github:',
			/* 09 */'      openPullRequest: true',
			/* 10 */'      copilotCodingAgent: false',
			/* 11 */'---',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(!result.body);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 11, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{
				key: 'tools', range: new Range(2, 1, 10, 32), value: {
					type: 'object',
					properties: [
						{
							'key': { type: 'string', value: 'built-in', range: new Range(3, 3, 3, 11) },
							'value': { type: 'boolean', value: true, range: new Range(3, 13, 3, 17) }
						},
						{
							'key': { type: 'string', value: 'mcp', range: new Range(4, 3, 4, 6) },
							'value': {
								type: 'object', range: new Range(5, 5, 6, 26), properties: [
									{
										'key': { type: 'string', value: 'vscode-playright-mcp', range: new Range(5, 5, 5, 25) }, 'value': {
											type: 'object', range: new Range(6, 7, 6, 26), properties: [
												{ 'key': { type: 'string', value: 'browser-click', range: new Range(6, 7, 6, 20) }, 'value': { type: 'boolean', value: true, range: new Range(6, 22, 6, 26) } }
											]
										}
									}
								]
							}
						},
						{
							'key': { type: 'string', value: 'extensions', range: new Range(7, 3, 7, 13) },
							'value': {
								type: 'object', range: new Range(8, 5, 10, 32), properties: [
									{
										'key': { type: 'string', value: 'github.vscode-pull-request-github', range: new Range(8, 5, 8, 38) }, 'value': {
											type: 'object', range: new Range(9, 7, 10, 32), properties: [
												{ 'key': { type: 'string', value: 'openPullRequest', range: new Range(9, 7, 9, 22) }, 'value': { type: 'boolean', value: true, range: new Range(9, 24, 9, 28) } },
												{ 'key': { type: 'string', value: 'copilotCodingAgent', range: new Range(10, 7, 10, 25) }, 'value': { type: 'boolean', value: false, range: new Range(10, 27, 10, 32) } }
											]
										}
									}
								]
							}
						},
					],
					range: new Range(3, 3, 10, 32)
				},
			}
		]);
		assert.deepEqual(result.header.description, undefined);
		assert.deepEqual(result.header.agent, undefined);
		assert.deepEqual(result.header.model, undefined);
		assert.ok(result.header.tools);
		assert.deepEqual(result.header.tools, ['built-in', 'browser-click', 'openPullRequest', 'copilotCodingAgent']);
	});
});

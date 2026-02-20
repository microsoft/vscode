/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IScalarValue, parseCommaSeparatedList, PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';

suite('PromptFileParser', () => {
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
			/* 07 */'Here is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md) and an image ![image](./image.png).',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);
		assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 5, endColumn: 1 });
		assert.deepEqual(result.header.attributes, [
			{ key: 'description', range: new Range(2, 1, 2, 26), value: { type: 'scalar', value: 'Agent test', range: new Range(2, 14, 2, 26), format: 'double' } },
			{ key: 'model', range: new Range(3, 1, 3, 15), value: { type: 'scalar', value: 'GPT 4.1', range: new Range(3, 8, 3, 15), format: 'none' } },
			{
				key: 'tools', range: new Range(4, 1, 4, 26), value: {
					type: 'sequence',
					items: [{ type: 'scalar', value: 'tool1', range: new Range(4, 9, 4, 16), format: 'single' }, { type: 'scalar', value: 'tool2', range: new Range(4, 18, 4, 25), format: 'single' }],
					range: new Range(4, 8, 4, 26)
				}
			},
		]);
		assert.deepEqual(result.body.range, { startLineNumber: 6, startColumn: 1, endLineNumber: 8, endColumn: 1 });
		assert.equal(result.body.offset, 75);
		assert.equal(result.body.getContent(), 'This is an agent test.\nHere is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md) and an image ![image](./image.png).');

		assert.deepEqual(result.body.fileReferences, [
			{ range: new Range(7, 99, 7, 114), content: './reference1.md', isMarkdownLink: false },
			{ range: new Range(7, 140, 7, 155), content: './reference2.md', isMarkdownLink: true }
		]);
		assert.deepEqual(result.body.variableReferences, [
			{ range: new Range(7, 17, 7, 22), name: 'tool1', offset: 108 },
			{ range: new Range(7, 79, 7, 85), name: 'tool-2', offset: 170 }
		]);
		assert.deepEqual(result.header.description, 'Agent test');
		assert.deepEqual(result.header.model, ['GPT 4.1']);
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
			{ key: 'description', range: new Range(2, 1, 2, 26), value: { type: 'scalar', value: 'Agent test', range: new Range(2, 14, 2, 26), format: 'double' } },
			{ key: 'model', range: new Range(3, 1, 3, 15), value: { type: 'scalar', value: 'GPT 4.1', range: new Range(3, 8, 3, 15), format: 'none' } },
			{
				key: 'handoffs', range: new Range(4, 1, 12, 15), value: {
					type: 'sequence',
					range: new Range(5, 1, 12, 15),
					items: [
						{
							type: 'map', range: new Range(5, 5, 8, 16),
							properties: [
								{ key: { type: 'scalar', value: 'label', range: new Range(5, 5, 5, 10), format: 'none' }, value: { type: 'scalar', value: 'Implement', range: new Range(5, 12, 5, 23), format: 'double' } },
								{ key: { type: 'scalar', value: 'agent', range: new Range(6, 5, 6, 10), format: 'none' }, value: { type: 'scalar', value: 'Default', range: new Range(6, 12, 6, 19), format: 'none' } },
								{ key: { type: 'scalar', value: 'prompt', range: new Range(7, 5, 7, 11), format: 'none' }, value: { type: 'scalar', value: 'Implement the plan', range: new Range(7, 13, 7, 33), format: 'double' } },
								{ key: { type: 'scalar', value: 'send', range: new Range(8, 5, 8, 9), format: 'none' }, value: { type: 'scalar', value: 'false', range: new Range(8, 11, 8, 16), format: 'none' } },
							]
						},
						{
							type: 'map', range: new Range(9, 5, 12, 15),
							properties: [
								{ key: { type: 'scalar', value: 'label', range: new Range(9, 5, 9, 10), format: 'none' }, value: { type: 'scalar', value: 'Save', range: new Range(9, 12, 9, 18), format: 'double' } },
								{ key: { type: 'scalar', value: 'agent', range: new Range(10, 5, 10, 10), format: 'none' }, value: { type: 'scalar', value: 'Default', range: new Range(10, 12, 10, 19), format: 'none' } },
								{ key: { type: 'scalar', value: 'prompt', range: new Range(11, 5, 11, 11), format: 'none' }, value: { type: 'scalar', value: 'Save the plan to a file', range: new Range(11, 13, 11, 38), format: 'double' } },
								{ key: { type: 'scalar', value: 'send', range: new Range(12, 5, 12, 9), format: 'none' }, value: { type: 'scalar', value: 'true', range: new Range(12, 11, 12, 15), format: 'none' } },
							]
						},
					]
				}
			},
		]);
		assert.deepEqual(result.header.description, 'Agent test');
		assert.deepEqual(result.header.model, ['GPT 4.1']);
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
			{ key: 'description', range: new Range(2, 1, 2, 54), value: { type: 'scalar', value: 'Code style instructions for TypeScript', range: new Range(2, 14, 2, 54), format: 'double' } },
			{ key: 'applyTo', range: new Range(3, 1, 3, 14), value: { type: 'scalar', value: '*.ts', range: new Range(3, 10, 3, 14), format: 'none' } },
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
			{ key: 'description', range: new Range(2, 1, 2, 48), value: { type: 'scalar', value: 'General purpose coding assistant', range: new Range(2, 14, 2, 48), format: 'double' } },
			{ key: 'agent', range: new Range(3, 1, 3, 13), value: { type: 'scalar', value: 'agent', range: new Range(3, 8, 3, 13), format: 'none' } },
			{ key: 'model', range: new Range(4, 1, 4, 15), value: { type: 'scalar', value: 'GPT 4.1', range: new Range(4, 8, 4, 15), format: 'none' } },
			{
				key: 'tools', range: new Range(5, 1, 5, 30), value: {
					type: 'sequence',
					items: [{ type: 'scalar', value: 'search', range: new Range(5, 9, 5, 17), format: 'single' }, { type: 'scalar', value: 'terminal', range: new Range(5, 19, 5, 29), format: 'single' }],
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
		assert.deepEqual(result.header.model, ['GPT 4.1']);
		assert.ok(result.header.tools);
		assert.deepEqual(result.header.tools, ['search', 'terminal']);
	});


	test('agent with agents', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			'---',
			`description: "Agent with restrictions"`,
			'agents: ["subagent1", "subagent2"]',
			'---',
			'This is an agent with restricted subagents.',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);
		assert.deepEqual(result.header.description, 'Agent with restrictions');
		assert.deepEqual(result.header.agents, ['subagent1', 'subagent2']);
	});

	test('agent with empty agents array', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			'---',
			`description: "Agent with no access"`,
			'agents: []',
			'---',
			'This agent has no access to subagents.',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.deepEqual(result.header.description, 'Agent with no access');
		assert.deepEqual(result.header.agents, []);
	});

	test('agent with wildcard agents', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			'---',
			`description: "Agent with full access"`,
			'agents: ["*"]',
			'---',
			'This agent has access to all subagents.',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.deepEqual(result.header.description, 'Agent with full access');
		assert.deepEqual(result.header.agents, ['*']);
	});

	test('agent without agents (undefined)', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			'---',
			`description: "Agent without restrictions"`,
			'---',
			'This agent has default access to all.',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.deepEqual(result.header.description, 'Agent without restrictions');
		assert.deepEqual(result.header.agents, undefined);
	});

	suite('parseCommaSeparatedList', () => {

		function assertCommaSeparatedList(input: string, expected: IScalarValue[]): void {
			const actual = parseCommaSeparatedList({ type: 'scalar', value: input, range: new Range(1, 1, 1, input.length + 1), format: 'none' });
			assert.deepStrictEqual(actual.items, expected);
		}

		test('simple unquoted values', () => {
			assertCommaSeparatedList('a, b, c', [
				{ type: 'scalar', value: 'a', range: new Range(1, 1, 1, 2), format: 'none' },
				{ type: 'scalar', value: 'b', range: new Range(1, 4, 1, 5), format: 'none' },
				{ type: 'scalar', value: 'c', range: new Range(1, 7, 1, 8), format: 'none' }
			]);
		});

		test('unquoted values without spaces', () => {
			assertCommaSeparatedList('foo,bar,baz', [
				{ type: 'scalar', value: 'foo', range: new Range(1, 1, 1, 4), format: 'none' },
				{ type: 'scalar', value: 'bar', range: new Range(1, 5, 1, 8), format: 'none' },
				{ type: 'scalar', value: 'baz', range: new Range(1, 9, 1, 12), format: 'none' }
			]);
		});

		test('double quoted values', () => {
			assertCommaSeparatedList('"hello", "world"', [
				{ type: 'scalar', value: 'hello', range: new Range(1, 1, 1, 8), format: 'double' },
				{ type: 'scalar', value: 'world', range: new Range(1, 10, 1, 17), format: 'double' }
			]);
		});

		test('single quoted values', () => {
			assertCommaSeparatedList(`'one', 'two'`, [
				{ type: 'scalar', value: 'one', range: new Range(1, 1, 1, 6), format: 'single' },
				{ type: 'scalar', value: 'two', range: new Range(1, 8, 1, 13), format: 'single' }
			]);
		});

		test('mixed quoted and unquoted values', () => {
			assertCommaSeparatedList('unquoted, "double", \'single\'', [
				{ type: 'scalar', value: 'unquoted', range: new Range(1, 1, 1, 9), format: 'none' },
				{ type: 'scalar', value: 'double', range: new Range(1, 11, 1, 19), format: 'double' },
				{ type: 'scalar', value: 'single', range: new Range(1, 21, 1, 29), format: 'single' }
			]);
		});

		test('quoted values with commas inside', () => {
			assertCommaSeparatedList('"a,b", "c,d"', [
				{ type: 'scalar', value: 'a,b', range: new Range(1, 1, 1, 6), format: 'double' },
				{ type: 'scalar', value: 'c,d', range: new Range(1, 8, 1, 13), format: 'double' }
			]);
		});

		test('empty string', () => {
			assertCommaSeparatedList('', []);
		});

		test('single value', () => {
			assertCommaSeparatedList('single', [
				{ type: 'scalar', value: 'single', range: new Range(1, 1, 1, 7), format: 'none' }
			]);
		});

		test('values with extra whitespace', () => {
			assertCommaSeparatedList('  a  ,  b  ,  c  ', [
				{ type: 'scalar', value: 'a', range: new Range(1, 3, 1, 4), format: 'none' },
				{ type: 'scalar', value: 'b', range: new Range(1, 9, 1, 10), format: 'none' },
				{ type: 'scalar', value: 'c', range: new Range(1, 15, 1, 16), format: 'none' }
			]);
		});

		test('quoted value with spaces', () => {
			assertCommaSeparatedList('"hello world", "foo bar"', [
				{ type: 'scalar', value: 'hello world', range: new Range(1, 1, 1, 14), format: 'double' },
				{ type: 'scalar', value: 'foo bar', range: new Range(1, 16, 1, 25), format: 'double' }
			]);
		});

		test('with position offset', () => {
			// Simulate parsing a list that starts at line 5, character 10
			const result = parseCommaSeparatedList({ type: 'scalar', value: 'a, b, c', range: new Range(6, 11, 6, 18), format: 'none' });
			assert.deepStrictEqual(result.items, [
				{ type: 'scalar', value: 'a', range: new Range(6, 11, 6, 12), format: 'none' },
				{ type: 'scalar', value: 'b', range: new Range(6, 14, 6, 15), format: 'none' },
				{ type: 'scalar', value: 'c', range: new Range(6, 17, 6, 18), format: 'none' }
			]);
		});

		test('entire input wrapped in double quotes', () => {
			// When the entire input is wrapped in quotes, it should be treated as a single quoted value
			assertCommaSeparatedList('"a, b, c"', [
				{ type: 'scalar', value: 'a, b, c', range: new Range(1, 1, 1, 10), format: 'double' }
			]);
		});

		test('entire input wrapped in single quotes', () => {
			// When the entire input is wrapped in single quotes, it should be treated as a single quoted value
			assertCommaSeparatedList(`'a, b, c'`, [
				{ type: 'scalar', value: 'a, b, c', range: new Range(1, 1, 1, 10), format: 'single' }
			]);
		});

	});

	test('userInvocable getter falls back to deprecated user-invokable', async () => {
		const uri = URI.parse('file:///test/test.agent.md');

		// user-invocable (new spelling) takes precedence
		const content1 = [
			'---',
			'description: "Test"',
			'user-invocable: true',
			'---',
		].join('\n');
		const result1 = new PromptFileParser().parse(uri, content1);
		assert.strictEqual(result1.header?.userInvocable, true);

		// deprecated user-invokable still works as fallback
		const content2 = [
			'---',
			'description: "Test"',
			'user-invokable: false',
			'---',
		].join('\n');
		const result2 = new PromptFileParser().parse(uri, content2);
		assert.strictEqual(result2.header?.userInvocable, false);

		// user-invocable takes precedence over deprecated user-invokable
		const content3 = [
			'---',
			'description: "Test"',
			'user-invocable: true',
			'user-invokable: false',
			'---',
		].join('\n');
		const result3 = new PromptFileParser().parse(uri, content3);
		assert.strictEqual(result3.header?.userInvocable, true);

		// neither set returns undefined
		const content4 = [
			'---',
			'description: "Test"',
			'---',
		].join('\n');
		const result4 = new PromptFileParser().parse(uri, content4);
		assert.strictEqual(result4.header?.userInvocable, undefined);
	});

	test('agent with all header fields including colons in description', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			'---',
			'name: Explore',
			'description: Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.',
			`argument-hint: Describe WHAT you're looking for and desired thoroughness (quick/medium/thorough)`,
			`model: ['Claude Haiku 4.5 (copilot)', 'Gemini 3 Flash (Preview) (copilot)', 'Auto (copilot)']`,
			'target: vscode',
			'user-invocable: false',
			`tools: ['search', 'read', 'web', 'vscode/memory', 'github/issue_read', 'github.vscode-pull-request-github/issue_fetch', 'github.vscode-pull-request-github/activePullRequest', 'execute/getTerminalOutput', 'execute/testFailure']`,
			'agents: []',
			'---',
			'You are an exploration agent specialized in rapid codebase analysis and answering questions efficiently.',
			'',
			'## Search Strategy',
			'',
			'- Go **broad to narrow**:',
			'\t1. Start with glob patterns or semantic codesearch to discover relevant areas',
			'\t2. Narrow with text search (regex) or usages (LSP) for specific symbols or patterns',
			'\t3. Read files only when you know the path or need full context',
			'- Pay attention to provided agent instructions/rules/skills as they apply to areas of the codebase to better understand architecture and best practices.',
			'- Use the github repo tool to search references in external dependencies.',
			'',
			'## Speed Principles',
			'',
			'Adapt search strategy based on the requested thoroughness level.',
			'',
			'**Bias for speed** — return findings as quickly as possible:',
			'- Parallelize independent tool calls (multiple greps, multiple reads)',
			'- Stop searching once you have sufficient context',
			'- Make targeted searches, not exhaustive sweeps',
			'',
			'## Output',
			'',
			'Report findings directly as a message. Include:',
			'- Files with absolute links',
			'- Specific functions, types, or patterns that can be reused',
			'- Analogous existing features that serve as implementation templates',
			'- Clear answers to what was asked, not comprehensive overviews',
			'',
			'Remember: Your goal is searching efficiently through MAXIMUM PARALLELISM to report concise and clear answers.',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.deepEqual(result.uri, uri);
		assert.ok(result.header);
		assert.ok(result.body);

		// Verify all header attributes are identified
		assert.deepEqual(result.header.name, 'Explore');
		assert.deepEqual(result.header.description, 'Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.');
		assert.deepEqual(result.header.argumentHint, `Describe WHAT you're looking for and desired thoroughness (quick/medium/thorough)`);
		assert.deepEqual(result.header.model, ['Claude Haiku 4.5 (copilot)', 'Gemini 3 Flash (Preview) (copilot)', 'Auto (copilot)']);
		assert.deepEqual(result.header.target, 'vscode');
		assert.deepEqual(result.header.userInvocable, false);
		assert.deepEqual(result.header.tools, ['search', 'read', 'web', 'vscode/memory', 'github/issue_read', 'github.vscode-pull-request-github/issue_fetch', 'github.vscode-pull-request-github/activePullRequest', 'execute/getTerminalOutput', 'execute/testFailure']);
		assert.deepEqual(result.header.agents, []);

		// Verify all 8 header attributes are present
		assert.deepEqual(result.header.attributes.length, 8);
		assert.deepEqual(result.header.attributes.map(a => a.key), [
			'name', 'description', 'argument-hint', 'model', 'target', 'user-invocable', 'tools', 'agents'
		]);
	});

	test('agent with unquoted description containing colon-space', async () => {
		const uri = URI.parse('file:///test/test.agent.md');
		const content = [
			'---',
			'name: Test',
			'description: This has a colon: in the middle',
			'target: vscode',
			'---',
		].join('\n');
		const result = new PromptFileParser().parse(uri, content);
		assert.ok(result.header);

		// The description contains ": " which could interfere with YAML parsing.
		// All headers after it should still be identified.
		assert.deepEqual(result.header.name, 'Test');
		assert.deepEqual(result.header.description, 'This has a colon: in the middle');
		assert.deepEqual(result.header.target, 'vscode');
	});

});

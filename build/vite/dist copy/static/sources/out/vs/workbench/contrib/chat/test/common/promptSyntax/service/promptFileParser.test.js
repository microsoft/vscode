/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { parseCommaSeparatedList, PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
suite('PromptFileParser', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('agent', async () => {
        const uri = URI.parse('file:///test/test.agent.md');
        const content = [
            /* 01 */ '---',
            /* 02 */ `description: "Agent test"`,
            /* 03 */ 'model: GPT 4.1',
            /* 04 */ `tools: ['tool1', 'tool2']`,
            /* 05 */ '---',
            /* 06 */ 'This is an agent test.',
            /* 07 */ 'Here is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md) and an image ![image](./image.png).',
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
            { range: new Range(7, 17, 7, 22), name: 'tool1', offset: 108, fullLength: 11 },
            { range: new Range(7, 79, 7, 85), name: 'tool-2', offset: 170, fullLength: 12 }
        ]);
        const [ref1, ref2] = result.body.variableReferences;
        assert.equal(content.substring(ref1.offset, ref1.offset + ref1.fullLength), '#tool:tool1');
        assert.equal(content.substring(ref2.offset, ref2.offset + ref2.fullLength), '#tool:tool-2');
        assert.deepEqual(result.header.description, 'Agent test');
        assert.deepEqual(result.header.model, ['GPT 4.1']);
        assert.ok(result.header.tools);
        assert.deepEqual(result.header.tools, ['tool1', 'tool2']);
    });
    test('mode with handoff', async () => {
        const uri = URI.parse('file:///test/test.agent.md');
        const content = [
            /* 01 */ '---',
            /* 02 */ `description: "Agent test"`,
            /* 03 */ 'model: GPT 4.1',
            /* 04 */ 'handoffs:',
            /* 05 */ '  - label: "Implement"',
            /* 06 */ '    agent: Default',
            /* 07 */ '    prompt: "Implement the plan"',
            /* 08 */ '    send: false',
            /* 09 */ '  - label: "Save"',
            /* 10 */ '    agent: Default',
            /* 11 */ '    prompt: "Save the plan to a file"',
            /* 12 */ '    send: true',
            /* 13 */ '---',
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
            /* 01 */ '---',
            /* 02 */ `description: "Agent test"`,
            /* 03 */ 'model: GPT 4.1',
            /* 04 */ 'handoffs:',
            /* 05 */ '  - label: "Implement"',
            /* 06 */ '    agent: Default',
            /* 07 */ '    prompt: "Implement the plan"',
            /* 08 */ '    send: false',
            /* 09 */ '    showContinueOn: false',
            /* 10 */ '  - label: "Save"',
            /* 11 */ '    agent: Default',
            /* 12 */ '    prompt: "Save the plan"',
            /* 13 */ '    send: true',
            /* 14 */ '    showContinueOn: true',
            /* 15 */ '---',
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
            /* 01 */ '---',
            /* 02 */ `description: "Agent test"`,
            /* 03 */ 'handoffs:',
            /* 04 */ '  - label: "Save"',
            /* 05 */ '    agent: Default',
            /* 06 */ '    prompt: "Save the plan"',
            /* 07 */ '---',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.deepEqual(result.uri, uri);
        assert.ok(result.header);
        assert.ok(result.header.handOffs);
        assert.deepEqual(result.header.handOffs[0].showContinueOn, undefined);
    });
    test('handoff with whitespace-only label is skipped', async () => {
        const uri = URI.parse('file:///test/test.agent.md');
        const content = [
            /* 01 */ '---',
            /* 02 */ `description: "Agent test"`,
            /* 03 */ 'handoffs:',
            /* 04 */ '  - label: "   "',
            /* 05 */ '    agent: Default',
            /* 06 */ '    prompt: "Do something"',
            /* 07 */ '  - label: "Valid"',
            /* 08 */ '    agent: Default',
            /* 09 */ '    prompt: "Also do something"',
            /* 10 */ '---',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.header);
        assert.deepStrictEqual(result.header.handOffs, [
            { agent: 'Default', label: 'Valid', prompt: 'Also do something' }
        ]);
    });
    test('instructions', async () => {
        const uri = URI.parse('file:///test/prompt1.md');
        const content = [
            /* 01 */ '---',
            /* 02 */ `description: "Code style instructions for TypeScript"`,
            /* 03 */ 'applyTo: *.ts',
            /* 04 */ '---',
            /* 05 */ 'Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)',
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
            /* 01 */ '---',
            /* 02 */ `description: "General purpose coding assistant"`,
            /* 03 */ 'agent: agent',
            /* 04 */ 'model: GPT 4.1',
            /* 05 */ `tools: ['search', 'terminal']`,
            /* 06 */ '---',
            /* 07 */ 'This is a prompt file body referencing #tool:search and [docs](https://example.com/docs).',
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
            { range: new Range(7, 46, 7, 52), name: 'search', offset: 153, fullLength: 12 }
        ]);
        assert.deepEqual(result.header.description, 'General purpose coding assistant');
        assert.deepEqual(result.header.agent, 'agent');
        assert.deepEqual(result.header.model, ['GPT 4.1']);
        assert.ok(result.header.tools);
        assert.deepEqual(result.header.tools, ['search', 'terminal']);
    });
    test('ignores links and variables inside inline code and fenced code blocks', async () => {
        const uri = URI.parse('file:///test/prompt3.md');
        const content = [
            '---',
            `description: "Prompt with markdown code"`,
            '---',
            'Outside #tool:outside and [outside](./outside.md).',
            'Inline code: `#tool:inline and [inline](./inline.md)` should be ignored.',
            '```ts',
            '#tool:block and #file:./inside-block.md and [block](./block.md)',
            '```',
            'After block #file:./after.md and [after](./after-link.md).',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.fileReferences.map(reference => ({ content: reference.content, isMarkdownLink: reference.isMarkdownLink })), [
            { content: './outside.md', isMarkdownLink: true },
            { content: './after.md', isMarkdownLink: false },
            { content: './after-link.md', isMarkdownLink: true }
        ]);
        assert.deepEqual(result.body.variableReferences.map(reference => reference.name), ['outside']);
    });
    test('ignores references in multiple inline code spans on the same line', async () => {
        const uri = URI.parse('file:///test/prompt-inline.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            'Before `#tool:ignored1` middle #tool:visible `[link](./ignored.md)` after [real](./real.md).',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.fileReferences.map(r => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
            { content: './real.md', isMarkdownLink: true },
        ]);
        assert.deepEqual(result.body.variableReferences.map(r => r.name), ['visible']);
    });
    test('handles fenced code block without language specifier', async () => {
        const uri = URI.parse('file:///test/prompt-fence.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            '```',
            '#file:./ignored.md',
            '[link](./ignored-link.md)',
            '```',
            '#file:./visible.md',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.fileReferences.map(r => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
            { content: './visible.md', isMarkdownLink: false },
        ]);
        assert.deepEqual(result.body.variableReferences, []);
    });
    test('handles multiple fenced code blocks', async () => {
        const uri = URI.parse('file:///test/prompt-multi-fence.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            '#tool:before',
            '```js',
            '#tool:ignored1',
            '```',
            '#tool:between',
            '```python',
            '#tool:ignored2',
            '```',
            '#tool:after',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.variableReferences.map(r => r.name), ['before', 'between', 'after']);
    });
    test('unclosed fenced code block ignores all remaining lines', async () => {
        const uri = URI.parse('file:///test/prompt-unclosed.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            '#tool:visible',
            '```',
            '#tool:ignored',
            '#file:./ignored.md',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.variableReferences.map(r => r.name), ['visible']);
        assert.deepEqual(result.body.fileReferences, []);
    });
    test('adjacent inline code does not suppress outside references', async () => {
        const uri = URI.parse('file:///test/prompt-adjacent.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            '`code`#tool:attached `more`[link](./file.md)',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        // #tool:attached starts right after the closing backtick, so it's outside inline code
        assert.deepEqual(result.body.variableReferences.map(r => r.name), ['attached']);
        // [link](./file.md) starts after the second inline code span
        assert.deepEqual(result.body.fileReferences.map(r => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
            { content: './file.md', isMarkdownLink: true },
        ]);
    });
    test('indented fenced code block is still detected', async () => {
        const uri = URI.parse('file:///test/prompt-indent.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            '  ```ts',
            '  #tool:ignored',
            '  ```',
            '#tool:visible',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.variableReferences.map(r => r.name), ['visible']);
    });
    test('fenced code block with 4 backticks', async () => {
        const uri = URI.parse('file:///test/prompt-4tick.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            '````',
            '#tool:ignored and [link](./ignored.md)',
            '````',
            '#tool:visible',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.variableReferences.map(r => r.name), ['visible']);
        assert.deepEqual(result.body.fileReferences, []);
    });
    test('fenced code block with tilde fence (~~~)', async () => {
        const uri = URI.parse('file:///test/prompt-tilde.md');
        const content = [
            '---',
            'description: "test"',
            '---',
            '~~~',
            '#file:./ignored.md and [link](./ignored-link.md)',
            '#tool:ignored',
            '~~~',
            '[real](./real.md)',
        ].join('\n');
        const result = new PromptFileParser().parse(uri, content);
        assert.ok(result.body);
        assert.deepEqual(result.body.fileReferences.map(r => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
            { content: './real.md', isMarkdownLink: true },
        ]);
        assert.deepEqual(result.body.variableReferences, []);
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
        function assertCommaSeparatedList(input, expected) {
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
    test('userInvocable getter reads user-invocable attribute', async () => {
        const uri = URI.parse('file:///test/test.agent.md');
        // user-invocable works
        const content1 = [
            '---',
            'description: "Test"',
            'user-invocable: true',
            '---',
        ].join('\n');
        const result1 = new PromptFileParser().parse(uri, content1);
        assert.strictEqual(result1.header?.userInvocable, true);
        // user-invocable false
        const content2 = [
            '---',
            'description: "Test"',
            'user-invocable: false',
            '---',
        ].join('\n');
        const result2 = new PromptFileParser().parse(uri, content2);
        assert.strictEqual(result2.header?.userInvocable, false);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZVBhcnNlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRGaWxlUGFyc2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN6RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFnQix1QkFBdUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRTlILEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7SUFDOUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUNwRCxNQUFNLE9BQU8sR0FBRztZQUNmLFFBQVEsQ0FBQSxLQUFLO1lBQ2IsUUFBUSxDQUFBLDJCQUEyQjtZQUNuQyxRQUFRLENBQUEsZ0JBQWdCO1lBQ3hCLFFBQVEsQ0FBQSwyQkFBMkI7WUFDbkMsUUFBUSxDQUFBLEtBQUs7WUFDYixRQUFRLENBQUEsd0JBQXdCO1lBQ2hDLFFBQVEsQ0FBQSxpTUFBaU07U0FDek0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDYixNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMs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SSxFQUFFLFVBQVU7b0JBQ2hCLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7b0JBQzlCLEtBQUssRUFBRTt3QkFDTjs0QkFDQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7NEJBQzFDLFVBQVUsRUFBRTtnQ0FDWCxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFO2dDQUMzTCxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFO2dDQUN2TCxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUU7Z0NBQ3JNLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7NkJBQ25MO3lCQUNEO3dCQUNEOzRCQUNDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQzs0QkFDM0MsVUFBVSxFQUFFO2dDQUNYLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUU7Z0NBQ3RMLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0NBQzNMLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUseUJBQXlCLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRTtnQ0FDOU0sRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUs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QVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlHLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUU7WUFDMUMsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSx3Q0FBd0MsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ25MLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7U0FDM0ksQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLHlHQUF5RyxDQUFDLENBQUM7UUFFbEosTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRTtZQUM1QyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUseUNBQXlDLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRTtTQUM3RyxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDakQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsYUFBYSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNqRCxNQUFNLE9BQU8sR0FBRztZQUNmLFFBQVEsQ0FBQSxLQUFLO1lBQ2IsUUFBUSxDQUFBLGlEQUFpRDtZQUN6RCxRQUFRLENBQUEsY0FBYztZQUN0QixRQUFRLENBQUEsZ0JBQWdCO1lBQ3hCLFFBQVEsQ0FBQSwrQkFBK0I7WUFDdkMsUUFBUSxDQUFBLEtBQUs7WUFDYixRQUFRLENBQUEsMkZBQTJGO1NBQ25HLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2IsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5RyxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFO1lBQzFDLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsa0NBQWtDLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUM3SyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3pJLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDM0k7Z0JBQ0MsR0FBRyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFO29CQUNuRCxJQUFJLEVBQUUsVUFBVTtvQkFDaEIsS0FBSyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO29CQUN0TCxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2lCQUM3QjthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLDJGQUEyRixDQUFDLENBQUM7UUFDcEksTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRTtZQUM1QyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRTtTQUM3RixDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUU7WUFDaEQsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUU7U0FDL0UsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDL0MsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUMvRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1RUFBdUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4RixNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDakQsTUFBTSxPQUFPLEdBQUc7WUFDZixLQUFLO1lBQ0wsMENBQTBDO1lBQzFDLEtBQUs7WUFDTCxvREFBb0Q7WUFDcEQsMEVBQTBFO1lBQzFFLE9BQU87WUFDUCxpRUFBaUU7WUFDakUsS0FBSztZQUNMLDREQUE0RDtTQUM1RCxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUViLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxTQUFTLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ3pJLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFO1lBQ2pELEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFO1lBQ2hELEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUU7U0FDcEQsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDaEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUVBQW1FLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDcEYsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sT0FBTyxHQUFHO1lBQ2YsS0FBSztZQUNMLHFCQUFxQjtZQUNyQixLQUFLO1lBQ0wsOEZBQThGO1NBQzlGLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWIsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDakgsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUU7U0FDOUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDaEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0RBQXNELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdkUsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sT0FBTyxHQUFHO1lBQ2YsS0FBSztZQUNMLHFCQUFxQjtZQUNyQixLQUFLO1lBQ0wsS0FBSztZQUNMLG9CQUFvQjtZQUNwQiwyQkFBMkI7WUFDM0IsS0FBSztZQUNMLG9CQUFvQjtTQUNwQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUViLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ2pILEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFO1NBQ2xELENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN0RCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDNUQsTUFBTSxPQUFPLEdBQUc7WUFDZixLQUFLO1lBQ0wscUJBQXFCO1lBQ3JCLEtBQUs7WUFDTCxjQUFjO1lBQ2QsT0FBTztZQUNQLGdCQUFnQjtZQUNoQixLQUFLO1lBQ0wsZUFBZTtZQUNmLFdBQVc7WUFDWCxnQkFBZ0I7WUFDaEIsS0FBSztZQUNMLGFBQWE7U0FDYixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUViLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDbkcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0RBQXdELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDekUsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sT0FBTyxHQUFHO1lBQ2YsS0FBSztZQUNMLHFCQUFxQjtZQUNyQixLQUFLO1lBQ0wsZUFBZTtZQUNmLEtBQUs7WUFDTCxlQUFlO1lBQ2Ysb0JBQW9CO1NBQ3BCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWIsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDekQsTUFBTSxPQUFPLEdBQUc7WUFDZixLQUFLO1lBQ0wscUJBQXFCO1lBQ3JCLEtBQUs7WUFDTCw4Q0FBOEM7U0FDOUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFYixNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QixzRkFBc0Y7UUFDdEYsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDaEYsNkRBQTZEO1FBQzdELE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ2pILEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFO1NBQzlDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQy9ELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUN2RCxNQUFNLE9BQU8sR0FBRztZQUNmLEtBQUs7WUFDTCxxQkFBcUI7WUFDckIsS0FBSztZQUNMLFNBQVM7WUFDVCxpQkFBaUI7WUFDakIsT0FBTztZQUNQLGVBQWU7U0FDZixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUViLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3JELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUN0RCxNQUFNLE9BQU8sR0FBRztZQUNmLEtBQUs7WUFDTCxxQkFBcUI7WUFDckIsS0FBSztZQUNMLE1BQU07WUFDTix3Q0FBd0M7WUFDeEMsTUFBTTtZQUNOLGVBQWU7U0FDZixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUViLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDbEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0QsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sT0FBTyxHQUFHO1lBQ2YsS0FBSztZQUNMLHFCQUFxQjtZQUNyQixLQUFLO1lBQ0wsS0FBSztZQUNMLGtEQUFrRDtZQUNsRCxlQUFlO1lBQ2YsS0FBSztZQUNMLG1CQUFtQjtTQUNuQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUViLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ2pILEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFO1NBQzlDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RCxDQUFDLENBQUMsQ0FBQztJQUdILElBQUksQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNwQyxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDcEQsTUFBTSxPQUFPLEdBQUc7WUFDZixLQUFLO1lBQ0wsd0NBQXdDO1lBQ3hDLG9DQUFvQztZQUNwQyxLQUFLO1lBQ0wsNkNBQTZDO1NBQzdDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2IsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFDcEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0JBQStCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDaEQsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sT0FBTyxHQUFHO1lBQ2YsS0FBSztZQUNMLHFDQUFxQztZQUNyQyxZQUFZO1lBQ1osS0FBSztZQUNMLHdDQUF3QztTQUN4QyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNiLE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6QixNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDcEUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM1QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM3QyxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDcEQsTUFBTSxPQUFPLEdBQUc7WUFDZixLQUFLO1lBQ0wsdUNBQXVDO1lBQ3ZDLGVBQWU7WUFDZixLQUFLO1lBQ0wseUNBQXlDO1NBQ3pDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2IsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUN0RSxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUMvQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDcEQsTUFBTSxPQUFPLEdBQUc7WUFDZixLQUFLO1lBQ0wsMkNBQTJDO1lBQzNDLEtBQUs7WUFDTCx1Q0FBdUM7U0FDdkMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDYixNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekIsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBQzFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDbkQsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO1FBRXJDLFNBQVMsd0JBQXdCLENBQUMsS0FBYSxFQUFFLFFBQXdCO1lBQ3hFLE1BQU0sTUFBTSxHQUFHLHVCQUF1QixDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQ3RJLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBRUQsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtZQUNuQyx3QkFBd0IsQ0FBQyxTQUFTLEVBQUU7Z0JBQ25DLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO2dCQUM1RSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtnQkFDNUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7YUFDNUUsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO1lBQzNDLHdCQUF3QixDQUFDLGFBQWEsRUFBRTtnQkFDdkMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7Z0JBQzlFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO2dCQUM5RSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTthQUMvRSxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7WUFDakMsd0JBQXdCLENBQUMsa0JBQWtCLEVBQUU7Z0JBQzVDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO2dCQUNsRixFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRTthQUNwRixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7WUFDakMsd0JBQXdCLENBQUMsY0FBYyxFQUFFO2dCQUN4QyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRTtnQkFDaEYsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUU7YUFDakYsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1lBQzdDLHdCQUF3QixDQUFDLGdDQUFnQyxFQUFFO2dCQUMxRCxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtnQkFDbkYsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUU7Z0JBQ3JGLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO2FBQ3JGLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsRUFBRTtZQUM3Qyx3QkFBd0IsQ0FBQyxjQUFjLEVBQUU7Z0JBQ3hDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO2dCQUNoRixFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRTthQUNqRixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1lBQ3pCLHdCQUF3QixDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1lBQ3pCLHdCQUF3QixDQUFDLFFBQVEsRUFBRTtnQkFDbEMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7YUFDakYsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO1lBQ3pDLHdCQUF3QixDQUFDLG1CQUFtQixFQUFFO2dCQUM3QyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtnQkFDNUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7Z0JBQzdFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO2FBQzlFLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtZQUNyQyx3QkFBd0IsQ0FBQywwQkFBMEIsRUFBRTtnQkFDcEQsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUU7Z0JBQ3pGLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO2FBQ3RGLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtZQUNqQyw4REFBOEQ7WUFDOUQsTUFBTSxNQUFNLEdBQUcsdUJBQXVCLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQzdILE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRTtnQkFDcEMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUU7Z0JBQzlFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFO2dCQUM5RSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTthQUM5RSxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7WUFDbEQsNEZBQTRGO1lBQzVGLHdCQUF3QixDQUFDLFdBQVcsRUFBRTtnQkFDckMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUU7YUFDckYsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO1lBQ2xELG1HQUFtRztZQUNuRyx3QkFBd0IsQ0FBQyxXQUFXLEVBQUU7Z0JBQ3JDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO2FBQ3JGLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUosQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscURBQXFELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdEUsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBRXBELHVCQUF1QjtRQUN2QixNQUFNLFFBQVEsR0FBRztZQUNoQixLQUFLO1lBQ0wscUJBQXFCO1lBQ3JCLHNCQUFzQjtZQUN0QixLQUFLO1NBQ0wsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDYixNQUFNLE9BQU8sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXhELHVCQUF1QjtRQUN2QixNQUFNLFFBQVEsR0FBRztZQUNoQixLQUFLO1lBQ0wscUJBQXFCO1lBQ3JCLHVCQUF1QjtZQUN2QixLQUFLO1NBQ0wsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDYixNQUFNLE9BQU8sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXpELGdDQUFnQztRQUNoQyxNQUFNLFFBQVEsR0FBRztZQUNoQixLQUFLO1lBQ0wscUJBQXFCO1lBQ3JCLEtBQUs7U0FDTCxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNiLE1BQU0sT0FBTyxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDOUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOERBQThELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDL0UsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sT0FBTyxHQUFHO1lBQ2YsS0FBSztZQUNMLGVBQWU7WUFDZixxUUFBcVE7WUFDclEsa0dBQWtHO1lBQ2xHLCtGQUErRjtZQUMvRixnQkFBZ0I7WUFDaEIsdUJBQXVCO1lBQ3ZCLG9PQUFvTztZQUNwTyxZQUFZO1lBQ1osS0FBSztZQUNMLDBHQUEwRztZQUMxRyxFQUFFO1lBQ0Ysb0JBQW9CO1lBQ3BCLEVBQUU7WUFDRiwyQkFBMkI7WUFDM0IsaUZBQWlGO1lBQ2pGLHVGQUF1RjtZQUN2RixrRUFBa0U7WUFDbEUsMEpBQTBKO1lBQzFKLDJFQUEyRTtZQUMzRSxFQUFFO1lBQ0YscUJBQXFCO1lBQ3JCLEVBQUU7WUFDRixrRUFBa0U7WUFDbEUsRUFBRTtZQUNGLDhEQUE4RDtZQUM5RCx1RUFBdUU7WUFDdkUsbURBQW1EO1lBQ25ELGlEQUFpRDtZQUNqRCxFQUFFO1lBQ0YsV0FBVztZQUNYLEVBQUU7WUFDRixpREFBaUQ7WUFDakQsNkJBQTZCO1lBQzdCLDZEQUE2RDtZQUM3RCxzRUFBc0U7WUFDdEUsZ0VBQWdFO1lBQ2hFLEVBQUU7WUFDRiwrR0FBK0c7U0FDL0csQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDYixNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFdkIsOENBQThDO1FBQzlDLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSx3UEFBd1AsQ0FBQyxDQUFDO1FBQ3RTLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsbUZBQW1GLENBQUMsQ0FBQztRQUNsSSxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsNEJBQTRCLEVBQUUsb0NBQW9DLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBQzlILE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLCtDQUErQyxFQUFFLHFEQUFxRCxFQUFFLDJCQUEyQixFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUNuUSxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRTNDLDZDQUE2QztRQUM3QyxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUMxRCxNQUFNLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxRQUFRO1NBQzlGLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pFLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUNwRCxNQUFNLE9BQU8sR0FBRztZQUNmLEtBQUs7WUFDTCxZQUFZO1lBQ1osOENBQThDO1lBQzlDLGdCQUFnQjtZQUNoQixLQUFLO1NBQ0wsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDYixNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV6Qix5RUFBeUU7UUFDekUsbURBQW1EO1FBQ25ELE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDbEQsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDLENBQUMsQ0FBQyJ9
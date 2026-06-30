/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../common/state/protocol/state.js';
import { CopilotSlashCommandCompletionProvider, parseLeadingSlashCommand } from '../../node/copilot/copilotSlashCommandCompletionProvider.js';

suite('CopilotSlashCommandCompletionProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseLeadingSlashCommand', () => {
		test('matches lone /plan', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan'), { command: 'plan', rest: '', rawRest: '' });
		});

		test('matches lone /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact'), { command: 'compact', rest: '', rawRest: '' });
		});

		test('matches lone /research', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/research'), { command: 'research', rest: '', rawRest: '' });
		});

		test('captures trailing text after a space for /research', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/research How does React work?'), { command: 'research', rest: 'How does React work?', rawRest: 'How does React work?' });
		});

		test('matches lone /rubber-duck', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck'), { command: 'rubber-duck', rest: '', rawRest: '' });
		});

		test('matches lone /env', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/env'), { command: 'env', rest: '', rawRest: '' });
		});

		test('matches lone /review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/review'), { command: 'review', rest: '', rawRest: '' });
		});

		test('matches lone /security-review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/security-review'), { command: 'security-review', rest: '', rawRest: '' });
		});

		test('captures trailing text after a space for /rubber-duck', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck review my approach'), { command: 'rubber-duck', rest: 'review my approach', rawRest: 'review my approach' });
		});

		test('captures trailing text after a space for /env', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/env ignored input'), { command: 'env', rest: 'ignored input', rawRest: 'ignored input' });
		});

		test('captures trailing text after a space for /review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/review focus on tests'), { command: 'review', rest: 'focus on tests', rawRest: 'focus on tests' });
		});

		test('captures trailing text after a space for /security-review', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/security-review focus on auth'), { command: 'security-review', rest: 'focus on auth', rawRest: 'focus on auth' });
		});

		test('parses arbitrary slash command tokens', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck-extra'), { command: 'rubber-duck-extra', rest: '', rawRest: '' });
		});

		test('preserves multiline command input as rawRest', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/foo first line\nsecond line'), { command: 'foo', rest: 'first line\nsecond line', rawRest: 'first line\nsecond line' });
		});

		test('trims rest while retaining rawRest', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/foo   padded  '), { command: 'foo', rest: 'padded', rawRest: 'padded  ' });
		});

		test('captures trailing text after a space', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan build a hello world'), { command: 'plan', rest: 'build a hello world', rawRest: 'build a hello world' });
		});

		test('captures trailing text after a space for /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact some text'), { command: 'compact', rest: 'some text', rawRest: 'some text' });
		});

		test('rejects leading whitespace', () => {
			assert.strictEqual(parseLeadingSlashCommand(' /compact'), undefined);
		});

		test('accepts uppercase command tokens', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/PLAN'), { command: 'PLAN', rest: '', rawRest: '' });
		});
	});

	suite('provideCompletionItems', () => {
		const runtimeCommands = [
			{ name: 'plan', description: 'Runtime plan', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'task' } },
			{ name: 'compact', description: 'Runtime compact', kind: 'builtin' as const, allowDuringAgentExecution: true },
			{ name: 'research', description: 'Runtime research', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'query' } },
			{ name: 'rubber-duck', description: 'Runtime rubber-duck', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'review prompt' } },
			{ name: 'env', description: 'Runtime env', kind: 'builtin' as const, allowDuringAgentExecution: true },
			{ name: 'review', description: 'Runtime review', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'scope' } },
			{ name: 'security-review', description: 'Runtime security review', kind: 'builtin' as const, allowDuringAgentExecution: true, input: { hint: 'scope' } },
		];
		const provider = new CopilotSlashCommandCompletionProvider('copilotcli', {
			isRubberDuckEnabled: () => true,
			getRuntimeSlashCommands: async () => runtimeCommands,
		});
		const session = 'copilotcli:/abc';

		async function run(text: string, offset = text.length) {
			return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
		}

		test('returns nothing for non-copilotcli scheme', async () => {
			const items = await provider.provideCompletionItems({
				kind: CompletionItemKind.UserMessage,
				channel: 'claude:/abc',
				text: '/',
				offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items, []);
		});

		test('returns all items for lone "/"', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ', '/plan task ', '/compact ', '/research ', '/research query ', '/rubber-duck ', '/env ', '/review ', '/security-review ', '/rubber-duck review prompt ', '/security-review scope ', '/review scope '].sort());
		});

		test('filters to /plan when "/p" typed', async () => {
			const items = await run('/p');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ', '/plan task ']);
		});

		test('filters to /compact when "/c" typed', async () => {
			const items = await run('/c');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/compact ']);
		});

		test('filters to /env when "/e" typed and runtime command exists', async () => {
			const items = await run('/e');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/env ']);
		});

		test('filters to /research and /rubber-duck when "/r" typed', async () => {
			const items = await run('/r');
			assert.deepStrictEqual(items.map(i => i.insertText), [
				'/research ',
				'/research query ',
				'/review ',
				'/review scope ',
				'/rubber-duck ',
				'/rubber-duck review prompt '
			].sort());
		});

		test('filters to /security-review when "/s" typed', async () => {
			const items = await run('/s');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/security-review ',
				'/security-review scope ']);
		});

		test('returns nothing when /word does not match any command prefix', async () => {
			const items = await run('/zz');
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when input does not start with /', async () => {
			const items = await run('hello /pl', 9);
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when cursor is past the leading word', async () => {
			// Cursor sits after the trailing space, no longer in the slash token.
			const items = await run('/plan ', 6);
			assert.deepStrictEqual(items, []);
		});

		test('range covers only the leading slash word', async () => {
			const items = await run('/p extra text', 2);
			assert.strictEqual(items.length, 2);
			assert.strictEqual(items[0].rangeStart, 0);
			assert.strictEqual(items[0].rangeEnd, 2);
		});

		test('attachment is Simple with command + description meta', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(item => ({ type: item.attachment?.type, meta: item.attachment?._meta })), [
				{
					type: 'simple',
					meta: {
						command: 'compact',
						description: 'Runtime compact'
					}
				},
				{
					type: 'simple',
					meta: {
						command: 'env',
						description: 'Runtime env'
					}
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'plan',
						description: 'Runtime plan',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'plan',
						description: 'Runtime plan',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'research',
						description: 'Runtime research',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'research',
						description: 'Runtime research',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'review',
						description: 'Runtime review',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'review',
						description: 'Runtime review',
					},
				},
				{
					type: 'simple',
					meta: {
						command: 'rubber-duck',
						description: 'Runtime rubber-duck'
					}
				},
				{
					type: 'simple',
					meta: {
						command: 'rubber-duck',
						description: 'Runtime rubber-duck'
					}
				},
				{
					type: 'simple',
					meta: {
						command: 'security-review',
						description: 'Runtime security review'
					}
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'security-review',
						description: 'Runtime security review',
					},
				},
			]);
		});

		test('omits /rubber-duck when not enabled', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => false,
				getRuntimeSlashCommands: async () => runtimeCommands,
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items.map(i => i.insertText), [
				'/compact ',
				'/env ',
				'/plan ',
				'/plan task ',
				'/research ',
				'/research query ',
				'/review ',
				'/review scope ',
				'/security-review ',
				'/security-review scope '
			].sort());
		});

		test('returns no completion items when runtime command list is empty', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items, []);
		});

		test('filters out runtime commands omitted from the catalog', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => runtimeCommands.filter(command => command.name !== 'env'),
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items.map(i => i.insertText), [
				'/compact ',
				'/plan ',
				'/plan task ',
				'/research ',
				'/research query ',
				'/review ',
				'/review scope ',
				'/rubber-duck ',
				'/rubber-duck review prompt ',
				'/security-review ',
				'/security-review scope ',
			].sort());
		});

		test('includes runtime SDK commands in completion results', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [{
					name: 'focus',
					description: 'Focus on specific files',
					kind: 'builtin',
					allowDuringAgentExecution: true,
					input: { hint: 'scope' },
				}],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/f', offset: 2,
			}, CancellationToken.None);
			assert.deepStrictEqual(items.map(i => i.insertText), ['/focus ', '/focus scope ']);
		});

		test('keeps runtime commands that also have local send-time handling', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'plan', description: 'runtime plan', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: 'task' } },
					{ name: 'compact', description: 'runtime compact', kind: 'builtin', allowDuringAgentExecution: true },
					{ name: 'runtime-only', description: 'runtime only', kind: 'client', allowDuringAgentExecution: true },
				],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ', '/compact ', '/runtime-only ', '/plan task '].sort());
		});

		test('uses runtime input metadata to determine trailing space insertion', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'no-input', description: 'No input', kind: 'builtin', allowDuringAgentExecution: true },
					{ name: 'needs-input', description: 'Needs input', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: 'value' } },
				],
			});
			const withInput = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/n', offset: 2,
			}, CancellationToken.None);
			assert.deepStrictEqual(withInput.map(i => i.insertText), ['/no-input ', '/needs-input ', '/needs-input value '].sort());
		});

		test('expands an enumerated hint into one item per option (with brackets)', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'toggle', description: 'Toggle a feature on or off', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: '[on|off]' } },
				],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/t', offset: 2,
			}, CancellationToken.None);
			// An enumerated hint expands into the bare command plus one item per option.
			assert.deepStrictEqual(items.map(i => i.insertText), ['/toggle ', '/toggle on ', '/toggle off '].sort());
		});

		test('expands an enumerated hint into one item per option (without brackets)', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'toggle', description: 'Toggle a feature on or off', kind: 'builtin', allowDuringAgentExecution: true, input: { hint: 'on|off' } },
				],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/t', offset: 2,
			}, CancellationToken.None);
			// An enumerated hint expands into the bare command plus one item per option.
			assert.deepStrictEqual(items.map(i => i.insertText), ['/toggle ', '/toggle on ', '/toggle off '].sort());
		});

		test('expands an enumerated hint into one item per option (requires input)', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async () => [
					{ name: 'toggle', description: 'Toggle a feature on or off', kind: 'builtin', allowDuringAgentExecution: true, input: { required: true, hint: '[on|off]' } },
				],
			});
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/t', offset: 2,
			}, CancellationToken.None);
			// An enumerated hint expands into the bare command plus one item per option.
			assert.deepStrictEqual(items.map(i => i.insertText), ['/toggle on ', '/toggle off '].sort());
		});

		test('passes raw session id to runtime command listing', async () => {
			let seen: string | undefined;
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				isRubberDuckEnabled: () => true,
				getRuntimeSlashCommands: async (id: string) => {
					seen = id;
					return [{ name: 'focus', kind: 'builtin', description: 'Focus', allowDuringAgentExecution: true }];
				},
			});
			await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: 'copilotcli:/abc', text: '/f', offset: 2,
			}, CancellationToken.None);
			assert.strictEqual(seen, 'abc');
		});
	});
});

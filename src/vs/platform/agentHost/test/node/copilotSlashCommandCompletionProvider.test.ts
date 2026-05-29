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

	let _savedRubberDuckEnv: string | undefined;
	suiteSetup(() => {
		_savedRubberDuckEnv = process.env['RUBBER_DUCK_AGENT'];
		process.env['RUBBER_DUCK_AGENT'] = 'true';
	});

	suiteTeardown(() => {
		if (_savedRubberDuckEnv === undefined) {
			delete process.env['RUBBER_DUCK_AGENT'];
		} else {
			process.env['RUBBER_DUCK_AGENT'] = _savedRubberDuckEnv;
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseLeadingSlashCommand', () => {
		test('matches lone /plan', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan'), { command: 'plan', rest: '' });
		});

		test('matches lone /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact'), { command: 'compact', rest: '' });
		});

		test('matches lone /research', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/research'), { command: 'research', rest: '' });
		});

		test('captures trailing text after a space for /research', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/research How does React work?'), { command: 'research', rest: 'How does React work?' });
		});

		test('matches lone /rubber-duck', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck'), { command: 'rubber-duck', rest: '' });
		});

		test('captures trailing text after a space for /rubber-duck', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/rubber-duck review my approach'), { command: 'rubber-duck', rest: 'review my approach' });
		});

		test('rejects /rubber-duck-extra (no separator)', () => {
			assert.strictEqual(parseLeadingSlashCommand('/rubber-duck-extra'), undefined);
		});

		test('rejects /rubber alone (incomplete command)', () => {
			assert.strictEqual(parseLeadingSlashCommand('/rubber'), undefined);
		});

		test('captures trailing text after a space', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan build a hello world'), { command: 'plan', rest: 'build a hello world' });
		});

		test('captures trailing text after a space for /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact some text'), { command: 'compact', rest: 'some text' });
		});

		test('rejects /compact-hello (no separator)', () => {
			assert.strictEqual(parseLeadingSlashCommand('/compact-hello world'), undefined);
		});

		test('rejects /plans (longer command)', () => {
			assert.strictEqual(parseLeadingSlashCommand('/plans'), undefined);
		});

		test('rejects leading whitespace', () => {
			assert.strictEqual(parseLeadingSlashCommand(' /compact'), undefined);
		});

		test('case-sensitive', () => {
			assert.strictEqual(parseLeadingSlashCommand('/PLAN'), undefined);
		});
	});

	suite('provideCompletionItems', () => {
		const provider = new CopilotSlashCommandCompletionProvider('copilotcli');
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
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ', '/compact', '/research ', '/rubber-duck ']);
		});

		test('filters to /plan when "/p" typed', async () => {
			const items = await run('/p');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ']);
		});

		test('filters to /compact when "/c" typed', async () => {
			const items = await run('/c');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/compact']);
		});

		test('filters to /research and /rubber-duck when "/r" typed', async () => {
			const items = await run('/r');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/research ', '/rubber-duck ']);
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
			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].rangeStart, 0);
			assert.strictEqual(items[0].rangeEnd, 2);
		});

		test('attachment is Simple with command + description meta', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(item => ({ type: item.attachment?.type, meta: item.attachment?._meta })), [
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'plan',
						description: 'Create an implementation plan before coding',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'compact',
						description: 'Free up context by compacting the conversation history',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'research',
						description: 'Run deep research on a topic using search and web sources',
					},
				},
				{
					type: MessageAttachmentKind.Simple,
					meta: {
						command: 'rubber-duck',
						description: 'Get an independent critique of the current approach',
					},
				},
			]);
		});

		test('omits /compact when session has no history', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', { hasHistory: () => false });
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ', '/research ', '/rubber-duck ']);
		});

		test('omits /rubber-duck when env var is unset', async () => {
			const saved = process.env['RUBBER_DUCK_AGENT'];
			delete process.env['RUBBER_DUCK_AGENT'];
			try {
				const items = await run('/');
				assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ', '/compact', '/research ']);
			} finally {
				if (saved !== undefined) {
					process.env['RUBBER_DUCK_AGENT'] = saved;
				}
			}
		});

		test('passes raw session id (no scheme/slash) to hasHistory', async () => {
			let seen: string | undefined;
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				hasHistory: (id: string) => { seen = id; return true; },
			});
			await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, channel: 'copilotcli:/abc', text: '/', offset: 1,
			}, CancellationToken.None);
			assert.strictEqual(seen, 'abc');
		});
	});
});

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
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan'), { command: 'plan', rest: '' });
		});

		test.skip('matches lone /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact'), { command: 'compact', rest: '' });
		});

		test('captures trailing text after a space', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/plan build a hello world'), { command: 'plan', rest: 'build a hello world' });
		});

		test.skip('captures trailing text after a space for /compact', () => {
			assert.deepStrictEqual(parseLeadingSlashCommand('/compact some text'), { command: 'compact', rest: 'some text' });
		});

		test('rejects /compact-hello (no separator)', () => {
			assert.strictEqual(parseLeadingSlashCommand('/compact-hello world'), undefined);
		});

		test('rejects /plans (longer command)', () => {
			assert.strictEqual(parseLeadingSlashCommand('/plans'), undefined);
		});

		test.skip('rejects leading whitespace', () => {
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
			return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, session, text, offset }, CancellationToken.None);
		}

		test('returns nothing for non-copilotcli scheme', async () => {
			const items = await provider.provideCompletionItems({
				kind: CompletionItemKind.UserMessage,
				session: 'claude:/abc',
				text: '/',
				offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items, []);
		});

		test('returns both items for lone "/"', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ']);
		});

		test('filters to /plan when "/p" typed', async () => {
			const items = await run('/p');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ']);
		});

		test.skip('filters to /compact when "/c" typed', async () => {
			const items = await run('/c');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/compact']);
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
			assert.strictEqual(items[0].attachment?.type, MessageAttachmentKind.Simple);
			assert.deepStrictEqual(items[0].attachment?._meta, {
				command: 'plan',
				description: 'Create an implementation plan before coding',
			});
			// assert.deepStrictEqual(items[1].attachment?._meta, {
			// 	command: 'compact',
			// 	description: 'Free up context by compacting the conversation history',
			// });
		});

		test.skip('omits /compact when session has no history', async () => {
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', { hasHistory: () => false });
			const items = await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, session, text: '/', offset: 1,
			}, CancellationToken.None);
			assert.deepStrictEqual(items.map(i => i.insertText), ['/plan ']);
		});

		test.skip('passes raw session id (no scheme/slash) to hasHistory', async () => {
			let seen: string | undefined;
			const gated = new CopilotSlashCommandCompletionProvider('copilotcli', {
				hasHistory: (id: string) => { seen = id; return true; },
			});
			await gated.provideCompletionItems({
				kind: CompletionItemKind.UserMessage, session: 'copilotcli:/abc', text: '/', offset: 1,
			}, CancellationToken.None);
			assert.strictEqual(seen, 'abc');
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../common/state/protocol/state.js';
import { AgentHostRenameCompletionProvider, parseRenameCommand } from '../../node/agentHostRenameCommand.js';

suite('agentHostRenameCommand', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseRenameCommand', () => {
		test('matches lone /rename as empty title', () => {
			assert.strictEqual(parseRenameCommand('/rename'), '');
		});

		test('captures the trimmed title after a space', () => {
			assert.strictEqual(parseRenameCommand('/rename My New Title'), 'My New Title');
		});

		test('trims surrounding whitespace from the title', () => {
			assert.strictEqual(parseRenameCommand('/rename   spaced   '), 'spaced');
		});

		test('rejects /renamed (longer command)', () => {
			assert.strictEqual(parseRenameCommand('/renamed'), undefined);
		});

		test('rejects /rename-foo (no separator)', () => {
			assert.strictEqual(parseRenameCommand('/rename-foo'), undefined);
		});

		test('rejects leading whitespace', () => {
			assert.strictEqual(parseRenameCommand(' /rename x'), undefined);
		});

		test('case-sensitive', () => {
			assert.strictEqual(parseRenameCommand('/RENAME x'), undefined);
		});
	});

	suite('AgentHostRenameCompletionProvider', () => {
		const session = 'mock:/abc';

		function run(text: string, hasHistory = true, offset = text.length) {
			const provider = new AgentHostRenameCompletionProvider(() => hasHistory);
			return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
		}

		test('offers /rename for a lone "/" when the session has history', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/rename ']);
		});

		test('offers /rename when "/r" is typed', async () => {
			const items = await run('/r');
			assert.deepStrictEqual(items.map(i => i.insertText), ['/rename ']);
		});

		test('omits /rename when the session has no history', async () => {
			const items = await run('/', false);
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when the typed prefix does not match', async () => {
			const items = await run('/zz');
			assert.deepStrictEqual(items, []);
		});

		test('returns nothing when input does not start with /', async () => {
			const items = await run('hello', true, 5);
			assert.deepStrictEqual(items, []);
		});

		test('attachment is Simple with command + description meta', async () => {
			const items = await run('/');
			assert.deepStrictEqual(items.map(i => i.attachment), [{
				type: MessageAttachmentKind.Simple,
				label: '/rename',
				_meta: { command: 'rename', description: 'Rename this chat' },
			}]);
		});
	});
});

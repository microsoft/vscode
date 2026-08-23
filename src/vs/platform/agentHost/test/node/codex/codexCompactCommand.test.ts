/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CODEX_AGENT_PROVIDER_ID } from '../../../common/agent.js';
import { CompletionItemKind } from '../../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../../common/state/protocol/state.js';
import { CODEX_COMPACT_SLASH_COMMAND, CodexCompactCompletionProvider } from '../../../node/codexCompactCommand.js';

suite('CodexCompactCompletionProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const codexSession = `${CODEX_AGENT_PROVIDER_ID}:/abc`;

	function run(text: string, channel = codexSession, hasHistory = true) {
		const provider = new CodexCompactCompletionProvider(() => hasHistory);
		return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel, text, offset: text.length }, CancellationToken.None);
	}

	test('offers /compact with command metadata for Codex sessions with history', async () => {
		const items = await run('/com');
		assert.deepStrictEqual(items, [{
			insertText: '/compact ',
			rangeStart: 0,
			rangeEnd: 4,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/compact',
				_meta: {
					command: CODEX_COMPACT_SLASH_COMMAND,
					description: 'Compact this conversation\'s context',
				},
			},
		}]);
	});

	test('does not offer /compact for empty or non-Codex sessions', async () => {
		assert.deepStrictEqual({
			empty: await run('/', codexSession, false),
			other: await run('/', 'copilotcli:/abc'),
			unrelated: await run('/rename'),
		}, { empty: [], other: [], unrelated: [] });
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildNonPtyShellTerminalUri, parseNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';

suite('Non-PTY shell terminal URI', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips storage, session, chat, and tool-call identities', () => {
		const storage = URI.parse('copilotcli:/peer-storage');
		const session = URI.parse('copilotcli:/owner');
		const chat = URI.parse('ahp-chat://peer/Y29waWxvdGNsaTovb3duZXI');
		const toolCallId = 'call/with & reserved?#characters';
		const resource = URI.parse(buildNonPtyShellTerminalUri(storage, session, chat, toolCallId));

		const parsed = parseNonPtyShellTerminalUri(resource);
		assert.deepStrictEqual({
			storage: parsed?.storage.toString(),
			session: parsed?.session.toString(),
			chat: parsed?.chat.toString(),
			toolCallId: parsed?.toolCallId,
		}, {
			storage: storage.toString(),
			session: session.toString(),
			chat: chat.toString(),
			toolCallId,
		});
	});

	test('rejects unrelated and incomplete resources', () => {
		assert.deepStrictEqual([
			parseNonPtyShellTerminalUri(URI.file('/terminal')),
			parseNonPtyShellTerminalUri(URI.parse('agenthost-terminal://shell/session/tool')),
			parseNonPtyShellTerminalUri(URI.parse('agenthost-terminal://other/session/tool?storage=x&session=y&chat=z&toolCallId=t')),
		], [undefined, undefined, undefined]);
	});
});

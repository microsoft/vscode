/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getOlderHostDefaultChat, getOlderHostSubagentChatUri } from '../../browser/agentHostOlderHostCompatibility.js';
import type { InitializeResult } from '../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI, type RootState } from '../../common/state/sessionState.js';

suite('getOlderHostDefaultChat', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'copilotcli:/session';

	function host(meta: InitializeResult['_meta'], hostBuild?: { version: string }): InitializeResult {
		return {
			protocolVersion: PROTOCOL_VERSION,
			serverSeq: 0,
			snapshots: hostBuild ? [{ resource: ROOT_STATE_URI, state: { agents: [], _meta: { hostBuild } }, fromSeq: 0 }] : [],
			_meta: meta,
		};
	}
	const olderRoot: RootState = { agents: [], _meta: { hostBuild: { version: '1.100.0' } } };

	test('returns the legacy default chat only for older VS Code hosts', () => {
		assert.deepStrictEqual({
			markedVSCodeHost: getOlderHostDefaultChat(session, host({ 'vscode.agentHost': true }), undefined),
			olderVSCodeHostWithHostBuild: getOlderHostDefaultChat(session, host({}, { version: '1.100.0' }), undefined),
			olderVSCodeHostWithRootHostBuild: getOlderHostDefaultChat(session, host({}), olderRoot),
			unmarkedHost: getOlderHostDefaultChat(session, host({}), { agents: [] }),
			unknownHost: getOlderHostDefaultChat(session, undefined, undefined),
		}, {
			markedVSCodeHost: 'ahp-chat://default/Y29waWxvdGNsaTovc2Vzc2lvbg',
			olderVSCodeHostWithHostBuild: 'ahp-chat://default/Y29waWxvdGNsaTovc2Vzc2lvbg',
			olderVSCodeHostWithRootHostBuild: 'ahp-chat://default/Y29waWxvdGNsaTovc2Vzc2lvbg',
			unmarkedHost: undefined,
			unknownHost: undefined,
		});
	});
});

suite('getOlderHostSubagentChatUri', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function host(meta: Record<string, boolean>): InitializeResult {
		return { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [{ resource: ROOT_STATE_URI, state: { agents: [] }, fromSeq: 0 }], _meta: meta };
	}

	test('derives a shaped URI only for a positively identified older VS Code host', () => {
		const session = 'copilotcli:/session';
		const derive = (initialize: InitializeResult | undefined) => getOlderHostSubagentChatUri(session, 'tc-1', initialize, undefined) !== undefined;
		assert.deepStrictEqual({
			olderVSCodeHost: derive(host({ 'vscode.agentHost': true })),
			chatUriAwareHost: derive(host({ 'vscode.agentHost': true, 'vscode.ahpChatUris': true })),
			unmarkedHost: derive(host({})),
			unknownHost: derive(undefined),
		}, { olderVSCodeHost: true, chatUriAwareHost: false, unmarkedHost: false, unknownHost: false });
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getOlderHostDefaultChat } from '../../browser/agentHostOlderHostCompatibility.js';
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

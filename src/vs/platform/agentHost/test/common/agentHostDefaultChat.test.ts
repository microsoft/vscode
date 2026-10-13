/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAdvertisedDefaultChat } from '../../common/agentHostDefaultChat.js';
import type { InitializeResult } from '../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { buildChatUri, buildDefaultChatUri, ROOT_STATE_URI } from '../../common/state/sessionState.js';

suite('getAdvertisedDefaultChat', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'copilotcli:/session';
	const shapedDefault = buildDefaultChatUri(session);
	const advertised = buildChatUri(session, 'main');

	function host(meta: InitializeResult['_meta'], hostBuild?: { version: string }): InitializeResult {
		return {
			protocolVersion: PROTOCOL_VERSION,
			serverSeq: 0,
			snapshots: hostBuild ? [{ resource: ROOT_STATE_URI, state: { agents: [], _meta: { hostBuild } }, fromSeq: 0 }] : [],
			_meta: meta,
		};
	}

	test('resolves the advertised default chat and falls back to the shape only for identified VS Code hosts', () => {
		assert.deepStrictEqual({
			advertisedByVSCodeHost: getAdvertisedDefaultChat(session, advertised, host({ 'vscode.agentHost': true })),
			advertisedByOtherHost: getAdvertisedDefaultChat(session, advertised, host({})),
			markedVSCodeHost: getAdvertisedDefaultChat(session, undefined, host({ 'vscode.agentHost': true })),
			olderVSCodeHostWithHostBuild: getAdvertisedDefaultChat(session, undefined, host({}, { version: '1.100.0' })),
			unmarkedHost: getAdvertisedDefaultChat(session, undefined, host({})),
			unknownHost: getAdvertisedDefaultChat(session, undefined, undefined),
		}, {
			advertisedByVSCodeHost: advertised,
			advertisedByOtherHost: advertised,
			markedVSCodeHost: shapedDefault,
			olderVSCodeHostWithHostBuild: shapedDefault,
			unmarkedHost: undefined,
			unknownHost: undefined,
		});
	});
});

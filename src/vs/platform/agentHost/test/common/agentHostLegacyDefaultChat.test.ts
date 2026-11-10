/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { deriveLegacyDefaultChat } from '../../common/agentHostLegacyDefaultChat.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';

suite('deriveLegacyDefaultChat', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// The URIs older VS Code builds minted, so recorded and cached legacy data keeps resolving.
	const legacySessions: readonly (readonly [session: string, legacyDefaultChat: string])[] = [
		['copilotcli:/9c4a2f18-3b7e-4d0e-9a51-2f6c8e1d7b30', 'ahp-chat://default/Y29waWxvdGNsaTovOWM0YTJmMTgtM2I3ZS00ZDBlLTlhNTEtMmY2YzhlMWQ3YjMw'],
		['ahp-session:/recorded-session', 'ahp-chat://default/YWhwLXNlc3Npb246L3JlY29yZGVkLXNlc3Npb24'],
		['claude:/s?a=b&c=d#frag', 'ahp-chat://default/Y2xhdWRlOi9zP2E9YiZjPWQjZnJhZw'],
		['ahp-session://tenant/opaque%20id/caf\u00e9~??>>', 'ahp-chat://default/YWhwLXNlc3Npb246Ly90ZW5hbnQvb3BhcXVlJTIwaWQvY2Fmw6l-Pz8-Pg'],
		['ahp-session://tenant/opaque%20id/caf\u00e9?>>???', 'ahp-chat://default/YWhwLXNlc3Npb246Ly90ZW5hbnQvb3BhcXVlJTIwaWQvY2Fmw6k_Pj4_Pz8'],
	];

	test('the legacy default chat reproduces the frozen URIs VS Code minted', () => {
		assert.deepStrictEqual(
			legacySessions.map(([session]) => deriveLegacyDefaultChat(session)),
			legacySessions.map(([, legacyDefaultChat]) => legacyDefaultChat),
		);
	});

	// Delete this test when minting new default chats changes: only the legacy derivation is frozen.
	test('the legacy default chat currently equals the minted default chat', () => {
		assert.deepStrictEqual(
			legacySessions.map(([session]) => deriveLegacyDefaultChat(session)),
			legacySessions.map(([session]) => buildDefaultChatUri(session)),
		);
	});
});

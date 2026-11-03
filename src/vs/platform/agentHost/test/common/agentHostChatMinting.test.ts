/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { chatUriFormatOf, createChatUriError, mintDefaultChatUri, mintPeerChatUri, subagentChatUri } from '../../common/agentHostChatMinting.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri } from '../../common/state/sessionState.js';

suite('Agent host chat minting', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'copilotcli:/s1';

	test('the format follows the recorded default chat', () => {
		assert.deepStrictEqual({
			opaque: chatUriFormatOf(mintDefaultChatUri('opaque', session, undefined)),
			shaped: chatUriFormatOf(mintDefaultChatUri('shaped', session, '1')),
			shapedDefault: chatUriFormatOf(buildDefaultChatUri(session)),
			unknown: chatUriFormatOf(undefined),
		}, { opaque: 'opaque', shaped: 'shaped', shapedDefault: 'shaped', unknown: 'shaped' });
	});

	test('opaque peers are opaque and unique', () => {
		const a = mintPeerChatUri('opaque', session);
		assert.ok(/^ahp-chat:\/[0-9a-f-]{36}$/.test(a), a);
		assert.notStrictEqual(a, mintPeerChatUri('opaque', session));
	});

	test('opaque subagent ids derive from the root conversation chat and tool call', () => {
		const rootA = mintDefaultChatUri('opaque', session, undefined);
		const rootB = mintPeerChatUri('opaque', session);
		assert.deepStrictEqual({
			stable: subagentChatUri('opaque', session, rootA, 'call-1') === subagentChatUri('opaque', session, rootA, 'call-1'),
			differsByTool: subagentChatUri('opaque', session, rootA, 'call-1') !== subagentChatUri('opaque', session, rootA, 'call-2'),
			differsByRoot: subagentChatUri('opaque', session, rootA, 'call-1') !== subagentChatUri('opaque', session, rootB, 'call-1'),
			opaque: chatUriFormatOf(subagentChatUri('opaque', session, rootA, 'call-1')),
		}, { stable: true, differsByTool: true, differsByRoot: true, opaque: 'opaque' });
	});

	test('shaped sessions keep shaped subagent ids', () => {
		assert.strictEqual(subagentChatUri('shaped', session, buildDefaultChatUri(session), 'call-1'), buildSubagentChatUri(session, 'call-1'));
	});

	test('createChat accepts any ahp-chat uri in opaque sessions and rejects opaque or foreign uris otherwise', () => {
		const opaqueDefault = mintDefaultChatUri('opaque', session, undefined);
		const shapedDefault = mintDefaultChatUri('shaped', session, '1');
		const opaquePeer = mintPeerChatUri('opaque', session);
		assert.deepStrictEqual({
			anyInOpaque: createChatUriError(opaqueDefault, [], 'ahp-chat:/x/y'),
			shapedInOpaque: createChatUriError(opaqueDefault, [], mintPeerChatUri('shaped', session)),
			opaqueInShaped: createChatUriError(shapedDefault, [], opaquePeer) !== undefined,
			shapedInShaped: createChatUriError(shapedDefault, [], mintPeerChatUri('shaped', session)),
			foreignScheme: createChatUriError(opaqueDefault, [], 'file:///x') !== undefined,
		}, { anyInOpaque: undefined, shapedInOpaque: undefined, opaqueInShaped: true, shapedInShaped: undefined, foreignScheme: true });
	});

	test('createChat rejects a chat whose client chat id equals that of another existing chat', () => {
		const opaqueDefault = mintDefaultChatUri('opaque', session, undefined);
		const uuid = opaqueDefault.slice('ahp-chat:/'.length);
		const lookalike = buildChatUri(session, uuid);
		const peer = mintPeerChatUri('opaque', session);
		assert.deepStrictEqual({
			againstDefault: createChatUriError(opaqueDefault, [], lookalike) !== undefined,
			againstPeer: createChatUriError(opaqueDefault, [peer], `ahp-chat://${peer.slice('ahp-chat:/'.length)}/x`) !== undefined,
			recreateSame: createChatUriError(opaqueDefault, [peer], peer),
			freshPeer: createChatUriError(opaqueDefault, [peer], mintPeerChatUri('opaque', session)),
		}, { againstDefault: true, againstPeer: true, recreateSame: undefined, freshPeer: undefined });
	});
});

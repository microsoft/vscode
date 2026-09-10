/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isTerminalCloseCode, VoiceCloseCode, voiceCloseCodeInfo } from '../../../common/voiceClient/voiceCloseCodes.js';

suite('voiceCloseCodes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies fatal codes as terminal', () => {
		assert.strictEqual(isTerminalCloseCode(VoiceCloseCode.Unauthenticated), true);
		assert.strictEqual(isTerminalCloseCode(VoiceCloseCode.Forbidden), true);
	});

	test('classifies expected codes as terminal but not errors', () => {
		assert.strictEqual(isTerminalCloseCode(VoiceCloseCode.SessionReplaced), true);
		assert.strictEqual(voiceCloseCodeInfo(VoiceCloseCode.SessionReplaced)?.kind, 'expected');
		assert.strictEqual(isTerminalCloseCode(1001), true);
		assert.strictEqual(voiceCloseCodeInfo(1001)?.kind, 'expected');
	});

	test('classifies transient codes as non-terminal so they still reconnect', () => {
		assert.strictEqual(isTerminalCloseCode(VoiceCloseCode.InternalError), false);
		assert.strictEqual(isTerminalCloseCode(VoiceCloseCode.AuthUnavailable), false);
		assert.strictEqual(isTerminalCloseCode(VoiceCloseCode.ServerBusy), false);
	});

	test('maps legacy codes from a backend that predates the registry', () => {
		assert.strictEqual(voiceCloseCodeInfo(1000)?.kind, 'expected');
		assert.strictEqual(voiceCloseCodeInfo(1013)?.kind, 'transient');
		assert.strictEqual(voiceCloseCodeInfo(1011)?.kind, 'transient');
	});

	test('leaves 1006 unmapped because the cause is genuinely unknown', () => {
		// A browser reports 1006 for anything it cannot inspect: DNS, TLS, a proxy
		// rejecting the upgrade.
		assert.strictEqual(voiceCloseCodeInfo(1006), undefined);
		assert.strictEqual(isTerminalCloseCode(1006), false);
	});

	test('offers sign-in for an unauthenticated close and nothing for a forbidden one', () => {
		assert.strictEqual(voiceCloseCodeInfo(VoiceCloseCode.Unauthenticated)?.action, 'signIn');
		assert.strictEqual(voiceCloseCodeInfo(VoiceCloseCode.Forbidden)?.action, undefined);
	});

	test('does not reuse 4000, which the client itself closes with on pong timeout', () => {
		assert.strictEqual(voiceCloseCodeInfo(4000), undefined);
	});
});

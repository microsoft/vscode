/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildSubagentChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { resolveRestoredSubagentChatResource } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';

suite('resolveRestoredSubagentChatResource', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const parent = 'claude:/parent';
	const toolCallId = 'tool-1';
	const canonical = buildSubagentChatUri(parent, toolCallId);

	test('prefers the catalog resource over persisted history', () => {
		assert.strictEqual(resolveRestoredSubagentChatResource(parent, toolCallId, canonical), canonical);
	});

	test('falls back to the canonical chat URI minted for the parent session', () => {
		assert.strictEqual(resolveRestoredSubagentChatResource(parent, toolCallId, undefined), canonical);
	});

});

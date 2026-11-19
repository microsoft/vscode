/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getLegacySessionInitiator, parseSessionInitiator, readSessionInitiator, SESSION_INITIATOR_METADATA_KEY, withSessionInitiator } from '../../common/meta/agentSessionInitiatorMeta.js';

suite('Agent session initiator metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('retains exact creating-client identity and other metadata', () => {
		const initiator = { name: 'vscode-agents-window', title: 'VS Code Agents Window', version: '1.0' };
		const meta = withSessionInitiator({ other: true }, initiator);
		assert.deepStrictEqual({
			read: readSessionInitiator({ _meta: meta }),
			persisted: parseSessionInitiator(JSON.stringify(initiator)),
			unrelated: meta.other,
		}, { read: initiator, persisted: initiator, unrelated: true });
	});

	test('ignores malformed optional client metadata', () => {
		const values = [null, [], '', {}, { name: '' }, { name: ' ' }, { name: 1 }, { name: 'client', title: 1 }, { name: 'client', version: false }];
		assert.deepStrictEqual(values.map(value => readSessionInitiator({ _meta: { [SESSION_INITIATOR_METADATA_KEY]: value } })), values.map(() => undefined));
	});

	test('invalid persisted identity is reported to its caller', () => {
		assert.throws(() => parseSessionInitiator('{"name":false}'));
	});

	test('legacy defaults depend on creating harness and original external state', () => {
		assert.deepStrictEqual([
			getLegacySessionInitiator('copilotcli', true),
			getLegacySessionInitiator('copilot', true),
			getLegacySessionInitiator('claude', true),
			getLegacySessionInitiator('codex', true),
			getLegacySessionInitiator('claude', false),
		], [
			{ name: 'github/autopilot' },
			{ name: 'github/autopilot' },
			{ name: 'claude' },
			{ name: 'codex' },
			{ name: 'vscode' },
		]);
	});
});

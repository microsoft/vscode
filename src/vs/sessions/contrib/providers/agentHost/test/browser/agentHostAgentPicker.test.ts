/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { CustomizationAgentRef } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../browser/agentHostAgentPicker.js';

suite('agentHostAgentPicker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const agents: readonly CustomizationAgentRef[] = [
		{ uri: 'agent://a', name: 'alpha' },
		{ uri: 'agent://b', name: 'beta', description: 'b desc' },
	];

	suite('agentHostAgentPickerStorageKey', () => {
		test('builds a per-scheme storage key', () => {
			assert.strictEqual(
				agentHostAgentPickerStorageKey('agent-host-copilotcli'),
				'workbench.agentsession.agentHostAgentPicker.agent-host-copilotcli.selectedAgentUri',
			);
		});
	});

	suite('resolveAgentHostAgent', () => {
		test('returns the session-selected agent when it is in the list', () => {
			assert.deepStrictEqual(
				resolveAgentHostAgent(agents, { uri: 'agent://b', name: 'beta' }, undefined),
				{ uri: 'agent://b', name: 'beta', description: 'b desc' },
			);
		});

		test('falls back to the stored URI when the session has no selection', () => {
			assert.deepStrictEqual(
				resolveAgentHostAgent(agents, undefined, 'agent://a'),
				{ uri: 'agent://a', name: 'alpha' },
			);
		});

		test('returns undefined when neither session nor stored selection matches the list', () => {
			assert.strictEqual(resolveAgentHostAgent(agents, undefined, 'agent://missing'), undefined);
			assert.strictEqual(resolveAgentHostAgent(agents, { uri: 'agent://missing', name: 'm' }, undefined), undefined);
		});

		test('session selection wins over stored selection', () => {
			assert.deepStrictEqual(
				resolveAgentHostAgent(agents, { uri: 'agent://a', name: 'alpha' }, 'agent://b'),
				{ uri: 'agent://a', name: 'alpha' },
			);
		});

		test('falls through to stored URI when the session agent is not in the list', () => {
			// The session's recorded selection is no longer in the effective
			// agent list (e.g. the customization providing it was removed),
			// so the stored fallback is consulted.
			assert.deepStrictEqual(
				resolveAgentHostAgent(agents, { uri: 'agent://gone', name: 'gone' }, 'agent://a'),
				{ uri: 'agent://a', name: 'alpha' },
			);
		});

		test('returns undefined for an empty agent list', () => {
			assert.strictEqual(resolveAgentHostAgent([], { uri: 'agent://a', name: 'a' }, 'agent://a'), undefined);
			assert.strictEqual(resolveAgentHostAgent([], undefined, undefined), undefined);
		});
	});
});

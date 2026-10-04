/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentPermissionDecisionSource, readAgentPermissionResponseMeta, toAgentPermissionResponseMeta } from '../../common/meta/agentPermissionResponseMeta.js';

suite('Agent permission response metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips each explicit decision source in its namespaced slot', () => {
		const sources: AgentPermissionDecisionSource[] = ['human_response', 'host_policy', 'assisted_approval', 'unattended_fallback'];
		assert.deepStrictEqual(sources.map(decisionSource => {
			const _meta = toAgentPermissionResponseMeta({ decisionSource });
			return { _meta, read: readAgentPermissionResponseMeta({ _meta }) };
		}), sources.map(decisionSource => ({
			_meta: { 'agentHost.permissionDecisionSource': decisionSource },
			read: { decisionSource },
		})));
	});

	test('missing, legacy, malformed and future metadata remain unattributed', () => {
		assert.deepStrictEqual([
			readAgentPermissionResponseMeta({}),
			readAgentPermissionResponseMeta({ _meta: { decisionSource: 'human_response' } }),
			...[undefined, null, false, 1, [], {}, 'user', 'future_source'].map(value =>
				readAgentPermissionResponseMeta({ _meta: { 'agentHost.permissionDecisionSource': value } })),
			toAgentPermissionResponseMeta({}),
		], Array.from({ length: 11 }, () => ({})));
	});

	test('preserves unrelated metadata but replaces rather than inherits previous provenance', () => {
		const _meta = { toolKind: 'terminal', language: 'bash', 'agentHost.permissionDecisionSource': 'human_response' };
		assert.deepStrictEqual({
			automatic: toAgentPermissionResponseMeta({ decisionSource: 'host_policy' }, { _meta }),
			unattributed: toAgentPermissionResponseMeta({}, { _meta }),
			original: _meta,
		}, {
			automatic: { toolKind: 'terminal', language: 'bash', 'agentHost.permissionDecisionSource': 'host_policy' },
			unattributed: { toolKind: 'terminal', language: 'bash' },
			original: { toolKind: 'terminal', language: 'bash', 'agentHost.permissionDecisionSource': 'human_response' },
		});
	});
});

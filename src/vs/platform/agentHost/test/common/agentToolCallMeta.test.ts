/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { type AgentFusionPhaseStatus, isPresentationOnlyToolCall, readToolCallMeta, toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';

suite('Agent tool call metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const phase = { fusionId: 'fusion', phaseId: 'phase', model: 'model', startedAt: 123, duration: 10 };

	test('classifies presentation-only calls by validated tool kind', () => {
		const kinds = ['fusionPhase', 'terminal', 'subagent', 'search', 'read', 'future', undefined, null, 1];
		assert.deepStrictEqual({
			missing: isPresentationOnlyToolCall({}),
			phaseWithoutKind: isPresentationOnlyToolCall({ _meta: { fusionPhase: { ...phase, status: 'running' } } }),
			kinds: kinds.map(toolKind => isPresentationOnlyToolCall({ _meta: { toolKind } })),
		}, {
			missing: false,
			phaseWithoutKind: false,
			kinds: [true, false, false, false, false, false, false, false, false],
		});
	});

	test('round trips every recognized Fusion phase status', () => {
		const statuses: AgentFusionPhaseStatus[] = ['running', 'succeeded', 'failed', 'cancelled'];
		assert.deepStrictEqual(statuses.map(status => {
			const fusionPhase = { ...phase, status };
			return readToolCallMeta({ _meta: toToolCallMeta({ toolKind: 'fusionPhase', fusionPhase }) });
		}), statuses.map(status => ({ toolKind: 'fusionPhase', fusionPhase: { ...phase, status } })));
	});

	test('rejects malformed and unknown Fusion phase statuses', () => {
		const invalid: readonly unknown[] = [undefined, null, '', 'completed', 'future', 1, true, {}, []];
		assert.deepStrictEqual(invalid.map(status =>
			readToolCallMeta({ _meta: { fusionPhase: { ...phase, status } } }).fusionPhase
		), invalid.map(() => undefined));
	});
});

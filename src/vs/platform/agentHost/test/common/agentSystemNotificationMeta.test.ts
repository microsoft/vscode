/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSystemNotificationKind, type AgentFusionProgressStatus, readAgentSystemNotificationMeta, toAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';

suite('Agent system notification metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips Fusion statuses with the standard undefined property shape', () => {
		const statuses: AgentFusionProgressStatus[] = ['selected', 'completed', 'failed', 'cancelled', 'degraded'];
		assert.deepStrictEqual(statuses.map(fusionStatus =>
			readAgentSystemNotificationMeta({ _meta: toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.FusionProgress, fusionStatus }) })
		), statuses.map(fusionStatus => ({
			kind: AgentSystemNotificationKind.FusionProgress,
			severity: undefined,
			workspaceKind: undefined,
			workspaceName: undefined,
			fusionStatus,
		})));
	});

	test('returns undefined for missing or malformed Fusion statuses', () => {
		const invalid: readonly unknown[] = [undefined, null, '', 'running', 'future', 1, true, {}, []];
		assert.deepStrictEqual(invalid.map(fusionStatus =>
			readAgentSystemNotificationMeta({ _meta: { fusionStatus } })
		), invalid.map(() => ({
			kind: undefined,
			severity: undefined,
			workspaceKind: undefined,
			workspaceName: undefined,
			fusionStatus: undefined,
		})));
	});
});

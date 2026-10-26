/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { agentModelCatalogStatusKey, readAgentModelCatalogStatus } from '../../common/agentModelCatalogStatus.js';
import type { RootState } from '../../common/state/protocol/state.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('AgentModelCatalogStatus', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads only valid namespaced statuses', () => {
		const key = agentModelCatalogStatusKey('copilotcli');
		const read = (value: unknown) => readAgentModelCatalogStatus({
			agents: [],
			config: { schema: { type: 'object', properties: {} }, values: { [key]: value } },
		} satisfies RootState, 'copilotcli');

		assert.deepStrictEqual(
			['pending', 'ready', 'error', 'resolved', undefined].map(read),
			['pending', 'ready', 'error', undefined, undefined],
		);
	});
});

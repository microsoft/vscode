/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasAgentModelProviderMetadata, readAgentModelProvider, toAgentModelProviderMeta } from '../../common/meta/agentModelProvider.js';
import { getCopilotModelProvider } from '../../node/copilot/copilotModelProvider.js';

suite('Copilot model provider projection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers a captured binding while preserving unknown native account identity', () => {
		const provider = { id: 'copilot', kind: 'copilot', label: 'GitHub Copilot' };
		const providerBinding = { id: 'configuration', label: 'Endpoint', provenance: { providerKind: 'openai', source: 'configured' } };
		assert.deepStrictEqual([
			getCopilotModelProvider({ provider }),
			getCopilotModelProvider({ provider, providerBinding }),
			getCopilotModelProvider({ providerBinding: { ...providerBinding, accountRef: { selectionId: 'captured-account' } } }),
			getCopilotModelProvider({}),
		], [
			provider,
			{ id: 'configuration', kind: 'openai', label: 'Endpoint', binding: { source: 'configured' } },
			{ id: 'configuration', kind: 'openai', label: 'Endpoint', binding: { source: 'configured', accountRef: { selectionId: 'captured-account' } } },
			undefined,
		]);
	});

	test('keeps malformed binding declarations visible to downstream validation instead of using a legacy product', () => {
		const provider = { id: 'copilot', kind: 'copilot', label: 'GitHub Copilot' };
		assert.deepStrictEqual([null, {}, { id: 'incomplete' }, {
			id: 'configuration', label: 'Endpoint', provenance: { providerKind: 'openai', source: 'configured' }, accountRef: null,
		}].map(providerBinding => {
			const source = JSON.parse(JSON.stringify({ provider, providerBinding }));
			const metadata = { _meta: toAgentModelProviderMeta(getCopilotModelProvider(source)) };
			return { declared: hasAgentModelProviderMetadata(metadata), parsed: readAgentModelProvider(metadata) };
		}), Array.from({ length: 4 }, () => ({ declared: true, parsed: undefined })));
	});
});

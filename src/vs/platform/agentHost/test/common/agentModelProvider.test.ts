/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAgentModelExecution, readAgentModelProvider, toAgentModelExecutionMeta, toAgentModelProviderMeta } from '../../common/meta/agentModelProvider.js';

suite('Agent model provider metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips arbitrary provider identities without interpreting their kind or id', () => {
		const providers = [
			{ id: 'copilot', kind: 'copilot', label: 'GitHub Copilot' },
			{ id: 'account-bound-native-provider', kind: 'loki', label: 'Microsoft 365 Copilot' },
			{ id: 'custom/provider/with/slashes', kind: 'configured', label: 'My provider' },
			{ id: 'future-provider', kind: 'future', label: 'Another provider' },
		];
		assert.deepStrictEqual(providers.map(provider => readAgentModelProvider(JSON.parse(JSON.stringify({
			_meta: { ...toAgentModelProviderMeta(provider), unrelated: true },
		})))), providers);
	});

	test('rejects malformed provider references without inferring one from a model id', () => {
		const invalid = [undefined, null, [], {}, 'copilot', { id: '', kind: 'copilot', label: 'GitHub Copilot' },
			{ id: 'provider', kind: 1, label: 'Provider' }, { id: 'provider', kind: 'future', label: ' ' }];
		assert.deepStrictEqual(invalid.map(value => readAgentModelProvider({
			_meta: {
				'vscode.modelProvider': value,
				modelProviderId: 'copilot',
				modelSourceId: 'copilot',
			}
		})), invalid.map(() => undefined));
	});

	test('preserves actual-call attribution and display name independently of catalog availability', () => {
		const provider = { id: 'account-provider', kind: 'loki', label: 'Microsoft 365 Copilot' };
		const execution = { provider, modelId: 'same-model', modelDisplayName: 'Shared Model' };
		assert.deepStrictEqual({
			full: readAgentModelExecution({ _meta: toAgentModelExecutionMeta(execution) }),
			withoutName: readAgentModelExecution({ _meta: toAgentModelExecutionMeta({ provider, modelId: 'same-model' }) }),
			unknown: toAgentModelExecutionMeta(undefined),
			unknownProvider: toAgentModelProviderMeta(undefined),
		}, { full: execution, withoutName: { provider, modelId: 'same-model' }, unknown: undefined, unknownProvider: undefined });
	});

	test('validates all execution attribution fields', () => {
		const provider = { id: 'account-provider', kind: 'future', label: 'Provider' };
		const invalid = [undefined, null, [], {}, { provider, modelId: '' }, { provider, modelId: 4 },
			{ provider: { id: 'provider' }, modelId: 'model' }, { provider, modelId: 'model', modelDisplayName: false },
			{ provider, modelId: 'model', modelDisplayName: ' ' }];
		assert.deepStrictEqual(invalid.map(value => readAgentModelExecution({ _meta: { 'vscode.modelExecution': value } })), invalid.map(() => undefined));
	});
});

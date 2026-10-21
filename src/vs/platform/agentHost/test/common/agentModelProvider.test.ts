/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentModelProviderKey, getAgentModelUsageKey, readAgentModelExecution, readAgentModelProvider, toAgentModelExecutionMeta, toAgentModelProviderMeta } from '../../common/meta/agentModelProvider.js';
import { readUsageInfoMeta } from '../../common/meta/agentUsageMeta.js';
import { mergeLogicalTurnUsage } from '../../common/state/sessionState.js';

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

	test('captures binding and account identity without retaining mutable input references', () => {
		const provider = { id: 'configuration', kind: 'future', label: 'Source', binding: { source: 'configured', accountRef: { selectionId: 'account-a' } } };
		const catalog = { _meta: toAgentModelProviderMeta(provider) };
		const call = { _meta: toAgentModelExecutionMeta({ provider, modelId: 'model' }) };
		provider.binding.accountRef.selectionId = 'account-b';
		const expected = { ...provider, binding: { source: 'configured', accountRef: { selectionId: 'account-a' } } };
		assert.deepStrictEqual({
			catalog: readAgentModelProvider(JSON.parse(JSON.stringify(catalog))),
			call: readAgentModelExecution(JSON.parse(JSON.stringify(call))),
		}, { catalog: expected, call: { modelId: 'model', provider: expected } });
	});

	test('does not downgrade malformed binding or account identity into legacy or anonymous attribution', () => {
		const invalid = [null, {}, { source: '' }, { source: 1 }, { source: 'configured', accountRef: null },
			{ source: 'configured', accountRef: {} }, { source: 'configured', accountRef: { selectionId: '' } }];
		assert.deepStrictEqual(invalid.map(binding => readAgentModelProvider({
			_meta: { 'vscode.modelProvider': { id: 'source', kind: 'future', label: 'Source', binding } },
		})), invalid.map(() => undefined));
	});

	test('namespaces configuration, account, legacy product, and unknown identities without using labels', () => {
		const legacy = { id: 'source', kind: 'future', label: 'Source' };
		const binding = { ...legacy, binding: { source: 'configured' } };
		const account = { ...binding, binding: { ...binding.binding, accountRef: { selectionId: 'account-a' } } };
		assert.deepStrictEqual({
			sources: [legacy, binding, account].map(getAgentModelProviderKey),
			renamed: getAgentModelUsageKey('model', { ...account, kind: 'renamed-kind', label: 'Renamed Source' }) === getAgentModelUsageKey('model', account),
			namespaceCollision: getAgentModelUsageKey('model', { ...legacy, id: getAgentModelProviderKey(binding) }) === getAgentModelUsageKey('model', binding),
			distinct: new Set([
				legacy, binding, account,
				{ ...binding, binding: { ...binding.binding, accountRef: { selectionId: 'account-b' } } },
				{ ...binding, id: 'other-source' },
				undefined,
			].map(provider => getAgentModelUsageKey('model', provider))).size,
		}, {
			sources: ['["provider","source"]', '["binding","source",null]', '["binding","source","account-a"]'],
			renamed: true, namespaceCollision: false, distinct: 6,
		});
	});

	test('resumed usage keeps accounts and legacy provider references separate under the same configuration id', () => {
		const provider = { id: 'shared-id', kind: 'future', label: 'Source' };
		const account = { ...provider, binding: { source: 'configured', accountRef: { selectionId: 'account-a' } } };
		const total = { model: 'model', inputTokens: 10, cachedTokens: 0, outputTokens: 2 };
		const rows = [
			{ ...total, provider },
			{ ...total, provider: { ...provider, binding: { source: 'configured' } } },
			{ ...total, provider: account },
			{ ...total, provider: { ...account, binding: { ...account.binding, accountRef: { selectionId: 'account-b' } } } },
		];
		const merged = mergeLogicalTurnUsage(
			{ _meta: { turnTokenTotals: rows } },
			{ _meta: { turnTokenTotals: [{ ...total, provider: account }] } },
		);
		assert.deepStrictEqual(readUsageInfoMeta(merged).turnTokenTotals, rows.map(row =>
			row.provider === account ? { ...row, inputTokens: 20, outputTokens: 4 } : row));
	});

	test('preserves provider-separated token totals across resumed attempts', () => {
		const copilot = { id: 'copilot', kind: 'copilot', label: 'GitHub Copilot' };
		const other = { id: 'another-provider', kind: 'future', label: 'Other Source' };
		const total = { model: 'same-model', inputTokens: 10, cachedTokens: 0, outputTokens: 2 };
		const previous = { _meta: { turnTokenTotals: [{ ...total, provider: copilot }, { ...total, provider: other }, total] } };
		const current = { _meta: { turnTokenTotals: [{ ...total, provider: copilot }] } };
		const merged = mergeLogicalTurnUsage(JSON.parse(JSON.stringify(previous)), JSON.parse(JSON.stringify(current)));
		assert.deepStrictEqual(readUsageInfoMeta(merged).turnTokenTotals, [
			{ ...total, provider: copilot, inputTokens: 20, outputTokens: 4 },
			{ ...total, provider: other },
			total,
		]);
	});

	test('does not downgrade malformed provider token totals into an unknown bucket', () => {
		const total = { model: 'model', inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
		const provider = { id: 'provider', kind: 'future', label: 'Provider' };
		const result = readUsageInfoMeta({
			_meta: {
				turnTokenTotals: [
					total,
					{ ...total, provider },
					{ ...total, provider: { id: 'provider' } },
				]
			}
		});
		assert.deepStrictEqual(result.turnTokenTotals, [total, { ...total, provider }]);
	});
});

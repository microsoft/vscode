/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CLAUDE_AGENT_PROVIDER_ID, IAgentModelInfo } from '../../common/agent.js';
import { createAgentModelCatalog } from '../../common/agentModelSource.js';
import { projectLegacyModelSourceCatalog } from '../../common/agentModelSelection.js';
import type { ModelSelection } from '../../common/state/sessionState.js';
import { toAgentModelProviderMeta } from '../../common/meta/agentModelProvider.js';
import { claudeNativeModelSource, claudeProxyModelSource, claudeTransportForProvider, mergeClaudeModelCatalogs, normalizeClaudeModelSelection, parseClaudeModelSelection, resolveClaudeSessionTransport, toClaudeSdkModelId } from '../../node/claude/claudeModelSelection.js';

suite('claudeModelSelection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const copilotMeta = toAgentModelProviderMeta({ id: 'copilot', kind: 'copilot', label: 'GitHub Copilot' });

	test('standard selections keep raw IDs and qualifiers separate without parsing the raw ID', () => {
		const selections: ModelSelection[] = [
			{ id: 'shared', modelSourceId: 'anthropic', config: { reasoningEffort: 'high' } },
			{ id: 'shared', modelSourceId: 'copilot' },
			{ id: '@provider=copilot:literal-id', modelSourceId: 'anthropic' },
		];
		assert.deepStrictEqual(selections.map(normalizeClaudeModelSelection), selections);
	});

	test('normalizes historical provider wrappers only at the host compatibility seam', () => {
		assert.deepStrictEqual([
			normalizeClaudeModelSelection({ id: '@provider=anthropic:org%2Fmodel%3Alatest', config: { effort: 'high' } }),
			normalizeClaudeModelSelection({ id: '@provider=copilot:claude-opus-4.6' }),
			normalizeClaudeModelSelection({ id: 'legacy' }),
		], [
			{ id: 'org/model:latest', modelSourceId: 'anthropic', config: { effort: 'high' } },
			{ id: 'claude-opus-4.6', modelSourceId: 'copilot' },
			{ id: 'legacy' },
		]);
	});

	test('unknown or malformed sources fail instead of choosing the proxy or native default', () => {
		for (const selection of [
			{ id: 'shared', modelSourceId: 'unknown' },
			{ id: 'shared', modelSourceId: '' },
			{ id: '@provider=unknown:shared' },
			{ id: '@provider=anthropic' },
			{ id: '@provider=anthropic:%ZZ' },
			{ id: '@provider=anthropic:' },
		]) {
			assert.throws(() => normalizeClaudeModelSelection(selection), /model.source|model source/);
		}
		assert.throws(() => claudeTransportForProvider('unknown'), /model source/);
	});

	test('publishes an atomic source catalog with duplicate raw IDs and no private grouping metadata', () => {
		const model = (name: string): IAgentModelInfo => ({ provider: CLAUDE_AGENT_PROVIDER_ID, id: 'shared', name, supportsVision: true });
		const native = model('Native model');
		const proxy = { ...model('Proxy model'), _meta: { multiplierNumeric: 2 } };
		const catalog = createAgentModelCatalog(mergeClaudeModelCatalogs([proxy], [native]));
		const legacy = projectLegacyModelSourceCatalog({ provider: CLAUDE_AGENT_PROVIDER_ID, displayName: 'Claude', description: '', capabilities: { modelSourceSelection: {} }, ...catalog });
		assert.deepStrictEqual({ catalog, legacyModels: legacy.models, legacySources: legacy.modelSources }, {
			catalog: {
				modelSources: [claudeNativeModelSource, claudeProxyModelSource],
				models: [{ ...native, modelSourceId: 'anthropic' }, { ...proxy, modelSourceId: 'copilot', _meta: { ...proxy._meta, ...copilotMeta } }],
			},
			legacyModels: [],
			legacySources: undefined,
		});
	});

	test('source loss retains only the other source without changing its identity', () => {
		const model: IAgentModelInfo = { provider: CLAUDE_AGENT_PROVIDER_ID, id: 'shared', name: 'Shared', supportsVision: false };
		assert.deepStrictEqual([
			createAgentModelCatalog(mergeClaudeModelCatalogs([], [model])),
			createAgentModelCatalog(mergeClaudeModelCatalogs([model], [])),
		], [
			{ models: [{ ...model, modelSourceId: 'anthropic' }], modelSources: [claudeNativeModelSource] },
			{ models: [{ ...model, modelSourceId: 'copilot', _meta: copilotMeta }], modelSources: [claudeProxyModelSource] },
		]);
	});

	test('source-qualified selections choose their transport while genuinely legacy IDs preserve the default', () => {
		assert.deepStrictEqual([
			resolveClaudeSessionTransport({ model: { id: 'shared', modelSourceId: 'anthropic' }, defaultMode: 'proxy' }),
			resolveClaudeSessionTransport({ model: { id: 'shared', modelSourceId: 'copilot' }, defaultMode: 'native' }),
			resolveClaudeSessionTransport({ model: { id: '@provider=anthropic:shared' }, defaultMode: 'proxy' }),
			resolveClaudeSessionTransport({ model: { id: 'legacy' }, defaultMode: 'native' }),
			resolveClaudeSessionTransport({ model: { id: 'legacy' }, defaultMode: 'proxy' }),
			resolveClaudeSessionTransport({ model: undefined, defaultMode: 'native' }),
			resolveClaudeSessionTransport({ model: undefined, defaultMode: 'proxy' }),
			parseClaudeModelSelection({ id: 'legacy' }),
		], ['native', 'proxy', 'native', 'native', 'proxy', 'native', 'proxy', { provider: 'copilot', modelId: 'legacy', explicitProvider: false }]);
	});

	test('only the bare SDK model identifier crosses the SDK seam', () => {
		assert.deepStrictEqual([
			toClaudeSdkModelId({ id: 'claude-sonnet-4-5-20250929', modelSourceId: 'anthropic' }),
			toClaudeSdkModelId({ id: 'claude-opus-4.6', modelSourceId: 'copilot' }),
			toClaudeSdkModelId({ id: '@provider=anthropic:claude-sonnet-4-5-20250929' }),
			toClaudeSdkModelId({ id: 'claude-opus-4.6' }),
			toClaudeSdkModelId(undefined),
		], ['claude-sonnet-4-5', 'claude-opus-4-6', 'claude-sonnet-4-5', 'claude-opus-4-6', undefined]);
	});
});

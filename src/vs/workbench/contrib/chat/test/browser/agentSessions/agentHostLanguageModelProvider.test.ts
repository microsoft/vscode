/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SessionModelInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';

suite('AgentHostLanguageModelProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function makeModel(id: string, meta?: Record<string, unknown>): SessionModelInfo {
		return { id, provider: 'copilotcli', name: id === 'auto' ? 'Auto' : id, ...(meta && { _meta: meta }) };
	}

	function createProvider(): AgentHostLanguageModelProvider {
		return store.add(new AgentHostLanguageModelProvider('agent-host-copilotcli', 'copilotcli'));
	}

	test('renders the auto-mode discount as the Auto model detail (and a tooltip)', async () => {
		const provider = createProvider();
		provider.updateModels([makeModel('auto', { discountPercent: 10 }), makeModel('gpt-5')]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const auto = infos.find(m => m.metadata.id === 'auto');
		const concrete = infos.find(m => m.metadata.id === 'gpt-5');

		assert.strictEqual(auto?.metadata.detail, '10% discount');
		assert.ok(auto?.metadata.tooltip?.includes('10% discount'), 'Auto tooltip should mention the discount');
		assert.ok(auto?.metadata.tooltip?.includes('Learn More'), 'Auto tooltip should include the Learn More link');

		// Concrete models get neither the discount detail nor the Auto tooltip.
		assert.strictEqual(concrete?.metadata.detail, undefined);
		assert.strictEqual(concrete?.metadata.tooltip, undefined);
	});

	test('shows the Auto tooltip but no detail when there is no positive discount', async () => {
		const provider = createProvider();

		// The realistic cold-open case: the runtime omits billing, so there is no discount to show.
		provider.updateModels([makeModel('auto')]);
		let auto = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).find(m => m.metadata.id === 'auto');
		assert.strictEqual(auto?.metadata.detail, undefined, 'absent discount → no detail');
		assert.ok(auto?.metadata.tooltip && auto.metadata.tooltip.length > 0, 'Auto still has a tooltip');
		assert.ok(!auto?.metadata.tooltip?.includes('discount'), 'no discount → tooltip omits the discount sentence');

		// Guard: a literal 0 must not render a misleading "0% discount".
		provider.updateModels([makeModel('auto', { discountPercent: 0 })]);
		auto = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).find(m => m.metadata.id === 'auto');
		assert.strictEqual(auto?.metadata.detail, undefined, 'discountPercent 0 → no detail');
	});

	test('carries picker category, price category, and promo from model metadata', async () => {
		const provider = createProvider();
		provider.updateModels([makeModel('claude-sonnet', {
			category: 'powerful',
			priceCategory: 'medium',
			promo: {
				id: 'summer-sale',
				discountPercent: 25,
				endsAt: '2026-08-01T00:00:00Z',
				message: 'Save on Claude Sonnet',
			},
		})]);

		const metadata = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None))[0].metadata;
		assert.deepStrictEqual({
			category: metadata.category,
			priceCategory: metadata.priceCategory,
			promo: metadata.promo,
		}, {
			category: 'powerful',
			priceCategory: 'medium',
			promo: {
				id: 'summer-sale',
				discountPercent: 25,
				endsAt: '2026-08-01T00:00:00Z',
				message: 'Save on Claude Sonnet',
			},
		});
	});

	test('derives the picker group from the model-id prefix, not the harness provider', async () => {
		const provider = createProvider();
		// The agent host reports every model under the harness provider (`copilotcli`);
		// the upstream provider lives in the id prefix. Native models have no prefix.
		provider.updateModels([
			{ id: 'claude-haiku-4.5', provider: 'copilotcli', name: 'Claude Haiku 4.5' },
			{ id: 'openai/gpt-5-nano', provider: 'copilotcli', name: 'GPT-5 nano' },
			{ id: 'huggingface/allenai/Olmo-3-7B-Instruct:cheapest', provider: 'copilotcli', name: 'Olmo 3' },
			{ id: 'acme/model', provider: 'copilotcli', name: 'Acme' },
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const groups = Object.fromEntries(infos.map(m => [m.metadata.id, m.metadata.modelGroup]));

		// The group carries only the vendor id — native (no prefix) → harness `provider`,
		// BYOK-routed → id prefix. The picker resolves the display name from the vendor registry.
		assert.deepStrictEqual(groups, {
			'claude-haiku-4.5': { id: 'copilotcli' },
			'openai/gpt-5-nano': { id: 'openai' },
			'huggingface/allenai/Olmo-3-7B-Instruct:cheapest': { id: 'huggingface' },
			'acme/model': { id: 'acme' },
		});
	});

	test('omits the model group when the provider is empty', async () => {
		const provider = createProvider();
		provider.updateModels([{ id: 'x', provider: '', name: 'X' }]);

		const info = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None))[0];
		assert.strictEqual(info.metadata.modelGroup, undefined);
	});

	test('carries the BYOK model identifier from _meta so the Manage Models toggle can be honoured', async () => {
		const provider = createProvider();
		// A grouped BYOK copy: the node agent host carried the original LM service identifier
		// (`<vendor>/<group>/<id>`) via _meta; the provider surfaces it verbatim.
		provider.updateModels([
			makeModel('openrouter/aion-labs/aion-3.0', { byokModelIdentifier: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' }),
			// A groupless BYOK copy and a native model (no _meta) for contrast.
			makeModel('anthropic/claude-sonnet-4', { byokModelIdentifier: 'anthropic/claude-sonnet-4' }),
			makeModel('claude-haiku-4.5'),
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const byName = Object.fromEntries(infos.map(m => [m.metadata.id, m.metadata]));

		// The carried identifier is surfaced on the metadata and returned by the accessor.
		assert.deepStrictEqual({
			grouped: {
				byokModelIdentifier: byName['openrouter/aion-labs/aion-3.0'].byokModelIdentifier,
				manageModelsId: ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(byName['openrouter/aion-labs/aion-3.0']),
			},
			groupless: {
				byokModelIdentifier: byName['anthropic/claude-sonnet-4'].byokModelIdentifier,
				manageModelsId: ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(byName['anthropic/claude-sonnet-4']),
			},
			native: {
				byokModelIdentifier: byName['claude-haiku-4.5'].byokModelIdentifier,
				manageModelsId: ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(byName['claude-haiku-4.5']),
			},
		}, {
			grouped: { byokModelIdentifier: 'openrouter/OpenRouter 2/aion-labs/aion-3.0', manageModelsId: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' },
			groupless: { byokModelIdentifier: 'anthropic/claude-sonnet-4', manageModelsId: 'anthropic/claude-sonnet-4' },
			native: { byokModelIdentifier: undefined, manageModelsId: undefined },
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
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

	test('groups the Auto routing-profile picker where thinking level renders for other models', async () => {
		const provider = createProvider();
		provider.updateModels([
			{
				...makeModel('auto'),
				configSchema: {
					type: 'object',
					properties: { tier: { type: 'string', title: 'Optimize for', enum: ['efficiency', 'balance', 'intelligence'], default: 'balance' } },
				},
			},
			{
				...makeModel('gpt-5'),
				configSchema: {
					type: 'object',
					properties: {
						thinkingLevel: { type: 'string', title: 'Thinking Level', enum: ['low', 'high'] },
						contextSize: { type: 'number', title: 'Context Size', enum: [200_000, 1_000_000] },
						somethingElse: { type: 'string', title: 'Something Else' },
					},
				},
			},
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(
			infos.map(info => Object.fromEntries(Object.entries(info.metadata.configurationSchema?.properties ?? {}).map(([key, property]) => [key, property.group]))),
			[
				// The Auto model has no thinking level, so its profile takes that slot.
				{ tier: 'navigation' },
				{ thinkingLevel: 'navigation', contextSize: 'tokens', somethingElse: undefined },
			]
		);
	});

	test('groups the config keys the Copilot agent host names, so a sandbox session can configure its model', async () => {
		const provider = createProvider();
		provider.updateModels([
			{
				...makeModel('claude-sonnet-4.6'),
				configSchema: {
					type: 'object',
					properties: {
						reasoningEffort: { type: 'string', title: 'Reasoning effort', enum: ['low', 'high'] },
						contextTier: { type: 'string', title: 'Context tier', enum: ['default', 'long_context'], enumLabels: ['Default', 'Long context'], default: 'default' },
					},
				},
			},
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(
			Object.fromEntries(Object.entries(infos[0].metadata.configurationSchema?.properties ?? {}).map(([key, property]) => [key, property.group])),
			{ reasoningEffort: 'navigation', contextTier: 'tokens' }
		);
	});

	test('derives reasoning-effort display text only when the host supplied none', async () => {
		const provider = createProvider();
		provider.updateModels([
			{
				...makeModel('claude-sonnet-4.6'),
				configSchema: {
					type: 'object',
					properties: { reasoningEffort: { type: 'string', title: 'Reasoning effort', enum: ['minimal', 'xhigh'] } },
				},
			},
			{
				...makeModel('gpt-5'),
				configSchema: {
					type: 'object',
					properties: { reasoningEffort: { type: 'string', title: 'Reasoning effort', enum: ['minimal'], enumLabels: ['Host Wins'], enumDescriptions: ['Host description'] } },
				},
			},
			{
				// Labels but no descriptions: the producer described its values by omission, so
				// neither half is replaced.
				...makeModel('gemini-3-pro'),
				configSchema: {
					type: 'object',
					properties: { reasoningEffort: { type: 'string', title: 'Reasoning effort', enum: ['minimal'], enumLabels: ['Host Wins'] } },
				},
			},
			{
				// Non-string values cannot be labelled as effort levels, so they are left alone.
				...makeModel('numeric'),
				configSchema: {
					type: 'object',
					properties: { reasoningEffort: { type: 'number', title: 'Reasoning effort', enum: [1, 2] } },
				},
			},
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(
			infos.map(info => {
				const property = info.metadata.configurationSchema?.properties?.reasoningEffort;
				return { id: info.metadata.id, labels: property?.enumItemLabels, descriptions: property?.enumDescriptions, default: property?.default };
			}),
			[
				{
					id: 'claude-sonnet-4.6',
					labels: ['Minimal', 'Extra High'],
					descriptions: ['Minimal reasoning for fastest responses', 'Highest reasoning depth but slowest'],
					// No default is invented: schema defaults are sent, and the host expects the
					// value omitted so the backend can choose.
					default: undefined,
				},
				{ id: 'gpt-5', labels: ['Host Wins'], descriptions: ['Host description'], default: undefined },
				{ id: 'gemini-3-pro', labels: ['Host Wins'], descriptions: undefined, default: undefined },
				{ id: 'numeric', labels: undefined, descriptions: undefined, default: undefined },
			]
		);
	});

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
		provider.updateModels([
			makeModel('claude-sonnet', {
				category: 'powerful',
				priceCategory: 'medium',
				promo: {
					id: 'summer-sale',
					discountPercent: 25,
					endsAt: '2026-08-01T00:00:00Z',
					message: 'Save on Claude Sonnet',
				},
			}),
			// Open-ended, message-only promo: the untyped `_meta` read must keep it
			// rather than drop the promo for the missing `endsAt` / zero discount.
			makeModel('gpt-5', {
				promo: {
					id: 'featured',
					discountPercent: 0,
					message: 'Now available',
				},
			}),
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(infos.map(info => ({
			category: info.metadata.category,
			priceCategory: info.metadata.priceCategory,
			promo: info.metadata.promo,
		})), [
			{
				category: 'powerful',
				priceCategory: 'medium',
				promo: {
					id: 'summer-sale',
					discountPercent: 25,
					endsAt: '2026-08-01T00:00:00Z',
					message: 'Save on Claude Sonnet',
				},
			},
			{
				category: undefined,
				priceCategory: undefined,
				promo: { id: 'featured', discountPercent: 0, message: 'Now available' },
			},
		]);
	});

	test('reads the capability category from the namespaced key the Copilot agent host uses', async () => {
		const provider = createProvider();
		provider.updateModels([
			makeModel('claude-sonnet-4.6', { 'copilot.modelPickerCategory': 'powerful' }),
			// A flat key still wins, so a host publishing both is not overridden.
			makeModel('gpt-5', { category: 'versatile', 'copilot.modelPickerCategory': 'powerful' }),
			makeModel('gemini', { 'copilot.modelPickerCategory': 42 }),
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(
			infos.map(info => ({ id: info.metadata.id, category: info.metadata.category })),
			[
				{ id: 'claude-sonnet-4.6', category: 'powerful' },
				{ id: 'gpt-5', category: 'versatile' },
				{ id: 'gemini', category: undefined },
			]
		);
	});

	/** A catalogue stub standing in for the workbench's CAPI-backed Copilot models. */
	function catalogue(models: readonly { id: string; maxInputTokens?: number; maxOutputTokens?: number; multiplierNumeric?: number; category?: string; contextSizes?: number[]; vendor?: string }[]) {
		const onDidChange = store.add(new Emitter<string>());
		const byIdentifier = new Map<string, ILanguageModelChatMetadata>(models.map(model => [
			`catalogue:${model.vendor ?? 'copilot'}:${model.id}`,
			upcastPartial<ILanguageModelChatMetadata>({
				id: model.id,
				name: model.id,
				vendor: model.vendor ?? 'copilot',
				maxInputTokens: model.maxInputTokens,
				maxOutputTokens: model.maxOutputTokens,
				multiplierNumeric: model.multiplierNumeric,
				category: model.category,
				...(model.contextSizes ? {
					configurationSchema: { properties: { contextSize: { type: 'number', enum: model.contextSizes } } },
				} : {}),
			}),
		]));
		return {
			fire: (vendor: string = 'copilot') => onDidChange.fire(vendor),
			catalogue: {
				getLanguageModelIds: () => [...byIdentifier.keys()],
				lookupLanguageModel: (identifier: string) => byIdentifier.get(identifier),
				onDidChangeLanguageModels: onDidChange.event,
			},
		};
	}

	test('publishes the host context tiers with the host labels, not catalogue token counts', async () => {
		// The host's tier enum and the catalogue's `contextSize` list are independent catalogues,
		// so pairing them by position mislabels the moment either changes. The host names its own.
		const { catalogue: known } = catalogue([{ id: 'claude-opus-5', contextSizes: [264_000, 1_000_000] }]);
		const provider = store.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'copilot', known));
		provider.updateModels([
			{
				...makeModel('claude-opus-5'),
				provider: 'copilot',
				configSchema: {
					type: 'object',
					properties: { contextTier: { type: 'string', title: 'Context tier', enum: ['default', 'long_context'], enumLabels: ['Default', 'Long context'], default: 'default' } },
				},
			},
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const tier = infos[0].metadata.configurationSchema?.properties?.contextTier;
		assert.deepStrictEqual(
			{ enum: tier?.enum, labels: tier?.enumItemLabels, group: tier?.group },
			{ enum: ['default', 'long_context'], labels: ['Default', 'Long context'], group: 'tokens' }
		);
	});

	test('keeps a host config property the catalogue cannot enrich', async () => {
		// A host advertises a property because it will honour it, and an unknown model, a staged
		// rollout and an unresolved catalogue are indistinguishable from here.
		const { catalogue: known } = catalogue([{ id: 'known-single-tier', contextSizes: [200_000] }]);
		const provider = store.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'copilot', known));
		const contextTierOnly = {
			type: 'object' as const,
			properties: { contextTier: { type: 'string' as const, title: 'Context tier', enum: ['default', 'long_context'] } },
		};
		provider.updateModels([
			{ ...makeModel('known-single-tier'), provider: 'copilot', configSchema: contextTierOnly },
			{ ...makeModel('unknown-to-catalogue'), provider: 'copilot', configSchema: contextTierOnly },
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(
			infos.map(info => ({ id: info.metadata.id, properties: Object.keys(info.metadata.configurationSchema?.properties ?? {}) })),
			[
				{ id: 'known-single-tier', properties: ['contextTier'] },
				{ id: 'unknown-to-catalogue', properties: ['contextTier'] },
			]
		);
	});

	test('fills token counts and pricing from the catalogue, but never over the host', async () => {
		const { catalogue: known } = catalogue([
			{ id: 'claude-opus-5', maxInputTokens: 264_000, maxOutputTokens: 64_000, multiplierNumeric: 5, category: 'powerful' },
			{ id: 'host-wins', maxInputTokens: 111, multiplierNumeric: 9, category: 'lightweight' },
			// A model reached over a direct third-party transport must not take Copilot's prices.
			{ id: 'claude-opus-5', vendor: 'anthropic', maxInputTokens: 999, multiplierNumeric: 42 },
		]);
		const provider = store.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'copilot', known));
		provider.updateModels([
			{ ...makeModel('claude-opus-5'), provider: 'copilot' },
			{ ...makeModel('host-wins'), provider: 'copilot', maxPromptTokens: 222, _meta: { multiplierNumeric: 1, category: 'versatile' } },
			{ ...makeModel('claude-opus-5'), provider: 'anthropic', _meta: { modelGroupId: 'anthropic' } },
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(
			infos.map(info => ({
				group: info.metadata.modelGroup?.id,
				maxInputTokens: info.metadata.maxInputTokens,
				maxOutputTokens: info.metadata.maxOutputTokens,
				multiplierNumeric: info.metadata.multiplierNumeric,
				category: info.metadata.category,
			})),
			[
				{ group: 'copilot', maxInputTokens: 264_000, maxOutputTokens: 64_000, multiplierNumeric: 5, category: 'powerful' },
				{ group: 'copilot', maxInputTokens: 222, maxOutputTokens: 0, multiplierNumeric: 1, category: 'versatile' },
				{ group: 'anthropic', maxInputTokens: 0, maxOutputTokens: 0, multiplierNumeric: undefined, category: undefined },
			]
		);
	});

	test('republishes on a catalogue change, ignoring changes from other vendors', async () => {
		// The service fires this event for every provider that publishes, including this one. Its
		// own vendor is a session-type id, so scoping to the enriched-from vendor also breaks the
		// loop — while still picking up a later CAPI refresh of prices or windows.
		const { catalogue: known, fire } = catalogue([{ id: 'claude-opus-5', contextSizes: [264_000, 1_000_000] }]);
		const provider = store.add(new AgentHostLanguageModelProvider('agent-host-copilot', 'agent-host-copilot', known));
		let changes = 0;
		store.add(provider.onDidChange(() => changes++));

		fire('agent-host-copilot');
		const afterOwnVendor = changes;
		fire('copilot');
		const afterCatalogue = changes;
		fire('copilot');

		assert.deepStrictEqual(
			{ afterOwnVendor, afterCatalogue, afterSecondCatalogueChange: changes },
			// Every catalogue change republishes: a price refresh that leaves ids and windows
			// untouched still has to reach the picker.
			{ afterOwnVendor: 0, afterCatalogue: 1, afterSecondCatalogueChange: 2 }
		);
	});

	test('carries model notices and flags row warnings', async () => {
		const provider = createProvider();
		provider.updateModels([makeModel('gpt-5', {
			warningText: { model_degraded: 'GPT-5 is currently degraded.' },
			infoText: { model_relocated: 'GPT-5 now serves from a new region.' },
			rowWarning: 'GPT-5 is currently degraded.',
		})]);

		const metadata = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None))[0].metadata;
		assert.deepStrictEqual({
			tooltip: metadata.tooltip,
			statusIcon: metadata.statusIcon?.id,
			warningText: metadata.warningText,
			infoText: metadata.infoText,
		}, {
			tooltip: 'GPT-5 is currently degraded.',
			statusIcon: Codicon.warning.id,
			warningText: { model_degraded: 'GPT-5 is currently degraded.' },
			infoText: { model_relocated: 'GPT-5 now serves from a new region.' },
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

	test('keeps duplicate Codex model names distinct and provider scoped', async () => {
		const provider = store.add(new AgentHostLanguageModelProvider('agent-host-codex', 'codex'));
		provider.updateModels([
			{ id: '@provider=vscode-proxy:gpt-5.6-sol', provider: 'copilot', name: 'GPT-5.6 Sol' },
			{ id: '@provider=openai:gpt-5.6-sol', provider: 'chatgpt', name: 'GPT-5.6 Sol', _meta: { modelSourceId: 'chatgptSubscription' } },
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(infos.map(info => ({
			identifier: info.identifier,
			name: info.metadata.name,
			group: info.metadata.modelGroup,
		})), [
			{ identifier: 'codex:@provider=vscode-proxy:gpt-5.6-sol', name: 'GPT-5.6 Sol', group: { id: 'copilot' } },
			{ identifier: 'codex:@provider=openai:gpt-5.6-sol', name: 'GPT-5.6 Sol', group: { id: 'chatgpt', sourceId: 'chatgptSubscription' } },
		]);
	});

	test('does not infer a trusted source from provider names', async () => {
		const provider = store.add(new AgentHostLanguageModelProvider('agent-host-codex', 'codex'));
		provider.updateModels([{ id: '@provider=openai:gpt-5.6-sol', provider: 'chatgpt', name: 'GPT-5.6 Sol' }]);

		const info = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None))[0];
		assert.deepStrictEqual(info.metadata.modelGroup, { id: 'chatgpt' });
	});

	test('groups Claude models by transport provider: Copilot-routed vs native Anthropic', async () => {
		const provider = store.add(new AgentHostLanguageModelProvider('agent-host-claude', 'claude'));
		// Per-session provider selection: the agent host's merged catalog keeps each
		// model's `provider` as the routing owner (`claude`) and carries the transport
		// (`copilot` for the Copilot-CAPI proxy, `anthropic` for the user's own Anthropic
		// account) in `_meta.modelGroupId`, qualifying the id the same way. The picker
		// buckets by that group token, so the same model offered by both transports
		// yields two distinct rows in two distinct groups — and, unlike Codex, native
		// Claude carries no `chatgptSubscription` source.
		provider.updateModels([
			{ id: '@provider=copilot:claude-opus-4.6', provider: 'claude', name: 'Claude Opus 4.6', _meta: { modelGroupId: 'copilot' } },
			{ id: '@provider=anthropic:claude-opus-4.6', provider: 'claude', name: 'Claude Opus 4.6', _meta: { modelGroupId: 'anthropic' } },
		]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual(infos.map(info => ({
			identifier: info.identifier,
			name: info.metadata.name,
			group: info.metadata.modelGroup,
		})), [
			{ identifier: 'claude:@provider=copilot:claude-opus-4.6', name: 'Claude Opus 4.6', group: { id: 'copilot' } },
			{ identifier: 'claude:@provider=anthropic:claude-opus-4.6', name: 'Claude Opus 4.6', group: { id: 'anthropic' } },
		]);
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

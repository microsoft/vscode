/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	AgentRoleDescriptor,
	RoutingPanel,
} from '../../browser/routingPanel.js';
import {
	ProviderCatalogueEntry,
	ProviderModelChoice,
	RoutingConfig,
	defaultRoutingConfig,
} from '../../common/routingConfig.js';

interface CallLog {
	updates: Array<{ role: string; choice: ProviderModelChoice }>;
	resets: number;
}

const AGENTS: ReadonlyArray<AgentRoleDescriptor> = [
	{ id: 'orchestrator', displayName: 'Orchestrator', description: 'Plans work', icon: Codicon.organization },
	{ id: 'coder', displayName: 'Code Generator', description: 'Writes code', icon: Codicon.code },
];

const CATALOGUE: ReadonlyArray<ProviderCatalogueEntry> = [
	{
		id: 'anthropic-oauth',
		displayName: 'Claude (subscription)',
		models: [
			{ id: 'claude-opus-4-7', displayName: 'Opus 4.7' },
			{ id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6' },
		],
	},
	{
		id: 'copilot',
		displayName: 'GitHub Copilot',
		models: [
			{ id: 'claude-opus', displayName: 'Claude Opus (via Copilot)' },
			{ id: 'gpt-4o', displayName: 'GPT-4o (via Copilot)' },
		],
	},
];

suite('RoutingPanel', () => {

	const store = new DisposableStore();

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function makePanel(opts?: {
		updatePrimary?: (role: string, choice: ProviderModelChoice) => Promise<void>;
		resetToDefaults?: () => Promise<void>;
		config?: RoutingConfig;
	}): { panel: RoutingPanel; container: HTMLElement; log: CallLog } {
		const container = document.createElement('div');
		const log: CallLog = { updates: [], resets: 0 };

		const panel = store.add(new RoutingPanel(container, {
			updatePrimary: async (role, choice) => {
				log.updates.push({ role, choice });
				if (opts?.updatePrimary) {
					await opts.updatePrimary(role, choice);
				}
			},
			resetToDefaults: async () => {
				log.resets++;
				if (opts?.resetToDefaults) {
					await opts.resetToDefaults();
				}
			},
		}));

		panel.setAgents(AGENTS);
		panel.setCatalogue(CATALOGUE);
		panel.setConfig(opts?.config ?? defaultRoutingConfig());

		return { panel, container, log };
	}

	function rowFor(container: HTMLElement, role: string): HTMLElement {
		const row = container.querySelector<HTMLElement>(`[data-agent="${role}"]`);
		assert.ok(row, `row for "${role}" should exist`);
		return row;
	}

	function selectsFor(container: HTMLElement, role: string): {
		provider: HTMLSelectElement;
		model: HTMLSelectElement;
		badge: string;
	} {
		const row = rowFor(container, role);
		const selects = row.querySelectorAll<HTMLSelectElement>('select.routing-panel-select');
		assert.strictEqual(selects.length, 2, `row "${role}" should have provider + model selects`);
		const badgeEl = row.querySelector<HTMLElement>('.routing-panel-row-badge');
		return {
			provider: selects[0],
			model: selects[1],
			badge: badgeEl?.textContent ?? '',
		};
	}

	test('setAgents renders one row per agent with both selects populated', () => {
		const { container } = makePanel({
			config: {
				version: 1,
				agents: {
					orchestrator: { primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' } },
					coder: { primary: { provider: 'copilot', model: 'gpt-4o' } },
				},
			},
		});

		const orch = selectsFor(container, 'orchestrator');
		const coder = selectsFor(container, 'coder');

		assert.deepStrictEqual({
			orchestrator: {
				providerOptions: Array.from(orch.provider.options).map(o => o.value),
				modelOptions: Array.from(orch.model.options).map(o => o.value),
				selectedProvider: orch.provider.value,
				selectedModel: orch.model.value,
				badge: orch.badge,
			},
			coder: {
				providerOptions: Array.from(coder.provider.options).map(o => o.value),
				modelOptions: Array.from(coder.model.options).map(o => o.value),
				selectedProvider: coder.provider.value,
				selectedModel: coder.model.value,
				badge: coder.badge,
			},
		}, {
			orchestrator: {
				providerOptions: ['anthropic-oauth', 'copilot'],
				modelOptions: ['claude-opus-4-7', 'claude-sonnet-4-6'],
				selectedProvider: 'anthropic-oauth',
				selectedModel: 'claude-opus-4-7',
				badge: 'Opus 4.7 · Claude (subscription)',
			},
			coder: {
				providerOptions: ['anthropic-oauth', 'copilot'],
				modelOptions: ['claude-opus', 'gpt-4o'],
				selectedProvider: 'copilot',
				selectedModel: 'gpt-4o',
				badge: 'GPT-4o (via Copilot) · GitHub Copilot',
			},
		});
	});

	test('changing the model select fires updatePrimary with the new choice', async () => {
		const { container, log } = makePanel({
			config: {
				version: 1,
				agents: { orchestrator: { primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' } } },
			},
		});

		const { model } = selectsFor(container, 'orchestrator');
		model.value = 'claude-sonnet-4-6';
		model.dispatchEvent(new Event('change'));
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual(log.updates, [
			{ role: 'orchestrator', choice: { provider: 'anthropic-oauth', model: 'claude-sonnet-4-6' } },
		]);
	});

	test('changing the provider select repopulates models and fires updatePrimary', async () => {
		const { container, log } = makePanel({
			config: {
				version: 1,
				agents: { coder: { primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' } } },
			},
		});

		const { provider, model } = selectsFor(container, 'coder');
		provider.value = 'copilot';
		provider.dispatchEvent(new Event('change'));
		await new Promise(r => setTimeout(r, 0));

		assert.deepStrictEqual({
			modelOptionsAfter: Array.from(model.options).map(o => o.value),
			selectedModelAfter: model.value,
			updateCalls: log.updates,
		}, {
			modelOptionsAfter: ['claude-opus', 'gpt-4o'],
			selectedModelAfter: 'claude-opus',
			updateCalls: [
				{ role: 'coder', choice: { provider: 'copilot', model: 'claude-opus' } },
			],
		});
	});

	test('badge updates immediately after a selection change', async () => {
		const { container } = makePanel({
			config: {
				version: 1,
				agents: { orchestrator: { primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' } } },
			},
		});

		const { model } = selectsFor(container, 'orchestrator');
		model.value = 'claude-sonnet-4-6';
		model.dispatchEvent(new Event('change'));

		const badge = rowFor(container, 'orchestrator').querySelector<HTMLElement>('.routing-panel-row-badge');
		assert.strictEqual(badge?.textContent, 'Sonnet 4.6 · Claude (subscription)');
	});

	test('unknown provider in config is preserved with an "(unknown)" label', () => {
		const { container } = makePanel({
			config: {
				version: 1,
				agents: { orchestrator: { primary: { provider: 'mystery-provider', model: 'mystery-model' } } },
			},
		});

		const { provider, model, badge } = selectsFor(container, 'orchestrator');

		assert.deepStrictEqual({
			providerSelected: provider.value,
			providerOption: provider.options[provider.selectedIndex].textContent,
			modelSelected: model.value,
			modelOption: model.options[model.selectedIndex].textContent,
			badgeText: badge,
		}, {
			providerSelected: 'mystery-provider',
			providerOption: 'mystery-provider (unknown)',
			modelSelected: 'mystery-model',
			modelOption: 'mystery-model (unknown)',
			badgeText: 'mystery-model · mystery-provider',
		});
	});

	test('clicking Reset to defaults invokes the reset handler', async () => {
		const { container, log } = makePanel();

		const button = container.querySelector<HTMLElement>('.routing-panel-reset .monaco-button');
		assert.ok(button, 'reset button should be rendered');
		button.click();
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(log.resets, 1);
	});

	test('handler errors surface as an error status banner', async () => {
		const { container } = makePanel({
			updatePrimary: () => Promise.reject(new Error('Disk full')),
			config: {
				version: 1,
				agents: { orchestrator: { primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' } } },
			},
		});

		const { model } = selectsFor(container, 'orchestrator');
		model.value = 'claude-sonnet-4-6';
		model.dispatchEvent(new Event('change'));
		await new Promise(r => setTimeout(r, 0));

		const status = container.querySelector<HTMLElement>('.routing-panel-status');
		assert.deepStrictEqual({
			hidden: status?.classList.contains('hidden'),
			isError: status?.classList.contains('routing-panel-status-error'),
			text: status?.textContent,
		}, {
			hidden: false,
			isError: true,
			text: 'Disk full',
		});
	});

	test('setConfig replaces selections in-place without firing updates', () => {
		const { panel, container, log } = makePanel({
			config: {
				version: 1,
				agents: { orchestrator: { primary: { provider: 'anthropic-oauth', model: 'claude-opus-4-7' } } },
			},
		});

		panel.setConfig({
			version: 1,
			agents: { orchestrator: { primary: { provider: 'copilot', model: 'gpt-4o' } } },
		});

		const { provider, model, badge } = selectsFor(container, 'orchestrator');
		assert.deepStrictEqual({
			provider: provider.value,
			model: model.value,
			badge,
			updateCalls: log.updates.length,
		}, {
			provider: 'copilot',
			model: 'gpt-4o',
			badge: 'GPT-4o (via Copilot) · GitHub Copilot',
			updateCalls: 0,
		});
	});

	test('setAgents removes rows whose role is no longer present', () => {
		const { panel, container } = makePanel();

		panel.setAgents([AGENTS[0]]);

		assert.ok(container.querySelector('[data-agent="orchestrator"]'), 'orchestrator still present');
		assert.strictEqual(container.querySelector('[data-agent="coder"]'), null, 'coder row removed');
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { QuotaPanel } from '../../browser/quotaPanel.js';
import { QuotaCostData, emptyUsage } from '../../common/quotaModel.js';

suite('QuotaPanel', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function makePanel(): { panel: QuotaPanel; container: HTMLElement } {
		const container = document.createElement('div');
		const panel = store.add(new QuotaPanel(container));
		return { panel, container };
	}

	function emptyData(): QuotaCostData {
		return {
			summary: { totalUsage: emptyUsage(), estimatedCost: { usd: 0 }, byModel: [], byTool: [] },
			providerQuota: [],
			spendCap: { limitUsd: undefined, currentTotalUsd: 0 },
		};
	}

	// ── Shell rendering ───────────────────────────────────────────────────────

	test('renders the panel root element with title and subtitle', () => {
		const { container } = makePanel();
		const h2 = container.querySelector('h2');
		assert.ok(h2, 'h2 title should be rendered');
		assert.ok(h2.textContent!.length > 0, 'h2 should have non-empty text');

		const subtitle = container.querySelector('.quota-panel-subtitle');
		assert.ok(subtitle, 'subtitle should be rendered');
	});

	test('initial state shows "No activity yet." in the summary chip', () => {
		const { container } = makePanel();
		const summary = container.querySelector<HTMLElement>('.quota-panel-summary');
		assert.ok(summary, 'summary element should exist');
		assert.ok(summary.textContent!.includes('No activity yet'), `summary should say no activity, got: "${summary.textContent}"`);
	});

	test('each section body has a data-section attribute', () => {
		const { container } = makePanel();
		const sections = ['models', 'tools', 'quota'];
		for (const key of sections) {
			assert.ok(
				container.querySelector(`[data-section="${key}"]`),
				`data-section="${key}" element should be present`,
			);
		}
	});

	// ── Summary chip ──────────────────────────────────────────────────────────

	test('setData shows cost in the summary chip', () => {
		const { panel, container } = makePanel();
		panel.setData(emptyData());
		const summary = container.querySelector<HTMLElement>('.quota-panel-summary');
		assert.ok(summary!.textContent!.includes('$0.00'), `summary should include cost, got: "${summary!.textContent}"`);
	});

	// ── Spend cap warning ─────────────────────────────────────────────────────

	test('spend cap warning is hidden when current spend is below the limit', () => {
		const { panel, container } = makePanel();
		panel.setData({ ...emptyData(), spendCap: { limitUsd: 10, currentTotalUsd: 5 } });
		const warning = container.querySelector<HTMLElement>('.quota-panel-spend-cap-warning');
		assert.ok(warning!.classList.contains('hidden'), 'warning should be hidden when under cap');
	});

	test('spend cap warning is visible and contains amounts when cap is exceeded', () => {
		const { panel, container } = makePanel();
		panel.setData({ ...emptyData(), spendCap: { limitUsd: 10, currentTotalUsd: 12.50 } });
		const warning = container.querySelector<HTMLElement>('.quota-panel-spend-cap-warning');
		const textEl = warning!.querySelector<HTMLElement>('.quota-panel-spend-cap-text');
		assert.deepStrictEqual({
			hidden: warning!.classList.contains('hidden'),
			mentionsCap: textEl!.textContent!.includes('$10.00'),
			mentionsCurrent: textEl!.textContent!.includes('$12.50'),
		}, { hidden: false, mentionsCap: true, mentionsCurrent: true });
	});

	test('spend cap warning hides again after a subsequent setData call where cap is not exceeded', () => {
		const { panel, container } = makePanel();
		panel.setData({ ...emptyData(), spendCap: { limitUsd: 10, currentTotalUsd: 15 } });
		panel.setData({ ...emptyData(), spendCap: { limitUsd: 10, currentTotalUsd: 9 } });
		const warning = container.querySelector<HTMLElement>('.quota-panel-spend-cap-warning');
		assert.ok(warning!.classList.contains('hidden'), 'warning should be hidden after spend drops below cap');
	});

	// ── By-model section ──────────────────────────────────────────────────────

	test('setData with model entries renders one tbody row per model', () => {
		const { panel, container } = makePanel();
		panel.setData({
			...emptyData(),
			summary: {
				totalUsage: emptyUsage(),
				estimatedCost: { usd: 0.42 },
				byModel: [
					{
						modelId: 'claude-opus-4-7',
						providerId: 'anthropic-oauth',
						displayLabel: 'Opus 4.7',
						usage: { inputTokens: 1000, outputTokens: 200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
						estimatedCost: { usd: 0.30 },
					},
					{
						modelId: 'claude-sonnet-4-6',
						providerId: 'anthropic-oauth',
						displayLabel: 'Sonnet 4.6',
						usage: { inputTokens: 4000, outputTokens: 800, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
						estimatedCost: { usd: 0.12 },
					},
				],
				byTool: [],
			},
		});

		const modelsSection = container.querySelector<HTMLElement>('[data-section="models"]');
		const rows = modelsSection!.querySelectorAll('tbody tr');
		assert.deepStrictEqual({
			rowCount: rows.length,
			firstLabel: rows[0].querySelector('.quota-panel-model-label')?.textContent,
			secondLabel: rows[1].querySelector('.quota-panel-model-label')?.textContent,
		}, {
			rowCount: 2,
			firstLabel: 'Opus 4.7',
			secondLabel: 'Sonnet 4.6',
		});
	});

	test('empty model list renders empty-state text (no table)', () => {
		const { panel, container } = makePanel();
		panel.setData(emptyData());
		const modelsSection = container.querySelector<HTMLElement>('[data-section="models"]');
		assert.strictEqual(modelsSection!.querySelector('table'), null, 'no table when model list is empty');
		assert.ok(modelsSection!.querySelector('.quota-panel-empty'), 'empty-state text should be rendered');
	});

	// ── By-tool section ───────────────────────────────────────────────────────

	test('setData with tool entries renders one tbody row per tool', () => {
		const { panel, container } = makePanel();
		panel.setData({
			...emptyData(),
			summary: {
				totalUsage: emptyUsage(),
				estimatedCost: { usd: 0 },
				byModel: [],
				byTool: [
					{ toolName: 'semantic_search', callCount: 5 },
					{ toolName: 'find_references', callCount: 2 },
				],
			},
		});

		const toolsSection = container.querySelector<HTMLElement>('[data-section="tools"]');
		const rows = toolsSection!.querySelectorAll('tbody tr');
		assert.deepStrictEqual({
			rowCount: rows.length,
			firstTool: rows[0].querySelector('.quota-panel-tool-name')?.textContent,
			firstCount: rows[0].querySelector('.quota-panel-call-count')?.textContent,
		}, {
			rowCount: 2,
			firstTool: 'semantic_search',
			firstCount: '5',
		});
	});

	// ── Provider quota section ────────────────────────────────────────────────

	test('subscription quota row renders with progress bar', () => {
		const { panel, container } = makePanel();
		panel.setData({
			...emptyData(),
			providerQuota: [{
				providerId: 'anthropic-oauth',
				displayName: 'Claude Pro',
				kind: 'subscription',
				windowFractionUsed: 0.45,
			}],
		});

		const row = container.querySelector<HTMLElement>('[data-provider="anthropic-oauth"]');
		assert.ok(row, 'quota row should be rendered');
		assert.deepStrictEqual({
			hasName: row.textContent!.includes('Claude Pro'),
			hasFraction: row.textContent!.includes('45%'),
			hasBar: !!row.querySelector('.quota-panel-quota-bar-fill'),
		}, { hasName: true, hasFraction: true, hasBar: true });
	});

	test('subscription window >80% marks bar fill with warning class', () => {
		const { panel, container } = makePanel();
		panel.setData({
			...emptyData(),
			providerQuota: [{ providerId: 'p', displayName: 'P', kind: 'subscription', windowFractionUsed: 0.85 }],
		});
		const fill = container.querySelector<HTMLElement>('.quota-panel-quota-bar-fill');
		assert.ok(fill!.classList.contains('quota-panel-quota-bar-warning'), 'fill should have warning class above 80%');
	});

	test('subscription window <=80% does not mark bar fill with warning class', () => {
		const { panel, container } = makePanel();
		panel.setData({
			...emptyData(),
			providerQuota: [{ providerId: 'p', displayName: 'P', kind: 'subscription', windowFractionUsed: 0.79 }],
		});
		const fill = container.querySelector<HTMLElement>('.quota-panel-quota-bar-fill');
		assert.ok(!fill!.classList.contains('quota-panel-quota-bar-warning'), 'fill should not have warning class at 79%');
	});

	test('api-key quota row renders RPM info', () => {
		const { panel, container } = makePanel();
		panel.setData({
			...emptyData(),
			providerQuota: [{ providerId: 'anthropic-key', displayName: 'Claude API', kind: 'api-key', requestsUsed: 12, requestsLimit: 60 }],
		});
		const row = container.querySelector<HTMLElement>('[data-provider="anthropic-key"]');
		assert.ok(row, 'quota row should be rendered');
		const detail = row.querySelector<HTMLElement>('.quota-panel-quota-detail');
		assert.strictEqual(detail!.textContent, '12 / 60 RPM');
	});

	// ── Update / no-duplicate semantics ───────────────────────────────────────

	test('calling setData twice replaces model rows without duplicates', () => {
		const { panel, container } = makePanel();

		panel.setData({
			...emptyData(),
			summary: {
				totalUsage: emptyUsage(),
				estimatedCost: { usd: 0 },
				byModel: [{ modelId: 'm1', providerId: 'p1', displayLabel: 'Model A', usage: emptyUsage(), estimatedCost: { usd: 0 } }],
				byTool: [],
			},
		});
		panel.setData({
			...emptyData(),
			summary: {
				totalUsage: emptyUsage(),
				estimatedCost: { usd: 0 },
				byModel: [
					{ modelId: 'm2', providerId: 'p2', displayLabel: 'Model B', usage: emptyUsage(), estimatedCost: { usd: 0 } },
					{ modelId: 'm3', providerId: 'p3', displayLabel: 'Model C', usage: emptyUsage(), estimatedCost: { usd: 0 } },
				],
				byTool: [],
			},
		});

		const modelsSection = container.querySelector<HTMLElement>('[data-section="models"]');
		const allRows = modelsSection!.querySelectorAll('tbody tr');
		const labels = Array.from(allRows).map(r => r.querySelector('.quota-panel-model-label')?.textContent);
		assert.deepStrictEqual({
			rowCount: allRows.length,
			hasA: labels.includes('Model A'),
			hasB: labels.includes('Model B'),
			hasC: labels.includes('Model C'),
		}, {
			rowCount: 2,
			hasA: false,
			hasB: true,
			hasC: true,
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/quotaPanel.css';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import {
	ModelUsageEntry,
	ProviderQuotaInfo,
	QuotaCostData,
	SpendCapConfig,
	ToolUsageEntry,
	buildCompactSummary,
	formatCostUsd,
	formatDurationSeconds,
	formatTokenCount,
	formatWindowFraction,
	isSpendCapExceeded,
} from '../common/quotaModel.js';

/**
 * Per-session cost and quota breakdown panel (§9.4, F-15).
 *
 * Displays:
 * - A compact one-line summary (cost + tokens + quota hint)
 * - Per-model usage table with token counts and estimated cost
 * - Per-tool invocation counts
 * - Provider-specific quota rows (subscription window, session expiry)
 * - A spend-cap warning banner when the configured limit is exceeded
 *
 * The component is fully passive: all state flows in via `setData()`.
 */
export class QuotaPanel extends Disposable {

	private readonly _summaryEl: HTMLElement;
	private readonly _spendCapWarning: HTMLElement;
	private readonly _modelsBody: HTMLElement;
	private readonly _toolsBody: HTMLElement;
	private readonly _quotaBody: HTMLElement;

	constructor(container: HTMLElement) {
		super();
		container.classList.add('quota-panel');

		const header = append(container, $('.quota-panel-header'));
		append(header, $('h2', undefined, localize('quota.title', "Session Cost & Quota")));
		append(header, $('p.quota-panel-subtitle', undefined,
			localize('quota.subtitle', "Cumulative token usage and estimated cost for the current session.")));

		this._summaryEl = append(container, $('.quota-panel-summary'));

		this._spendCapWarning = append(container, $('.quota-panel-spend-cap-warning.hidden'));
		const warnIcon = append(this._spendCapWarning, $('span.quota-panel-spend-cap-icon'));
		warnIcon.appendChild(renderIcon(Codicon.warning));
		append(this._spendCapWarning, $('span.quota-panel-spend-cap-text'));

		this._modelsBody = this._renderSection(container, localize('quota.byModel', "By Model"), 'models');
		this._toolsBody  = this._renderSection(container, localize('quota.byTool', "By Tool"), 'tools');
		this._quotaBody  = this._renderSection(container, localize('quota.providerQuota', "Provider Quota"), 'quota');

		this._renderInitialEmpty();
	}

	/** Replace all displayed data. */
	setData(data: QuotaCostData): void {
		this._updateSummary(data);
		this._updateSpendCapWarning(data.spendCap);
		this._updateModels(data.summary.byModel);
		this._updateTools(data.summary.byTool);
		this._updateQuota(data.providerQuota);
	}

	private _renderSection(container: HTMLElement, title: string, sectionKey: string): HTMLElement {
		const section = append(container, $('.quota-panel-section'));
		const sectionHeader = append(section, $('.quota-panel-section-header'));
		append(sectionHeader, $('span.quota-panel-section-title', undefined, title));
		const body = append(section, $('.quota-panel-section-body'));
		body.setAttribute('data-section', sectionKey);
		return body;
	}

	private _renderInitialEmpty(): void {
		this._summaryEl.textContent = localize('quota.noData', "No activity yet.");
		this._renderEmptyState(this._modelsBody, localize('quota.noModels', "No model calls recorded."));
		this._renderEmptyState(this._toolsBody,  localize('quota.noTools', "No tool calls recorded."));
		this._renderEmptyState(this._quotaBody,  localize('quota.noQuota', "No provider quota data."));
	}

	private _renderEmptyState(parent: HTMLElement, message: string): void {
		clearNode(parent);
		append(parent, $('span.quota-panel-empty', undefined, message));
	}

	private _updateSummary(data: QuotaCostData): void {
		this._summaryEl.textContent = buildCompactSummary(data);
	}

	private _updateSpendCapWarning(cap: SpendCapConfig): void {
		if (isSpendCapExceeded(cap)) {
			this._spendCapWarning.classList.remove('hidden');
			const textEl = this._spendCapWarning.querySelector<HTMLElement>('.quota-panel-spend-cap-text');
			if (textEl) {
				textEl.textContent = localize(
					'quota.spendCapExceeded',
					"Spend cap of {0} exceeded (current: {1}). New requests are blocked.",
					formatCostUsd(cap.limitUsd!),
					formatCostUsd(cap.currentTotalUsd),
				);
			}
		} else {
			this._spendCapWarning.classList.add('hidden');
		}
	}

	private _updateModels(entries: ReadonlyArray<ModelUsageEntry>): void {
		clearNode(this._modelsBody);

		if (entries.length === 0) {
			this._renderEmptyState(this._modelsBody, localize('quota.noModels', "No model calls recorded."));
			return;
		}

		const table = append(this._modelsBody, $('table.quota-panel-table'));
		const thead = append(table, $('thead'));
		const headRow = append(thead, $('tr'));
		append(headRow, $('th', undefined, localize('quota.col.model', "Model")));
		append(headRow, $('th', undefined, localize('quota.col.tokens', "Tokens")));
		append(headRow, $('th', undefined, localize('quota.col.cost', "Est. cost")));

		const tbody = append(table, $('tbody'));
		for (const entry of entries) {
			const row = append(tbody, $('tr'));
			append(row, $('td.quota-panel-model-label', undefined, entry.displayLabel));
			append(row, $('td.quota-panel-tokens', undefined, this._formatModelTokens(entry)));
			append(row, $('td.quota-panel-cost', undefined, formatCostUsd(entry.estimatedCost.usd)));
		}
	}

	private _formatModelTokens(entry: ModelUsageEntry): string {
		const u = entry.usage;
		const parts = [
			`${formatTokenCount(u.inputTokens)} in`,
			`${formatTokenCount(u.outputTokens)} out`,
		];
		if (u.cacheReadInputTokens > 0) {
			parts.push(`${formatTokenCount(u.cacheReadInputTokens)} cached`);
		}
		return parts.join(' · ');
	}

	private _updateTools(entries: ReadonlyArray<ToolUsageEntry>): void {
		clearNode(this._toolsBody);

		if (entries.length === 0) {
			this._renderEmptyState(this._toolsBody, localize('quota.noTools', "No tool calls recorded."));
			return;
		}

		const table = append(this._toolsBody, $('table.quota-panel-table'));
		const thead = append(table, $('thead'));
		const headRow = append(thead, $('tr'));
		append(headRow, $('th', undefined, localize('quota.col.tool', "Tool")));
		append(headRow, $('th', undefined, localize('quota.col.calls', "Calls")));

		const tbody = append(table, $('tbody'));
		for (const entry of entries) {
			const row = append(tbody, $('tr'));
			append(row, $('td.quota-panel-tool-name', undefined, entry.toolName));
			append(row, $('td.quota-panel-call-count', undefined, String(entry.callCount)));
		}
	}

	private _updateQuota(entries: ReadonlyArray<ProviderQuotaInfo>): void {
		clearNode(this._quotaBody);

		if (entries.length === 0) {
			this._renderEmptyState(this._quotaBody, localize('quota.noQuota', "No provider quota data."));
			return;
		}

		for (const entry of entries) {
			this._renderQuotaRow(this._quotaBody, entry);
		}
	}

	private _renderQuotaRow(parent: HTMLElement, info: ProviderQuotaInfo): void {
		const row = append(parent, $('.quota-panel-quota-row'));
		row.setAttribute('data-provider', info.providerId);

		append(row, $('span.quota-panel-quota-name', undefined, info.displayName));

		const detailEl = append(row, $('span.quota-panel-quota-detail'));

		if (info.kind === 'subscription') {
			if (info.windowFractionUsed !== undefined) {
				detailEl.textContent = localize(
					'quota.windowUsed',
					"{0} of window used",
					formatWindowFraction(info.windowFractionUsed),
				);
				const bar = append(row, $('.quota-panel-quota-bar'));
				const fill = append(bar, $('.quota-panel-quota-bar-fill'));
				fill.style.width = `${Math.min(100, Math.round(info.windowFractionUsed * 100))}%`;
				fill.classList.toggle('quota-panel-quota-bar-warning', info.windowFractionUsed > 0.8);
			} else if (info.tokenExpiresAt !== undefined) {
				const remaining = Math.max(0, Math.floor((info.tokenExpiresAt - Date.now()) / 1000));
				detailEl.textContent = localize(
					'quota.sessionValid',
					"Session valid {0}",
					formatDurationSeconds(remaining),
				);
			}
			if (info.windowResetsAt !== undefined) {
				const resetIn = Math.max(0, Math.floor((info.windowResetsAt - Date.now()) / 1000));
				append(row, $('span.quota-panel-quota-reset', undefined,
					localize('quota.resetsIn', "Resets in {0}", formatDurationSeconds(resetIn))));
			}
		} else {
			if (info.requestsUsed !== undefined && info.requestsLimit !== undefined) {
				detailEl.textContent = `${info.requestsUsed} / ${info.requestsLimit} RPM`;
			}
		}
	}
}

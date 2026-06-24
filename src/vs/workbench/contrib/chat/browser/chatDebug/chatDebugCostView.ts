/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { IChatDebugEvent, IChatDebugModelTurnEvent, IChatDebugService, IChatDebugToolCallEvent } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { formatNanoAiuAsAic, setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';

const $ = DOM.$;

/** GitHub usage & billing page — the authoritative source for credit usage. */
const BILLING_USAGE_URL = 'https://github.com/settings/billing/usage';

const compactNumberFormatter = safeIntl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** Formats a token count compactly (e.g. "1.2K", "3.4M"). */
function formatTokens(count: number): string {
	return compactNumberFormatter.value.format(count);
}

/** Formats a credit value, prefixing "~" when the value is an estimate. */
function creditLabel(nanoAiu: number, estimated: boolean): string {
	return (estimated ? '~' : '') + formatNanoAiuAsAic(nanoAiu);
}

/**
 * Computes a cache hit rate (0-100) as cached input tokens over total input
 * tokens, or `undefined` when there is no input to measure against.
 */
function cacheHitRate(tokens: ICostTokens): number | undefined {
	if (!tokens.hasTokenData || tokens.inputTokens <= 0) {
		return undefined;
	}
	return Math.min(100, (tokens.cachedTokens / tokens.inputTokens) * 100);
}

export const enum CostNavigation {
	Home = 'home',
	Overview = 'overview',
}

type GroupingMode = 'subagent' | 'model' | 'matrix';

const MAIN_AGENT_KEY = 'main';

/**
 * Accumulated token usage. For finished sessions the input/cached values are
 * exact per model (back-filled from `session.shutdown.modelMetrics`); for live
 * sessions only output tokens are known, so {@link hasTokenData} guards display.
 */
interface ICostTokens {
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	hasTokenData: boolean;
}

/**
 * A leaf contribution to a cost bucket (the cross-dimension breakdown shown
 * when a bucket is expanded).
 */
interface ICostLeaf extends ICostTokens {
	readonly label: string;
	nanoAiu: number;
	modelTurnCount: number;
}

/**
 * An aggregated cost bucket (e.g. one subagent invocation, or one model).
 */
interface ICostBucket extends ICostTokens {
	readonly key: string;
	readonly label: string;
	nanoAiu: number;
	modelTurnCount: number;
	toolCallCount: number;
	readonly leaves: Map<string, ICostLeaf>;
}

interface ICostBreakdown extends ICostTokens {
	readonly totalNanoAiu: number;
	readonly buckets: ICostBucket[];
}

/** A column (model) in the subagent × model cost matrix. */
interface ICostMatrixColumn {
	readonly key: string;
	readonly label: string;
	nanoAiu: number;
}

/** A row (subagent) in the subagent × model cost matrix. */
interface ICostMatrixRow {
	readonly key: string;
	readonly label: string;
	readonly cells: Map<string, number>;
	nanoAiu: number;
}

interface ICostMatrix {
	readonly totalNanoAiu: number;
	readonly columns: ICostMatrixColumn[];
	readonly rows: ICostMatrixRow[];
}

/**
 * Interactive per-session cost breakdown. Visualizes how the session's Copilot
 * credit usage (AIC) is allotted across subagents (or models), with proportional
 * bars and an expandable cross-dimension breakdown.
 *
 * The total is the sum of per-model-turn `copilotUsageNanoAiu`, matching the
 * Overview "Copilot Usage (AIC)" tile and the session-cost figure surfaced in
 * the chat context usage widget (same nano-AIU → credit conversion).
 */
export class ChatDebugCostView extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<CostNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly loadDisposables = this._register(new DisposableStore());

	private currentSessionResource: URI | undefined;
	private grouping: GroupingMode = 'subagent';
	private readonly expandedKeys = new Set<string>();
	private readonly refreshScheduler: RunOnceScheduler;

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-cost'));
		DOM.hide(this.container);

		this.refreshScheduler = this._register(new RunOnceScheduler(() => this.load(), 100));

		const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
		this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
		this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
		this._register(this.breadcrumbWidget.onDidSelectItem(e => {
			if (e.type === 'select' && e.item instanceof TextBreadcrumbItem) {
				this.breadcrumbWidget.setSelection(undefined);
				const items = this.breadcrumbWidget.getItems();
				const idx = items.indexOf(e.item);
				if (idx === 0) {
					this._onNavigate.fire(CostNavigation.Home);
				} else if (idx === 1) {
					this._onNavigate.fire(CostNavigation.Overview);
				}
			}
		}));

		this.content = DOM.append(this.container, $('.chat-debug-cost-content'));
	}

	setSession(sessionResource: URI): void {
		this.currentSessionResource = sessionResource;
		this.expandedKeys.clear();
	}

	show(): void {
		DOM.show(this.container);
		this.load();
	}

	hide(): void {
		DOM.hide(this.container);
		this.refreshScheduler.cancel();
	}

	refresh(): void {
		if (this.container.style.display !== 'none' && !this.refreshScheduler.isScheduled()) {
			this.refreshScheduler.schedule();
		}
	}

	updateBreadcrumb(): void {
		if (!this.currentSessionResource) {
			return;
		}
		const sessionTitle = this.getSessionTitle(this.currentSessionResource);
		this.breadcrumbWidget.setItems([
			new TextBreadcrumbItem(localize('chatDebug.title', "Agent Debug Logs"), true),
			new TextBreadcrumbItem(sessionTitle, true),
			new TextBreadcrumbItem(localize('chatDebug.cost.breadcrumb', "Cost")),
		]);
	}

	private getSessionTitle(sessionResource: URI): string {
		return this.chatService.getSessionTitle(sessionResource)
			|| LocalChatSessionUri.parseLocalSessionId(sessionResource)
			|| sessionResource.toString();
	}

	private load(): void {
		DOM.clearNode(this.content);
		this.loadDisposables.clear();
		this.updateBreadcrumb();

		if (!this.currentSessionResource) {
			return;
		}

		// Title
		const titleRow = DOM.append(this.content, $('.chat-debug-cost-title-row'));
		const titleEl = DOM.append(titleRow, $('h2.chat-debug-cost-title'));
		DOM.append(titleEl, $(`span${ThemeIcon.asCSSSelector(Codicon.creditCard)}`));
		titleEl.append(localize('chatDebug.cost.title', "Cost Breakdown"));

		// Disclaimer: this view is for visualization only; point to the
		// authoritative GitHub billing usage page.
		const disclaimer = DOM.append(this.content, $('.chat-debug-cost-disclaimer'));
		DOM.append(disclaimer, $(`span.chat-debug-cost-disclaimer-icon${ThemeIcon.asCSSSelector(Codicon.info)}`));
		const disclaimerText = DOM.append(disclaimer, $('span.chat-debug-cost-disclaimer-text'));
		disclaimerText.append(localize('chatDebug.cost.disclaimer', "These figures are approximate and for visualization only. For authoritative usage and billing, see "));
		this.loadDisposables.add(this.instantiationService.createInstance(Link, disclaimerText, {
			label: localize('chatDebug.cost.billingLink', "GitHub billing usage"),
			href: BILLING_USAGE_URL,
			title: BILLING_USAGE_URL,
		}, {}));
		disclaimerText.append('.');

		// A session still running can only report estimated (live) usage; nothing
		// is finalized until it ends, so per-model figures aren't yet exact.
		const sessionModel = this.chatService.getSession(this.currentSessionResource);
		const inProgress = sessionModel?.requestInProgress.get() ?? false;
		const finalized = !inProgress;

		const events = this.chatDebugService.getEvents(this.currentSessionResource);
		const breakdown = computeCostBreakdown(events, this.grouping === 'matrix' ? 'subagent' : this.grouping);

		// Total credits (estimated while the session is still running)
		const totalSection = DOM.append(this.content, $('.chat-debug-cost-total'));
		const totalValue = formatNanoAiuAsAic(breakdown.totalNanoAiu);
		DOM.append(totalSection, $('span.chat-debug-cost-total-value', undefined, inProgress ? `~${totalValue}` : totalValue));
		DOM.append(totalSection, $('span.chat-debug-cost-total-label', undefined, localize('chatDebug.cost.totalLabel', "credits (AIC) this session")));
		if (inProgress) {
			DOM.append(totalSection, $('span.chat-debug-cost-pill', { title: localize('chatDebug.cost.inProgressTooltip', "Usage is still being reported; figures will be finalized when the session ends.") }, localize('chatDebug.cost.inProgress', "In progress")));
		}

		if (breakdown.totalNanoAiu <= 0) {
			DOM.append(this.content, $('.chat-debug-cost-empty', undefined, localize('chatDebug.cost.noData', "No credit usage has been reported for this session yet.")));
			return;
		}

		// Session-level token / cache stats
		this.renderSessionStats(breakdown);

		// Grouping toggle
		const toggleRow = DOM.append(this.content, $('.chat-debug-cost-toggle'));
		DOM.append(toggleRow, $('span.chat-debug-cost-toggle-label', undefined, localize('chatDebug.cost.groupBy', "Group by")));
		this.createGroupingButton(toggleRow, 'subagent', localize('chatDebug.cost.bySubagent', "Subagent"));
		this.createGroupingButton(toggleRow, 'model', localize('chatDebug.cost.byModel', "Model"));
		this.createGroupingButton(toggleRow, 'matrix', localize('chatDebug.cost.matrix', "Subagent \u00d7 Model"));

		if (this.grouping === 'matrix') {
			// Cells are split along the estimated subagent dimension; per-model
			// column totals are exact once the session is finalized.
			this.renderMatrix(computeCostMatrix(events), finalized);
		} else {
			// Subagent splits are always estimated; per-model splits are exact
			// once the session is finalized.
			const estimated = this.grouping === 'subagent' || !finalized;
			const list = DOM.append(this.content, $('.chat-debug-cost-list'));
			for (const bucket of breakdown.buckets) {
				this.renderBucket(list, bucket, breakdown.totalNanoAiu, estimated);
			}
		}

		// Reconciliation note
		DOM.append(this.content, $('.chat-debug-cost-note', undefined,
			localize('chatDebug.cost.note', "Values marked with ~ are estimated by even distribution. Per-model credits and tokens are exact only once a session has finished. Bucket totals sum to the session total above. Consult GitHub billing usage for authoritative numbers.")));
	}

	private renderSessionStats(tokens: ICostTokens): void {
		if (!tokens.hasTokenData) {
			return;
		}
		const stats: { label: string; value: string }[] = [
			{ label: localize('chatDebug.cost.inputTokens', "Input tokens"), value: formatTokens(tokens.inputTokens) },
			{ label: localize('chatDebug.cost.outputTokens', "Output tokens"), value: formatTokens(tokens.outputTokens) },
		];
		const rate = cacheHitRate(tokens);
		if (rate !== undefined) {
			stats.push({
				label: localize('chatDebug.cost.cacheHitRate', "Cache hit rate"),
				value: localize('chatDebug.cost.percent', "{0}%", rate.toFixed(1)),
			});
		}

		const statsRow = DOM.append(this.content, $('.chat-debug-cost-stats'));
		for (const stat of stats) {
			const card = DOM.append(statsRow, $('.chat-debug-cost-stat'));
			DOM.append(card, $('span.chat-debug-cost-stat-value', undefined, stat.value));
			DOM.append(card, $('span.chat-debug-cost-stat-label', undefined, stat.label));
		}
	}

	private applyEstimated(el: HTMLElement, estimated: boolean): void {
		if (estimated) {
			el.classList.add('estimated');
			el.title = localize('chatDebug.cost.estimatedTooltip', "Estimated by even distribution. See GitHub billing usage for authoritative numbers.");
		}
	}

	private renderMatrix(matrix: ICostMatrix, finalized: boolean): void {
		const table = DOM.append(this.content, $('table.chat-debug-cost-matrix'));

		// Header row: blank corner + model columns + row-total column
		const thead = DOM.append(table, $('thead'));
		const headerRow = DOM.append(thead, $('tr'));
		DOM.append(headerRow, $('th.chat-debug-cost-matrix-corner', undefined, localize('chatDebug.cost.subagentColumn', "Subagent")));
		for (const column of matrix.columns) {
			DOM.append(headerRow, $('th', undefined, column.label));
		}
		DOM.append(headerRow, $('th.chat-debug-cost-matrix-total-col', undefined, localize('chatDebug.cost.rowTotal', "Total")));

		// Body: one row per subagent. Cells and row totals are split along the
		// estimated subagent dimension, so they are always estimated.
		const tbody = DOM.append(table, $('tbody'));
		for (const row of matrix.rows) {
			const tr = DOM.append(tbody, $('tr'));
			DOM.append(tr, $('th.chat-debug-cost-matrix-row-label', undefined, row.label));
			for (const column of matrix.columns) {
				const value = row.cells.get(column.key) ?? 0;
				const cell = DOM.append(tr, $('td'));
				cell.textContent = value > 0 ? creditLabel(value, true) : '\u2013';
				if (value > 0) {
					this.applyEstimated(cell, true);
				}
			}
			const rowTotal = DOM.append(tr, $('td.chat-debug-cost-matrix-total-col', undefined, creditLabel(row.nanoAiu, true)));
			this.applyEstimated(rowTotal, true);
		}

		// Footer: per-model column totals (exact once finalized) + grand total.
		const tfoot = DOM.append(table, $('tfoot'));
		const footRow = DOM.append(tfoot, $('tr'));
		DOM.append(footRow, $('th.chat-debug-cost-matrix-row-label', undefined, localize('chatDebug.cost.columnTotal', "Total")));
		for (const column of matrix.columns) {
			const cell = DOM.append(footRow, $('td', undefined, creditLabel(column.nanoAiu, !finalized)));
			this.applyEstimated(cell, !finalized);
		}
		const grand = DOM.append(footRow, $('td.chat-debug-cost-matrix-total-col', undefined, creditLabel(matrix.totalNanoAiu, !finalized)));
		this.applyEstimated(grand, !finalized);
	}

	private createGroupingButton(parent: HTMLElement, mode: GroupingMode, label: string): void {
		const button = this.loadDisposables.add(new Button(parent, { ...defaultButtonStyles, secondary: this.grouping !== mode, title: label }));
		button.element.classList.add('chat-debug-cost-toggle-button');
		button.element.classList.toggle('checked', this.grouping === mode);
		button.label = label;
		this.loadDisposables.add(button.onDidClick(() => {
			if (this.grouping !== mode) {
				this.grouping = mode;
				this.expandedKeys.clear();
				this.load();
			}
		}));
	}

	private renderBucket(list: HTMLElement, bucket: ICostBucket, totalNanoAiu: number, estimated: boolean): void {
		const percentage = totalNanoAiu > 0 ? (bucket.nanoAiu / totalNanoAiu) * 100 : 0;
		const isExpandable = bucket.leaves.size > 1;
		const isExpanded = isExpandable && this.expandedKeys.has(bucket.key);

		const row = DOM.append(list, $('.chat-debug-cost-row'));
		row.classList.toggle('expandable', isExpandable);
		if (isExpandable) {
			row.tabIndex = 0;
			row.setAttribute('role', 'button');
			row.setAttribute('aria-expanded', String(isExpanded));
			const toggle = () => {
				if (this.expandedKeys.has(bucket.key)) {
					this.expandedKeys.delete(bucket.key);
				} else {
					this.expandedKeys.add(bucket.key);
				}
				this.load();
			};
			this.loadDisposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, toggle));
			this.loadDisposables.add(DOM.addDisposableListener(row, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle();
				}
			}));
		}

		// Header line: chevron (if expandable) + label + value
		const header = DOM.append(row, $('.chat-debug-cost-row-header'));
		if (isExpandable) {
			DOM.append(header, $(`span.chat-debug-cost-chevron${ThemeIcon.asCSSSelector(isExpanded ? Codicon.chevronDown : Codicon.chevronRight)}`));
		}
		DOM.append(header, $('span.chat-debug-cost-row-label', undefined, bucket.label));
		const value = DOM.append(header, $('span.chat-debug-cost-row-value'));
		const credits = DOM.append(value, $('span.chat-debug-cost-row-credits', undefined, creditLabel(bucket.nanoAiu, estimated)));
		this.applyEstimated(credits, estimated);
		DOM.append(value, $('span.chat-debug-cost-row-percent', undefined, localize('chatDebug.cost.percent', "{0}%", percentage.toFixed(1))));

		// Proportional bar
		const bar = DOM.append(row, $('.chat-debug-cost-bar'));
		const fill = DOM.append(bar, $('.chat-debug-cost-bar-fill'));
		fill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;

		// Meta line: turn / tool counts + token usage + cache efficiency
		const metaParts: string[] = [
			localize('chatDebug.cost.modelTurns', "{0} model turns", bucket.modelTurnCount),
		];
		if (this.grouping === 'subagent') {
			metaParts.push(localize('chatDebug.cost.toolCalls', "{0} tool calls", bucket.toolCallCount));
		}
		if (bucket.hasTokenData) {
			metaParts.push(localize('chatDebug.cost.tokensInOut', "{0} in / {1} out", formatTokens(bucket.inputTokens), formatTokens(bucket.outputTokens)));
			const rate = cacheHitRate(bucket);
			if (rate !== undefined) {
				metaParts.push(localize('chatDebug.cost.cached', "{0}% cached", rate.toFixed(0)));
			}
		}
		DOM.append(row, $('.chat-debug-cost-row-meta', undefined, metaParts.join(' \u00b7 ')));

		// Expanded cross-dimension breakdown
		if (isExpanded) {
			const leavesContainer = DOM.append(row, $('.chat-debug-cost-leaves'));
			const leaves = Array.from(bucket.leaves.values()).sort((a, b) => b.nanoAiu - a.nanoAiu);
			for (const leaf of leaves) {
				const leafRow = DOM.append(leavesContainer, $('.chat-debug-cost-leaf'));
				DOM.append(leafRow, $('span.chat-debug-cost-leaf-label', undefined, leaf.label));
				if (leaf.hasTokenData) {
					DOM.append(leafRow, $('span.chat-debug-cost-leaf-tokens', undefined,
						localize('chatDebug.cost.tokensInOut', "{0} in / {1} out", formatTokens(leaf.inputTokens), formatTokens(leaf.outputTokens))));
				}
				const leafValue = DOM.append(leafRow, $('span.chat-debug-cost-leaf-value', undefined, creditLabel(leaf.nanoAiu, estimated)));
				this.applyEstimated(leafValue, estimated);
			}
		}
	}
}

/**
 * Walks up the `parentEventId` chain from a starting parent id to find the
 * nearest enclosing tool call. Model turns and tool calls spawned by a subagent
 * nest (directly or transitively) under the tool call that spawned that
 * subagent, so the nearest enclosing tool call identifies the subagent
 * invocation an event belongs to. Returns `undefined` for the main agent.
 */
function nearestEnclosingToolCall(startParentId: string | undefined, byId: Map<string, IChatDebugEvent>): IChatDebugToolCallEvent | undefined {
	const seen = new Set<string>();
	let current = startParentId;
	while (current && !seen.has(current)) {
		seen.add(current);
		const event = byId.get(current);
		if (!event) {
			return undefined;
		}
		if (event.kind === 'toolCall') {
			return event;
		}
		current = event.parentEventId;
	}
	return undefined;
}

/**
 * Derives a short, human-readable label for a subagent invocation from its
 * spawning tool call, preferring a `description`/`prompt`/`name` field parsed
 * from the tool input.
 */
function subagentLabel(toolCall: IChatDebugToolCallEvent): string {
	let descriptor: string | undefined;
	if (toolCall.input) {
		try {
			const parsed = JSON.parse(toolCall.input);
			const candidate = parsed?.description ?? parsed?.name ?? parsed?.prompt;
			if (typeof candidate === 'string') {
				descriptor = candidate.replace(/\s+/g, ' ').trim();
			}
		} catch {
			// Not JSON — ignore and fall back to the tool name.
		}
	}
	if (descriptor) {
		const trimmed = descriptor.length > 60 ? `${descriptor.slice(0, 60)}\u2026` : descriptor;
		return localize('chatDebug.cost.subagentLabel', "{0}: {1}", toolCall.toolName, trimmed);
	}
	return toolCall.toolName;
}

/**
 * Accumulates a model turn's token usage onto a token total.
 */
function addTurnTokens(target: ICostTokens, turn: IChatDebugModelTurnEvent): void {
	if (turn.inputTokens !== undefined) {
		target.inputTokens += turn.inputTokens;
		target.hasTokenData = true;
	}
	if (turn.outputTokens !== undefined) {
		target.outputTokens += turn.outputTokens;
		target.hasTokenData = true;
	}
	if (turn.cachedTokens !== undefined) {
		target.cachedTokens += turn.cachedTokens;
		target.hasTokenData = true;
	}
}

/**
 * Aggregates a session's debug events into a cost breakdown grouped by the
 * requested primary dimension, with a secondary cross-dimension breakdown per
 * bucket. Credits come from per-model-turn `copilotUsageNanoAiu`; tokens from
 * the per-model-turn token fields (exact per model for finished sessions).
 */
export function computeCostBreakdown(events: readonly IChatDebugEvent[], grouping: 'subagent' | 'model'): ICostBreakdown {
	const byId = new Map<string, IChatDebugEvent>();
	for (const event of events) {
		if (event.id) {
			byId.set(event.id, event);
		}
	}

	const buckets = new Map<string, ICostBucket>();
	const getBucket = (key: string, label: string): ICostBucket => {
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = { key, label, nanoAiu: 0, modelTurnCount: 0, toolCallCount: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, hasTokenData: false, leaves: new Map() };
			buckets.set(key, bucket);
		}
		return bucket;
	};

	const addLeaf = (bucket: ICostBucket, key: string, label: string, turn: IChatDebugModelTurnEvent, nanoAiu: number): void => {
		let leaf = bucket.leaves.get(key);
		if (!leaf) {
			leaf = { label, nanoAiu: 0, modelTurnCount: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, hasTokenData: false };
			bucket.leaves.set(key, leaf);
		}
		leaf.nanoAiu += nanoAiu;
		leaf.modelTurnCount += 1;
		addTurnTokens(leaf, turn);
	};

	let totalNanoAiu = 0;
	const sessionTokens: ICostTokens = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, hasTokenData: false };

	for (const event of events) {
		const enclosing = nearestEnclosingToolCall(event.parentEventId, byId);
		const subagentKey = enclosing ? `subagent:${enclosing.id}` : MAIN_AGENT_KEY;
		const subagentName = enclosing ? subagentLabel(enclosing) : localize('chatDebug.cost.mainAgent', "Main Agent");

		if (event.kind === 'modelTurn') {
			const turn = event as IChatDebugModelTurnEvent;
			const nanoAiu = turn.copilotUsageNanoAiu ?? 0;
			totalNanoAiu += nanoAiu;
			addTurnTokens(sessionTokens, turn);

			const modelName = turn.model ?? localize('chatDebug.cost.unknownModel', "Unknown model");
			const primaryKey = grouping === 'subagent' ? subagentKey : `model:${modelName}`;
			const primaryLabel = grouping === 'subagent' ? subagentName : modelName;
			const bucket = getBucket(primaryKey, primaryLabel);
			bucket.nanoAiu += nanoAiu;
			bucket.modelTurnCount += 1;
			addTurnTokens(bucket, turn);

			if (grouping === 'subagent') {
				addLeaf(bucket, `model:${modelName}`, modelName, turn, nanoAiu);
			} else {
				addLeaf(bucket, subagentKey, subagentName, turn, nanoAiu);
			}
		} else if (event.kind === 'toolCall' && grouping === 'subagent') {
			// Attribute a tool call to the subagent that issued it (its enclosing
			// tool call), so the spawning `runSubagent` call counts toward the
			// agent that issued it rather than the subagent it spawned.
			getBucket(subagentKey, subagentName).toolCallCount += 1;
		}
	}

	const sorted = Array.from(buckets.values())
		.filter(b => b.nanoAiu > 0 || b.modelTurnCount > 0)
		.sort((a, b) => {
			// Keep the main agent first, then order by descending cost.
			if (a.key === MAIN_AGENT_KEY) { return -1; }
			if (b.key === MAIN_AGENT_KEY) { return 1; }
			return b.nanoAiu - a.nanoAiu;
		});

	return { totalNanoAiu, buckets: sorted, ...sessionTokens };
}

/**
 * Aggregates a session's model turns into a subagent (row) × model (column)
 * credit matrix. Cells, row totals, and column totals all sum to the same
 * session total.
 */
export function computeCostMatrix(events: readonly IChatDebugEvent[]): ICostMatrix {
	const byId = new Map<string, IChatDebugEvent>();
	for (const event of events) {
		if (event.id) {
			byId.set(event.id, event);
		}
	}

	const rows = new Map<string, ICostMatrixRow>();
	const columns = new Map<string, ICostMatrixColumn>();
	let totalNanoAiu = 0;

	for (const event of events) {
		if (event.kind !== 'modelTurn') {
			continue;
		}
		const turn = event as IChatDebugModelTurnEvent;
		const nanoAiu = turn.copilotUsageNanoAiu ?? 0;
		if (nanoAiu <= 0) {
			continue;
		}
		totalNanoAiu += nanoAiu;

		const enclosing = nearestEnclosingToolCall(turn.parentEventId, byId);
		const rowKey = enclosing ? `subagent:${enclosing.id}` : MAIN_AGENT_KEY;
		const rowLabel = enclosing ? subagentLabel(enclosing) : localize('chatDebug.cost.mainAgent', "Main Agent");
		const colKey = `model:${turn.model ?? localize('chatDebug.cost.unknownModel', "Unknown model")}`;
		const colLabel = turn.model ?? localize('chatDebug.cost.unknownModel', "Unknown model");

		let row = rows.get(rowKey);
		if (!row) {
			row = { key: rowKey, label: rowLabel, cells: new Map(), nanoAiu: 0 };
			rows.set(rowKey, row);
		}
		row.nanoAiu += nanoAiu;
		row.cells.set(colKey, (row.cells.get(colKey) ?? 0) + nanoAiu);

		let column = columns.get(colKey);
		if (!column) {
			column = { key: colKey, label: colLabel, nanoAiu: 0 };
			columns.set(colKey, column);
		}
		column.nanoAiu += nanoAiu;
	}

	const sortedColumns = Array.from(columns.values()).sort((a, b) => b.nanoAiu - a.nanoAiu);
	const sortedRows = Array.from(rows.values()).sort((a, b) => {
		if (a.key === MAIN_AGENT_KEY) { return -1; }
		if (b.key === MAIN_AGENT_KEY) { return 1; }
		return b.nanoAiu - a.nanoAiu;
	});

	return { totalNanoAiu, columns: sortedColumns, rows: sortedRows };
}

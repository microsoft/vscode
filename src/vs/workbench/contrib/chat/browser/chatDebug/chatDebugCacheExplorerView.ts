/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Orientation, Sash, SashState } from '../../../../../base/browser/ui/sash/sash.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { IAction, Separator, toAction } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { equals } from '../../../../../base/common/objects.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { defaultBreadcrumbsWidgetStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { RangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { IChatDebugEventModelTurnContent, IChatDebugMessageSection, IChatDebugModelTurnEvent, IChatDebugService, IChatDebugUserMessageEvent } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { appendSystemDrift, appendToolsDrift, CacheDiffKind, diffPromptSignature, ICacheDiffResult, IComponentDrift, INormalizedMessage, parseInputMessages } from './chatDebugCacheDiff.js';
import { analyzeStringDivergence, buildSessionCacheReport, CacheBreakCategory, cacheBreakCategoryLabel, CacheInsightSeverity, categorizeCacheBreak, computeCacheInsights, describeStringDivergence, ICacheInsight, ISessionCacheReport, ISessionPairOutcome, maxInsightSeverity, primaryInsight } from './chatDebugCacheInsights.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';

const $ = DOM.$;
const numberFormatter = safeIntl.NumberFormat();
const timeFormatter = safeIntl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** Default rail width in pixels. */
const RAIL_DEFAULT_WIDTH = 280;
const RAIL_MIN_WIDTH = 180;
const RAIL_MAX_WIDTH = 600;
const CURRENT_CONTINUATION_DELTA_COMPONENT = 'current continuation delta';

/** Idle gaps at or above this many minutes get a TTL marker in the rail. */
const TTL_GAP_MINUTES = 5;

/** The main panel edit agent, selected by default in the agent filter. */
const DEFAULT_AGENT_KEY = 'panel/editAgent';

/**
 * Navigation events fired by the Cache Explorer breadcrumb.
 */
export const enum CacheExplorerNavigation {
	Home = 'home',
	Overview = 'overview',
}

/** Resolved data for one A or B side. */
interface ISideData {
	readonly event: IChatDebugModelTurnEvent;
	readonly content: IChatDebugEventModelTurnContent | undefined;
	readonly system: string | undefined;
	readonly tools: string | undefined;
	readonly inputMessages: readonly INormalizedMessage[];
	readonly requestShape: IRequestShapeInfo;
}

interface IRequestShapeInfo {
	readonly label: string;
	readonly description: string | undefined;
	readonly isContinuation: boolean;
	readonly api: string | undefined;
	readonly inputItemTypes: readonly string[];
}

/** A grouping of model turns sharing the same parent (one user request). */
interface ITurnGroup {
	readonly key: string;
	readonly userMessage: IChatDebugUserMessageEvent | undefined;
	readonly turns: readonly { readonly turn: IChatDebugModelTurnEvent; readonly index: number }[];
}

/**
 * Cache Explorer view — the third entry under "Explore Trace Data". Shows a
 * left rail of model turns with their cache hit %, plus a side-by-side prompt
 * signature diff that pinpoints where the prefix breaks.
 *
 * v1 reads {@link IChatDebugEventModelTurnContent} from the in-memory chat
 * debug service via {@link IChatDebugService.resolveEvent}. Content may be
 * truncated by the OTel attribute cap; the file-logger backed full-fidelity
 * provider is a follow-up.
 */
export class ChatDebugCacheExplorerView extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<CacheExplorerNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly rail: HTMLElement;
	private readonly railToolbar: HTMLElement;
	private readonly railList: HTMLElement;
	private readonly content: HTMLElement;
	private readonly sash: Sash;
	private railWidth = RAIL_DEFAULT_WIDTH;
	/** Disposables for the left rail (toolbar + turn rows). Cleared on every full render. */
	private readonly railDisposables = this._register(new DisposableStore());
	/** Disposables for the right content panel. Cleared whenever the content is re-rendered. */
	private readonly contentDisposables = this._register(new DisposableStore());
	private readonly refreshScheduler: RunOnceScheduler;

	private currentSessionResource: URI | undefined;
	/** All model turns for the session, before the agent filter is applied. */
	private allModelTurns: IChatDebugModelTurnEvent[] = [];
	/** Model turns after the agent filter — the list the rail and diff operate on. */
	private modelTurns: IChatDebugModelTurnEvent[] = [];
	/** Selected turn (B side). A is computed as `selectedIndex - 1`. -1 = no explicit selection yet. */
	private selectedIndex = -1;
	/**
	 * Selected agent names (keyed by {@link agentKey}). `undefined` until the
	 * first render applies the default selection. An empty set is never stored —
	 * clearing the last agent falls back to "all".
	 */
	private selectedAgents: Set<string> | undefined;
	/**
	 * Turn to re-select after the next render, used to keep the user's place
	 * when the agent filter changes. Stored as the event object rather than its
	 * id because {@link IChatDebugModelTurnEvent.id} is optional; matching falls
	 * back to object reference and a composite identity for turns without an id.
	 */
	private pendingSelectTurn: IChatDebugModelTurnEvent | undefined;
	/** Whether the per-chunk signature breakdown table is expanded. */
	private sigBreakdownOpen = false;
	/** Rail turn-row elements by turn index, for in-place selection updates without rebuilding the rail. */
	private readonly railRowsByIndex = new Map<number, HTMLElement>();
	/**
	 * Component accordion entries by component name (`system`, `tools`,
	 * `messages[i]`), so findings and signature segments can reveal the
	 * matching entry. We track both the outer item (for the open/flash
	 * classes and scroll target) and the inner header (the focus target).
	 * Rebuilt on every content render.
	 */
	private readonly componentElements = new Map<string, { item: HTMLElement; head: HTMLElement }>();
	/** Selection index the breaking component was last auto-expanded for. */
	private autoOpenedForIndex = -1;
	/**
	 * Memoized cross-turn session report. Keyed on the session + filtered
	 * turn list so background refreshes with new events recompute it while
	 * plain selection changes reuse it.
	 */
	private sessionReportCache: { key: string; report: ISessionCacheReport } | undefined;

	/**
	 * Monotonically-increasing render token. Each call to {@link render}
	 * captures the current value, then re-checks it after each await; if a
	 * newer render has started in the meantime, the older one bails out
	 * before mutating the DOM. Avoids races where a slow model-turn
	 * resolve from one session writes into another's panel.
	 */
	private renderToken = 0;

	/** Cache of resolved model-turn content keyed by event id. */
	private readonly resolvedCache = new Map<string, IChatDebugEventModelTurnContent | undefined>();

	/** Components currently expanded (by component name). */
	private readonly openComponents = new Set<string>(['system', 'tools']);

	/** Rail groups currently collapsed (by group key — the parent event id). */
	private readonly collapsedGroups = new Set<string>();

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-cache'));
		DOM.hide(this.container);

		// Breadcrumb
		const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
		this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
		this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
		this._register(this.breadcrumbWidget.onDidSelectItem(e => {
			if (e.type === 'select' && e.item instanceof TextBreadcrumbItem) {
				this.breadcrumbWidget.setSelection(undefined);
				const items = this.breadcrumbWidget.getItems();
				const idx = items.indexOf(e.item);
				if (idx === 0) {
					this._onNavigate.fire(CacheExplorerNavigation.Home);
				} else if (idx === 1) {
					this._onNavigate.fire(CacheExplorerNavigation.Overview);
				}
			}
		}));

		// Body: 2-column split with resizable rail
		const body = DOM.append(this.container, $('.chat-debug-cache-body'));
		this.rail = DOM.append(body, $('.chat-debug-cache-rail'));
		this.rail.style.width = `${this.railWidth}px`;
		this.railToolbar = DOM.append(this.rail, $('.chat-debug-cache-rail-toolbar'));
		this.railList = DOM.append(this.rail, $('.chat-debug-cache-rail-list'));
		this.content = DOM.append(body, $('.chat-debug-cache-content'));

		this.sash = this._register(new Sash(body, {
			getVerticalSashLeft: () => this.railWidth,
		}, { orientation: Orientation.VERTICAL }));
		this.sash.state = SashState.Enabled;
		let sashStartWidth: number | undefined;
		this._register(this.sash.onDidStart(() => sashStartWidth = this.railWidth));
		this._register(this.sash.onDidEnd(() => {
			sashStartWidth = undefined;
			this.sash.layout();
		}));
		this._register(this.sash.onDidChange(e => {
			if (sashStartWidth === undefined) {
				return;
			}
			const delta = e.currentX - e.startX;
			const next = Math.max(RAIL_MIN_WIDTH, Math.min(RAIL_MAX_WIDTH, sashStartWidth + delta));
			this.railWidth = next;
			this.rail.style.width = `${next}px`;
			this.sash.layout();
		}));

		this.refreshScheduler = this._register(new RunOnceScheduler(() => this.render(), 50));
	}

	setSession(sessionResource: URI): void {
		if (!this.currentSessionResource || this.currentSessionResource.toString() !== sessionResource.toString()) {
			this.resolvedCache.clear();
			this.collapsedGroups.clear();
			this.openComponents.clear();
			this.openComponents.add('system');
			this.openComponents.add('tools');
			this.selectedIndex = -1;
			this.selectedAgents = undefined;
			this.pendingSelectTurn = undefined;
			this.sigBreakdownOpen = false;
			this.autoOpenedForIndex = -1;
			this.sessionReportCache = undefined;
		}
		this.currentSessionResource = sessionResource;
	}

	show(): void {
		DOM.show(this.container);
		this.render();
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
		const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
		this.breadcrumbWidget.setItems([
			new TextBreadcrumbItem(localize('chatDebug.title', "Agent Debug Logs"), true),
			new TextBreadcrumbItem(sessionTitle, true),
			new TextBreadcrumbItem(localize('chatDebug.cacheExplorer', "Cache Explorer")),
		]);
	}

	private async render(): Promise<void> {
		// Monotonically-increasing token. Captured at the start of every
		// render() and re-checked after each await so an in-flight resolve
		// that's been superseded by a newer render bails out before
		// touching the DOM.
		const token = ++this.renderToken;
		const isCurrent = () => token === this.renderToken;

		// Preserve the rail scroll position across a full rebuild so a
		// background refresh (new events) doesn't yank the list while the
		// user is reading it.
		const railScrollTop = this.railList.scrollTop;

		this.updateBreadcrumb();
		this.railDisposables.clear();
		DOM.clearNode(this.railToolbar);
		DOM.clearNode(this.railList);
		this.railRowsByIndex.clear();

		if (!this.currentSessionResource) {
			this.contentDisposables.clear();
			DOM.clearNode(this.content);
			return;
		}

		const events = this.chatDebugService.getEvents(this.currentSessionResource);
		this.allModelTurns = events.filter((e): e is IChatDebugModelTurnEvent => e.kind === 'modelTurn');
		const userMessages = events.filter((e): e is IChatDebugUserMessageEvent => e.kind === 'userMessage');

		if (this.allModelTurns.length === 0) {
			this.contentDisposables.clear();
			DOM.clearNode(this.content);
			const empty = DOM.append(this.content, $('.chat-debug-cache-empty'));
			empty.textContent = localize('chatDebug.cache.noTurns', "No model turns recorded for this session yet.");
			return;
		}

		// Agent filter: derive the distinct agents and apply the default
		// selection (the main panel edit agent) the first time we render a
		// session. The toolbar lets the user reveal the other agents.
		const agentCounts = computeAgentCounts(this.allModelTurns);
		if (this.selectedAgents === undefined) {
			this.selectedAgents = defaultAgentSelection(agentCounts);
		}
		this.renderRailToolbar(agentCounts);

		this.modelTurns = this.allModelTurns.filter(t => this.selectedAgents!.has(agentKey(t)));

		if (this.modelTurns.length === 0) {
			this.contentDisposables.clear();
			DOM.clearNode(this.content);
			const empty = DOM.append(this.content, $('.chat-debug-cache-empty'));
			empty.textContent = localize('chatDebug.cache.noTurnsForAgents', "No model turns match the selected agent filter.");
			return;
		}

		// Restore the previously-selected turn when the filter changes, so
		// toggling agents keeps the user on the same request when possible.
		// When that turn no longer survives the filter, fall back to the most
		// recent turn rather than leaving the stale ordinal index pointing at
		// an unrelated turn.
		if (this.pendingSelectTurn) {
			this.selectedIndex = resolveFilteredSelectionIndex(this.modelTurns, this.pendingSelectTurn);
			this.pendingSelectTurn = undefined;
		}

		// Default to the most recent turn on first display, and silently
		// fall back to the most recent turn when switching to a session
		// that has fewer turns than the previous selection \u2014 the rail
		// re-renders so the new selection is still visible.
		if (this.selectedIndex < 0 || this.selectedIndex >= this.modelTurns.length) {
			this.selectedIndex = this.modelTurns.length - 1;
		}

		this.renderRail(buildTurnGroups(this.modelTurns, userMessages));
		this.railList.scrollTop = railScrollTop;

		await this.renderContentInner(token, isCurrent);
	}

	/**
	 * Render the right-hand content panel (summary, signature, options,
	 * components) for the current selection. Split out of {@link render} so a
	 * selection change can refresh just the content without rebuilding the
	 * rail \u2014 which is what keeps keyboard focus and scroll position stable
	 * while navigating turns.
	 *
	 * @param preserveScroll keep the content scroll position (used for zoom
	 * and breakdown toggles where the selection is unchanged).
	 */
	private async renderContentInner(token: number, isCurrent: () => boolean, preserveScroll = false): Promise<void> {
		const prevScroll = preserveScroll ? this.content.scrollTop : 0;

		const bEvent = this.modelTurns[this.selectedIndex];
		const aEvent = this.selectedIndex > 0 ? this.modelTurns[this.selectedIndex - 1] : undefined;

		// Resolve everything — both sides AND the session report — *before*
		// touching the DOM, then build the panel in one synchronous pass.
		// Nothing mutates the layout after it is shown, so it never jumps.
		// The report is scoped to the turns up to the selected one, which
		// also makes it immune to new requests streaming in: selecting the
		// last request shows the whole conversation.
		const report = await this.ensureSessionReport();
		if (!isCurrent()) {
			return;
		}

		if (!aEvent) {
			// No prior turn to diff against — still surface OTel-reported cache hit
			// and request metadata for the first turn of a session.
			const b = await this.resolveSide(bEvent);
			if (!isCurrent()) {
				return;
			}
			this.contentDisposables.clear();
			DOM.clearNode(this.content);
			this.renderTitleRow();
			this.renderSingleSummary(b);
			if (preserveScroll) {
				this.content.scrollTop = prevScroll;
			}
			return;
		}

		const [a, b] = await Promise.all([this.resolveSide(aEvent), this.resolveSide(bEvent)]);
		// If a newer render started while we were resolving, drop this one.
		if (!isCurrent()) {
			return;
		}

		this.contentDisposables.clear();
		DOM.clearNode(this.content);
		this.renderTitleRow();
		if (report && report.pairCount > 0) {
			this.renderSessionHealth(DOM.append(this.content, $('.chat-debug-cache-session-health')), report);
		}

		// When the request-side prompt was not captured (e.g. agent-host /
		// Copilot CLI sessions, whose log records the model's output but not the
		// request sent to it), the reported cache-hit numbers are still accurate
		// but there is nothing to diff. Show the token-based performance only and
		// skip the divergence analysis — running it against absent data would
		// fabricate a "stable prefix" / "cache expiration" verdict.
		const hasSignatureData = !!(a.system || a.tools || a.inputMessages.length || b.system || b.tools || b.inputMessages.length);
		if (!hasSignatureData) {
			this.renderTokenOnlySummary(a, b);
			if (preserveScroll) {
				this.content.scrollTop = prevScroll;
			}
			return;
		}

		const compareInputMessages = shouldCompareInputMessages(a, b);
		const diff = compareInputMessages
			? diffPromptSignature(a.inputMessages, b.inputMessages)
			: diffPromptSignature([], []);
		const drift = appendToolsDrift(appendSystemDrift([...diff.drift], a.system, b.system), a.tools, b.tools);
		const { insights, optionsDiff } = this.buildInsights(a, b, diff, compareInputMessages);

		// Auto-expand the breaking component once per selection so the
		// evidence is one scroll away, while respecting a deliberate
		// collapse on subsequent re-renders of the same selection.
		if (this.autoOpenedForIndex !== this.selectedIndex) {
			this.autoOpenedForIndex = this.selectedIndex;
			const target = primaryInsight(insights)?.component;
			if (target) {
				this.openComponents.add(target);
			}
		}

		this.renderSummary(a, b, diff, compareInputMessages, insights, optionsDiff);
		this.renderSignature(a, b, diff, compareInputMessages);
		this.renderRequestOptions(a, b);
		this.renderComponents(drift, a, b, compareInputMessages, diff.counts.identical);
		if (preserveScroll) {
			this.content.scrollTop = prevScroll;
		}
	}

	/**
	 * Build the findings list for an A→B pair. Shared between the per-turn
	 * content panel and the cross-turn session report.
	 */
	private buildInsights(a: ISideData, b: ISideData, diff: ICacheDiffResult, compareInputMessages: boolean): { insights: ICacheInsight[]; optionsDiff: readonly IOptionDelta[] } {
		const optionsDiff = computeOptionsDiff(a, b);
		const minutesSincePrevious = (b.event.created.getTime() - a.event.created.getTime()) / 60_000;
		const insights = computeCacheInsights({
			aModel: a.event.model,
			bModel: b.event.model,
			aSystem: a.system,
			bSystem: b.system,
			aTools: a.tools,
			bTools: b.tools,
			aMessages: a.inputMessages,
			bMessages: b.inputMessages,
			diff,
			optionsDiff: optionsDiff.map(d => ({ key: d.key, previousLabel: formatOptionValue(d.previous), currentLabel: formatOptionValue(d.current) })),
			hitPct: computeCacheHit(b.event),
			inputTokens: b.event.inputTokens ?? 0,
			minutesSincePrevious: Number.isFinite(minutesSincePrevious) && minutesSincePrevious >= 0 ? minutesSincePrevious : undefined,
			isContinuation: b.requestShape.isContinuation,
			previousIsContinuation: a.requestShape.isContinuation,
			compareInputMessages,
		});
		return { insights, optionsDiff };
	}

	/**
	 * Memoization key for the session report. The report is scoped to the
	 * turns up to (and including) the selected one, so it is stable while
	 * later requests stream in. Undefined when there is nothing to report
	 * (no session, or fewer than two turns in scope).
	 *
	 * Every in-scope turn contributes its identity AND token counts to the
	 * key — endpoints alone would miss a middle turn replaced in place, and
	 * token counts live on the event (not the id-cached resolved content),
	 * so a usage update arriving after the first render must invalidate the
	 * memoized report or the overall hit rate stays stale.
	 */
	private sessionReportKey(): string | undefined {
		if (!this.currentSessionResource || this.selectedIndex < 1) {
			return undefined;
		}
		const parts: string[] = [
			this.currentSessionResource.toString(),
			[...(this.selectedAgents ?? [])].sort().join(','),
		];
		for (let i = 0; i <= this.selectedIndex; i++) {
			const turn = this.modelTurns[i];
			parts.push(`${turn.id ?? turn.created.getTime()}:${turn.inputTokens ?? ''}:${turn.cachedTokens ?? ''}`);
		}
		return parts.join('|');
	}

	/**
	 * Run the insights engine over every consecutive turn pair up to the
	 * selected turn and aggregate the outcome. Memoized per (session,
	 * selection prefix, agent filter) — per-turn resolution is cached in
	 * {@link resolvedCache}, so even a cold run is one pass over in-memory
	 * events.
	 */
	private async ensureSessionReport(): Promise<ISessionCacheReport | undefined> {
		const key = this.sessionReportKey();
		if (key === undefined) {
			return undefined;
		}
		const cached = this.sessionReportCache?.key === key ? this.sessionReportCache.report : undefined;
		if (cached) {
			return cached;
		}
		const scopedTurns = this.modelTurns.slice(0, this.selectedIndex + 1);
		const sides = await Promise.all(scopedTurns.map(t => this.resolveSide(t)));
		const pairs: ISessionPairOutcome[] = [];
		for (let i = 1; i < sides.length; i++) {
			const a = sides[i - 1];
			const b = sides[i];
			const compare = shouldCompareInputMessages(a, b);
			const diff = compare ? diffPromptSignature(a.inputMessages, b.inputMessages) : diffPromptSignature([], []);
			const { insights } = this.buildInsights(a, b, diff, compare);
			const inputTokens = b.event.inputTokens ?? 0;
			const cachedTokens = b.event.cachedTokens ?? 0;
			pairs.push({
				turnIndex: i,
				category: categorizeCacheBreak(insights),
				lostTokens: Math.max(0, inputTokens - cachedTokens),
			});
		}
		// All in-scope turns (including the first, which has no pair) feed
		// the token-weighted overall hit rate.
		const turnTokens = scopedTurns.map(t => ({ inputTokens: t.inputTokens ?? 0, cachedTokens: t.cachedTokens ?? 0 }));
		const report = buildSessionCacheReport(pairs, turnTokens);
		this.sessionReportCache = { key, report };
		return report;
	}

	/** Render the session-level cache health card from the cross-turn report. */
	private renderSessionHealth(container: HTMLElement, report: ISessionCacheReport): void {
		DOM.append(container, $('.chat-debug-cache-card-h', undefined, localize('chatDebug.cache.sessionHealth', "Session cache health")));
		// Token-weighted overall hit: per-request percentages overweight
		// small utility calls (titles, summaries); weighting by input tokens
		// shows what the session actually cost.
		if (report.overall) {
			const headline = DOM.append(container, $('.chat-debug-cache-card-headline'));
			headline.textContent = localize('chatDebug.cache.sessionOverallHit', "{0}% overall cache hit", formatCachePct(report.overall.hitPct));
			const sub = DOM.append(container, $('.chat-debug-cache-card-sub'));
			sub.textContent = localize('chatDebug.cache.sessionOverallSub',
				"{0} of {1} input tokens served from cache across {2} requests (token-weighted)",
				numberFormatter.value.format(report.overall.cachedTokens),
				numberFormatter.value.format(report.overall.inputTokens),
				report.overall.turnCount);
		}
		const statsLine = DOM.append(container, $('.chat-debug-cache-session-health-stats'));
		statsLine.textContent = report.avoidableLostTokens > 0
			? localize('chatDebug.cache.sessionHealthStatsLost',
				"{0} of {1} request pairs healthy · ~{2} tokens recomputed avoidably",
				report.healthyCount, report.pairCount, numberFormatter.value.format(report.avoidableLostTokens))
			: localize('chatDebug.cache.sessionHealthStats',
				"{0} of {1} request pairs healthy",
				report.healthyCount, report.pairCount);

		if (report.byCategory.length > 0) {
			const chips = DOM.append(container, $('.chat-debug-cache-session-health-chips'));
			for (const stat of report.byCategory) {
				const chip = DOM.append(chips, $(`span.chat-debug-cache-session-health-chip.cause-${stat.category}`));
				DOM.append(chip, $(`span.codicon.codicon-${categoryIcon(stat.category)}`, { 'aria-hidden': 'true' }));
				DOM.append(chip, $('span', undefined, localize('chatDebug.cache.sessionHealthChip', "{0} ×{1} · {2} tok", cacheBreakCategoryLabel(stat.category), stat.count, numberFormatter.value.format(stat.lostTokens))));
			}
		}

		if (report.findings.length > 0) {
			const list = DOM.append(container, $('.chat-debug-cache-findings'));
			for (const finding of report.findings) {
				this.renderFinding(list, finding);
			}
		}
	}


	/**
	 * Select a turn (the B side of the diff) and refresh only the content
	 * panel. The rail is updated in place \u2014 just the selected classes move \u2014
	 * so clicking or arrowing through turns never rebuilds the list, keeping
	 * focus and scroll position stable.
	 */
	private selectTurn(index: number, focusOptions?: FocusOptions): void {
		if (index < 0 || index >= this.modelTurns.length || index === this.selectedIndex) {
			return;
		}
		const prevRow = this.railRowsByIndex.get(this.selectedIndex);
		if (prevRow) {
			prevRow.classList.remove('is-selected');
			prevRow.removeAttribute('aria-current');
		}
		this.selectedIndex = index;
		const nextRow = this.railRowsByIndex.get(index);
		if (nextRow) {
			nextRow.classList.add('is-selected');
			nextRow.setAttribute('aria-current', 'true');
			if (focusOptions) {
				nextRow.focus(focusOptions);
			}
		}
		const token = ++this.renderToken;
		void this.renderContentInner(token, () => token === this.renderToken);
	}

	/** Move the selection to the previous/next visible turn row (arrow keys). */
	private moveSelection(delta: number): void {
		// `railRowsByIndex` is populated in render (visual) order and `Map`
		// iteration preserves insertion order, so the keys already match the
		// order rows appear in the rail — no need to sort on every keypress.
		const indices = [...this.railRowsByIndex.keys()];
		if (indices.length === 0) {
			return;
		}
		const pos = indices.indexOf(this.selectedIndex);
		const nextPos = pos === -1
			? (delta > 0 ? 0 : indices.length - 1)
			: Math.min(indices.length - 1, Math.max(0, pos + delta));
		this.selectTurn(indices[nextPos], { preventScroll: false });
	}


	/**
	 * Render the agent filter dropdown at the top of the rail. Hidden when a
	 * session only used a single agent (nothing to filter).
	 */
	private renderRailToolbar(agentCounts: Map<string, number>): void {
		const agents = [...agentCounts.keys()];
		if (agents.length <= 1) {
			DOM.hide(this.railToolbar);
			return;
		}
		DOM.show(this.railToolbar);

		const selected = this.selectedAgents ?? new Set(agents);
		const selectedCount = agents.filter(a => selected.has(a)).length;

		const label = DOM.append(this.railToolbar, $('span.chat-debug-cache-filter-label'));
		label.textContent = localize('chatDebug.cache.filterAgentsLabel', "Agent");

		const button = DOM.append(this.railToolbar, $('button.chat-debug-cache-filter-button'));
		button.setAttribute('aria-haspopup', 'menu');
		const summary = selectedCount === agents.length
			? localize('chatDebug.cache.filterAll', "All agents ({0})", agents.length)
			: selectedCount === 1
				? agents.find(a => selected.has(a)) ?? ''
				: localize('chatDebug.cache.filterSome', "{0} of {1} agents", selectedCount, agents.length);
		const text = DOM.append(button, $('span.chat-debug-cache-filter-button-text'));
		text.textContent = summary;
		text.title = summary;
		DOM.append(button, $('span.codicon.codicon-chevron-down.chat-debug-cache-filter-chevron', { 'aria-hidden': 'true' }));

		this.railDisposables.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.showAgentFilterMenu(button, agentCounts)));
	}

	private showAgentFilterMenu(anchor: HTMLElement, agentCounts: Map<string, number>): void {
		const agents = [...agentCounts.keys()].sort((a, b) => a.localeCompare(b));
		const selected = this.selectedAgents ?? new Set(agents);
		const agentActions: IAction[] = agents.map(agent => toAction({
			id: `chatDebug.cache.agent.${agent}`,
			label: localize('chatDebug.cache.agentItem', "{0} ({1})", agent, agentCounts.get(agent) ?? 0),
			checked: selected.has(agent),
			run: () => this.toggleAgent(agent),
		}));
		const selectAll = toAction({
			id: 'chatDebug.cache.agentSelectAll',
			label: localize('chatDebug.cache.selectAllAgents', "Show All Agents"),
			run: () => this.setAgentSelection(new Set(agents)),
		});
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [selectAll, new Separator(), ...agentActions],
		});
	}

	/** Toggle a single agent on/off. Never leaves the selection empty. */
	private toggleAgent(agent: string): void {
		const agents = [...computeAgentCounts(this.allModelTurns).keys()];
		const next = new Set(this.selectedAgents ?? agents);
		if (next.has(agent)) {
			next.delete(agent);
		} else {
			next.add(agent);
		}
		this.setAgentSelection(next.size === 0 ? new Set(agents) : next);
	}

	private setAgentSelection(agents: Set<string>): void {
		// Remember the current turn so we can keep the user on it after the
		// list is refiltered (if it survives the new filter).
		this.pendingSelectTurn = this.modelTurns[this.selectedIndex];
		this.selectedAgents = agents;
		this.render();
	}

	/**
	 * Render a collapsible per-chunk breakdown table. Lists every signature
	 * chunk (including identical ones the bar may hide) with its exact char
	 * count on each side and its share of the current request \u2014 i.e. where the
	 * bytes are allocated.
	 */
	private renderChunkBreakdown(
		section: HTMLElement,
		rows: readonly IChunkBreakdownRow[],
		totalA: number,
		totalB: number,
		bTokensPerChar: number | undefined,
	): void {
		const wrap = DOM.append(section, $('.chat-debug-cache-sig-breakdown'));
		if (this.sigBreakdownOpen) {
			wrap.classList.add('open');
		}
		const toggle = DOM.append(wrap, $('button.chat-debug-cache-sig-breakdown-toggle'));
		toggle.setAttribute('aria-expanded', this.sigBreakdownOpen ? 'true' : 'false');
		DOM.append(toggle, $('span.codicon.codicon-chevron-right.chat-debug-cache-sig-breakdown-chev', { 'aria-hidden': 'true' }));
		DOM.append(toggle, $('span', undefined, localize('chatDebug.cache.chunkBreakdown', "Chunk breakdown")));
		this.contentDisposables.add(DOM.addDisposableListener(toggle, DOM.EventType.CLICK, () => {
			this.sigBreakdownOpen = !this.sigBreakdownOpen;
			const token = ++this.renderToken;
			void this.renderContentInner(token, () => token === this.renderToken, true);
		}));
		if (!this.sigBreakdownOpen) {
			return;
		}

		const table = DOM.append(wrap, $('.chat-debug-cache-sig-breakdown-table', { role: 'table' }));
		const head = DOM.append(table, $('.chat-debug-cache-sig-breakdown-row.head', { role: 'row' }));
		DOM.append(head, $('.cell.idx', { role: 'columnheader' }, localize('chatDebug.cache.chunkIdxCol', "#")));
		DOM.append(head, $('.cell.chunk', { role: 'columnheader' }, localize('chatDebug.cache.chunkCol', "Chunk")));
		DOM.append(head, $('.cell.num', { role: 'columnheader' }, localize('chatDebug.cache.prevCol', "Previous")));
		DOM.append(head, $('.cell.num', { role: 'columnheader' }, localize('chatDebug.cache.currCol', "Current")));
		DOM.append(head, $('.cell.num', { role: 'columnheader' }, localize('chatDebug.cache.tokCol', "\u2248 tok")));
		DOM.append(head, $('.cell.num', { role: 'columnheader' }, localize('chatDebug.cache.pctCol', "% of current")));

		rows.forEach((r, i) => {
			const row = DOM.append(table, $('.chat-debug-cache-sig-breakdown-row', { role: 'row' }));
			if (r.drift) {
				row.classList.add('is-drift');
			}
			DOM.append(row, $('.cell.idx', { role: 'cell' }, String(i)));
			const chunk = DOM.append(row, $('.cell.chunk', { role: 'cell' }));
			DOM.append(chunk, $(`span.chat-debug-cache-sig-swatch.role-${roleClass(r.role)}`, { 'aria-hidden': 'true' }));
			DOM.append(chunk, $('span.chat-debug-cache-sig-breakdown-chunk-label', undefined, r.label));
			DOM.append(row, $('.cell.num', { role: 'cell' }, r.aChars !== undefined ? numberFormatter.value.format(r.aChars) : '\u2014'));
			DOM.append(row, $('.cell.num', { role: 'cell' }, r.bChars !== undefined ? numberFormatter.value.format(r.bChars) : '\u2014'));
			// Token estimate for the current side, calibrated against the
			// request's reported input tokens (chars \u00d7 tokens-per-char).
			const tok = r.bChars !== undefined && bTokensPerChar !== undefined ? Math.round(r.bChars * bTokensPerChar) : undefined;
			DOM.append(row, $('.cell.num', { role: 'cell' }, tok !== undefined ? numberFormatter.value.format(tok) : '\u2014'));
			const pct = r.bChars !== undefined && totalB > 0 ? (r.bChars / totalB) * 100 : undefined;
			DOM.append(row, $('.cell.num', { role: 'cell' }, pct !== undefined ? localize('chatDebug.cache.pctValue', "{0}%", pct.toFixed(1)) : '\u2014'));
		});

		const totals = DOM.append(table, $('.chat-debug-cache-sig-breakdown-row.total', { role: 'row' }));
		DOM.append(totals, $('.cell.idx', { role: 'cell' }, ''));
		DOM.append(totals, $('.cell.chunk', { role: 'cell' }, localize('chatDebug.cache.totalRow', "Total")));
		DOM.append(totals, $('.cell.num', { role: 'cell' }, numberFormatter.value.format(totalA)));
		DOM.append(totals, $('.cell.num', { role: 'cell' }, numberFormatter.value.format(totalB)));
		DOM.append(totals, $('.cell.num', { role: 'cell' }, bTokensPerChar !== undefined ? numberFormatter.value.format(Math.round(totalB * bTokensPerChar)) : '\u2014'));
		DOM.append(totals, $('.cell.num', { role: 'cell' }, localize('chatDebug.cache.pctValue', "{0}%", '100')));
	}

	private async resolveSide(event: IChatDebugModelTurnEvent): Promise<ISideData> {
		let content: IChatDebugEventModelTurnContent | undefined;
		if (event.id) {
			if (this.resolvedCache.has(event.id)) {
				content = this.resolvedCache.get(event.id);
			} else {
				const r = await this.chatDebugService.resolveEvent(event.id);
				content = r && r.kind === 'modelTurn' ? r : undefined;
				this.resolvedCache.set(event.id, content);
			}
		}
		const system = findSection(content?.sections, 'System');
		const tools = findSection(content?.sections, 'Tools');
		const requestShapeJson = findSection(content?.sections, 'Request Shape');
		const inputMessagesJson = findSection(content?.sections, 'Input Messages');
		const rawMessages = parseInputMessages(inputMessagesJson);
		// `chatMLFetcher.ts` extracts the system prompt from the messages
		// array AND emits it separately as `gen_ai.system_instructions`.
		// That double-counts the system prompt: once as the synthetic
		// `system` segment we already render, and a second time as
		// messages[0]. Strip leading system-role messages here so the
		// signature lane reads `[system, tools, ...userMessages]`
		// regardless of how the provider chose to ferry the system prompt
		// (in-band as messages[0], or out-of-band via `instructions` /
		// top-level `system`). The synthetic `system` component still
		// diffs the system content faithfully because both sides go
		// through the same dedup.
		// Strip leading system-role messages here so the signature lane reads
		// `[system, tools, ...userMessages]` regardless of how the provider
		// chose to ferry the system prompt (in-band as messages[0], or
		// out-of-band via `instructions` / top-level `system`). Loop in case a
		// provider prepends multiple system-role messages; the synthetic
		// `system` component still diffs the system content faithfully because
		// both sides go through the same dedup.
		let stripFrom = 0;
		if (system) {
			while (stripFrom < rawMessages.length && rawMessages[stripFrom].role === 'system') {
				stripFrom++;
			}
		}
		const inputMessages = stripFrom > 0 ? rawMessages.slice(stripFrom) : rawMessages;
		return { event, content, system, tools, inputMessages, requestShape: describeRequestShape(inputMessages, requestShapeJson) };
	}

	private renderRail(groups: readonly ITurnGroup[]): void {
		// Idle-gap markers: a gap at or above the typical cache TTL between
		// two consecutive turns means the cached prefix likely expired in
		// between — make that visible in the rail before anyone clicks.
		const gapBefore = (turnIndex: number): number | undefined => {
			if (turnIndex <= 0) {
				return undefined;
			}
			const prev = this.modelTurns[turnIndex - 1];
			const curr = this.modelTurns[turnIndex];
			const prevEnd = prev.created.getTime() + (prev.durationInMillis ?? 0);
			const gapMinutes = (curr.created.getTime() - prevEnd) / 60_000;
			return gapMinutes >= TTL_GAP_MINUTES ? gapMinutes : undefined;
		};
		const appendGapMarker = (gapMinutes: number): void => {
			const gap = DOM.append(this.railList, $('.chat-debug-cache-rail-gap'));
			DOM.append(gap, $('span.codicon.codicon-clock', { 'aria-hidden': 'true' }));
			DOM.append(gap, $('span', undefined, localize('chatDebug.cache.railGap', "{0} min idle · cache likely expired", gapMinutes.toFixed(1))));
		};

		for (const group of groups) {
			const collapsed = this.collapsedGroups.has(group.key);
			const groupGap = group.turns.length > 0 ? gapBefore(group.turns[0].index) : undefined;
			if (groupGap !== undefined) {
				appendGapMarker(groupGap);
			}
			const header = DOM.append(this.railList, $('.chat-debug-cache-group-header'));
			if (collapsed) {
				header.classList.add('is-collapsed');
			}
			header.tabIndex = 0;
			header.setAttribute('role', 'button');
			header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
			header.title = localize('chatDebug.cache.toggleGroup', "Toggle group");

			const topLine = DOM.append(header, $('.chat-debug-cache-group-top'));
			DOM.append(topLine, $('span.chat-debug-cache-group-chev'));
			const headerLine = DOM.append(topLine, $('.chat-debug-cache-group-prompt'));
			headerLine.textContent = group.userMessage?.message?.trim() || localize('chatDebug.cache.unknownPrompt', "(no prompt captured)");
			const countBadge = DOM.append(topLine, $('span.chat-debug-cache-group-count'));
			countBadge.textContent = String(group.turns.length);

			const headerMeta = DOM.append(header, $('.chat-debug-cache-group-meta'));
			headerMeta.textContent = group.key;
			headerMeta.title = localize('chatDebug.cache.requestIdTooltip', "Request id: {0}", group.key);

			const toggle = () => {
				if (this.collapsedGroups.has(group.key)) {
					this.collapsedGroups.delete(group.key);
				} else {
					this.collapsedGroups.add(group.key);
				}
				this.refresh();
			};
			this.railDisposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, toggle));
			this.railDisposables.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle();
				}
			}));

			if (collapsed) {
				continue;
			}

			for (const [posInGroup, { turn: evt, index: i }] of group.turns.entries()) {
				// Gaps before the first turn of a group render before the
				// group header above; only intra-group gaps render here.
				if (posInGroup > 0) {
					const gap = gapBefore(i);
					if (gap !== undefined) {
						appendGapMarker(gap);
					}
				}
				const row = DOM.append(this.railList, $('.chat-debug-cache-turn'));
				this.railRowsByIndex.set(i, row);
				if (i === this.selectedIndex) { row.classList.add('is-selected'); }
				const idx = DOM.append(row, $('.chat-debug-cache-turn-idx'));
				idx.textContent = String(i).padStart(2, ' ');

				const main = DOM.append(row, $('.chat-debug-cache-turn-main'));

				// Top line: agent source with bracketed cache hit, duration, and timestamp
				const top = DOM.append(main, $('.chat-debug-cache-turn-top'));
				const source = DOM.append(top, $('span.chat-debug-cache-turn-source'));
				source.textContent = evt.requestName || localize('chatDebug.cache.modelTurn', "Model Turn");
				if (evt.inputTokens) {
					const hit = computeCacheHit(evt);
					const hitChip = DOM.append(top, $('span.chat-debug-cache-turn-chip.chat-debug-cache-turn-hit', undefined,
						localize('chatDebug.cache.hitChip', "[cache {0}%]", formatCachePctInt(hit))));
					if (hit < 90) {
						hitChip.classList.add('is-bad');
					}
				}
				if (evt.durationInMillis !== undefined) {
					DOM.append(top, $('span.chat-debug-cache-turn-chip', undefined, localize('chatDebug.cache.msChip', "[{0}ms]", numberFormatter.value.format(Math.round(evt.durationInMillis)))));
				}
				DOM.append(top, $('span.chat-debug-cache-turn-chip', undefined, `[${timeFormatter.value.format(evt.created)}]`));

				// Bottom line: model name
				if (evt.model) {
					const sub = DOM.append(main, $('.chat-debug-cache-turn-sub'));
					sub.textContent = evt.model;
				}

				row.title = localize('chatDebug.cache.turnHelp', "Click to compare this request against the previous one");
				row.tabIndex = 0;
				row.setAttribute('role', 'button');
				if (i === this.selectedIndex) {
					row.setAttribute('aria-current', 'true');
				}
				row.setAttribute('aria-label', localize('chatDebug.cache.turnAria', "Turn {0}: {1}", i, evt.requestName ?? evt.model ?? localize('chatDebug.cache.modelTurn', "Model Turn")));
				this.railDisposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => this.selectTurn(i, { preventScroll: true })));
				this.railDisposables.add(DOM.addDisposableListener(row, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						this.selectTurn(i, { preventScroll: true });
					} else if (e.key === 'ArrowDown') {
						e.preventDefault();
						this.moveSelection(1);
					} else if (e.key === 'ArrowUp') {
						e.preventDefault();
						this.moveSelection(-1);
					}
				}));
			}
		}
	}

	private renderTitleRow(): void {
		const titleRow = DOM.append(this.content, $('.chat-debug-cache-title-row'));
		const title = DOM.append(titleRow, $('h2.chat-debug-cache-title'));
		title.textContent = localize('chatDebug.cacheExplorer.title', "Cache Explorer — Prefix Diff");
	}

	private renderSummary(a: ISideData, b: ISideData, diff: ICacheDiffResult, compareInputMessages: boolean, insights: readonly ICacheInsight[], optionsDiff: readonly IOptionDelta[]): void {
		const row = DOM.append(this.content, $('.chat-debug-cache-summary'));
		row.appendChild(this.renderSideCard(a, localize('chatDebug.cache.previousRequest', "Previous request")));
		row.appendChild(this.renderSideCard(b, localize('chatDebug.cache.requestTitle', "Request")));

		const hit = computeCacheHit(b.event);

		// Card border color tracks the worst finding \u2014 green/neutral when the
		// loss is expected growth, red only for an avoidable break.
		const breakCard = DOM.append(row, $('.chat-debug-cache-card.break'));
		breakCard.classList.add(`is-${maxInsightSeverity(insights)}`);
		DOM.append(breakCard, $('.chat-debug-cache-card-h', undefined, localize('chatDebug.cache.performance', "Cache performance")));

		// Headline: hit % + the verdict (the first warning-or-worse finding).
		const primary = primaryInsight(insights);
		const headline = DOM.append(breakCard, $('.chat-debug-cache-card-headline'));
		headline.textContent = primary
			? localize('chatDebug.cache.hitHeadlineVerdict', "{0}% cache hit \u2014 {1}", formatCachePct(hit), primary.title)
			: localize('chatDebug.cache.hitHeadline', "{0}% cache hit", formatCachePct(hit));
		this.appendTokensReusedLine(breakCard, b.event);
		if (b.requestShape.description) {
			const shapeLine = DOM.append(breakCard, $('.chat-debug-cache-perf-line.chat-debug-cache-request-shape-note'));
			shapeLine.textContent = b.requestShape.description;
		}

		// Findings: each detected cause in cache-key order (model, tools,
		// system, options, messages) \u2014 the first critical one is the earliest
		// byte change and therefore the actual cache breaker.
		DOM.append(breakCard, $('.chat-debug-cache-perf-rule'));
		DOM.append(breakCard, $('.chat-debug-cache-perf-section-h', undefined, localize('chatDebug.cache.findings', "Findings")));
		const list = DOM.append(breakCard, $('.chat-debug-cache-findings'));
		if (insights.length === 0) {
			DOM.append(list, $('.chat-debug-cache-finding-detail', undefined, localize('chatDebug.cache.noFindings', "No findings for this request pair.")));
		}
		for (const insight of insights) {
			this.renderFinding(list, insight);
		}

		// Structural diff summary \u2014 only meaningful when messages were
		// positionally compared (the counts are empty for continuations).
		if (compareInputMessages) {
			DOM.append(breakCard, $('.chat-debug-cache-perf-rule'));
			DOM.append(breakCard, $('.chat-debug-cache-perf-section-h', undefined, localize('chatDebug.cache.diffSummary', "Diff summary")));
			const summaryLine = DOM.append(breakCard, $('.chat-debug-cache-perf-line'));
			const inPlaceChanged = diff.counts.contentDrift + diff.counts.lengthChange;
			const addedInB = diff.counts.onlyInB;
			const droppedFromA = diff.counts.onlyInA;
			const parts: string[] = [
				localize('chatDebug.cache.summaryIdentical', "{0} identical", diff.counts.identical),
				localize('chatDebug.cache.summaryChanged', "{0} in-place changed", inPlaceChanged),
			];
			if (addedInB > 0) {
				parts.push(localize('chatDebug.cache.summaryAdded', "{0} added in this request", addedInB));
			}
			if (droppedFromA > 0) {
				parts.push(localize('chatDebug.cache.summaryDropped', "{0} dropped from previous", droppedFromA));
			}
			summaryLine.textContent = parts.join(' \u00b7 ');
		}

		// Inline one-liner: surface request-option drift right under the
		// summary cards so it is visible regardless of which card the user
		// scans first. The detailed Request options card lives in the
		// Components row.
		if (optionsDiff.length > 0) {
			const optsLine = DOM.append(this.content, $('.chat-debug-cache-options-banner'));
			optsLine.textContent = localize('chatDebug.cache.optionsBanner',
				"Options changed: {0}",
				optionsDiff.map(d => `${d.key} (${formatOptionValue(d.previous)} \u2192 ${formatOptionValue(d.current)})`).join(', '),
			);
		}
	}

	/**
	 * Render one finding row: severity icon, title, evidence, and hint.
	 * Findings that point at a Components entry render as a button that
	 * reveals (scrolls to, expands, and flashes) that component.
	 */
	private renderFinding(list: HTMLElement, insight: ICacheInsight): void {
		const isLink = !!insight.component;
		// Explicit `type="button"` keeps the row from being treated as a
		// submit button if a future ancestor `<form>` is ever introduced.
		const row = DOM.append(list, isLink ? $('button.chat-debug-cache-finding.is-clickable', { type: 'button' }) : $('.chat-debug-cache-finding'));
		DOM.append(row, $(`span.codicon.codicon-${findingIcon(insight.severity)}.chat-debug-cache-finding-icon.is-${insight.severity}`, { 'aria-hidden': 'true' }));
		const body = DOM.append(row, $('.chat-debug-cache-finding-body'));
		DOM.append(body, $('.chat-debug-cache-finding-title', undefined, insight.title));
		if (insight.detail) {
			DOM.append(body, $('.chat-debug-cache-finding-detail', undefined, insight.detail));
		}
		if (insight.hint) {
			DOM.append(body, $('.chat-debug-cache-finding-hint', undefined, insight.hint));
		}
		if (isLink) {
			row.title = localize('chatDebug.cache.findingJump', "Reveal {0} in Components", insight.component);
			this.contentDisposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => this.revealComponent(insight.component!)));
		}
	}


	/**
	 * Scroll the named Components entry into view, expand it, and flash it so
	 * the eye lands on the right place. No-op when the component isn't part
	 * of the current drift list (e.g. an identical message).
	 */
	private revealComponent(name: string): void {
		const entry = this.componentElements.get(name);
		if (!entry) {
			return;
		}
		const { item, head } = entry;
		if (!this.openComponents.has(name)) {
			this.openComponents.add(name);
			item.classList.add('open');
			head.setAttribute('aria-expanded', 'true');
		}
		item.scrollIntoView({ behavior: 'smooth', block: 'start' });
		// Remove + reflow + re-add so a second click restarts the animation.
		item.classList.remove('flash');
		void item.offsetWidth;
		item.classList.add('flash');
		// Move focus to the revealed header so keyboard / screen reader users
		// know where the activation landed. preventScroll because we already
		// did the smooth-scroll above and don't want focus to jump-snap on top.
		head.focus({ preventScroll: true });
	}

	private renderSideCard(data: ISideData, title?: string): HTMLElement {
		const card = $('.chat-debug-cache-card');
		if (title) {
			DOM.append(card, $('.chat-debug-cache-card-h', undefined, title));
		}
		this.appendKv(card, localize('chatDebug.cache.model', "model"), data.event.model ?? '\u2014');
		this.appendKv(card, localize('chatDebug.cache.inputTok', "input tok"), formatTokens(data.event.inputTokens));
		this.appendKv(card, localize('chatDebug.cache.cachedTok', "cached tok"), formatTokens(data.event.cachedTokens));
		this.appendKv(card, localize('chatDebug.cache.cacheHit', "cache hit"), `${formatCachePct(computeCacheHit(data.event))}%`);
		this.appendKv(card, localize('chatDebug.cache.requestShape', "shape"), data.requestShape.label);

		const startTime = data.event.created;
		const endTime = data.event.durationInMillis !== undefined
			? new Date(startTime.getTime() + data.event.durationInMillis)
			: undefined;
		this.appendKv(card, localize('chatDebug.cache.startTime', "startTime"), startTime.toISOString(), true);
		if (endTime) {
			this.appendKv(card, localize('chatDebug.cache.endTime', "endTime"), endTime.toISOString(), true);
		}
		if (data.event.durationInMillis !== undefined) {
			this.appendKv(card, localize('chatDebug.cache.duration', "duration"), `${numberFormatter.value.format(Math.round(data.event.durationInMillis))}ms`);
		}
		const ttft = data.content?.timeToFirstTokenInMillis;
		if (ttft !== undefined) {
			this.appendKv(card, localize('chatDebug.cache.ttft', "timeToFirstToken"), `${numberFormatter.value.format(Math.round(ttft))}ms`);
		}
		const requestId = data.content?.requestId ?? data.event.parentEventId ?? data.event.id;
		if (requestId) {
			this.appendKv(card, localize('chatDebug.cache.requestId', "requestId"), requestId, true);
		}
		return card;
	}

	/**
	 * Render the summary cards alone when there is no prior turn to diff
	 * against (e.g. the first request in a brand-new session). The OTel-
	 * reported cache hit is still useful here — the system prompt and tool
	 * definitions can already be cached from previous sessions.
	 */
	private renderSingleSummary(b: ISideData): void {
		const row = DOM.append(this.content, $('.chat-debug-cache-summary'));
		row.appendChild(this.renderSideCard(b, localize('chatDebug.cache.requestTitle', "Request")));

		const note = DOM.append(row, $('.chat-debug-cache-card.break'));
		DOM.append(note, $('.chat-debug-cache-card-h', undefined, localize('chatDebug.cache.firstRequest', "First request in session")));
		const headline = DOM.append(note, $('.chat-debug-cache-card-headline'));
		headline.textContent = `${formatCachePct(computeCacheHit(b.event))}%`;
		const sub = DOM.append(note, $('.chat-debug-cache-card-sub'));
		sub.textContent = localize('chatDebug.cache.firstRequestNote', "OTel-reported cache hit. Nothing earlier in this session to diff against \u2014 the system prompt and tools may still match a previous session's cache.");
		if (b.requestShape.description) {
			const shapeLine = DOM.append(note, $('.chat-debug-cache-perf-line.chat-debug-cache-request-shape-note'));
			shapeLine.textContent = b.requestShape.description;
		}
	}

	/**
	 * Render the token-based cache performance for a request pair when the
	 * request-side prompt signature (system, tools, input messages) was not
	 * captured for the session — e.g. agent-host (Copilot CLI) sessions, whose
	 * log records the model's output but not the request sent to it. The reported
	 * cache-hit numbers are still accurate, but there is nothing to diff, so the
	 * divergence-based root-cause analysis is deliberately skipped.
	 */
	private renderTokenOnlySummary(a: ISideData, b: ISideData): void {
		const row = DOM.append(this.content, $('.chat-debug-cache-summary'));
		row.appendChild(this.renderSideCard(a, localize('chatDebug.cache.previousRequest', "Previous request")));
		row.appendChild(this.renderSideCard(b, localize('chatDebug.cache.requestTitle', "Request")));

		const card = DOM.append(row, $('.chat-debug-cache-card.break'));
		DOM.append(card, $('.chat-debug-cache-card-h', undefined, localize('chatDebug.cache.performance', "Cache performance")));
		const headline = DOM.append(card, $('.chat-debug-cache-card-headline'));
		headline.textContent = localize('chatDebug.cache.hitHeadline', "{0}% cache hit", formatCachePct(computeCacheHit(b.event)));
		this.appendTokensReusedLine(card, b.event);
		DOM.append(card, $('.chat-debug-cache-perf-rule'));
		const note = DOM.append(card, $('.chat-debug-cache-perf-line.chat-debug-cache-request-shape-note'));
		note.textContent = localize('chatDebug.cache.noSignatureNote', "The request-side prompt (system instructions, tool catalog, and input messages) was not captured for this session, so the prompt-signature diff and root-cause findings are unavailable. The cache-hit numbers above come from reported token usage.");
	}

	/** Appends the "{cached} of {input} input tokens reused" sub-line for a request. */
	private appendTokensReusedLine(parent: HTMLElement, event: IChatDebugModelTurnEvent): void {
		const inputTokens = event.inputTokens ?? 0;
		const cachedTokens = event.cachedTokens ?? 0;
		const lostTokens = Math.max(0, inputTokens - cachedTokens);
		const line = DOM.append(parent, $('.chat-debug-cache-card-sub'));
		line.textContent = lostTokens > 0 && inputTokens > 0
			? localize('chatDebug.cache.tokensReusedLost',
				"{0} of {1} input tokens reused \u00b7 {2} uncached ({3}%)",
				numberFormatter.value.format(cachedTokens),
				numberFormatter.value.format(inputTokens),
				numberFormatter.value.format(lostTokens),
				formatCachePct((lostTokens / inputTokens) * 100),
			)
			: localize('chatDebug.cache.tokensReused',
				"{0} of {1} input tokens reused",
				numberFormatter.value.format(cachedTokens),
				numberFormatter.value.format(inputTokens),
			);
	}

	private appendKv(parent: HTMLElement, key: string, value: string, copyable: boolean = false): void {
		const row = DOM.append(parent, $('.chat-debug-cache-kv'));
		DOM.append(row, $('span.k', undefined, key));
		const valueEl = DOM.append(row, $('span.v', undefined, value));
		if (copyable) {
			valueEl.classList.add('chat-debug-cache-request-id');
			valueEl.title = value;
		}
	}

	private renderSignature(a: ISideData, b: ISideData, diff: ICacheDiffResult, compareInputMessages: boolean): void {
		// See note next to `continuationComparison` in `renderSummary`: only the
		// current request's shape determines whether this is a continuation view.
		const continuationComparison = b.requestShape.isContinuation;
		const section = DOM.append(this.content, $('.chat-debug-cache-section'));
		const heading = DOM.append(section, $('h3.chat-debug-cache-section-h'));
		heading.textContent = continuationComparison
			? localize('chatDebug.cache.visibleSignatureHeading', "Visible Request Signature")
			: localize('chatDebug.cache.signatureHeading', "Prompt Signature");
		if (continuationComparison) {
			const note = DOM.append(section, $('.chat-debug-cache-sig-summary.chat-debug-cache-request-shape-note'));
			note.textContent = localize('chatDebug.cache.visibleSignatureNote', "For Responses API continuations, this shows the captured request inputs: system instructions, tools sent on this request, and the visible input delta. Earlier conversation state is referenced by previous response id and is not expanded here.");
		}

		const legend = DOM.append(section, $('.chat-debug-cache-sig-legend'));
		// Order matters: keep `tools` (orange, the catalog of available tools)
		// far from `tool` (yellow, individual tool result messages) so they
		// aren't read as the same thing.
		for (const role of ['system', 'user', 'assistant', 'tool', 'tool_search', 'tools']) {
			const entry = DOM.append(legend, $('span.chat-debug-cache-sig-legend-entry'));
			DOM.append(entry, $(`span.chat-debug-cache-sig-swatch.role-${roleClass(role)}`));
			DOM.append(entry, DOM.$('span', undefined, role === 'tools'
				? localize('chatDebug.cache.legend.tools', "tools (catalog)")
				: role === 'tool_search'
					? localize('chatDebug.cache.legend.toolSearch', "tool search")
					: role));
		}
		const driftEntry = DOM.append(legend, $('span.chat-debug-cache-sig-legend-entry'));
		DOM.append(driftEntry, $('span.chat-debug-cache-sig-swatch.role-drift'));
		DOM.append(driftEntry, DOM.$('span', undefined, localize('chatDebug.cache.driftLegend', "drift")));
		const groupEntry = DOM.append(legend, $('span.chat-debug-cache-sig-legend-entry'));
		DOM.append(groupEntry, $('span.chat-debug-cache-sig-swatch.role-coalesced'));
		DOM.append(groupEntry, DOM.$('span', undefined, localize('chatDebug.cache.groupLegend', "small messages (grouped)")));

		// Per-side char-length sequences. We prepend synthetic 'system' and
		// 'tools' segments (when present) so they show up in the bar even
		// though they are not part of the inputMessages array. The synthetic
		// segments share the cache-key role with the messages: a change in
		// either also breaks the prefix.
		interface ISegment {
			readonly role: string;
			readonly chars: number;
			readonly drift: boolean;
			readonly label: string;
			/** True if this is one of the synthetic prefix segments (system/tools). */
			readonly synthetic: boolean;
			/** Components-section anchor for this segment (e.g. `messages[3]`). */
			readonly component: string;
		}
		const toSegments = (side: ISideData, isA: boolean): ISegment[] => {
			const segs: ISegment[] = [];
			const sys = side.system;
			if (sys) {
				const other = isA ? b.system : a.system;
				segs.push({ role: 'system', chars: sys.length, drift: sys !== (other ?? ''), label: 'system', synthetic: true, component: 'system' });
			}
			const tools = side.tools;
			if (tools) {
				const other = isA ? b.tools : a.tools;
				segs.push({ role: 'tools', chars: tools.length, drift: tools !== (other ?? ''), label: 'tools', synthetic: true, component: 'tools' });
			}
			side.inputMessages.forEach((m, i) => {
				const tok = diff.signature[i];
				const kind = tok?.kind;
				const drift = compareInputMessages && (kind === CacheDiffKind.ContentDrift
					|| kind === CacheDiffKind.LengthChange
					|| (isA && kind === CacheDiffKind.OnlyInA)
					|| (!isA && kind === CacheDiffKind.OnlyInB));
				segs.push({ role: m.role, chars: m.charLength, drift, label: m.name ? `${m.role}-${m.name}` : m.role, synthetic: false, component: `messages[${i}]` });
			});
			return segs;
		};

		const aSegs = toSegments(a, true);
		const bSegs = toSegments(b, false);
		const totalA = aSegs.reduce((s, x) => s + x.chars, 0);
		const totalB = bSegs.reduce((s, x) => s + x.chars, 0);
		const max = Math.max(totalA, totalB, 1);

		// Compute char position of cache break inside each side's bar.
		// Returns undefined if the break index falls outside the side's
		// segment list (e.g. break is at messages[N] but B has fewer
		// messages); rendering that as the right edge of the bar would
		// misleadingly suggest "the cache broke at the end".
		const breakCharPos = (segs: readonly ISegment[]): number | undefined => {
			if (!diff.break) {
				return undefined;
			}
			// Skip the synthetic system / tools segments when matching
			// diff.break.index, which is an index into the messages array.
			let cumulative = 0;
			let idx = 0;
			for (const s of segs) {
				if (s.synthetic) {
					cumulative += s.chars;
					continue;
				}
				if (idx === diff.break.index) {
					return cumulative;
				}
				cumulative += s.chars;
				idx++;
			}
			return undefined;
		};

		// Estimated tokens per char, calibrated against the OTel-reported
		// input token count for each side. Linear, so it doesn't change the
		// bar proportions — it turns char counts into the unit that's billed.
		const aTokensPerChar = a.event.inputTokens && totalA > 0 ? a.event.inputTokens / totalA : undefined;
		const bTokensPerChar = b.event.inputTokens && totalB > 0 ? b.event.inputTokens / totalB : undefined;

		const buildLane = (label: string, segs: readonly ISegment[], breakPos: number | undefined, tokensPerChar: number | undefined): HTMLElement => {
			const row = $('.chat-debug-cache-sig-lane-row');
			DOM.append(row, $('.chat-debug-cache-sig-lane-label', undefined, label));
			const bar = DOM.append(row, $('.chat-debug-cache-sig-bar'));
			const sideTotal = segs.reduce((sum, s) => sum + s.chars, 0);

			const sizeText = (chars: number) => tokensPerChar !== undefined
				? localize('chatDebug.cache.segSizeTokens', "{0} chars (\u2248 {1} tok)", numberFormatter.value.format(chars), numberFormatter.value.format(Math.round(chars * tokensPerChar)))
				: localize('chatDebug.cache.segSizeChars', "{0} chars", numberFormatter.value.format(chars));

			const renderSegment = (s: ISegment) => {
				const seg = DOM.append(bar, $(`span.chat-debug-cache-sig-seg.role-${roleClass(s.role)}`));
				if (s.drift) {
					seg.classList.add('is-drift');
					// Drifting segments have a matching Components entry \u2014 make
					// them clickable so a red mark in the bar can be inspected
					// directly instead of hunting for it in the accordion.
					seg.classList.add('is-clickable');
					seg.setAttribute('role', 'button');
					seg.tabIndex = 0;
					const reveal = () => this.revealComponent(s.component);
					this.contentDisposables.add(DOM.addDisposableListener(seg, DOM.EventType.CLICK, reveal));
					this.contentDisposables.add(DOM.addDisposableListener(seg, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							reveal();
						}
					}));
				}
				seg.style.width = `${(s.chars / max) * 100}%`;
				seg.title = s.drift
					? localize('chatDebug.cache.segDriftTooltip', "{0} ({1}): {2} \u2014 drifted. Click to inspect.", s.component, s.label, sizeText(s.chars))
					: localize('chatDebug.cache.segTooltip', "{0} ({1}): {2}", s.component, s.label, sizeText(s.chars));
				// Mirror the tooltip into an accessible name so screen readers
				// announce what the button-role span does. Only drift segments
				// are focusable, so non-drift slivers don't need one.
				if (s.drift) {
					seg.setAttribute('aria-label', seg.title);
				}
				// In-bar text is the char count alone \u2014 the role is already
				// color-coded, and partial labels ("user:24,9\u2026") read worse
				// than none. Only segments wide enough for the digits get text.
				if (s.chars > max * 0.06) {
					seg.textContent = numberFormatter.value.format(s.chars);
				}
			};

			// Runs of small same-kind messages render as one muted group so
			// dozens of tiny tool/assistant slivers don't turn the bar into
			// noise. Drift and synthetic (system/tools) segments always render
			// individually; a "run" of one keeps its own colors too.
			const renderGroup = (group: ISegment[]) => {
				if (group.length === 1) {
					renderSegment(group[0]);
					return;
				}
				const chars = group.reduce((sum, s) => sum + s.chars, 0);
				const seg = DOM.append(bar, $('span.chat-debug-cache-sig-seg.role-coalesced'));
				seg.style.width = `${(chars / max) * 100}%`;
				seg.title = localize('chatDebug.cache.segGroupTooltip', "{0} \u2026 {1}: {2} small messages, {3}", group[0].component, group[group.length - 1].component, group.length, sizeText(chars));
			};

			const COALESCE_THRESHOLD = max * 0.015;
			let pending: ISegment[] = [];
			for (const s of segs) {
				if (s.chars <= 0) {
					continue;
				}
				if (!s.synthetic && !s.drift && s.chars < COALESCE_THRESHOLD) {
					pending.push(s);
					continue;
				}
				if (pending.length) {
					renderGroup(pending);
					pending = [];
				}
				renderSegment(s);
			}
			if (pending.length) {
				renderGroup(pending);
			}

			// Pad the lane so both sides share the same x scale.
			if (sideTotal < max) {
				const pad = DOM.append(bar, $('span.chat-debug-cache-sig-seg.role-empty'));
				pad.style.width = `${((max - sideTotal) / max) * 100}%`;
			}
			if (breakPos !== undefined && diff.break) {
				const line = DOM.append(bar, $('.chat-debug-cache-sig-break'));
				line.style.left = `${(breakPos / max) * 100}%`;
				line.title = localize('chatDebug.cache.breakLineTooltip', "Cache break at messages[{0}]", diff.break.index);
			}
			DOM.append(row, $('.chat-debug-cache-sig-lane-total', undefined, localize('chatDebug.cache.charsTotal', "{0} chars", numberFormatter.value.format(sideTotal))));
			return row;
		};

		const lanes = DOM.append(section, $('.chat-debug-cache-sig-lanes'));
		lanes.appendChild(buildLane(localize('chatDebug.cache.lanePrevious', "Previous"), aSegs, breakCharPos(aSegs), aTokensPerChar));
		lanes.appendChild(buildLane(localize('chatDebug.cache.laneCurrent', "Current"), bSegs, breakCharPos(bSegs), bTokensPerChar));

		// Prefix-match rail: a thin bar under the lanes splitting the current
		// request into the span that byte-matches the previous request (cache-
		// servable) and the span after the first drift (recomputed). Walks the
		// current side's segments in render order — system, tools, messages —
		// so a tools/system change correctly pulls the boundary to the front.
		if (compareInputMessages && totalB > 0) {
			let reused = 0;
			let sawDrift = false;
			for (const s of bSegs) {
				if (s.drift) {
					sawDrift = true;
					break;
				}
				reused += s.chars;
			}
			if (!sawDrift) {
				reused = totalB;
			}
			const railRow = DOM.append(lanes, $('.chat-debug-cache-sig-lane-row.reuse'));
			DOM.append(railRow, $('.chat-debug-cache-sig-lane-label', undefined, localize('chatDebug.cache.reuseLane', "Match")));
			const rail = DOM.append(railRow, $('.chat-debug-cache-sig-reuse-rail'));
			if (reused > 0) {
				const ok = DOM.append(rail, $('span.chat-debug-cache-sig-reuse-seg.is-reused'));
				ok.style.width = `${(reused / max) * 100}%`;
				ok.title = localize('chatDebug.cache.reusedTooltip', "Byte-identical to the previous request: {0} chars can be served from cache", numberFormatter.value.format(reused));
			}
			if (totalB - reused > 0) {
				const bad = DOM.append(rail, $('span.chat-debug-cache-sig-reuse-seg.is-recomputed'));
				bad.style.width = `${((totalB - reused) / max) * 100}%`;
				bad.title = localize('chatDebug.cache.recomputedTooltip', "Diverges from the previous request: {0} chars are recomputed", numberFormatter.value.format(totalB - reused));
			}
			DOM.append(railRow, $('.chat-debug-cache-sig-lane-total', undefined, localize('chatDebug.cache.reusePct', "{0}% match", String(Math.floor((reused / totalB) * 100)))));
		}

		// Per-chunk breakdown: an exact, scannable table of where the bytes go on
		// each side. Complements the bar (which hides small chunks) and the
		// Components section (which only lists drifting components).
		this.renderChunkBreakdown(section, alignSignatureChunks(aSegs, bSegs), totalA, totalB, bTokensPerChar);

		// Single-line text summary below the bars. Compute this in the
		// same order the provider sees cache-keying inputs: system, tools,
		// then captured input messages. This avoids reporting messages[0] as
		// the first break when the tool catalog changed earlier.
		let shared = 0;
		let firstDrift: string | undefined;
		if (a.system || b.system) {
			if ((a.system ?? '') === (b.system ?? '')) {
				shared += b.system?.length ?? 0;
			} else {
				firstDrift = localize('chatDebug.cache.systemComponent', "system");
			}
		}
		if (!firstDrift && (a.tools || b.tools)) {
			if ((a.tools ?? '') === (b.tools ?? '')) {
				shared += b.tools?.length ?? 0;
			} else {
				firstDrift = localize('chatDebug.cache.toolsComponent', "tools catalog");
			}
		}
		if (!firstDrift) {
			for (const tok of diff.signature) {
				if (tok.kind === CacheDiffKind.Identical) {
					shared += tok.bCharLength ?? 0;
				} else {
					firstDrift = `messages[${tok.index}]`;
					break;
				}
			}
		}
		const summary = DOM.append(section, $('.chat-debug-cache-sig-summary'));
		if (firstDrift) {
			summary.textContent = continuationComparison
				? localize('chatDebug.cache.visibleSignatureSummaryBreak', "{0} of {1} captured request chars match before first captured drift: {2}", numberFormatter.value.format(shared), numberFormatter.value.format(totalB), firstDrift)
				: localize('chatDebug.cache.signatureSummaryBreakComponent', "{0} of {1} chars reused · break at {2}", numberFormatter.value.format(shared), numberFormatter.value.format(totalB), firstDrift);
		} else {
			summary.textContent = continuationComparison
				? localize('chatDebug.cache.visibleSignatureSummaryClean', "{0} of {1} captured request chars match · no captured divergence detected", numberFormatter.value.format(shared), numberFormatter.value.format(totalB))
				: localize('chatDebug.cache.signatureSummaryClean', "{0} of {1} chars reused · no divergence detected", numberFormatter.value.format(shared), numberFormatter.value.format(totalB));
		}
	}

	/**
	 * Render the per-key request-options table. Shows every cache-keying
	 * option captured from the model provider request body, with a column
	 * for the previous turn and one for the current turn. Rows whose
	 * values differ are highlighted.
	 */
	private renderRequestOptions(a: ISideData, b: ISideData): void {
		const prev = sideOptions(a);
		const curr = sideOptions(b);
		const keys = new Set<string>([...Object.keys(prev), ...Object.keys(curr)]);
		if (keys.size === 0) {
			return;
		}

		const section = DOM.append(this.content, $('.chat-debug-cache-section'));
		DOM.append(section, $('h3.chat-debug-cache-section-h', undefined, localize('chatDebug.cache.requestOptionsHeading', "Request Options")));

		const table = DOM.append(section, $('.chat-debug-cache-options-table'));
		const head = DOM.append(table, $('.chat-debug-cache-options-row.head'));
		DOM.append(head, $('.chat-debug-cache-options-cell.key', undefined, localize('chatDebug.cache.optionsKey', "Option")));
		DOM.append(head, $('.chat-debug-cache-options-cell', undefined, localize('chatDebug.cache.optionsPrev', "Previous")));
		DOM.append(head, $('.chat-debug-cache-options-cell', undefined, localize('chatDebug.cache.optionsCurr', "Current")));

		const sortedKeys = [...keys].sort((x, y) => x.localeCompare(y));
		for (const key of sortedKeys) {
			const row = DOM.append(table, $('.chat-debug-cache-options-row'));
			const av = prev[key];
			const bv = curr[key];
			const changed = !equals(av, bv);
			if (changed) {
				row.classList.add('changed');
			}
			DOM.append(row, $('.chat-debug-cache-options-cell.key', undefined, key));
			DOM.append(row, $('.chat-debug-cache-options-cell', undefined, formatOptionValue(av)));
			DOM.append(row, $('.chat-debug-cache-options-cell', undefined, formatOptionValue(bv)));
		}
	}

	private renderComponents(drift: readonly IComponentDrift[], a: ISideData, b: ISideData, compareInputMessages: boolean, identicalCount: number): void {
		this.componentElements.clear();
		const section = DOM.append(this.content, $('.chat-debug-cache-section'));
		DOM.append(section, $('h3.chat-debug-cache-section-h', undefined, localize('chatDebug.cache.componentsHeading', "Components")));
		if (!compareInputMessages && b.requestShape.isContinuation) {
			const note = DOM.append(section, $('.chat-debug-cache-sig-summary.chat-debug-cache-request-shape-note'));
			note.textContent = localize('chatDebug.cache.continuationComponentsNote', "This request uses previous_response_id, so input messages are not positionally diffed against the previous request. Components below show cache-key shape changes; the current continuation delta is shown separately.");
		}
		const acc = DOM.append(section, $('.chat-debug-cache-acc'));

		const effectiveDrift = !compareInputMessages && b.requestShape.isContinuation && b.inputMessages.length > 0
			? [...drift, currentDeltaComponent(b)]
			: drift;

		if (effectiveDrift.length === 0) {
			const empty = DOM.append(acc, $('.chat-debug-cache-acc-empty'));
			empty.textContent = localize('chatDebug.cache.allComponentsIdentical', "All components are identical between A and B.");
			return;
		}

		for (const c of effectiveDrift) {
			const item = DOM.append(acc, $('.chat-debug-cache-acc-item'));
			item.classList.add(c.status);
			const isOpen = this.openComponents.has(c.name);
			if (isOpen) { item.classList.add('open'); }
			const head = DOM.append(item, $('.chat-debug-cache-acc-head'));
			this.componentElements.set(c.name, { item, head });
			// Expose the header as an expand/collapse button so keyboard and
			// screen reader users can operate it the same way mouse users can.
			head.tabIndex = 0;
			head.setAttribute('role', 'button');
			head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
			DOM.append(head, $('span.chat-debug-cache-chev'));
			const name = DOM.append(head, $('.chat-debug-cache-acc-name'));
			// Lead with the same role swatch the signature bar uses so a
			// component reads as "one of those colored pieces", not an
			// anonymous diff row.
			const swatchRole = c.role ?? (c.name === 'system' || c.name === 'tools' ? c.name : undefined);
			if (swatchRole) {
				DOM.append(name, $(`span.chat-debug-cache-sig-swatch.role-${roleClass(swatchRole)}`, { 'aria-hidden': 'true' }));
			}
			if (c.role) { DOM.append(name, $('span.role', undefined, c.role)); }
			DOM.append(name, DOM.$('span', undefined, c.name));
			const badge = DOM.append(head, $(`span.chat-debug-cache-acc-badge.${c.status}`));
			badge.textContent = badgeLabel(c.status);
			const sizes = DOM.append(head, $('span.chat-debug-cache-acc-sizes'));
			sizes.textContent = localize('chatDebug.cache.componentSizes', "{0} → {1} chars", formatTokens(c.aSize), formatTokens(c.bSize));

			const body = DOM.append(item, $('.chat-debug-cache-acc-body'));
			const aText = c.name === CURRENT_CONTINUATION_DELTA_COMPONENT ? '' : textForComponent(c, a);
			const bText = c.name === CURRENT_CONTINUATION_DELTA_COMPONENT ? continuationDeltaText(b) : textForComponent(c, b);
			// Surface OTel-side truncation: when either side ends with the
			// truncation marker emitted by `truncateForOTel`, the diff below
			// will only reflect the surviving prefix. Most likely on `tools`
			// (large MCP catalogs) and very long messages.
			const truncationNote = describeTruncation(aText, bText);
			if (truncationNote) {
				const note = DOM.append(item, $('.chat-debug-cache-acc-truncated'));
				note.textContent = truncationNote;
				note.title = truncationNote;
				head.title = truncationNote;
			}
			// One-line structural summary of the change — "first 130 chars
			// removed", "edited in place at char N" — so the red/green diff
			// below has a conclusion to verify rather than being the only
			// way to understand what happened.
			if (aText && bText && aText !== bText) {
				const dv = analyzeStringDivergence(aText, bText);
				if (dv) {
					const changeNote = DOM.append(body, $('.chat-debug-cache-acc-change-note'));
					changeNote.textContent = localize('chatDebug.cache.changeNote', "What changed: {0}", describeStringDivergence(dv));
				}
			}
			body.appendChild(this.renderComponentDiff(aText, bText, c.aSize, c.bSize));

			const toggle = () => {
				if (this.openComponents.has(c.name)) {
					this.openComponents.delete(c.name);
					item.classList.remove('open');
					head.setAttribute('aria-expanded', 'false');
				} else {
					this.openComponents.add(c.name);
					item.classList.add('open');
					head.setAttribute('aria-expanded', 'true');
				}
			};
			this.contentDisposables.add(DOM.addDisposableListener(head, DOM.EventType.CLICK, toggle));
			this.contentDisposables.add(DOM.addDisposableListener(head, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle();
				}
			}));
		}

		// The accordion only lists drifting components; say how much of the
		// prompt was identical so "2 entries" isn't misread as "the request
		// only had 2 messages".
		if (compareInputMessages && identicalCount > 0) {
			const note = DOM.append(section, $('.chat-debug-cache-acc-identical-note'));
			note.textContent = localize('chatDebug.cache.identicalNote', "{0} identical message(s) not shown — they extend the shared, cache-servable prefix.", identicalCount);
		}
	}

	private renderComponentDiff(aText: string, bText: string, aSize: number, bSize: number): HTMLElement {
		const grid = $('.chat-debug-cache-diff');
		const colA = DOM.append(grid, $('.chat-debug-cache-diff-col'));
		DOM.append(colA, $('h4', undefined, localize('chatDebug.cache.diffSideA', "Previous \u00b7 {0} chars", numberFormatter.value.format(aSize))));
		const aBody = DOM.append(colA, $('.chat-debug-cache-diff-body'));

		const colB = DOM.append(grid, $('.chat-debug-cache-diff-col'));
		DOM.append(colB, $('h4', undefined, localize('chatDebug.cache.diffSideB', "Current \u00b7 {0} chars", numberFormatter.value.format(bSize))));
		const bBody = DOM.append(colB, $('.chat-debug-cache-diff-body'));

		if (!aText && !bText) {
			aBody.textContent = localize('chatDebug.cache.notPresent', "(not present)");
			bBody.textContent = localize('chatDebug.cache.notPresent', "(not present)");
			return grid;
		}

		renderInlineDiff(aBody, bBody, aText, bText);
		return grid;
	}
}

function findSection(sections: readonly IChatDebugMessageSection[] | undefined, name: string): string | undefined {
	if (!sections) {
		return undefined;
	}
	for (const s of sections) {
		if (s.name === name) {
			return s.content;
		}
	}
	return undefined;
}

/** A prompt-signature segment: a synthetic prefix (system/tools) or an input message. */
export interface ISignatureSegment {
	readonly role: string;
	readonly chars: number;
	readonly drift: boolean;
	readonly label: string;
	/** True for the synthetic system/tools prefix segments, false for input messages. */
	readonly synthetic: boolean;
}

/** One aligned row of the chunk breakdown — a chunk present on either or both sides. */
export interface IChunkBreakdownRow {
	readonly role: string;
	readonly label: string;
	readonly aChars: number | undefined;
	readonly bChars: number | undefined;
	readonly drift: boolean;
}

/**
 * Align the previous (A) and current (B) signature segments into comparable
 * rows for the chunk breakdown table.
 *
 * Synthetic prefix segments (system, tools) are matched by identity so that a
 * tool catalog or system prompt present on only one side does not shift every
 * later message row. Input messages are matched positionally, consistent with
 * the positional prompt-signature diff used elsewhere in this view.
 */
export function alignSignatureChunks(aSegs: readonly ISignatureSegment[], bSegs: readonly ISignatureSegment[]): IChunkBreakdownRow[] {
	const rows: IChunkBreakdownRow[] = [];
	const toRow = (aS: ISignatureSegment | undefined, bS: ISignatureSegment | undefined): IChunkBreakdownRow => {
		const ref = bS ?? aS!;
		return {
			role: ref.role,
			label: ref.label,
			aChars: aS?.chars,
			bChars: bS?.chars,
			// A row drifts if either side flags drift (e.g. OnlyInA marks only
			// the A segment) or the chunk is present on just one side.
			drift: (aS?.drift ?? false) || (bS?.drift ?? false) || (!!aS !== !!bS),
		};
	};

	// Synthetic prefixes first, matched by role so presence asymmetry is shown
	// as an added/removed row rather than knocking the message rows out of sync.
	for (const role of ['system', 'tools']) {
		const aS = aSegs.find(s => s.synthetic && s.role === role);
		const bS = bSegs.find(s => s.synthetic && s.role === role);
		if (aS || bS) {
			rows.push(toRow(aS, bS));
		}
	}

	const aMsgs = aSegs.filter(s => !s.synthetic);
	const bMsgs = bSegs.filter(s => !s.synthetic);
	const count = Math.max(aMsgs.length, bMsgs.length);
	for (let i = 0; i < count; i++) {
		rows.push(toRow(aMsgs[i], bMsgs[i]));
	}
	return rows;
}

/**
 * The agent a model turn belongs to. `requestName` carries the debug/agent
 * name the producer tagged the request with (e.g. `panel/editAgent`,
 * `backgroundTodoAgent`, or a utility name such as `title`).
 */
export function agentKey(turn: IChatDebugModelTurnEvent): string {
	return turn.requestName?.trim() || localize('chatDebug.cache.unnamedAgent', "(unnamed)");
}

/** Count model turns per agent, preserving first-seen order. */
export function computeAgentCounts(turns: readonly IChatDebugModelTurnEvent[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const turn of turns) {
		const key = agentKey(turn);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/**
 * Default agent selection: focus on the main panel edit agent when present so
 * background and utility calls don't clutter the rail. Falls back to all agents
 * when the edit agent isn't part of the session.
 */
export function defaultAgentSelection(agentCounts: Map<string, number>): Set<string> {
	if (agentCounts.has(DEFAULT_AGENT_KEY)) {
		return new Set([DEFAULT_AGENT_KEY]);
	}
	return new Set(agentCounts.keys());
}

/**
 * Whether two model-turn events refer to the *exact same* turn. This is the
 * precise identity test: the same object reference, or the same stable span
 * `id` when both events carry one. It never reports two distinct turns as equal,
 * so it is safe to scan a list with it even when several turns look alike.
 */
export function isSameModelTurn(a: IChatDebugModelTurnEvent, b: IChatDebugModelTurnEvent): boolean {
	if (a === b) {
		return true;
	}
	// Distinct objects: only a stable span id can prove they are the same turn.
	return a.id !== undefined && b.id !== undefined && a.id === b.id;
}

/**
 * Best-effort identity for a turn that carries no `id`, used only when the
 * exact object can no longer be found (e.g. events were re-fetched as fresh
 * instances). Both sides must lack an `id`; a turn with an id is matched
 * precisely by {@link isSameModelTurn} instead. This can match two distinct
 * turns that happen to share every field, so it is only consulted as a
 * fallback after the precise pass fails.
 */
function isSimilarNoIdModelTurn(a: IChatDebugModelTurnEvent, b: IChatDebugModelTurnEvent): boolean {
	return a.id === undefined && b.id === undefined
		&& a.created.getTime() === b.created.getTime()
		&& a.parentEventId === b.parentEventId
		&& a.requestName === b.requestName
		&& a.model === b.model;
}

/**
 * Resolve which turn index to select after the agent filter changes. Prefers
 * the previously-selected turn; when that turn no longer survives the filter —
 * or there was no prior selection — falls back to the most recent turn so the
 * selection never lands on an unrelated turn that happens to occupy the old
 * ordinal position. Returns -1 when there are no turns to select.
 *
 * Matching runs in two passes so the exact turn always wins: first the precise
 * id/reference identity ({@link isSameModelTurn}), then a best-effort composite
 * match for id-less turns ({@link isSimilarNoIdModelTurn}). Without the split,
 * an earlier look-alike turn could be picked by `findIndex` before the real
 * object is reached.
 */
export function resolveFilteredSelectionIndex(turns: readonly IChatDebugModelTurnEvent[], previous: IChatDebugModelTurnEvent | undefined): number {
	if (previous) {
		const exact = turns.findIndex(t => isSameModelTurn(t, previous));
		if (exact >= 0) {
			return exact;
		}
		const similar = turns.findIndex(t => isSimilarNoIdModelTurn(t, previous));
		if (similar >= 0) {
			return similar;
		}
	}
	return turns.length - 1;
}

/**
 * Group model turns by request — turns that share the same `parentEventId`
 * belong to the same agent invocation (one user prompt). The group key is
 * used as the request id surfaced in the rail header.
 */
function buildTurnGroups(turns: readonly IChatDebugModelTurnEvent[], userMessages: readonly IChatDebugUserMessageEvent[]): readonly ITurnGroup[] {
	// Index user messages by their span id (and the live `user-msg-` prefixed variant).
	const userById = new Map<string, IChatDebugUserMessageEvent>();
	for (const um of userMessages) {
		if (!um.id) {
			continue;
		}
		userById.set(um.id, um);
		const stripped = um.id.startsWith('user-msg-') ? um.id.slice('user-msg-'.length) : um.id;
		userById.set(stripped, um);
	}

	const groups = new Map<string, { userMessage: IChatDebugUserMessageEvent | undefined; turns: { turn: IChatDebugModelTurnEvent; index: number }[] }>();
	const order: string[] = [];
	turns.forEach((turn, index) => {
		const key = turn.parentEventId ?? turn.id ?? `turn-${index}`;
		let entry = groups.get(key);
		if (!entry) {
			entry = { userMessage: userById.get(key) ?? userById.get(`user-msg-${key}`), turns: [] };
			groups.set(key, entry);
			order.push(key);
		}
		entry.turns.push({ turn, index });
	});
	return order.map(key => ({ key, userMessage: groups.get(key)!.userMessage, turns: groups.get(key)!.turns }));
}

function textForComponent(c: IComponentDrift, side: ISideData): string {
	if (c.name === 'system') {
		return side.system ?? '';
	}
	if (c.name === 'tools') {
		return side.tools ?? '';
	}
	if (c.name === CURRENT_CONTINUATION_DELTA_COMPONENT) {
		return continuationDeltaText(side);
	}
	const m = /^messages\[(\d+)\]$/.exec(c.name);
	if (m) {
		const idx = parseInt(m[1], 10);
		return side.inputMessages[idx]?.text ?? '';
	}
	return '';
}

function continuationDeltaText(side: ISideData): string {
	return side.requestShape.isContinuation
		? side.inputMessages.map((m, index) => `input[${index}] ${m.role}\n${m.text}`).join('\n\n')
		: '';
}

function currentDeltaComponent(side: ISideData): IComponentDrift {
	const size = side.inputMessages.reduce((sum, m) => sum + m.charLength, 0);
	return {
		name: CURRENT_CONTINUATION_DELTA_COMPONENT,
		role: side.requestShape.inputItemTypes.join(', ') || side.inputMessages.map(m => m.role).join(', ') || undefined,
		status: CacheDiffKind.OnlyInB,
		aSize: 0,
		bSize: size,
	};
}

/** Codicon name for a break-cause category (rail chips, health card). */
function categoryIcon(category: CacheBreakCategory): string {
	switch (category) {
		case CacheBreakCategory.Healthy: return 'check';
		case CacheBreakCategory.Expiration: return 'clock';
		case CacheBreakCategory.Model: return 'hubot';
		case CacheBreakCategory.Tools: return 'tools';
		case CacheBreakCategory.System: return 'gear';
		case CacheBreakCategory.Options: return 'symbol-parameter';
		case CacheBreakCategory.History: return 'history';
		case CacheBreakCategory.Unknown: return 'question';
	}
}

/** Codicon name for a finding severity. */
function findingIcon(severity: CacheInsightSeverity): string {
	switch (severity) {
		case CacheInsightSeverity.Ok: return 'check';
		case CacheInsightSeverity.Info: return 'info';
		case CacheInsightSeverity.Warning: return 'warning';
		case CacheInsightSeverity.Critical: return 'error';
	}
}

function badgeLabel(status: CacheDiffKind): string {
	switch (status) {
		case CacheDiffKind.Identical: return localize('chatDebug.cache.badge.identical', "identical");
		case CacheDiffKind.ContentDrift: return localize('chatDebug.cache.badge.contentDrift', "content drift");
		case CacheDiffKind.LengthChange: return localize('chatDebug.cache.badge.lengthChange', "length change");
		case CacheDiffKind.OnlyInA: return localize('chatDebug.cache.badge.onlyA', "only in A");
		case CacheDiffKind.OnlyInB: return localize('chatDebug.cache.badge.onlyB', "only in B");
	}
}

/**
 * Detect the OTel truncation marker that `truncateForOTel` appends to large
 * attribute values: `...[truncated, original N chars]`. When either side of
 * a component carries it, the diff below only reflects the surviving
 * prefix \u2014 differences past the cap are invisible. We surface that as a
 * one-line note above the diff so users don't read a partial diff as
 * authoritative.
 *
 * Returns `undefined` when neither side is truncated.
 */
function describeTruncation(aText: string, bText: string): string | undefined {
	const re = /\.\.\.\[truncated, original (\d+) chars\]$/;
	const aMatch = re.exec(aText);
	const bMatch = re.exec(bText);
	if (!aMatch && !bMatch) {
		return undefined;
	}
	if (aMatch && bMatch) {
		return localize('chatDebug.cache.truncatedBoth',
			"Both sides truncated by the OTel attribute cap (originals were {0} and {1} chars) \u2014 diff may be partial.",
			numberFormatter.value.format(parseInt(aMatch[1], 10)),
			numberFormatter.value.format(parseInt(bMatch[1], 10)),
		);
	}
	const match = (aMatch ?? bMatch)!;
	const side = aMatch
		? localize('chatDebug.cache.truncatedSidePrev', "Previous")
		: localize('chatDebug.cache.truncatedSideCurr', "Current");
	return localize('chatDebug.cache.truncatedOne',
		"{0} side truncated by the OTel attribute cap (original was {1} chars) \u2014 diff may be partial.",
		side,
		numberFormatter.value.format(parseInt(match[1], 10)),
	);
}

function computeCacheHit(event: IChatDebugModelTurnEvent): number {
	if (!event.inputTokens || event.cachedTokens === undefined) {
		return 0;
	}
	return Math.min(100, (event.cachedTokens / event.inputTokens) * 100);
}

function shouldCompareInputMessages(a: ISideData, b: ISideData): boolean {
	// A Responses API continuation (`previous_response_id`) sends only the
	// current wire delta. Positionally diffing that delta against the other
	// side's input array makes it look as if previous context disappeared,
	// when it is actually provider-side state. Suppress message-level diffing
	// when *either* side is a continuation — the comparison would be
	// asymmetric (delta vs. full input). Still compare system/tools and
	// request options; show the current delta as a separate component.
	return !a.requestShape.isContinuation && !b.requestShape.isContinuation;
}

interface IRequestShapeMetadata {
	readonly api?: string;
	readonly hasPreviousResponseId?: boolean;
	readonly inputItemTypes?: readonly string[];
}

function describeRequestShape(inputMessages: readonly INormalizedMessage[], requestShapeJson: string | undefined): IRequestShapeInfo {
	const metadata = parseRequestShapeMetadata(requestShapeJson);
	// Defensive: a malformed log entry could deserialize `inputItemTypes` as
	// something other than an array, which would crash `.includes(...)` below.
	const inputItemTypes = Array.isArray(metadata?.inputItemTypes)
		? metadata.inputItemTypes.filter((x): x is string => typeof x === 'string')
		: [];
	const common = { api: typeof metadata?.api === 'string' ? metadata.api : undefined, inputItemTypes };
	const hasPreviousResponseId = metadata?.hasPreviousResponseId === true;
	const hasToolSearchOutput = inputItemTypes.includes('tool_search_output') || inputMessages.some(m => m.role === 'tool_search');
	const hasOnlyToolOutput = inputMessages.length > 0 && inputMessages.every(m => m.role === 'tool');

	if (hasPreviousResponseId && hasToolSearchOutput) {
		return {
			label: localize('chatDebug.cache.requestShape.toolSearch', "tool_search_output continuation"),
			description: localize('chatDebug.cache.requestShape.toolSearchDescription', "Responses API continuation: the displayed input is only the tool-search delta sent over the wire. The provider reconstructs prior context from the previous response id."),
			isContinuation: true,
			...common,
		};
	}
	if (hasPreviousResponseId && hasOnlyToolOutput) {
		return {
			label: localize('chatDebug.cache.requestShape.toolOutput', "tool output continuation"),
			description: localize('chatDebug.cache.requestShape.toolOutputDescription', "Responses API continuation: the displayed input is only the tool-output delta sent over the wire. The provider reconstructs prior context from the previous response id."),
			isContinuation: true,
			...common,
		};
	}
	if (hasPreviousResponseId) {
		return {
			label: localize('chatDebug.cache.requestShape.continuation', "Responses API continuation"),
			description: localize('chatDebug.cache.requestShape.continuationDescription', "Responses API continuation: the displayed input is only the delta sent over the wire. The provider reconstructs prior context from the previous response id."),
			isContinuation: true,
			...common,
		};
	}
	if (hasToolSearchOutput) {
		return {
			label: localize('chatDebug.cache.requestShape.toolSearchRequest', "tool_search_output request"),
			description: localize('chatDebug.cache.requestShape.toolSearchRequestDescription', "This request contains a Responses API tool_search_output item. No previous-response continuation marker was captured, so the displayed input may be a full or history-sliced request rather than only a continuation delta."),
			isContinuation: false,
			...common,
		};
	}
	if (hasOnlyToolOutput) {
		return {
			label: localize('chatDebug.cache.requestShape.toolOutputRequest', "tool output request"),
			description: undefined,
			isContinuation: false,
			...common,
		};
	}
	return {
		label: localize('chatDebug.cache.requestShape.fullInput', "full input request"),
		description: undefined,
		isContinuation: false,
		...common,
	};
}

function parseRequestShapeMetadata(requestShapeJson: string | undefined): IRequestShapeMetadata | undefined {
	if (!requestShapeJson) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(requestShapeJson) as IRequestShapeMetadata;
		if (parsed && typeof parsed === 'object') {
			return parsed;
		}
	} catch {
		// Ignore malformed metadata. The input-message role fallback still
		// provides a conservative label for older or partially captured logs.
	}
	return undefined;
}

/**
 * Maps a normalized message role onto the small set of CSS color classes
 * the prompt-signature visualization recognizes. Unknown roles fall through
 * to `tool` so they still get a swatch.
 */
function roleClass(role: string): string {
	switch (role) {
		case 'system':
		case 'tools':
		case 'user':
		case 'assistant':
		case 'tool':
			return role;
		case 'tool_search':
			// Use a hyphenated CSS class for consistency with the rest of the
			// `role-*` swatch/segment classes; the underlying data role keeps
			// `tool_search` to match the OTel-emitted role string.
			return 'tool-search';
		default:
			return 'tool';
	}
}

/**
 * Format a cache hit percentage with 2-decimal precision, truncating rather
 * than rounding so a value like 99.998% does not display as 100%. We only
 * report a literal `100%` when the ratio is exactly 1.
 */
function formatCachePct(pct: number): string {
	const truncated = Math.floor(pct * 100) / 100;
	return truncated.toFixed(2);
}

/**
 * Integer-precision variant of {@link formatCachePct} for the rail chip.
 */
function formatCachePctInt(pct: number): string {
	return String(Math.floor(pct));
}

function formatTokens(value: number | undefined): string {
	if (value === undefined) {
		return '\u2014';
	}
	return numberFormatter.value.format(value);
}

interface IOptionDelta {
	readonly key: string;
	readonly previous: unknown;
	readonly current: unknown;
}

/**
 * Build the cache-relevant options table for one side. Combines the
 * request body's `request_options` blob with the model id surfaced on
 * the OTel chat span, since switching models is the most aggressive
 * cache invalidator and users expect to see it here.
 */
function sideOptions(side: ISideData): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (side.event.model !== undefined) {
		out.model = side.event.model;
	}
	Object.assign(out, parseOptions(side.content?.requestOptions));
	// Effort is a first-class cost/latency lever, but a thinking-capable
	// request that doesn't send one falls back to the provider's server-side
	// default with nothing on the wire. Surface that explicitly so the table
	// answers "what effort ran?" instead of silently omitting the row \u2014 and
	// so a request that *stops* sending effort shows up as an option change.
	const hasEffort = out['output_config.effort'] !== undefined
		|| out['reasoning.effort'] !== undefined
		|| out['reasoning_effort'] !== undefined;
	const hasThinking = Object.keys(out).some(k => k === 'thinking' || k.startsWith('thinking.'));
	if (!hasEffort && hasThinking) {
		out['output_config.effort'] = localize('chatDebug.cache.effortNotSent', "(not sent \u2014 provider default)");
	}
	return out;
}

/**
 * Compute the per-key delta between two requests' option tables.
 * Keys are flattened one level deep so nested objects (e.g.
 * `reasoning.effort`) show up with their own row instead of dumping the
 * full object onto one line. The result is sorted by key for stable
 * rendering.
 */
function computeOptionsDiff(a: ISideData, b: ISideData): readonly IOptionDelta[] {
	const prev = sideOptions(a);
	const curr = sideOptions(b);
	const keys = new Set<string>([...Object.keys(prev), ...Object.keys(curr)]);
	const out: IOptionDelta[] = [];
	for (const key of keys) {
		const av = prev[key];
		const bv = curr[key];
		if (!equals(av, bv)) {
			out.push({ key, previous: av, current: bv });
		}
	}
	out.sort((x, y) => x.key.localeCompare(y.key));
	return out;
}

function parseOptions(blob: string | undefined): Record<string, unknown> {
	if (!blob) {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(blob);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {};
	}
	const flat: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
				flat[`${k}.${nk}`] = nv;
			}
		} else {
			flat[k] = v;
		}
	}
	return flat;
}

function formatOptionValue(value: unknown): string {
	if (value === undefined) {
		return '\u2014';
	}
	if (value === null) {
		return 'null';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

const DIFF_OPTIONS = {
	ignoreTrimWhitespace: false,
	maxComputationTimeMs: 200,
	computeMoves: false,
} as const;

/**
 * Render a side-by-side line + character diff into the two body elements.
 *
 * Uses {@link linesDiffComputers.getDefault()} to compute a line-level diff
 * with inner character-level mappings, then walks the result to emit one
 * div per line. Lines belonging to a removed range are styled with the
 * "remove" class on the previous side; added ranges with the "add" class
 * on the current side; modified ranges appear on both sides with character
 * spans highlighted within. Identical lines are placed on both sides as
 * context.
 */
function renderInlineDiff(prevHost: HTMLElement, currHost: HTMLElement, prev: string, curr: string): void {
	const prevLines = prev.split(/\r?\n/);
	const currLines = curr.split(/\r?\n/);
	const result = linesDiffComputers.getDefault().computeDiff(prevLines, currLines, DIFF_OPTIONS);

	let prevIdx = 0;
	let currIdx = 0;
	for (const change of result.changes) {
		const origStart = change.original.startLineNumber;
		const origEnd = change.original.endLineNumberExclusive;
		const modStart = change.modified.startLineNumber;
		const modEnd = change.modified.endLineNumberExclusive;

		// Emit identical context lines up to this change.
		while (prevIdx + 1 < origStart && currIdx + 1 < modStart) {
			appendLine(prevHost, prevLines[prevIdx], 'context');
			appendLine(currHost, currLines[currIdx], 'context');
			prevIdx++;
			currIdx++;
		}

		// Emit changed lines on each side. Inner range mappings give us
		// character-level spans; we apply them per line.
		const innerByOrig = groupInnerChangesByLine(change.innerChanges, /* original */ true);
		const innerByMod = groupInnerChangesByLine(change.innerChanges, /* original */ false);

		for (let line = origStart; line < origEnd; line++) {
			const lineText = prevLines[line - 1] ?? '';
			appendChangedLine(prevHost, lineText, innerByOrig.get(line), 'remove');
		}
		prevIdx = origEnd - 1;

		for (let line = modStart; line < modEnd; line++) {
			const lineText = currLines[line - 1] ?? '';
			appendChangedLine(currHost, lineText, innerByMod.get(line), 'add');
		}
		currIdx = modEnd - 1;
	}

	// Emit any trailing identical context. The line-level diff guarantees
	// every change range is reported, so anything left over on both sides
	// after the last change is identical context — the `&&` is intentional:
	// if one side has more lines than the other at this point the overflow
	// is already covered by the change ranges above (otherwise we'd have a
	// bug in the diff computer).
	while (prevIdx < prevLines.length && currIdx < currLines.length) {
		appendLine(prevHost, prevLines[prevIdx], 'context');
		appendLine(currHost, currLines[currIdx], 'context');
		prevIdx++;
		currIdx++;
	}
}

function appendLine(host: HTMLElement, text: string, kind: 'context' | 'add' | 'remove'): void {
	const line = DOM.append(host, $(`.chat-debug-cache-diff-line.${kind}`));
	line.textContent = text === '' ? '\u00a0' : text;
}

interface IInnerChangeRange {
	readonly startColumn: number;
	readonly endColumn: number;
}

function appendChangedLine(host: HTMLElement, text: string, ranges: readonly IInnerChangeRange[] | undefined, kind: 'add' | 'remove'): void {
	const line = DOM.append(host, $(`.chat-debug-cache-diff-line.${kind}`));
	if (!ranges || ranges.length === 0) {
		line.textContent = text === '' ? '\u00a0' : text;
		return;
	}
	let cursor = 1; // 1-based column index
	const sorted = [...ranges].sort((a, b) => a.startColumn - b.startColumn);
	for (const r of sorted) {
		if (r.startColumn > cursor) {
			DOM.append(line, document.createTextNode(text.substring(cursor - 1, r.startColumn - 1)));
		}
		const span = DOM.append(line, $('span.chat-debug-cache-diff-inner'));
		span.textContent = text.substring(r.startColumn - 1, r.endColumn - 1);
		cursor = r.endColumn;
	}
	if (cursor - 1 < text.length) {
		DOM.append(line, document.createTextNode(text.substring(cursor - 1)));
	}
}

/**
 * Group {@link DetailedLineRangeMapping.innerChanges} by line so the diff
 * renderer can look up character ranges per line. Multi-line range
 * mappings only contribute a partial range to their first/last line; we
 * approximate by clamping to the line bounds.
 */
function groupInnerChangesByLine(
	innerChanges: readonly RangeMapping[] | undefined,
	useOriginal: boolean,
): Map<number, IInnerChangeRange[]> {
	const out = new Map<number, IInnerChangeRange[]>();
	if (!innerChanges) {
		return out;
	}
	for (const r of innerChanges) {
		const range = useOriginal ? r.originalRange : r.modifiedRange;
		// Only handle single-line inner ranges for v1. Multi-line spans
		// are flagged at the line level via the surrounding add/remove
		// styling, so we don't need pixel-perfect column highlights.
		if (range.startLineNumber !== range.endLineNumber) {
			continue;
		}
		const list = out.get(range.startLineNumber) ?? [];
		list.push({ startColumn: range.startColumn, endColumn: range.endColumn });
		out.set(range.startLineNumber, list);
	}
	return out;
}

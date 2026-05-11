/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Orientation, Sash, SashState } from '../../../../../base/browser/ui/sash/sash.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { equals } from '../../../../../base/common/objects.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { defaultBreadcrumbsWidgetStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { RangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { IChatDebugEventModelTurnContent, IChatDebugMessageSection, IChatDebugModelTurnEvent, IChatDebugService, IChatDebugUserMessageEvent } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { appendSystemDrift, appendToolsDrift, CacheDiffKind, diffPromptSignature, ICacheDiffResult, IComponentDrift, INormalizedMessage, parseInputMessages } from './chatDebugCacheDiff.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';

const $ = DOM.$;
const numberFormatter = safeIntl.NumberFormat();
const timeFormatter = safeIntl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** Default rail width in pixels. */
const RAIL_DEFAULT_WIDTH = 280;
const RAIL_MIN_WIDTH = 180;
const RAIL_MAX_WIDTH = 600;
const CURRENT_CONTINUATION_DELTA_COMPONENT = 'current continuation delta';

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
	private readonly railList: HTMLElement;
	private readonly content: HTMLElement;
	private readonly sash: Sash;
	private railWidth = RAIL_DEFAULT_WIDTH;
	private readonly loadDisposables = this._register(new DisposableStore());
	private readonly refreshScheduler: RunOnceScheduler;

	private currentSessionResource: URI | undefined;
	private modelTurns: IChatDebugModelTurnEvent[] = [];
	/** Selected turn (B side). A is computed as `selectedIndex - 1`. -1 = no explicit selection yet. */
	private selectedIndex = -1;

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

		this.updateBreadcrumb();
		this.loadDisposables.clear();
		DOM.clearNode(this.railList);
		DOM.clearNode(this.content);

		if (!this.currentSessionResource) {
			return;
		}

		const events = this.chatDebugService.getEvents(this.currentSessionResource);
		this.modelTurns = events.filter((e): e is IChatDebugModelTurnEvent => e.kind === 'modelTurn');
		const userMessages = events.filter((e): e is IChatDebugUserMessageEvent => e.kind === 'userMessage');

		if (this.modelTurns.length === 0) {
			const empty = DOM.append(this.content, $('.chat-debug-cache-empty'));
			empty.textContent = localize('chatDebug.cache.noTurns', "No model turns recorded for this session yet.");
			return;
		}

		// Default to the most recent turn on first display, and silently
		// fall back to the most recent turn when switching to a session
		// that has fewer turns than the previous selection \u2014 the rail
		// re-renders so the new selection is still visible.
		if (this.selectedIndex < 0 || this.selectedIndex >= this.modelTurns.length) {
			this.selectedIndex = this.modelTurns.length - 1;
		}

		this.renderRail(buildTurnGroups(this.modelTurns, userMessages));
		this.renderTitleRow();

		const bEvent = this.modelTurns[this.selectedIndex];
		const aEvent = this.selectedIndex > 0 ? this.modelTurns[this.selectedIndex - 1] : undefined;

		if (!aEvent) {
			// No prior turn to diff against — still surface OTel-reported cache hit
			// and request metadata for the first turn of a session.
			const b = await this.resolveSide(bEvent);
			if (!isCurrent()) {
				return;
			}
			this.renderSingleSummary(b);
			return;
		}

		const [a, b] = await Promise.all([this.resolveSide(aEvent), this.resolveSide(bEvent)]);
		// If a newer render started while we were resolving, drop this one.
		if (!isCurrent()) {
			return;
		}

		const compareInputMessages = shouldCompareInputMessages(a, b);
		const diff = compareInputMessages
			? diffPromptSignature(a.inputMessages, b.inputMessages)
			: diffPromptSignature([], []);
		const drift = appendToolsDrift(appendSystemDrift([...diff.drift], a.system, b.system), a.tools, b.tools);

		this.renderSummary(a, b, diff);
		this.renderSignature(a, b, diff, compareInputMessages);
		this.renderRequestOptions(a, b);
		this.renderComponents(drift, a, b, compareInputMessages);
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
		for (const group of groups) {
			const collapsed = this.collapsedGroups.has(group.key);
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
			this.loadDisposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, toggle));
			this.loadDisposables.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle();
				}
			}));

			if (collapsed) {
				continue;
			}

			for (const { turn: evt, index: i } of group.turns) {
				const row = DOM.append(this.railList, $('.chat-debug-cache-turn'));
				if (i === this.selectedIndex) { row.classList.add('is-selected'); }
				const idx = DOM.append(row, $('.chat-debug-cache-turn-idx'));
				idx.textContent = String(i).padStart(2, ' ');

				const main = DOM.append(row, $('.chat-debug-cache-turn-main'));

				// Top line: agent source with bracketed cache hit, duration, and timestamp
				const top = DOM.append(main, $('.chat-debug-cache-turn-top'));
				const source = DOM.append(top, $('span.chat-debug-cache-turn-source'));
				source.textContent = evt.requestName || localize('chatDebug.cache.modelTurn', "Model Turn");
				if (evt.cachedTokens !== undefined && evt.inputTokens) {
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
				row.setAttribute('aria-selected', i === this.selectedIndex ? 'true' : 'false');
				row.setAttribute('aria-label', localize('chatDebug.cache.turnAria', "Turn {0}: {1}", i, evt.requestName ?? evt.model ?? localize('chatDebug.cache.modelTurn', "Model Turn")));
				const select = () => {
					if (this.selectedIndex !== i) {
						this.selectedIndex = i;
						this.refresh();
					}
				};
				this.loadDisposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, select));
				this.loadDisposables.add(DOM.addDisposableListener(row, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						select();
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

	private renderSummary(a: ISideData, b: ISideData, diff: ICacheDiffResult): void {
		const row = DOM.append(this.content, $('.chat-debug-cache-summary'));
		row.appendChild(this.renderSideCard(a, localize('chatDebug.cache.previousRequest', "Previous request")));
		row.appendChild(this.renderSideCard(b, localize('chatDebug.cache.requestTitle', "Request")));

		const breakCard = DOM.append(row, $('.chat-debug-cache-card.break'));
		DOM.append(breakCard, $('.chat-debug-cache-card-h', undefined, localize('chatDebug.cache.performance', "Cache performance")));

		// Section 1: cache hit headline + absolute counts
		const hit = computeCacheHit(b.event);
		const inputTokens = b.event.inputTokens ?? 0;
		const cachedTokens = b.event.cachedTokens ?? 0;
		const lostTokens = Math.max(0, inputTokens - cachedTokens);
		const optionsDiff = computeOptionsDiff(a, b);
		const systemChanged = (a.system ?? '') !== (b.system ?? '');
		const toolsChanged = (a.tools ?? '') !== (b.tools ?? '');
		// Treat the comparison as a continuation only when the *current* request
		// is a continuation. The previous turn's shape doesn't change how the
		// current request was sent on the wire, so labeling a normal full-input
		// current request as "continuation" just because the prior turn was
		// would be misleading. Keep this in sync with `shouldCompareInputMessages`.
		const continuationComparison = b.requestShape.isContinuation;
		const expiration = !continuationComparison && isLikelyCacheExpiration(hit, diff, optionsDiff, systemChanged, toolsChanged);

		const headline = DOM.append(breakCard, $('.chat-debug-cache-card-headline'));
		if (expiration) {
			headline.textContent = localize('chatDebug.cache.expirationHeadline',
				"{0}% cache hit \u2014 likely cache expiration",
				formatCachePct(hit),
			);
		} else {
			headline.textContent = localize('chatDebug.cache.hitHeadline', "{0}% cache hit", formatCachePct(hit));
		}
		const counts = DOM.append(breakCard, $('.chat-debug-cache-card-sub'));
		counts.textContent = localize('chatDebug.cache.tokensReused',
			"{0} of {1} input tokens reused",
			numberFormatter.value.format(cachedTokens),
			numberFormatter.value.format(inputTokens),
		);
		if (b.requestShape.description) {
			const shapeLine = DOM.append(breakCard, $('.chat-debug-cache-perf-line.chat-debug-cache-request-shape-note'));
			shapeLine.textContent = b.requestShape.description;
		}

		// Section 2: where the cache broke
		DOM.append(breakCard, $('.chat-debug-cache-perf-rule'));
		DOM.append(breakCard, $('.chat-debug-cache-perf-section-h', undefined, continuationComparison
			? localize('chatDebug.cache.visibleWireInput', "Visible wire input")
			: localize('chatDebug.cache.whereBroke', "Where the cache broke")));
		const breakLine = DOM.append(breakCard, $('.chat-debug-cache-perf-line'));
		if (expiration) {
			breakLine.textContent = localize('chatDebug.cache.expirationNote',
				"The prompt prefix matches but the model still treated this as a fresh request. Most likely the cached entry expired between requests.",
			);
		} else if (systemChanged) {
			breakLine.textContent = localize('chatDebug.cache.systemBroke',
				"System instructions changed — the cache was invalidated even though the message prefix matches.",
			);
		} else if (toolsChanged) {
			breakLine.textContent = localize('chatDebug.cache.toolsBroke',
				"Tool definitions changed — the catalog of available tools differs between requests, which invalidates the cache even though the message prefix matches.",
			);
			if (continuationComparison && diff.break) {
				const deltaName = diff.break.index === 0
					? localize('chatDebug.cache.firstMessage', "the first message")
					: `messages[${diff.break.index}]`;
				const deltaLine = DOM.append(breakCard, $('.chat-debug-cache-perf-line'));
				deltaLine.textContent = localize('chatDebug.cache.continuationDeltaAlsoChanged',
					"The visible wire delta also changed at {0}. That is expected when comparing consecutive continuation requests of different kinds, such as tool_search_output followed by a new user input.",
					deltaName,
				);
			}
		} else if (continuationComparison && diff.break) {
			const componentName = diff.break.index === 0
				? localize('chatDebug.cache.firstMessage', "the first message")
				: `messages[${diff.break.index}]`;
			breakLine.textContent = localize('chatDebug.cache.continuationDeltaBreak',
				"The captured wire delta changed at {0} — {1}. This is a delta-to-delta comparison between consecutive Responses API requests, not the full reconstructed prompt prefix.",
				componentName,
				describeBreakKind(diff.break.kind, diff, b),
			);
			if (lostTokens > 0 && inputTokens > 0) {
				const lostPct = (lostTokens / inputTokens) * 100;
				const lossLine = DOM.append(breakCard, $('.chat-debug-cache-perf-line'));
				lossLine.textContent = localize('chatDebug.cache.uncachedLine',
					"Uncached in this request: {0} tokens ({1}% of this request)",
					numberFormatter.value.format(lostTokens),
					formatCachePct(lostPct),
				);
			}
		} else if (diff.break) {
			const componentName = diff.break.index === 0
				? localize('chatDebug.cache.firstMessage', "the first message")
				: `messages[${diff.break.index}]`;
			breakLine.textContent = localize('chatDebug.cache.breakAt',
				"At {0} — {1}",
				componentName,
				describeBreakKind(diff.break.kind, diff, b),
			);
			if (lostTokens > 0 && inputTokens > 0) {
				const lostPct = (lostTokens / inputTokens) * 100;
				const lossLine = DOM.append(breakCard, $('.chat-debug-cache-perf-line'));
				lossLine.textContent = localize('chatDebug.cache.lossLine',
					"Lost: {0} tokens ({1}% of this request)",
					numberFormatter.value.format(lostTokens),
					formatCachePct(lostPct),
				);
			}
		} else if (optionsDiff.length > 0) {
			breakLine.textContent = localize('chatDebug.cache.optionsBroke',
				"Request options changed — the cache was invalidated even though the message prefix matches.",
			);
		} else if (continuationComparison) {
			breakLine.textContent = localize('chatDebug.cache.continuationNoDeltaBreak', "No divergence detected in the captured wire delta. The full reconstructed prompt prefix is provider-side for this continuation request.");
		} else {
			breakLine.textContent = localize('chatDebug.cache.noBreak', "No prefix divergence detected.");
		}

		// Section 3: structural diff summary
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
		}
		const toSegments = (side: ISideData, isA: boolean): ISegment[] => {
			const segs: ISegment[] = [];
			const sys = side.system;
			if (sys) {
				const other = isA ? b.system : a.system;
				segs.push({ role: 'system', chars: sys.length, drift: sys !== (other ?? ''), label: 'system', synthetic: true });
			}
			const tools = side.tools;
			if (tools) {
				const other = isA ? b.tools : a.tools;
				segs.push({ role: 'tools', chars: tools.length, drift: tools !== (other ?? ''), label: 'tools', synthetic: true });
			}
			side.inputMessages.forEach((m, i) => {
				const tok = diff.signature[i];
				const kind = tok?.kind;
				const drift = compareInputMessages && (kind === CacheDiffKind.ContentDrift
					|| kind === CacheDiffKind.LengthChange
					|| (isA && kind === CacheDiffKind.OnlyInA)
					|| (!isA && kind === CacheDiffKind.OnlyInB));
				segs.push({ role: m.role, chars: m.charLength, drift, label: m.name ? `${m.role}-${m.name}` : m.role, synthetic: false });
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

		const buildLane = (label: string, segs: readonly ISegment[], breakPos: number | undefined): HTMLElement => {
			const row = $('.chat-debug-cache-sig-lane-row');
			DOM.append(row, $('.chat-debug-cache-sig-lane-label', undefined, label));
			const bar = DOM.append(row, $('.chat-debug-cache-sig-bar'));
			let sideTotal = 0;
			for (const s of segs) {
				if (s.chars <= 0) {
					sideTotal += s.chars;
					continue;
				}
				const widthPct = (s.chars / max) * 100;
				const seg = DOM.append(bar, $(`span.chat-debug-cache-sig-seg.role-${roleClass(s.role)}`));
				if (s.drift) {
					seg.classList.add('is-drift');
				}
				seg.style.width = `${widthPct}%`;
				seg.title = `${s.label}: ${numberFormatter.value.format(s.chars)} chars` + (s.drift ? ` \u2014 drift` : '');
				if (s.chars > max * 0.05) {
					seg.textContent = `${s.label}:${numberFormatter.value.format(s.chars)}`;
				}
				sideTotal += s.chars;
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
		lanes.appendChild(buildLane(localize('chatDebug.cache.lanePrevious', "Previous"), aSegs, breakCharPos(aSegs)));
		lanes.appendChild(buildLane(localize('chatDebug.cache.laneCurrent', "Current"), bSegs, breakCharPos(bSegs)));

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

	private renderComponents(drift: readonly IComponentDrift[], a: ISideData, b: ISideData, compareInputMessages: boolean): void {
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
			if (this.openComponents.has(c.name)) { item.classList.add('open'); }
			const head = DOM.append(item, $('.chat-debug-cache-acc-head'));
			DOM.append(head, $('span.chat-debug-cache-chev'));
			const name = DOM.append(head, $('.chat-debug-cache-acc-name'));
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
			body.appendChild(this.renderComponentDiff(aText, bText, c.aSize, c.bSize));

			this.loadDisposables.add(DOM.addDisposableListener(head, DOM.EventType.CLICK, () => {
				if (this.openComponents.has(c.name)) {
					this.openComponents.delete(c.name);
					item.classList.remove('open');
				} else {
					this.openComponents.add(c.name);
					item.classList.add('open');
				}
			}));
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

/**
 * One-line human-readable description of the kind of change at the cache
 * break, including the role and size of the divergent message when known.
 */
function describeBreakKind(kind: Exclude<CacheDiffKind, CacheDiffKind.Identical>, diff: ICacheDiffResult, b: ISideData): string {
	const tok = diff.signature.find(t => t.index === diff.break?.index);
	const role = tok?.bRole ?? tok?.aRole ?? 'message';
	const bMsg = b.inputMessages[diff.break?.index ?? -1];
	const charsB = bMsg ? numberFormatter.value.format(bMsg.charLength) : undefined;
	switch (kind) {
		case CacheDiffKind.OnlyInB:
			return charsB
				? localize('chatDebug.cache.kind.added', "added {0} message ({1} chars)", role, charsB)
				: localize('chatDebug.cache.kind.addedNoSize', "added {0} message", role);
		case CacheDiffKind.OnlyInA:
			return localize('chatDebug.cache.kind.dropped', "previous {0} message dropped", role);
		case CacheDiffKind.ContentDrift:
			return charsB
				? localize('chatDebug.cache.kind.contentDrift', "{0} message body changed ({1} chars)", role, charsB)
				: localize('chatDebug.cache.kind.contentDriftNoSize', "{0} message body changed", role);
		case CacheDiffKind.LengthChange:
			return charsB
				? localize('chatDebug.cache.kind.lengthChange', "{0} message resized to {1} chars", role, charsB)
				: localize('chatDebug.cache.kind.lengthChangeNoSize', "{0} message size changed", role);
	}
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

/**
 * Cache "expiration" heuristic. The provider doesn't tell us *why* it
 * invalidated a cache entry, so this is a best-effort guess: if the
 * structural diff says the prompt prefix is byte-identical AND the
 * system instructions match AND the tool catalog matches AND the
 * request options match AND the model still reports 0 cached input
 * tokens, expiration is the most likely cause. Other causes we cannot
 * distinguish from this signal alone include provider-side eviction
 * under cache pressure, server-side restarts, and per-tenant quota
 * resets. The headline copy in the UI says "likely" for that reason.
 */
function isLikelyCacheExpiration(hitPct: number, diff: ICacheDiffResult, optionsDiff: readonly IOptionDelta[], systemChanged: boolean, toolsChanged: boolean): boolean {
	if (hitPct >= 1) {
		return false;
	}
	if (diff.break) {
		return false;
	}
	if (optionsDiff.length > 0) {
		return false;
	}
	if (systemChanged || toolsChanged) {
		return false;
	}
	return true;
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

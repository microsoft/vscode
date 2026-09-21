/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { SelectBox, ISelectOptionItem } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { AgentHostAhpJsonlLoggingSettingId, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { AgentHostLogSourceKind, enumerateAgentHostLogSources, IAgentHostLogSource, IAgentHostLogSourceServices, isAgentHostSession, readAgentHostLogSourceContent } from './agentHostLogSources.js';
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from './chatDebugTypes.js';

const $ = DOM.$;

/** Debounce for live re-reads of the currently-shown wire log. */
const LIVE_REFRESH_DELAY = 400;

/** Debounce for re-rendering the list as the user types in the filter box. */
const FILTER_DEBOUNCE_DELAY = 150;

/** Number of frames rendered per page; grows via the "Load more" button. */
const PAGE_SIZE = 1000;

/** Cap the pretty-printed JSON shown per frame to keep the DOM light. */
const MAX_DETAIL_JSON = 20000;

/**
 * Navigation events fired by the Wire Log breadcrumb.
 */
export const enum WireLogNavigation {
	Home = 'home',
	Overview = 'overview',
}

type WireLogDirection = 'c2s' | 's2c';

/**
 * A single parsed JSON-RPC frame from the AHP wire log, together with its
 * `_ahpLog` transport metadata.
 */
interface IWireFrame {
	readonly ts: number;
	readonly dir: WireLogDirection;
	readonly truncated: boolean;
	readonly byteLength: number | undefined;
	readonly id: string | undefined;
	readonly method: string | undefined;
	/**
	 * A short identifying label surfaced inline in the row: the dispatched
	 * action's `type` (for `action` / `dispatchAction` / `notification` frames)
	 * or the target session (for `createSession` frames).
	 */
	readonly actionType: string | undefined;
	readonly payload: unknown;
	readonly error: { readonly code?: number; readonly message?: string; readonly data?: unknown } | undefined;
	readonly kind: 'request' | 'notification' | 'response';
}

/**
 * A request (or notification) frame, paired with its matching response frame
 * when one is present in the loaded window.
 */
interface IWireEntry {
	readonly frame: IWireFrame;
	response: IWireFrame | undefined;
}

/**
 * AHP Log view — a user-friendly rendering of the client↔host AHP JSON-RPC
 * protocol frames. Instead of raw JSONL, it pairs requests with their
 * responses, surfaces direction, latency, errors and unanswered ("pending")
 * calls, and lets each frame's payload be expanded. Backed by the raw AHP log
 * file; full fidelity is a click away via "Open Full File".
 */
export class ChatDebugWireLogView extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<WireLogNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly hintBar: HTMLElement;
	private readonly toolbar: HTMLElement;
	private readonly selectHost: HTMLElement;
	private readonly filterInput: HTMLInputElement;
	private readonly summary: HTMLElement;
	private readonly body: HTMLElement;
	private readonly list: HTMLElement;
	private readonly footer: HTMLElement;
	private readonly scrollable: DomScrollableElement;

	private readonly headerDisposables = this._register(new DisposableStore());
	private readonly contentDisposables = this._register(new DisposableStore());
	/** Watches the currently-shown wire log for live updates. */
	private readonly liveWatch = this._register(new MutableDisposable<DisposableStore>());
	private readonly refreshScheduler: RunOnceScheduler;
	/** Debounces list re-renders while the user types in the filter box. */
	private readonly filterScheduler: RunOnceScheduler;

	private selectBox: SelectBox | undefined;
	private currentSessionResource: URI | undefined;
	private sources: IAgentHostLogSource[] = [];
	private selectedSourceId: string | undefined;
	private currentFileResource: URI | undefined;
	private entries: IWireEntry[] = [];
	/** The filtered entries currently rendered in the list, in order. */
	private renderedVisible: IWireEntry[] = [];
	/** Row DOM nodes parallel to {@link renderedVisible}. */
	private rowElements: HTMLElement[] = [];
	/** Per-row disposables parallel to {@link renderedVisible}. */
	private rowStores: DisposableStore[] = [];
	/** True while the list is showing a status message instead of rows. */
	private listShowingMessage = false;
	private filterText = '';
	/** Monotonic token guarding against out-of-order async loads. */
	private loadGeneration = 0;
	/** Max number of (filtered) frames rendered at once; grows via "Load more". */
	private visibleLimit = PAGE_SIZE;
	private readonly loadMoreContainer: HTMLElement;
	private readonly loadMoreDisposables = this._register(new DisposableStore());
	private loadMoreBtn: Button | undefined;
	private loadMoreStatus: HTMLElement | undefined;
	private loadMoreVisible = false;

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPathService private readonly pathService: IPathService,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IOutputService private readonly outputService: IOutputService,
		@IFileService private readonly fileService: IFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-wirelog'));
		DOM.hide(this.container);

		this.refreshScheduler = this._register(new RunOnceScheduler(() => this.liveRefresh(), LIVE_REFRESH_DELAY));
		this.filterScheduler = this._register(new RunOnceScheduler(() => this.applyFilter(), FILTER_DEBOUNCE_DELAY));

		// Breadcrumb
		const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
		this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
		this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
		this._register(this.breadcrumbWidget.onDidSelectItem(e => {
			if (e.type === 'select' && e.item instanceof TextBreadcrumbItem) {
				this.breadcrumbWidget.setSelection(undefined);
				const idx = this.breadcrumbWidget.getItems().indexOf(e.item);
				if (idx === 0) {
					this._onNavigate.fire(WireLogNavigation.Home);
				} else if (idx === 1) {
					this._onNavigate.fire(WireLogNavigation.Overview);
				}
			}
		}));

		// Hint shown when wire logging is disabled.
		this.hintBar = DOM.append(this.container, $('.chat-debug-wirelog-hint'));
		DOM.hide(this.hintBar);

		// Toolbar: source picker + filter + actions.
		this.toolbar = DOM.append(this.container, $('.chat-debug-wirelog-toolbar'));
		this.selectHost = DOM.append(this.toolbar, $('.chat-debug-wirelog-select'));
		this.filterInput = DOM.append(this.toolbar, $('input.chat-debug-wirelog-filter')) as HTMLInputElement;
		this.filterInput.type = 'text';
		this.filterInput.placeholder = localize('chatDebug.wireLog.filterPlaceholder', "Filter by method, type, or id");
		this.filterInput.setAttribute('aria-label', localize('chatDebug.wireLog.filterAria', "Filter AHP log frames"));
		this._register(DOM.addDisposableListener(this.filterInput, DOM.EventType.INPUT, () => {
			// Debounce so each keystroke does not trigger a full synchronous
			// rebuild of the list, which keeps typing responsive.
			this.filterScheduler.schedule();
		}));

		// Summary chips.
		this.summary = DOM.append(this.container, $('.chat-debug-wirelog-summary'));
		DOM.hide(this.summary);

		// Body: scrollable list of frames.
		this.body = DOM.append(this.container, $('.chat-debug-wirelog-body'));
		this.list = $('.chat-debug-wirelog-list');
		this.scrollable = this._register(new DomScrollableElement(this.list, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto,
		}));
		DOM.append(this.body, this.scrollable.getDomNode());

		// "Load more" affordance shown when frames are paginated.
		this.loadMoreContainer = DOM.append(this.container, $('.chat-debug-wirelog-loadmore'));
		DOM.hide(this.loadMoreContainer);

		this.footer = DOM.append(this.container, $('.chat-debug-wirelog-footer'));
	}

	setSession(sessionResource: URI): void {
		this.currentSessionResource = sessionResource;
		this.selectedSourceId = undefined;
		this.visibleLimit = PAGE_SIZE;
	}

	show(): void {
		DOM.show(this.container);
		this.load();
	}

	hide(): void {
		DOM.hide(this.container);
		this.refreshScheduler.cancel();
		this.filterScheduler.cancel();
		this.liveWatch.clear();
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
			new TextBreadcrumbItem(localize('chatDebug.ahpLog', "AHP Log")),
		]);
	}

	focus(): void {
		this.selectBox?.focus();
	}

	layout(): void {
		// Give the scrollable content an explicit height so the list can
		// overflow (and thus scroll) instead of growing the whole view. The
		// body is the flex-sized region between the toolbar/summary and the
		// footer.
		const height = this.body.clientHeight;
		if (height > 0) {
			this.list.style.height = `${height}px`;
		}
		this.scrollable.scanDomNode();
	}

	private get logSourceServices(): IAgentHostLogSourceServices {
		return {
			pathService: this.pathService,
			agentHostService: this.agentHostService,
			remoteAgentHostService: this.remoteAgentHostService,
			outputService: this.outputService,
			fileService: this.fileService,
			textModelService: this.textModelService,
			configurationService: this.configurationService,
			environmentService: this.environmentService,
			productService: this.productService,
			logService: this.logService,
		};
	}

	private async load(): Promise<void> {
		this.updateBreadcrumb();
		this.headerDisposables.clear();
		this.liveWatch.clear();
		DOM.clearNode(this.selectHost);
		this.selectBox = undefined;

		const wireLoggingEnabled = this.configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		DOM.clearNode(this.hintBar);
		if (!wireLoggingEnabled) {
			DOM.show(this.hintBar);
			DOM.append(this.hintBar, $(`span${ThemeIcon.asCSSSelector(Codicon.info)}`));
			DOM.append(this.hintBar, $('span', undefined, localize('chatDebug.wireLog.disabledHint', "AHP logging is disabled — enable {0} and reproduce to capture client↔host protocol frames.", AgentHostAhpJsonlLoggingSettingId)));
		} else {
			DOM.hide(this.hintBar);
		}

		if (!isAgentHostSession(this.currentSessionResource)) {
			this.renderMessage(localize('chatDebug.wireLog.notAgentHost', "The AHP Log is available for Agent Host sessions."));
			return;
		}

		const allSources = await enumerateAgentHostLogSources(this.logSourceServices, this.currentSessionResource);
		this.sources = allSources.filter(source => source.kind === AgentHostLogSourceKind.WireLog);
		if (this.sources.length === 0) {
			this.renderMessage(wireLoggingEnabled
				? localize('chatDebug.wireLog.noFrames', "No AHP log was found yet for this session. Interact with the agent to capture protocol frames.")
				: localize('chatDebug.wireLog.enableToCapture', "No AHP log is available. Enable {0} and reproduce the issue to capture protocol frames.", AgentHostAhpJsonlLoggingSettingId));
			return;
		}

		// Source picker (only when more than one rotated wire log exists).
		if (this.sources.length > 1) {
			DOM.show(this.selectHost);
			const options: ISelectOptionItem[] = this.sources.map(source => ({ text: source.label }));
			let selectedIndex = this.sources.findIndex(source => source.id === this.selectedSourceId);
			if (selectedIndex < 0) {
				selectedIndex = 0;
			}
			const selectBox = this.headerDisposables.add(new SelectBox(options, selectedIndex, this.contextViewService, defaultSelectBoxStyles, {
				ariaLabel: localize('chatDebug.wireLog.sourceLabel', "AHP log file"),
			}));
			selectBox.render(this.selectHost);
			this.headerDisposables.add(selectBox.onDidSelect(e => this.loadSource(e.index)));
			this.selectBox = selectBox;
		} else {
			DOM.hide(this.selectHost);
		}

		// Actions.
		const openBtn = this.headerDisposables.add(new Button(this.toolbar, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize('chatDebug.wireLog.openFile', "Open Full File") }));
		openBtn.element.classList.add('chat-debug-wirelog-action');
		openBtn.label = `$(go-to-file) ${localize('chatDebug.wireLog.openFile', "Open Full File")}`;
		this.headerDisposables.add(openBtn.onDidClick(() => this.openCurrentFile()));

		const refreshBtn = this.headerDisposables.add(new Button(this.toolbar, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize('chatDebug.wireLog.refresh', "Refresh") }));
		refreshBtn.element.classList.add('chat-debug-wirelog-action');
		refreshBtn.label = `$(refresh) ${localize('chatDebug.wireLog.refresh', "Refresh")}`;
		this.headerDisposables.add(refreshBtn.onDidClick(() => this.reloadCurrentSource()));

		let selectedIndex = this.sources.findIndex(source => source.id === this.selectedSourceId);
		if (selectedIndex < 0) {
			selectedIndex = 0;
		}
		await this.loadSource(selectedIndex);
	}

	private async loadSource(index: number): Promise<void> {
		const source = this.sources[index];
		if (!source) {
			return;
		}
		this.selectedSourceId = source.id;
		this.liveWatch.clear();
		this.currentFileResource = undefined;
		this.visibleLimit = PAGE_SIZE;

		const generation = ++this.loadGeneration;
		this.renderMessage(localize('chatDebug.wireLog.loading', "Loading…"));

		let content;
		try {
			content = await readAgentHostLogSourceContent(source, this.logSourceServices);
		} catch (error) {
			if (generation !== this.loadGeneration) {
				return;
			}
			this.renderMessage(localize('chatDebug.wireLog.error', "Failed to read AHP log: {0}", error instanceof Error ? error.message : String(error)));
			return;
		}
		if (generation !== this.loadGeneration) {
			return;
		}

		if (!content) {
			this.renderMessage(localize('chatDebug.wireLog.unavailable', "This AHP log is unavailable."));
			return;
		}

		this.currentFileResource = content.fileResource;
		this.entries = buildWireEntries(parseWireFrames(content.text));
		this.renderList();
		this.renderFooter(source, content.truncated);
		this.setupLiveWatch(source);
	}

	private reloadCurrentSource(): void {
		const index = this.sources.findIndex(source => source.id === this.selectedSourceId);
		if (index >= 0) {
			this.loadSource(index);
		}
	}

	private setupLiveWatch(source: IAgentHostLogSource): void {
		const store = new DisposableStore();
		if (source.resource?.scheme === Schemas.file) {
			const watcher = store.add(this.fileService.createWatcher(source.resource, { recursive: false, excludes: [] }));
			store.add(watcher.onDidChange(() => this.refresh()));
		}
		this.liveWatch.value = store;
	}

	private openCurrentFile(): void {
		if (this.currentFileResource) {
			this.editorService.openEditor({ resource: this.currentFileResource, options: { pinned: true } });
		}
	}

	private renderMessage(message: string): void {
		this.contentDisposables.clear();
		this.rowElements = [];
		this.rowStores = [];
		this.renderedVisible = [];
		this.listShowingMessage = true;
		DOM.hide(this.summary);
		DOM.clearNode(this.list);
		this.list.classList.add('chat-debug-wirelog-message');
		this.list.textContent = message;
		this.scrollable.scanDomNode();
		DOM.clearNode(this.footer);
		if (this.loadMoreVisible) {
			DOM.hide(this.loadMoreContainer);
			this.loadMoreVisible = false;
		}
	}

	private renderSummary(): void {
		DOM.clearNode(this.summary);
		let requests = 0;
		let errors = 0;
		let pending = 0;
		let longest = 0;
		for (const entry of this.entries) {
			if (entry.frame.kind === 'request') {
				requests++;
				if (!entry.response) {
					pending++;
				} else {
					const duration = entry.response.ts - entry.frame.ts;
					if (duration > longest) {
						longest = duration;
					}
				}
			}
			if (isErrorEntry(entry)) {
				errors++;
			}
		}

		DOM.show(this.summary);
		this.appendChip(localize('chatDebug.wireLog.chip.frames', "{0} frames", this.entries.length));
		this.appendChip(localize('chatDebug.wireLog.chip.requests', "{0} requests", requests));
		if (errors > 0) {
			this.appendChip(localize('chatDebug.wireLog.chip.errors', "{0} errors", errors), 'error');
		}
		if (pending > 0) {
			this.appendChip(localize('chatDebug.wireLog.chip.pending', "{0} pending", pending), 'pending');
		}
		if (longest > 0) {
			this.appendChip(localize('chatDebug.wireLog.chip.slowest', "slowest {0}", formatDuration(longest)));
		}
	}

	private appendChip(text: string, tone?: 'error' | 'pending'): void {
		const chip = DOM.append(this.summary, $('span.chat-debug-wirelog-chip', undefined, text));
		if (tone) {
			chip.classList.add(`chat-debug-wirelog-chip-${tone}`);
		}
	}

	/**
	 * Applies the current filter box value and re-renders the list. Invoked
	 * (debounced) from the filter input's INPUT handler; skips work when the
	 * effective filter text has not changed.
	 */
	private applyFilter(): void {
		const next = this.filterInput.value.trim().toLowerCase();
		if (next === this.filterText) {
			return;
		}
		this.filterText = next;
		this.visibleLimit = PAGE_SIZE;
		this.renderList();
	}

	private renderList(): void {
		// Dispose the previous rows' stores (click listeners etc.) before
		// clearing and rebuilding; otherwise they accumulate on every filter
		// change, "Load more", or full live refresh.
		this.contentDisposables.clear();
		DOM.clearNode(this.list);
		this.rowElements = [];
		this.rowStores = [];
		this.renderedVisible = [];
		this.listShowingMessage = false;

		if (this.entries.length === 0) {
			this.renderMessage(localize('chatDebug.wireLog.empty', "The AHP log is empty."));
			return;
		}

		this.renderSummary();

		const { filtered, display } = this.computeVisible(this.entries);

		if (display.length === 0) {
			const empty = DOM.append(this.list, $('.chat-debug-wirelog-noresults'));
			empty.textContent = localize('chatDebug.wireLog.noMatches', "No frames match '{0}'.", this.filterText);
			this.updateLoadMore(0);
			this.scrollable.scanDomNode();
			return;
		}

		for (const entry of display) {
			this.appendRow(entry);
		}
		this.renderedVisible = display;
		this.updateLoadMore(filtered.length);

		this.scrollable.scanDomNode();
	}

	/**
	 * Re-reads the current wire log and updates the list in place — appending
	 * newly-captured frames and refreshing rows whose state changed (e.g. a
	 * response arriving for a pending request) — instead of rebuilding the
	 * whole view. Used for live refreshes so the panel does not flash back to
	 * "Loading…" and lose scroll position on every turn.
	 */
	private async liveRefresh(): Promise<void> {
		const index = this.sources.findIndex(source => source.id === this.selectedSourceId);
		const source = this.sources[index];
		if (!source) {
			return;
		}

		const generation = ++this.loadGeneration;
		let content;
		try {
			content = await readAgentHostLogSourceContent(source, this.logSourceServices);
		} catch {
			return; // keep showing the current content on a transient read error
		}
		if (generation !== this.loadGeneration || !content) {
			return;
		}

		this.currentFileResource = content.fileResource;
		this.applyEntries(buildWireEntries(parseWireFrames(content.text)));
		this.renderFooter(source, content.truncated);
	}

	/**
	 * Applies a freshly-parsed set of entries to the list. When the previously
	 * rendered rows are still a prefix of the new (filtered) set, only the
	 * changed and newly-appended rows are touched; otherwise a full render is
	 * performed (e.g. after a filter change or log rotation).
	 */
	private applyEntries(newEntries: IWireEntry[]): void {
		const { filtered, display } = this.computeVisible(newEntries);

		const canReconcile = !this.listShowingMessage
			&& this.renderedVisible.length > 0
			&& display.length >= this.renderedVisible.length
			&& this.renderedVisible.every((entry, i) => baseEntryKey(entry) === baseEntryKey(display[i]));

		this.entries = newEntries;

		if (!canReconcile) {
			this.renderList();
			return;
		}

		const wasAtBottom = this.isScrolledToBottom();

		// Summary chips live outside the scroll list; cheap to rebuild.
		this.renderSummary();

		// Refresh rows whose state changed (e.g. a response arrived).
		for (let i = 0; i < this.renderedVisible.length; i++) {
			if (entryStateKey(this.renderedVisible[i]) !== entryStateKey(display[i])) {
				this.replaceRow(i, display[i]);
			}
		}

		// Append rows for newly-captured frames (up to the current page limit).
		for (let i = this.renderedVisible.length; i < display.length; i++) {
			this.appendRow(display[i]);
		}

		this.renderedVisible = display;
		this.updateLoadMore(filtered.length);
		this.scrollable.scanDomNode();
		if (wasAtBottom) {
			this.scrollToBottom();
		}
	}

	/**
	 * Computes the filtered entries and the (paginated) subset currently
	 * displayed. Only the first {@link visibleLimit} matching frames are shown;
	 * the rest are revealed via the "Load more" button.
	 */
	private computeVisible(entries: IWireEntry[]): { filtered: IWireEntry[]; display: IWireEntry[] } {
		const filter = this.filterText;
		const filtered = filter ? entries.filter(entry => matchesFilter(entry, filter)) : entries;
		const display = filtered.length > this.visibleLimit ? filtered.slice(0, this.visibleLimit) : filtered;
		return { filtered, display };
	}

	/**
	 * Shows or hides the "Load more" affordance and updates its status label.
	 */
	private updateLoadMore(totalFiltered: number): void {
		if (totalFiltered <= this.visibleLimit) {
			if (this.loadMoreVisible) {
				DOM.hide(this.loadMoreContainer);
				this.loadMoreVisible = false;
				this.layout();
			}
			return;
		}

		if (!this.loadMoreStatus) {
			this.loadMoreStatus = DOM.append(this.loadMoreContainer, $('span.chat-debug-wirelog-loadmore-status'));
		}
		if (!this.loadMoreBtn) {
			this.loadMoreBtn = this.loadMoreDisposables.add(new Button(this.loadMoreContainer, { ...defaultButtonStyles, secondary: true, title: localize('chatDebug.wireLog.loadMoreTitle', "Load more frames") }));
			this.loadMoreDisposables.add(this.loadMoreBtn.onDidClick(() => {
				this.visibleLimit += PAGE_SIZE;
				this.renderList();
			}));
		}

		const shown = Math.min(this.visibleLimit, totalFiltered);
		const remaining = totalFiltered - shown;
		this.loadMoreStatus.textContent = localize('chatDebug.wireLog.showingCount', "Showing {0} of {1} frames", shown, totalFiltered);
		this.loadMoreBtn.label = localize('chatDebug.wireLog.loadMore', "Load More ({0})", remaining);

		if (!this.loadMoreVisible) {
			DOM.show(this.loadMoreContainer);
			this.loadMoreVisible = true;
			this.layout();
		}
	}

	private appendRow(entry: IWireEntry): void {
		const { row, store } = this.buildRow(entry);
		this.contentDisposables.add(store);
		this.rowElements.push(row);
		this.rowStores.push(store);
		this.list.appendChild(row);
	}

	private replaceRow(index: number, entry: IWireEntry): void {
		const { row, store } = this.buildRow(entry);
		this.contentDisposables.add(store);
		const oldRow = this.rowElements[index];
		this.list.replaceChild(row, oldRow);
		this.rowStores[index].dispose();
		this.rowElements[index] = row;
		this.rowStores[index] = store;
	}

	private isScrolledToBottom(): boolean {
		const dimensions = this.scrollable.getScrollDimensions();
		const position = this.scrollable.getScrollPosition();
		return position.scrollTop + dimensions.height >= dimensions.scrollHeight - 4;
	}

	private scrollToBottom(): void {
		this.scrollable.setScrollPosition({ scrollTop: this.scrollable.getScrollDimensions().scrollHeight });
	}

	private buildRow(entry: IWireEntry): { row: HTMLElement; store: DisposableStore } {
		const store = new DisposableStore();
		const frame = entry.frame;
		const isError = isErrorEntry(entry);
		const isPending = frame.kind === 'request' && !entry.response;

		const row = $('.chat-debug-wirelog-row');
		if (isError) {
			row.classList.add('chat-debug-wirelog-row-error');
		}

		const header = DOM.append(row, $('.chat-debug-wirelog-row-header'));
		// Accessibility: the header is an expand/collapse toggle. Make it
		// keyboard-focusable, expose button semantics + expanded state, and
		// hide the purely-decorative chevron from assistive technology.
		header.tabIndex = 0;
		header.setAttribute('role', 'button');

		// Expansion chevron.
		const chevron = DOM.append(header, $(`span.chat-debug-wirelog-chevron${ThemeIcon.asCSSSelector(Codicon.chevronRight)}`));
		chevron.setAttribute('aria-hidden', 'true');

		// Direction indicator.
		const outbound = frame.dir === 'c2s';
		const dirIcon = outbound ? Codicon.arrowRight : Codicon.arrowLeft;
		const dirEl = DOM.append(header, $(`span.chat-debug-wirelog-dir${ThemeIcon.asCSSSelector(dirIcon)}`));
		dirEl.title = outbound
			? localize('chatDebug.wireLog.outbound', "VS Code → Agent Host")
			: localize('chatDebug.wireLog.inbound', "Agent Host → VS Code");

		// Method / response label.
		const label = frame.method ?? localize('chatDebug.wireLog.responseLabel', "(response)");
		DOM.append(header, $('span.chat-debug-wirelog-method', undefined, label));

		// Inline type / session label (action / dispatchAction / notification / createSession).
		if (frame.actionType) {
			DOM.append(header, $('span.chat-debug-wirelog-type', undefined, frame.actionType));
		}
		// Kind badge.
		const badgeText = frame.kind === 'request'
			? localize('chatDebug.wireLog.badge.request', "request")
			: frame.kind === 'notification'
				? localize('chatDebug.wireLog.badge.notification', "notify")
				: localize('chatDebug.wireLog.badge.response', "response");
		DOM.append(header, $('span.chat-debug-wirelog-badge', undefined, badgeText));

		// Status.
		const status = DOM.append(header, $('span.chat-debug-wirelog-status'));
		if (isError) {
			status.classList.add('chat-debug-wirelog-status-error');
			const code = entry.response?.error?.code ?? frame.error?.code;
			status.textContent = code !== undefined
				? localize('chatDebug.wireLog.statusErrorCode', "error {0}", code)
				: localize('chatDebug.wireLog.statusError', "error");
		} else if (isPending) {
			status.classList.add('chat-debug-wirelog-status-pending');
			status.textContent = localize('chatDebug.wireLog.statusPending', "pending");
		} else if (entry.response) {
			status.classList.add('chat-debug-wirelog-status-ok');
			status.textContent = formatDuration(entry.response.ts - frame.ts);
		}

		// Timestamp (right-aligned).
		const time = DOM.append(header, $('span.chat-debug-wirelog-time'));
		time.textContent = formatClock(frame.ts);
		if (frame.id !== undefined) {
			time.title = localize('chatDebug.wireLog.frameId', "id: {0}", frame.id);
		}

		// Details are rendered lazily on first expand: pretty-printing every
		// frame's JSON up-front dominates render time, so collapsed rows (the
		// common case) never pay that cost.
		const details = DOM.append(row, $('.chat-debug-wirelog-row-details'));
		let detailsRendered = false;

		let expanded = false;
		const setExpanded = (value: boolean, scan: boolean) => {
			expanded = value;
			if (expanded && !detailsRendered) {
				this.renderDetails(details, entry);
				detailsRendered = true;
			}
			row.classList.toggle('chat-debug-wirelog-row-expanded', expanded);
			chevron.classList.toggle('codicon-chevron-down', expanded);
			chevron.classList.toggle('codicon-chevron-right', !expanded);
			header.setAttribute('aria-expanded', String(expanded));
			if (scan) {
				this.scrollable.scanDomNode();
			}
		};
		// Apply the initial (auto-expanded for errors) state without scanning:
		// renderList scans once after all rows are appended, so scanning per
		// row here would thrash layout during the build.
		setExpanded(isError, false);

		store.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => setExpanded(!expanded, true)));
		store.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				setExpanded(!expanded, true);
			}
		}));
		return { row, store };
	}

	private renderDetails(container: HTMLElement, entry: IWireEntry): void {
		const frame = entry.frame;

		// Request / notification payload.
		if (frame.payload !== undefined) {
			this.appendJsonSection(container, frame.kind === 'response'
				? localize('chatDebug.wireLog.section.result', "Result")
				: localize('chatDebug.wireLog.section.params', "Params"), frame.payload);
		}
		if (frame.error) {
			this.appendJsonSection(container, localize('chatDebug.wireLog.section.error', "Error"), frame.error, true);
		}

		// Matched response payload / error.
		if (entry.response) {
			if (entry.response.error) {
				this.appendJsonSection(container, localize('chatDebug.wireLog.section.responseError', "Response Error"), entry.response.error, true);
			} else if (entry.response.payload !== undefined) {
				this.appendJsonSection(container, localize('chatDebug.wireLog.section.result', "Result"), entry.response.payload);
			}
		}

		if (frame.truncated || entry.response?.truncated) {
			DOM.append(container, $('.chat-debug-wirelog-detail-note', undefined, localize('chatDebug.wireLog.truncatedFrame', "Large payload values were elided in the log. Open the full file for complete data.")));
		}
	}

	private appendJsonSection(container: HTMLElement, title: string, value: unknown, isError = false): void {
		const section = DOM.append(container, $('.chat-debug-wirelog-detail-section'));
		DOM.append(section, $('.chat-debug-wirelog-detail-title', undefined, title));
		const pre = DOM.append(section, $('pre.chat-debug-wirelog-detail-json'));
		if (isError) {
			pre.classList.add('chat-debug-wirelog-detail-json-error');
		}
		pre.textContent = stringifyBounded(value);
	}

	private renderFooter(source: IAgentHostLogSource, truncated: boolean): void {
		DOM.clearNode(this.footer);
		const parts: string[] = [];
		if (truncated) {
			parts.push(localize('chatDebug.wireLog.footerTail', "Showing the most recent frames"));
		}
		if (source.isRemote) {
			parts.push(localize('chatDebug.wireLog.footerRemote', "remote"));
		}
		this.footer.textContent = parts.join(' · ');
	}
}

/**
 * Extracts a short identifying label for a frame from its payload, surfaced
 * inline in the row next to the method:
 * - `action` frames carry the dispatched action under `params.action`;
 * - `notification` frames carry it under `params.notification`;
 * - `dispatchAction` frames pass positional args `[channel, action, …]`, so the
 *   action is the second argument;
 * - `createSession` frames pass `[config]`, whose `session` field (a URI)
 *   identifies the session being resumed or forked.
 */
function extractActionType(method: string | undefined, payload: unknown): string | undefined {
	switch (method) {
		case 'notification':
			return typeStringOf(getProp(payload, 'notification'));
		case 'dispatchAction':
			return typeStringOf(Array.isArray(payload) ? payload[1] : undefined);
		case 'createSession':
			return uriStringOf(getProp(Array.isArray(payload) ? payload[0] : undefined, 'session'));
		default:
			return typeStringOf(getProp(payload, 'action'));
	}
}

/** Reads a property off a value only when it is a non-null object. */
function getProp(value: unknown, key: string): unknown {
	return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

/** Returns the `type` string of an action-like value, when present. */
function typeStringOf(value: unknown): string | undefined {
	const type = getProp(value, 'type');
	return typeof type === 'string' ? type : undefined;
}

/** Renders a logged URI value (string or serialized components) as text. */
function uriStringOf(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}
	if (value && typeof value === 'object') {
		const external = (value as Record<string, unknown>).external;
		if (typeof external === 'string') {
			return external;
		}
		if (typeof (value as Record<string, unknown>).scheme === 'string') {
			try {
				return URI.revive(value as UriComponents).toString(true);
			} catch {
				return undefined;
			}
		}
	}
	return undefined;
}

/** Parses newline-delimited AHP frames, skipping any unparseable lines. */
function parseWireFrames(text: string): IWireFrame[] {
	const frames: IWireFrame[] = [];
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		let record: Record<string, unknown>;
		try {
			record = JSON.parse(trimmed);
		} catch {
			// A truncated tail can leave a partial first line; skip it.
			continue;
		}
		const meta = record._ahpLog as Record<string, unknown> | undefined;
		if (!meta) {
			continue;
		}
		const dir: WireLogDirection = meta.dir === 's2c' ? 's2c' : 'c2s';
		const ts = typeof meta.ts === 'string' ? Date.parse(meta.ts) : NaN;
		const id = record.id !== undefined && record.id !== null ? String(record.id) : undefined;
		const method = typeof record.method === 'string' ? record.method : undefined;
		const hasResult = Object.prototype.hasOwnProperty.call(record, 'result');
		const errorValue = record.error as { code?: number; message?: string; data?: unknown } | undefined;
		const kind: IWireFrame['kind'] = method
			? (id !== undefined ? 'request' : 'notification')
			: 'response';
		const payload = method ? record.params : (hasResult ? record.result : undefined);
		frames.push({
			ts: Number.isNaN(ts) ? 0 : ts,
			dir,
			truncated: meta.truncated === true,
			byteLength: typeof meta.byteLength === 'number' ? meta.byteLength : undefined,
			id,
			method,
			actionType: extractActionType(method, payload),
			payload,
			error: errorValue && typeof errorValue === 'object' ? errorValue : undefined,
			kind,
		});
	}
	return frames;
}

/**
 * Folds response frames into the request they answer (matched by id in
 * chronological order), leaving notifications and unmatched frames as
 * standalone entries.
 *
 * AHP is bidirectional: both client and host can originate requests, and their
 * id namespaces are independent. A response therefore answers a request from
 * the opposite direction (a c2s request is answered by an s2c response and vice
 * versa), so pending requests are keyed by direction + id to avoid pairing a
 * response with a same-id request from the other direction.
 */
function buildWireEntries(frames: IWireFrame[]): IWireEntry[] {
	const entries: IWireEntry[] = [];
	const pendingByKey = new Map<string, IWireEntry>();
	const pendingKey = (dir: WireLogDirection, id: string) => `${dir}|${id}`;
	for (const frame of frames) {
		if (frame.kind === 'response' && frame.id !== undefined) {
			// A response answers a request travelling in the opposite direction.
			const requestDir: WireLogDirection = frame.dir === 'c2s' ? 's2c' : 'c2s';
			const key = pendingKey(requestDir, frame.id);
			const request = pendingByKey.get(key);
			if (request) {
				request.response = frame;
				pendingByKey.delete(key);
				continue;
			}
		}
		const entry: IWireEntry = { frame, response: undefined };
		entries.push(entry);
		if (frame.kind === 'request' && frame.id !== undefined) {
			pendingByKey.set(pendingKey(frame.dir, frame.id), entry);
		}
	}
	return entries;
}

/**
 * True when an entry represents a protocol error, whether it is a JSON-RPC
 * error response or an agent-emitted `chat/error` action/notification frame.
 * Used to color the row and count errors in the summary.
 */
function isErrorEntry(entry: IWireEntry): boolean {
	const frame = entry.frame;
	return !!entry.response?.error
		|| (frame.kind === 'response' && !!frame.error)
		|| frame.actionType === ActionType.ChatError;
}

/** True when an entry's method, action type, id, or response error matches the filter. */
function matchesFilter(entry: IWireEntry, filter: string): boolean {
	const frame = entry.frame;
	if (frame.method?.toLowerCase().includes(filter)) {
		return true;
	}
	if (frame.actionType?.toLowerCase().includes(filter)) {
		return true;
	}
	if (frame.id !== undefined && frame.id.toLowerCase().includes(filter)) {
		return true;
	}
	const errorMessage = entry.response?.error?.message ?? frame.error?.message;
	return !!errorMessage && errorMessage.toLowerCase().includes(filter);
}

/**
 * A stable key for an entry's request/notification frame (ignoring its
 * response). Used to test whether previously-rendered rows still line up with a
 * freshly-parsed set so a live refresh can reconcile in place.
 */
function baseEntryKey(entry: IWireEntry): string {
	const frame = entry.frame;
	return `${frame.dir}|${frame.kind}|${frame.id ?? ''}|${frame.ts}|${frame.method ?? ''}`;
}

/**
 * A key capturing an entry's full render-relevant state, including whether (and
 * how) its response has arrived, so a row can be re-rendered only when needed.
 */
function entryStateKey(entry: IWireEntry): string {
	const response = entry.response;
	const responseKey = response ? `R${response.ts}${response.error ? 'E' : ''}` : 'P';
	return `${baseEntryKey(entry)}|${responseKey}`;
}

/** Pretty-prints a JSON value, bounded to keep the DOM light. */
function stringifyBounded(value: unknown): string {
	let text: string;
	try {
		text = JSON.stringify(value, undefined, 2) ?? String(value);
	} catch {
		text = String(value);
	}
	if (text.length > MAX_DETAIL_JSON) {
		return `${text.slice(0, MAX_DETAIL_JSON)}…`;
	}
	return text;
}

/** Formats a millisecond duration into a compact human string. */
function formatDuration(millis: number): string {
	if (millis < 1000) {
		return localize('chatDebug.wireLog.ms', "{0} ms", Math.round(millis));
	}
	return localize('chatDebug.wireLog.s', "{0} s", (millis / 1000).toFixed(millis < 10000 ? 1 : 0));
}

/** Formats a timestamp into an HH:MM:SS.mmm clock label. */
function formatClock(ts: number): string {
	if (!ts) {
		return '';
	}
	const date = new Date(ts);
	const pad = (value: number, length = 2) => String(value).padStart(length, '0');
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { DeferredPromise, disposableTimeout, raceTimeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentNetworkFilterService } from '../../networkFilter/common/networkFilterService.js';
import { IInvokeFunctionResult, IPlaywrightService } from '../common/playwrightService.js';
import { IBrowserViewGroupRemoteService } from '../node/browserViewGroupRemoteService.js';
import { IBrowserViewGroup } from '../common/browserViewGroup.js';
import { PlaywrightTab, DialogInterruptedError } from './playwrightTab.js';
import { CDPRequest, CDPResponse } from '../common/cdp/types.js';
import { generateUuid } from '../../../base/common/uuid.js';

// eslint-disable-next-line local/code-import-patterns
import type { Browser, BrowserContext, ConnectOverCDPTransport, Page } from 'playwright-core';

/**
 * Tracks whether a caller-initiated Playwright action is currently in flight.
 */
export interface IPlaywrightActionScope {
	activeCalls: number;
}

const DEFERRED_RESULT_CLEANUP_MS = 5 * 60_000; // 5 minutes
const SESSION_INACTIVITY_MS = 30 * 60_000; // 30 minutes
const OPEN_PAGE_NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * Narrow a raw Playwright transport payload to a {@link CDPRequest}.
 *
 * Playwright types the `send` payload as `object` but passes structured CDP
 * messages (not JSON strings) for a caller-supplied transport, so this guard
 * is expected to always hold. It exists to fail loudly (the caller throws)
 * should a future Playwright version change the wire format, rather than
 * silently forwarding malformed messages.
 */
function isCDPRequest(message: object): message is CDPRequest {
	const candidate = message as Partial<CDPRequest>;
	return typeof candidate.id === 'number'
		&& typeof candidate.method === 'string'
		&& (candidate.sessionId === undefined || typeof candidate.sessionId === 'string');
}



/**
 * Shared-process implementation of {@link IPlaywrightService}.
 *
 * Manages {@link PlaywrightSession} instances keyed by session ID.
 * Each session has its own Playwright browser connection and browser view
 * group, created eagerly by the service when the session is first requested.
 *
 * Page tracking is currently global: tracked pages are shared across all
 * sessions so every session can interact with every tracked page.
 */
export class PlaywrightService extends Disposable implements IPlaywrightService {
	declare readonly _serviceBrand: undefined;

	private readonly _sessions = this._register(new DisposableMap<string, PlaywrightSession>());

	/** In-flight session initializations keyed by session ID. */
	private readonly _pendingInits = new Map<string, Promise<PlaywrightSession>>();

	/** Inactivity timers keyed by session ID. */
	private readonly _inactivityTimers = this._register(new DisposableMap<string, IDisposable>());

	/** Global set of tracked page IDs (shared across all sessions). */
	private readonly _trackedPages = new Set<string>();

	private readonly _onDidChangeTrackedPages = this._register(new Emitter<readonly string[]>());
	readonly onDidChangeTrackedPages: Event<readonly string[]> = this._onDidChangeTrackedPages.event;

	constructor(
		private readonly windowId: number,
		private readonly browserViewGroupRemoteService: IBrowserViewGroupRemoteService,
		private readonly logService: ILogService,
		private readonly agentNetworkFilterService: IAgentNetworkFilterService,
		private readonly telemetryService: ITelemetryService,
	) {
		super();
	}

	/**
	 * Get or create a fully-initialized {@link PlaywrightSession} for the
	 * given session ID. Creates the CDP group and Playwright browser
	 * connection if the session does not already exist.
	 */
	private async _getOrCreateSession(sessionId: string): Promise<PlaywrightSession> {
		const existing = this._sessions.get(sessionId);
		if (existing) {
			this._touchSession(sessionId);
			return existing;
		}

		// De-duplicate concurrent initialization for the same session.
		const pending = this._pendingInits.get(sessionId);
		if (pending) {
			return pending;
		}

		const initPromise = this._initSession(sessionId);
		this._pendingInits.set(sessionId, initPromise);
		try {
			return await initPromise;
		} finally {
			this._pendingInits.delete(sessionId);
		}
	}

	/**
	 * Create and fully initialize a new session: browser view group,
	 * Playwright CDP connection, and page replay.
	 */
	private async _initSession(sessionId: string): Promise<PlaywrightSession> {
		this.logService.debug(`[PlaywrightService] Initializing session ${sessionId}`);

		const group = await this.browserViewGroupRemoteService.createGroup({ mainWindowId: this.windowId, sessionId });

		const actionScope: IPlaywrightActionScope = { activeCalls: 0 };

		let browser: Browser;
		try {
			const playwright = await import('playwright-core');
			const sub = group.onCDPMessage(msg => transport.onmessage?.(msg));
			const transport: ConnectOverCDPTransport = {
				close() {
					sub.dispose();
					this.onclose?.();
				},
				send: (rawMessage) => {
					if (!isCDPRequest(rawMessage)) {
						// Fail loudly: returning silently would leave Playwright
						// waiting for a response and surface later as an opaque hang.
						throw new Error(`[PlaywrightService] Unexpected CDP transport payload for session ${sessionId} (type: ${typeof rawMessage})`);
					}
					const message = rawMessage;
					// Block Playwright's automatic / default emulation traffic. We
					// only forward `Emulation.*` to the view while a caller-initiated
					// action is running (see IPlaywrightActionScope) so the workbench
					// stays in control of device emulation. Other traffic — e.g. the
					// setup Playwright issues on its own when connecting or creating
					// pages — is acknowledged with a synthetic success response and
					// never hits the view.
					if (actionScope.activeCalls === 0 && message.method.startsWith('Emulation.')) {
						setTimeout(() => {
							transport.onmessage?.({ id: message.id, result: {}, sessionId: message.sessionId } satisfies CDPResponse);
						}, 1);
						return;
					}
					void group.sendCDPMessage(message);
				}
			};
			browser = await playwright.chromium.connectOverCDP(transport);
		} catch (e) {
			group.dispose();
			throw e;
		}

		this.logService.debug(`[PlaywrightService] Connected to browser for session ${sessionId}`);

		// If the service was disposed while we were connecting, clean up.
		if (this._store.isDisposed) {
			browser.close().catch(() => { /* ignore */ });
			group.dispose();
			throw new Error('PlaywrightService was disposed during initialization');
		}

		const session = new PlaywrightSession(
			sessionId,
			browser,
			group,
			actionScope,
			this.logService,
			this.agentNetworkFilterService,
			this.telemetryService,
			viewId => this.startTrackingPage(viewId),
		);

		// Keep the global tracked set in sync with group events. When a
		// view is added via external means (e.g. CDP createTarget), the
		// group fires onDidAddView — update _trackedPages accordingly.
		// The Set makes double-adds (from startTrackingPage) harmless.
		// Also replicate the view into other sessions so that CDP-created
		// targets become accessible everywhere, not just the originating session.
		session.registerDisposable(group.onDidAddView(e => {
			if (!this._trackedPages.has(e.viewId)) {
				this._trackedPages.add(e.viewId);
				this._fireTrackedPages();
			}
			for (const [id, other] of this._sessions) {
				if (id !== sessionId) {
					void other.group.addView(e.viewId).catch(() => { });
				}
			}
		}));
		session.registerDisposable(group.onDidRemoveView(e => {
			if (this._trackedPages.delete(e.viewId)) {
				this._fireTrackedPages();
			}
		}));

		// On browser disconnect, dispose the session so it will be
		// recreated fresh on the next tool call.
		browser.on('disconnected', () => {
			this.logService.debug(`[PlaywrightService] Browser disconnected for session ${sessionId}`);
			this._sessions.deleteAndDispose(sessionId);
			this._inactivityTimers.deleteAndDispose(sessionId);
		});

		this._sessions.set(sessionId, session);

		// Replay globally tracked pages into the new session's group.
		// Pages may have been removed since they were tracked — catch and
		// evict stale entries so they don't accumulate.
		for (const viewId of [...this._trackedPages]) {
			try {
				await session.group.addView(viewId);
			} catch {
				this.logService.debug(`[PlaywrightService] Stale tracked page ${viewId} removed during replay`);
				this._trackedPages.delete(viewId);
				this._fireTrackedPages();
			}
		}

		this._touchSession(sessionId);
		return session;
	}

	// --- Page tracking (global) ---

	async startTrackingPage(viewId: string): Promise<void> {
		// Update the canonical set directly so tracking works even when
		// no sessions exist yet. The Set makes the double-add from
		// the group's onDidAddView listener harmless.
		if (!this._trackedPages.has(viewId)) {
			this._trackedPages.add(viewId);
			this._fireTrackedPages();
		}
		for (const session of this._sessions.values()) {
			session.group.addView(viewId);
		}
	}

	async stopTrackingPage(viewId: string): Promise<void> {
		if (this._trackedPages.delete(viewId)) {
			this._fireTrackedPages();
		}
		for (const session of this._sessions.values()) {
			session.group.removeView(viewId);
		}
	}

	async isPageTracked(viewId: string): Promise<boolean> {
		return this._trackedPages.has(viewId);
	}

	async getTrackedPages(): Promise<readonly string[]> {
		return [...this._trackedPages];
	}

	// --- Playwright operations (delegated to per-session instances) ---

	async openPage(sessionId: string, url: string): Promise<{ pageId: string; summary: string }> {
		const session = await this._getOrCreateSession(sessionId);
		return session.openPage(url);
	}

	async getSummary(sessionId: string, pageId: string): Promise<string> {
		const session = await this._getOrCreateSession(sessionId);
		return session.getSummary(pageId);
	}

	async invokeFunctionRaw<T>(sessionId: string, pageId: string, fnDef: string, ...args: unknown[]): Promise<T> {
		const session = await this._getOrCreateSession(sessionId);
		return session.invokeFunctionRaw(pageId, fnDef, ...args);
	}

	async invokeFunction(sessionId: string, pageId: string, fnDef: string, args: unknown[] = [], timeoutMs?: number): Promise<IInvokeFunctionResult> {
		const session = await this._getOrCreateSession(sessionId);
		return session.invokeFunction(pageId, fnDef, args, timeoutMs);
	}

	async waitForDeferredResult(sessionId: string, deferredResultId: string, timeoutMs: number): Promise<IInvokeFunctionResult> {
		const session = await this._getOrCreateSession(sessionId);
		return session.waitForDeferredResult(deferredResultId, timeoutMs);
	}

	async replyToFileChooser(sessionId: string, pageId: string, files: string[]): Promise<{ summary: string }> {
		const session = await this._getOrCreateSession(sessionId);
		return session.replyToFileChooser(pageId, files);
	}

	async replyToDialog(sessionId: string, pageId: string, accept: boolean, promptText?: string): Promise<{ summary: string }> {
		const session = await this._getOrCreateSession(sessionId);
		return session.replyToDialog(pageId, accept, promptText);
	}

	// --- Session lifecycle ---

	async disposeSession(sessionId: string): Promise<void> {
		if (this._sessions.has(sessionId)) {
			this.logService.debug(`[PlaywrightService] Disposing session ${sessionId}`);
			this._sessions.deleteAndDispose(sessionId);
			this._inactivityTimers.deleteAndDispose(sessionId);
		}
	}

	// --- Private helpers ---

	private _fireTrackedPages(): void {
		this._onDidChangeTrackedPages.fire([...this._trackedPages]);
	}

	/**
	 * Reset the inactivity timer for a session. After
	 * {@link SESSION_INACTIVITY_MS} of no activity the session is
	 * automatically disposed.
	 */
	private _touchSession(sessionId: string): void {
		this._inactivityTimers.deleteAndDispose(sessionId);
		const timer = disposableTimeout(
			() => {
				this.logService.debug(`[PlaywrightService] Session ${sessionId} inactive for ${SESSION_INACTIVITY_MS / 60_000}m, disposing`);
				this._sessions.deleteAndDispose(sessionId);
				this._inactivityTimers.deleteAndDispose(sessionId);
			},
			SESSION_INACTIVITY_MS,
		);
		this._inactivityTimers.set(sessionId, timer);
	}
}

/**
 * A single session's Playwright browser connection, page tracking, and
 * page-matching logic.
 *
 * Receives an already-connected {@link Browser} and {@link IBrowserViewGroup}
 * from the parent {@link PlaywrightService}. Correlates browser view IDs with
 * Playwright {@link Page} instances via FIFO matching of group IPC events and
 * Playwright CDP events.
 */
class PlaywrightSession extends Disposable {

	// --- Page matching ---

	private readonly _viewIdToPage = new Map<string, Page>();
	private readonly _pageToViewId = new WeakMap<Page, string>();
	private readonly _tabs = new WeakMap<Page, PlaywrightTab>();

	/** View IDs received from the group but not yet matched with a page. */
	private _viewIdQueue: Array<{ viewId: string; page: DeferredPromise<Page> }> = [];

	/** Pages received from Playwright but not yet matched with a view ID. */
	private _pageQueue: Array<{ page: Page; viewId: DeferredPromise<string> }> = [];

	private readonly _watchedContexts = new WeakSet<BrowserContext>();
	private _scanTimer: ReturnType<typeof setInterval> | undefined;
	private _openContext: BrowserContext | undefined = undefined;

	/** In-flight deferred results keyed by their generated ID. */
	private readonly _deferredResults = this._register(new DisposableMap<string, {
		pageId: string;
		promise: Promise<unknown>;
		logCtx?: IExecutionLogContext;
	} & IDisposable>());

	constructor(
		readonly sessionId: string,
		private _browser: Browser,
		readonly group: IBrowserViewGroup,
		private readonly actionScope: IPlaywrightActionScope,
		private readonly logService: ILogService,
		private readonly agentNetworkFilterService: IAgentNetworkFilterService,
		private readonly telemetryService: ITelemetryService,
		private readonly onDidCreatePage: (viewId: string) => Promise<void>,
	) {
		super();

		this._register(this.group);
		this._register(this.group.onDidAddView(e => this._onViewAdded(e.viewId)));
		this._register(this.group.onDidRemoveView(e => this._onViewRemoved(e.viewId)));

		this._scanForNewContexts();
	}

	/** Register a disposable to be cleaned up when this session is disposed. */
	registerDisposable(d: IDisposable): void {
		this._register(d);
	}

	// --- Page operations ---

	async openPage(url: string): Promise<{ pageId: string; summary: string }> {
		if (!this._openContext) {
			this._openContext = await this._browser.newContext();
			this._onContextAdded(this._openContext);
		}

		const page = await this._openContext.newPage();
		const viewId = await this._onPageAdded(page);
		await this.onDidCreatePage(viewId);

		if (url && url !== 'about:blank' && page.url() !== url) {
			try {
				await page.goto(url, { waitUntil: 'domcontentloaded', timeout: OPEN_PAGE_NAVIGATION_TIMEOUT_MS });
			} catch (error) {
				if (!isNavigationTimeoutError(error)) {
					throw error;
				}

				throw new Error(`Navigation to ${url} timed out after ${OPEN_PAGE_NAVIGATION_TIMEOUT_MS} ms. The page (ID: ${viewId}) is open and can be reused.`);
			}
		}

		const summary = await this._getSummary(viewId);
		return { pageId: viewId, summary };
	}

	async getSummary(pageId: string): Promise<string> {
		return this._getSummary(pageId, true);
	}

	async invokeFunctionRaw<T>(pageId: string, fnDef: string, ...args: unknown[]): Promise<T> {
		const fn = await this._compileFunction(fnDef);
		return this._runAgainstPage(pageId, (page) => fn(page, args) as T);
	}

	async invokeFunction(pageId: string, fnDef: string, args: unknown[] = [], timeoutMs?: number): Promise<IInvokeFunctionResult> {
		this.logService.info(`[PlaywrightSession] Invoking function on view ${pageId}`);

		const logCtx: IExecutionLogContext = {
			startedAt: Date.now(),
			codeLength: fnDef.length,
			codeLineCount: fnDef.split('\n').length,
			pageMethodsCalled: new Map<string, number>(),
			wasDeferred: false,
			resumeCount: 0,
			logged: false,
		};

		let fn;
		try {
			fn = await this._compileFunction(fnDef);
		} catch (err: unknown) {
			// Surface compile/syntax errors as { error, summary }, like other execution failures.
			this._logExecution(logCtx, false);
			const summary = await this._getSummary(pageId);
			return { error: err instanceof Error ? err.message : String(err), summary };
		}
		const wrappedCallback = async (page: Page) => fn(createPageApiProxy(page, logCtx.pageMethodsCalled), args);

		if (timeoutMs !== undefined) {
			return this._runWithDeferral(pageId, wrappedCallback, timeoutMs, undefined, logCtx);
		}

		let result, error;
		try {
			result = await this._runAgainstPage(pageId, wrappedCallback);
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : String(err);
		}

		this._logExecution(logCtx, !error);
		const summary = await this._getSummary(pageId);
		return { result, error, summary };
	}

	async waitForDeferredResult(deferredResultId: string, timeoutMs: number): Promise<IInvokeFunctionResult> {
		const entry = this._deferredResults.get(deferredResultId);
		if (!entry) {
			throw new Error(`No deferred result found with ID "${deferredResultId}". It may have been cleaned up or already consumed.`);
		}

		const { pageId, promise, logCtx } = entry;
		if (logCtx) {
			logCtx.resumeCount++;
		}
		this._deferredResults.deleteAndDispose(deferredResultId);
		return this._runWithDeferral(pageId, () => promise, timeoutMs, deferredResultId, logCtx);
	}

	async replyToFileChooser(pageId: string, files: string[]): Promise<{ summary: string }> {
		const page = await this._getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to reply to file chooser');
		}
		await tab.replyToFileChooser(files);
		const summary = await tab.getSummary();
		return { summary };
	}

	async replyToDialog(pageId: string, accept: boolean, promptText?: string): Promise<{ summary: string }> {
		const page = await this._getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to reply to dialog');
		}
		await tab.replyToDialog(accept, promptText);
		const summary = await tab.getSummary();
		return { summary };
	}

	// --- Private: page operations ---

	private async _getSummary(pageId: string, full = false): Promise<string> {
		const page = await this._getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to get page summary');
		}
		return tab.getSummary(full);
	}

	private async _runAgainstPage<T>(pageId: string, callback: (page: Page) => T | Promise<T>): Promise<T> {
		const page = await this._getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to execute function against page');
		}
		return tab.safeRunAgainstPage(async () => callback(page));
	}

	private async _runWithDeferral(pageId: string, callback: (page: Page) => Promise<unknown>, timeoutMs: number, existingDeferredId?: string, logCtx?: IExecutionLogContext): Promise<IInvokeFunctionResult> {
		const deferred = new DeferredPromise();

		// Attach settlement logging once, on the initiating call: `deferred.p` settles
		// when the page work finishes no matter how many times the result is deferred,
		// resumed, or abandoned, so a deferred run is still logged once it settles.
		// `_logExecution` is idempotent, so this is a no-op if the synchronous path
		// below already logged a non-deferred completion.
		if (existingDeferredId === undefined && logCtx) {
			deferred.p.then(() => this._logExecution(logCtx, true), () => this._logExecution(logCtx, false));
		}

		const wrappedPromise = this._runAgainstPage(pageId, async (page) => {
			const promise = callback(page);
			promise.catch(() => { /* prevent unhandled rejection if deferred */ });
			deferred.settleWith(promise);
			return promise;
		});

		let result, error;
		let interrupted = false;

		try {
			result = await raceTimeout(wrappedPromise, timeoutMs, () => { interrupted = true; });
		} catch (err: unknown) {
			if (err instanceof DialogInterruptedError) {
				interrupted = true;
			}
			error = err instanceof Error ? err.message : String(err);
		}

		let deferredResultId: string | undefined;
		if (interrupted) {
			if (logCtx) {
				logCtx.wasDeferred = true;
			}
			deferredResultId = existingDeferredId ?? generateUuid();
			const cleanup = disposableTimeout(() => this._deferredResults.deleteAndDispose(deferredResultId!), DEFERRED_RESULT_CLEANUP_MS);
			this._deferredResults.set(deferredResultId, { pageId, promise: deferred.p, logCtx, dispose: () => cleanup.dispose() });
			this.logService.info(`[PlaywrightSession] Execution interrupted, deferred as ${deferredResultId}`);
		} else if (logCtx) {
			// Completed or failed within the timeout: log the outcome now rather than
			// relying on the settlement promise, which never settles if the page work
			// threw before `settleWith` ran (e.g. the page could not be resolved).
			this._logExecution(logCtx, !error);
		}

		const summary = await this._getSummary(pageId);
		return { result, error, summary, deferredResultId };
	}

	/**
	 * Emit completion telemetry for a single {@link invokeFunction} call, once the
	 * page work settles. Idempotent: only the first call for a given context emits,
	 * so the synchronous and settlement-promise paths can both call it safely.
	 */
	private _logExecution(ctx: IExecutionLogContext, success: boolean): void {
		if (ctx.logged) {
			return;
		}
		ctx.logged = true;
		const entries = [...ctx.pageMethodsCalled.entries()];
		const total = entries.reduce((sum, [, count]) => sum + count, 0);
		this.telemetryService.publicLog2<RunPlaywrightCodeEvent, RunPlaywrightCodeClassification>(
			'integratedBrowser.tools.runPlaywrightCode.completed',
			{
				pageMethodsCalled: JSON.stringify(Object.fromEntries(entries)),
				pageMethodsCalledDcount: entries.length,
				pageMethodsCalledCount: total,
				success: success ? 1 : 0,
				wasDeferred: ctx.wasDeferred ? 1 : 0,
				resumeCount: ctx.resumeCount,
				durationMs: Math.round(Date.now() - ctx.startedAt),
				codeLength: ctx.codeLength,
				codeLineCount: ctx.codeLineCount,
			}
		);
	}

	private async _compileFunction(fnDef: string): Promise<(page: Page, args: unknown[]) => unknown> {
		const vm = await import('vm');
		return vm.compileFunction(`return (${fnDef})(page, ...args)`, ['page', 'args'], { parsingContext: vm.createContext() }) as (page: Page, args: unknown[]) => unknown;
	}

	// --- Private: page matching (view ↔ page pairing) ---

	private async _getPage(viewId: string): Promise<Page> {
		const resolved = this._viewIdToPage.get(viewId);
		if (resolved) {
			return resolved;
		}
		const queued = this._viewIdQueue.find(item => item.viewId === viewId);
		if (queued) {
			return queued.page.p;
		}
		throw new Error(`Page "${viewId}" not found`);
	}

	private _onViewAdded(viewId: string, timeoutMs = 10000): Promise<Page> {
		const resolved = this._viewIdToPage.get(viewId);
		if (resolved) {
			return Promise.resolve(resolved);
		}
		const queued = this._viewIdQueue.find(item => item.viewId === viewId);
		if (queued) {
			return queued.page.p;
		}

		const deferred = new DeferredPromise<Page>();
		const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for page`)), timeoutMs);

		deferred.p.finally(() => {
			clearTimeout(timeout);
			this._viewIdQueue = this._viewIdQueue.filter(item => item.viewId !== viewId);
			if (this._viewIdQueue.length === 0) {
				this._stopScanning();
			}
		});

		this._viewIdQueue.push({ viewId, page: deferred });
		this._tryMatch();
		this._ensureScanning();

		return deferred.p;
	}

	private _onViewRemoved(viewId: string): void {
		this._viewIdQueue = this._viewIdQueue.filter(item => item.viewId !== viewId);
		const page = this._viewIdToPage.get(viewId);
		if (page) {
			this._pageToViewId.delete(page);
		}
		this._viewIdToPage.delete(viewId);
	}

	private _onPageAdded(page: Page, timeoutMs = 10000): Promise<string> {
		const resolved = this._pageToViewId.get(page);
		if (resolved) {
			return Promise.resolve(resolved);
		}
		const queued = this._pageQueue.find(item => item.page === page);
		if (queued) {
			return queued.viewId.p;
		}

		this._onContextAdded(page.context());
		page.once('close', () => this._onPageRemoved(page));
		page.setDefaultTimeout(10000);
		this._tabs.set(page, new PlaywrightTab(page, this.actionScope, this.agentNetworkFilterService));

		const deferred = new DeferredPromise<string>();
		const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for browser view`)), timeoutMs);
		deferred.p.finally(() => {
			clearTimeout(timeout);
			this._pageQueue = this._pageQueue.filter(item => item.page !== page);
		});

		this._pageQueue.push({ page, viewId: deferred });
		this._tryMatch();

		return deferred.p;
	}

	private _onPageRemoved(page: Page): void {
		this._pageQueue = this._pageQueue.filter(item => item.page !== page);
		const viewId = this._pageToViewId.get(page);
		if (viewId) {
			this._viewIdToPage.delete(viewId);
		}
		this._pageToViewId.delete(page);
	}

	private _onContextAdded(context: BrowserContext): void {
		if (this._watchedContexts.has(context)) {
			return;
		}
		this._watchedContexts.add(context);
		context.on('page', (page: Page) => this._onPageAdded(page));
		context.on('close', () => this._watchedContexts.delete(context));
		for (const page of context.pages()) {
			this._onPageAdded(page);
		}
	}

	// --- Private: matching ---

	private _tryMatch(): void {
		while (this._viewIdQueue.length > 0 && this._pageQueue.length > 0) {
			const viewIdItem = this._viewIdQueue.shift()!;
			const pageItem = this._pageQueue.shift()!;

			this._viewIdToPage.set(viewIdItem.viewId, pageItem.page);
			this._pageToViewId.set(pageItem.page, viewIdItem.viewId);

			viewIdItem.page.complete(pageItem.page);
			pageItem.viewId.complete(viewIdItem.viewId);

			this.logService.debug(`[PlaywrightSession] Matched view ${viewIdItem.viewId} → page`);
		}

		if (this._viewIdQueue.length === 0) {
			this._stopScanning();
		}
	}

	// --- Private: context scanning ---

	private _scanForNewContexts(): void {
		for (const context of this._browser.contexts()) {
			this._onContextAdded(context);
		}
	}

	private _ensureScanning(): void {
		if (this._scanTimer === undefined) {
			this._scanTimer = setInterval(() => this._scanForNewContexts(), 100);
		}
	}

	private _stopScanning(): void {
		if (this._scanTimer !== undefined) {
			clearInterval(this._scanTimer);
			this._scanTimer = undefined;
		}
	}

	override dispose(): void {
		this._stopScanning();
		this._browser?.close().catch(() => { /* ignore */ });
		for (const { page } of this._viewIdQueue) {
			page.error(new Error('PlaywrightSession disposed'));
		}
		for (const { viewId } of this._pageQueue) {
			viewId.error(new Error('PlaywrightSession disposed'));
		}
		this._viewIdQueue = [];
		this._pageQueue = [];
		super.dispose();
	}
}

function isNavigationTimeoutError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return error.name === 'TimeoutError'
		|| /Timeout \d+ms exceeded/.test(error.message)
		|| /navigation timeout/i.test(error.message);
}

/**
 * Per-invocation state threaded through {@link PlaywrightSession.invokeFunction}
 * and its deferral machinery so completion telemetry can be emitted exactly once
 * when the underlying page work settles - even for deferred runs the caller
 * never resumes.
 */
interface IExecutionLogContext {
	/** {@link Date.now} timestamp captured when the invocation began. */
	readonly startedAt: number;
	/** Character length of the executed function source. */
	readonly codeLength: number;
	/** Line count of the executed function source. */
	readonly codeLineCount: number;
	/** Per-method call counts accumulated by {@link createPageApiProxy}. */
	readonly pageMethodsCalled: Map<string, number>;
	/** Set once the execution is interrupted and deferred at least once. */
	wasDeferred: boolean;
	/** Number of times the caller resumed this execution via {@link PlaywrightSession.waitForDeferredResult}. */
	resumeCount: number;
	/** Guards against double-logging; set by {@link PlaywrightSession._logExecution}. */
	logged: boolean;
}

type RunPlaywrightCodeEvent = {
	pageMethodsCalled: string;
	pageMethodsCalledDcount: number;
	pageMethodsCalledCount: number;
	success: number;
	wasDeferred: number;
	resumeCount: number;
	durationMs: number;
	codeLength: number;
	codeLineCount: number;
};

type RunPlaywrightCodeClassification = {
	pageMethodsCalled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'JSON object mapping dotted `page.*` method names to their call counts (e.g. `{"click":2,"keyboard.press":5}`), in first-observed order.' };
	pageMethodsCalledDcount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct `page.*` methods invoked.' };
	pageMethodsCalledCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total `page.*` method calls including duplicates (sum of all per-method counts).' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: '1 if the code completed without error, 0 otherwise.' };
	wasDeferred: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: '1 if the execution was interrupted and deferred at least once, 0 otherwise.' };
	resumeCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of times the caller resumed this execution by polling for its deferred result. 0 means the run either completed within the first timeout or was deferred and never resumed (settled in the background).' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock time in milliseconds from invocation start until the page work settled.' };
	codeLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Character length of the executed function source.' };
	codeLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Line count of the executed function source.' };
	owner: 'jruales';
	comment: 'Tracks how the run_playwright_code chat tool is exercised.';
};

/**
 * Property names that are skipped by {@link createPageApiProxy} so that JS
 * runtime/idiomatic accesses don't show up as fake API usage. Includes
 * `then`/`catch`/`finally` (so awaiting the proxy never records noise),
 * conversion hooks, and `constructor`.
 */
const PAGE_PROXY_IGNORED_PROPS = new Set<string>([
	'then',
	'catch',
	'finally',
	'toJSON',
	'toString',
	'valueOf',
	'constructor',
]);

/**
 * Maximum nesting depth for the recursive page proxy. The Playwright `page`
 * surface only nests one level deep in practice (e.g. `page.keyboard.press`),
 * so 3 is generously above any real workload while preventing pathological
 * cases on cyclic structures.
 */
const PAGE_PROXY_MAX_DEPTH = 3;

/**
 * Wrap a Playwright `page` so every call through the proxy increments a counter
 * in {@link methodCalls}, keyed by the dotted path from `page` (e.g. `click`,
 * `keyboard.press`). Object properties are proxied recursively (capped at
 * {@link PAGE_PROXY_MAX_DEPTH}) so calls on namespaces like `keyboard` and
 * `mouse` are visible; symbol keys, `_`-prefixed internals, and
 * {@link PAGE_PROXY_IGNORED_PROPS} are skipped to avoid noise.
 *
 * Wrappers and nested proxies are cached per property so repeated reads return
 * the same value, preserving Playwright's object identity (e.g.
 * `page.keyboard === page.keyboard`).
 */
function createPageApiProxy<T extends object>(target: T, methodCalls: Map<string, number>, prefix: string = '', depth: number = 0): T {
	if (depth >= PAGE_PROXY_MAX_DEPTH) {
		return target;
	}
	const cache = new Map<string, unknown>();
	return new Proxy(target, {
		get(t, prop, receiver) {
			const value = Reflect.get(t, prop, receiver);
			if (typeof prop !== 'string' || prop.startsWith('_') || PAGE_PROXY_IGNORED_PROPS.has(prop)) {
				return value;
			}
			const cached = cache.get(prop);
			if (cached !== undefined) {
				return cached;
			}
			if (typeof value === 'function') {
				const name = prefix + prop;
				const wrapper = function (this: unknown, ...args: unknown[]) {
					methodCalls.set(name, (methodCalls.get(name) ?? 0) + 1);
					return Reflect.apply(value as Function, t, args);
				};
				cache.set(prop, wrapper);
				return wrapper;
			}
			if (value !== null && typeof value === 'object') {
				const nested = createPageApiProxy(value as object, methodCalls, `${prefix}${prop}.`, depth + 1);
				cache.set(prop, nested);
				return nested;
			}
			return value;
		},
	});
}

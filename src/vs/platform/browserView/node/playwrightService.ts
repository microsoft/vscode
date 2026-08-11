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
import { IBrowserViewService } from '../common/browserView.js';

// eslint-disable-next-line local/code-import-patterns
import type { Browser, BrowserContext, ConnectOverCDPTransport, Page } from 'playwright-core';

/**
 * Tracks whether a caller-initiated Playwright action is currently in flight.
 */
export interface IPlaywrightActionScope {
	activeCalls: number;
}

type PageApiSandboxBridge = {
	createFunction(callback: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown;
	createArray(): unknown[];
	createObject(): Record<PropertyKey, unknown>;
	throwError(message: string): never;
};

type CompiledPlaywrightFunction = {
	run(page: Page, args: unknown[]): unknown;
	readonly bridge: PageApiSandboxBridge;
};

function clonePageApiArguments(value: unknown, bridge: PageApiSandboxBridge, seen = new WeakMap<object, unknown>()): unknown {
	if (value === null || typeof value !== 'object') {
		return value;
	}
	const existing = seen.get(value);
	if (existing !== undefined) {
		return existing;
	}
	if (Array.isArray(value)) {
		const result = bridge.createArray();
		seen.set(value, result);
		result.push(...value.map(item => clonePageApiArguments(item, bridge, seen)));
		return result;
	}
	const result = bridge.createObject();
	seen.set(value, result);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
		if (descriptor?.enumerable) {
			result[key] = clonePageApiArguments(Reflect.get(value, key), bridge, seen);
		}
	}
	return result;
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
	private readonly _pagesBeingUntracked = new Set<string>();
	private readonly _pageTrackingOperations = new Map<string, Promise<void>>();
	private readonly _networkFilterSourceId = generateUuid();

	private readonly _onDidChangeTrackedPages = this._register(new Emitter<readonly string[]>());
	readonly onDidChangeTrackedPages: Event<readonly string[]> = this._onDidChangeTrackedPages.event;

	constructor(
		private readonly windowId: number,
		private readonly browserViewGroupRemoteService: IBrowserViewGroupRemoteService,
		private readonly browserViewService: Pick<IBrowserViewService, 'setAgentNetworkFiltering' | 'setAgentNetworkAction' | 'getNetworkPolicyError'>,
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

		const group = await this.browserViewGroupRemoteService.createGroup({
			mainWindowId: this.windowId,
			sessionId,
			agentNetworkFilterSourceId: this._networkFilterSourceId,
		});

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
			this.browserViewService,
		);

		// Keep the global tracked set in sync with group events. When a
		// view is added via external means (e.g. CDP createTarget), the
		// group fires onDidAddView — update _trackedPages accordingly.
		// The Set makes double-adds (from startTrackingPage) harmless.
		// Also replicate the view into other sessions so that CDP-created
		// targets become accessible everywhere, not just the originating session.
		session.registerDisposable(group.onDidAddView(e => {
			if (!this._trackedPages.has(e.viewId)) {
				void this.startTrackingPage(e.viewId).catch(error => {
					this.logService.error(`[PlaywrightService] Failed to track page ${e.viewId} added to session ${sessionId}`, error);
				});
			}
		}));
		session.registerDisposable(group.onDidRemoveView(e => {
			if (this._pagesBeingUntracked.has(e.viewId)) {
				return;
			}
			if (this._trackedPages.delete(e.viewId)) {
				this._fireTrackedPages();
				void this.browserViewService.setAgentNetworkFiltering(e.viewId, this._networkFilterSourceId, false).catch(error => {
					this.logService.error(`[PlaywrightService] Failed to disable network filtering for untracked page ${e.viewId}`, error);
				});
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
			await this.replayTrackedPage(session, viewId);
		}

		this._touchSession(sessionId);
		return session;
	}

	// --- Page tracking (global) ---

	async startTrackingPage(viewId: string): Promise<void> {
		return this.enqueuePageTrackingOperation(viewId, () => this._startTrackingPage(viewId));
	}

	private async _startTrackingPage(viewId: string): Promise<void> {
		if (this._store.isDisposed) {
			throw new Error('Cannot track a page after PlaywrightService is disposed');
		}
		// Update the canonical set directly so tracking works even when
		// no sessions exist yet. The Set makes the double-add from
		// the group's onDidAddView listener harmless.
		const newlyTracked = !this._trackedPages.has(viewId);
		if (newlyTracked) {
			await this.browserViewService.setAgentNetworkFiltering(viewId, this._networkFilterSourceId, true);
			if (this._store.isDisposed) {
				await this.browserViewService.setAgentNetworkFiltering(viewId, this._networkFilterSourceId, false);
				throw new Error('PlaywrightService was disposed while tracking a page');
			}
			this._trackedPages.add(viewId);
			this._fireTrackedPages();
		}
		const sessions = [...this._sessions.values()];
		try {
			await Promise.all(sessions.map(session => session.group.addView(viewId)));
			if (this._store.isDisposed) {
				throw new Error('PlaywrightService was disposed while attaching a tracked page');
			}
		} catch (error) {
			if (newlyTracked) {
				this._pagesBeingUntracked.add(viewId);
				try {
					const cleanupResults = await Promise.allSettled(sessions.map(session => session.group.removeView(viewId)));
					for (let index = 0; index < cleanupResults.length; index++) {
						const result = cleanupResults[index];
						if (result.status === 'rejected') {
							this.logService.error(`[PlaywrightService] Failed to detach page ${viewId} while rolling back tracking`, result.reason);
							const sessionId = sessions[index].sessionId;
							this._sessions.deleteAndDispose(sessionId);
							this._inactivityTimers.deleteAndDispose(sessionId);
						}
					}
					this._trackedPages.delete(viewId);
					this._fireTrackedPages();
					await this.browserViewService.setAgentNetworkFiltering(viewId, this._networkFilterSourceId, false);
				} finally {
					this._pagesBeingUntracked.delete(viewId);
				}
			}
			throw error;
		}
	}

	async stopTrackingPage(viewId: string): Promise<void> {
		return this.enqueuePageTrackingOperation(viewId, () => this._stopTrackingPage(viewId));
	}

	private async _stopTrackingPage(viewId: string): Promise<void> {
		const wasTracked = this._trackedPages.has(viewId);
		this._pagesBeingUntracked.add(viewId);
		try {
			await Promise.all([...this._sessions.values()].map(session => session.group.removeView(viewId)));
			await this.browserViewService.setAgentNetworkFiltering(viewId, this._networkFilterSourceId, false);
			if (wasTracked) {
				this._trackedPages.delete(viewId);
				this._fireTrackedPages();
			}
		} finally {
			this._pagesBeingUntracked.delete(viewId);
		}
	}

	private replayTrackedPage(session: PlaywrightSession, viewId: string): Promise<void> {
		return this.enqueuePageTrackingOperation(viewId, () => this._replayTrackedPage(session, viewId));
	}

	private async _replayTrackedPage(session: PlaywrightSession, viewId: string): Promise<void> {
		if (!this._trackedPages.has(viewId)) {
			return;
		}
		try {
			await session.group.addView(viewId);
		} catch {
			this.logService.debug(`[PlaywrightService] Stale tracked page ${viewId} removed during replay`);
			await this._stopTrackingPage(viewId);
			return;
		}
		if (!this._trackedPages.has(viewId)) {
			await session.group.removeView(viewId);
		}
	}

	private async enqueuePageTrackingOperation(viewId: string, operation: () => Promise<void>): Promise<void> {
		const previous = this._pageTrackingOperations.get(viewId);
		const current = (async () => {
			if (previous) {
				try {
					await previous;
				} catch (error) {
					this.logService.debug(`[PlaywrightService] Previous page tracking operation failed for ${viewId}`, error);
				}
			}
			await operation();
		})();
		this._pageTrackingOperations.set(viewId, current);
		try {
			await current;
		} finally {
			if (this._pageTrackingOperations.get(viewId) === current) {
				this._pageTrackingOperations.delete(viewId);
			}
		}
	}

	override dispose(): void {
		const trackedPages = [...this._trackedPages];
		this._trackedPages.clear();
		super.dispose();
		for (const viewId of trackedPages) {
			void this.browserViewService.setAgentNetworkFiltering(viewId, this._networkFilterSourceId, false).catch(error => {
				this.logService.error(`[PlaywrightService] Failed to release network filtering for tracked page ${viewId}`, error);
			});
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
	private readonly _activeNetworkActions = new Map<string, string>();

	constructor(
		readonly sessionId: string,
		private _browser: Browser,
		readonly group: IBrowserViewGroup,
		private readonly actionScope: IPlaywrightActionScope,
		private readonly logService: ILogService,
		private readonly agentNetworkFilterService: IAgentNetworkFilterService,
		private readonly telemetryService: ITelemetryService,
		private readonly onDidCreatePage: (viewId: string) => Promise<void>,
		private readonly browserViewService: Pick<IBrowserViewService, 'setAgentNetworkAction' | 'getNetworkPolicyError'>,
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
				const policyError = await this.browserViewService.getNetworkPolicyError(viewId, true);
				if (policyError) {
					return { pageId: viewId, summary: policyError };
				}
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
		const sandboxArgs = clonePageApiArguments(args, fn.bridge) as unknown[];
		return this._runAgainstPage(pageId, page => Reflect.apply(fn.run, undefined, [page, sandboxArgs]) as T);
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

		let fn: CompiledPlaywrightFunction;
		try {
			fn = await this._compileFunction(fnDef);
		} catch (err: unknown) {
			// Surface compile/syntax errors as { error, summary }, like other execution failures.
			this._logExecution(logCtx, false);
			const summary = await this._getSummary(pageId);
			return { error: err instanceof Error ? err.message : String(err), summary };
		}
		const wrappedCallback = async (page: Page) => {
			const membrane = createPageApiProxy(page, logCtx.pageMethodsCalled, fn.bridge);
			const sandboxArgs = clonePageApiArguments(args, fn.bridge) as unknown[];
			try {
				return await Reflect.apply(fn.run, undefined, [membrane.proxy, sandboxArgs]);
			} finally {
				membrane.revoke();
			}
		};

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
		const policyError = await this.browserViewService.getNetworkPolicyError(pageId, true);
		if (policyError) {
			return policyError;
		}
		const page = await this._getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to get page summary');
		}
		const summary = await tab.getSummary(full);
		const postSummaryPolicyError = await this.browserViewService.getNetworkPolicyError(pageId, true);
		return postSummaryPolicyError ?? summary;
	}

	private async _runAgainstPage<T>(pageId: string, callback: (page: Page) => T | Promise<T>): Promise<T> {
		const page = await this._getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to execute function against page');
		}
		const actionId = generateUuid();
		await this.browserViewService.setAgentNetworkAction(pageId, actionId, true);
		if (this._store.isDisposed) {
			await this.browserViewService.setAgentNetworkAction(pageId, actionId, false);
			throw new Error('PlaywrightSession was disposed while starting an action');
		}
		this._activeNetworkActions.set(actionId, pageId);
		try {
			try {
				const result = await tab.safeRunAgainstPage(async () => callback(page));
				const policyError = await this.browserViewService.getNetworkPolicyError(pageId);
				if (policyError) {
					throw new Error(policyError);
				}
				return result;
			} catch (error) {
				const policyError = await this.browserViewService.getNetworkPolicyError(pageId);
				if (policyError) {
					throw new Error(policyError);
				}
				throw error;
			}
		} finally {
			this._activeNetworkActions.delete(actionId);
			await this.browserViewService.setAgentNetworkAction(pageId, actionId, false);
		}
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

	private async _compileFunction(fnDef: string): Promise<CompiledPlaywrightFunction> {
		const vm = await import('vm');
		const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
		const run = vm.compileFunction(`"use strict"; return (${fnDef})(page, ...args)`, ['page', 'args'], { parsingContext: context }) as (page: Page, args: unknown[]) => unknown;
		const createBridge = vm.compileFunction(`
			const toError = error => new Error(error && typeof error.message === 'string' ? error.message : String(error));
			return {
				createFunction(callback) {
					return function (...args) {
						try {
							const result = callback(...args);
							if (result && typeof result.then === 'function') {
								return Promise.resolve(result).catch(error => { throw toError(error); });
							}
							return result;
						} catch (error) {
							throw toError(error);
						}
					};
				},
				createArray() { return []; },
				createObject() { return Object.create(null); },
				throwError(message) { throw new Error(message); },
			};
		`, [], { parsingContext: context });
		return { run, bridge: createBridge() as PageApiSandboxBridge };
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
		const activeNetworkActions = [...this._activeNetworkActions];
		this._activeNetworkActions.clear();
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
		for (const [actionId, pageId] of activeNetworkActions) {
			void this.browserViewService.setAgentNetworkAction(pageId, actionId, false).catch(error => {
				this.logService.error(`[PlaywrightSession] Failed to release network filtering for action on page ${pageId}`, error);
			});
		}
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

const PAGE_PROXY_SERIALIZED_CALLBACK_METHODS = new Set(['$eval', '$$eval', 'addInitScript', 'evaluate', 'evaluateAll', 'evaluateHandle', 'waitForFunction']);

type PageApiProxyContext = {
	readonly proxies: WeakMap<object, object>;
	readonly targets: WeakMap<object, object>;
	readonly values: WeakMap<object, object>;
	readonly callbacks: WeakMap<Function, Function>;
	readonly functions: WeakMap<Function, Function>;
	readonly bridge: PageApiSandboxBridge;
	active: boolean;
};

function wrapPageApiValue(value: unknown, methodCalls: Map<string, number>, prefix: string, context: PageApiProxyContext): unknown {
	assertPageApiProxyActive(context);
	if (typeof value === 'function') {
		let wrappedFunction = context.functions.get(value);
		if (!wrappedFunction) {
			wrappedFunction = context.bridge.createFunction((...args: unknown[]) => {
				assertPageApiProxyActive(context);
				const preparedArgs = args.map(arg => preparePageApiArgument(arg, methodCalls, prefix, context, false));
				return wrapPageApiValue(Reflect.apply(value, undefined, preparedArgs), methodCalls, prefix, context);
			});
			context.functions.set(value, wrappedFunction);
		}
		return wrappedFunction;
	}
	if (value === null || typeof value !== 'object') {
		return value;
	}
	if (typeof (value as PromiseLike<unknown>).then === 'function') {
		return Promise.resolve(value).then(result => wrapPageApiValue(result, methodCalls, prefix, context));
	}
	const existingProxy = context.proxies.get(value);
	if (existingProxy) {
		return existingProxy;
	}
	const existingValue = context.values.get(value);
	if (existingValue) {
		return existingValue;
	}
	if (Array.isArray(value)) {
		const result = context.bridge.createArray();
		context.values.set(value, result);
		result.push(...value.map(item => wrapPageApiValue(item, methodCalls, prefix, context)));
		return result;
	}
	const prototype = Object.getPrototypeOf(value);
	if (isPlainPageApiObject(prototype)) {
		const result = context.bridge.createObject();
		context.values.set(value, result);
		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
			if (descriptor?.enumerable) {
				const propertyValue = Reflect.get(value, key);
				if (typeof propertyValue === 'function') {
					result[key] = context.bridge.createFunction((...args: unknown[]) => {
						assertPageApiProxyActive(context);
						const preparedArgs = args.map(arg => preparePageApiArgument(arg, methodCalls, prefix, context, false));
						return wrapPageApiValue(Reflect.apply(propertyValue, value, preparedArgs), methodCalls, prefix, context);
					});
				} else {
					result[key] = wrapPageApiValue(propertyValue, methodCalls, prefix, context);
				}
			}
		}
		return result;
	}
	return createPageApiProxyInternal(value, methodCalls, prefix, context);
}

function preparePageApiArgument(value: unknown, methodCalls: Map<string, number>, prefix: string, context: PageApiProxyContext, wrapCallbacks: boolean): unknown {
	if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
		return value;
	}
	if (typeof value === 'object') {
		const target = context.targets.get(value);
		if (target) {
			return target;
		}
	}
	if (wrapCallbacks && typeof value === 'function') {
		let callback = context.callbacks.get(value);
		if (!callback) {
			callback = function (this: unknown, ...args: unknown[]) {
				if (!context.active) {
					const route = args[0];
					if (route && typeof route === 'object') {
						const fallback = Reflect.get(route, 'fallback');
						if (typeof fallback === 'function') {
							return Reflect.apply(fallback, route, []);
						}
						const connectToServer = Reflect.get(route, 'connectToServer');
						if (typeof connectToServer === 'function') {
							return Reflect.apply(connectToServer, route, []);
						}
					}
					return undefined;
				}
				const callbackThis = wrapPageApiValue(this, methodCalls, prefix, context);
				return Reflect.apply(value, callbackThis, args.map(arg => wrapPageApiValue(arg, methodCalls, prefix, context)));
			};
			context.callbacks.set(value, callback);
		}
		return callback;
	}
	if (typeof value === 'object') {
		if (Array.isArray(value)) {
			return value.map(item => preparePageApiArgument(item, methodCalls, prefix, context, wrapCallbacks));
		}
		const prototype = Object.getPrototypeOf(value);
		if (isPlainPageApiObject(prototype)) {
			const result: Record<PropertyKey, unknown> = Object.create(null);
			for (const key of Reflect.ownKeys(value)) {
				result[key] = preparePageApiArgument(Reflect.get(value, key), methodCalls, prefix, context, wrapCallbacks);
			}
			return result;
		}
	}
	return value;
}

/**
 * Wrap a Playwright page in a membrane that records method calls and blocks private APIs and request contexts.
 * Returned values and callback arguments are wrapped so raw Playwright objects cannot escape.
 */
export function createPageApiProxy<T extends object>(target: T, methodCalls: Map<string, number>, bridge: PageApiSandboxBridge): { readonly proxy: T; revoke(): void } {
	const context: PageApiProxyContext = {
		proxies: new WeakMap(),
		targets: new WeakMap(),
		values: new WeakMap(),
		callbacks: new WeakMap(),
		functions: new WeakMap(),
		bridge,
		active: true,
	};
	return {
		proxy: createPageApiProxyInternal(target, methodCalls, '', context),
		revoke: () => context.active = false,
	};
}

function createPageApiProxyInternal<T extends object>(target: T, methodCalls: Map<string, number>, prefix: string, context: PageApiProxyContext): T {
	const existing = context.proxies.get(target);
	if (existing) {
		return existing as T;
	}
	const cache = new Map<PropertyKey, unknown>();
	const facade = Object.create(null);
	const proxy = new Proxy(facade, {
		get(_facade, prop) {
			assertPageApiProxyActive(context);
			if (prop === 'constructor') {
				return undefined;
			}
			if (typeof prop === 'string' && prop.startsWith('_')) {
				context.bridge.throwError('Private Playwright APIs are unavailable.');
			}
			if (prop === 'browser' || prop === 'newCDPSession') {
				context.bridge.throwError(`Playwright API '${prop}' is unavailable in page-scoped automation.`);
			}
			let value: unknown;
			try {
				value = Reflect.get(target, prop, target);
			} catch (error) {
				context.bridge.throwError(error instanceof Error ? error.message : String(error));
			}
			if (prop === 'request' && value !== null && typeof value === 'object') {
				context.bridge.throwError('Playwright API request contexts are blocked by network domain policy.');
			}
			const cached = cache.get(prop);
			if (cached !== undefined) {
				return cached;
			}
			if (typeof value === 'function') {
				const name = prefix + String(prop);
				const wrapper = context.bridge.createFunction((...args: unknown[]) => {
					assertPageApiProxyActive(context);
					methodCalls.set(name, (methodCalls.get(name) ?? 0) + 1);
					const wrapCallbacks = typeof prop !== 'string' || !PAGE_PROXY_SERIALIZED_CALLBACK_METHODS.has(prop);
					const preparedArgs = args.map(arg => preparePageApiArgument(arg, methodCalls, `${name}.`, context, wrapCallbacks));
					const result = Reflect.apply(value as Function, target, preparedArgs);
					return wrapPageApiValue(result, methodCalls, `${name}.`, context);
				});
				cache.set(prop, wrapper);
				return wrapper;
			}
			if (value !== null && typeof value === 'object') {
				const nested = wrapPageApiValue(value, methodCalls, `${prefix}${String(prop)}.`, context);
				cache.set(prop, nested);
				return nested;
			}
			return value;
		},
	});
	context.proxies.set(target, proxy);
	context.targets.set(proxy, target);
	return proxy;
}

function assertPageApiProxyActive(context: PageApiProxyContext): void {
	if (!context.active) {
		context.bridge.throwError('The Playwright page API is no longer available after the action completed.');
	}
}

function isPlainPageApiObject(prototype: object | null): boolean {
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}

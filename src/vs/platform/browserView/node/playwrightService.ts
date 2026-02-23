/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IPlaywrightService } from '../common/playwrightService.js';
import { IBrowserViewGroupRemoteService } from '../node/browserViewGroupRemoteService.js';
import { IBrowserViewGroup } from '../common/browserViewGroup.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { PlaywrightTab } from './playwrightTab.js';

// eslint-disable-next-line local/code-import-patterns
import type { Browser, BrowserContext, Page } from 'playwright-core';

/**
 * Shared-process implementation of {@link IPlaywrightService}.
 *
 * Creates a {@link PlaywrightPageManager} eagerly on construction to track
 * browser views. The Playwright browser connection is lazily initialised
 * only when an operation that requires it is called.
 */
export class PlaywrightService extends Disposable implements IPlaywrightService {
	declare readonly _serviceBrand: undefined;

	private readonly _pages: PlaywrightPageManager;
	readonly onDidChangeTrackedPages: Event<readonly string[]>;

	private _browser: Browser | undefined;
	private _initPromise: Promise<void> | undefined;

	constructor(
		@IBrowserViewGroupRemoteService private readonly browserViewGroupRemoteService: IBrowserViewGroupRemoteService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._pages = this._register(new PlaywrightPageManager(logService));
		this.onDidChangeTrackedPages = this._pages.onDidChangeTrackedPages;
	}

	// --- Page tracking (delegated to manager) ---

	async startTrackingPage(viewId: string): Promise<void> {
		return this._pages.startTrackingPage(viewId);
	}

	async stopTrackingPage(viewId: string): Promise<void> {
		return this._pages.stopTrackingPage(viewId);
	}

	async isPageTracked(viewId: string): Promise<boolean> {
		return this._pages.isPageTracked(viewId);
	}

	async getTrackedPages(): Promise<readonly string[]> {
		return this._pages.getTrackedPages();
	}

	// --- Playwright operations (lazy init) ---

	/**
	 * Ensure the Playwright browser connection is initialized and the page
	 * manager is wired up to the browser view group.
	 */
	private async initialize(): Promise<void> {
		if (this._browser) {
			return;
		}

		if (this._initPromise) {
			return this._initPromise;
		}

		this._initPromise = (async () => {
			try {
				this.logService.debug('[PlaywrightService] Creating browser view group');
				const group = await this.browserViewGroupRemoteService.createGroup();

				this.logService.debug('[PlaywrightService] Connecting to browser via CDP');
				const playwright = await import('playwright-core');
				const endpoint = await group.getDebugWebSocketEndpoint();
				const browser = await playwright.chromium.connectOverCDP(endpoint);

				this.logService.debug('[PlaywrightService] Connected to browser');

				// This can happen if the service was disposed while we were waiting for the connection. In that case, clean up immediately.
				if (this._initPromise === undefined) {
					browser.close().catch(() => { /* ignore */ });
					group.dispose();
					throw new Error('PlaywrightService was disposed during initialization');
				}

				browser.on('disconnected', () => {
					this.logService.debug('[PlaywrightService] Browser disconnected');
					if (this._browser === browser) {
						this._pages.reset();
						this._browser = undefined;
						this._initPromise = undefined;
					}
				});

				await this._pages.initialize(browser, group);
				this._browser = browser;
			} catch (e) {
				this._initPromise = undefined;
				throw e;
			}
		})();

		return this._initPromise;
	}

	async openPage(url: string): Promise<{ pageId: string; summary: string }> {
		await this.initialize();
		const pageId = await this._pages.newPage(url);
		const summary = await this._pages.getSummary(pageId);
		return { pageId, summary };
	}

	async getSummary(pageId: string): Promise<string> {
		await this.initialize();
		return this._pages.getSummary(pageId, true);
	}

	async invokeFunction(pageId: string, fnDef: string, ...args: unknown[]): Promise<{ result: unknown; summary: string }> {
		this.logService.info(`[PlaywrightService] Invoking function on view ${pageId}`);

		try {
			await this.initialize();

			const vm = await import('vm');
			const fn = vm.compileFunction(`return (${fnDef})(page, ...args)`, ['page', 'args'], { parsingContext: vm.createContext() });

			let result;
			try {
				result = await this._pages.runAgainstPage(pageId, (page) => fn(page, args));
			} catch (err: unknown) {
				result = err instanceof Error ? err.message : String(err);
			}

			let summary;
			try {
				summary = await this._pages.getSummary(pageId);
			} catch (err: unknown) {
				summary = err instanceof Error ? err.message : String(err);
			}
			return { result, summary };
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			this.logService.error('[PlaywrightService] Script execution failed:', errorMessage);
			throw err;
		}
	}

	async captureScreenshot(pageId: string, selector?: string, fullPage?: boolean): Promise<VSBuffer> {
		await this.initialize();
		return this._pages.runAgainstPage(pageId, async page => {
			const screenshotBuffer = selector
				? await page.locator(selector).screenshot({ type: 'jpeg', quality: 80 })
				: await page.screenshot({ type: 'jpeg', quality: 80, fullPage: fullPage ?? false });
			return VSBuffer.wrap(screenshotBuffer);
		});
	}

	async replyToFileChooser(pageId: string, files: string[]): Promise<{ summary: string }> {
		await this.initialize();
		const summary = await this._pages.replyToFileChooser(pageId, files);
		return { summary };
	}

	async replyToDialog(pageId: string, accept: boolean, promptText?: string): Promise<{ summary: string }> {
		await this.initialize();
		const summary = await this._pages.replyToDialog(pageId, accept, promptText);
		return { summary };
	}

	override dispose(): void {
		if (this._browser) {
			this._browser.close().catch(() => { /* ignore */ });
			this._browser = undefined;
		}
		this._initPromise = undefined;
		super.dispose();
	}
}

/**
 * Manages page tracking and correlates browser view IDs with Playwright
 * {@link Page} instances.
 *
 * Created eagerly by {@link PlaywrightService} and operates in two phases:
 *
 * 1. **Before initialization** - tracks which pages are added/removed but
 *    cannot resolve Playwright {@link Page} objects.
 * 2. **After {@link initialize}** - proxies add/remove calls to the
 *    {@link IBrowserViewGroup} and pairs view IDs with Playwright pages
 *    via FIFO matching of the group's IPC events and Playwright's CDP events.
 *
 * A periodic scan handles the case where Playwright creates a new
 * {@link BrowserContext} for a target whose session was previously unknown.
 */
class PlaywrightPageManager extends Disposable {

	// --- Page tracking ---

	private readonly _trackedPages = new Set<string>();

	private readonly _onDidChangeTrackedPages = this._register(new Emitter<readonly string[]>());
	readonly onDidChangeTrackedPages: Event<readonly string[]> = this._onDidChangeTrackedPages.event;

	// --- Page matching ---

	private readonly _viewIdToPage = new Map<string, Page>();
	private readonly _pageToViewId = new WeakMap<Page, string>();
	private readonly _tabs = new WeakMap<Page, PlaywrightTab>();

	/** View IDs received from the group but not yet matched with a page. */
	private _viewIdQueue: Array<{
		viewId: string;
		page: DeferredPromise<Page>;
	}> = [];

	/** Pages received from Playwright but not yet matched with a view ID. */
	private _pageQueue: Array<{
		page: Page;
		viewId: DeferredPromise<string>;
	}> = [];

	private readonly _watchedContexts = new WeakSet<BrowserContext>();
	private _scanTimer: ReturnType<typeof setInterval> | undefined;

	// --- Initialized state ---

	private readonly _initStore = this._register(new DisposableStore());
	private _group: IBrowserViewGroup | undefined;
	private _browser: Browser | undefined;

	constructor(
		private readonly logService: ILogService,
	) {
		super();
	}

	// --- Public: page tracking ---

	isPageTracked(viewId: string): boolean {
		return this._trackedPages.has(viewId);
	}

	getTrackedPages(): readonly string[] {
		return [...this._trackedPages];
	}

	async startTrackingPage(viewId: string): Promise<void> {
		if (this._trackedPages.has(viewId)) {
			return;
		}

		this._trackedPages.add(viewId);
		this._fireTrackedPagesChanged();

		if (this._group) {
			await this._addPageToGroup(viewId);
		}
	}

	async stopTrackingPage(viewId: string): Promise<void> {
		if (!this._trackedPages.has(viewId)) {
			return;
		}

		this._trackedPages.delete(viewId);
		this._fireTrackedPagesChanged();

		if (this._group) {
			await this._removePageFromGroup(viewId);
		}
	}

	// --- Public: Playwright operations (require initialization) ---

	/**
	 * Create a new page in the browser and return its associated page ID.
	 * The page is automatically added to the tracked set.
	 */
	async newPage(url: string): Promise<string> {
		if (!this._browser) {
			throw new Error('PlaywrightPageManager has not been initialized');
		}

		const page = await this._browser.newPage();
		const viewId = await this.onPageAdded(page);

		this._trackedPages.add(viewId);
		this._fireTrackedPagesChanged();

		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

		return viewId;
	}

	async runAgainstPage<T>(pageId: string, callback: (page: Page) => T | Promise<T>): Promise<T> {
		const page = await this.getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to execute function against page');
		}
		return tab.safeRunAgainstPage(async () => callback(page));
	}

	async getSummary(pageId: string, full = false): Promise<string> {
		const page = await this.getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to get page summary');
		}
		return tab.getSummary(full);
	}

	async replyToDialog(pageId: string, accept: boolean, promptText?: string): Promise<string> {
		const page = await this.getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to reply to dialog');
		}
		await tab.replyToDialog(accept, promptText);
		return tab.getSummary();
	}

	async replyToFileChooser(pageId: string, files: string[]): Promise<string> {
		const page = await this.getPage(pageId);
		const tab = this._tabs.get(page);
		if (!tab) {
			throw new Error('Failed to reply to file chooser');
		}
		await tab.replyToFileChooser(files);
		return tab.getSummary();
	}

	// --- Initialization ---

	/**
	 * Wire up the manager to a browser and group. Replays any pages that
	 * were tracked before initialization.
	 */
	async initialize(browser: Browser, group: IBrowserViewGroup): Promise<void> {
		this._initStore.clear();

		this._browser = browser;
		this._group = group;

		this._initStore.add(group);
		this._initStore.add(group.onDidAddView(e => this.onViewAdded(e.viewId)));
		this._initStore.add(group.onDidRemoveView(e => this.onViewRemoved(e.viewId)));

		this.scanForNewContexts();

		// Eagerly connect any pages that were tracked before initialization.
		await Promise.all(
			[...this._trackedPages].map(viewId => this._addPageToGroup(viewId))
		);
	}

	/**
	 * Clear initialized state but preserve tracked pages so the manager
	 * can be re-initialized with a new browser and group.
	 */
	reset(): void {
		this._initStore.clear();
		this._browser = undefined;
		this._group = undefined;

		this.stopScanning();
		this._viewIdToPage.clear();

		for (const { page } of this._viewIdQueue) {
			page.error(new Error('PlaywrightPageManager reset'));
		}
		for (const { viewId } of this._pageQueue) {
			viewId.error(new Error('PlaywrightPageManager reset'));
		}
		this._viewIdQueue = [];
		this._pageQueue = [];
	}

	// --- Private: group proxy ---

	private async _addPageToGroup(viewId: string): Promise<void> {
		if (this._viewIdToPage.has(viewId)) {
			return;
		}
		if (this._viewIdQueue.some(item => item.viewId === viewId)) {
			return;
		}

		// Ensure the viewId is queued so we can immediately fetch the promise via getPage().
		this.onViewAdded(viewId);

		try {
			await this._group!.addView(viewId);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			this.logService.error('[PlaywrightPageManager] Failed to add view:', errorMessage);
			this.onViewRemoved(viewId);
		}
	}

	private async _removePageFromGroup(viewId: string): Promise<void> {
		this.onViewRemoved(viewId);
		try {
			await this._group!.removeView(viewId);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			this.logService.error('[PlaywrightPageManager] Failed to remove view:', errorMessage);
		}
	}

	private _fireTrackedPagesChanged(): void {
		this._onDidChangeTrackedPages.fire([...this._trackedPages]);
	}

	// --- Page matching (view ↔ page pairing) ---

	/**
	 * Get the Playwright {@link Page} for a browser view.
	 * If the view is tracked but not yet connected, it is added to the group
	 * automatically. Throws if the view has not been added.
	 */
	private async getPage(viewId: string): Promise<Page> {
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

	/**
	 * Called when the group fires onDidAddView. Creates a deferred entry in
	 * the view ID queue and attempts to match it with a page.
	 */
	private onViewAdded(viewId: string, timeoutMs = 10000): Promise<Page> {
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
				this.stopScanning();
			}
		});

		this._viewIdQueue.push({ viewId, page: deferred });
		this.tryMatch();
		this.ensureScanning();

		return deferred.p;
	}

	private onViewRemoved(viewId: string): void {
		this._viewIdQueue = this._viewIdQueue.filter(item => item.viewId !== viewId);
		const page = this._viewIdToPage.get(viewId);
		if (page) {
			this._pageToViewId.delete(page);
		}
		this._viewIdToPage.delete(viewId);
		this._trackedPages.delete(viewId);
		this._fireTrackedPagesChanged();
	}

	private onPageAdded(page: Page, timeoutMs = 10000): Promise<string> {
		const resolved = this._pageToViewId.get(page);
		if (resolved) {
			return Promise.resolve(resolved);
		}
		const queued = this._pageQueue.find(item => item.page === page);
		if (queued) {
			return queued.viewId.p;
		}

		this.onContextAdded(page.context());
		page.once('close', () => this.onPageRemoved(page));
		page.setDefaultTimeout(10000);
		this._tabs.set(page, new PlaywrightTab(page));

		const deferred = new DeferredPromise<string>();
		const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for browser view`)), timeoutMs);
		deferred.p.finally(() => {
			clearTimeout(timeout);
			this._pageQueue = this._pageQueue.filter(item => item.page !== page);
		});

		this._pageQueue.push({ page, viewId: deferred });
		this.tryMatch();

		return deferred.p;
	}

	private onPageRemoved(page: Page): void {
		this._pageQueue = this._pageQueue.filter(item => item.page !== page);
		const viewId = this._pageToViewId.get(page);
		if (viewId) {
			this._viewIdToPage.delete(viewId);
			this._trackedPages.delete(viewId);
			this._fireTrackedPagesChanged();
		}
		this._pageToViewId.delete(page);
	}

	private onContextAdded(context: BrowserContext): void {
		if (this._watchedContexts.has(context)) {
			return;
		}
		this._watchedContexts.add(context);

		context.on('page', (page: Page) => this.onPageAdded(page));
		context.on('close', () => this.onContextRemoved(context));

		for (const page of context.pages()) {
			this.onPageAdded(page);
		}
	}

	private onContextRemoved(context: BrowserContext): void {
		this._watchedContexts.delete(context);
	}

	// --- Matching ---

	/**
	 * Pair up queued view IDs with queued pages in FIFO order and resolve
	 * any callers waiting for the matched view IDs.
	 */
	private tryMatch(): void {
		while (this._viewIdQueue.length > 0 && this._pageQueue.length > 0) {
			const viewIdItem = this._viewIdQueue.shift()!;
			const pageItem = this._pageQueue.shift()!;

			this._viewIdToPage.set(viewIdItem.viewId, pageItem.page);
			this._pageToViewId.set(pageItem.page, viewIdItem.viewId);

			viewIdItem.page.complete(pageItem.page);
			pageItem.viewId.complete(viewIdItem.viewId);

			this.logService.debug(`[PlaywrightPageManager] Matched view ${viewIdItem.viewId} → page`);
		}

		if (this._viewIdQueue.length === 0) {
			this.stopScanning();
		}
	}

	// --- Context scanning ---

	/**
	 * Watch all current {@link BrowserContext BrowserContexts} for new pages.
	 * Also processes any existing pages in newly discovered contexts.
	 */
	private scanForNewContexts(): void {
		if (!this._browser) {
			return;
		}
		for (const context of this._browser.contexts()) {
			this.onContextAdded(context);
		}
	}

	private ensureScanning(): void {
		if (this._scanTimer === undefined) {
			this._scanTimer = setInterval(() => this.scanForNewContexts(), 100);
		}
	}

	private stopScanning(): void {
		if (this._scanTimer !== undefined) {
			clearInterval(this._scanTimer);
			this._scanTimer = undefined;
		}
	}

	override dispose(): void {
		this.stopScanning();
		for (const { page } of this._viewIdQueue) {
			page.error(new Error('PlaywrightPageManager disposed'));
		}
		for (const { viewId } of this._pageQueue) {
			viewId.error(new Error('PlaywrightPageManager disposed'));
		}
		this._viewIdQueue = [];
		this._pageQueue = [];
		super.dispose();
	}
}

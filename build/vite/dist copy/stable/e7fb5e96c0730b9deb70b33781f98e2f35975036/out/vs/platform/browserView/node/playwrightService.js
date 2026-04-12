/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { DeferredPromise, disposableTimeout, raceTimeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { PlaywrightTab, DialogInterruptedError } from './playwrightTab.js';
import { generateUuid } from '../../../base/common/uuid.js';
const DEFERRED_RESULT_CLEANUP_MS = 5 * 60_000; // 5 minutes
/**
 * Shared-process implementation of {@link IPlaywrightService}.
 *
 * Creates a {@link PlaywrightPageManager} eagerly on construction to track
 * browser views. The Playwright browser connection is lazily initialised
 * only when an operation that requires it is called.
 */
export class PlaywrightService extends Disposable {
    constructor(windowId, browserViewGroupRemoteService, logService) {
        super();
        this.windowId = windowId;
        this.browserViewGroupRemoteService = browserViewGroupRemoteService;
        this.logService = logService;
        /** In-flight deferred results keyed by their generated ID. */
        this._deferredResults = this._register(new DisposableMap());
        this._pages = this._register(new PlaywrightPageManager(logService));
        this.onDidChangeTrackedPages = this._pages.onDidChangeTrackedPages;
    }
    // --- Page tracking (delegated to manager) ---
    async startTrackingPage(viewId) {
        return this._pages.startTrackingPage(viewId);
    }
    async stopTrackingPage(viewId) {
        return this._pages.stopTrackingPage(viewId);
    }
    async isPageTracked(viewId) {
        return this._pages.isPageTracked(viewId);
    }
    async getTrackedPages() {
        return this._pages.getTrackedPages();
    }
    // --- Playwright operations (lazy init) ---
    /**
     * Ensure the Playwright browser connection is initialized and the page
     * manager is wired up to the browser view group.
     */
    async initialize() {
        if (this._browser) {
            return;
        }
        if (this._initPromise) {
            return this._initPromise;
        }
        this._initPromise = (async () => {
            try {
                this.logService.debug('[PlaywrightService] Creating browser view group');
                const group = await this.browserViewGroupRemoteService.createGroup(this.windowId);
                this.logService.debug('[PlaywrightService] Connecting to browser via CDP');
                const playwright = await import('playwright-core');
                const sub = group.onCDPMessage(msg => transport.onmessage?.(msg));
                const transport = {
                    close() {
                        sub.dispose();
                        this.onclose?.();
                    },
                    send(message) {
                        void group.sendCDPMessage(message);
                    }
                };
                const browser = await playwright.chromium._connectOverCDPTransport(transport);
                this.logService.debug('[PlaywrightService] Connected to browser');
                // This can happen if the service was disposed while we were waiting for the connection. In that case, clean up immediately.
                if (this._initPromise === undefined) {
                    browser.close().catch(() => { });
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
            }
            catch (e) {
                this._initPromise = undefined;
                throw e;
            }
        })();
        return this._initPromise;
    }
    async openPage(url) {
        await this.initialize();
        const pageId = await this._pages.newPage(url);
        const summary = await this._pages.getSummary(pageId);
        return { pageId, summary };
    }
    async getSummary(pageId) {
        await this.initialize();
        return this._pages.getSummary(pageId, true);
    }
    async invokeFunctionRaw(pageId, fnDef, ...args) {
        await this.initialize();
        const vm = await import('vm');
        const fn = vm.compileFunction(`return (${fnDef})(page, ...args)`, ['page', 'args'], { parsingContext: vm.createContext() });
        return this._pages.runAgainstPage(pageId, (page) => fn(page, args));
    }
    async invokeFunctionWithDeferral(pageId, fnDef, args, timeoutMs) {
        await this.initialize();
        const vm = await import('vm');
        const fn = vm.compileFunction(`return (${fnDef})(page, ...args)`, ['page', 'args'], { parsingContext: vm.createContext() });
        return this._runWithDeferral(pageId, (page) => fn(page, args ?? []), timeoutMs);
    }
    async invokeFunction(pageId, fnDef, args = [], timeoutMs) {
        this.logService.info(`[PlaywrightService] Invoking function on view ${pageId}`);
        if (timeoutMs !== undefined) {
            return this.invokeFunctionWithDeferral(pageId, fnDef, args, timeoutMs);
        }
        let result, error;
        try {
            result = await this.invokeFunctionRaw(pageId, fnDef, ...args);
        }
        catch (err) {
            error = err instanceof Error ? err.message : String(err);
        }
        const summary = await this._pages.getSummary(pageId);
        return { result, error, summary };
    }
    async waitForDeferredResult(deferredResultId, timeoutMs) {
        const entry = this._deferredResults.get(deferredResultId);
        if (!entry) {
            throw new Error(`No deferred result found with ID "${deferredResultId}". It may have been cleaned up or already consumed.`);
        }
        const { pageId, promise } = entry;
        // Remove eagerly — _runWithDeferral will re-insert if interrupted again.
        this._deferredResults.deleteAndDispose(deferredResultId);
        // The callback ignores the page param since execution is already in-flight.
        return this._runWithDeferral(pageId, () => promise, timeoutMs, deferredResultId);
    }
    /**
     * Run a callback against a page with deferred result support.
     */
    async _runWithDeferral(pageId, callback, timeoutMs, existingDeferredId) {
        const effectiveTimeout = timeoutMs;
        // Start execution via safeRunAgainstPage, but capture the raw promise
        // independently so it can be deferred if a dialog or timeout interrupts.
        const deferred = new DeferredPromise();
        const wrappedPromise = this._pages.runAgainstPage(pageId, async (page) => {
            const promise = callback(page);
            promise.catch(() => { });
            deferred.settleWith(promise);
            return promise;
        });
        let result, error;
        let interrupted = false;
        try {
            result = await raceTimeout(wrappedPromise, effectiveTimeout, () => { interrupted = true; });
        }
        catch (err) {
            if (err instanceof DialogInterruptedError) {
                interrupted = true;
            }
            error = err instanceof Error ? err.message : String(err);
        }
        let deferredResultId;
        if (interrupted) {
            deferredResultId = existingDeferredId ?? generateUuid();
            const cleanup = disposableTimeout(() => this._deferredResults.deleteAndDispose(deferredResultId), DEFERRED_RESULT_CLEANUP_MS);
            this._deferredResults.set(deferredResultId, { pageId, promise: deferred.p, dispose: () => cleanup.dispose() });
            this.logService.info(`[PlaywrightService] Execution interrupted, deferred as ${deferredResultId}`);
        }
        const summary = await this._pages.getSummary(pageId);
        return { result, error, summary, deferredResultId };
    }
    async replyToFileChooser(pageId, files) {
        await this.initialize();
        const summary = await this._pages.replyToFileChooser(pageId, files);
        return { summary };
    }
    async replyToDialog(pageId, accept, promptText) {
        await this.initialize();
        const summary = await this._pages.replyToDialog(pageId, accept, promptText);
        return { summary };
    }
    dispose() {
        if (this._browser) {
            this._browser.close().catch(() => { });
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
    constructor(logService) {
        super();
        this.logService = logService;
        // --- Page tracking ---
        this._trackedPages = new Set();
        this._onDidChangeTrackedPages = this._register(new Emitter());
        this.onDidChangeTrackedPages = this._onDidChangeTrackedPages.event;
        // --- Page matching ---
        this._viewIdToPage = new Map();
        this._pageToViewId = new WeakMap();
        this._tabs = new WeakMap();
        /** View IDs received from the group but not yet matched with a page. */
        this._viewIdQueue = [];
        /** Pages received from Playwright but not yet matched with a view ID. */
        this._pageQueue = [];
        this._watchedContexts = new WeakSet();
        // --- Initialized state ---
        this._initStore = this._register(new DisposableStore());
        this._openContext = undefined;
    }
    // --- Public: page tracking ---
    isPageTracked(viewId) {
        return this._trackedPages.has(viewId);
    }
    getTrackedPages() {
        return [...this._trackedPages];
    }
    async startTrackingPage(viewId) {
        if (this._trackedPages.has(viewId)) {
            return;
        }
        this._trackedPages.add(viewId);
        this._fireTrackedPagesChanged();
        if (this._group) {
            await this._addPageToGroup(viewId);
        }
    }
    async stopTrackingPage(viewId) {
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
    async newPage(url) {
        if (!this._browser) {
            throw new Error('PlaywrightPageManager has not been initialized');
        }
        if (!this._openContext) {
            this._openContext = await this._browser.newContext();
            this.onContextAdded(this._openContext);
        }
        const page = await this._openContext.newPage();
        const viewId = await this.onPageAdded(page);
        this._trackedPages.add(viewId);
        this._fireTrackedPagesChanged();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return viewId;
    }
    async runAgainstPage(pageId, callback) {
        const page = await this.getPage(pageId);
        const tab = this._tabs.get(page);
        if (!tab) {
            throw new Error('Failed to execute function against page');
        }
        return tab.safeRunAgainstPage(async () => callback(page));
    }
    async getSummary(pageId, full = false) {
        const page = await this.getPage(pageId);
        const tab = this._tabs.get(page);
        if (!tab) {
            throw new Error('Failed to get page summary');
        }
        return tab.getSummary(full);
    }
    async replyToDialog(pageId, accept, promptText) {
        const page = await this.getPage(pageId);
        const tab = this._tabs.get(page);
        if (!tab) {
            throw new Error('Failed to reply to dialog');
        }
        await tab.replyToDialog(accept, promptText);
        return tab.getSummary();
    }
    async replyToFileChooser(pageId, files) {
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
    async initialize(browser, group) {
        this._initStore.clear();
        this._browser = browser;
        this._group = group;
        this._initStore.add(group);
        this._initStore.add(group.onDidAddView(e => this.onViewAdded(e.viewId)));
        this._initStore.add(group.onDidRemoveView(e => this.onViewRemoved(e.viewId)));
        this.scanForNewContexts();
        // Eagerly connect any pages that were tracked before initialization.
        await Promise.all([...this._trackedPages].map(viewId => this._addPageToGroup(viewId)));
    }
    /**
     * Clear initialized state but preserve tracked pages so the manager
     * can be re-initialized with a new browser and group.
     */
    reset() {
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
    async _addPageToGroup(viewId) {
        if (this._viewIdToPage.has(viewId)) {
            return;
        }
        if (this._viewIdQueue.some(item => item.viewId === viewId)) {
            return;
        }
        // Ensure the viewId is queued so we can immediately fetch the promise via getPage().
        this.onViewAdded(viewId);
        try {
            await this._group.addView(viewId);
        }
        catch (err) {
            this.onViewRemoved(viewId);
            throw err;
        }
    }
    async _removePageFromGroup(viewId) {
        this.onViewRemoved(viewId);
        await this._group.removeView(viewId);
    }
    _fireTrackedPagesChanged() {
        this._onDidChangeTrackedPages.fire([...this._trackedPages]);
    }
    // --- Page matching (view ↔ page pairing) ---
    /**
     * Get the Playwright {@link Page} for a browser view.
     * If the view is tracked but not yet connected, it is added to the group
     * automatically. Throws if the view has not been added.
     */
    async getPage(viewId) {
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
    onViewAdded(viewId, timeoutMs = 10000) {
        const resolved = this._viewIdToPage.get(viewId);
        if (resolved) {
            return Promise.resolve(resolved);
        }
        const queued = this._viewIdQueue.find(item => item.viewId === viewId);
        if (queued) {
            return queued.page.p;
        }
        const deferred = new DeferredPromise();
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
    onViewRemoved(viewId) {
        this._viewIdQueue = this._viewIdQueue.filter(item => item.viewId !== viewId);
        const page = this._viewIdToPage.get(viewId);
        if (page) {
            this._pageToViewId.delete(page);
        }
        this._viewIdToPage.delete(viewId);
        this._trackedPages.delete(viewId);
        this._fireTrackedPagesChanged();
    }
    onPageAdded(page, timeoutMs = 10000) {
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
        const deferred = new DeferredPromise();
        const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for browser view`)), timeoutMs);
        deferred.p.finally(() => {
            clearTimeout(timeout);
            this._pageQueue = this._pageQueue.filter(item => item.page !== page);
        });
        this._pageQueue.push({ page, viewId: deferred });
        this.tryMatch();
        return deferred.p;
    }
    onPageRemoved(page) {
        this._pageQueue = this._pageQueue.filter(item => item.page !== page);
        const viewId = this._pageToViewId.get(page);
        if (viewId) {
            this._viewIdToPage.delete(viewId);
            this._trackedPages.delete(viewId);
            this._fireTrackedPagesChanged();
        }
        this._pageToViewId.delete(page);
    }
    onContextAdded(context) {
        if (this._watchedContexts.has(context)) {
            return;
        }
        this._watchedContexts.add(context);
        context.on('page', (page) => this.onPageAdded(page));
        context.on('close', () => this.onContextRemoved(context));
        for (const page of context.pages()) {
            this.onPageAdded(page);
        }
    }
    onContextRemoved(context) {
        this._watchedContexts.delete(context);
    }
    // --- Matching ---
    /**
     * Pair up queued view IDs with queued pages in FIFO order and resolve
     * any callers waiting for the matched view IDs.
     */
    tryMatch() {
        while (this._viewIdQueue.length > 0 && this._pageQueue.length > 0) {
            const viewIdItem = this._viewIdQueue.shift();
            const pageItem = this._pageQueue.shift();
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
    scanForNewContexts() {
        if (!this._browser) {
            return;
        }
        for (const context of this._browser.contexts()) {
            this.onContextAdded(context);
        }
    }
    ensureScanning() {
        if (this._scanTimer === undefined) {
            this._scanTimer = setInterval(() => this.scanForNewContexts(), 100);
        }
    }
    stopScanning() {
        if (this._scanTimer !== undefined) {
            clearInterval(this._scanTimer);
            this._scanTimer = undefined;
        }
    }
    dispose() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheXdyaWdodFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9ub2RlL3BsYXl3cmlnaHRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBSy9ELE9BQU8sRUFBRSxhQUFhLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUUzRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFrQjVELE1BQU0sMEJBQTBCLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLFlBQVk7QUFFM0Q7Ozs7OztHQU1HO0FBQ0gsTUFBTSxPQUFPLGlCQUFrQixTQUFRLFVBQVU7SUFlaEQsWUFDa0IsUUFBZ0IsRUFDaEIsNkJBQTZELEVBQzdELFVBQXVCO1FBRXhDLEtBQUssRUFBRSxDQUFDO1FBSlMsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNoQixrQ0FBNkIsR0FBN0IsNkJBQTZCLENBQWdDO1FBQzdELGVBQVUsR0FBVixVQUFVLENBQWE7UUFUekMsOERBQThEO1FBQzdDLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBR2xELENBQUMsQ0FBQztRQVFuQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyx1QkFBdUIs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
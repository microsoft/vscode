/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Queue, raceTimeout, TimeoutTimer } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { convertAXTreeToMarkdown } from './cdpAccessibilityDomain.js';
/**
 * A web page loader that uses Electron to load web pages and extract their content.
 */
export class WebPageLoader extends Disposable {
    static { this.TIMEOUT = 30000; } // 30 seconds
    static { this.POST_LOAD_TIMEOUT = 5000; } // 5 seconds - increased for dynamic content
    static { this.FRAME_TIMEOUT = 500; } // 0.5 seconds
    static { this.EXTRACT_CONTENT_TIMEOUT = 2000; } // 2 seconds
    static { this.IDLE_DEBOUNCE_TIME = 500; } // 0.5 seconds - wait after last network request
    static { this.MIN_CONTENT_LENGTH = 100; } // Minimum content length to consider extraction successful
    constructor(browserWindowFactory, _logger, _uri, _options, _isTrustedDomain) {
        super();
        this._logger = _logger;
        this._uri = _uri;
        this._options = _options;
        this._isTrustedDomain = _isTrustedDomain;
        this._requests = new Set();
        this._queue = this._register(new Queue());
        this._timeout = this._register(new TimeoutTimer());
        this._idleDebounceTimer = this._register(new TimeoutTimer());
        this._onResult = (_result) => { };
        this._didFinishLoad = false;
        this._window = browserWindowFactory({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                partition: generateUuid(), // do not share any state with the default renderer session
                javascript: true,
                offscreen: true,
                sandbox: true,
                webgl: false,
            }
        });
        this._register(toDisposable(() => this._window.destroy()));
        this._debugger = this._window.webContents.debugger;
        this._debugger.attach('1.1');
        this._debugger.on('message', this.onDebugMessage.bind(this));
        this._window.webContents
            .once('did-start-loading', this.onStartLoading.bind(this))
            .once('did-finish-load', this.onFinishLoad.bind(this))
            .once('did-fail-load', this.onFailLoad.bind(this))
            .on('will-navigate', this.onRedirect.bind(this))
            .on('will-redirect', this.onRedirect.bind(this))
            .on('select-client-certificate', (event) => event.preventDefault());
        this._window.webContents.session.webRequest.onBeforeSendHeaders(this.onBeforeSendHeaders.bind(this));
        this._window.webContents.session.webRequest.onHeadersReceived(this.onHeadersReceived.bind(this));
        this._window.webContents.session.on('will-download', this.onDownload.bind(this));
    }
    trace(message) {
        this._logger.trace(`[WebPageLoader] [${this._uri}] ${message}`);
    }
    /**
     * Loads the web page and extracts its content.
     */
    async load() {
        return await new Promise((resolve) => {
            this._onResult = createSingleCallFunction((result) => {
                switch (result.status) {
                    case 'ok':
                        this.trace(`Loaded web page content, status: ${result.status}, title: '${result.title}', length: ${result.result.length}`);
                        break;
                    case 'redirect':
                        this.trace(`Loaded web page content, status: ${result.status}, toURI: ${result.toURI}`);
                        break;
                    case 'error':
                        this.trace(`Loaded web page content, status: ${result.status}, code: ${result.statusCode}, error: '${result.error}', title: '${result.title}', length: ${result.result?.length ?? 0}`);
                        break;
                }
                const content = result.status !== 'redirect' ? result.result : undefined;
                if (content !== undefined) {
                    this.trace(content.length < 200 ? `Extracted content: '${content}'` : `Extracted content preview: '${content.substring(0, 200)}...'`);
                }
                resolve(result);
                this.dispose();
            });
            this.trace(`Loading web page content`);
            void this._window.loadURL(this._uri.toString(true));
            this.setTimeout(WebPageLoader.TIMEOUT);
        });
    }
    /**
     * Sets a timeout to trigger content extraction regardless of current loading state.
     */
    setTimeout(time) {
        if (this._store.isDisposed) {
            return;
        }
        this.trace(`Setting page load timeout to ${time} ms`);
        this._timeout.cancelAndSet(() => {
            this.trace(`Page load timeout reached`);
            void this._queue.queue(() => this.extractContent());
        }, time);
    }
    /**
     * Updates HTTP headers for each web request.
     */
    onBeforeSendHeaders(details, callback) {
        const headers = { ...details.requestHeaders };
        // Request privacy for web-sites that respect these.
        headers['DNT'] = '1';
        headers['Sec-GPC'] = '1';
        callback({ requestHeaders: headers });
    }
    /**
     * Checks response headers for download-triggering Content-Disposition.
     * For text-based content types, replaces it with 'inline' so the content
     * is rendered and can be extracted. For binary content, cancels the response.
     */
    onHeadersReceived(details, callback) {
        const headers = details.responseHeaders;
        if (headers) {
            let hasAttachment = false;
            let attachmentHeaderName;
            let contentType;
            for (const name of Object.keys(headers)) {
                const lowerName = name.toLowerCase();
                if (lowerName === 'content-disposition' && headers[name]?.some(v => v.toLowerCase().includes('attachment'))) {
                    hasAttachment = true;
                    attachmentHeaderName = name;
                }
                if (lowerName === 'content-type') {
                    contentType = headers[name]?.[0]?.toLowerCase();
                }
            }
            if (hasAttachment && attachmentHeaderName) {
                if (this.isTextMimeType(contentType)) {
                    this.trace(`Replacing Content-Disposition: attachment with inline for ${details.url} (content-type: ${contentType})`);
                    headers[attachmentHeaderName] = ['inline'];
                    callback({ responseHeaders: headers, cancel: false });
                }
                else {
                    this.trace(`Blocked binary download (Content-Disposition: attachment, content-type: ${contentType}) for ${details.url}`);
                    callback({ cancel: true });
                }
                return;
            }
        }
        callback({ cancel: false });
    }
    /**
     * Returns whether the given MIME type represents text-based content
     * that can be meaningfully rendered and extracted.
     */
    static { this.TEXT_MIME_TYPE_RE = /^(?:text\/|application\/(?:json|xml|xhtml\+xml|rss\+xml|atom\+xml|svg\+xml|javascript|ecmascript|x-yaml|yaml|toml|.*\+(?:xml|json))$)/; }
    isTextMimeType(contentType) {
        const mimeType = contentType?.split(';')[0].trim();
        return !!mimeType && WebPageLoader.TEXT_MIME_TYPE_RE.test(mimeType);
    }
    /**
     * Handles the 'will-download' event, blocking any downloads.
     */
    onDownload(_event, item) {
        const filename = item.getFilename();
        this.trace(`Blocked download: ${filename}`);
        item.cancel();
        void this._queue.queue(() => this.extractContent({ status: 'error', error: `Download not allowed: ${filename}` }));
    }
    /**
     * Handles the 'did-start-loading' event, enabling network tracking.
     */
    onStartLoading() {
        if (this._store.isDisposed) {
            return;
        }
        this.trace(`Received 'did-start-loading' event`);
        void this._debugger.sendCommand('Network.enable').catch(() => {
            // This throws when we destroy the window on redirect.
        });
    }
    /**
     * Handles the 'did-finish-load' event, checking for idle state
     * and updating timeout to allow for post-load activities.
     */
    onFinishLoad() {
        if (this._store.isDisposed) {
            return;
        }
        this.trace(`Received 'did-finish-load' event`);
        this._didFinishLoad = true;
        this.scheduleIdleCheck();
        this.setTimeout(WebPageLoader.POST_LOAD_TIMEOUT);
    }
    /**
     * Handles the 'did-fail-load' event, reporting load failures.
     */
    onFailLoad(_event, statusCode, error) {
        if (this._store.isDisposed) {
            return;
        }
        this.trace(`Received 'did-fail-load' event, code: ${statusCode}, error: '${error}'`);
        if (statusCode === -3) {
            this.trace(`Ignoring ERR_ABORTED (-3) as it may be caused by CSP or other measures`);
            void this._queue.queue(() => this.extractContent());
        }
        else if (statusCode === -27) {
            this.trace(`Ignoring ERR_BLOCKED_BY_CLIENT (-27) as it may be caused by ad-blockers or similar extensions`);
            void this._queue.queue(() => this.extractContent());
        }
        else {
            void this._queue.queue(() => this.extractContent({ status: 'error', statusCode, error }));
        }
    }
    /**
     * Handles the 'will-navigate' and 'will-redirect' events, managing redirects.
     */
    onRedirect(event, url) {
        if (this._store.isDisposed) {
            return;
        }
        this.trace(`Received 'will-navigate' or 'will-redirect' event, url: ${url}`);
        if (!this._options?.followRedirects) {
            const toURI = URI.parse(url);
            // Allow redirect if authority is the same when ignoring www prefix
            if (this.normalizeAuthority(toURI.authority) === this.normalizeAuthority(this._uri.authority)) {
                return;
            }
            // Allow redirect if target is a trusted domain
            if (this._isTrustedDomain(toURI)) {
                return;
            }
            // Ignore script-initiated navigation (ads/trackers etc)
            if (this._didFinishLoad) {
                this.trace(`Blocking post-load navigation to ${url} (likely ad/tracker script)`);
                event.preventDefault();
                return;
            }
            // Otherwise, prevent redirect and report it
            event.preventDefault();
            this._onResult({ status: 'redirect', toURI });
        }
    }
    /**
     * Normalizes an authority by removing the 'www.' prefix if present.
     */
    normalizeAuthority(authority) {
        return authority.toLowerCase().replace(/^www\./, '');
    }
    /**
     * Handles debugger messages related to network requests, tracking their lifecycle.
     * @note DO NOT add logging to this function, microsoft.com will freeze when too many logs are generated
     */
    onDebugMessage(_event, method, params) {
        if (this._store.isDisposed) {
            return;
        }
        const { requestId, type, response } = params;
        switch (method) {
            case 'Network.requestWillBeSent':
                if (requestId !== undefined) {
                    this._requests.add(requestId);
                    this._idleDebounceTimer.cancel();
                }
                break;
            case 'Network.loadingFinished':
            case 'Network.loadingFailed':
                if (requestId !== undefined) {
                    this._requests.delete(requestId);
                    if (this._requests.size === 0 && this._didFinishLoad) {
                        this.scheduleIdleCheck();
                    }
                }
                break;
            case 'Network.responseReceived':
                if (type === 'Document') {
                    const statusCode = response?.status ?? 0;
                    if (statusCode >= 400) {
                        const error = response?.statusText || `HTTP error ${statusCode}`;
                        void this._queue.queue(() => this.extractContent({ status: 'error', statusCode, error }));
                    }
                }
                break;
        }
    }
    /**
     * Schedules an idle check after a debounce period to allow for bursts of network activity.
     * If idle is detected, proceeds to extract content.
     */
    scheduleIdleCheck() {
        if (this._store.isDisposed) {
            return;
        }
        this._idleDebounceTimer.cancelAndSet(async () => {
            if (this._store.isDisposed) {
                return;
            }
            await this.nextFrame();
            if (this._requests.size === 0) {
                this._queue.queue(() => this.extractContent());
            }
            else {
                this.trace(`New network requests detected, deferring content extraction`);
            }
        }, WebPageLoader.IDLE_DEBOUNCE_TIME);
    }
    /**
     * Waits for a rendering frame to ensure the page had a chance to update.
     */
    async nextFrame() {
        if (this._store.isDisposed) {
            return;
        }
        // Wait for a rendering frame to ensure the page had a chance to update.
        await raceTimeout(new Promise((resolve) => {
            try {
                this.trace(`Waiting for a frame to be rendered`);
                this._window.webContents.beginFrameSubscription(false, () => {
                    try {
                        this.trace(`A frame has been rendered`);
                        this._window.webContents.endFrameSubscription();
                    }
                    catch {
                        // ignore errors
                    }
                    resolve();
                });
            }
            catch {
                // ignore errors
                resolve();
            }
        }), WebPageLoader.FRAME_TIMEOUT);
    }
    /**
     * Extracts the content of the loaded web page using the Accessibility domain and reports the result.
     */
    async extractContent(errorResult) {
        if (this._store.isDisposed) {
            return;
        }
        try {
            const title = this._window.webContents.getTitle();
            let result = '';
            const cts = new CancellationTokenSource();
            try {
                await raceTimeout((async () => {
                    if (!cts.token.isCancellationRequested) {
                        result = await this.extractAccessibilityTreeContent(cts.token) ?? '';
                    }
                    if (!cts.token.isCancellationRequested && result.length < WebPageLoader.MIN_CONTENT_LENGTH) {
                        this.trace(`Accessibility tree extraction yielded insufficient content, trying main DOM element extraction`);
                        const domContent = await this.extractMainDomElementContent() ?? '';
                        result = domContent.length > result.length ? domContent : result;
                    }
                })(), WebPageLoader.EXTRACT_CONTENT_TIMEOUT);
            }
            finally {
                cts.cancel();
                cts.dispose();
            }
            if (result.length === 0) {
                this._onResult({ status: 'error', error: 'Failed to extract meaningful content from the web page' });
            }
            else if (errorResult !== undefined) {
                this._onResult({ ...errorResult, result, title });
            }
            else {
                this._onResult({ status: 'ok', result, title });
            }
        }
        catch (e) {
            if (errorResult !== undefined) {
                this._onResult(errorResult);
            }
            else {
                this._onResult({
                    status: 'error',
                    error: e instanceof Error ? e.message : String(e)
                });
            }
        }
    }
    /**
     * Extracts content from the Accessibility tree of the loaded web page.
     * @param token Cancellation token to abort the operation.
     * @return The extracted content, or undefined if extraction fails or is cancelled.
     */
    async extractAccessibilityTreeContent(token) {
        this.trace(`Extracting content using Accessibility domain`);
        try {
            // Enable the Page domain to get frame information
            await this._debugger.sendCommand('Page.enable');
            if (token.isCancellationRequested) {
                return undefined;
            }
            // Get all frames including iframes
            const { frameTree } = await this._debugger.sendCommand('Page.getFrameTree');
            if (token.isCancellationRequested) {
                return undefined;
            }
            const frameNodes = [frameTree];
            for (let i = 0; i < frameNodes.length; i++) {
                frameNodes.push(...frameNodes[i].childFrames ?? []);
            }
            // Collect accessibility nodes from all frames
            const allNodes = [];
            for (const { frame } of frameNodes) {
                try {
                    const { nodes } = await this._debugger.sendCommand('Accessibility.getFullAXTree', { frameId: frame.id });
                    allNodes.push(...nodes);
                    if (token.isCancellationRequested) {
                        return undefined;
                    }
                }
                catch {
                    // ignore
                }
            }
            return convertAXTreeToMarkdown(this._uri, allNodes);
        }
        catch (error) {
            this.trace(`Accessibility tree extraction failed: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
    /**
     * Fallback method for extracting web page content when Accessibility tree extraction yields insufficient content.
     * Attempts to extract meaningful text content from the main DOM elements of the loaded web page.
     * @returns The extracted text content, or undefined if extraction fails.
     */
    async extractMainDomElementContent() {
        try {
            this.trace(`Extracting content from main DOM element`);
            return await this._window.webContents.executeJavaScript(`
				(() => {
					const selectors = ['main','article','[role="main"]','.main-content','#main-content','.article-body','.post-content','.entry-content','.content','body'];
					for (const selector of selectors) {
						const content = document.querySelector(selector)?.textContent?.replace(/[ \\t]+/g, ' ').replace(/\\s{2,}/gm, '\\n').trim();
						if (content && content.length > ${WebPageLoader.MIN_CONTENT_LENGTH}) {
							return content;
						}
					}
					return undefined;
				})();
			`);
        }
        catch (error) {
            this.trace(`DOM extraction failed: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViUGFnZUxvYWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvZWxlY3Ryb24tbWFpbi93ZWJQYWdlTG9hZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pGLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHNUQsT0FBTyxFQUFVLHVCQUF1QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFvQjlFOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGFBQWMsU0FBUSxVQUFVO2FBQ3BCLFlBQU8sR0FBRyxLQUFLLEFBQVIsQ0FBUyxHQUFDLGFBQWE7YUFDOUIsc0JBQWlCLEdBQUcsSUFBSSxBQUFQLENBQVEsR0FBQyw0Q0FBNEM7YUFDdEUsa0JBQWEsR0FBRyxHQUFHLEFBQU4sQ0FBTyxHQUFDLGNBQWM7YUFDbkMsNEJBQXVCLEdBQUcsSUFBSSxBQUFQLENBQVEsR0FBQyxZQUFZO2FBQzVDLHVCQUFrQixHQUFHLEdBQUcsQUFBTixDQUFPLEdBQUMsZ0RBQWdEO2FBQzFFLHVCQUFrQixHQUFHLEdBQUcsQUFBTixDQUFPLEdBQUMsMkRBQTJEO0lBVzdHLFlBQ0Msb0JBQWlGLEVBQ2hFLE9BQW9CLEVBQ3BCLElBQVMsRUFDVCxRQUFp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
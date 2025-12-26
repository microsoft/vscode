/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BeforeSendResponse, BrowserWindow, BrowserWindowConstructorOptions, Event, OnBeforeSendHeadersListenerDetails } from 'electron';
import { Queue, raceTimeout, TimeoutTimer } from '../../../base/common/async.js';
import { createSingleCallFunction } from '../../../base/common/functional.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IWebContentExtractorOptions, WebContentExtractResult } from '../common/webContentExtractor.js';
import { AXNode, convertAXTreeToMarkdown } from './cdpAccessibilityDomain.js';

type NetworkRequestEventParams = Readonly<{
	requestId?: string;
	request?: { url?: string };
	response?: { status?: number; statusText?: string };
	type?: string;
}>;

/**
 * A web page loader that uses Electron to load web pages and extract their content.
 */
export class WebPageLoader extends Disposable {
	private static readonly TIMEOUT = 30000; // 30 seconds
	private static readonly POST_LOAD_TIMEOUT = 5000; // 5 seconds - increased for dynamic content
	private static readonly FRAME_TIMEOUT = 500; // 0.5 seconds
	private static readonly IDLE_DEBOUNCE_TIME = 500; // 0.5 seconds - wait after last network request
	private static readonly MIN_CONTENT_LENGTH = 100; // Minimum content length to consider extraction successful

	private readonly _window: BrowserWindow;
	private readonly _debugger: Electron.Debugger;
	private readonly _requests = new Set<string>();
	private readonly _queue = this._register(new Queue());
	private readonly _timeout = this._register(new TimeoutTimer());
	private readonly _idleDebounceTimer = this._register(new TimeoutTimer());
	private _onResult = (_result: WebContentExtractResult) => { };
	private _didFinishLoad = false;

	constructor(
		browserWindowFactory: (options: BrowserWindowConstructorOptions) => BrowserWindow,
		private readonly _logger: ILogService,
		private readonly _uri: URI,
		private readonly _options: IWebContentExtractorOptions | undefined,
		private readonly _isTrustedDomain: (uri: URI) => boolean,
	) {
		super();

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
			.once('will-navigate', this.onRedirect.bind(this))
			.once('will-redirect', this.onRedirect.bind(this))
			.on('select-client-certificate', (event) => event.preventDefault());

		this._window.webContents.session.webRequest.onBeforeSendHeaders(
			this.onBeforeSendHeaders.bind(this));
	}

	private trace(message: string) {
		this._logger.trace(`[WebPageLoader] [${this._uri}] ${message}`);
	}

	/**
	 * Loads the web page and extracts its content.
	 */
	public async load() {
		return await new Promise<WebContentExtractResult>((resolve) => {
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
	private setTimeout(time: number) {
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
	private onBeforeSendHeaders(details: OnBeforeSendHeadersListenerDetails, callback: (beforeSendResponse: BeforeSendResponse) => void) {
		const headers = { ...details.requestHeaders };

		// Request privacy for web-sites that respect these.
		headers['DNT'] = '1';
		headers['Sec-GPC'] = '1';

		callback({ requestHeaders: headers });
	}

	/**
	 * Handles the 'did-start-loading' event, enabling network tracking.
	 */
	private onStartLoading() {
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
	private onFinishLoad() {
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
	private onFailLoad(_event: Event, statusCode: number, error: string) {
		if (this._store.isDisposed) {
			return;
		}

		this.trace(`Received 'did-fail-load' event, code: ${statusCode}, error: '${error}'`);
		if (statusCode === -3) {
			this.trace(`Ignoring ERR_ABORTED (-3) as it may be caused by CSP or other measures`);
			void this._queue.queue(() => this.extractContent());
		} else {
			void this._queue.queue(() => this.extractContent({ status: 'error', statusCode, error }));
		}
	}

	/**
	 * Handles the 'will-navigate' and 'will-redirect' events, managing redirects.
	 */
	private onRedirect(event: Event, url: string) {
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

			// Otherwise, prevent redirect and report it
			event.preventDefault();
			this._onResult({ status: 'redirect', toURI });
		}
	}

	/**
	 * Normalizes an authority by removing the 'www.' prefix if present.
	 */
	private normalizeAuthority(authority: string): string {
		return authority.toLowerCase().replace(/^www\./, '');
	}

	/**
	 * Handles debugger messages related to network requests, tracking their lifecycle.
	 * @note DO NOT add logging to this function, microsoft.com will freeze when too many logs are generated
	 */
	private onDebugMessage(_event: Event, method: string, params: NetworkRequestEventParams) {
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
	private scheduleIdleCheck() {
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
			} else {
				this.trace(`New network requests detected, deferring content extraction`);
			}
		}, WebPageLoader.IDLE_DEBOUNCE_TIME);
	}

	/**
	 * Waits for a rendering frame to ensure the page had a chance to update.
	 */
	private async nextFrame() {
		if (this._store.isDisposed) {
			return;
		}

		// Wait for a rendering frame to ensure the page had a chance to update.
		await raceTimeout(
			new Promise<void>((resolve) => {
				try {
					this.trace(`Waiting for a frame to be rendered`);
					this._window.webContents.beginFrameSubscription(false, () => {
						try {
							this.trace(`A frame has been rendered`);
							this._window.webContents.endFrameSubscription();
						} catch {
							// ignore errors
						}
						resolve();
					});
				} catch {
					// ignore errors
					resolve();
				}
			}),
			WebPageLoader.FRAME_TIMEOUT
		);
	}

	/**
	 * Extracts the content of the loaded web page using the Accessibility domain and reports the result.
	 */
	private async extractContent(errorResult?: WebContentExtractResult & { status: 'error' }) {
		if (this._store.isDisposed) {
			return;
		}

		try {
			const title = this._window.webContents.getTitle();

			let result = await this.extractAccessibilityTreeContent() ?? '';
			if (result.length < WebPageLoader.MIN_CONTENT_LENGTH) {
				this.trace(`Accessibility tree extraction yielded insufficient content, trying main DOM element extraction`);
				const domContent = await this.extractMainDomElementContent() ?? '';
				result = domContent.length > result.length ? domContent : result;
			}

			if (result.length === 0) {
				this._onResult({ status: 'error', error: 'Failed to extract meaningful content from the web page' });
			} else if (errorResult !== undefined) {
				this._onResult({ ...errorResult, result, title });
			} else {
				this._onResult({ status: 'ok', result, title });
			}
		} catch (e) {
			if (errorResult !== undefined) {
				this._onResult(errorResult);
			} else {
				this._onResult({
					status: 'error',
					error: e instanceof Error ? e.message : String(e)
				});
			}
		}
	}

	/**
	 * Extracts content from the Accessibility tree of the loaded web page.
	 * @return The extracted content, or undefined if extraction fails.
	 */
	private async extractAccessibilityTreeContent(): Promise<string | undefined> {
		this.trace(`Extracting content using Accessibility domain`);
		try {
			const { nodes } = await this._debugger.sendCommand('Accessibility.getFullAXTree') as { nodes: AXNode[] };
			return convertAXTreeToMarkdown(this._uri, nodes);
		} catch (error) {
			this.trace(`Accessibility tree extraction failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	/**
	 * Fallback method for extracting web page content when Accessibility tree extraction yields insufficient content.
	 * Attempts to extract meaningful text content from the main DOM elements of the loaded web page.
	 * @returns The extracted text content, or undefined if extraction fails.
	 */
	private async extractMainDomElementContent(): Promise<string | undefined> {
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
		} catch (error) {
			this.trace(`DOM extraction failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}
}

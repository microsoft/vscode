/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { ConsoleMessage, Page, Request, Response } from 'playwright';
import zlib from 'zlib';
import { TestContext } from './context.js';

/** Marketplace gallery and CDN endpoints that the workbench calls to search for and install extensions. */
const galleryUrlPattern = /^https:\/\/[^/]*(\.vsassets\.io|marketplace\.visualstudio\.com)\//i;

/** Request headers that are not replayed by the Node-side gallery probe: credentials, HTTP/2 pseudo-headers and connection-level headers. */
const unreplayedHeaderPattern = /^(:|cookie$|authorization$|proxy-authorization$|host$|connection$|keep-alive$|transfer-encoding$|upgrade$|content-length$|accept-encoding$)/i;

/** Response headers that are not saved, since they can carry session credentials. */
const unsavedResponseHeaderPattern = /^set-cookie$/i;

function savedResponseHeaders(headers: Iterable<[string, string]>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [name, value] of headers) {
		if (!unsavedResponseHeaderPattern.test(name)) {
			result[name] = value;
		}
	}
	return result;
}

/**
 * Request headers that the browser leaves out of a preflight's `Access-Control-Request-Headers`:
 * forbidden and browser-controlled headers by name, and CORS-safelisted headers by name and value.
 */
const forbiddenRequestHeaderPattern = /^(:|accept-charset$|accept-encoding$|access-control-request-|connection$|content-length$|cookie2?$|date$|dnt$|expect$|host$|keep-alive$|origin$|referer$|te$|trailer$|transfer-encoding$|upgrade$|via$|proxy-|sec-|user-agent$)/i;
const corsSafelistedContentTypes = new Set(['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']);

function isCorsSafelistedOrForbiddenHeader(name: string, value: string): boolean {
	if (forbiddenRequestHeaderPattern.test(name)) {
		return true;
	}
	switch (name.toLowerCase()) {
		case 'accept':
		case 'accept-language':
		case 'content-language':
			return value.length <= 128;
		case 'content-type':
			return value.length <= 128 && corsSafelistedContentTypes.has(value.split(';')[0].trim().toLowerCase());
		default:
			return false;
	}
}

/** How many distinct failed gallery URLs are probed from Node per test. */
const maxGalleryProbes = 10;

/** How much of each replayed preflight response, headers and body, is saved. */
const maxPreflightResponseChars = 2048;

/** NetLogs larger than this are not uploaded. */
const maxNetLogBytes = 200 * 1024 * 1024;

/** A gallery request from the app under test that failed or returned an error status. */
interface GalleryRequestFailure {
	time: string;
	method: string;
	url: string;
	failure?: string;
	status?: number;
	responseHeaders?: Record<string, string>;
}

/** The same request repeated from the test's Node process when the app's request failed. */
interface GalleryProbe {
	startedAt: string;
	method: string;
	url: string;
	requestHeaders: Record<string, string>;
	durationMs?: number;
	status?: number;
	statusText?: string;
	responseHeaders?: Record<string, string>;
	bodyBytes?: number;
	error?: string;
	/** The CORS preflight that the app sends before this request, replayed directly and through the app's proxy. */
	preflights?: GalleryPreflightProbe[];
}

/** A CORS preflight (`OPTIONS`) for a failed gallery request, replayed with curl. */
interface GalleryPreflightProbe {
	/** `DIRECT`, or the proxy that the app resolved for the URL. */
	via: string;
	durationMs: number;
	status?: number;
	/** The start of the raw response, headers and body, without `set-cookie` lines. */
	response?: string;
	error?: string;
}

/**
 * UI Test helper class to perform common UI actions and verifications.
 */
export class UITest {
	private _extensionsDir: string | undefined;
	private _workspaceDir: string | undefined;
	private _userDataDir: string | undefined;
	private _netLogPath: string | undefined;

	/**
	 * Resolves the proxy that the app uses for a URL, in PAC format (such as `PROXY host:port` or
	 * `DIRECT`), so failed gallery preflights can also be replayed through it.
	 */
	public resolveProxy: ((url: string) => Promise<string>) | undefined;

	constructor(
		protected readonly context: TestContext,
		dataDir?: string
	) {
		if (dataDir) {
			this._extensionsDir = path.join(dataDir, 'extensions');
			this._userDataDir = path.join(dataDir, 'user-data');
		}
	}

	/**
	 * The directory where extensions are installed.
	 */
	public get extensionsDir(): string {
		return this._extensionsDir ??= this.context.createTempDir();
	}

	/**
	 * The workspace directory used for testing.
	 */
	public get workspaceDir(): string {
		return this._workspaceDir ??= this.context.createTempDir();
	}

	/**
	 * The user data directory used for testing.
	 */
	public get userDataDir(): string {
		return this._userDataDir ??= this.context.createTempDir();
	}

	/**
	 * Where the desktop app writes its Chromium NetLog when launched with `--log-net-log`.
	 */
	public get netLogPath(): string {
		return this._netLogPath ??= path.join(this.context.createTempDir(), 'netlog.json');
	}

	/**
	 * Run the UI test actions.
	 */
	public async run(page: Page) {
		try {
			await this.dismissWelcomeDialog(page);
			await this.createTextFile(page);
			await this.searchInWorkspace(page);
			await this.openMarkdownPreview(page);
			await this.installExtension(page);
		} catch (error) {
			await this.context.captureScreenshot(page);
			throw error;
		}
	}

	/**
	 * Copies the app's logs next to the screenshots. The reason for a product-side failure (such as
	 * an extension that fails to install) is only in those logs, in a user data dir that the test
	 * deletes afterwards. Call it after the app has closed, so its logs are complete.
	 */
	public captureAppLogs() {
		this.context.captureLogs(path.join(this.userDataDir, 'logs'));
		this.captureNetLog();
	}

	/**
	 * Uploads the gzipped NetLog, if the app was launched with one. It records the status and
	 * headers of requests that the renderer only reports as `Failed to fetch`.
	 */
	private captureNetLog() {
		if (!this._netLogPath) {
			return;
		}

		try {
			if (!fs.existsSync(this._netLogPath)) {
				this.context.warn(`No NetLog found at ${this._netLogPath}`);
				return;
			}
			const size = fs.statSync(this._netLogPath).size;
			if (size > maxNetLogBytes) {
				this.context.warn(`Not capturing the NetLog: ${size} bytes is over the ${maxNetLogBytes} byte limit`);
				return;
			}
			this.context.writeDiagnostics('netlog.json.gz', zlib.gzipSync(fs.readFileSync(this._netLogPath)));
		} catch (e) {
			this.context.warn(`Failed to capture the NetLog: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/**
	 * Validate the results of the UI test actions.
	 */
	public validate() {
		this.verifyTextFileCreated();
		this.verifyExtensionInstalled();
	}

	/**
	 * Dismiss the welcome sign-in dialog if it is shown.
	 */
	public async dismissWelcomeDialog(page: Page) {
		this.context.log('Dismissing welcome dialog (if shown)');
		const closeButton = page.locator('button.onboarding-a-close-btn');
		try {
			await closeButton.waitFor({ state: 'visible', timeout: 8_000 });
		} catch {
			this.context.log('Welcome dialog not shown, continuing');
			return;
		}
		await closeButton.click();
		await closeButton.waitFor({ state: 'hidden' });
	}

	/**
	 * Run a command from the command palette.
	 */
	private async runCommand(page: Page, command: string) {
		this.context.log(`Running command: ${command}`);
		await page.keyboard.press('F1');
		const input = page.getByPlaceholder(/^Type the name of a command/);
		await input.fill(`>${command}`);
		const item = page.locator('span.monaco-highlighted-label', { hasText: new RegExp(`^${command}$`) });
		await item.click();
		await input.waitFor({ state: 'hidden' });
	}

	/**
	 * Create a new text file in the editor with some content and save it.
	 */
	private async createTextFile(page: Page) {
		await this.createFile(page, 'helloWorld.txt', 'Hello, World!');
	}

	/**
	 * Create a new file in the workspace root from the Explorer, type its content and save it.
	 */
	private async createFile(page: Page, fileName: string, content: string) {
		await this.runCommand(page, 'View: Show Explorer');

		this.context.log('Clicking New File button');
		await page.getByLabel('New File...').click();

		this.context.log(`Typing file name ${fileName}`);
		await page.getByRole('textbox', { name: /^Type file name/ }).fill(fileName);
		await page.keyboard.press('Enter');

		this.context.log('Focusing the code editor');
		await page.getByText(/Start typing/).focus();

		this.context.log('Typing some content into the file');
		await page.keyboard.type(content, { delay: 100 });

		await this.runCommand(page, 'File: Save');
	}

	/**
	 * Open a Markdown preview and verify that its webview rendered. The preview content is
	 * rendered by scripts loaded as webview resources, so this catches webview resource
	 * loading regressions, such as remote authorities with uppercase letters (wsl+Ubuntu)
	 * being rejected with 401 (#341396).
	 */
	private async openMarkdownPreview(page: Page) {
		const failedResources: string[] = [];
		const diagnostics: string[] = [];
		const onResponse = (response: Response) => {
			if (response.status() >= 400 && response.url().includes('.vscode-resource.')) {
				this.context.log(`Webview resource failed with ${response.status()}: ${response.url()}`);
				failedResources.push(`${response.status()} ${response.url()}`);
			}
		};
		const onRequestFailed = (request: Request) => {
			if (/\.vscode-resource\.|vscode-cdn\.net/.test(request.url())) {
				const message = `Webview request failed with ${request.failure()?.errorText}: ${request.url()}`;
				this.context.log(message);
				diagnostics.push(message);
			}
		};
		const onConsole = (message: ConsoleMessage) => {
			if (message.type() === 'error') {
				diagnostics.push(`Console error: ${message.text()}`);
			}
		};

		page.on('response', onResponse);
		page.on('requestfailed', onRequestFailed);
		page.on('console', onConsole);
		try {
			await this.createFile(page, 'preview.md', '# Webview Sanity');
			await this.runCommand(page, 'Markdown: Open Preview');

			this.context.log('Waiting for the Markdown preview to render');
			const preview = page
				.frameLocator('iframe.webview.ready[src*="extensionId=vscode.markdown-language-features"]')
				.frameLocator('#active-frame');
			try {
				await preview.getByRole('heading', { name: 'Webview Sanity' }).waitFor({ timeout: 60_000 });

				// The heading can appear before asynchronous preview scripts finish loading.
				const previewElement = await preview.owner().elementHandle();
				assert.ok(previewElement, 'Markdown preview frame is missing');
				try {
					const frame = await previewElement.contentFrame();
					assert.ok(frame, 'Markdown preview frame is detached');
					await frame.waitForLoadState('load', { timeout: 60_000 });
				} finally {
					await previewElement.dispose();
				}
			} catch (error) {
				// Some browsers, such as Chromium on Debian 12, refuse to register the webview service worker,
				// so no webview can load there at all. That is a property of the browser, not a resource loading failure.
				if (failedResources.length === 0 && diagnostics.some(message => message.includes('NotSupportedError: Failed to register a ServiceWorker'))) {
					this.context.warn('Skipping the Markdown preview check: this browser does not allow webviews to register their service worker');
					await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
					return;
				}

				throw new Error([
					'Markdown preview did not render.',
					`Failed webview resources: ${failedResources.join(', ') || 'none observed'}`,
					...diagnostics.slice(0, 20),
				].join('\n'), { cause: error });
			}

			// Keyboard focus is now inside the preview webview; return it to the workbench before later steps press F1.
			this.context.log('Returning focus to the workbench');
			await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		} finally {
			page.off('response', onResponse);
			page.off('requestfailed', onRequestFailed);
			page.off('console', onConsole);
		}

		assert.deepStrictEqual(failedResources, [], 'Markdown preview failed to load some webview resources');
	}

	/**
	 * Verify that the text file was created with the expected content.
	 */
	protected verifyTextFileCreated() {
		this.context.log('Verifying file contents');
		const filePath = `${this.workspaceDir}/helloWorld.txt`;
		const fileContents = fs.readFileSync(filePath, 'utf-8');
		assert.strictEqual(fileContents, 'Hello, World!', 'File contents do not match expected value');
	}

	/**
	 * Run a workspace search (Search: Find in Files) and verify ripgrep returns
	 * the expected match from the file created in {@link createTextFile}.
	 */
	private async searchInWorkspace(page: Page) {
		await this.runCommand(page, 'Search: Find in Files');

		this.context.log('Typing search query');
		const searchInput = page.locator('.search-view .search-widget .search-container textarea').first();
		await searchInput.waitFor({ state: 'visible' });
		await searchInput.fill('Hello, World!');
		await page.keyboard.press('Enter');

		this.context.log('Waiting for search result text');
		const resultMessage = page.locator('.search-view .messages .message').first();
		await resultMessage.waitFor({ state: 'visible' });
		await page.waitForFunction(() => {
			const el = document.querySelector('.search-view .messages .message');
			return el && /\d+\s+result/.test(el.textContent ?? '');
		}, undefined, { timeout: 30_000 });

		const resultText = (await resultMessage.innerText()).trim();
		this.context.log(`Search result text: ${resultText}`);

		await this.context.captureScreenshot(page);

		assert.match(
			resultText,
			/1 result in 1 file/,
			`Expected exactly 1 search result for "Hello, World!", but got: ${resultText}`,
		);
	}

	/**
	 * Install GitHub Pull Requests extension from the Extensions view. If that fails, saves the
	 * app's failed gallery requests and a Node-side replay of each of them, which tells a
	 * Marketplace or CDN response apart from a failure in the app's own request.
	 */
	private async installExtension(page: Page) {
		const gallery = this.monitorGalleryRequests(page);
		try {
			await this.installExtensionFromGallery(page);
		} catch (error) {
			await gallery.save();
			throw error;
		} finally {
			gallery.dispose();
		}
	}

	/**
	 * Records the app's gallery requests that fail or return an error status, and replays each
	 * failed URL once from Node as soon as it fails, with the app's request headers.
	 */
	private monitorGalleryRequests(page: Page) {
		const failures: GalleryRequestFailure[] = [];
		const probes = new Map<string, Promise<GalleryProbe>>();
		const headerReads: Promise<void>[] = [];
		const probe = (request: Request) => {
			const key = `${request.method()} ${request.url()}`;
			if (!probes.has(key) && probes.size < maxGalleryProbes) {
				probes.set(key, this.probeGalleryRequest(request, page));
			}
		};
		const onRequestFailed = (request: Request) => {
			if (galleryUrlPattern.test(request.url())) {
				const failure = request.failure()?.errorText;
				this.context.log(`Gallery request failed with ${failure}: ${request.method()} ${request.url()}`);
				failures.push({ time: new Date().toISOString(), method: request.method(), url: request.url(), failure });
				probe(request);
			}
		};
		const onResponse = (response: Response) => {
			if (response.status() >= 400 && galleryUrlPattern.test(response.url())) {
				const request = response.request();
				this.context.log(`Gallery request returned ${response.status()}: ${request.method()} ${response.url()}`);
				const failure: GalleryRequestFailure = { time: new Date().toISOString(), method: request.method(), url: response.url(), status: response.status() };
				failures.push(failure);
				headerReads.push(response.allHeaders().then(headers => { failure.responseHeaders = savedResponseHeaders(Object.entries(headers)); }, () => { }));
				probe(request);
			}
		};

		page.on('requestfailed', onRequestFailed);
		page.on('response', onResponse);
		const dispose = () => {
			page.off('requestfailed', onRequestFailed);
			page.off('response', onResponse);
		};
		return {
			save: async () => {
				// Stop recording first, so the saved failures match the replays and their headers are complete.
				dispose();
				await Promise.all(headerReads);
				const replays = await Promise.all(probes.values());
				this.context.writeDiagnostics('gallery.json', JSON.stringify({ failures, probes: replays }, undefined, '\t'));
			},
			dispose,
		};
	}

	/**
	 * Repeats a gallery request from Node and records the response status and headers. The app's
	 * request also needs a CORS preflight, which can fail on its own, so that is replayed as well.
	 */
	private async probeGalleryRequest(request: Request, page: Page): Promise<GalleryProbe> {
		const [result, preflights] = await Promise.all([
			this.replayGalleryRequest(request),
			this.replayGalleryPreflight(request, page),
		]);
		result.preflights = preflights;
		return result;
	}

	private async replayGalleryRequest(request: Request): Promise<GalleryProbe> {
		const requestHeaders: Record<string, string> = {};
		for (const [name, value] of Object.entries(await request.allHeaders().catch(() => request.headers()))) {
			if (!unreplayedHeaderPattern.test(name)) {
				requestHeaders[name] = value;
			}
		}
		const result: GalleryProbe = { startedAt: new Date().toISOString(), method: request.method(), url: request.url(), requestHeaders };
		const start = Date.now();
		try {
			const response = await fetch(request.url(), {
				method: request.method(),
				headers: requestHeaders,
				body: request.method() === 'GET' || request.method() === 'HEAD' ? undefined : request.postDataBuffer() ?? undefined,
				signal: AbortSignal.timeout(30_000),
			});
			result.status = response.status;
			result.statusText = response.statusText;
			result.responseHeaders = savedResponseHeaders(response.headers.entries());
			result.bodyBytes = (await response.arrayBuffer()).byteLength;
		} catch (error) {
			const cause = error instanceof Error && error.cause instanceof Error ? ` (cause: ${error.cause.message})` : '';
			result.error = `${error instanceof Error ? error.message : String(error)}${cause}`;
		}
		result.durationMs = Date.now() - start;
		this.context.log(`Gallery probe from Node: ${result.method} ${result.url} -> ${result.status ?? result.error} in ${result.durationMs}ms`);
		return result;
	}

	/**
	 * Sends the CORS preflight that the app sends for a cross-origin request with custom headers,
	 * directly and, if the app uses one for this URL, through the app's proxy.
	 */
	private async replayGalleryPreflight(request: Request, page: Page): Promise<GalleryPreflightProbe[]> {
		const pageUrl = new URL(page.url());
		const headers = await request.allHeaders().catch(() => request.headers());
		const requestHeaderNames = Object.entries(headers)
			.filter(([name, value]) => !isCorsSafelistedOrForbiddenHeader(name, value))
			.map(([name]) => name.toLowerCase())
			.sort();
		if (requestHeaderNames.length === 0) {
			return [];
		}

		// After a cross-origin redirect (gallery to gallerycdn) Fetch sends `Origin: null`, so prefer the request's own value.
		const origin = headers.origin ?? `${pageUrl.protocol}//${pageUrl.host}`;
		const args = [
			'-sS', '-i', '--max-time', '30', '-X', 'OPTIONS',
			'-H', `Origin: ${origin}`,
			'-H', `Access-Control-Request-Method: ${request.method()}`,
			'-H', `Access-Control-Request-Headers: ${requestHeaderNames.join(',')}`,
		];
		if (headers['user-agent']) {
			args.push('-H', `User-Agent: ${headers['user-agent']}`);
		}

		const routes = [{ via: 'DIRECT', proxyArgs: ['--noproxy', '*'] }];
		try {
			const proxy = /^(PROXY|HTTPS)\s+([^\s;]+)/i.exec(await this.resolveProxy?.(request.url()) ?? '');
			if (proxy) {
				const proxyUrl = `${proxy[1].toUpperCase() === 'HTTPS' ? 'https' : 'http'}://${proxy[2]}`;
				routes.push({ via: proxyUrl, proxyArgs: ['--proxy', proxyUrl] });
			}
		} catch (error) {
			this.context.warn(`Failed to resolve the app's proxy for ${request.url()}: ${error instanceof Error ? error.message : String(error)}`);
		}

		return Promise.all(routes.map(async ({ via, proxyArgs }) => {
			const start = Date.now();
			const result = await new Promise<Omit<GalleryPreflightProbe, 'via' | 'durationMs'>>(resolve => {
				execFile('curl', [...args, ...proxyArgs, request.url()], { timeout: 40_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
					const response = stdout
						.split(/\r?\n/)
						.filter(line => !/^set-cookie:/i.test(line))
						.join('\n')
						.slice(0, maxPreflightResponseChars);
					// Through a proxy, curl prints the CONNECT response first, so use the last status line.
					const statuses = [...response.matchAll(/^HTTP\/[\d.]+ (\d{3})/gm)];
					const status = statuses.length ? Number(statuses[statuses.length - 1][1]) : undefined;
					resolve({ status, response: response || undefined, error: error ? `${error.message}${stderr ? `: ${stderr.trim()}` : ''}` : undefined });
				});
			});
			const probe: GalleryPreflightProbe = { via, durationMs: Date.now() - start, ...result };
			this.context.log(`Gallery preflight replay (${via}): OPTIONS ${request.url()} -> ${probe.status ?? probe.error} in ${probe.durationMs}ms`);
			return probe;
		}));
	}

	/**
	 * Install GitHub Pull Requests extension from the Extensions view.
	 */
	private async installExtensionFromGallery(page: Page) {
		await this.runCommand(page, 'View: Show Extensions');

		this.context.log('Typing extension name to search for');
		await page.getByText('Search Extensions in Marketplace').focus();
		await page.keyboard.type('GitHub Pull Requests', { delay: 50 });

		this.context.log('Waiting for extension to appear in search results');
		const extensionListItem = page.locator('.extension-list-item').filter({ has: page.getByText(/^GitHub Pull Requests$/) }).first();
		const extensionItem = extensionListItem.getByText(/^GitHub Pull Requests$/);
		const messageContainer = page.locator('.extensions-viewlet .message-container:not(.hidden)').first();

		for (let attempt = 0; attempt < 5; attempt++) {
			const result = await Promise.race([
				extensionItem.waitFor().then(() => 'found' as const),
				messageContainer.waitFor().then(() => 'message' as const),
			]);

			if (result === 'found') {
				break;
			}

			const message = await messageContainer.locator('.message').innerText();
			this.context.log(`Marketplace message: ${message} (attempt ${attempt + 1}/5), clicking Refresh`);
			await page.getByRole('button', { name: 'Refresh' }).click();
			await page.waitForTimeout(5_000);
		}

		await extensionItem.waitFor();

		// Leave time for cleanup before Mocha's 10-minute timeout, which does not cancel async work.
		let lastFailure: string | undefined;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				this.context.log(`Clicking Install for GitHub Pull Requests (attempt ${attempt + 1}/3)`);
				const installButton = extensionListItem.locator('.extension-action.install:not(.disabled):not(.hide)').first();
				await installButton.click({ timeout: 30_000 });
				await installButton.waitFor({ state: 'hidden', timeout: 30_000 });

				this.context.log('Waiting for extension to be installed');
				const uninstallButton = page.getByRole('button', { name: 'Uninstall' }).first();
				const result = await Promise.race([
					uninstallButton.waitFor({ timeout: 60_000 }).then(() => 'installed' as const),
					installButton.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'retry' as const),
					messageContainer.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'message' as const),
				]);
				if (result === 'installed') {
					return;
				}
				lastFailure = result === 'retry'
					? 'Install button became available again before installation completed'
					: 'Marketplace error appeared before installation completed';
			} catch (error) {
				lastFailure = error instanceof Error ? error.message : String(error);
			}

			this.context.log(`Extension install attempt ${attempt + 1}/3 failed: ${lastFailure}`);

			const messageVisible = await messageContainer.isVisible().catch(() => false);
			if (messageVisible) {
				const message = await messageContainer.locator('.message').innerText().catch(() => '<unavailable>');
				this.context.log(`Marketplace message visible during failed install: ${message}`);
			}

			await this.context.captureScreenshot(page);

			if (attempt < 2) {
				this.context.log('Waiting 5s before retrying install');
				await page.waitForTimeout(5_000);
			}
		}

		throw new Error(`Failed to install extension after 3 attempts; last failure: ${lastFailure ?? '<none captured>'}`);
	}

	/**
	 * Verify that the GitHub Pull Requests extension is installed.
	 */
	protected verifyExtensionInstalled() {
		this.context.log('Verifying extension is installed');
		const extensions = fs.readdirSync(this.extensionsDir);
		const hasExtension = extensions.some(ext => ext.startsWith('github.vscode-pull-request-github'));
		assert.strictEqual(hasExtension, true, 'GitHub Pull Requests extension is not installed');
	}
}

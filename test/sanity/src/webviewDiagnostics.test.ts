/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { after, before, describe, it } from 'mocha';
import { performance } from 'perf_hooks';
import { chromium, type Browser } from 'playwright';
import { WebviewDiagnostics } from './webviewDiagnostics.js';

const bootstrap = 'https://test.vscode-cdn.net/insider/test-commit/out/vs/workbench/contrib/webview/browser/pre/index.html';
const worker = bootstrap.replace('index.html', 'service-worker.js');
const resource = 'https://file.vscode-resource.vscode-cdn.net/preview.js';

describe('Webview sanity diagnostics', function () {
	this.timeout(30_000);
	let browser: Browser;

	before(async () => {
		browser = await chromium.launch({
			headless: true,
			channel: process.platform === 'win32' ? 'msedge' : undefined,
		});
	});

	after(async () => {
		await browser?.close();
	});

	for (const scenario of [
		{ name: 'missing bootstrap', url: bootstrap, status: 404 },
		{ name: 'unavailable service worker', url: worker, status: 503 },
		{ name: 'denied preview resource', url: resource, status: 401 },
		{ name: 'failed bootstrap connection', url: bootstrap, status: 0 },
	]) {
		it(`fails promptly for ${scenario.name}, with actionable diagnostics`, async () => {
			const page = await browser.newPage();
			const logs: string[] = [];
			const monitor = new WebviewDiagnostics(page, message => logs.push(message));
			try {
				await page.route('https://**/*', route => scenario.status
					? route.fulfill({ status: scenario.status, contentType: 'text/html', body: 'WebContentNotFound' })
					: route.abort('failed'));
				const start = performance.now();
				const outcome = assert.rejects(
					monitor.waitFor(page.getByRole('heading', { name: 'Webview Sanity' }).waitFor({ timeout: 60_000 })),
					error => error instanceof Error && error.message.includes(scenario.url)
				);
				await page.setContent(`<iframe src="${scenario.url}?token=secret#private"></iframe>`);
				await outcome;
				assert.ok(performance.now() - start < 10_000, 'Must fail before the 60-second render timeout');
				const message = monitor.formatFailure();
				assert.deepStrictEqual({
					status: scenario.status ? message.includes(`HTTP ${scenario.status}`) : message.includes('net::ERR_FAILED'),
					url: message.includes(scenario.url),
					guidance: message.includes('Web stage'),
					frames: message.includes('Frames:'),
					leakedUrlCredentials: /token=secret|#private/.test(message + logs.join('\n')),
					failures: monitor.failedResources.length,
				}, { status: true, url: true, guidance: true, frames: true, leakedUrlCredentials: false, failures: 1 });
			} finally {
				monitor.dispose();
				await page.close();
			}
		});
	}

	it('preserves successful nested-frame rendering and ignores unrelated HTTP failures', async () => {
		const page = await browser.newPage();
		const monitor = new WebviewDiagnostics(page, () => { });
		try {
			await page.route('https://**/*', route => route.fulfill({
				status: route.request().url().includes('favicon.ico') ? 404 : 200,
				contentType: 'text/html',
				body: '<iframe id="active-frame" srcdoc="<h1>Webview Sanity</h1>"></iframe>',
			}));
			await page.setContent(`<iframe class="webview ready" src="${bootstrap}?extensionId=vscode.markdown-language-features"></iframe><img src="https://test.vscode-cdn.net/favicon.ico">`);
			const preview = page.frameLocator('iframe.webview.ready[src*="extensionId=vscode.markdown-language-features"]').frameLocator('#active-frame');
			await monitor.waitFor(preview.getByRole('heading', { name: 'Webview Sanity' }).waitFor());
			assert.deepStrictEqual(monitor.failedResources, []);
		} finally {
			monitor.dispose();
			await page.close();
		}
	});

	it('retains a failure observed before the render wait begins', async () => {
		const page = await browser.newPage();
		const monitor = new WebviewDiagnostics(page, () => { });
		try {
			await page.route('https://**/*', route => route.fulfill({ status: 404, body: 'WebContentNotFound' }));
			await page.setContent(`<iframe src="${bootstrap}"></iframe>`);
			await assert.rejects(monitor.waitFor(new Promise<void>(() => { })), /HTTP 404/);
		} finally {
			monitor.dispose();
			await page.close();
		}
	});

	it('detects a delayed script failure after the preview heading appears', async () => {
		const page = await browser.newPage();
		const monitor = new WebviewDiagnostics(page, () => { });
		const releaseScript = Promise.withResolvers<void>();
		try {
			await page.route(resource, async route => {
				await releaseScript.promise;
				await route.fulfill({ status: 401, body: 'Unauthorized' });
			});
			await page.setContent(`<h1>Webview Sanity</h1><script async src="${resource}"></script>`, { waitUntil: 'domcontentloaded' });
			await monitor.waitFor(page.getByRole('heading', { name: 'Webview Sanity' }).waitFor());
			const outcome = assert.rejects(monitor.waitFor(page.waitForLoadState('load')), /HTTP 401/);
			releaseScript.resolve();
			await outcome;
			assert.deepStrictEqual(monitor.failedResources, [`HTTP 401 ${resource}`]);
		} finally {
			releaseScript.resolve();
			monitor.dispose();
			await page.close();
		}
	});

	it('captures JavaScript errors for render-timeout diagnosis', async () => {
		const page = await browser.newPage();
		const monitor = new WebviewDiagnostics(page, () => { });
		try {
			const pageError = page.waitForEvent('pageerror');
			await page.setContent('<script>console.error("preview console error"); throw new Error("preview activation failed");</script>');
			await pageError;
			assert.deepStrictEqual(monitor.diagnostics, [
				'Console error: preview console error',
				'Page error: preview activation failed',
			]);
		} finally {
			monitor.dispose();
			await page.close();
		}
	});

	it('stops collecting failures after disposal', async () => {
		const page = await browser.newPage();
		const monitor = new WebviewDiagnostics(page, () => { });
		monitor.dispose();
		try {
			await page.route('https://**/*', route => route.fulfill({ status: 404, body: 'WebContentNotFound' }));
			const pageError = page.waitForEvent('pageerror');
			await page.setContent(`<iframe src="${bootstrap}"></iframe><script>console.error("ignored"); throw new Error("ignored");</script>`);
			await pageError;
			assert.deepStrictEqual([monitor.failedResources, monitor.diagnostics], [[], []]);
		} finally {
			await page.close();
		}
	});
});

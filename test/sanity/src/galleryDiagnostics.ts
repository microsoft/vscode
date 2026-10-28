/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import fetch from 'node-fetch';
import { Page, Request, Response } from 'playwright';
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
 * Records the app's Marketplace gallery requests that fail or return an error status, and replays each
 * failed URL once from Node as soon as it fails: the request itself with the app's headers, and the CORS
 * preflight the app sends first, directly and through the app's proxy. Together they tell a Marketplace,
 * CDN or proxy response apart from a failure in the app's own request.
 */
export class GalleryRequestMonitor {
	private readonly failures: GalleryRequestFailure[] = [];
	private readonly probes = new Map<string, Promise<GalleryProbe>>();
	private readonly headerReads: Promise<void>[] = [];

	/**
	 * @param resolveProxy Resolves the proxy that the app uses for a URL, in PAC format (such as
	 * `PROXY host:port` or `DIRECT`), so failed preflights are also replayed through it.
	 */
	constructor(
		private readonly context: TestContext,
		private readonly page: Page,
		private readonly resolveProxy?: (url: string) => Promise<string>,
	) {
		page.on('requestfailed', this.onRequestFailed);
		page.on('response', this.onResponse);
	}

	/**
	 * Stops recording and writes `<test>-gallery.json` once every replay has finished.
	 */
	public async save() {
		// Stop recording first, so the saved failures match the replays and their headers are complete.
		this.dispose();
		await Promise.all(this.headerReads);
		const replays = await Promise.all(this.probes.values());
		this.context.writeDiagnostics('gallery.json', JSON.stringify({ failures: this.failures, probes: replays }, undefined, '\t'));
	}

	public dispose() {
		this.page.off('requestfailed', this.onRequestFailed);
		this.page.off('response', this.onResponse);
	}

	private readonly onRequestFailed = (request: Request) => {
		if (galleryUrlPattern.test(request.url())) {
			const failure = request.failure()?.errorText;
			this.context.log(`Gallery request failed with ${failure}: ${request.method()} ${request.url()}`);
			this.failures.push({ time: new Date().toISOString(), method: request.method(), url: request.url(), failure });
			this.probe(request);
		}
	};

	private readonly onResponse = (response: Response) => {
		if (response.status() >= 400 && galleryUrlPattern.test(response.url())) {
			const request = response.request();
			this.context.log(`Gallery request returned ${response.status()}: ${request.method()} ${response.url()}`);
			const failure: GalleryRequestFailure = { time: new Date().toISOString(), method: request.method(), url: response.url(), status: response.status() };
			this.failures.push(failure);
			this.headerReads.push(response.allHeaders().then(headers => { failure.responseHeaders = savedResponseHeaders(Object.entries(headers)); }, () => { }));
			this.probe(request);
		}
	};

	private probe(request: Request) {
		const key = `${request.method()} ${request.url()}`;
		if (!this.probes.has(key) && this.probes.size < maxGalleryProbes) {
			this.probes.set(key, this.probeRequest(request));
		}
	}

	private async probeRequest(request: Request): Promise<GalleryProbe> {
		const [result, preflights] = await Promise.all([
			this.replayRequest(request),
			this.replayPreflight(request),
		]);
		result.preflights = preflights;
		return result;
	}


	/**
	 * Repeats a gallery request from Node and records the response status and headers.
	 */
	private async replayRequest(request: Request): Promise<GalleryProbe> {
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
	private async replayPreflight(request: Request): Promise<GalleryPreflightProbe[]> {
		const pageUrl = new URL(this.page.url());
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
}

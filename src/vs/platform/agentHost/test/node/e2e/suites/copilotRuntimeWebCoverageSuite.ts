/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync } from 'fs';
import type * as http from 'http';
import { createRequire } from 'module';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { ResourceReadResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, driveTurnToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof http;
const articleProse = 'This synthetic article describes a local fixture used to verify extraction of useful documentation. It contains several sentences, with enough ordinary prose for the reader to retain the article rather than the surrounding navigation. Nothing on this page requires another network request.';
const fetchByteLimit = 10 * 1024 * 1024;

interface IWebResponse {
	readonly body?: string | Buffer;
	readonly contentType?: string;
	readonly status?: number;
	readonly location?: string;
}

interface IWebRequest {
	readonly method: string | undefined;
	readonly path: string;
	readonly accept: string | undefined;
	readonly userAgent: string | undefined;
}

interface IWebFetchOptions {
	readonly raw?: boolean;
	readonly max_length?: number;
	readonly start_index?: number;
}

interface IWebFetchResult {
	readonly success: boolean;
	readonly text: string;
	readonly body: string;
}

interface IWebScenario {
	readonly server: RuntimeWebFixtureServer;
	fetch(path: string, options?: IWebFetchOptions): Promise<IWebFetchResult>;
}

class RuntimeWebFixtureServer extends Disposable {
	readonly requests: IWebRequest[] = [];
	private readonly server: http.Server;
	private readonly closed: Promise<void>;
	private baseUrl = '';

	constructor(routes: Readonly<Record<string, IWebResponse>>) {
		super();
		this.server = httpModule.createServer((request, response) => {
			const path = request.url ?? '/';
			this.requests.push({
				method: request.method,
				path,
				accept: request.headers.accept,
				userAgent: request.headers['user-agent'],
			});
			const route = routes[path];
			response.statusCode = route?.status ?? (route ? 200 : 404);
			if (route?.contentType) {
				response.setHeader('Content-Type', route.contentType);
			}
			if (route?.location !== undefined) {
				response.setHeader('Location', route.location);
			}
			response.end(route?.body ?? '');
		});
		this.closed = new Promise<void>(resolve => {
			this._register(toDisposable(() => {
				this.server.close(() => resolve());
				this.server.closeAllConnections();
			}));
		});
	}

	get url(): string {
		assert.ok(this.baseUrl, 'The local fixture server must be listening before its URL is used');
		return this.baseUrl;
	}

	async start(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				this.server.off('listening', onListening);
				reject(error);
			};
			const onListening = () => {
				this.server.off('error', onError);
				resolve();
			};
			this.server.once('error', onError);
			this.server.once('listening', onListening);
			this.server.listen(0, '127.0.0.1');
		});
		const address = this.server.address();
		assert.ok(address && typeof address !== 'string');
		this.baseUrl = `http://127.0.0.1:${address.port}`;
	}

	async whenClosed(): Promise<void> {
		await this.closed;
	}
}

function article(content: string, chrome = ''): string {
	return `<!doctype html><html><head><title>Local documentation</title></head><body>${chrome}<article><p>${articleProse}</p>${content}<p>${articleProse}</p></article></body></html>`;
}

function assertFetched(result: IWebFetchResult, expected: readonly RegExp[], absent: readonly string[] = []): void {
	assert.deepStrictEqual({
		success: result.success,
		matches: expected.map(pattern => pattern.test(result.text)),
		absent: absent.map(marker => !result.text.includes(marker) && !result.text.includes(marker.replaceAll('_', '\\_'))),
	}, {
		success: true,
		matches: expected.map(() => true),
		absent: absent.map(() => true),
	}, result.text);
}

function assertFailed(result: IWebFetchResult, expected: RegExp): void {
	assert.deepStrictEqual({ success: result.success, matches: expected.test(result.text) }, { success: false, matches: true }, result.text);
}

export function defineCopilotRuntimeWebCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	suite('Copilot runtime web coverage', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineWebTests(context);
	});
}

function defineWebTests(context: IAgentHostE2ETestContext): void {
	function webTest(title: string, routes: Readonly<Record<string, IWebResponse>>, run: (scenario: IWebScenario) => Promise<void>, allowLocalhost = true, readSpilledOutput = false): void {
		const fullTitle = `runtime coverage web: ${title}`;
		const outputWorkspace = readSpilledOutput ? join(process.cwd(), '.build', 'ahp-runtime-web-output') : undefined;
		const environment: Record<string, string> = { COPILOT_WEB_FETCH_ALLOW_LOCALHOST: allowLocalhost ? '1' : '0' };
		if (outputWorkspace) {
			environment.TMPDIR = outputWorkspace;
			environment.TEMP = outputWorkspace;
			environment.TMP = outputWorkspace;
		}
		context.registerTestEnvironment(fullTitle, environment);
		test(fullTitle, async function () {
			this.timeout(240_000);
			const store = new DisposableStore();
			const server = store.add(new RuntimeWebFixtureServer(routes));
			try {
				await server.start();
				store.add(context.registerFixtureUrl('web', server.url));
				const workspaceParent = join(process.cwd(), '.build');
				mkdirSync(workspaceParent, { recursive: true });
				const workspace = outputWorkspace ?? mkdtempSync(join(workspaceParent, 'ahp-runtime-web-'));
				mkdirSync(workspace, { recursive: true });
				context.tempDirs.push(workspace);
				const sessionUri = await createRealSession(context.client, context.config, 'runtime-web-client', context.createdSessions, URI.file(workspace));
				const channel = buildDefaultChatUri(sessionUri);
				let ordinal = 0;
				await run({
					server,
					fetch: async (path, options = {}) => {
						ordinal++;
						const turnId = `web-fetch-${ordinal}`;
						const input = { url: `${server.url}${path}`, ...options };
						await driveTurnToCompletion(context.client, sessionUri, turnId,
							`Call web_fetch exactly once with this exact JSON input: ${JSON.stringify(input)}. Do not use any other tools, retry, or follow links. If the tool fails, do not use a fallback. Then reply exactly WEB_CHECKED.`,
							ordinal * 100);
						const starts = context.client.receivedNotifications(notification =>
							isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === channel)
							.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
							.filter(action => action.turnId === turnId);
						assert.deepStrictEqual(starts.map(action => action.toolName), ['web_fetch']);
						const completions = context.client.receivedNotifications(notification =>
							isActionNotification(notification, ActionType.ChatToolCallComplete) && getActionEnvelope(notification).channel === channel)
							.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction)
							.filter(action => action.turnId === turnId && action.toolCallId === starts[0].toolCallId);
						assert.strictEqual(completions.length, 1);
						const completion = completions[0];
						let text = textFromContent(completion.result.content ?? []);
						if (readSpilledOutput && text.startsWith('Output too large to read at once')) {
							const path = /Saved to: (?<path>[^\r\n]+)/.exec(text)?.groups?.path;
							assert.ok(path, text);
							const resource = URI.file(path);
							assert.ok(isEqualOrParent(resource, URI.file(workspace)), 'Spilled web output must remain in its controlled fixture workspace');
							const result = await context.client.call<ResourceReadResult>('resourceRead', {
								channel: ROOT_STATE_URI,
								uri: resource.toString(),
								encoding: ContentEncoding.Base64,
							});
							assert.strictEqual(result.encoding, ContentEncoding.Base64);
							text = Buffer.from(result.data, 'base64').toString('utf8');
						}
						const body = /Contents of [^\n]*:\n(?<body>[\s\S]*)$/.exec(text)?.groups?.body ?? text;
						return { success: completion.result.success, text, body };
					},
				});
				assert.deepStrictEqual(server.requests.map(request => ({
					method: request.method,
					userAgent: request.userAgent,
				})), server.requests.map(() => ({
					method: 'GET',
					userAgent: 'GitHubCopilotRuntime-WebFetch',
				})));
			} finally {
				store.dispose();
				await server.whenClosed();
			}
		});
	}

	webTest('article extraction preserves headings emphasis entities and Unicode', {
		'/article': {
			contentType: 'text/html; charset=utf-8',
			body: article('<H1 data-label="a > b">ARTICLE_HEADING café</H1><h2>ARTICLE_SECTION</h2><p><strong>BOLD_MARKER</strong> and <em>ITALIC_MARKER</em>, escaped &amp; decoded &lt;entity&gt;, 中文 and 🙂.</p>'),
		},
	}, async ({ server, fetch }) => {
		const result = await fetch('/article');
		assertFetched(result, [/# ARTICLE\\_HEADING café/, /## ARTICLE\\_SECTION/, /\*\*BOLD\\_MARKER\*\*/, /_ITALIC\\_MARKER_/, /escaped & decoded.*entity/, /中文 and 🙂/], ['<H1', '<strong>', '&amp;', '&lt;']);
		assert.deepStrictEqual(server.requests.map(request => ({ path: request.path, accept: request.accept })), [
			{ path: '/article', accept: 'text/markdown, text/html, */*' },
		]);
	});

	webTest('streaming HTML hidden article fallback preserves lists and fenced code', {
		'/hidden': {
			contentType: 'text/html',
			body: `<!doctype html><html><body><div>Loading...</div><div hidden id="streamed"><article><h1>HIDDEN_ARTICLE</h1><p>${articleProse}</p><ul><li>LIST_FIRST explains the first item in this useful documentation.<li>LIST_SECOND explains another item in this useful documentation.</ul><ol><li>ORDERED_FIRST describes the first installation step.</li><li>ORDERED_SECOND describes the final installation step.</li></ol><pre><code class="language-rust">fn fixture() { println!("héllo"); }</code></pre><p>${articleProse}</p></article></div><script>/* SYNTHETIC_STREAM_SCRIPT */</script></body></html>`,
		},
	}, async ({ server, fetch }) => {
		const result = await fetch('/hidden');
		assertFetched(result, [/# HIDDEN\\_ARTICLE/, /^\* +LIST\\_FIRST/m, /^\* +LIST\\_SECOND/m, /^1\. +ORDERED\\_FIRST/m, /^2\. +ORDERED\\_SECOND/m, /```[\s\S]*fn fixture\(\) \{ println!\("héllo"\); \}[\s\S]*```/], ['SYNTHETIC_STREAM_SCRIPT']);
		assert.deepStrictEqual(server.requests.map(request => request.path), ['/hidden']);
	});

	webTest('malformed tables links images and quotations produce structured Markdown', {
		'/structure': {
			contentType: 'text/html',
			body: article('<h1>STRUCTURED_ARTICLE</h1><table><tr><th>Column<th>Value<tr><td>ROW_ALPHA records the first synthetic entry.<td>βeta records the corresponding synthetic value.</table><p><a href="/unrequested-link">LOCAL_LINK</a> and <img src="/unrequested-image" alt="IMAGE_DESCRIPTION"></p><blockquote><p>QUOTATION_MARKER gives useful explanation of the table.</p></blockquote>'),
		},
	}, async ({ server, fetch }) => {
		const result = await fetch('/structure');
		assertFetched(result, [/\|[^\n]*Column[^\n]*Value[^\n]*\|/, /\|[^\n]*ROW\\_ALPHA[^\n]*βeta[^\n]*\|/, /\[LOCAL\\_LINK\]\(\/unrequested-link\)/, /!\[IMAGE_DESCRIPTION\]\(\/unrequested-image\)/, />[^\n]*QUOTATION\\_MARKER/], ['<table', '<blockquote']);
		assert.deepStrictEqual(server.requests.map(request => request.path), ['/structure']);
	});

	webTest('article extraction removes scripts styles comments and navigation chrome', {
		'/sanitize': {
			contentType: 'text/html',
			body: article('<h1>RETAINED_ARTICLE</h1><!-- COMMENT_NOT_CONTENT --><script>const html = "<h1>SCRIPT_NOT_CONTENT</h1>";</script><style>.test::after { content: "<h1>STYLE_NOT_CONTENT</h1>"; }</style><p>RETAINED_PARAGRAPH is a useful sentence in this synthetic article.</p>',
				'<header><h1>HEADER_NOT_CONTENT</h1></header><nav><a href="/unrequested-navigation">NAV_NOT_CONTENT</a></nav><footer>FOOTER_NOT_CONTENT</footer>'),
		},
	}, async ({ server, fetch }) => {
		const result = await fetch('/sanitize');
		assertFetched(result, [/# RETAINED\\_ARTICLE/, /RETAINED\\_PARAGRAPH/], ['SCRIPT_NOT_CONTENT', 'STYLE_NOT_CONTENT', 'COMMENT_NOT_CONTENT', 'HEADER_NOT_CONTENT', 'NAV_NOT_CONTENT', 'FOOTER_NOT_CONTENT']);
		assert.deepStrictEqual(server.requests.map(request => request.path), ['/sanitize']);
	});

	const rawHtml = '<!doctype html><html><body><h1>RAW_MARKER</h1><script>const synthetic = "RAW_SCRIPT";</script><p>raw &amp; unchanged</p></body></html>';
	const emptyHtml = '<html><head></head><body></body></html>';
	webTest('raw mode preserves HTML and failed empty extraction returns the raw fallback', {
		'/raw': { contentType: 'text/html', body: rawHtml },
		'/empty-html': { contentType: 'text/html', body: emptyHtml },
	}, async ({ server, fetch }) => {
		const raw = await fetch('/raw', { raw: true });
		const fallback = await fetch('/empty-html');
		assert.deepStrictEqual({
			rawSuccess: raw.success, rawPrefix: raw.text.startsWith('Here is the raw content:\n'), rawBody: raw.body,
			fallbackSuccess: fallback.success, fallbackPrefix: fallback.text.startsWith('Failed to simplify HTML to markdown.'), fallbackBody: fallback.body,
			requests: server.requests.map(request => ({ path: request.path, accept: request.accept })),
		}, {
			rawSuccess: true, rawPrefix: true, rawBody: rawHtml,
			fallbackSuccess: true, fallbackPrefix: true, fallbackBody: emptyHtml,
			requests: [
				{ path: '/raw', accept: 'text/html, */*' },
				{ path: '/empty-html', accept: 'text/markdown, text/html, */*' },
			],
		});
	});

	const markdown = '# MARKDOWN_MARKER\n\n**exact formatting**\n\n<html>is literal Markdown content</html>';
	webTest('Markdown MIME types bypass HTML sniffing and preserve exact source', {
		'/markdown': { contentType: 'text/markdown; charset=utf-8', body: markdown },
		'/x-markdown': { contentType: 'TEXT/X-MARKDOWN; charset=utf-8', body: markdown },
	}, async ({ server, fetch }) => {
		const first = await fetch('/markdown');
		const second = await fetch('/x-markdown');
		assert.deepStrictEqual({
			results: [first, second].map(result => ({ success: result.success, body: result.body, rawPrefix: result.text.includes('Here is the raw content') })),
			paths: server.requests.map(request => request.path),
		}, {
			results: [1, 2].map(() => ({ success: true, body: markdown, rawPrefix: false })),
			paths: ['/markdown', '/x-markdown'],
		});
	});

	webTest('text JSON and XML MIME types return unmodified source with a fallback explanation', {
		'/text': { contentType: 'text/plain; charset=utf-8', body: 'PLAIN_MARKER <b>not HTML</b>' },
		'/json': { contentType: 'application/json', body: '{"marker":"JSON_MARKER","items":[1,2]}' },
		'/xml': { contentType: 'application/xml', body: '<fixture><marker>XML_MARKER</marker></fixture>' },
	}, async ({ server, fetch }) => {
		const results = [];
		for (const path of ['/text', '/json', '/xml']) {
			const result = await fetch(path);
			results.push({ success: result.success, body: result.body, explanation: result.text.includes('cannot be simplified to markdown. Here is the raw content:') });
		}
		assert.deepStrictEqual({ results, paths: server.requests.map(request => request.path) }, {
			results: [
				{ success: true, body: 'PLAIN_MARKER <b>not HTML</b>', explanation: true },
				{ success: true, body: '{"marker":"JSON_MARKER","items":[1,2]}', explanation: true },
				{ success: true, body: '<fixture><marker>XML_MARKER</marker></fixture>', explanation: true },
			],
			paths: ['/text', '/json', '/xml'],
		});
	});

	webTest('HTML sniffing and absent MIME headers still extract article Markdown', {
		'/sniff': { contentType: 'application/octet-stream', body: article('<h1>SNIFFED_HEADING</h1>') },
		'/no-type': { body: article('<h1>UNTYPED_HEADING</h1>') },
	}, async ({ server, fetch }) => {
		assertFetched(await fetch('/sniff'), [/# SNIFFED\\_HEADING/], ['cannot be simplified', '<html']);
		assertFetched(await fetch('/no-type'), [/# UNTYPED\\_HEADING/], ['cannot be simplified', '<html']);
		assert.deepStrictEqual(server.requests.map(request => request.path), ['/sniff', '/no-type']);
	});

	webTest('UTF8 BOM is stripped and malformed bytes decode without failing', {
		'/bom': { contentType: 'text/markdown', body: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# BOM_MARKER café 🙂')]) },
		'/lossy': { contentType: 'text/plain', body: Buffer.from([0xef, 0xbb, 0xbf, 0x41, 0xff, 0x42]) },
	}, async ({ server, fetch }) => {
		const bom = await fetch('/bom');
		const lossy = await fetch('/lossy', { raw: true });
		assert.deepStrictEqual({
			results: [bom, lossy].map(result => ({ success: result.success, body: result.body, containsBom: result.body.includes('\uFEFF') })),
			paths: server.requests.map(request => request.path),
		}, {
			results: [
				{ success: true, body: '# BOM_MARKER café 🙂', containsBom: false },
				{ success: true, body: 'A\uFFFDB', containsBom: false },
			],
			paths: ['/bom', '/lossy'],
		});
	});

	webTest('pagination uses UTF16 offsets and exposes the next offset for astral characters', {
		'/unicode': { contentType: 'text/markdown', body: 'A🙂BC🚀DE' },
	}, async ({ server, fetch }) => {
		const first = await fetch('/unicode', { start_index: 1, max_length: 4 });
		const second = await fetch('/unicode', { start_index: 5, max_length: 3 });
		const last = await fetch('/unicode', { start_index: 8, max_length: 20 });
		assert.deepStrictEqual({
			results: [first, second, last].map(result => ({ success: result.success, body: result.body })),
			paths: server.requests.map(request => request.path),
		}, {
			results: [
				{ success: true, body: '🙂BC\n\n<note>Content truncated. Call the fetch tool with a start_index of 5 to get more content.</note>' },
				{ success: true, body: '🚀D\n\n<note>Content truncated. Call the fetch tool with a start_index of 8 to get more content.</note>' },
				{ success: true, body: 'E' },
			],
			paths: ['/unicode', '/unicode', '/unicode'],
		});
	});

	webTest('default maximum and exhausted pagination boundaries remain bounded', {
		'/default': { contentType: 'text/markdown', body: `${'D'.repeat(5000)}DEFAULT_TAIL` },
		'/maximum': { contentType: 'text/markdown', body: `${'M'.repeat(20000)}MAXIMUM_TAIL` },
		'/boundary': { contentType: 'text/markdown', body: 'BOUNDARY' },
	}, async ({ server, fetch }) => {
		const defaultPage = await fetch('/default');
		const maximumPage = await fetch('/maximum', { max_length: 100000 });
		const exactPage = await fetch('/boundary', { max_length: 8 });
		const emptyPage = await fetch('/boundary', { max_length: 0 });
		const exhausted = await fetch('/boundary', { start_index: 8 });
		assert.deepStrictEqual({
			defaultSuccess: defaultPage.success, defaultContent: defaultPage.body.split('\n\n<note>')[0],
			defaultNext: defaultPage.body.includes('start_index of 5000'),
			maximumSuccess: maximumPage.success, maximumContent: maximumPage.body.split('\n\n<note>')[0],
			maximumNext: maximumPage.body.includes('start_index of 20000'),
			boundaries: [exactPage, emptyPage, exhausted].map(result => ({ success: result.success, body: result.body })),
			paths: server.requests.map(request => request.path),
		}, {
			defaultSuccess: true, defaultContent: 'D'.repeat(5000), defaultNext: true,
			maximumSuccess: true, maximumContent: 'M'.repeat(20000), maximumNext: true,
			boundaries: [
				{ success: true, body: 'BOUNDARY' },
				{ success: true, body: '<error>No more content available.</error>' },
				{ success: true, body: '<error>No more content available.</error>' },
			],
			paths: ['/default', '/maximum', '/boundary', '/boundary', '/boundary'],
		});
	}, true, true);

	const oversized = Buffer.alloc(fetchByteLimit + 256, 'Z');
	oversized.write('BEYOND_DOWNLOAD_LIMIT', fetchByteLimit);
	webTest('download buffering truncates at ten MiB without exposing the discarded tail', {
		'/oversized': { contentType: 'text/plain', body: oversized },
	}, async ({ server, fetch }) => {
		const result = await fetch('/oversized', { raw: true, start_index: fetchByteLimit - 12, max_length: 1000 });
		assert.deepStrictEqual({ success: result.success, body: result.body, paths: server.requests.map(request => request.path) }, {
			success: true,
			body: `${'Z'.repeat(12)}\n\n[Content truncated: exceeded ${fetchByteLimit} byte limit]`,
			paths: ['/oversized'],
		});
	});

	webTest('all redirect statuses resolve relative targets and retain fragment inheritance', {
		'/redirect/start': { status: 301, location: 'second' },
		'/redirect/second': { status: 302, location: './third' },
		'/redirect/third': { status: 303, location: '/redirect/fourth' },
		'/redirect/fourth': { status: 307, location: 'fifth' },
		'/redirect/fifth': { status: 308, location: '../redirect/final?fixture=synthetic' },
		'/redirect/final?fixture=synthetic': { contentType: 'text/markdown', body: 'REDIRECT_FINAL_MARKER' },
	}, async ({ server, fetch }) => {
		const result = await fetch('/redirect/start#chapter');
		assertFetched(result, [/REDIRECT_FINAL_MARKER/, /\/redirect\/final\?fixture=synthetic#chapter \(redirected from .*\/redirect\/start#chapter\)/]);
		assert.deepStrictEqual(server.requests.map(request => request.path), [
			'/redirect/start', '/redirect/second', '/redirect/third', '/redirect/fourth', '/redirect/fifth', '/redirect/final?fixture=synthetic',
		]);
	});

	webTest('missing empty unsafe and looping redirect targets fail without following unsafe URLs', {
		'/missing-location': { status: 302 },
		'/empty-location': { status: 301, location: '' },
		'/unsafe-location': { status: 307, location: 'data:text/plain,UNREQUESTED_REDIRECT' },
		'/loop': { status: 308, location: '/loop' },
	}, async ({ server, fetch }) => {
		assertFailed(await fetch('/missing-location'), /redirect response omitted the Location header/);
		assertFailed(await fetch('/empty-location'), /redirect response contained an empty Location header/);
		assertFailed(await fetch('/unsafe-location'), /redirect target uses unsupported scheme: data/);
		assertFailed(await fetch('/loop'), /exceeded the redirect limit of 10/);
		assert.deepStrictEqual(server.requests.map(request => request.path), [
			'/missing-location', '/empty-location', '/unsafe-location', ...Array.from({ length: 11 }, () => '/loop'),
		]);
	});

	webTest('HTTP errors preserve status and the same session can fetch successfully afterward', {
		'/missing': { status: 404, contentType: 'text/html', body: 'ERROR_BODY_NOT_CONTENT' },
		'/unavailable': { status: 503, contentType: 'text/plain', body: 'SERVICE_BODY_NOT_CONTENT' },
		'/recovered': { contentType: 'text/markdown', body: 'HTTP_RECOVERED_MARKER' },
		'/no-content': { status: 204 },
	}, async ({ server, fetch }) => {
		const missing = await fetch('/missing');
		const unavailable = await fetch('/unavailable');
		assertFailed(missing, /status code 404/);
		assertFailed(unavailable, /status code 503/);
		assertFetched(await fetch('/recovered'), [/HTTP_RECOVERED_MARKER/]);
		const noContent = await fetch('/no-content', { raw: true });
		assert.deepStrictEqual({
			errorBodiesAbsent: !missing.text.includes('ERROR_BODY_NOT_CONTENT') && !unavailable.text.includes('SERVICE_BODY_NOT_CONTENT'),
			emptySuccess: noContent.success, emptyBody: noContent.body,
			paths: server.requests.map(request => request.path),
		}, {
			errorBodiesAbsent: true, emptySuccess: true, emptyBody: '<error>No more content available.</error>',
			paths: ['/missing', '/unavailable', '/recovered', '/no-content'],
		});
	});

	webTest('localhost access is denied before any HTTP request when the opt-in is disabled', {
		'/denied': { contentType: 'text/markdown', body: 'DENIED_BODY_MUST_NOT_BE_READ' },
	}, async ({ server, fetch }) => {
		const markdownDenied = await fetch('/denied');
		const rawDenied = await fetch('/denied', { raw: true });
		assertFailed(markdownDenied, /WebFetchBlockedUrlError:[\s\S]*resolves to blocked address 127\.0\.0\.1/);
		assertFailed(rawDenied, /WebFetchBlockedUrlError:[\s\S]*resolves to blocked address 127\.0\.0\.1/);
		assert.deepStrictEqual({
			requests: server.requests,
			contentLeaked: [markdownDenied, rawDenied].some(result => result.text.includes('DENIED_BODY_MUST_NOT_BE_READ')),
		}, { requests: [], contentLeaked: false });
	}, false);
}

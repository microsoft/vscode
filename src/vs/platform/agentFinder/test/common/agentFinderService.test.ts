/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../base/common/async.js';
import { bufferToStream, newWriteableBufferStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IRequestService } from '../../../request/common/request.js';
import { AgentFinderMediaType, AgentFinderService, IAgentFinderQuery, IAgentFinderResource } from '../../common/agentFinderService.js';

// Representative public Agent Finder responses; fixtures never make network requests.
const skill = {
	identifier: 'urn:air:github.com:ChromeDevTools:chrome-devtools-mcp:a11y-debugging',
	displayName: 'A11Y Debugging',
	type: 'application/ai-skill',
	mediaType: 'application/ai-skill',
	url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/skills/a11y-debugging/SKILL.md',
	description: 'Uses Chrome DevTools MCP for accessibility (a11y) debugging and auditing based on web.dev guidelines.',
	tags: ['accessibility', 'debugging', 'chrome devtools', 'web.dev'],
	capabilities: ['a11y debugging', 'audit accessibility'],
	representativeQueries: ['how to debug accessibility issues using Chrome DevTools'],
	metadata: { repoPath: 'skills/a11y-debugging/SKILL.md', sourceSet: 'ChromeDevTools/chrome-devtools-mcp' },
	source: 'launch-augment-set',
};

const mcpServer = {
	identifier: 'urn:air:api.mcp.github.com:io.github.pgEdge:postgres-mcp',
	displayName: 'pgEdge Postgres',
	type: 'application/mcp-server+json',
	mediaType: 'application/mcp-server+json',
	url: 'https://api.mcp.github.com/oss/v0.1/servers/io.github.pgEdge%2Fpostgres-mcp/versions/latest',
	description: 'Enterprise PostgreSQL MCP server with NL queries, hybrid search (pgvector+BM25), and web UI',
	tags: ['postgresql', 'mcp server'],
	capabilities: ['execute natural language queries'],
	representativeQueries: ['how can I execute a natural language query on PostgreSQL?'],
	metadata: {
		approvalSource: 'https://api.mcp.github.com/oss/v0.1/servers',
		publicId: 'd6f68a8c-ffe9-476a-b2c0-55e3a5eabc54',
		serverName: 'io.github.pgEdge/postgres-mcp',
		sourceSet: 'github-mcp-oss',
		version: '1.0.0',
	},
	source: 'launch-augment-set',
};

class TestRequestService implements IRequestService {
	declare readonly _serviceBrand: undefined;
	readonly onDidCompleteRequest = Event.None;
	readonly requests: IRequestOptions[] = [];
	readonly tokens: CancellationToken[] = [];

	constructor(private readonly respond: (options: IRequestOptions, token: CancellationToken) => Promise<IRequestContext>) { }

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		this.requests.push(options);
		this.tokens.push(token);
		return this.respond(options, token);
	}

	async resolveProxy() { return undefined; }
	async lookupAuthorization() { return undefined; }
	async lookupKerberosAuthorization() { return undefined; }
	async loadCertificates() { return []; }
}

function response(body: unknown, statusCode = 200): IRequestContext {
	return {
		res: { statusCode, headers: {} },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))),
	};
}

function resourceSnapshot(resource: IAgentFinderResource) {
	return {
		...resource,
		url: resource.url?.toString(),
		repository: resource.repository?.toString(),
		icon: resource.icon?.toString(),
	};
}

suite('AgentFinderService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createService(body: unknown, statusCode = 200) {
		const requests = new TestRequestService(async () => response(body, statusCode));
		return { service: new AgentFinderService(requests), requests };
	}

	test('parses an observed skill browse response and derives the repository owner avatar', async () => {
		const { service, requests } = createService({ results: [skill], total: 1678, offset: 0, pageSize: 1 });
		const page = await service.query({ mediaType: AgentFinderMediaType.Skill, pageSize: 1 }, CancellationToken.None);

		assert.deepStrictEqual({
			items: page.items.map(resourceSnapshot),
			total: page.total,
			nextCursor: page.nextCursor,
			requests: requests.requests,
		}, {
			items: [{
				identifier: skill.identifier,
				displayName: skill.displayName,
				description: skill.description,
				mediaType: skill.mediaType,
				tags: skill.tags,
				capabilities: skill.capabilities,
				representativeQueries: skill.representativeQueries,
				url: skill.url,
				externalUrl: skill.url,
				repository: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
				icon: 'https://github.com/ChromeDevTools.png?size%3D64',
				publisher: 'ChromeDevTools',
				version: undefined,
			}],
			total: 1678,
			nextCursor: { kind: 'browse', offset: 1 },
			requests: [{
				url: 'https://agentfinder.github.com/api/v1/agents?pageSize=1&offset=0&type=application%2Fai-skill',
				type: 'GET',
				headers: { Accept: 'application/json' },
				data: undefined,
				timeout: 30_000,
				followRedirects: 0,
				callSite: 'agentFinder.query',
			}],
		});
	});

	test('preserves MCP metadata without guessing a repository from serverName', async () => {
		const { service } = createService({ results: [mcpServer], total: 1, offset: 0, pageSize: 30 });
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(item => ({
			displayName: item.displayName,
			mediaType: item.mediaType,
			version: item.version,
			url: item.url?.toString(),
			externalUrl: item.externalUrl,
			repository: item.repository,
			publisher: item.publisher,
			icon: item.icon,
			stars: item.stars,
		})), [{
			displayName: 'pgEdge Postgres',
			mediaType: AgentFinderMediaType.McpServer,
			version: '1.0.0',
			url: 'https://api.mcp.github.com/oss/v0.1/servers/io.github.pgEdge/postgres-mcp/versions/latest',
			externalUrl: mcpServer.url,
			repository: undefined,
			publisher: undefined,
			icon: undefined,
			stars: undefined,
		}]);
	});

	test('parses observed metadata for each plugin media type', async () => {
		const plugins = [
			{ mediaType: AgentFinderMediaType.ClaudePlugin, sourceSet: 'JetBrains/go-modern-guidelines', repoPath: 'claude/modern-go-guidelines/.claude-plugin/plugin.json' },
			{ mediaType: AgentFinderMediaType.CopilotPlugin, sourceSet: 'github/awesome-copilot', repoPath: 'plugins/accessibility-kanban/plugin.json' },
			{ mediaType: AgentFinderMediaType.CursorPlugin, sourceSet: 'ChromeDevTools/chrome-devtools-mcp', repoPath: '.cursor-plugin/plugin.json' },
		];
		const { service } = createService({
			results: plugins.map(plugin => ({ ...skill, type: plugin.mediaType, mediaType: plugin.mediaType, metadata: { sourceSet: plugin.sourceSet, repoPath: plugin.repoPath } })),
			total: 3, offset: 0, pageSize: 30,
		});
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(item => [item.mediaType, item.repository?.toString(), item.publisher, item.stars]), [
			[AgentFinderMediaType.ClaudePlugin, 'https://github.com/JetBrains/go-modern-guidelines', 'JetBrains', undefined],
			[AgentFinderMediaType.CopilotPlugin, 'https://github.com/github/awesome-copilot', 'github', undefined],
			[AgentFinderMediaType.CursorPlugin, 'https://github.com/ChromeDevTools/chrome-devtools-mcp', 'ChromeDevTools', undefined],
		]);
	});

	test('uses a default page size of 30 and caps requested pages at 100', async () => {
		const requests = new TestRequestService(async options => response({ results: [], total: 0, offset: 0, pageSize: options.url?.includes('pageSize=100') ? 100 : 30 }));
		const service = new AgentFinderService(requests);
		await service.query({ query: '   ' }, CancellationToken.None);
		await service.query({ pageSize: 500 }, CancellationToken.None);

		assert.deepStrictEqual(requests.requests.map(request => request.url), [
			'https://agentfinder.github.com/api/v1/agents?pageSize=30&offset=0',
			'https://agentfinder.github.com/api/v1/agents?pageSize=100&offset=0',
		]);
	});

	test('encodes media types containing plus signs and does not implicitly fetch more pages', async () => {
		const { service, requests } = createService({ results: [skill], total: 100, offset: 7, pageSize: 2 });
		const page = await service.query({ mediaType: AgentFinderMediaType.ClaudePlugin, pageSize: 2, cursor: { kind: 'browse', offset: 7 } }, CancellationToken.None);

		assert.deepStrictEqual({ urls: requests.requests.map(request => request.url), nextCursor: page.nextCursor }, {
			urls: ['https://agentfinder.github.com/api/v1/agents?pageSize=2&offset=7&type=application%2Fvnd.anthropic.claude-plugin%2Bjson'],
			nextCursor: { kind: 'browse', offset: 8 },
		});
	});

	test('continues browse pages by returned record count and stops at total', async () => {
		const responses = [
			{ results: [skill, mcpServer], total: 3, offset: 0, pageSize: 2 },
			{ results: [skill], total: 3, offset: 2, pageSize: 2 },
		];
		const requests = new TestRequestService(async () => response(responses.shift()));
		const service = new AgentFinderService(requests);
		const first = await service.query({ pageSize: 2 }, CancellationToken.None);
		const second = await service.query({ pageSize: 2, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({ cursors: [first.nextCursor, second.nextCursor], lengths: [first.items.length, second.items.length], requests: requests.requests.length }, {
			cursors: [{ kind: 'browse', offset: 2 }, undefined], lengths: [2, 1], requests: 2,
		});
	});

	test('POSTs structured filtered search and returns opaque tokens unchanged', async () => {
		const pageToken = 'opaque+/=&?"token';
		const responses = [
			{ results: [{ ...skill, score: 90 }], pageToken },
			{ results: [{ ...skill, score: 80 }], previousPageToken: 'previous' },
		];
		const requests = new TestRequestService(async () => response(responses.shift()));
		const service = new AgentFinderService(requests);
		const options = { query: ' postgres + "JSON" & café ', mediaType: AgentFinderMediaType.Skill, pageSize: 2 };
		const first = await service.query(options, CancellationToken.None);
		const second = await service.query({ ...options, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			pages: [first, second].map(page => ({ total: page.total, nextCursor: page.nextCursor })),
			requests: requests.requests.map(request => ({ type: request.type, url: request.url, headers: request.headers, body: JSON.parse(request.data!) })),
		}, {
			pages: [{ total: undefined, nextCursor: { kind: 'search', pageToken } }, { total: undefined, nextCursor: undefined }],
			requests: [undefined, pageToken].map(token => ({
				type: 'POST',
				url: 'https://agentfinder.github.com/api/v1/search',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: { query: { text: 'postgres + "JSON" & café', filter: { type: [AgentFinderMediaType.Skill] } }, pageSize: 2, ...(token ? { pageToken: token } : {}) },
			})),
		});
	});

	test('unfiltered search omits the filter and does not invent a total', async () => {
		const { service, requests } = createService({ results: [mcpServer, skill] });
		const page = await service.query({ query: 'postgres' }, CancellationToken.None);

		assert.deepStrictEqual({ total: page.total, nextCursor: page.nextCursor, body: JSON.parse(requests.requests[0].data!) }, {
			total: undefined, nextCursor: undefined, body: { query: { text: 'postgres' }, pageSize: 30 },
		});
	});

	test('accepts type aliases and unknown optional fields while sanitizing optional values', async () => {
		const { service } = createService({
			results: [{
				identifier: 'test', displayName: 'Test', mediaType: 'application/future-agent',
				description: 12, tags: ['valid', null, 1, ''], capabilities: 'invalid', representativeQueries: ['query', false],
				metadata: { unexpected: true, version: 1, icon: 'https://untrusted.example/logo.png' }, future: { field: true },
			}],
			total: 1, offset: 0, pageSize: 30,
		});
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(resourceSnapshot), [{
			identifier: 'test', displayName: 'Test', mediaType: 'application/future-agent', description: '',
			tags: ['valid'], capabilities: [], representativeQueries: ['query'],
			url: undefined, externalUrl: undefined, repository: undefined, icon: undefined, publisher: undefined, version: undefined,
		}]);
	});

	test('canonicalizes GitHub links and uses a public resource URL when sourceSet is not a repository', async () => {
		const { service } = createService({
			results: [{ ...skill, url: 'http://GITHUB.COM/Owner/Repository.git/blob/main/SKILL.md?raw=1#L1', metadata: { sourceSet: 'launch-augment-set' }, version: '2.0' }],
			total: 1, offset: 0, pageSize: 30,
		});
		const page = await service.query({}, CancellationToken.None);
		const item = page.items[0];

		assert.deepStrictEqual({ repository: item.repository?.toString(), icon: item.icon?.toString(), publisher: item.publisher, version: item.version }, {
			repository: 'https://github.com/Owner/Repository', icon: 'https://github.com/Owner.png?size%3D64', publisher: 'Owner', version: '2.0',
		});
	});

	test('permits external HTTP(S) links without treating them as GitHub repositories or logos', async () => {
		const urls = ['https://example.com/owner/repo', 'http://example.com/resource', 'https://github.com.evil.example/owner/repo', 'https://github.com:443/owner/repo'];
		const { service } = createService({
			results: urls.map(url => ({ ...skill, url, metadata: { icon: 'https://arbitrary.example/icon.png', publisher: 'Unverified' } })),
			total: urls.length, offset: 0, pageSize: 30,
		});
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(item => [item.url?.toString(), item.repository, item.icon, item.publisher]), urls.map(url => [url, undefined, undefined, undefined]));
	});

	test('rejects unsafe, credentialed, relative, oversized and malformed resource links', async () => {
		const urls = [
			'javascript:alert(1)', 'command:workbench.action.files.openFile', 'data:text/html,test', 'file:///path', '//github.com/owner/repo',
			'https://user:password@github.com/owner/repo', 'https://user%40github.com/owner/repo', 'https://github.com\\@evil.example/owner/repo',
			'https://github.com /owner/repo', 'https://github.com:99999/owner/repo', 'https://example.com/\u0000test', 'https://example.com/%00test',
			`https://example.com/${'x'.repeat(8192)}`, 123,
		];
		const { service } = createService({ results: urls.map(url => ({ ...skill, url, metadata: undefined })), total: urls.length, offset: 0, pageSize: 30 });
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(item => [item.url, item.externalUrl, item.repository, item.icon]), urls.map(() => [undefined, undefined, undefined, undefined]));
	});

	test('does not derive avatars from ambiguous repository metadata or path traversal', async () => {
		const sources = ['owner', '../repository', 'owner/..', 'owner/repo/extra', 'owner/repo?redirect=1', 'owner/repo#fragment', 'user@github.com/repo', 'https://evil.example/owner/repo'];
		const { service } = createService({
			results: [
				...sources.map(sourceSet => ({ ...skill, url: undefined, metadata: { sourceSet } })),
				{ ...skill, url: 'https://github.com/owner/repo/../../other/repo', metadata: undefined },
			],
			total: sources.length + 1, offset: 0, pageSize: 30,
		});
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(item => [item.repository, item.icon]), Array.from({ length: sources.length + 1 }, () => [undefined, undefined]));
	});

	test('rejects malformed browse envelopes instead of returning an empty success', async () => {
		const valid = { results: [skill], total: 1, offset: 0, pageSize: 30 };
		for (const body of [
			null, [], {}, { ...valid, results: {} }, { ...valid, total: -1 }, { ...valid, total: '1' }, { ...valid, total: 1.5 },
			{ ...valid, total: undefined }, { ...valid, offset: 1 }, { ...valid, offset: undefined }, { ...valid, pageSize: 0 },
			{ ...valid, pageSize: undefined }, { ...valid, results: [] }, { ...valid, total: 0 },
			{ ...valid, results: Array.from({ length: 31 }, () => skill) },
		]) {
			const { service } = createService(body);
			await assert.rejects(service.query({}, CancellationToken.None), /Agent Finder returned an invalid response/);
		}
	});

	test('rejects malformed mandatory records instead of silently dropping them', async () => {
		for (const item of [
			null, [], {}, { ...skill, identifier: '' }, { ...skill, identifier: 42 }, { ...skill, displayName: ' ' },
			{ ...skill, displayName: undefined }, { ...skill, type: undefined, mediaType: undefined },
			{ ...skill, type: 42 }, { ...skill, type: 'different/type' }, { ...skill, type: undefined, mediaType: '' },
		]) {
			const { service } = createService({ results: [skill, item], total: 2, offset: 0, pageSize: 30 });
			await assert.rejects(service.query({}, CancellationToken.None), /Agent Finder returned an invalid response/);
		}
	});

	test('rejects invalid and repeated search cursors and malformed search envelopes', async () => {
		for (const body of [
			{ results: {} }, { results: [skill], total: -1 }, { results: [skill], pageToken: {} },
			{ results: [skill], pageToken: 'x'.repeat(8193) }, { results: [skill], pageToken: 'current' }, { results: [], pageToken: 'next' },
		]) {
			const { service } = createService(body);
			await assert.rejects(service.query({ query: 'postgres', cursor: { kind: 'search', pageToken: 'current' } }, CancellationToken.None), /invalid response/);
		}
	});

	test('validates query bounds and cursor modes before requesting', async () => {
		const { service, requests } = createService({});
		const queries: IAgentFinderQuery[] = [
			{ query: 'x'.repeat(4097) }, { pageSize: 0 }, { pageSize: -1 }, { pageSize: 1.5 }, { pageSize: NaN }, { pageSize: Infinity },
			{ cursor: { kind: 'browse', offset: -1 } }, { cursor: { kind: 'browse', offset: 0.5 } },
			{ cursor: { kind: 'browse', offset: Number.MAX_SAFE_INTEGER + 1 } },
			{ query: 'postgres', cursor: { kind: 'browse', offset: 0 } }, { cursor: { kind: 'search', pageToken: 'token' } },
			{ query: 'postgres', cursor: { kind: 'search', pageToken: '' } }, { query: 'postgres', cursor: { kind: 'search', pageToken: 'x'.repeat(8193) } },
		];
		for (const query of queries) {
			await assert.rejects(service.query(query, CancellationToken.None), /invalid/);
		}
		assert.deepStrictEqual(requests.requests, []);
	});

	test('reports HTTP and rate limit failures safely without falling back to browse', async () => {
		for (const status of [301, 401, 403, 404, 429, 500, 503]) {
			const { service, requests } = createService({ message: 'private upstream details' }, status);
			await assert.rejects(service.query({ query: 'postgres' }, CancellationToken.None), {
				message: status === 429
					? 'Agent Finder is receiving too many requests. Try again later.'
					: `Agent Finder could not complete the request (HTTP ${status}). Try again later.`,
			});
			assert.deepStrictEqual(requests.requests.map(request => request.type), ['POST']);
		}
	});

	test('reports invalid JSON without exposing the response text', async () => {
		const requests = new TestRequestService(async () => ({
			res: { statusCode: 200, headers: {} },
			stream: bufferToStream(VSBuffer.fromString('<html>private upstream details</html>')),
		}));
		await assert.rejects(new AgentFinderService(requests).query({}, CancellationToken.None), {
			message: 'Agent Finder returned invalid JSON. Try again later.',
		});
	});

	test('reports transport and stream failures without exposing underlying details', async () => {
		const requests = new TestRequestService(async () => { throw new Error('private transport details'); });
		await assert.rejects(new AgentFinderService(requests).query({}, CancellationToken.None), {
			message: 'Unable to reach Agent Finder. Check your connection and try again.',
		});

		const stream = newWriteableBufferStream();
		disposables.add(toDisposable(() => stream.destroy()));
		stream.error(new Error('private stream details'));
		const streamRequests = new TestRequestService(async () => ({ res: { statusCode: 200, headers: {} }, stream }));
		await assert.rejects(new AgentFinderService(streamRequests).query({}, CancellationToken.None), {
			message: 'Unable to reach Agent Finder. Check your connection and try again.',
		});
	});

	test('bounds response bytes and destroys an oversized stream', async () => {
		const stream = bufferToStream(VSBuffer.alloc(5 * 1024 * 1024 + 1));
		const destroyed = sinon.spy(stream, 'destroy');
		const requests = new TestRequestService(async () => ({ res: { statusCode: 200, headers: {} }, stream }));
		await assert.rejects(new AgentFinderService(requests).query({}, CancellationToken.None), /response is too large/);
		assert.strictEqual(destroyed.called, true);
	});

	test('does not request when already cancelled', async () => {
		const { service, requests } = createService({});
		await assert.rejects(service.query({}, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(requests.requests, []);
	});

	test('cancels a pending request even when the transport does not reject', async () => {
		const source = disposables.add(new CancellationTokenSource());
		const requests = new TestRequestService(() => new Promise(() => { }));
		const pending = new AgentFinderService(requests).query({}, source.token);
		source.cancel();
		await assert.rejects(pending, isCancellationError);
		assert.strictEqual(requests.tokens[0].isCancellationRequested, true);
	});

	test('cancels and destroys a response while its body is pending', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const source = disposables.add(new CancellationTokenSource());
		const stream = newWriteableBufferStream();
		disposables.add(toDisposable(() => stream.destroy()));
		const destroyed = sinon.spy(stream, 'destroy');
		const requests = new TestRequestService(async () => ({ res: { statusCode: 200, headers: {} }, stream }));
		const pending = new AgentFinderService(requests).query({}, source.token);
		await timeout(0);
		source.cancel();
		await assert.rejects(pending, isCancellationError);
		assert.strictEqual(destroyed.called, true);
	}));

	test('times out and cancels a request that never resolves', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const requests = new TestRequestService(() => new Promise(() => { }));
		await assert.rejects(new AgentFinderService(requests).query({}, CancellationToken.None), {
			message: 'Agent Finder took too long to respond. Try again.',
		});
		assert.strictEqual(requests.tokens[0].isCancellationRequested, true);
	}));

	test('applies the deadline to the response body as well as headers', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const stream = newWriteableBufferStream();
		disposables.add(toDisposable(() => stream.destroy()));
		const destroyed = sinon.spy(stream, 'destroy');
		const requests = new TestRequestService(async () => ({ res: { statusCode: 200, headers: {} }, stream }));
		await assert.rejects(new AgentFinderService(requests).query({}, CancellationToken.None), /took too long/);
		assert.strictEqual(destroyed.called, true);
	}));
});

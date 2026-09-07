/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer, bufferToStream } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { IRequestService } from '../../../request/common/request.js';
import { IGalleryMcpServer, McpGalleryResolveStatus } from '../../common/mcpManagement.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus, McpGalleryResourceType } from '../../common/mcpGalleryManifest.js';
import { McpGalleryService } from '../../common/mcpGalleryService.js';

const SERVERS_URL = 'https://registry.test/servers';
const NAMED_TEMPLATE = 'https://registry.test/servers/{name}';

function serverUrl(name: string): string {
	return `https://registry.test/servers/${name}`;
}

function serverDocumentData(name: string, registryTypes: readonly string[], remotes?: readonly { type: string; url: string }[]) {
	return {
		server: {
			name,
			description: 'Test server',
			version: '1.0.0',
			packages: registryTypes.map(registryType => ({
				identifier: 'test-package',
				registryType,
				transport: { type: 'stdio' }
			})),
			remotes
		},
		_meta: {
			'io.modelcontextprotocol.registry/official': {
				status: 'active',
				isLatest: true,
				publishedAt: '2026-01-01T00:00:00.000Z'
			}
		}
	};
}

function serverDocument(registryType?: string): string {
	return JSON.stringify(serverDocumentData('io.github.owner/server', registryType ? [registryType] : []));
}

function modernServerDocumentData(name: string, registryTypes: readonly string[]) {
	return {
		$schema: 'https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json',
		name,
		description: 'Test server',
		version: '1.0.0',
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
		packages: registryTypes.map(registryType => ({
			registry_name: registryType,
			registry_type: registryType,
			name: 'test-package',
			identifier: 'test-package',
			version: '1.0.0',
			transport: { type: 'stdio' }
		})),
		_meta: {
			'io.modelcontextprotocol.registry/official': {
				id: name,
				is_latest: true,
				published_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-01T00:00:00.000Z'
			}
		}
	};
}

class TestMcpGalleryService extends McpGalleryService {
	readonly responses = new Map<string, IGalleryMcpServer | 'notfound' | 'error'>();

	override async getMcpServer(url: string): Promise<IGalleryMcpServer | undefined> {
		const response = this.responses.get(url);
		if (response === 'error') {
			throw new Error(`Request failed for ${url}`);
		}
		if (response === undefined || response === 'notfound') {
			return undefined;
		}
		return response;
	}
}

class StatusRequestService implements IRequestService {
	readonly _serviceBrand: undefined;
	readonly onDidCompleteRequest = Event.None;
	readonly requests: IRequestOptions[] = [];

	constructor(private readonly statusCode: number, private readonly body: string = '') { }

	async request(options: IRequestOptions): Promise<IRequestContext> {
		this.requests.push(options);
		return {
			res: { statusCode: this.statusCode, headers: {} },
			stream: bufferToStream(VSBuffer.fromString(this.body)),
		};
	}

	async resolveProxy() { return undefined; }
	async lookupAuthorization() { return undefined; }
	async lookupKerberosAuthorization() { return undefined; }
	async loadCertificates() { return []; }
}

function createManifestService(manifest: IMcpGalleryManifest | null): IMcpGalleryManifestService {
	return {
		_serviceBrand: undefined,
		mcpGalleryManifestStatus: manifest ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable,
		onDidChangeMcpGalleryManifestStatus: Event.None,
		onDidChangeMcpGalleryManifest: Event.None,
		getMcpGalleryManifest: async () => manifest,
	};
}

const manifest: IMcpGalleryManifest = {
	version: 'v0',
	url: 'https://registry.test',
	resources: [
		{ id: SERVERS_URL, type: McpGalleryResourceType.McpServersQueryService },
		{ id: NAMED_TEMPLATE, type: McpGalleryResourceType.McpServerNamedResourceUri }
	]
};

suite('McpGalleryService - resolveMcpServersFromGallery', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(manifest: IMcpGalleryManifest | null): TestMcpGalleryService {
		const store = disposables.add(new DisposableStore());
		return store.add(new TestMcpGalleryService(
			{} as IRequestService,
			{} as IFileService,
			new NullLogService(),
			createManifestService(manifest),
		));
	}

	test('distinguishes found, not-found and transient failures', async () => {
		const service = createService(manifest);
		const found = { name: 'io.github.owner/found' } as IGalleryMcpServer;
		service.responses.set(serverUrl('io.github.owner/found'), found);
		service.responses.set(serverUrl('io.github.owner/missing'), 'notfound');
		service.responses.set(serverUrl('io.github.owner/flaky'), 'error');

		const resolved = await service.resolveMcpServersFromGallery([
			{ name: 'io.github.owner/found' },
			{ name: 'io.github.owner/missing' },
			{ name: 'io.github.owner/flaky' },
		]);

		assert.deepStrictEqual([...resolved.entries()].map(([name, result]) => [name, result.status]), [
			['io.github.owner/found', McpGalleryResolveStatus.Found],
			['io.github.owner/missing', McpGalleryResolveStatus.NotFound],
			['io.github.owner/flaky', McpGalleryResolveStatus.Failed],
		]);
	});

	test('reports failure (undetermined) when the registry manifest is unavailable', async () => {
		const service = createService(null);

		const resolved = await service.resolveMcpServersFromGallery([{ name: 'io.github.owner/found' }]);

		assert.deepStrictEqual([...resolved.entries()].map(([name, result]) => [name, result.status]), [
			['io.github.owner/found', McpGalleryResolveStatus.Failed],
		]);
	});

	test('reports failure (undetermined) when the manifest has no server lookup endpoint', async () => {
		const service = createService({ version: 'v0', url: 'https://registry.test', resources: [] });

		const resolved = await service.resolveMcpServersFromGallery([{ name: 'io.github.owner/found' }]);

		assert.deepStrictEqual([...resolved.entries()].map(([name, result]) => [name, result.status]), [
			['io.github.owner/found', McpGalleryResolveStatus.Failed],
		]);
	});

	test('reports failure (undetermined) when a lookup returns a different server name', async () => {
		const service = createService(manifest);
		service.responses.set(serverUrl('io.github.owner/requested'), { name: 'io.github.owner/unrelated' } as IGalleryMcpServer);

		const resolved = await service.resolveMcpServersFromGallery([{ name: 'io.github.owner/requested' }]);

		assert.deepStrictEqual([...resolved.entries()].map(([name, result]) => [name, result.status]), [
			['io.github.owner/requested', McpGalleryResolveStatus.Failed],
		]);
	});

	test('getMcpServersFromGallery only returns matched servers', async () => {
		const service = createService(manifest);
		const found = { name: 'io.github.owner/found' } as IGalleryMcpServer;
		service.responses.set(serverUrl('io.github.owner/found'), found);
		service.responses.set(serverUrl('io.github.owner/missing'), 'notfound');
		service.responses.set(serverUrl('io.github.owner/flaky'), 'error');

		const servers = await service.getMcpServersFromGallery([
			{ name: 'io.github.owner/found' },
			{ name: 'io.github.owner/missing' },
			{ name: 'io.github.owner/flaky' },
		]);

		assert.deepStrictEqual(servers, [found]);
	});
});

suite('McpGalleryService - getMcpServer HTTP status classification', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function resolveStatusFor(statusCode: number, body: string = ''): Promise<McpGalleryResolveStatus> {
		const store = disposables.add(new DisposableStore());
		const service = store.add(new McpGalleryService(
			new StatusRequestService(statusCode, body),
			{} as IFileService,
			new NullLogService(),
			createManifestService(manifest),
		));
		return service.resolveMcpServersFromGallery([{ name: 'io.github.owner/server' }])
			.then(resolved => resolved.get('io.github.owner/server')!.status);
	}

	test('only a definitive 404 is treated as not-found; every other status is undetermined', async () => {
		const results = await Promise.all([
			resolveStatusFor(404),
			resolveStatusFor(401),
			resolveStatusFor(403),
			resolveStatusFor(429),
			resolveStatusFor(500),
			resolveStatusFor(503),
			resolveStatusFor(204),
			resolveStatusFor(200, 'null'),
		]);

		assert.deepStrictEqual(results, [
			McpGalleryResolveStatus.NotFound,
			McpGalleryResolveStatus.Failed,
			McpGalleryResolveStatus.Failed,
			McpGalleryResolveStatus.Failed,
			McpGalleryResolveStatus.Failed,
			McpGalleryResolveStatus.Failed,
			McpGalleryResolveStatus.Failed,
			McpGalleryResolveStatus.Failed,
		]);
	});
});

suite('McpGalleryService - getMcpServer validation', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(requestService: IRequestService, galleryManifest: IMcpGalleryManifest = manifest): McpGalleryService {
		const store = disposables.add(new DisposableStore());
		return store.add(new McpGalleryService(
			requestService,
			{} as IFileService,
			new NullLogService(),
			createManifestService(galleryManifest),
		));
	}

	test('rejects URLs outside the configured gallery before requesting them', async () => {
		const requestService = new StatusRequestService(200, serverDocument());
		const service = createService(requestService);

		for (const url of [
			'https://registry.test.example/servers/server',
			'https://registry.test/servers-other/server',
			'https://registry.test/servers%2Foutside/server',
			'https://registry.test/servers/%2e%2e/outside/server',
		]) {
			await assert.rejects(() => service.getMcpServer(url), /outside the configured MCP gallery/);
		}

		assert.deepStrictEqual(requestService.requests, []);
	});

	test('rejects opaque-origin gallery URLs before requesting them', async () => {
		const requestService = new StatusRequestService(200, serverDocument());
		const service = createService(requestService, {
			version: 'v0.1',
			url: 'file:///registry',
			resources: [{ id: 'file:///registry/servers', type: McpGalleryResourceType.McpServersQueryService }]
		});

		for (const url of [
			'file:///registry/servers/server',
			'data:/registry/servers/server',
			'custom:/registry/servers/server',
		]) {
			await assert.rejects(() => service.getMcpServer(url), /outside the configured MCP gallery/);
		}

		assert.deepStrictEqual(requestService.requests, []);
	});

	test('does not follow redirects when requesting a gallery server', async () => {
		const requestService = new StatusRequestService(302, serverDocument());
		const service = createService(requestService);
		const url = serverUrl('io.github.owner/server');

		await assert.rejects(() => service.getMcpServer(url), /302/);

		assert.deepStrictEqual(requestService.requests.map(request => ({
			url: request.url,
			followRedirects: request.followRedirects
		})), [{
			url,
			followRedirects: 0
		}]);
	});

	test('rejects unsupported v0.1 package registry types', async () => {
		const requestService = new StatusRequestService(200, serverDocument('unsupported'));
		const service = createService(requestService, { ...manifest, version: 'v0.1' });

		await assert.rejects(() => service.getMcpServer(serverUrl('io.github.owner/server')), /Failed to serialize MCP server/);
	});

	test('filters unsupported packages while preserving supported launch options', async () => {
		const data = serverDocumentData(
			'io.github.owner/server',
			['mcpb', 'npm'],
			[{ type: 'streamable-http', url: 'https://mcp.example/server' }]
		);
		const requestService = new StatusRequestService(200, JSON.stringify(data));
		const service = createService(requestService, { ...manifest, version: 'v0.1' });

		const server = await service.getMcpServer(serverUrl('io.github.owner/server'));

		assert.deepStrictEqual({
			packageTypes: server?.configuration.packages?.map(serverPackage => serverPackage.registryType),
			remotes: server?.configuration.remotes
		}, {
			packageTypes: ['npm'],
			remotes: [{ type: 'streamable-http', url: 'https://mcp.example/server' }]
		});
	});

	test('skips unusable servers without dropping a v0.1 gallery page', async () => {
		const data = {
			metadata: { count: 2 },
			servers: [
				serverDocumentData('io.github.owner/unsupported', ['mcpb']),
				serverDocumentData('io.github.owner/supported', ['npm'])
			]
		};
		const requestService = new StatusRequestService(200, JSON.stringify(data));
		const service = createService(requestService, { ...manifest, version: 'v0.1' });

		const page = (await service.query()).firstPage;

		assert.deepStrictEqual(page.items.map(server => server.name), ['io.github.owner/supported']);
	});

	test('skips unusable servers without dropping a modern gallery page', async () => {
		const data = {
			metadata: { count: 2 },
			servers: [
				modernServerDocumentData('io.github.owner/unsupported', ['mcpb']),
				modernServerDocumentData('io.github.owner/supported', ['npm'])
			]
		};
		const requestService = new StatusRequestService(200, JSON.stringify(data));
		const service = createService(requestService);

		const page = (await service.query()).firstPage;

		assert.deepStrictEqual(page.items.map(server => server.name), ['io.github.owner/supported']);
	});

	test('skips malformed wrapped entries without misclassifying a modern gallery page', async () => {
		const data = {
			metadata: { count: 2, next_cursor: 'next-page' },
			servers: [
				{ server: {} },
				modernServerDocumentData('io.github.owner/supported', ['npm'])
			]
		};
		const requestService = new StatusRequestService(200, JSON.stringify(data));
		const service = createService(requestService);

		const page = (await service.query()).firstPage;

		assert.deepStrictEqual({
			names: page.items.map(server => server.name),
			hasMore: page.hasMore
		}, {
			names: ['io.github.owner/supported'],
			hasMore: true
		});
	});

	test('accepts a gallery page without optional count metadata', async () => {
		const data = {
			metadata: { next_cursor: 'next-page' },
			servers: [modernServerDocumentData('io.github.owner/supported', ['npm'])]
		};
		const requestService = new StatusRequestService(200, JSON.stringify(data));
		const service = createService(requestService);

		const page = (await service.query()).firstPage;

		assert.deepStrictEqual({
			names: page.items.map(server => server.name),
			hasMore: page.hasMore
		}, {
			names: ['io.github.owner/supported'],
			hasMore: true
		});
	});
});

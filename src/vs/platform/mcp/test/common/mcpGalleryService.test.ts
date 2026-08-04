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
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { IRequestService } from '../../../request/common/request.js';
import { IGalleryMcpServer, McpGalleryResolveStatus } from '../../common/mcpManagement.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus, McpGalleryResourceType } from '../../common/mcpGalleryManifest.js';
import { McpGalleryService } from '../../common/mcpGalleryService.js';

const NAMED_TEMPLATE = 'https://registry.test/servers/{name}';

function serverUrl(name: string): string {
	return `https://registry.test/servers/${name}`;
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

	constructor(private readonly statusCode: number, private readonly body: string = '') { }

	async request(): Promise<IRequestContext> {
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
	resources: [{ id: NAMED_TEMPLATE, type: McpGalleryResourceType.McpServerNamedResourceUri }]
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

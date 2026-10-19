/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, FileType } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IFileQuery, QueryType } from '../../../search/common/search.js';
import { AgentHostFileSearchProvider } from '../../common/agentHostFileSearchProvider.js';

suite('AgentHostFileSearchProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const root = toAgentHostUri(URI.parse('file:///C:/Users/test/project with spaces'), 'windows-host');

	async function setup(files: Record<string, string>, provider = disposables.add(new InMemoryFileSystemProvider())) {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(AGENT_HOST_SCHEME, provider));
		await fileService.createFolder(root);
		for (const [path, content] of Object.entries(files)) {
			const resource = joinPath(root, path);
			await fileService.createFolder(dirname(resource));
			await fileService.writeFile(resource, VSBuffer.fromString(content));
		}
		const search = disposables.add(new AgentHostFileSearchProvider(fileService));
		const query: IFileQuery = { type: QueryType.File, folderQueries: [{ folder: root }] };
		return { fileService, search, query };
	}

	test('finds unopened Windows files and preserves the remote authority and URI metadata', async () => {
		const { search, query } = await setup({ 'package.json': '{}', 'src/agentHostUpdateRecovery.ts': '', 'README.md': '' });
		const result = await search.fileSearch({ ...query, filePattern: 'ahur.ts' });

		assert.deepStrictEqual({
			files: result.results.map(match => ({ authority: match.resource.authority, original: fromAgentHostUri(match.resource).toString() })),
			limitHit: result.limitHit,
			messages: result.messages,
		}, {
			files: [{ authority: 'windows-host', original: 'file:///c%3A/Users/test/project%20with%20spaces/src/agentHostUpdateRecovery.ts' }],
			limitHit: false,
			messages: [],
		});
	});

	test('respects excludes, sibling clauses, and nested ignore files without reading outside the query root', async () => {
		const listed: string[] = [];
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			override async readdir(resource: URI): Promise<[string, FileType][]> {
				listed.push(resource.path.slice(root.path.length));
				assert.ok(resource.path.startsWith(root.path));
				return super.readdir(resource);
			}
		}());
		const { search, query } = await setup({
			'.gitignore': 'node_modules/\n*.generated\n',
			'node_modules/dependency.js': '',
			'src/.ignore': '*.log\n!keep.log',
			'src/ignore.log': '',
			'src/keep.log': '',
			'src/app.ts': '',
			'src/app.js': '',
			'src/output.generated': '',
			'out/bundle.js': '',
		}, provider);
		listed.length = 0;
		const result = await search.fileSearch({
			...query, includePattern: { 'src/**': true },
			excludePattern: { '**/out': true, '**/*.js': { when: '$(basename).ts' } },
		});

		assert.deepStrictEqual({
			files: result.results.map(match => match.resource.path.slice(root.path.length + 1)).sort(),
			listed: listed.sort(),
		}, { files: ['src/.ignore', 'src/app.ts', 'src/keep.log'], listed: ['', '/src'] });
	});

	test('supports attachment glob queries, ignore overrides, result limits, and exists queries', async () => {
		const { search, query } = await setup({ '.gitignore': 'hidden/', 'hidden/package.json': '{}', 'package.json': '{}', 'src/package.json': '{}' });
		const globQuery: IFileQuery = { ...query, filePattern: '**/*PACKAGE*.JSON', shouldGlobMatchFilePattern: true, ignoreGlobCase: true };
		const results = await search.fileSearch({ ...globQuery, maxResults: 1 });
		const all = await search.fileSearch({ ...globQuery, folderQueries: [{ folder: root, disregardIgnoreFiles: true }] });
		const exists = await search.fileSearch({ ...globQuery, exists: true });

		assert.deepStrictEqual({
			limitedCount: results.results.length, limitHit: results.limitHit,
			all: all.results.map(match => match.resource.path.slice(root.path.length + 1)).sort(),
			exists,
		}, {
			limitedCount: 1, limitHit: true,
			all: ['hidden/package.json', 'package.json', 'src/package.json'],
			exists: { results: [], limitHit: true, messages: [] },
		});
	});

	test('reuses the Quick Open cache across filename queries and clears it explicitly', async () => {
		let listings = 0;
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			override async readdir(resource: URI): Promise<[string, FileType][]> {
				listings++;
				return super.readdir(resource);
			}
		}());
		const { search, query } = await setup({ 'package.json': '{}', 'src/app.ts': '' }, provider);
		await search.fileSearch({ ...query, cacheKey: 'quick-open', filePattern: 'package' });
		const firstListings = listings;
		const cached = await search.fileSearch({ ...query, cacheKey: 'quick-open', filePattern: 'app' });
		const reused = listings === firstListings;
		await search.clearCache('quick-open');
		await search.fileSearch({ ...query, cacheKey: 'quick-open', filePattern: 'app' });

		assert.deepStrictEqual({ reused, refreshed: listings > firstListings, files: cached.results.map(match => match.resource.path.slice(root.path.length + 1)) }, {
			reused: true, refreshed: true, files: ['src/app.ts'],
		});
	});

	test('cancels a query promptly without cancelling a shared cache enumeration', async () => {
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let blocked = false;
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			override async readdir(resource: URI): Promise<[string, FileType][]> {
				if (blocked) {
					started.complete();
					await release.p;
				}
				return super.readdir(resource);
			}
		}());
		const { search, query } = await setup({ 'package.json': '{}' }, provider);
		blocked = true;
		const cancellation = disposables.add(new CancellationTokenSource());
		const first = search.fileSearch({ ...query, cacheKey: 'shared' }, cancellation.token);
		await started.p;
		cancellation.cancel();
		await assert.rejects(first, error => error instanceof CancellationError);
		release.complete();
		const second = await search.fileSearch({ ...query, cacheKey: 'shared', filePattern: 'package' });

		assert.deepStrictEqual(second.results.map(match => match.resource.path), [joinPath(root, 'package.json').path]);
	});

	test('surfaces permission failures and retries failed cache entries', async () => {
		let denied = true;
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			override async readdir(resource: URI): Promise<[string, FileType][]> {
				if (denied) {
					throw createFileSystemProviderError('Outside workspace grants', FileSystemProviderErrorCode.NoPermissions);
				}
				return super.readdir(resource);
			}
		}());
		const { search, query } = await setup({ 'package.json': '{}' }, provider);
		await assert.rejects(search.fileSearch({ ...query, cacheKey: 'retry' }), /Outside workspace grants/);
		denied = false;
		const result = await search.fileSearch({ ...query, cacheKey: 'retry' });

		assert.deepStrictEqual(result.results.map(match => match.resource.path), [joinPath(root, 'package.json').path]);
	});

	test('drains queued directory reads before surfacing a traversal error', async () => {
		let searching = false;
		let completed = 0;
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			override async readdir(resource: URI): Promise<[string, FileType][]> {
				if (searching && resource.path !== root.path) {
					if (resource.path.endsWith('/folder0')) {
						throw createFileSystemProviderError('Denied child', FileSystemProviderErrorCode.NoPermissions);
					}
					await Promise.resolve();
					completed++;
				}
				return super.readdir(resource);
			}
		}());
		const files = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`folder${i}/app.ts`, '']));
		const { search, query } = await setup(files, provider);
		searching = true;

		await assert.rejects(search.fileSearch(query), /Denied child/);

		assert.strictEqual(completed, 19);
	});
});

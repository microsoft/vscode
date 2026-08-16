/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ingestUtils = require('@github/blackbird-external-ingest-utils');
import assert from 'assert';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import type { FileSystemWatcher } from 'vscode';
import { Result } from '../../../../util/common/result';
import { CallTracker, TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { StaticGitHubAuthenticationService } from '../../../authentication/common/staticGitHubAuthenticationService';
import { IFileSystemService } from '../../../filesystem/common/fileSystemService';
import { FileType } from '../../../filesystem/common/fileTypes';
import { GithubRequestOptions, IGithubApiFetcherService } from '../../../github/common/githubApiFetcherService';
import { ISearchService } from '../../../search/common/searchService';
import { createPlatformServices, TestingServiceCollection } from '../../../test/node/services';
import { IWorkspaceService, NullWorkspaceService } from '../../../workspace/common/workspaceService';
import { ExternalIngestClient, ExternalIngestFile, ExternalIngestFileSet, ExternalIngestUpdateIndexResult, IExternalIngestClient } from '../../node/codeSearch/externalIngestClient';
import { ExternalIngestIndex } from '../../node/codeSearch/externalIngestIndex';

const emptyProgressCb: (message: string) => void = () => { };
const testTelemetryInfo = new TelemetryCorrelationId('externalIngest.spec.ts');

function createMockExternalIngestClient(options?: {
	canIngestPathAndSize?: (filePath: string, size: number) => boolean;
	canIngestDocument?: (filePath: string, data: Uint8Array) => boolean;
}): IExternalIngestClient & {
	get ingestedFiles(): readonly ExternalIngestFile[];
	get searchCalls(): Array<{ filesetName: string; prompt: string }>;
} {
	const ingestedFiles = new ResourceMap<ExternalIngestFile>();
	const searchCalls: Array<{ filesetName: string; prompt: string }> = [];

	return {
		get ingestedFiles() {
			return Array.from(ingestedFiles.values());
		},
		searchCalls,
		async updateIndex(_filesetName: string, fileSet: ExternalIngestFileSet, _callTracker: CallTracker, _token: CancellationToken, _onProgress?: (message: string) => void): Promise<Result<ExternalIngestUpdateIndexResult, Error>> {
			for (const file of fileSet.files) {
				ingestedFiles.set(file.uri, file);
			}
			return Result.ok({ checkpoint: 'mock-checkpoint', totalFileCount: ingestedFiles.size, updatedFileCount: ingestedFiles.size });
		},
		async listFilesets(_callTracker: CallTracker, _token: CancellationToken): Promise<string[]> {
			return [];
		},
		async deleteFileset(_filesetName: string, _callTracker: CallTracker, _token: CancellationToken): Promise<void> {
			// no-op
		},
		async searchFilesets(filesetName: string, prompt: string, _limit: number, _callTracker: CallTracker, _token: CancellationToken): Promise<undefined> {
			searchCalls.push({ filesetName, prompt });
			return undefined;
		},
		canIngestPathAndSize(filePath: string, size: number): boolean {
			return options?.canIngestPathAndSize?.(filePath, size) ?? true;
		},
		canIngestDocument(filePath: string, data: Uint8Array): boolean {
			return options?.canIngestDocument?.(filePath, data) ?? true;
		},
	};
}

class MockWorkspaceService extends NullWorkspaceService {
	constructor(private readonly _workspaceFolders: URI[]) {
		super(_workspaceFolders);
	}

	override getWorkspaceFolders(): URI[] {
		return this._workspaceFolders;
	}
}

interface MockFileEntry {
	readonly content: Uint8Array;
	readonly size: number;
	readonly mtime: number;
}

function createFileFromString(content: string, mtime = Date.now()): MockFileEntry {
	const encoded = new TextEncoder().encode(content);
	return { content: encoded, size: encoded.length, mtime };
}

function createFileFromBytes(content: Uint8Array, mtime = Date.now()): MockFileEntry {
	return { content, size: content.length, mtime };
}

/**
 * Mock for file system and search services
 */
class MockFileSystem extends mock<IFileSystemService & ISearchService>() implements IFileSystemService, ISearchService {
	readonly readFileCalls = new ResourceMap<number>();
	readonly statCalls = new ResourceMap<number>();

	constructor(private readonly _files: ResourceMap<MockFileEntry>) {
		super();
	}

	countReadFileCalls(uri: URI): number {
		return this.readFileCalls.get(uri) ?? 0;
	}

	get totalReadFileCalls(): number {
		let total = 0;
		for (const count of this.readFileCalls.values()) {
			total += count;
		}
		return total;
	}

	// #region IFileSystemService

	override async stat(uri: URI) {
		this.statCalls.set(uri, (this.statCalls.get(uri) ?? 0) + 1);
		const entry = this._files.get(uri);
		if (!entry) {
			throw new Error(`File not found: ${uri.toString()}`);
		}
		return {
			type: FileType.File,
			ctime: 0,
			mtime: entry.mtime,
			size: entry.size,
			permissions: undefined,
		};
	}

	override async readFile(uri: URI) {
		this.readFileCalls.set(uri, (this.readFileCalls.get(uri) ?? 0) + 1);
		const entry = this._files.get(uri);
		if (!entry) {
			throw new Error(`File not found: ${uri.toString()}`);
		}
		return entry.content;
	}

	override isWritableFileSystem(scheme: string): boolean {
		return false;
	}

	override createFileSystemWatcher(): FileSystemWatcher {
		return {
			onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
			onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
			onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
			dispose: vi.fn(),
			ignoreChangeEvents: false,
			ignoreCreateEvents: false,
			ignoreDeleteEvents: false,
		};
	}

	// #endregion

	// #region ISearchService

	override findFilesWithDefaultExcludes(): any {
		return Promise.resolve([...this._files.keys()]);
	}

	override findFiles(): Promise<URI[]> {
		return Promise.resolve([...this._files.keys()]);
	}

	// #endregion
}

/**
 * Helper to create an ExternalIngestIndex with a client.
 * Uses ExternalIngestClient by default, or accepts a mock client for testing.
 */
function createExternalIngestIndex(
	instantiationService: IInstantiationService,
	client?: IExternalIngestClient,
): ExternalIngestIndex {
	const resolvedClient = client ?? instantiationService.createInstance(ExternalIngestClient);
	return instantiationService.createInstance(ExternalIngestIndex, resolvedClient, []);
}

type MockExternalIngestClient = ReturnType<typeof createMockExternalIngestClient>;

interface TestContext {
	readonly files: ResourceMap<MockFileEntry>;
	readonly mockFs: MockFileSystem;
	readonly mockClient: MockExternalIngestClient;
	readonly index: ExternalIngestIndex;
}

suite('ExternalIngestIndex', () => {
	const disposables = new DisposableStore();
	let testingServiceCollection: TestingServiceCollection;

	beforeEach(() => {
		testingServiceCollection = disposables.add(createPlatformServices());
	});

	afterEach(() => {
		disposables.clear();
	});

	/**
	 * Helper to set up a test with mocked file system, workspace, and ingest client.
	 */
	function setupTestContext(
		workspaceRoot: URI,
		files: ResourceMap<MockFileEntry>,
		clientOptions?: Parameters<typeof createMockExternalIngestClient>[0],
	): TestContext {
		const mockFs = new MockFileSystem(files);
		const mockClient = createMockExternalIngestClient(clientOptions);
		const mockWorkspace = new MockWorkspaceService([workspaceRoot]);

		testingServiceCollection.set(IFileSystemService, mockFs);
		testingServiceCollection.set(IWorkspaceService, mockWorkspace);
		testingServiceCollection.set(ISearchService, mockFs);

		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);
		const index = disposables.add(instantiationService.createInstance(ExternalIngestIndex, mockClient, []));

		return { files, mockFs, mockClient, index };
	}

	test('shouldIndexFile returns true by default for file in workspace', async () => {
		const workspace = URI.file('/workspace');
		testingServiceCollection.set(IWorkspaceService, new MockWorkspaceService([workspace]));
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);

		const index = disposables.add(createExternalIngestIndex(instantiationService));
		const file = URI.joinPath(workspace, 'src', 'file.ts');
		assert.strictEqual(await index.shouldTrackFile(file, CancellationToken.None), true);
	});

	test('shouldIndexFile returns false for files under code search roots', async () => {
		const workspace = URI.file('/workspace');
		const codeSearchRoot = URI.file('/other');
		testingServiceCollection.set(IWorkspaceService, new MockWorkspaceService([workspace, codeSearchRoot]));
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);

		const mockClient = createMockExternalIngestClient();
		const index = disposables.add(instantiationService.createInstance(ExternalIngestIndex, mockClient, []));

		index.updateCodeSearchRoots([codeSearchRoot]);

		const fileUnderCodeSearch = URI.joinPath(codeSearchRoot, 'src', 'file.ts');
		assert.strictEqual(await index.shouldTrackFile(fileUnderCodeSearch, CancellationToken.None), false);

		const fileNotUnderCodeSearch = URI.joinPath(workspace, 'src', 'file.ts');
		assert.strictEqual(await index.shouldTrackFile(fileNotUnderCodeSearch, CancellationToken.None), true);
	});

	test('shouldIndexFile handles nested paths correctly', async () => {
		const workspace = URI.file('/workspace');
		const codeSearchRoot = URI.joinPath(workspace, 'repo');
		testingServiceCollection.set(IWorkspaceService, new MockWorkspaceService([workspace]));
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);

		const mockClient = createMockExternalIngestClient();
		const index = disposables.add(instantiationService.createInstance(ExternalIngestIndex, mockClient, []));

		index.updateCodeSearchRoots([codeSearchRoot]);

		assert.strictEqual(await index.shouldTrackFile(URI.joinPath(codeSearchRoot, 'file.ts'), CancellationToken.None), false);
		assert.strictEqual(await index.shouldTrackFile(URI.joinPath(codeSearchRoot, 'src', 'nested', 'file.ts'), CancellationToken.None), false);

		assert.strictEqual(await index.shouldTrackFile(URI.joinPath(workspace, 'file.ts'), CancellationToken.None), true);
		assert.strictEqual(await index.shouldTrackFile(URI.joinPath(workspace, 'repo2', 'file.ts'), CancellationToken.None), true);
	});

	test('updateCodeSearchRoots clears previous roots', async () => {
		const root1 = URI.file('/repo1');
		const root2 = URI.file('/repo2');
		testingServiceCollection.set(IWorkspaceService, new MockWorkspaceService([root1, root2]));
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);

		const mockClient = createMockExternalIngestClient();
		const index = disposables.add(instantiationService.createInstance(ExternalIngestIndex, mockClient, []));

		const file1 = URI.joinPath(root1, 'file.ts');
		const file2 = URI.joinPath(root2, 'file.ts');

		index.updateCodeSearchRoots([root1]);
		assert.strictEqual(await index.shouldTrackFile(file1, CancellationToken.None), false);
		assert.strictEqual(await index.shouldTrackFile(file2, CancellationToken.None), true);

		index.updateCodeSearchRoots([root2]);
		assert.strictEqual(await index.shouldTrackFile(file1, CancellationToken.None), true);
		assert.strictEqual(await index.shouldTrackFile(file2, CancellationToken.None), false);
	});

	test('can mock ExternalIngestClient to test file ingestion', async () => {
		testingServiceCollection.set(IWorkspaceService, new MockWorkspaceService([URI.file('/workspace')]));
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);

		const mockClient = createMockExternalIngestClient();
		disposables.add(instantiationService.createInstance(ExternalIngestIndex, mockClient, []));

		// The mock client is now injected - tests can verify what files would be ingested
		assert.strictEqual(mockClient.ingestedFiles.length, 0, 'No files ingested yet');
	});

	test('can mock FileSystemService to control file content', async () => {
		const files = new ResourceMap<MockFileEntry>();
		const file1Uri = URI.file('/workspace/file1.ts');
		files.set(file1Uri, createFileFromString('const x = 1;'));

		const mockFs = new MockFileSystem(files);
		const mockClient = createMockExternalIngestClient();

		testingServiceCollection.set(IFileSystemService, mockFs);
		testingServiceCollection.set(ISearchService, mockFs);
		testingServiceCollection.set(IWorkspaceService, new MockWorkspaceService([URI.file('/workspace')]));
		const customAccessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const customInstantiationService = customAccessor.get(IInstantiationService);
		disposables.add(customInstantiationService.createInstance(ExternalIngestIndex, mockClient, []));

		// The mock file system and client are now injected
		// Tests can verify file operations and ingestion behavior
		assert.ok(mockClient, 'Mock client is available for assertions');
		assert.ok(mockFs, 'Mock file system is available for assertions');
	});

	test('initialize discovers files from workspace and passes ingestable files to client', async () => {
		const workspaceRoot = URI.file('/workspace');
		const file1 = URI.joinPath(workspaceRoot, 'src', 'file1.ts');
		const file2 = URI.joinPath(workspaceRoot, 'src', 'file2.ts');

		const files = new ResourceMap<MockFileEntry>();
		files.set(file1, createFileFromString('const x = 1;'));
		files.set(file2, createFileFromString('const y = 2;'));

		const { mockClient, index } = setupTestContext(workspaceRoot, files);

		await index.initialize();
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		// Verify that both files were passed to the client for ingestion
		assert.strictEqual(mockClient.ingestedFiles.length, 2, 'Both files should be ingested');
		const ingestedPaths = mockClient.ingestedFiles.map(f => f.uri.toString()).sort();
		assert.deepStrictEqual(ingestedPaths, [file1.toString(), file2.toString()].sort());

		// Files should be tracked after initialization
		assert.strictEqual(await index.shouldTrackFile(file1, CancellationToken.None), true);
		assert.strictEqual(await index.shouldTrackFile(file2, CancellationToken.None), true);
	});

	test('files that fail canIngestPathAndSize are tracked but not ingested', async () => {
		const workspaceRoot = URI.file('/workspace');
		const file1 = URI.joinPath(workspaceRoot, 'small.ts');
		const file2 = URI.joinPath(workspaceRoot, 'large.txt');

		const files = new ResourceMap<MockFileEntry>();
		files.set(file1, createFileFromString('const x = 1;'));
		files.set(file2, createFileFromBytes(new Uint8Array(100)));

		const { mockClient, index } = setupTestContext(workspaceRoot, files, {
			canIngestPathAndSize: (_filePath, size) => size < 50,
			canIngestDocument: () => true,
		});

		await index.initialize();
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		// Only the small file should be ingested (large file fails canIngestPathAndSize)
		assert.strictEqual(mockClient.ingestedFiles.length, 1, 'Only small file should be ingested');
		assert.strictEqual(mockClient.ingestedFiles[0].uri.toString(), file1.toString());

		// Both files should be tracked
		assert.strictEqual(await index.shouldTrackFile(file1, CancellationToken.None), true);
		assert.strictEqual(await index.shouldTrackFile(file2, CancellationToken.None), true);
	});

	test('files that fail canIngestDocument are tracked but filtered during ingestion', async () => {
		const workspaceRoot = URI.file('/workspace');
		const textFile = URI.joinPath(workspaceRoot, 'text.ts');
		const binaryFile = URI.joinPath(workspaceRoot, 'binary.txt');

		const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0xFF, 0xFE]);

		const files = new ResourceMap<MockFileEntry>();
		files.set(textFile, createFileFromString('const x = 1;'));
		files.set(binaryFile, createFileFromBytes(binaryContent));

		const { mockClient, index } = setupTestContext(workspaceRoot, files, {
			canIngestPathAndSize: () => true,
			canIngestDocument: (_filePath, data) => !data.includes(0x00),
		});

		await index.initialize();
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		// Only the text file should be ingested (binary file fails canIngestDocument)
		assert.strictEqual(mockClient.ingestedFiles.length, 1, 'Only text file should be ingested');
		assert.strictEqual(mockClient.ingestedFiles[0].uri.toString(), textFile.toString());

		// Both files should be tracked
		assert.strictEqual(await index.shouldTrackFile(textFile, CancellationToken.None), true);
		assert.strictEqual(await index.shouldTrackFile(binaryFile, CancellationToken.None), true);
	});

	test('files excluded by path pattern are not ingested', async () => {
		const workspaceRoot = URI.file('/workspace');
		const sourceFile = URI.joinPath(workspaceRoot, 'src', 'app.ts');
		const vendorFile = URI.joinPath(workspaceRoot, 'vendor', 'lib.js');

		const files = new ResourceMap<MockFileEntry>();
		files.set(sourceFile, createFileFromString('const app = 1;'));
		files.set(vendorFile, createFileFromString('const lib = 1;'));

		const { mockClient, index } = setupTestContext(workspaceRoot, files, {
			canIngestPathAndSize: (filePath) => !filePath.includes('vendor'),
			canIngestDocument: () => true,
		});

		await index.initialize();
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		// Only the source file should be ingested (vendor file filtered by path pattern)
		assert.strictEqual(mockClient.ingestedFiles.length, 1, 'Only source file should be ingested');
		assert.strictEqual(mockClient.ingestedFiles[0].uri.toString(), sourceFile.toString());

		// Both files should be tracked (tracking is separate from ingestion)
		assert.strictEqual(await index.shouldTrackFile(sourceFile, CancellationToken.None), true);
		assert.strictEqual(await index.shouldTrackFile(vendorFile, CancellationToken.None), true);
	});

	test('multiple ingests do not re-read unchanged files from disk', async () => {
		const workspaceRoot = URI.file('/workspace');
		const file1 = URI.joinPath(workspaceRoot, 'src', 'file1.ts');

		const files = new ResourceMap<MockFileEntry>();
		files.set(file1, createFileFromString('const x = 1;', 1000));

		const { mockFs, mockClient, index } = setupTestContext(workspaceRoot, files);

		await index.initialize();

		// First ingest - file should be read
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');
		assert.ok(mockFs.countReadFileCalls(file1) >= 1, 'File should be read during first ingest');

		// Second ingest - file should NOT be re-read since mtime unchanged
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		// The file should still be yielded from the ingestion
		assert.strictEqual(mockClient.ingestedFiles.length, 1, 'File should still be yielded on second ingest');

		// But readFile should not be called to compute docSha (stat is allowed)
		assert.strictEqual(mockFs.countReadFileCalls(file1), 1, 'File should NOT be re-read on second ingest when unchanged');
	});

	test('files are re-read when mtime changes between ingests', async () => {
		const workspaceRoot = URI.file('/workspace');
		const file1 = URI.joinPath(workspaceRoot, 'src', 'file1.ts');

		const files = new ResourceMap<MockFileEntry>();
		files.set(file1, createFileFromString('const x = 1;', 1000));

		const { mockFs, mockClient, index } = setupTestContext(workspaceRoot, files);

		await index.initialize();
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		assert.strictEqual(mockClient.ingestedFiles.length, 1, 'File should be yielded on first ingest');
		assert.strictEqual(mockFs.countReadFileCalls(file1), 1, 'File should be read once during first ingest');

		// Simulate file modification by changing mtime
		files.set(file1, createFileFromString('const x = 2;', 2000));

		// Second ingest after file change - file SHOULD be re-read
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		assert.strictEqual(mockFs.countReadFileCalls(file1), 2, 'File SHOULD be re-read when mtime changes');
	});

	test('multiple files are efficiently cached during ingestion', async () => {
		const workspaceRoot = URI.file('/workspace');
		const file1 = URI.joinPath(workspaceRoot, 'src', 'file1.ts');
		const file2 = URI.joinPath(workspaceRoot, 'src', 'file2.ts');
		const file3 = URI.joinPath(workspaceRoot, 'src', 'file3.ts');

		const files = new ResourceMap<MockFileEntry>();
		files.set(file1, createFileFromString('const x = 1;', 1000));
		files.set(file2, createFileFromString('const y = 2;', 1000));
		files.set(file3, createFileFromString('const z = 3;', 1000));

		const { mockFs, mockClient, index } = setupTestContext(workspaceRoot, files);

		await index.initialize();

		// First ingest - all files should be read
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		assert.strictEqual(mockClient.ingestedFiles.length, 3, 'All files should be ingested');

		// Second ingest, should not trigger any new reads
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		// All files should be yielded but none should be re-read for docSha computation
		assert.strictEqual(mockClient.ingestedFiles.length, 3, 'All files should still be yielded');
		assert.strictEqual(mockFs.totalReadFileCalls, 3, 'No files should be re-read when unchanged');

		// Now change just one file
		files.set(file2, createFileFromString('const y = 999;', 2000));

		// Third ingest - only file2 should be re-read
		assert.ok((await index.doIngest(testTelemetryInfo, emptyProgressCb, CancellationToken.None)).isOk(), 'Ingest should complete successfully');

		assert.strictEqual(mockClient.ingestedFiles.length, 3, 'All files should still be yielded');
		assert.strictEqual(mockFs.countReadFileCalls(file2), 2, 'Changed file should be re-read');
		assert.strictEqual(mockFs.countReadFileCalls(file1), 1, 'Unchanged file1 should not be re-read');
		assert.strictEqual(mockFs.countReadFileCalls(file3), 1, 'Unchanged file3 should not be re-read');
	});
});

/**
 * Mock GitHub API fetcher that drives the external ingest HTTP protocol so we can
 * exercise the real {@link ExternalIngestClient} ingestion flow end-to-end.
*/
class RecordingGithubApiFetcherService extends mock<IGithubApiFetcherService>() implements IGithubApiFetcherService {
	readonly requests: Array<{ method: string; path: string }> = [];
	private batchPolls = 0;
	private finalizeAttempts = 0;
	private documentUploads = 0;
	private documentFailuresRemaining: number;

	constructor(
		private readonly docShaIds: string[],
		private readonly finalize412Count: number,
		private readonly batchPollsWithDocs = 1,
		private readonly documentFailure?: { readonly count: number; readonly status: number; readonly requestId: string },
	) {
		super();
		this.documentFailuresRemaining = documentFailure?.count ?? 0;
	}

	get finalizeCallCount(): number { return this.finalizeAttempts; }
	get batchPollCount(): number { return this.batchPolls; }
	get documentUploadCount(): number { return this.documentUploads; }

	override async makeRequest(options: GithubRequestOptions): Promise<Response> {
		const path = new URL(options.url).pathname;
		this.requests.push({ method: options.method, path });

		const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
			new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

		switch (path) {
			case '/external/code/ingest':
				return json({ ingest_id: 'ingest-1', coded_symbol_range: { start: 0, end: 1 } });
			case '/external/code/ingest/coded_symbols':
				return json({ next_coded_symbol_range: undefined });
			case '/external/code/ingest/batch': {
				const docIds = this.batchPolls < this.batchPollsWithDocs ? this.docShaIds : [];
				this.batchPolls++;
				return json({ doc_ids: docIds, next_page_token: undefined });
			}
			case '/external/code/ingest/document':
				this.documentUploads++;
				if (this.documentFailure && this.documentFailuresRemaining > 0) {
					this.documentFailuresRemaining--;
					return json({ message: 'boom' }, this.documentFailure.status, { 'x-github-request-id': this.documentFailure.requestId });
				}
				return json({});
			case '/external/code/ingest/finalize': {
				this.finalizeAttempts++;
				if (this.finalizeAttempts <= this.finalize412Count) {
					return json({ message: 'request sent for phase which was not the current phase' }, 412);
				}
				return json({});
			}
			default:
				throw new Error(`Unexpected request path: ${path}`);
		}
	}
}

suite('ExternalIngestClient finalize retry', () => {
	const disposables = new DisposableStore();

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	});

	afterEach(() => {
		vi.useRealTimers();
		disposables.clear();
	});

	/**
	 * Drives `updateIndex` to completion while flushing the fake finalize-retry backoff
	 * timers, so the test never waits on real wall-clock time.
	 */
	function runUpdateIndex(client: ExternalIngestClient, fileSet: ExternalIngestFileSet): Promise<Result<ExternalIngestUpdateIndexResult, Error>> {
		const promise = client.updateIndex('fileset-1', fileSet, new CallTracker('externalIngest.spec.ts'), CancellationToken.None, emptyProgressCb);
		// Run all (current and subsequently scheduled) timers, flushing microtasks between
		// each, so the backoff `timeout(...)` calls resolve and the promise settles.
		return vi.runAllTimersAsync().then(() => promise);
	}

	function createIngestFile(relativePath: string, content: string): ExternalIngestFile {
		const bytes = new TextEncoder().encode(content);
		const docSha = ingestUtils.getDocSha(relativePath, new ingestUtils.DocumentContents(bytes));
		return {
			uri: URI.file(`/workspace/${relativePath}`),
			relativePath,
			docSha,
			read: async () => bytes,
		};
	}

	function createClient(fetcher: IGithubApiFetcherService): ExternalIngestClient {
		const testingServiceCollection = disposables.add(createPlatformServices());
		testingServiceCollection.set(IGithubApiFetcherService, fetcher);
		// Provide a static GitHub token so `getAuthToken()` resolves without real
		// credentials - CI has no GITHUB_PAT/GITHUB_OAUTH_TOKEN set.
		testingServiceCollection.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [() => 'test-github-token']));
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		const instantiationService = accessor.get(IInstantiationService);
		return disposables.add(instantiationService.createInstance(ExternalIngestClient));
	}

	test('retries finalize after a 412 phase mismatch and re-polls for missing documents', async () => {
		const file = createIngestFile('src/file1.ts', 'const x = 1;');
		const docShaId = Buffer.from(file.docSha).toString('base64');

		// Server registers the document after the first upload, so the second batch
		// poll reports nothing missing and finalize succeeds on the retry.
		const fetcher = new RecordingGithubApiFetcherService([docShaId], /* finalize412Count */ 1, /* batchPollsWithDocs */ 1);
		const client = createClient(fetcher);

		const fileSet: ExternalIngestFileSet = { files: [file], checkpoint: 'checkpoint-1' };
		const result = await runUpdateIndex(client, fileSet);

		assert.ok(result.isOk(), `updateIndex should succeed, got: ${result.isError() ? result.err.message : ''}`);
		assert.strictEqual(fetcher.finalizeCallCount, 2, 'Finalize should be retried once after the 412');
		assert.strictEqual(fetcher.batchPollCount, 2, 'Batch should be re-polled for missing documents after the 412');
		assert.strictEqual(fetcher.documentUploadCount, 1, 'Document should be uploaded once when the server registers it after the first pass');
	});

	test('re-uploads documents the server still reports as missing after a 412', async () => {
		const file = createIngestFile('src/file1.ts', 'const x = 1;');
		const docShaId = Buffer.from(file.docSha).toString('base64');

		// The server still reports the document as missing on the second batch poll,
		// so the reconcile loop must re-upload it before finalize can succeed.
		const fetcher = new RecordingGithubApiFetcherService([docShaId], /* finalize412Count */ 1, /* batchPollsWithDocs */ 2);
		const client = createClient(fetcher);

		const fileSet: ExternalIngestFileSet = { files: [file], checkpoint: 'checkpoint-1' };
		const result = await runUpdateIndex(client, fileSet);

		assert.ok(result.isOk(), `updateIndex should succeed, got: ${result.isError() ? result.err.message : ''}`);
		assert.strictEqual(fetcher.finalizeCallCount, 2, 'Finalize should be retried once after the 412');
		assert.strictEqual(fetcher.documentUploadCount, 2, 'The still-missing document should be uploaded again on the retry pass');
	});

	test('updateIndex fails when finalize keeps returning 412 and documents remain missing', async () => {
		const file = createIngestFile('src/file1.ts', 'const x = 1;');
		const docShaId = Buffer.from(file.docSha).toString('base64');

		// The server keeps asking for the document on every batch poll and finalize
		// always reports a phase mismatch, so the run fails after exhausting retries.
		const fetcher = new RecordingGithubApiFetcherService([docShaId], /* finalize412Count */ 10, /* batchPollsWithDocs */ 10);
		const client = createClient(fetcher);

		const fileSet: ExternalIngestFileSet = { files: [file], checkpoint: 'checkpoint-1' };
		const result = await runUpdateIndex(client, fileSet);

		assert.ok(result.isError(), 'updateIndex should fail after exhausting finalize retries');
		assert.strictEqual(fetcher.finalizeCallCount, 3, 'Finalize should be attempted the maximum number of times');
	});

	test('reports a likely server-side issue when finalize 412s but no documents are missing', async () => {
		const file = createIngestFile('src/file1.ts', 'const x = 1;');
		const docShaId = Buffer.from(file.docSha).toString('base64');

		// The document is delivered on the first pass (batch reports nothing missing
		// afterwards) yet finalize keeps returning 412. Since the client cannot make
		// progress by re-uploading, it should surface a distinct server-side error.
		const fetcher = new RecordingGithubApiFetcherService([docShaId], /* finalize412Count */ 10, /* batchPollsWithDocs */ 1);
		const client = createClient(fetcher);

		const fileSet: ExternalIngestFileSet = { files: [file], checkpoint: 'checkpoint-1' };
		const result = await runUpdateIndex(client, fileSet);

		assert.ok(result.isError(), 'updateIndex should fail after exhausting finalize retries');
		assert.strictEqual(fetcher.finalizeCallCount, 3, 'Finalize should be attempted the maximum number of times');
		assert.match(result.isError() ? result.err.message : '', /no missing documents/i, 'Error should describe the server-side phase mismatch');
	});

	test('surfaces the underlying document upload failure instead of a finalize phase error', async () => {
		const file = createIngestFile('src/file1.ts', 'const x = 1;');
		const docShaId = Buffer.from(file.docSha).toString('base64');

		// The document upload persistently fails (i.e. it has already exhausted the
		// HTTP-layer retry budget). The run must fail with the real document error and
		// must never reach finalize - so the user sees the true cause, not a 412.
		const fetcher = new RecordingGithubApiFetcherService(
			[docShaId],
			/* finalize412Count */ 0,
			/* batchPollsWithDocs */ 1,
			{ count: 100, status: 500, requestId: 'doc-req-42' },
		);
		const client = createClient(fetcher);

		const fileSet: ExternalIngestFileSet = { files: [file], checkpoint: 'checkpoint-1' };
		const result = await runUpdateIndex(client, fileSet);

		assert.ok(result.isError(), 'updateIndex should fail when a document upload fails');
		const message = result.isError() ? result.err.message : '';
		assert.match(message, /Failed to upload 1 document/i, 'Error should describe the document upload failure');
		assert.match(message, /status 500/i, 'Error should include the real failure status');
		assert.match(message, /doc-req-42/, 'Error should include the failing requestId for diagnosis');
		assert.strictEqual(fetcher.finalizeCallCount, 0, 'Finalize should never be attempted when documents failed to upload');
	});

	test('aborts with a descriptive error when a document upload returns 404 (ingest gone)', async () => {
		const file = createIngestFile('src/file1.ts', 'const x = 1;');
		const docShaId = Buffer.from(file.docSha).toString('base64');

		// A 404 means the ingest itself is gone server-side. The pass must abort
		// deterministically with the "ingest not found" error and never reach finalize.
		const fetcher = new RecordingGithubApiFetcherService(
			[docShaId],
			/* finalize412Count */ 0,
			/* batchPollsWithDocs */ 1,
			{ count: 100, status: 404, requestId: 'doc-404' },
		);
		const client = createClient(fetcher);

		const fileSet: ExternalIngestFileSet = { files: [file], checkpoint: 'checkpoint-1' };
		const result = await runUpdateIndex(client, fileSet);

		assert.ok(result.isError(), 'updateIndex should fail when the ingest is gone (404)');
		assert.match(result.isError() ? result.err.message : '', /Ingest not found \(404\)/i, 'Error should describe the missing ingest');
		assert.strictEqual(fetcher.finalizeCallCount, 0, 'Finalize should never be attempted after a 404');
	});

	test('fails deterministically when the server requests a docSha with no local mapping', async () => {
		const file = createIngestFile('src/file1.ts', 'const x = 1;');

		// The server asks for a docSha the client never advertised (no local mapping).
		// The pass must fail deterministically with a descriptive error and never reach
		// finalize, rather than swallowing the mismatch and stranding the server.
		const unmappedDocShaId = Buffer.from('doc-sha-the-client-never-advertised').toString('base64');
		const fetcher = new RecordingGithubApiFetcherService([unmappedDocShaId], /* finalize412Count */ 0, /* batchPollsWithDocs */ 1);
		const client = createClient(fetcher);

		const fileSet: ExternalIngestFileSet = { files: [file], checkpoint: 'checkpoint-1' };
		const result = await runUpdateIndex(client, fileSet);

		assert.ok(result.isError(), 'updateIndex should fail when the server requests an unmapped docSha');
		const message = result.isError() ? result.err.message : '';
		assert.match(message, /Failed to upload 1 document/i, 'Error should describe the upload failure');
		assert.match(message, /unmapped docSha/i, 'Error should identify the unmapped docSha');
		assert.strictEqual(fetcher.documentUploadCount, 0, 'No document upload should be attempted for an unmapped docSha');
		assert.strictEqual(fetcher.finalizeCallCount, 0, 'Finalize should never be attempted for an unmapped docSha');
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { mock } from '../../../../util/common/test/simpleMock';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { IGitService } from '../../../git/common/gitService';
import { ILogService } from '../../../log/common/logService';
import { FetchOptions, IAbortController, IHeaders, IFetcherService, Response } from '../../../networking/common/fetcherService';
import { ScenarioAutomationWorkspaceChunkSearchService } from '../../node/scenarioAutomationWorkspaceChunkSearchService';
import { WorkspaceChunkSearchSizing } from '../../node/workspaceChunkSearchService';

const emptySizing: WorkspaceChunkSearchSizing = {
	endpoint: {} as WorkspaceChunkSearchSizing['endpoint'],
	tokenBudget: undefined,
	maxResults: 20,
};

const emptyQuery = { queryText: 'query text' };

class TestHeaders implements IHeaders {
	get(_name: string): string | null {
		return null;
	}

	[Symbol.iterator](): Iterator<[string, string]> {
		return [][Symbol.iterator]();
	}
}

class TestFetcherService extends mock<IFetcherService>() implements IFetcherService {
	public lastUrl: string | undefined;
	public lastOptions: FetchOptions | undefined;
	public fetchImpl: (url: string, options: FetchOptions) => Promise<Response> = () => Promise.reject(new Error('fetchImpl not configured'));

	override readonly onDidFetch = Event.None;
	override readonly onDidCompleteFetch = Event.None;

	override getUserAgentLibrary(): string {
		return 'test-fetcher';
	}

	override fetch(url: string, options: FetchOptions): Promise<Response> {
		this.lastUrl = url;
		this.lastOptions = options;
		return this.fetchImpl(url, options);
	}

	override createWebSocket(): never {
		throw new Error('Method not implemented.');
	}

	override disconnectAll(): Promise<unknown> {
		return Promise.resolve();
	}

	override makeAbortController(): IAbortController {
		return new AbortController();
	}

	override isAbortError(e: any): boolean {
		return e instanceof DOMException && e.name === 'AbortError';
	}

	override isInternetDisconnectedError(_e: any): boolean {
		return false;
	}

	override isFetcherError(_e: any): boolean {
		return false;
	}

	override isNetworkProcessCrashedError(_e: any): boolean {
		return false;
	}

	override getUserMessageForFetcherError(err: any): string {
		return String(err);
	}

	override fetchWithPagination<T>(): Promise<T[]> {
		throw new Error('Method not implemented.');
	}
}

class TestGitService extends mock<IGitService>() implements IGitService {
	override readonly repositories = [];
}

class TestLogService extends mock<ILogService>() implements ILogService {
	readonly errors: string[] = [];
	readonly traces: string[] = [];

	override trace(message: string): void {
		this.traces.push(message);
	}

	override error(message: string): void {
		this.errors.push(message);
	}
}

suite('ScenarioAutomationWorkspaceChunkSearchService', () => {
	let oldSwebenchRepo: string | undefined;
	let fetcherService: TestFetcherService;
	let gitService: TestGitService;
	let logService: TestLogService;
	let service: ScenarioAutomationWorkspaceChunkSearchService;

	beforeEach(() => {
		oldSwebenchRepo = process.env.SWEBENCH_REPO;
		process.env.SWEBENCH_REPO = 'owner/repo';

		fetcherService = new TestFetcherService();
		gitService = new TestGitService();
		logService = new TestLogService();
		service = new ScenarioAutomationWorkspaceChunkSearchService(fetcherService, gitService, logService);
	});

	afterEach(() => {
		process.env.SWEBENCH_REPO = oldSwebenchRepo;
	});

	test('sends expected request and respects glob pattern filtering', async () => {
		const responseBody = JSON.stringify({
			embedding_model: EmbeddingType.metis_1024_I16_Binary.id,
			results: [
				{
					location: { path: 'src/include.ts' },
					chunk: { text: 'one', line_range: { start: 1, end: 2 } },
					distance: 0.11,
				},
				{
					location: { path: 'src/ignore.ts' },
					chunk: { text: 'two', line_range: { start: 3, end: 4 } },
					distance: 0.22,
				},
			],
		});
		fetcherService.fetchImpl = async () => Response.fromText(200, 'OK', new TestHeaders(), responseBody, 'test-stub');

		const result = await service.searchFileChunks(
			emptySizing,
			emptyQuery,
			{ globPatterns: { include: ['**/include.ts'] } },
			new TelemetryCorrelationId('test'),
			undefined,
			CancellationToken.None,
		);

		assert.strictEqual(fetcherService.lastUrl, 'http://localhost:4443/api/embeddings/code/search');
		assert.strictEqual(fetcherService.lastOptions?.method, 'POST');
		assert.strictEqual(fetcherService.lastOptions?.headers?.['Content-Type'], 'application/json');
		assert.deepStrictEqual(JSON.parse(fetcherService.lastOptions?.body ?? '{}'), {
			scoping_query: 'repo:owner/repo',
			prompt: 'query text',
			include_embeddings: false,
			limit: 20,
			embedding_model: EmbeddingType.metis_1024_I16_Binary.id,
		});
		assert.strictEqual(result.chunks.length, 1);
		assert.ok(URI.isUri(result.chunks[0].chunk.file));
		assert.ok(result.chunks[0].chunk.file.path.endsWith('/src/include.ts'));
	});

	test('respects exclude glob pattern filtering', async () => {
		const responseBody = JSON.stringify({
			embedding_model: EmbeddingType.metis_1024_I16_Binary.id,
			results: [
				{
					location: { path: 'src/include.ts' },
					chunk: { text: 'one', line_range: { start: 1, end: 2 } },
					distance: 0.11,
				},
				{
					location: { path: 'src/ignore.ts' },
					chunk: { text: 'two', line_range: { start: 3, end: 4 } },
					distance: 0.22,
				},
			],
		});
		fetcherService.fetchImpl = async () => Response.fromText(200, 'OK', new TestHeaders(), responseBody, 'test-stub');

		const result = await service.searchFileChunks(
			emptySizing,
			emptyQuery,
			{ globPatterns: { exclude: ['**/ignore.ts'] } },
			new TelemetryCorrelationId('test'),
			undefined,
			CancellationToken.None,
		);

		assert.strictEqual(result.chunks.length, 1);
		assert.ok(result.chunks[0].chunk.file.path.endsWith('/src/include.ts'));
	});

	test('returns empty chunks on non-ok response', async () => {
		fetcherService.fetchImpl = async () => Response.fromText(500, 'Error', new TestHeaders(), 'failed', 'test-stub');

		const result = await service.searchFileChunks(
			emptySizing,
			emptyQuery,
			{},
			new TelemetryCorrelationId('test'),
			undefined,
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, { chunks: [] });
		assert.ok(logService.errors.some(e => e.includes('status 500')));
	});

	test('returns empty chunks on invalid json', async () => {
		fetcherService.fetchImpl = async () => Response.fromText(200, 'OK', new TestHeaders(), '{ this is not json', 'test-stub');

		const result = await service.searchFileChunks(
			emptySizing,
			emptyQuery,
			{},
			new TelemetryCorrelationId('test'),
			undefined,
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, { chunks: [] });
		assert.ok(logService.errors.some(e => e.includes('failed to parse response JSON')));
	});

	test('wires cancellation token to fetch signal', async () => {
		fetcherService.fetchImpl = (_url, options) => new Promise((_resolve, reject) => {
			options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
		});
		const cts = new CancellationTokenSource();

		const resultPromise = service.searchFileChunks(
			emptySizing,
			emptyQuery,
			{},
			new TelemetryCorrelationId('test'),
			undefined,
			cts.token,
		);

		cts.cancel();
		const result = await resultPromise;

		assert.deepStrictEqual(result, { chunks: [] });
		assert.strictEqual(fetcherService.lastOptions?.signal?.aborted, true);
		assert.ok(logService.traces.some(e => e.includes('search cancelled')));
	});
});

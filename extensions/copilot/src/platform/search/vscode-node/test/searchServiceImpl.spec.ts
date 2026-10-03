/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, MockInstance, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { MockFileSystemService } from '../../../filesystem/node/test/mockFileSystemService';
import { IIgnoreService } from '../../../ignore/common/ignoreService';
import { BaseIgnoreService } from '../../../ignore/node/ignoreServiceImpl';
import { MockAuthenticationService } from '../../../ignore/node/test/mockAuthenticationService';
import { MockCAPIClientService, rulesResponse, type MockExclusionRules } from '../../../ignore/node/test/mockCAPIClientService';
import { MockGitService } from '../../../ignore/node/test/mockGitService';
import { MockSearchService } from '../../../ignore/node/test/mockSearchService';
import { MockWorkspaceService } from '../../../ignore/node/test/mockWorkspaceService';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { TestLogService } from '../../../testing/common/testLogService';
import { BaseSearchServiceImpl } from '../../vscode/baseSearchServiceImpl';
import { excludeIgnoredTextSearchResults, SearchServiceImpl } from '../searchServiceImpl';

/** An ignore service that excludes an explicit set of files, as a content exclusion rule would. */
function ignoreServiceExcluding(...excluded: URI[]): IIgnoreService {
	const excludedFiles = new Set(excluded.map(uri => uri.toString()));
	return {
		_serviceBrand: undefined,
		isEnabled: true,
		isRegexExclusionsEnabled: false,
		dispose: () => { },
		init: () => Promise.resolve(),
		isCopilotIgnored: (file: URI) => Promise.resolve(excludedFiles.has(file.toString())),
		asMinimatchPattern: () => Promise.resolve(undefined)
	};
}

function textSearchResponse(results: vscode.TextSearchResult2[], complete: Promise<vscode.TextSearchComplete2> = Promise.resolve({})): vscode.FindTextInFilesResponse {
	return {
		results: (async function* () {
			for (const result of results) {
				yield result;
			}
		})(),
		complete
	};
}

/** A text search hit carrying the matching line, which is what an exclusion rule must protect. */
function match(uri: URI, text: string): vscode.TextSearchResult2 {
	return { uri, ranges: [], previewText: text } as unknown as vscode.TextSearchResult2;
}

suite('excludeIgnoredTextSearchResults', () => {
	const excludedFile = URI.file('/workspace/repo/secrets.ts');
	const allowedFile = URI.file('/workspace/repo/index.ts');

	async function collect(response: vscode.FindTextInFilesResponse): Promise<string[]> {
		const seen: string[] = [];
		for await (const result of response.results) {
			seen.push(result.uri.toString());
		}
		return seen;
	}

	/** Wraps a ready made response, capturing the token the search was started with. */
	function fromResponse(response: vscode.FindTextInFilesResponse | Promise<vscode.FindTextInFilesResponse>) {
		const tokens: vscode.CancellationToken[] = [];
		return {
			tokens,
			start: (token: vscode.CancellationToken) => {
				tokens.push(token);
				return Promise.resolve(response);
			}
		};
	}

	test('drops matches from a content excluded file', async () => {
		const response = excludeIgnoredTextSearchResults(
			ignoreServiceExcluding(excludedFile),
			undefined,
			fromResponse(textSearchResponse([
				match(excludedFile, 'const apiKey = "sk-live-1234";'),
				match(allowedFile, 'export const a = 1;')
			])).start
		);

		expect(await collect(response)).toEqual([allowedFile.toString()]);
	});

	test('keeps every match when nothing is excluded', async () => {
		const response = excludeIgnoredTextSearchResults(
			ignoreServiceExcluding(),
			undefined,
			fromResponse(textSearchResponse([match(excludedFile, 'a'), match(allowedFile, 'b')])).start
		);

		expect(await collect(response)).toEqual([excludedFile.toString(), allowedFile.toString()]);
	});

	test('does not let excluded matches consume the caller limit', async () => {
		// The excluded hits arrive first, so a limit applied before filtering would return nothing.
		const allowed = [URI.file('/workspace/repo/a.ts'), URI.file('/workspace/repo/b.ts')];
		const response = excludeIgnoredTextSearchResults(
			ignoreServiceExcluding(excludedFile),
			2,
			fromResponse(textSearchResponse([
				match(excludedFile, 'secret one'),
				match(excludedFile, 'secret two'),
				match(allowed[0], 'a'),
				match(allowed[1], 'b')
			])).start
		);

		expect(await collect(response)).toEqual(allowed.map(uri => uri.toString()));
	});

	test('stops the search once the caller limit is met', async () => {
		const search = fromResponse(textSearchResponse([
			match(allowedFile, 'a'),
			match(allowedFile, 'b'),
			match(allowedFile, 'c')
		]));
		const response = excludeIgnoredTextSearchResults(ignoreServiceExcluding(), 2, search.start);

		const seen = await collect(response);

		expect({ seen: seen.length, searchCancelled: search.tokens[0].isCancellationRequested })
			.toEqual({ seen: 2, searchCancelled: true });
	});

	test('surfaces the underlying completion result', async () => {
		const response = excludeIgnoredTextSearchResults(
			ignoreServiceExcluding(excludedFile),
			undefined,
			fromResponse(textSearchResponse([], Promise.resolve({ limitHit: true }))).start
		);

		expect(await response.complete).toEqual({ limitHit: true });
	});

	test('reports a failed search to a caller that awaits completion', async () => {
		const response = excludeIgnoredTextSearchResults(
			ignoreServiceExcluding(),
			undefined,
			() => Promise.reject(new Error('search provider failed'))
		);

		await expect(response.complete).rejects.toThrow('search provider failed');
	});

	test('does not raise an unhandled rejection when a failed search is abandoned', async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', onUnhandled);
		try {
			// Neither member of the response is ever consumed, which is what an aborted tool call
			// leaves behind.
			excludeIgnoredTextSearchResults(ignoreServiceExcluding(), undefined, () => Promise.reject(new Error('search provider failed')));
			await new Promise(resolve => setTimeout(resolve, 10));
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}

		expect(unhandled).toEqual([]);
	});
});

suite('SearchServiceImpl', () => {
	const excludedFile = URI.file('/workspace/repo/secrets/keys.ts');
	const allowedFile = URI.file('/workspace/repo/index.ts');
	/** Stands in for the workspace search that the service wraps. */
	let search: MockInstance<BaseSearchServiceImpl['findFiles']>;

	/** An ignore service with a glob rule for the search and a record of every file it was asked about. */
	function ignoreServiceRecording(checked: string[], ...excluded: URI[]): IIgnoreService {
		const service = ignoreServiceExcluding(...excluded);
		return {
			...service,
			asMinimatchPattern: () => Promise.resolve('**/secrets/**'),
			isCopilotIgnored: (file: URI) => {
				checked.push(file.toString());
				return service.isCopilotIgnored(file);
			}
		};
	}

	beforeEach(() => {
		search = vi.spyOn(BaseSearchServiceImpl.prototype, 'findFiles');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('findFilesWithDefaultExcludes narrows the search and checks each result once', async () => {
		// A second pass over the results doubled the cost of filtering a whole-workspace search.
		search.mockResolvedValue([excludedFile, allowedFile]);
		const checked: string[] = [];
		const service = new SearchServiceImpl(ignoreServiceRecording(checked, excludedFile), new TestLogService());

		const results = await service.findFilesWithDefaultExcludes('**/*', 100, CancellationToken.None);

		expect({
			results: results.map(uri => uri.toString()),
			checked,
			searches: search.mock.calls.map(([, options]) => ({ exclude: options?.exclude, maxResults: options?.maxResults }))
		}).toEqual({
			results: [allowedFile.toString()],
			checked: [excludedFile.toString(), allowedFile.toString()],
			searches: [{ exclude: ['**/secrets/**'], maxResults: 100 }]
		});
	});

	test('findFiles does not let excluded files consume the caller limit', async () => {
		// A nested repository rule cannot narrow the search, so its files still come back from it.
		search.mockImplementation(async (_pattern, options) => [excludedFile, allowedFile].slice(0, options?.maxResults));
		const service = new SearchServiceImpl(ignoreServiceRecording([], excludedFile), new TestLogService());

		const results = await service.findFiles('**/*', { maxResults: 1 });

		expect({
			results: results.map(uri => uri.toString()),
			searchedMaxResults: search.mock.calls.map(([, options]) => options?.maxResults)
		}).toEqual({
			results: [allowedFile.toString()],
			searchedMaxResults: [1, undefined]
		});
	});

	test('findFiles keeps the caller limit when a full page has no excluded files', async () => {
		search.mockImplementation(async (_pattern, options) => [allowedFile, excludedFile].slice(0, options?.maxResults));
		const service = new SearchServiceImpl(ignoreServiceRecording([], excludedFile), new TestLogService());

		const results = await service.findFiles('**/*', { maxResults: 1 });

		expect({
			results: results.map(uri => uri.toString()),
			searchedMaxResults: search.mock.calls.map(([, options]) => options?.maxResults)
		}).toEqual({
			results: [allowedFile.toString()],
			searchedMaxResults: [1]
		});
	});

	test('findFiles applies the caller limit to the allowed results in order', async () => {
		const allowed = [URI.file('/workspace/repo/a.ts'), URI.file('/workspace/repo/b.ts'), URI.file('/workspace/repo/c.ts')];
		search.mockResolvedValue([excludedFile, ...allowed]);
		const service = new SearchServiceImpl(ignoreServiceRecording([], excludedFile), new TestLogService());

		const [limited, zero, unlimited] = await Promise.all([
			service.findFiles('**/*', { maxResults: 2 }),
			service.findFiles('**/*', { maxResults: 0 }),
			service.findFiles('**/*')
		]);

		expect([limited, zero, unlimited].map(results => results.map(uri => uri.toString()))).toEqual([
			allowed.slice(0, 2).map(uri => uri.toString()),
			allowed.map(uri => uri.toString()),
			allowed.map(uri => uri.toString())
		]);
	});

	test('findFilesWithDefaultExcludes returns the first allowed file when one result is requested', async () => {
		search.mockImplementation(async (_pattern, options) => [excludedFile, allowedFile].slice(0, options?.maxResults));
		const service = new SearchServiceImpl(ignoreServiceRecording([], excludedFile), new TestLogService());

		const result = await service.findFilesWithDefaultExcludes('**/*', 1, CancellationToken.None);

		expect(result?.toString()).toBe(allowedFile.toString());
	});

	test('findFilesWithDefaultExcludes withholds a single result that is excluded', async () => {
		search.mockResolvedValue([excludedFile]);
		const service = new SearchServiceImpl(ignoreServiceRecording([], excludedFile), new TestLogService());

		expect(await service.findFilesWithDefaultExcludes('**/*', 1, CancellationToken.None)).toBeUndefined();
	});

	test('findFiles does not let a nested repository rule exclude its parent or sibling repositories', async () => {
		const parent = '/workspace/parent';
		const nested = '/workspace/parent/libs/excluded';
		const sibling = '/workspace/sibling';
		const remoteFor = (root: string) => `https://github.com/org/${root.split('/').pop()}.git`;
		const byLongestRoot = [parent, nested, sibling].sort((a, b) => b.length - a.length);

		const gitService = new MockGitService();
		gitService.getRepositoryFetchUrls = vi.fn().mockImplementation((uri: URI) => {
			const root = byLongestRoot.find(candidate => uri.path === candidate || uri.path.startsWith(candidate + '/'));
			return Promise.resolve(root ? { rootUri: URI.file(root), remoteFetchUrls: [remoteFor(root)] } : undefined);
		});
		const capiClientService = new MockCAPIClientService();
		capiClientService.setResponder(repos => rulesResponse(new Map<string, MockExclusionRules>([
			['non-git-file', { paths: ['**/*.pem'] }],
			[remoteFor(nested), { paths: ['*'] }]
		]), repos));
		const authService = new MockAuthenticationService();
		authService.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token', copilotignore_enabled: true }));
		// Serves the repository discovery the ignore service runs before building its exclude.
		const repoDiscovery = new MockSearchService();
		repoDiscovery.setResults([parent, nested, sibling].map(root => URI.file(`${root}/.git/HEAD`)));
		const ignoreService = new BaseIgnoreService(
			gitService,
			new TestLogService(),
			authService as unknown as IAuthenticationService,
			new MockWorkspaceService(),
			capiClientService as unknown as ICAPIClientService,
			repoDiscovery,
			new MockFileSystemService(),
			new NullRequestLogger()
		);

		const parentFile = URI.file(`${parent}/src/app.ts`);
		const nestedFile = URI.file(`${nested}/index.ts`);
		const siblingFile = URI.file(`${sibling}/index.ts`);
		search.mockResolvedValue([parentFile, nestedFile, siblingFile]);
		const service = new SearchServiceImpl(ignoreService, new TestLogService());

		const results = await service.findFiles('**/*');
		ignoreService.dispose();

		// Only the organization rule may narrow the search; the nested repository's `*` is enforced per result.
		expect({
			results: results.map(uri => uri.toString()),
			excludes: search.mock.calls.map(([, options]) => options?.exclude)
		}).toEqual({
			results: [parentFile.toString(), siblingFile.toString()],
			excludes: [['**/*.pem']]
		});
	});
});

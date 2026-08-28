/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import { IIgnoreService } from '../../../ignore/common/ignoreService';
import { excludeIgnoredTextSearchResults } from '../searchServiceImpl';

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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../vscodeTypes';
import { GrepResultService, MAX_GREP_RESULT_SESSIONS, NullGrepResultService } from '../grepResultService';

suite('GrepResultService', () => {
	const uri = URI.file('/file.ts');
	const sessionUri = URI.file('/session');

	function createMatch(range: vscode.Range): vscode.TextSearchMatch2 {
		return {
			uri,
			previewText: '',
			ranges: [{
				previewRange: range,
				sourceRange: range,
			}]
		};
	}

	test('returns all ranges overlapping the inclusive line bounds', () => {
		const overlappingStart = new Range(2, 2, 4, 1);
		const before = new Range(3, 0, 3, 1);
		const first = new Range(4, 2, 4, 5);
		const second = new Range(8, 1, 8, 7);
		const after = new Range(9, 0, 9, 1);
		const service = new GrepResultService();
		service.addGrepResult(sessionUri, 'request', {
			files: [{ uri, matches: [overlappingStart, before, first, second, after].map(createMatch) }]
		});

		expect(service.getGrepResult(sessionUri, uri, 4, 8)).toEqual([overlappingStart, first, second]);
	});

	test('returns unique ranges starting with the latest grep result', () => {
		const older = new Range(4, 2, 4, 5);
		const duplicate = new Range(6, 1, 6, 7);
		const latest = new Range(8, 0, 8, 3);
		const service = new GrepResultService();
		service.addGrepResult(sessionUri, 'first-request', {
			files: [{ uri, matches: [older, duplicate].map(createMatch) }]
		});
		service.addGrepResult(sessionUri, 'second-request', {
			files: [{ uri, matches: [duplicate, latest].map(createMatch) }]
		});

		expect(service.getGrepResult(sessionUri, uri, 0, 10)).toEqual([duplicate, latest, older]);
	});

	test('fires the session URI and request ID when the oldest grep result is removed', () => {
		const service = new GrepResultService();
		const removedResults: { sessionUri: vscode.Uri; requestId: string }[] = [];
		service.onDidRemoveGrepResult(result => removedResults.push(result));

		for (let i = 0; i < 17; i++) {
			service.addGrepResult(sessionUri, `request-${i}`, { files: [] });
		}

		expect(removedResults).toEqual([{ sessionUri, requestId: 'request-0' }]);
		service.dispose();
	});

	test('fires for all grep results when the least recently used session is removed', () => {
		const service = new GrepResultService();
		const removedResults: { sessionUri: vscode.Uri; requestId: string }[] = [];
		service.onDidRemoveGrepResult(result => removedResults.push(result));
		const sessionUris = Array.from({ length: MAX_GREP_RESULT_SESSIONS + 1 }, (_, index) => URI.file(`/session-${index}`));

		service.addGrepResult(sessionUris[0], 'request-0', { files: [] });
		service.addGrepResult(sessionUris[1], 'request-1-first', { files: [] });
		service.addGrepResult(sessionUris[1], 'request-1-second', { files: [] });
		for (let i = 2; i < MAX_GREP_RESULT_SESSIONS; i++) {
			service.addGrepResult(sessionUris[i], `request-${i}`, { files: [] });
		}
		service.getGrepResult(sessionUris[0], uri, 0, 0);
		service.addGrepResult(sessionUris[MAX_GREP_RESULT_SESSIONS], `request-${MAX_GREP_RESULT_SESSIONS}`, { files: [] });

		expect(removedResults).toEqual([
			{ sessionUri: sessionUris[1], requestId: 'request-1-first' },
			{ sessionUri: sessionUris[1], requestId: 'request-1-second' },
		]);
		service.dispose();
	});

	test('returns undefined when no results are available', () => {
		const service = new GrepResultService();

		expect(service.getGrepResult(sessionUri, uri, 0, 10)).toBeUndefined();
		expect(new NullGrepResultService().getGrepResult(sessionUri, uri, 0, 10)).toBeUndefined();
	});
});

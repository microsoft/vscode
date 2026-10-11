/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { afterAll, afterEach, expect, suite, test } from 'vitest';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../vscodeTypes';
import { GrepResultService, MAX_GREP_RESULT_SESSIONS, NullGrepResultService } from '../grepResultService';

suite('GrepResultService', () => {
	const store = new DisposableStore();
	const uri = URI.file('/file.ts');
	const sessionUri = URI.file('/session');

	afterEach(() => store.clear());
	afterAll(() => store.dispose());

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
		const service = store.add(new GrepResultService());
		service.addGrepResult(sessionUri, 'request', {
			files: [{ uri, matches: [overlappingStart, before, first, second, after].map(createMatch) }]
		});

		expect(service.getGrepResult(sessionUri, uri, 4, 8)).toEqual([overlappingStart, first, second]);
	});

	test('returns unique ranges starting with the latest grep result', () => {
		const older = new Range(4, 2, 4, 5);
		const duplicate = new Range(6, 1, 6, 7);
		const latest = new Range(8, 0, 8, 3);
		const service = store.add(new GrepResultService());
		service.addGrepResult(sessionUri, 'first-request', {
			files: [{ uri, matches: [older, duplicate].map(createMatch) }]
		});
		service.addGrepResult(sessionUri, 'second-request', {
			files: [{ uri, matches: [duplicate, latest].map(createMatch) }]
		});

		expect(service.getGrepResult(sessionUri, uri, 0, 10)).toEqual([duplicate, latest, older]);
	});

	test('evicts the oldest grep result without removing the session', () => {
		const service = store.add(new GrepResultService());
		const removedSessions: vscode.Uri[] = [];
		store.add(service.onDidRemoveSession(session => removedSessions.push(session)));
		const oldest = new Range(0, 0, 0, 1);
		const retained = new Range(1, 0, 1, 1);
		service.addGrepResult(sessionUri, 'request-0', {
			files: [{ uri, matches: [createMatch(oldest)] }],
		});

		for (let i = 1; i < 17; i++) {
			service.addGrepResult(sessionUri, `request-${i}`, {
				files: [{ uri, matches: [createMatch(retained)] }],
			});
		}

		expect({
			removedSessions,
			matches: service.getGrepResult(sessionUri, uri, 0, 10),
		}).toEqual({
			removedSessions: [],
			matches: [retained],
		});
	});

	test('fires once when the least recently used session is removed', () => {
		const service = store.add(new GrepResultService());
		const removedSessions: vscode.Uri[] = [];
		store.add(service.onDidRemoveSession(session => removedSessions.push(session)));
		const sessionUris = Array.from({ length: MAX_GREP_RESULT_SESSIONS + 1 }, (_, index) => URI.file(`/session-${index}`));

		service.addGrepResult(sessionUris[0], 'request-0', { files: [] });
		service.addGrepResult(sessionUris[1], 'request-1-first', { files: [] });
		service.addGrepResult(sessionUris[1], 'request-1-second', { files: [] });
		for (let i = 2; i < MAX_GREP_RESULT_SESSIONS; i++) {
			service.addGrepResult(sessionUris[i], `request-${i}`, { files: [] });
		}
		service.getGrepResult(sessionUris[0], uri, 0, 0);
		service.addGrepResult(sessionUris[MAX_GREP_RESULT_SESSIONS], `request-${MAX_GREP_RESULT_SESSIONS}`, { files: [] });

		expect({
			removedSessions,
			evictedMatches: service.getGrepResult(sessionUris[1], uri, 0, 10),
			retainedMatches: service.getGrepResult(sessionUris[0], uri, 0, 10),
		}).toEqual({
			removedSessions: [sessionUris[1]],
			evictedMatches: undefined,
			retainedMatches: [],
		});
	});

	test('returns undefined when no results are available', () => {
		const service = store.add(new GrepResultService());

		expect(service.getGrepResult(sessionUri, uri, 0, 10)).toBeUndefined();
		expect(new NullGrepResultService().getGrepResult(sessionUri, uri, 0, 10)).toBeUndefined();
	});
});

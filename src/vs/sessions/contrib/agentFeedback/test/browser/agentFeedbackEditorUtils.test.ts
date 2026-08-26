/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getFeedbackSessionCandidates } from '../../browser/agentFeedbackEditorUtils.js';

suite('getFeedbackSessionCandidates', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionA = URI.parse('test://session/a');
	const sessionB = URI.parse('test://session/b');

	/** A Changes multi-diff contributes an original and a modified URI per file. */
	function multiDiffCandidates(fileCount: number): URI[] {
		const candidates: URI[] = [];
		for (let i = 0; i < fileCount; i++) {
			candidates.push(URI.file(`/workspace/original/file${i}.ts`));
			candidates.push(URI.file(`/workspace/modified/file${i}.ts`));
		}
		return candidates;
	}

	test('yields each session once for a large multi-diff', () => {
		const candidates = multiDiffCandidates(2000);
		let resolveCount = 0;
		const resolved = [...getFeedbackSessionCandidates(candidates, resource => {
			resolveCount++;
			return resource.path.includes('file0.') ? sessionA : sessionB;
		})];

		assert.deepStrictEqual({
			sessions: resolved.map(candidate => candidate.sessionResource.toString()),
			resources: resolved.map(candidate => candidate.resource.path),
			resolveCount,
		}, {
			sessions: [sessionA.toString(), sessionB.toString()],
			resources: ['/workspace/original/file0.ts', '/workspace/original/file1.ts'],
			resolveCount: candidates.length,
		});
	});

	test('skips candidates without a session and stops resolving once the caller breaks', () => {
		const candidates = multiDiffCandidates(3);
		const resolvedResources: string[] = [];
		for (const { sessionResource } of getFeedbackSessionCandidates(candidates, resource => {
			resolvedResources.push(resource.path);
			return resource.path.includes('file0.') ? undefined : sessionA;
		})) {
			assert.strictEqual(sessionResource.toString(), sessionA.toString());
			break;
		}

		assert.deepStrictEqual(resolvedResources, [
			'/workspace/original/file0.ts',
			'/workspace/modified/file0.ts',
			'/workspace/original/file1.ts',
		]);
	});
});

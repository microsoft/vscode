/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { findDeepestContainingWorkingDirectory, selectRepositoryRootForBlobPath } from '../../common/agentHostWorkingDirectories.js';

suite('agentHostWorkingDirectories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('findDeepestContainingWorkingDirectory', () => {
		test('returns the deepest containing directory', () => {
			const match = findDeepestContainingWorkingDirectory(
				URI.file('/repo/nested/x.ts'),
				[URI.file('/repo'), URI.file('/repo/nested'), URI.file('/other')],
			);
			assert.strictEqual(match?.toString(), URI.file('/repo/nested').toString());
		});

		test('returns undefined when nothing contains the resource', () => {
			assert.strictEqual(findDeepestContainingWorkingDirectory(URI.file('/z/x.ts'), [URI.file('/a'), URI.file('/b')]), undefined);
		});
	});

	suite('selectRepositoryRootForBlobPath (git-blob Option A)', () => {
		test('selects the repository root that owns the blob path', () => {
			const root = selectRepositoryRootForBlobPath('/repoB/y.ts', [URI.file('/repoA'), URI.file('/repoB')]);
			assert.strictEqual(root?.toString(), URI.file('/repoB').toString());
		});

		test('repo-subdirectory session: a file elsewhere in the repo still resolves to the repo root', () => {
			// Repo root is /repo (even though the session cwd may be /repo/packages/app).
			const root = selectRepositoryRootForBlobPath('/repo/packages/lib/b.ts', [URI.file('/repo')]);
			assert.strictEqual(root?.toString(), URI.file('/repo').toString());
		});

		test('nested repositories: deepest containing root wins', () => {
			const root = selectRepositoryRootForBlobPath('/repo/vendor/dep/f.ts', [URI.file('/repo'), URI.file('/repo/vendor/dep')]);
			assert.strictEqual(root?.toString(), URI.file('/repo/vendor/dep').toString());
		});

		test('returns undefined when the blob is outside every repository root (→ NotFound)', () => {
			assert.strictEqual(selectRepositoryRootForBlobPath('/outside/f.ts', [URI.file('/repoA'), URI.file('/repoB')]), undefined);
		});

		test('reconstructs paths with spaces and unicode and still matches', () => {
			const root = selectRepositoryRootForBlobPath('/a repo/файл dir/файл.txt', [URI.file('/a repo')]);
			assert.strictEqual(root?.toString(), URI.file('/a repo').toString());
		});
	});
});

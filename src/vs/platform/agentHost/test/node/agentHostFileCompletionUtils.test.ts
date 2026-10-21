/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { findDeepestContainingWorkingDirectory } from '../../common/agentHostWorkingDirectories.js';
import { resolveAgentHostFileCompletionRoots } from '../../node/agentHostFileCompletionUtils.js';

suite('AgentHostFileCompletionUtils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const toPaths = (resources: readonly URI[]) => resources.map(resource => resource.path);

	test('normalizes and deduplicates local roots while preserving order', () => {
		const result = resolveAgentHostFileCompletionRoots([
			URI.file('/project/a/'),
			URI.file('/project/b'),
			URI.file('/project/a'),
			URI.parse('vscode-vfs://github/project/c'),
		]);

		assert.deepStrictEqual({
			logical: toPaths(result.logicalRoots),
			enumeration: toPaths(result.enumerationRoots),
		}, {
			logical: ['/project/a', '/project/b'],
			enumeration: ['/project/a', '/project/b'],
		});
	});

	test('enumerates only the outermost declared roots', () => {
		const result = resolveAgentHostFileCompletionRoots([
			URI.file('/project/a/sub/one'),
			URI.file('/project/b'),
			URI.file('/project/a'),
			URI.file('/project/a/sub'),
		]);

		assert.deepStrictEqual({
			logical: toPaths(result.logicalRoots),
			enumeration: toPaths(result.enumerationRoots),
		}, {
			logical: ['/project/a/sub/one', '/project/b', '/project/a', '/project/a/sub'],
			enumeration: ['/project/b', '/project/a'],
		});
	});

	test('does not synthesize a common ancestor for sibling roots', () => {
		const result = resolveAgentHostFileCompletionRoots([
			URI.file('/project/a'),
			URI.file('/project/b'),
		]);

		assert.deepStrictEqual(toPaths(result.enumerationRoots), ['/project/a', '/project/b']);
	});

	test('attributes resources to the deepest containing logical root', () => {
		const roots = [
			URI.file('/project/a'),
			URI.file('/project/a/sub'),
			URI.file('/project/b'),
		];

		assert.deepStrictEqual({
			nested: findDeepestContainingWorkingDirectory(URI.file('/project/a/sub/file.ts'), roots)?.path,
			parent: findDeepestContainingWorkingDirectory(URI.file('/project/a/other.ts'), roots)?.path,
			sibling: findDeepestContainingWorkingDirectory(URI.file('/project/b/file.ts'), roots)?.path,
			outside: findDeepestContainingWorkingDirectory(URI.file('/project/c/file.ts'), roots)?.path,
		}, {
			nested: '/project/a/sub',
			parent: '/project/a',
			sibling: '/project/b',
			outside: undefined,
		});
	});
});

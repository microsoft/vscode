/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import 'mocha';
import { RelativeWorkspacePathResolver } from '../../utils/relativePathResolver';

suite('RelativeWorkspacePathResolver', () => {

	test('should resolve paths with explicit ./ prefix and folder name', () => {
		const result = RelativeWorkspacePathResolver.resolveForFolder(
			'./myFolder/node_modules/typescript/lib',
			'myFolder',
			'/workspace/myFolder'
		);
		assert.strictEqual(result, path.join('/workspace/myFolder', 'node_modules/typescript/lib'));
	});

	test('should not resolve paths that start with folder name but without ./ prefix', () => {
		// This is the bug from issue #272761: when the workspace folder name
		// matches the start of the relative path, the prefix should NOT be stripped
		// unless it is explicitly prefixed with ./
		const result = RelativeWorkspacePathResolver.resolveForFolder(
			'x/.yarn/sdks/typescript/lib',
			'x',
			'/path/to/x'
		);
		assert.strictEqual(result, undefined);
	});

	test('should resolve ./ prefixed path when folder name matches a subdirectory', () => {
		const result = RelativeWorkspacePathResolver.resolveForFolder(
			'./x/.yarn/sdks/typescript/lib',
			'x',
			'/path/to/x'
		);
		assert.strictEqual(result, path.join('/path/to/x', '.yarn/sdks/typescript/lib'));
	});

	test('should return undefined for unrelated paths', () => {
		const result = RelativeWorkspacePathResolver.resolveForFolder(
			'other/path/here',
			'myFolder',
			'/workspace/myFolder'
		);
		assert.strictEqual(result, undefined);
	});

	test('should handle backslash paths on Windows', () => {
		const result = RelativeWorkspacePathResolver.resolveForFolder(
			'.\\myFolder\\node_modules\\typescript\\lib',
			'myFolder',
			'/workspace/myFolder'
		);
		assert.strictEqual(result, path.join('/workspace/myFolder', 'node_modules\\typescript\\lib'));
	});

	test('should not resolve backslash paths without ./ prefix', () => {
		const result = RelativeWorkspacePathResolver.resolveForFolder(
			'x\\.yarn\\sdks\\typescript\\lib',
			'x',
			'C:\\path\\to\\x'
		);
		assert.strictEqual(result, undefined);
	});
});

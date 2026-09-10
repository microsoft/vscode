/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { stripWorkspaceFolderPrefix } from '../../browser/anythingQuickAccess.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('AnythingQuickAccess - stripWorkspaceFolderPrefix', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeFolder(uri: string, name?: string): IWorkspaceFolder {
		const folderUri = URI.file(uri);
		return {
			uri: folderUri,
			name: name ?? folderUri.path.split('/').pop() ?? '',
			index: 0,
			toResource(relativePath: string): URI {
				return URI.joinPath(folderUri, relativePath);
			}
		};
	}

	test('returns undefined when no path separator is present', () => {
		const folder = makeFolder('/repo/workspace_1');
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_1', folder), undefined);
	});

	test('returns undefined when the separator is the first character', () => {
		const folder = makeFolder('/repo/workspace_1');
		// Note: a leading '/' would be an absolute path; the caller never calls us in that case,
		// but for defense in depth we still return undefined.
		assert.strictEqual(stripWorkspaceFolderPrefix('/test_file.txt', folder), undefined);
	});

	test('strips matching folder basename from forward-slash path', () => {
		const folder = makeFolder('/repo/workspace_1');
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_1/test_file.txt', folder), 'test_file.txt');
	});

	test('strips matching folder basename from backslash path', () => {
		const folder = makeFolder('/repo/workspace_1');
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_1\\test_file.txt', folder), 'test_file.txt');
	});

	test('strips matching folder display name (different from basename)', () => {
		const folder = makeFolder('/repo/code', 'Source');
		assert.strictEqual(stripWorkspaceFolderPrefix('Source/main.py', folder), 'main.py');
		assert.strictEqual(stripWorkspaceFolderPrefix('code/main.py', folder), 'main.py');
	});

	test('matches case-insensitively', () => {
		const folder = makeFolder('/repo/Workspace_1');
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_1/test.txt', folder), 'test.txt');
		assert.strictEqual(stripWorkspaceFolderPrefix('WORKSPACE_1/test.txt', folder), 'test.txt');
	});

	test('returns undefined when first segment does not match', () => {
		const folder = makeFolder('/repo/workspace_1');
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_2/test.txt', folder), undefined);
		assert.strictEqual(stripWorkspaceFolderPrefix('other/test.txt', folder), undefined);
	});

	test('does not strip on a partial-name match', () => {
		const folder = makeFolder('/repo/workspace_1');
		// "workspace" is a prefix but the segment is "workspace_12" which is not equal.
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_12/test.txt', folder), undefined);
	});

	test('preserves nested path remainder', () => {
		const folder = makeFolder('/repo/workspace_1');
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_1/sub/dir/file.ts', folder), 'sub/dir/file.ts');
	});

	test('returns undefined when nothing is left after stripping', () => {
		const folder = makeFolder('/repo/workspace_1');
		assert.strictEqual(stripWorkspaceFolderPrefix('workspace_1/', folder), undefined);
	});
});

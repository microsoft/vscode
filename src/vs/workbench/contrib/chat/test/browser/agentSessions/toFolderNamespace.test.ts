/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { toFolderNamespace } from '../../../browser/agentSessions/agentHost/agentHostSessionListStore.js';

suite('toFolderNamespace', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const remoteFolder = URI.parse('vscode-remote://dev-container%2Babc/workspace/printstream');
	const contains = (directory: URI, folder: URI) =>
		extUriBiasedIgnorePathCase.isEqualOrParent(toFolderNamespace(directory, folder), folder);

	test('a remote host reporting its own file: path matches the window folder', () => {
		// What the host actually emits for a session in a dev container, against
		// the vscode-remote: folder of the window showing the list.
		assert.strictEqual(contains(URI.parse('file:///workspace/printstream'), remoteFolder), true);
	});

	test('a nested working directory still matches, and an unrelated one does not', () => {
		assert.deepStrictEqual({
			nested: contains(URI.parse('file:///workspace/printstream/packages/api'), remoteFolder),
			sibling: contains(URI.parse('file:///workspace/other'), remoteFolder),
			prefixOnly: contains(URI.parse('file:///workspace/printstream-2'), remoteFolder),
		}, {
			nested: true,
			sibling: false,
			prefixOnly: false,
		});
	});

	test('the already-remote form is unaffected', () => {
		assert.strictEqual(contains(URI.parse('vscode-remote://dev-container%2Babc/workspace/printstream'), remoteFolder), true);
	});

	test('a local window is untouched', () => {
		const localFolder = URI.file('/home/me/project');
		assert.deepStrictEqual({
			same: contains(URI.file('/home/me/project'), localFolder),
			nested: contains(URI.file('/home/me/project/src'), localFolder),
			other: contains(URI.file('/home/me/elsewhere'), localFolder),
			// A remote directory must not be rewritten into a local folder.
			remoteDirectory: contains(URI.parse('vscode-remote://dev-container%2Babc/home/me/project'), localFolder),
		}, {
			same: true,
			nested: true,
			other: false,
			remoteDirectory: false,
		});
	});

	test('a different remote authority does not match', () => {
		// The rewrite adopts the folder's authority, so this only holds because
		// the directory is already remote and is therefore left alone.
		assert.strictEqual(
			contains(URI.parse('vscode-remote://dev-container%2Bother/workspace/printstream'), remoteFolder),
			false,
		);
	});
});

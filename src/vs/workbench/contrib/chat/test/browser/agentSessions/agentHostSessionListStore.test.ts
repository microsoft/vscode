/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { matchesFolder } from '../../../browser/agentSessions/agentHost/agentHostSessionListStore.js';

suite('AgentHostSessionListStore - folder matching', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const remoteFolder = URI.parse('vscode-remote://dev-container%2Babc/workspace/printstream');
	const contains = (directory: URI, folder: URI) => matchesFolder(directory, folder);

	test('a remote host reporting its own file: path matches the window folder', () => {
		// What the host emits for a session in a dev container.
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
		// Holds only because an already-remote directory is left alone.
		assert.strictEqual(
			contains(URI.parse('vscode-remote://dev-container%2Bother/workspace/printstream'), remoteFolder),
			false,
		);
	});

	test('a host in a dev container matches the window folder it reports', () => {
		// The wrapper carries the very `vscode-remote:` URI the window uses for that folder.
		const wrapped = toAgentHostUri(remoteFolder, agentHostAuthority(remoteFolder.toString()));

		assert.notStrictEqual(wrapped.scheme, remoteFolder.scheme, 'precondition: the reported directory is wrapped');
		assert.strictEqual(contains(wrapped, remoteFolder), true);
	});

	test('a wrapped directory on a different remote does not match', () => {
		const other = URI.parse('vscode-remote://dev-container%2Bother/workspace/printstream');
		const wrapped = toAgentHostUri(other, agentHostAuthority(other.toString()));

		assert.strictEqual(contains(wrapped, remoteFolder), false);
	});
});

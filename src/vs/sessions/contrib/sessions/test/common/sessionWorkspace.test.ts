/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, GITHUB_REMOTE_FILE_SCHEME, SessionWorkspace } from '../../common/sessionWorkspace.js';
import type { IGitRepository } from '../../../../../workbench/contrib/git/common/gitService.js';

suite('SessionWorkspace', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('local folder is classified as isFolder', () => {
		const ws = new SessionWorkspace(URI.file('/home/user/project'));
		assert.strictEqual(ws.isFolder, true);
		assert.strictEqual(ws.isRepo, false);
		assert.strictEqual(ws.isRemoteAgentHost, false);
	});

	test('GitHub repo is classified as isRepo', () => {
		const ws = new SessionWorkspace(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/repo/HEAD' }));
		assert.strictEqual(ws.isFolder, false);
		assert.strictEqual(ws.isRepo, true);
		assert.strictEqual(ws.isRemoteAgentHost, false);
	});

	test('agent host URI is classified as isRemoteAgentHost', () => {
		const ws = new SessionWorkspace(URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'b64-test', path: '/home/user/project' }));
		assert.strictEqual(ws.isFolder, false);
		assert.strictEqual(ws.isRepo, false);
		assert.strictEqual(ws.isRemoteAgentHost, true);
	});

	test('withRepository preserves URI and updates repository', () => {
		const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'b64-test', path: '/proj' });
		const ws = new SessionWorkspace(uri);
		const repo = { rootUri: URI.file('/repo') } as IGitRepository;
		const ws2 = ws.withRepository(repo);
		assert.strictEqual(ws2.uri.toString(), uri.toString());
		assert.strictEqual(ws2.isRemoteAgentHost, true);
		assert.strictEqual(ws2.repository, repo);
	});
});

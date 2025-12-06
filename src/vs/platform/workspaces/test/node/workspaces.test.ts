/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import * as pfs from '../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { flakySuite, getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from '../../node/workspaces.js';

flakySuite('Workspaces', () => {

	let testDir: string;

	const tmpDir = os.tmpdir();

	setup(async () => {
		testDir = getRandomTestPath(tmpDir, 'vsctests', 'workspacesmanagementmainservice');

		return fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => {
		return pfs.Promises.rm(testDir);
	});

	test('getSingleWorkspaceIdentifier', async function () {
		const nonLocalUri = URI.parse('myscheme://server/work/p/f1');
		const nonLocalUriId = getSingleFolderWorkspaceIdentifier(nonLocalUri);
		assert.ok(nonLocalUriId?.id);

		const localNonExistingUri = URI.file(path.join(testDir, 'f1'));
		const localNonExistingUriId = getSingleFolderWorkspaceIdentifier(localNonExistingUri);
		assert.ok(!localNonExistingUriId);

		fs.mkdirSync(path.join(testDir, 'f1'));

		const localExistingUri = URI.file(path.join(testDir, 'f1'));
		const localExistingUriId = getSingleFolderWorkspaceIdentifier(localExistingUri, fs.statSync(localExistingUri.fsPath));
		assert.ok(localExistingUriId?.id);
	});

	test('workspace identifiers are stable', function () {

		// workspace identifier (local)
		assert.strictEqual(getWorkspaceIdentifier(URI.file('/hello/test')).id, isWindows  /* slash vs backslash */ ? '9f3efb614e2cd7924e4b8076e6c72233' : 'e36736311be12ff6d695feefe415b3e8');

		// single folder identifier (local)
		const fakeStat = {
			ino: 1611312115129,
			birthtimeMs: 1611312115129,
			birthtime: new Date(1611312115129)
		};
		assert.strictEqual(getSingleFolderWorkspaceIdentifier(URI.file('/hello/test'), fakeStat as fs.Stats)?.id, isWindows /* slash vs backslash */ ? '9a8441e897e5174fa388bc7ef8f7a710' : '1d726b3d516dc2a6d343abf4797eaaef');

		// workspace identifier (remote)
		assert.strictEqual(getWorkspaceIdentifier(URI.parse('vscode-remote:/hello/test')).id, '786de4f224d57691f218dc7f31ee2ee3');

		// single folder identifier (remote)
		assert.strictEqual(getSingleFolderWorkspaceIdentifier(URI.parse('vscode-remote:/hello/test'))?.id, '786de4f224d57691f218dc7f31ee2ee3');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

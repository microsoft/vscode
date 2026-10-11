/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { promises } from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { FileAccess } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../common/files.js';
import { DiskFileSystemProvider } from '../../node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';

const execFileAsync = promisify(execFile);

suite('DiskFileSystemProvider', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let provider: DiskFileSystemProvider;
	let testDir: string;

	setup(async () => {
		provider = store.add(new DiskFileSystemProvider(new NullLogService()));
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'diskfilesystemprovider');
		await promises.mkdir(testDir, { recursive: true });
	});

	teardown(async () => {
		await promises.rm(testDir, { recursive: true, force: true });
	});

	test('readFile reads regular files', async () => {
		const filePath = join(testDir, 'file.txt');
		await promises.writeFile(filePath, 'contents');

		assert.strictEqual(Buffer.from(await provider.readFile(URI.file(filePath))).toString(), 'contents');
	});

	for (const method of ['open', 'readFile', 'readFileStream']) {
		(isWindows ? test.skip : test)(`${method} rejects named pipes without a writer`, async function () {
			this.timeout(10000);

			const fifoPath = join(testDir, 'named-pipe');
			await execFileAsync('mkfifo', [fifoPath]);

			// Isolate blocking reads so a regression cannot leave the test runner's worker pool stuck.
			await execFileAsync(process.execPath, [
				FileAccess.asFileUri('vs/platform/files/test/node/fixtures/readNamedPipe.js').fsPath,
				method,
				fifoPath
			], {
				env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
				timeout: 5000,
				killSignal: 'SIGKILL'
			});
		});
	}

	(isWindows ? test.skip : test)('readFile rejects non-regular files', async () => {
		await assert.rejects(
			provider.readFile(URI.file('/dev/null')),
			error => error instanceof Error && toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.Unavailable
		);
	});
});

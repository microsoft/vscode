/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureRemoteAgentHostCliInstalled } from '../../node/remoteAgentHostCliInstaller.js';
import { ISshExec } from '../../node/sshRemoteAgentHostHelpers.js';

suite('Remote Agent Host CLI installer cache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const commit = 'a'.repeat(40);
	const cliBin = `~/.vscode-server-insiders/code-insiders-${commit}`;

	function fixture(cacheError?: Error, exists = false, pinned = true, shared = true) {
		const commands: string[] = [];
		const messages: string[] = [];
		const exec: ISshExec = async command => {
			commands.push(command);
			if (command.startsWith('test -x ')) {
				return { code: exists ? 0 : 1, stdout: '', stderr: '' };
			}
			if (command.includes('flock 9') && cacheError) {
				throw cacheError;
			}
			return { code: 0, stdout: '', stderr: '' };
		};
		return {
			commands,
			messages,
			run: () => ensureRemoteAgentHostCliInstalled(exec, { os: 'linux', arch: 'arm64' }, {
				serverDataFolderName: '.vscode-server-insiders',
				quality: 'insider',
				commit: pinned ? commit : undefined,
				cliCacheDir: shared ? '/vscode/vscode-server-insiders/cli/bin/linux-arm64' : undefined,
				reportCacheStatus: message => messages.push(message),
				reportInstalling: () => { },
				logService: store.add(new NullLogService()),
			}),
		};
	}

	test('installs a private copy from the cache instead of using the private downloader', async () => {
		const test = fixture();
		const result = await test.run();
		assert.deepStrictEqual({
			result,
			cacheAttempts: test.commands.filter(command => command.includes('flock 9')).length,
			privateDownloads: test.commands.filter(command => command.includes('curl -fsSL') && !command.includes('flock 9')).length,
			reportedCache: test.messages.some(message => message.startsWith('Installed private CLI copy')),
			validated: test.commands.includes(`${cliBin} --version`),
		}, { result: { cliBin, installed: true }, cacheAttempts: 1, privateDownloads: 0, reportedCache: true, validated: true });
	});

	test('reports cache failure and falls back to the existing private installer', async () => {
		const test = fixture(new Error('flock is unavailable'));
		await test.run();
		assert.deepStrictEqual({
			privateDownloads: test.commands.filter(command => command.includes('curl -fsSL') && !command.includes('flock 9')).length,
			messages: test.messages,
		}, { privateDownloads: 1, messages: ['Shared CLI cache unavailable; downloading a private copy: flock is unavailable'] });
	});

	test('does not fall back or continue downloading after cancellation', async () => {
		const test = fixture(new CancellationError());
		await assert.rejects(test.run(), CancellationError);
		assert.deepStrictEqual({
			lastCommandWasCache: test.commands.at(-1)?.includes('flock 9'),
			messages: test.messages,
		}, { lastCommandWasCache: true, messages: [] });
	});

	test('preserves private reuse, unpinned updates, and installations without a shared cache', async () => {
		const existing = fixture(undefined, true);
		const unpinned = fixture(undefined, false, false);
		const privateOnly = fixture(undefined, false, true, false);
		await Promise.all([existing.run(), unpinned.run(), privateOnly.run()]);
		assert.deepStrictEqual({
			cacheCommands: [...existing.commands, ...unpinned.commands, ...privateOnly.commands].filter(command => command.includes('flock 9')),
			existingDownloads: existing.commands.filter(command => command.includes('curl')),
			unpinnedUpdates: unpinned.commands.some(command => command.includes('code-insiders update')),
			privateDownloads: privateOnly.commands.filter(command => command.includes('curl')).length,
		}, { cacheCommands: [], existingDownloads: [], unpinnedUpdates: true, privateDownloads: 1 });
	});
});

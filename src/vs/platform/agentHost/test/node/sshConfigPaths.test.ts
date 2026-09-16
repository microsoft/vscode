/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { resolveSSHKnownHostsFiles, SSHKnownHostsResolutionError } from '../../node/sshConfigPaths.js';

suite('SSH Config Paths', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves absolute and relative files, including missing files', async () => {
		const paths = ['/var/keys/known_hosts', 'relative_known_hosts', 'relative/path', '/missing', 'also_missing'];
		assert.deepStrictEqual(await resolveSSHKnownHostsFiles(`userknownhostsfile ${paths.join(' ')}`, async path => paths.slice(0, 3).includes(path)), {
			userKnownHostsFiles: paths,
			globalKnownHostsFiles: [],
		});
	});

	test('recovers multiple space-containing paths without absorbing following relative files', async () => {
		const user = ['/Users/test/Library/Application Support/Docker/known_hosts', '/Users/test/Other  Directory/known_hosts', 'relative_known_hosts'];
		const global = ['C:\\Users\\Test User\\known_hosts', 'C:\\ProgramData\\ssh\\known_hosts', 'relative/path'];
		assert.deepStrictEqual(await resolveSSHKnownHostsFiles([
			`userknownhostsfile ${user.join(' ')}`,
			`globalknownhostsfile ${global.join(' ')}`,
		].join('\n'), async path => [...user, ...global].includes(path)), {
			userKnownHostsFiles: user,
			globalKnownHostsFiles: global,
		});
	});

	test('recovers relative paths and home-relative paths containing spaces', async () => {
		const paths = ['~/Library/Application Support/known_hosts', 'relative directory/known_hosts'];
		assert.deepStrictEqual(await resolveSSHKnownHostsFiles(`userknownhostsfile ${paths.join(' ')}`, async path => paths.includes(path)), {
			userKnownHostsFiles: paths,
			globalKnownHostsFiles: [],
		});
	});

	test('does not merge explicitly quoted paths or across absolute paths', async () => {
		const output = 'userknownhostsfile "/my known_hosts" relative "/missing file" /absolute';
		assert.deepStrictEqual(await resolveSSHKnownHostsFiles(output, async () => true), {
			userKnownHostsFiles: ['/my known_hosts', 'relative', '/missing file', '/absolute'],
			globalKnownHostsFiles: [],
		});
	});

	test('rejects a space-containing file overlapping an existing prefix, suffix, or longer path', async () => {
		for (const files of [
			['/keys/known_hosts', '/keys/known_hosts relative'],
			['/keys/known_hosts relative', 'relative'],
			['/keys/known_hosts relative', '/keys/known_hosts relative other'],
			['/keys/known_hosts relative', 'relative other'],
		]) {
			await assert.rejects(resolveSSHKnownHostsFiles('userknownhostsfile /keys/known_hosts relative other', async path => files.includes(path)),
				error => error instanceof SSHKnownHostsResolutionError && /ambiguous ssh -G output/.test(error.message));
		}
	});

	test('propagates filesystem errors instead of treating unreadable paths as missing', async () => {
		const error = new Error('Permission denied');
		await assert.rejects(resolveSSHKnownHostsFiles('userknownhostsfile /keys/known_hosts relative', async () => { throw error; }),
			failure => failure instanceof SSHKnownHostsResolutionError && failure.cause === error && failure.message.includes(error.message));
	});

	test('recovers real files without treating directories as known-hosts files', async () => {
		const directory = await fsp.mkdtemp(join(tmpdir(), 'vscode-ssh-config-'));
		try {
			const file = join(directory, 'known hosts');
			await fsp.writeFile(file, '');
			assert.deepStrictEqual(await resolveSSHKnownHostsFiles(`userknownhostsfile ${file}\nglobalknownhostsfile "${directory}"`), {
				userKnownHostsFiles: [file],
				globalKnownHostsFiles: [directory],
			});
		} finally {
			await fsp.rm(directory, { recursive: true, force: true });
		}
	});
});

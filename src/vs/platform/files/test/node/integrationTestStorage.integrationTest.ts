/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';

suite('Integration test tmpfs wrapper', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function run(failure: string, exitCode: number) {
		const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
		const buildDirectory = join(root, '.build');
		mkdirSync(buildDirectory, { recursive: true });
		const directory = mkdtempSync(join(buildDirectory, 'agent-host-storage-test-'));
		store.add(toDisposable(() => rmSync(directory, { recursive: true, force: true })));
		const commands = join(directory, 'commands.log');
		const scripts = {
			uname: 'printf "Linux\\n"',
			findmnt: `if [ "$FAILURE" = filesystem ]; then printf "ext4\\n"; else printf "tmpfs\\n"; fi`,
			sudo: `shift
printf '%s\\n' "$*" >> "$COMMANDS"
if [ "$1" = mount ] && [ "$FAILURE" = mount ]; then exit 17; fi
if [ "$1" = umount ] && [ "$FAILURE" = umount ]; then exit 18; fi`,
		};
		for (const [name, script] of Object.entries(scripts)) {
			writeFileSync(join(directory, name), '#!/bin/sh\n' + script + '\n', { mode: 0o755 });
		}
		const result = spawnSync('bash', [
			join(root, 'test', 'integration', 'run-with-tmpfs.sh'),
			'/bin/sh', '-c',
			`printf 'CHILD:%s:%s:%s:%s\\n' "$TMPDIR" "$TMP" "$TEMP" "$TEST_TMPFS_BACKING"; exit ${exitCode}`,
		], {
			env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TMPDIR: directory, FAILURE: failure, COMMANDS: commands },
			encoding: 'utf8',
		});

		if (result.error) {
			throw result.error;
		}
		const calls = existsSync(commands) ? readFileSync(commands, 'utf8').trim().split('\n') : [];
		const mountDirectory = calls[0]?.split(' ').at(-1);
		assert.ok(typeof mountDirectory === 'string' && mountDirectory.startsWith(join(directory, 'vscode-test-tmpfs.')), JSON.stringify({ status: result.status, stderr: result.stderr, stdout: result.stdout, calls }));
		store.add(toDisposable(() => rmSync(mountDirectory, { recursive: true, force: true })));
		return { ...result, calls, mountDirectory };
	}

	(isWindows ? test.skip : test)('scopes temporary directories to the child and unmounts after success', () => {
		const result = run('', 0);
		assert.deepStrictEqual({
			status: result.status,
			child: result.stdout.split('\n').find(line => line.startsWith('CHILD:')),
			unmounted: result.calls[1] === `umount -- ${result.mountDirectory}`,
			removed: !existsSync(result.mountDirectory),
		}, {
			status: 0,
			child: `CHILD:${result.mountDirectory}:${result.mountDirectory}:${result.mountDirectory}:tmpfs`,
			unmounted: true,
			removed: true,
		});
	});

	(isWindows ? test.skip : test)('retains a failing test exit code while unmounting and removing its mount directory', () => {
		const result = run('', 7);
		assert.deepStrictEqual({ status: result.status, unmounted: result.calls.length === 2, removed: !existsSync(result.mountDirectory) }, { status: 7, unmounted: true, removed: true });
	});

	(isWindows ? test.skip : test)('mount allocation failure does not run tests or fall back to disk', () => {
		const result = run('mount', 0);
		assert.deepStrictEqual({ status: result.status, childStarted: result.stdout.includes('CHILD:'), calls: result.calls.length, removed: !existsSync(result.mountDirectory) }, { status: 17, childStarted: false, calls: 1, removed: true });
	});

	(isWindows ? test.skip : test)('filesystem verification failure still unmounts without running tests', () => {
		const result = run('filesystem', 0);
		assert.deepStrictEqual({ status: result.status, childStarted: result.stdout.includes('CHILD:'), calls: result.calls.length, removed: !existsSync(result.mountDirectory) }, { status: 1, childStarted: false, calls: 2, removed: true });
	});

	(isWindows ? test.skip : test)('unmount failure fails an otherwise passing run without removing a mounted directory', () => {
		const result = run('umount', 0);
		assert.deepStrictEqual({ status: result.status, errorReported: result.stderr.includes('Failed to unmount'), directoryRetained: existsSync(result.mountDirectory) }, { status: 1, errorReported: true, directoryRetained: true });
	});
});

suite('Git integration test storage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function run(storage: string, failBacking = '') {
		const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
		const directory = mkdtempSync(join(root, '.build', 'git-storage-test-'));
		store.add(toDisposable(() => rmSync(directory, { recursive: true, force: true })));
		const commands = join(directory, 'commands.log');
		const profile = join(directory, 'profile');
		mkdirSync(profile);
		const scripts = {
			uname: 'printf "Linux\\n"',
			findmnt: `case "$*" in *vscode-test-tmpfs*) printf "tmpfs\\n";; *) printf "ext4\\n";; esac`,
			sudo: 'exit 0',
			code: `printf '%s\\t%s\\t%s\\t%s\\n' "\${TEST_TMPFS_BACKING:-disk}" "\${MOCHA_GREP:-}" "$1" "$*" >> "$COMMANDS"
rmdir -- "$1"
if [ "\${TEST_TMPFS_BACKING:-}" = tmpfs ]; then rmdir -- "$(dirname "$1")"; fi
if [ "\${TEST_TMPFS_BACKING:-disk}" = "$FAIL_BACKING" ]; then exit 7; fi`,
		};
		for (const [name, script] of Object.entries(scripts)) {
			writeFileSync(join(directory, name), '#!/bin/sh\n' + script + '\n', { mode: 0o755 });
		}
		const result = spawnSync('bash', [
			join(root, 'test', 'integration', 'electron', 'git.sh'),
			join(directory, 'code'), '--disable-telemetry', `--user-data-dir=${profile}`,
		], {
			env: {
				...process.env,
				PATH: `${directory}:${process.env.PATH}`,
				TMPDIR: directory,
				MOCHA_GREP: 'requested test',
				VSCODE_GIT_TEST_STORAGE: storage,
				TEST_TMPFS_BACKING: undefined,
				FAIL_BACKING: failBacking,
				COMMANDS: commands,
			},
			encoding: 'utf8',
		});
		if (result.error) {
			throw result.error;
		}
		const calls = existsSync(commands) ? readFileSync(commands, 'utf8').trim().split('\n').map(line => {
			const [backing, grep, workspace, args] = line.split('\t');
			return { backing, grep, workspace, args };
		}) : [];
		return { ...result, calls, profile };
	}

	(isWindows ? test.skip : test)('split mode runs requested tests in RAM and required real-disk coverage separately', () => {
		const result = run('split');
		assert.deepStrictEqual({
			status: result.status,
			calls: result.calls.map(call => ({
				backing: call.backing,
				requested: call.grep === 'requested test',
				profileIsScoped: call.backing === 'tmpfs'
					? call.workspace.includes('/vscode-test-tmpfs.') && call.args.includes('--user-data-dir=')
					: call.workspace === join(result.profile, 'git-workspace'),
			})),
		}, {
			status: 0,
			calls: [
				{ backing: 'tmpfs', requested: true, profileIsScoped: true },
				{ backing: 'disk', requested: false, profileIsScoped: true },
			],
		});
	});

	for (const backing of ['tmpfs', 'disk']) {
		(isWindows ? test.skip : test)(`a ${backing} failure fails split mode without skipping the other pass`, () => {
			const result = run('split', backing);
			assert.deepStrictEqual({ status: result.status, backings: result.calls.map(call => call.backing) }, { status: 7, backings: ['tmpfs', 'disk'] });
		});
	}

	(isWindows ? test.skip : test)('disk override preserves the original filter and profile', () => {
		const result = run('disk');
		assert.deepStrictEqual({
			status: result.status,
			calls: result.calls.map(({ backing, grep, workspace }) => ({ backing, grep, workspace })),
		}, { status: 0, calls: [{ backing: 'disk', grep: 'requested test', workspace: join(result.profile, 'git-workspace') }] });
	});

	(isWindows ? test.skip : test)('invalid storage mode fails before launching the application', () => {
		const result = run('invalid');
		assert.deepStrictEqual({ status: result.status, calls: result.calls }, { status: 2, calls: [] });
	});
});

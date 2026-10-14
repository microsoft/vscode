/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from '../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';

suite('Agent Host E2E storage wrapper', () => {
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
			findmnt: `if [ "$FAILURE" = probe ]; then printf "tmpfs\\n"; exit 11; fi
if [ "$FAILURE" = filesystem ]; then printf "ext4\\n"; else printf "tmpfs\\n"; fi`,
			sudo: `shift
printf '%s\\n' "$*" >> "$COMMANDS"
if [ "$1" = mount ] && [ "$FAILURE" = mount ]; then exit 17; fi
if [ "$1" = umount ] && { [ "$FAILURE" = umount ] || [ "$FAILURE" = diagnostic ]; }; then exit 18; fi
if [ "$1" = timeout ]; then exec "$@"; fi`,
			timeout: `printf 'budget %s\\n' "$*" >> "$COMMANDS"
shift 2
exec "$@"`,
			fuser: `if [ "$FAILURE" = diagnostic ]; then printf 'holder probe failed\\n' >&2; exit 29; fi
for argument in "$@"; do
if [ "$argument" = -- ]; then printf 'No process specification given\\n' >&2; exit 1; fi
done
printf 'test-user 12345 .c..m provider-child\\n' >&2`,
		};
		for (const [name, script] of Object.entries(scripts)) {
			writeFileSync(join(directory, name), '#!/bin/sh\n' + script + '\n', { mode: 0o755 });
		}
		const result = spawnSync('bash', [
			join(root, 'test', 'integration', 'agentHost', 'tmpfs.sh'),
			'/bin/sh', '-c',
			`printf 'CHILD:%s:%s:%s:%s\\n' "$TMPDIR" "$TMP" "$TEMP" "$AGENT_HOST_E2E_STORAGE_BACKING"; exit ${exitCode}`,
		], {
			env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TMPDIR: directory, FAILURE: failure, COMMANDS: commands },
			encoding: 'utf8',
		});

		if (result.error) {
			throw result.error;
		}
		const calls = existsSync(commands) ? readFileSync(commands, 'utf8').trim().split('\n') : [];
		const mountDirectory = calls[0]?.split(' ').at(-1);
		assert.ok(typeof mountDirectory === 'string' && mountDirectory.startsWith(join(directory, 'agent-host-e2e-tmpfs.')), JSON.stringify({ status: result.status, stderr: result.stderr, stdout: result.stdout, calls }));
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

	(isWindows ? test.skip : test)('filesystem probe errors fail even when stdout reports tmpfs', () => {
		const result = run('probe', 0);
		assert.deepStrictEqual({ status: result.status, childStarted: result.stdout.includes('CHILD:'), calls: result.calls.length, removed: !existsSync(result.mountDirectory) }, { status: 11, childStarted: false, calls: 2, removed: true });
	});

	(isWindows ? test.skip : test)('unmount failure fails an otherwise passing run without removing a mounted directory', () => {
		const result = run('umount', 0);
		assert.deepStrictEqual({
			status: result.status,
			errorReported: result.stderr.includes('Failed to unmount'),
			directoryRetained: existsSync(result.mountDirectory),
			holdersReported: result.stderr.includes('test-user 12345 .c..m provider-child'),
			diagnosticCalls: result.calls.slice(2),
		}, {
			status: 1,
			errorReported: true,
			directoryRetained: true,
			holdersReported: true,
			diagnosticCalls: [`timeout --signal=KILL 10s fuser -vm ${result.mountDirectory}`, `budget --signal=KILL 10s fuser -vm ${result.mountDirectory}`],
		});
	});

	(isWindows ? test.skip : test)('holder diagnostic failures cannot mask a failed unmount or remove its mounted directory', () => {
		const result = run('diagnostic', 0);
		assert.deepStrictEqual({
			status: result.status,
			directoryRetained: existsSync(result.mountDirectory),
			unmountFailureReported: result.stderr.includes('Failed to unmount'),
			diagnosticFailureReported: result.stderr.includes('holder diagnostics exited with status 29'),
		}, {
			status: 1,
			directoryRetained: true,
			unmountFailureReported: true,
			diagnosticFailureReported: true,
		});
	});

	(isLinux ? test : test.skip)('real Linux fuser identifies holders with the diagnostic mount argument form', () => {
		const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
		const directory = mkdtempSync(join(root, '.build', 'agent-host-storage-fuser-'));
		store.add(toDisposable(() => rmSync(directory, { recursive: true, force: true })));
		const file = openSync(join(directory, 'held.txt'), 'w');
		store.add(toDisposable(() => closeSync(file)));
		const result = spawnSync('fuser', ['-vm', directory], {
			encoding: 'utf8',
			timeout: 10_000,
			killSignal: 'SIGKILL',
		});
		if (result.error) {
			throw result.error;
		}

		assert.deepStrictEqual({
			status: result.status,
			runnerIdentified: result.stdout.trim().split(/\s+/).includes(String(process.pid)),
		}, {
			status: 0,
			runnerIdentified: true,
		});
	});
});

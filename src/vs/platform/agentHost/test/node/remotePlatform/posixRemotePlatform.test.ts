/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PosixRemotePlatform } from '../../../node/remotePlatform/posixRemotePlatform.js';
import type { IRemotePlatformInfo, RemotePath } from '../../../node/remotePlatform/remotePlatform.js';
import type { ISshExec } from '../../../node/sshRemoteAgentHostHelpers.js';

interface RecordedCall {
	readonly command: string;
	readonly ignoreExitCode: boolean;
}

interface ScriptedResponse {
	readonly match: string | RegExp;
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code?: number;
}

interface FakeExec {
	readonly exec: ISshExec;
	readonly calls: RecordedCall[];
}

function createFakeExec(script: ScriptedResponse[]): FakeExec {
	const calls: RecordedCall[] = [];
	const exec: ISshExec = async (command, opts) => {
		calls.push({ command, ignoreExitCode: !!opts?.ignoreExitCode });
		for (const entry of script) {
			const matched = typeof entry.match === 'string' ? command.includes(entry.match) : entry.match.test(command);
			if (matched) {
				return {
					stdout: entry.stdout ?? '',
					stderr: entry.stderr ?? '',
					code: entry.code ?? 0,
				};
			}
		}
		throw new Error(`unexpected command: ${command}`);
	};
	return { exec, calls };
}

const commit = 'abcdef0123456789abcdef0123456789abcdef01';
const sdf = '.vscode-server-insiders';
const quality = 'insider';

function linuxPlatform(): PosixRemotePlatform {
	const info: IRemotePlatformInfo = { os: 'linux', arch: 'x64' };
	return new PosixRemotePlatform(info);
}

function darwinPlatform(): PosixRemotePlatform {
	const info: IRemotePlatformInfo = { os: 'darwin', arch: 'arm64' };
	return new PosixRemotePlatform(info);
}

suite('PosixRemotePlatform', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('paths and naming', () => {

		test('cliArchiveName selects binary from quality', () => {
			const p = linuxPlatform();
			assert.deepStrictEqual(
				{
					stable: p.cliArchiveName('stable'),
					insider: p.cliArchiveName('insider'),
					exploration: p.cliArchiveName('exploration'),
					other: p.cliArchiveName('preview'),
				},
				{
					stable: 'code',
					insider: 'code-insiders',
					exploration: 'code-exploration',
					other: 'code-insiders',
				},
			);
		});

		test('paths follow the shared install-root layout on linux and darwin', () => {
			for (const p of [linuxPlatform(), darwinPlatform()]) {
				assert.deepStrictEqual({
					info: p.info.os,
					installRoot: p.installRoot(sdf),
					cliDataDir: p.cliDataDir(sdf),
					cliBinPinned: p.cliBin(sdf, quality, commit),
					cliBinLoose: p.cliBin(sdf, quality),
				}, {
					info: p.info.os,
					installRoot: `~/${sdf}`,
					cliDataDir: `~/${sdf}/cli`,
					cliBinPinned: `~/${sdf}/code-insiders-${commit}`,
					cliBinLoose: `~/${sdf}/code-insiders`,
				});
			}
		});

		test('rejects unsafe inputs', () => {
			const p = linuxPlatform();
			assert.throws(() => p.installRoot('foo bar'), /Unsafe server data folder name/);
			assert.throws(() => p.cliBin(sdf, quality, 'foo;rm'), /Unsafe commit/);
			assert.throws(() => p.cliArchiveName('foo bar'), /Unsafe quality/);
		});
	});

	suite('parseFallbackCliPath', () => {

		test('accepts commit-keyed and legacy shapes, rejects everything else', () => {
			const p = linuxPlatform();
			const pinned = `~/${sdf}/code-insiders-${commit}`;
			const legacy = `~/.vscode-cli-insider/code-insiders`;
			const legacyStable = `~/.vscode-cli/code`;
			assert.deepStrictEqual(
				{
					pinned: p.parseFallbackCliPath(pinned, sdf, quality),
					legacy: p.parseFallbackCliPath(legacy, sdf, quality),
					legacyStable: p.parseFallbackCliPath(legacyStable, '.vscode-server', 'stable'),
					wrongHex: p.parseFallbackCliPath(`~/${sdf}/code-insiders-${'g'.repeat(40)}`, sdf, quality),
					shortHex: p.parseFallbackCliPath(`~/${sdf}/code-insiders-${commit.slice(0, 39)}`, sdf, quality),
					unrelated: p.parseFallbackCliPath(`~/.foo/code-insiders-${commit}`, sdf, quality),
					injection: p.parseFallbackCliPath(`~/${sdf}/code-insiders-${commit};rm -rf /`, sdf, quality),
					empty: p.parseFallbackCliPath('', sdf, quality),
				},
				{
					pinned: pinned as RemotePath,
					legacy: legacy as RemotePath,
					legacyStable: legacyStable as RemotePath,
					wrongHex: undefined,
					shortHex: undefined,
					unrelated: undefined,
					injection: undefined,
					empty: undefined,
				},
			);
		});

		test('rejects paths carrying shell metacharacters', () => {
			// The result is interpolated unquoted into `test -x`, `--version`
			// and `exec`, so a hostile `ls` line must never survive the filter.
			const p = linuxPlatform();
			assert.deepStrictEqual([
				p.parseFallbackCliPath(`/home/u/$(id)/${sdf}/code-insiders-${commit}`, sdf, quality),
				p.parseFallbackCliPath('/tmp/`id`/.vscode-cli-insider/code-insiders', sdf, quality),
				p.parseFallbackCliPath(`/a b;rm -rf ~/.vscode-cli-insider/code-insiders`, sdf, quality),
				p.parseFallbackCliPath(`/home/u/../../${sdf}/code-insiders-${commit}`, sdf, quality),
				p.parseFallbackCliPath(`/home/u/${sdf}/code-insiders-${commit}`, sdf, quality),
			], [
				undefined,
				undefined,
				undefined,
				undefined,
				`/home/u/${sdf}/code-insiders-${commit}` as RemotePath,
			]);
		});

		test('accepts the expanded absolute paths discovery actually reports', () => {
			// The shell expands `~` before `ls` runs, so every candidate coming
			// back from a real remote is absolute.
			const p = linuxPlatform();
			assert.deepStrictEqual(
				{
					pinned: p.parseFallbackCliPath(`/home/u/${sdf}/code-insiders-${commit}`, sdf, quality),
					legacy: p.parseFallbackCliPath('/home/u/.vscode-cli-insider/code-insiders', sdf, quality),
					otherHome: p.parseFallbackCliPath(`/Users/u/${sdf}/code-insiders-${commit}`, sdf, quality),
					wrongDir: p.parseFallbackCliPath(`/home/u/.evil/code-insiders-${commit}`, sdf, quality),
					wrongName: p.parseFallbackCliPath(`/home/u/${sdf}/evil-${commit}`, sdf, quality),
					relative: p.parseFallbackCliPath(`${sdf}/code-insiders-${commit}`, sdf, quality),
				},
				{
					pinned: `/home/u/${sdf}/code-insiders-${commit}` as RemotePath,
					legacy: '/home/u/.vscode-cli-insider/code-insiders' as RemotePath,
					otherHome: `/Users/u/${sdf}/code-insiders-${commit}` as RemotePath,
					wrongDir: undefined,
					wrongName: undefined,
					relative: undefined,
				},
			);
		});
	});

	suite('predicate operations emit exact commands', () => {

		test('isExecutableFile / touchFile / versionCheck', async () => {
			const p = linuxPlatform();
			const path = p.cliBin(sdf, quality, commit);
			const fake = createFakeExec([
				{ match: `test -x ${path}`, code: 0 },
				{ match: `touch -- ${path}`, code: 0 },
				{ match: `${path} --version`, code: 0 },
			]);

			const results = {
				isExec: await p.isExecutableFile(fake.exec, path),
				touch: await p.touchFile(fake.exec, path),
				version: await p.versionCheck(fake.exec, path),
			};

			assert.deepStrictEqual(
				{
					results,
					calls: fake.calls,
				},
				{
					results: { isExec: true, touch: true, version: true },
					calls: [
						{ command: `test -x ${path}`, ignoreExitCode: true },
						{ command: `touch -- ${path}`, ignoreExitCode: true },
						{ command: `${path} --version`, ignoreExitCode: true },
					],
				},
			);
		});

		test('predicates return false on non-zero exit', async () => {
			const p = linuxPlatform();
			const path = p.cliBin(sdf, quality, commit);
			const fake = createFakeExec([{ match: /.*/, code: 1 }]);
			assert.deepStrictEqual(
				{
					isExec: await p.isExecutableFile(fake.exec, path),
					touch: await p.touchFile(fake.exec, path),
					version: await p.versionCheck(fake.exec, path),
				},
				{ isExec: false, touch: false, version: false },
			);
		});
	});

	suite('installCli', () => {

		test('emits the mkdir/mktemp/curl/mv/chmod pipeline joined with &&', async () => {
			const p = linuxPlatform();
			const installRoot = p.installRoot(sdf);
			const cliBin = p.cliBin(sdf, quality, commit);
			const url = 'https://update.code.visualstudio.com/commit:' + commit + '/cli-linux-x64/insider';
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);

			await p.installCli(fake.exec, { url, installRoot, cliBin });

			const expected = [
				`mkdir -p ${installRoot}`,
				`tmpdir=$(mktemp -d ${installRoot}/.cli-install-XXXXXX)`,
				`(cd "$tmpdir" && curl -fsSL '${url}' | tar xz)`,
				`mv "$tmpdir"/* ${cliBin}`,
				`chmod +x ${cliBin}`,
				`rm -rf "$tmpdir"`,
			].join(' && ');
			assert.deepStrictEqual(fake.calls, [{ command: expected, ignoreExitCode: false }]);
		});

		test('shell-escapes URLs that contain single quotes', async () => {
			const p = linuxPlatform();
			const installRoot = p.installRoot(sdf);
			const cliBin = p.cliBin(sdf, quality, commit);
			const url = 'https://example.test/cli?q=\'inject\'';
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);
			await p.installCli(fake.exec, { url, installRoot, cliBin });
			assert.ok(fake.calls[0].command.includes(`| tar xz)`));
			assert.ok(fake.calls[0].command.includes(`'https://example.test/cli?q='\\''inject'\\'''`));
		});
	});

	suite('pruneOldClis', () => {

		test('emits the ls|awk|xargs pipeline with parameterised keep', async () => {
			const p = linuxPlatform();
			const root = p.installRoot(sdf);
			const glob = '[0-9a-f]'.repeat(40);
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);
			await p.pruneOldClis(fake.exec, sdf, quality, 3);
			assert.deepStrictEqual(fake.calls, [{
				command: `ls -1t -- ${root}/code-insiders-${glob} 2>/dev/null | awk 'NR>3' | xargs -I{} rm -f -- {} 2>/dev/null; true`,
				ignoreExitCode: true,
			}]);
		});

		test('rejects negative or non-integer keep counts', async () => {
			const p = linuxPlatform();
			const fake = createFakeExec([]);
			await assert.rejects(() => p.pruneOldClis(fake.exec, sdf, quality, -1), /Invalid keep count/);
			await assert.rejects(() => p.pruneOldClis(fake.exec, sdf, quality, 1.5), /Invalid keep count/);
			assert.strictEqual(fake.calls.length, 0);
		});
	});

	suite('findFallbackClis', () => {

		test('runs the discovery command and filters through parseFallbackCliPath', async () => {
			const p = linuxPlatform();
			const root = p.installRoot(sdf);
			const glob = '[0-9a-f]'.repeat(40);
			const validPinned = `~/${sdf}/code-insiders-${commit}`;
			const validLegacy = `~/.vscode-cli-insider/code-insiders`;
			const junk = `~/${sdf}/code-insiders-${'g'.repeat(40)}`;
			const fake = createFakeExec([{
				match: /ls -1t/,
				stdout: [validPinned, junk, '', validLegacy].join('\n') + '\n',
				code: 0,
			}]);

			const results = await p.findFallbackClis(fake.exec, sdf, quality);

			assert.deepStrictEqual({
				calls: fake.calls,
				results,
			}, {
				calls: [{
					command: [
						`ls -1t -- ${root}/code-insiders-${glob} 2>/dev/null`,
						`ls -1 -- ~/.vscode-cli-insider/code-insiders 2>/dev/null`,
						'true',
					].join('; '),
					ignoreExitCode: true,
				}],
				results: [validPinned, validLegacy] as RemotePath[],
			});
		});
	});

	suite('launch commands', () => {

		test('buildLaunchCommand wraps in `bash -l -c` and echoes PID', () => {
			const p = linuxPlatform();
			const executable = p.cliBin(sdf, quality, commit);
			const dataDir = p.cliDataDir(sdf);
			const cmd = p.buildLaunchCommand({
				executable,
				args: ['--cli-data-dir', { path: dataDir }, 'agent', 'host', '--port', '0'],
			});
			assert.strictEqual(
				cmd,
				`bash -l -c 'echo VSCODE_PID=$$ && exec ${executable} --cli-data-dir ${dataDir} agent host --port 0'`,
			);
		});

		test('buildRawLaunchCommand wraps user-supplied string in the same envelope', () => {
			const p = linuxPlatform();
			const cmd = p.buildRawLaunchCommand('/opt/dev/code agent host --port 0');
			assert.strictEqual(
				cmd,
				`bash -l -c 'echo VSCODE_PID=$$ && exec /opt/dev/code agent host --port 0'`,
			);
		});
	});
});

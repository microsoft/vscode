/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PosixRemotePlatform } from '../../../node/remotePlatform/posixRemotePlatform.js';
import {
	detectRemotePlatform,
	resolveRemotePlatformInfo,
	resolveWindowsPlatformInfo,
} from '../../../node/remotePlatform/remotePlatformDetection.js';
import { WindowsRemotePlatform } from '../../../node/remotePlatform/windowsRemotePlatform.js';
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

function createFakeExec(script: ScriptedResponse[]): { exec: ISshExec; calls: RecordedCall[] } {
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

suite('remotePlatformDetection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('resolveRemotePlatformInfo', () => {

		test('maps recognised uname outputs and rejects the rest', () => {
			assert.deepStrictEqual({
				linuxX64: resolveRemotePlatformInfo('Linux x86_64'),
				linuxAmd64: resolveRemotePlatformInfo('Linux amd64'),
				linuxAarch64: resolveRemotePlatformInfo('Linux aarch64'),
				linuxArm64: resolveRemotePlatformInfo('Linux arm64'),
				linuxArmhf: resolveRemotePlatformInfo('Linux armv7l'),
				darwinX64: resolveRemotePlatformInfo('Darwin x86_64'),
				darwinArm64: resolveRemotePlatformInfo('Darwin arm64'),
				whitespace: resolveRemotePlatformInfo('  Linux\n  x86_64\n'),
				windows: resolveRemotePlatformInfo('MINGW64_NT-10.0-19041 x86_64'),
				freebsd: resolveRemotePlatformInfo('FreeBSD amd64'),
				unknownArch: resolveRemotePlatformInfo('Linux ppc64le'),
				tooShort: resolveRemotePlatformInfo('Linux'),
				empty: resolveRemotePlatformInfo(''),
			}, {
				linuxX64: { os: 'linux', arch: 'x64' },
				linuxAmd64: { os: 'linux', arch: 'x64' },
				linuxAarch64: { os: 'linux', arch: 'arm64' },
				linuxArm64: { os: 'linux', arch: 'arm64' },
				linuxArmhf: { os: 'linux', arch: 'armhf' },
				darwinX64: { os: 'darwin', arch: 'x64' },
				darwinArm64: { os: 'darwin', arch: 'arm64' },
				whitespace: { os: 'linux', arch: 'x64' },
				windows: undefined,
				freebsd: undefined,
				unknownArch: undefined,
				tooShort: undefined,
				empty: undefined,
			});
		});
	});

	suite('resolveWindowsPlatformInfo', () => {

		test('maps the probe marker line for x64 and arm64', () => {
			assert.deepStrictEqual({
				x64: resolveWindowsPlatformInfo('VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=x64'),
				arm64: resolveWindowsPlatformInfo('noise before\r\nVSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=arm64\r\nnoise after\r\n'),
				missing: resolveWindowsPlatformInfo('nothing here'),
				wrongOs: resolveWindowsPlatformInfo('VSCODE_REMOTE_OS=linux VSCODE_REMOTE_ARCH=x64'),
				unknownArch: resolveWindowsPlatformInfo('VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=unknown'),
			}, {
				x64: { os: 'win32', arch: 'x64' },
				arm64: { os: 'win32', arch: 'arm64' },
				missing: undefined,
				wrongOs: undefined,
				unknownArch: undefined,
			});
		});
	});

	suite('detectRemotePlatform', () => {

		test('returns PosixRemotePlatform and skips the Windows probe when uname succeeds', async () => {
			const fake = createFakeExec([
				{ match: /^uname -s -m$/, stdout: 'Linux x86_64\n', code: 0 },
			]);
			const platform = await detectRemotePlatform(fake.exec);
			assert.ok(platform instanceof PosixRemotePlatform);
			assert.deepStrictEqual({
				info: platform.info,
				callCount: fake.calls.length,
				firstCommand: fake.calls[0].command,
				firstIgnore: fake.calls[0].ignoreExitCode,
			}, {
				info: { os: 'linux', arch: 'x64' },
				callCount: 1,
				firstCommand: 'uname -s -m',
				firstIgnore: true,
			});
		});

		test('returns WindowsRemotePlatform after the POSIX probe fails', async () => {
			const fake = createFakeExec([
				{ match: /^uname -s -m$/, stdout: '', stderr: 'bash: uname: command not found', code: 127 },
				{ match: /^powershell /, stdout: 'VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=x64\r\n', code: 0 },
			]);
			const platform = await detectRemotePlatform(fake.exec);
			assert.ok(platform instanceof WindowsRemotePlatform);
			assert.deepStrictEqual({
				info: platform.info,
				callCount: fake.calls.length,
				windowsIgnore: fake.calls[1].ignoreExitCode,
				windowsIsEncoded: fake.calls[1].command.startsWith('powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand '),
			}, {
				info: { os: 'win32', arch: 'x64' },
				callCount: 2,
				windowsIgnore: true,
				windowsIsEncoded: true,
			});
		});

		test('falls through to Windows when POSIX exits 0 but output is unparseable', async () => {
			const fake = createFakeExec([
				{ match: /^uname -s -m$/, stdout: 'FreeBSD amd64\n', code: 0 },
				{ match: /^powershell /, stdout: 'VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=arm64\r\n', code: 0 },
			]);
			const platform = await detectRemotePlatform(fake.exec);
			assert.ok(platform instanceof WindowsRemotePlatform);
			assert.deepStrictEqual(platform.info, { os: 'win32', arch: 'arm64' });
			assert.strictEqual(fake.calls.length, 2);
		});

		test('throws quoting both probes when neither parses', async () => {
			const fake = createFakeExec([
				{ match: /^uname -s -m$/, stdout: 'garbage', stderr: 'posix-err', code: 0 },
				{ match: /^powershell /, stdout: 'windows-junk', stderr: 'win-err', code: 1 },
			]);
			await assert.rejects(() => detectRemotePlatform(fake.exec), (err: Error) => {
				assert.deepStrictEqual({
					message: err.message,
					callCount: fake.calls.length,
				}, {
					message: 'Could not determine the operating system of the remote.\n'
						+ 'POSIX probe exited 0: "garbage posix-err"\n'
						+ 'Windows probe exited 1: "windows-junk win-err"',
					callCount: 2,
				});
				return true;
			});
		});
	});
});

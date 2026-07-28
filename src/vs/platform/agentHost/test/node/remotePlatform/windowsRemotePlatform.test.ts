/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IRemotePlatformInfo, RemotePath } from '../../../node/remotePlatform/remotePlatform.js';
import { encodePowerShellCommand, WindowsRemotePlatform } from '../../../node/remotePlatform/windowsRemotePlatform.js';
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

const POWERSHELL_PREFIX = 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ';

function decodePayload(wireCommand: string): string {
	assert.ok(wireCommand.startsWith(POWERSHELL_PREFIX), `not an encoded PS command: ${wireCommand}`);
	const encoded = wireCommand.slice(POWERSHELL_PREFIX.length);
	return Buffer.from(encoded, 'base64').toString('utf16le');
}

function assertEnvelope(payload: string): void {
	assert.ok(payload.startsWith(`$ErrorActionPreference = 'Stop'\n`), 'missing ErrorActionPreference');
	assert.ok(payload.includes(`$ProgressPreference = 'SilentlyContinue'`), 'missing ProgressPreference');
	assert.ok(payload.includes(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`), 'missing UTF-8 pin');
}

const commit = 'abcdef0123456789abcdef0123456789abcdef01';
const sdf = '.vscode-server-insiders';
const quality = 'insider';

function windowsPlatform(): WindowsRemotePlatform {
	const info: IRemotePlatformInfo = { os: 'win32', arch: 'x64' };
	return new WindowsRemotePlatform(info);
}

suite('WindowsRemotePlatform', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('encoding', () => {

		test('encodePowerShellCommand round-trips through base64/UTF-16LE', () => {
			const payload = `Write-Output "hi 'x' \`y \$env:USERPROFILE"`;
			const encoded = encodePowerShellCommand(payload);
			const decoded = Buffer.from(encoded, 'base64').toString('utf16le');
			assert.strictEqual(decoded, payload);
			assert.ok(/^[A-Za-z0-9+/=]+$/.test(encoded), 'output must be base64');
		});
	});

	suite('paths and naming', () => {

		test('paths use USERPROFILE with backslashes, .exe suffix appended', () => {
			const p = windowsPlatform();
			assert.deepStrictEqual({
				installRoot: p.installRoot(sdf),
				cliDataDir: p.cliDataDir(sdf),
				cliBinPinned: p.cliBin(sdf, quality, commit),
				cliBinLoose: p.cliBin(sdf, quality),
				archive: p.cliArchiveName(quality),
			}, {
				installRoot: `"$env:USERPROFILE\\${sdf}"`,
				cliDataDir: `"$env:USERPROFILE\\${sdf}\\cli"`,
				cliBinPinned: `"$env:USERPROFILE\\${sdf}\\code-insiders-${commit}.exe"`,
				cliBinLoose: `"$env:USERPROFILE\\${sdf}\\code-insiders.exe"`,
				archive: 'code-insiders',
			});
		});

		test('archive stem is unchanged when commit is present; extension is appended after the hex', () => {
			const p = windowsPlatform();
			const bin = p.cliBin(sdf, quality, commit);
			assert.ok(!bin.includes('.exe-'), 'must not produce <archive>.exe-<hex> shape');
			assert.ok(bin.endsWith(`-${commit}.exe"`), 'must produce <archive>-<hex>.exe shape');
		});

		test('rejects unsafe inputs', () => {
			const p = windowsPlatform();
			assert.throws(() => p.installRoot('foo bar'), /Unsafe server data folder name/);
			assert.throws(() => p.cliBin(sdf, quality, 'foo;rm'), /Unsafe commit/);
			assert.throws(() => p.cliArchiveName('foo bar'), /Unsafe quality/);
		});
	});

	suite('parseFallbackCliPath', () => {

		test('accepts absolute paths ending in the expected <sdf>\\<archive>-<hex>.exe segment', () => {
			const p = windowsPlatform();
			const good = `C:\\Users\\alice\\${sdf}\\code-insiders-${commit}.exe`;
			const wrongHex = `C:\\Users\\alice\\${sdf}\\code-insiders-${'g'.repeat(40)}.exe`;
			const noExe = `C:\\Users\\alice\\${sdf}\\code-insiders-${commit}`;
			const wrongDir = `C:\\Users\\alice\\.other\\code-insiders-${commit}.exe`;
			const withQuote = `C:\\Users\\ali"ce\\${sdf}\\code-insiders-${commit}.exe`;
			const withApostrophe = `C:\\Users\\o'brien\\${sdf}\\code-insiders-${commit}.exe`;

			assert.deepStrictEqual({
				good: p.parseFallbackCliPath(good, sdf, quality),
				wrongHex: p.parseFallbackCliPath(wrongHex, sdf, quality),
				noExe: p.parseFallbackCliPath(noExe, sdf, quality),
				wrongDir: p.parseFallbackCliPath(wrongDir, sdf, quality),
				withQuote: p.parseFallbackCliPath(withQuote, sdf, quality),
				withApostrophe: p.parseFallbackCliPath(withApostrophe, sdf, quality),
				empty: p.parseFallbackCliPath('', sdf, quality),
			}, {
				good: `'${good}'` as RemotePath,
				wrongHex: undefined,
				noExe: undefined,
				wrongDir: undefined,
				withQuote: undefined,
				withApostrophe: `'C:\\Users\\o''brien\\${sdf}\\code-insiders-${commit}.exe'` as RemotePath,
				empty: undefined,
			});
		});
	});

	suite('predicate operations round-trip to intended PowerShell', () => {

		test('isExecutableFile emits Test-Path + explicit exit 0/1 wrapped in envelope', async () => {
			const p = windowsPlatform();
			const path = p.cliBin(sdf, quality, commit);
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);
			const result = await p.isExecutableFile(fake.exec, path);
			const payload = decodePayload(fake.calls[0].command);
			assertEnvelope(payload);
			assert.strictEqual(result, true);
			assert.strictEqual(fake.calls[0].ignoreExitCode, true);
			assert.ok(payload.includes(`$path = ${path}`));
			assert.ok(payload.includes(`if (Test-Path -PathType Leaf -LiteralPath $path) { exit 0 } else { exit 1 }`));
		});

		test('touchFile uses try/catch around LastWriteTime assignment', async () => {
			const p = windowsPlatform();
			const path = p.cliBin(sdf, quality, commit);
			const fake = createFakeExec([{ match: /.*/, code: 1 }]);
			const result = await p.touchFile(fake.exec, path);
			const payload = decodePayload(fake.calls[0].command);
			assert.strictEqual(result, false);
			assert.ok(payload.includes(`(Get-Item -LiteralPath $path).LastWriteTime = Get-Date`));
			assert.ok(payload.includes(`try {`));
			assert.ok(payload.includes(`} catch { exit 1 }`));
		});

		test('versionCheck ends with exit $LASTEXITCODE so native failures propagate', async () => {
			const p = windowsPlatform();
			const cli = p.cliBin(sdf, quality, commit);
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);
			const result = await p.versionCheck(fake.exec, cli);
			const payload = decodePayload(fake.calls[0].command);
			assert.strictEqual(result, true);
			assert.ok(payload.includes(`& $cli --version | Out-Null`));
			assert.ok(payload.trimEnd().endsWith(`exit $LASTEXITCODE`));
		});
	});

	suite('installCli', () => {

		test('publishes without -Force and treats existing destination as success', async () => {
			const p = windowsPlatform();
			const installRoot = p.installRoot(sdf);
			const cliBin = p.cliBin(sdf, quality, commit);
			const url = 'https://example.test/cli.zip';
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);

			await p.installCli(fake.exec, { url, installRoot, cliBin });

			const payload = decodePayload(fake.calls[0].command);
			assertEnvelope(payload);
			assert.ok(payload.includes(`$root = ${installRoot}`));
			assert.ok(payload.includes(`$dest = ${cliBin}`));
			assert.ok(payload.includes(`$url = 'https://example.test/cli.zip'`));
			assert.ok(payload.includes(`Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip`));
			assert.ok(payload.includes(`Expand-Archive -LiteralPath $zip -DestinationPath $tmpdir -Force`));
			assert.ok(payload.includes(`Move-Item -LiteralPath $extracted.FullName -Destination $dest -ErrorAction Stop`));
			assert.ok(!/Move-Item[^\n]*-Force/.test(payload), 'must not use -Force on Move-Item (would overwrite mapped binary)');
			assert.ok(payload.includes(`if (-not (Test-Path -PathType Leaf -LiteralPath $dest)) { throw }`));
			assert.ok(payload.includes(`Remove-Item -LiteralPath $tmpdir -Recurse -Force -ErrorAction SilentlyContinue`));
			assert.ok(payload.trimEnd().endsWith(`exit 0`));
		});

		test('URL is embedded as a single-quoted PS literal with single quotes escaped', async () => {
			const p = windowsPlatform();
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);
			await p.installCli(fake.exec, {
				url: 'https://example.test/\'inject\'',
				installRoot: p.installRoot(sdf),
				cliBin: p.cliBin(sdf, quality, commit),
			});
			const payload = decodePayload(fake.calls[0].command);
			assert.ok(payload.includes(`$url = 'https://example.test/''inject'''`));
		});
	});

	suite('pruneOldClis', () => {

		test('deletes per item with error suppressed and always exits 0', async () => {
			const p = windowsPlatform();
			const fake = createFakeExec([{ match: /.*/, code: 0 }]);
			await p.pruneOldClis(fake.exec, sdf, quality, 3);
			const payload = decodePayload(fake.calls[0].command);
			assertEnvelope(payload);
			assert.strictEqual(fake.calls[0].ignoreExitCode, true);
			assert.ok(payload.includes(`Sort-Object LastWriteTime -Descending`));
			assert.ok(payload.includes(`Select-Object -Skip 3`));
			assert.ok(payload.includes(`foreach ($item in $toDelete) {`));
			assert.ok(payload.includes(`try { Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop } catch { }`));
			assert.ok(payload.trimEnd().endsWith(`exit 0`));
			assert.ok(!/\|\s*Remove-Item[^\n]*-Force/.test(payload), 'must not use a single failing pipeline for deletion');
			const filterRegex = `'^code-insiders-[0-9a-f]{40}\\.exe$'`;
			assert.ok(payload.includes(filterRegex), 'filter must restrict to <archive>-<40hex>.exe');
		});

		test('rejects invalid keep counts', async () => {
			const p = windowsPlatform();
			const fake = createFakeExec([]);
			await assert.rejects(() => p.pruneOldClis(fake.exec, sdf, quality, -1), /Invalid keep count/);
			await assert.rejects(() => p.pruneOldClis(fake.exec, sdf, quality, 1.5), /Invalid keep count/);
			assert.strictEqual(fake.calls.length, 0);
		});
	});

	suite('findFallbackClis', () => {

		test('emits enumeration payload and filters remote output through parseFallbackCliPath', async () => {
			const p = windowsPlatform();
			const good = `C:\\Users\\alice\\${sdf}\\code-insiders-${commit}.exe`;
			const junk = `C:\\Users\\alice\\${sdf}\\code-insiders-${'g'.repeat(40)}.exe`;
			const wrongDir = `C:\\Users\\alice\\.other\\code-insiders-${commit}.exe`;
			const fake = createFakeExec([{
				match: /powershell/,
				stdout: [good, '', junk, wrongDir].join('\r\n') + '\r\n',
				code: 0,
			}]);

			const results = await p.findFallbackClis(fake.exec, sdf, quality);

			const payload = decodePayload(fake.calls[0].command);
			assert.deepStrictEqual({
				envelope: payload.startsWith(`$ErrorActionPreference = 'Stop'\n`),
				results,
				ignoreExitCode: fake.calls[0].ignoreExitCode,
			}, {
				envelope: true,
				results: [`'${good}'`] as RemotePath[],
				ignoreExitCode: true,
			});
		});
	});

	suite('launch commands', () => {

		test('buildLaunchCommand quotes literals but leaves a remote path expandable', () => {
			const p = windowsPlatform();
			const exe = p.cliBin(sdf, quality, commit);
			const cmd = p.buildLaunchCommand({
				executable: exe,
				args: ['--cli-data-dir', { path: p.cliDataDir(sdf) }, 'agent', 'host', '--port', '0\'trick'],
			});
			const payload = decodePayload(cmd);
			assertEnvelope(payload);
			assert.ok(payload.includes(`Write-Output "VSCODE_PID=$PID"`));
			// The data dir must arrive as a double-quoted PowerShell string so
			// `$env:USERPROFILE` expands. Single-quoting it would pass the
			// literal text through and the CLI would try to create a directory
			// named `$env:USERPROFILE\...`.
			assert.ok(payload.includes(`& ${exe} '--cli-data-dir' "$env:USERPROFILE\\${sdf}\\cli" 'agent' 'host' '--port' '0''trick'`), payload);
			assert.ok(payload.trimEnd().endsWith(`exit $LASTEXITCODE`));
		});

		test('buildRawLaunchCommand throws — raw overrides are POSIX-only', () => {
			const p = windowsPlatform();
			assert.throws(() => p.buildRawLaunchCommand('/opt/dev/code agent host'), /not supported on Windows/);
		});
	});
});

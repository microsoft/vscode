/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { resolveWindowsPlatformInfo } from '../../../node/remotePlatform/remotePlatformDetection.js';
import type { IRemotePlatformInfo } from '../../../node/remotePlatform/remotePlatform.js';
import { buildWindowsDetectionCommand, WindowsRemotePlatform } from '../../../node/remotePlatform/windowsRemotePlatform.js';
import type { ISshExec } from '../../../node/sshRemoteAgentHostHelpers.js';

const SDF = '.vscode-server-insiders';
const QUALITY = 'insider';
const ARCHIVE = 'code-insiders';
const COMMIT = 'abcdef0123456789abcdef0123456789abcdef01';
const CLI_MARKER = 'vscode-cli-payload-marker';

/**
 * How the wire command reaches `powershell.exe`. Win32-OpenSSH runs the
 * command through whatever default shell is configured, so both the
 * direct form and the `cmd.exe /c` form have to behave identically.
 */
type InvocationMode = 'direct' | 'cmd';

const MODES: readonly InvocationMode[] = ['direct', 'cmd'];

interface IExecResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly code: number;
}

const SYSTEM32 = join(process.env['SystemRoot'] || 'C:\\Windows', 'System32');

/** `where.exe` exits 0 when it finds its argument and 1 when it does not. */
const WHERE_EXE = join(SYSTEM32, 'where.exe');

/** First system executable that exits 0 for a bare `--version`. */
const VERSION_EXE = [join(SYSTEM32, 'curl.exe'), join(SYSTEM32, 'tar.exe')].find(candidate => fs.existsSync(candidate));

function spawnWire(command: string, mode: InvocationMode, home: string): Promise<IExecResult> {
	const [file, ...args] = command.split(' ');
	const options: cp.SpawnOptions = { env: { ...process.env, USERPROFILE: home }, windowsHide: true };
	const child = mode === 'cmd'
		? cp.spawn('cmd.exe', ['/c', command], { ...options, windowsVerbatimArguments: true })
		: cp.spawn(file, args, options);
	return new Promise<IExecResult>((resolve, reject) => {
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout?.on('data', chunk => stdout.push(chunk));
		child.stderr?.on('data', chunk => stderr.push(chunk));
		child.on('error', reject);
		child.on('close', code => resolve({
			stdout: Buffer.concat(stdout).toString('utf8'),
			stderr: Buffer.concat(stderr).toString('utf8'),
			code: code ?? -1,
		}));
	});
}

/**
 * Local stand-in for the SSH channel: runs the exact wire command the
 * platform produced and mirrors `sshExec`'s rejection on a non-zero exit.
 */
function createLocalExec(mode: InvocationMode, home: string): ISshExec {
	return async (command, opts) => {
		const result = await spawnWire(command, mode, home);
		if (result.code !== 0 && !opts?.ignoreExitCode) {
			throw new Error(`command failed (exit ${result.code}): ${command}\nstderr: ${result.stderr}`);
		}
		return result;
	};
}

function psLiteral(value: string): string {
	return `'${value.replace(/'/g, `''`)}'`;
}

async function runPowerShell(script: string): Promise<void> {
	const result = await new Promise<IExecResult>((resolve, reject) => {
		const child = cp.spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', chunk => stdout.push(chunk));
		child.stderr.on('data', chunk => stderr.push(chunk));
		child.on('error', reject);
		child.on('close', code => resolve({
			stdout: Buffer.concat(stdout).toString('utf8'),
			stderr: Buffer.concat(stderr).toString('utf8'),
			code: code ?? -1,
		}));
	});
	if (result.code !== 0) {
		throw new Error(`test scaffolding PowerShell failed (exit ${result.code}): ${result.stderr}`);
	}
}

function windowsPlatform(): WindowsRemotePlatform {
	const info: IRemotePlatformInfo = { os: 'win32', arch: 'x64' };
	return new WindowsRemotePlatform(info);
}

/** Absolute path a `$env:USERPROFILE`-rooted remote path resolves to. */
function installRootPath(home: string): string {
	return join(home, SDF);
}

function cliFilePath(home: string, name: string): string {
	return join(installRootPath(home), name);
}

function commitExeName(commit: string): string {
	return `${ARCHIVE}-${commit}.exe`;
}

function seedInstallRoot(home: string): string {
	const root = installRootPath(home);
	fs.mkdirSync(root, { recursive: true });
	return root;
}

/** Write `contents` and stamp a deterministic modification time on it. */
function writeStampedFile(path: string, contents: string, ageInHours: number): void {
	fs.writeFileSync(path, contents);
	const stamp = new Date(Date.UTC(2020, 0, 1, 0, 0, 0) + ageInHours * 3600_000);
	fs.utimesSync(path, stamp, stamp);
}

async function serveZip(bytes: Buffer): Promise<{ url: string; dispose(): Promise<void> }> {
	const http = await import('http');
	const server = http.createServer((_request, response) => {
		response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': String(bytes.length) });
		response.end(bytes);
	});
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${port}/cli.zip`,
		dispose: () => new Promise<void>(resolve => {
			server.closeAllConnections();
			server.close(() => resolve());
		}),
	};
}

async function createCliZip(dir: string): Promise<Buffer> {
	const stage = join(dir, 'stage');
	fs.mkdirSync(stage, { recursive: true });
	fs.writeFileSync(join(stage, `${ARCHIVE}.exe`), CLI_MARKER);
	const zipPath = join(dir, 'cli.zip');
	await runPowerShell(`Compress-Archive -Path ${psLiteral(join(stage, '*'))} -DestinationPath ${psLiteral(zipPath)} -Force`);
	return fs.readFileSync(zipPath);
}

(process.platform === 'win32' ? suite : suite.skip)('WindowsRemotePlatform payload execution', function () {

	// Every case spawns several real powershell.exe processes; the limit
	// exists only to bound a hang, never to gate a passing run.
	this.timeout(180_000);

	ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'winRemotePlatformExec');
		fs.mkdirSync(testDir, { recursive: true });
	});

	teardown(() => {
		fs.rmSync(testDir, { recursive: true, force: true, maxRetries: 3 });
	});

	/** Fresh `$env:USERPROFILE` so each invocation mode starts clean. */
	function homeFor(mode: InvocationMode): string {
		const home = join(testDir, mode);
		fs.mkdirSync(home, { recursive: true });
		return home;
	}

	test('isExecutableFile separates files from directories and missing paths', async () => {
		const platform = windowsPlatform();
		const observed: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			seedInstallRoot(home);
			fs.writeFileSync(cliFilePath(home, commitExeName(COMMIT)), CLI_MARKER);
			const exec = createLocalExec(mode, home);

			observed[mode] = {
				file: await platform.isExecutableFile(exec, platform.cliBin(SDF, QUALITY, COMMIT)),
				directory: await platform.isExecutableFile(exec, platform.installRoot(SDF)),
				missing: await platform.isExecutableFile(exec, platform.cliBin(SDF, QUALITY)),
			};
		}

		assert.deepStrictEqual(observed, {
			direct: { file: true, directory: false, missing: false },
			cmd: { file: true, directory: false, missing: false },
		});
	});

	test('touchFile advances the modification time and fails for missing paths', async () => {
		const platform = windowsPlatform();
		const observed: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			seedInstallRoot(home);
			const target = cliFilePath(home, commitExeName(COMMIT));
			writeStampedFile(target, CLI_MARKER, 0);
			const before = fs.statSync(target).mtimeMs;
			const exec = createLocalExec(mode, home);

			const touched = await platform.touchFile(exec, platform.cliBin(SDF, QUALITY, COMMIT));

			observed[mode] = {
				touched,
				advanced: fs.statSync(target).mtimeMs > before,
				missing: await platform.touchFile(exec, platform.cliBin(SDF, QUALITY)),
			};
		}

		assert.deepStrictEqual(observed, {
			direct: { touched: true, advanced: true, missing: false },
			cmd: { touched: true, advanced: true, missing: false },
		});
	});

	test('versionCheck reflects the CLI exit code', async function () {
		if (!VERSION_EXE) {
			this.skip();
		}
		const platform = windowsPlatform();
		const observed: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			seedInstallRoot(home);
			fs.copyFileSync(VERSION_EXE!, cliFilePath(home, commitExeName(COMMIT)));
			fs.copyFileSync(WHERE_EXE, cliFilePath(home, `${ARCHIVE}.exe`));
			const exec = createLocalExec(mode, home);

			observed[mode] = {
				succeeds: await platform.versionCheck(exec, platform.cliBin(SDF, QUALITY, COMMIT)),
				fails: await platform.versionCheck(exec, platform.cliBin(SDF, QUALITY)),
				missing: await platform.versionCheck(exec, platform.cliBin(SDF, 'stable')),
			};
		}

		assert.deepStrictEqual(observed, {
			direct: { succeeds: true, fails: false, missing: false },
			cmd: { succeeds: true, fails: false, missing: false },
		});
	});

	test('installCli downloads, expands and publishes the CLI, then tolerates a populated destination', async () => {
		const platform = windowsPlatform();
		const zipBytes = await createCliZip(testDir);
		const server = await serveZip(zipBytes);
		const observed: Record<string, unknown> = {};

		try {
			for (const mode of MODES) {
				const home = homeFor(mode);
				const exec = createLocalExec(mode, home);
				const options = {
					url: server.url,
					installRoot: platform.installRoot(SDF),
					cliBin: platform.cliBin(SDF, QUALITY, COMMIT),
				};

				await platform.installCli(exec, options);
				const installed = fs.readFileSync(cliFilePath(home, commitExeName(COMMIT)), 'utf8');
				await platform.installCli(exec, options);

				observed[mode] = {
					installed,
					stillInstalled: fs.readFileSync(cliFilePath(home, commitExeName(COMMIT)), 'utf8'),
					leftovers: fs.readdirSync(installRootPath(home)).filter(entry => entry.startsWith('.cli-install-')),
				};
			}
		} finally {
			await server.dispose();
		}

		assert.deepStrictEqual(observed, {
			direct: { installed: CLI_MARKER, stillInstalled: CLI_MARKER, leftovers: [] },
			cmd: { installed: CLI_MARKER, stillInstalled: CLI_MARKER, leftovers: [] },
		});
	});

	test('pruneOldClis keeps the newest commit-keyed binaries and leaves everything else', async () => {
		const platform = windowsPlatform();
		const commits = ['0'.repeat(40), '1'.repeat(40), 'a'.repeat(40), 'b'.repeat(40)];
		const observed: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			seedInstallRoot(home);
			commits.forEach((commit, index) => writeStampedFile(cliFilePath(home, commitExeName(commit)), CLI_MARKER, index));
			writeStampedFile(cliFilePath(home, `${ARCHIVE}.exe`), CLI_MARKER, 99);
			writeStampedFile(cliFilePath(home, 'unrelated.txt'), CLI_MARKER, 99);

			await platform.pruneOldClis(createLocalExec(mode, home), SDF, QUALITY, 2);

			observed[mode] = fs.readdirSync(installRootPath(home)).sort();
		}

		const survivors = [`${ARCHIVE}.exe`, commitExeName(commits[2]), commitExeName(commits[3]), 'unrelated.txt'].sort();
		assert.deepStrictEqual(observed, { direct: survivors, cmd: survivors });
	});

	test('findFallbackClis lists commit-keyed binaries newest first', async () => {
		const platform = windowsPlatform();
		const commits = ['0'.repeat(40), 'a'.repeat(40), 'f'.repeat(40)];
		const observed: Record<string, unknown> = {};
		const expected: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			seedInstallRoot(home);
			commits.forEach((commit, index) => writeStampedFile(cliFilePath(home, commitExeName(commit)), CLI_MARKER, index));
			writeStampedFile(cliFilePath(home, `${ARCHIVE}-nothex.exe`), CLI_MARKER, 99);
			writeStampedFile(cliFilePath(home, `${ARCHIVE}.exe`), CLI_MARKER, 99);

			observed[mode] = await platform.findFallbackClis(createLocalExec(mode, home), SDF, QUALITY);
			expected[mode] = [...commits].reverse().map(commit => psLiteral(cliFilePath(home, commitExeName(commit))));
		}

		assert.deepStrictEqual(observed, expected);
	});

	test('buildLaunchCommand reports the PID and propagates the launched exit code', async () => {
		const platform = windowsPlatform();
		const observed: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			seedInstallRoot(home);
			fs.copyFileSync(WHERE_EXE, cliFilePath(home, commitExeName(COMMIT)));
			const executable = platform.cliBin(SDF, QUALITY, COMMIT);

			const ok = await spawnWire(platform.buildLaunchCommand({ executable, args: ['cmd.exe'] }), mode, home);
			const failed = await spawnWire(platform.buildLaunchCommand({ executable, args: ['no-such-program-zzz'] }), mode, home);

			observed[mode] = {
				pidLine: /^VSCODE_PID=\d+$/.test(ok.stdout.split(/\r?\n/)[0]),
				okCode: ok.code,
				failedCode: failed.code,
			};
		}

		assert.deepStrictEqual(observed, {
			direct: { pidLine: true, okCode: 0, failedCode: 1 },
			cmd: { pidLine: true, okCode: 0, failedCode: 1 },
		});
	});

	test('a remote path argument reaches the launched program expanded', async () => {
		// The data dir is a shell expression (`"$env:USERPROFILE\..."`), not a
		// literal. Quoting it would hand the CLI the unexpanded text and it
		// would try to create a directory called `$env:USERPROFILE\...`.
		const platform = windowsPlatform();
		const observed: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			seedInstallRoot(home);
			fs.copyFileSync(join(SYSTEM32, 'cmd.exe'), cliFilePath(home, commitExeName(COMMIT)));
			const executable = platform.cliBin(SDF, QUALITY, COMMIT);

			const result = await spawnWire(platform.buildLaunchCommand({
				executable,
				args: ['/c', 'echo', { path: platform.cliDataDir(SDF) }],
			}), mode, home);

			const echoed = result.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop() ?? '';
			observed[mode] = {
				expanded: echoed === join(home, SDF, 'cli'),
				leakedExpression: echoed.includes('$env:USERPROFILE'),
			};
		}

		assert.deepStrictEqual(observed, {
			direct: { expanded: true, leakedExpression: false },
			cmd: { expanded: true, leakedExpression: false },
		});
	});

	test('the detection payload reports win32 and a supported architecture', async () => {
		const observed: Record<string, unknown> = {};

		for (const mode of MODES) {
			const home = homeFor(mode);
			const result = await spawnWire(buildWindowsDetectionCommand(), mode, home);
			observed[mode] = {
				code: result.code,
				info: resolveWindowsPlatformInfo(result.stdout),
			};
		}

		const hardwareArch = process.env['PROCESSOR_ARCHITEW6432'] || process.env['PROCESSOR_ARCHITECTURE'];
		const expected = { code: 0, info: { os: 'win32', arch: hardwareArch?.toLowerCase() === 'arm64' ? 'arm64' : 'x64' } };
		assert.deepStrictEqual(observed, { direct: expected, cmd: expected });
	});
});

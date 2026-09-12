/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { getCaseInsensitive } from '../../../../base/common/objects.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IRequestService } from '../../../request/common/request.js';
import { URI } from '../../../../base/common/uri.js';
import { DevContainerAgentHostMainService, getDevContainerCliPath, getDevContainerExecArgs, IDevContainerRelay, parseDevContainerMounts, parseDevContainerUpResult } from '../../node/devContainerAgentHostService.js';
import { ISshExec } from '../../node/sshRemoteAgentHostHelpers.js';

class TestRelay implements IDevContainerRelay {
	readonly sent: string[] = [];
	disposed = false;

	send(message: string): void {
		this.sent.push(message);
	}

	dispose(): void {
		this.disposed = true;
	}
}

class TestLogService extends NullLogService {
	readonly infoMessages: string[] = [];
	readonly warnings: { readonly message: string; readonly args: readonly unknown[] }[] = [];

	override info(message: string): void {
		this.infoMessages.push(message);
	}

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push({ message, args });
	}
}

class TestDevContainerAgentHostMainService extends DevContainerAgentHostMainService {
	readonly relay = new TestRelay();
	readonly execCommands: string[] = [];
	readonly devContainerArgs: string[][] = [];
	relayCommand: string | undefined;
	endpointPollsBeforeAvailable = 0;
	endpointPolls = 0;
	loadedCertificates = 0;
	writtenCertificates: readonly string[] | undefined;
	forceConcurrentRenameCollision = false;
	inheritedEnvironment: typeof process.env = process.env;
	platform: NodeJS.Platform = process.platform;
	remoteWorkspaceFolder = '/workspaces/project';
	gitRootFolder: string | undefined;
	gitRootReportedAsDubiousOwnership = false;
	safeDirectories: readonly string[] = [];
	containerMounts: readonly { readonly Type: string; readonly Source: string; readonly Destination: string }[] = [];
	containerMountsError: Error | undefined;
	hostDirectoryOwnedByCurrentUser = true;
	readonly checkedHostDirectories: string[] = [];
	private _renameCalls = 0;
	private readonly _firstRenameStarted = new DeferredPromise<void>();
	private readonly _secondRenameFinished = new DeferredPromise<void>();

	constructor(
		private readonly _libc = '',
		private readonly _forceCliInstall = false,
		private readonly _shellEnvironmentError?: Error,
		private readonly _testShellEnvironment: typeof process.env = process.env,
		systemCertificates = true,
		_certificates: readonly string[] = [],
		private readonly _existingCertificateFiles: ReadonlySet<string> = new Set(),
		testTmpDir = '/tmp',
		logService: NullLogService = new NullLogService(),
	) {
		const configurationService = new TestConfigurationService({ 'http.systemCertificates': systemCertificates });
		super(
			logService,
			new class extends mock<IProductService>() {
				override readonly quality = 'insider';
				override readonly serverDataFolderName = '.vscode-server-oss';
				override readonly commit = undefined;
			}(),
			NullTelemetryService,
			configurationService,
			new class extends mock<INativeEnvironmentService>() {
				override readonly args = Object.create(null);
				override readonly tmpDir = URI.file(testTmpDir);
				override readonly userDataPath = '/user-data';
			}(),
			new class extends mock<IRequestService>() {
				override async loadCertificates(): Promise<string[]> {
					return [..._certificates];
				}
			}(),
		);
	}

	protected override _resolveUserShellEnvironment(): Promise<typeof process.env> {
		if (this._shellEnvironmentError) {
			return Promise.reject(this._shellEnvironmentError);
		}
		return Promise.resolve(this._testShellEnvironment);
	}

	protected override _doResolveShellEnvironment(): Promise<typeof process.env> {
		return super._doResolveShellEnvironment(this.inheritedEnvironment, this.platform);
	}

	resolveShellEnvironment(): Promise<typeof process.env> {
		return this._resolveShellEnvironment();
	}

	resolveDevContainerEnvironment(): Promise<typeof process.env> {
		return this._resolveDevContainerEnvironment();
	}

	protected override _isFile(path: string): Promise<boolean> {
		return Promise.resolve(this._existingCertificateFiles.has(path));
	}

	protected override _writeCertificatesFile(certificates: readonly string[]): Promise<string> {
		this.loadedCertificates++;
		this.writtenCertificates = certificates;
		return Promise.resolve('/tmp/vscode-dev-container/certificates.pem');
	}

	writeCertificatesFile(certificates: readonly string[]): Promise<string> {
		return super._writeCertificatesFile(certificates);
	}

	getCertificatesDirectory(): string {
		return this._getCertificatesDirectory();
	}

	protected override async _renameCertificateFile(from: string, to: string): Promise<void> {
		if (!this.forceConcurrentRenameCollision) {
			return super._renameCertificateFile(from, to);
		}
		this._renameCalls++;
		if (this._renameCalls === 1) {
			this._firstRenameStarted.complete();
			await this._secondRenameFinished.p;
			const error = new Error('Target already exists') as NodeJS.ErrnoException;
			error.code = 'EEXIST';
			throw error;
		}
		await this._firstRenameStarted.p;
		try {
			await super._renameCertificateFile(from, to);
		} finally {
			this._secondRenameFinished.complete();
		}
	}

	protected override _runDevContainer(connectionId: string, args: readonly string[]): Promise<{ stdout: string; stderr: string; code: number }> {
		this.devContainerArgs.push([...args]);
		if (args[0] === 'exec') {
			return Promise.resolve({ stdout: '', stderr: '', code: 0 });
		}
		assert.deepStrictEqual(args, ['up', '--log-level', 'debug', '--workspace-folder', '/workspace']);
		this._reportOutput(connectionId, 'Starting Dev Container\n');
		return Promise.resolve({
			stdout: `[1 ms] Starting...\n${JSON.stringify({ outcome: 'success', containerId: 'container-id', remoteWorkspaceFolder: this.remoteWorkspaceFolder })}\n`,
			stderr: '',
			code: 0,
		});
	}

	protected override _getContainerMounts(): Promise<readonly { readonly Type: string; readonly Source: string; readonly Destination: string }[]> {
		if (this.containerMountsError) {
			return Promise.reject(this.containerMountsError);
		}
		return Promise.resolve(this.containerMounts);
	}

	protected override _isHostDirectoryOwnedByCurrentUser(path: string): Promise<boolean> {
		this.checkedHostDirectories.push(path);
		return Promise.resolve(this.hostDirectoryOwnedByCurrentUser);
	}

	createDevContainerExec(connectionId: string, workspaceFolder: string, token: CancellationToken): ISshExec {
		return super._createExec(connectionId, workspaceFolder, token);
	}

	protected override _createExec(): ISshExec {
		return async command => {
			this.execCommands.push(command);
			if (command.startsWith('command -v git ')) {
				return {
					stdout: this.gitRootReportedAsDubiousOwnership ? '' : this.gitRootFolder ?? '',
					stderr: this.gitRootReportedAsDubiousOwnership && this.gitRootFolder ? `fatal: detected dubious ownership in repository at '${this.gitRootFolder}'` : '',
					code: this.gitRootReportedAsDubiousOwnership || !this.gitRootFolder ? 128 : 0,
				};
			}
			if (command === 'git config --global --get-all safe.directory') {
				return { stdout: this.safeDirectories.join('\n'), stderr: '', code: this.safeDirectories.length ? 0 : 1 };
			}
			if (command === 'uname -s') {
				return { stdout: 'Linux\n', stderr: '', code: 0 };
			}
			if (command === 'uname -m') {
				return { stdout: 'x86_64\n', stderr: '', code: 0 };
			}
			if (command.includes('/etc/alpine-release')) {
				return { stdout: this._libc, stderr: '', code: 0 };
			}
			if (this._forceCliInstall && command.includes('--version &&')) {
				return { stdout: '', stderr: '', code: 1 };
			}
			if (command.includes('agent endpoints')) {
				this.endpointPolls++;
				return {
					stdout: JSON.stringify({
						userDataPath: '/home/vscode/.config/Code',
						endpoints: this.endpointPolls <= this.endpointPollsBeforeAvailable ? [] : [{
							schemaVersion: 2,
							type: 'standalone',
							pid: 42,
							instanceId: 'instance',
							protocolVersion: '1',
							connectionToken: 'token',
							endpoint: { type: 'tcp', host: '127.0.0.1', port: 1234 },
						}],
					}),
					stderr: '',
					code: 0,
				};
			}
			return { stdout: '', stderr: '', code: 0 };
		};
	}

	protected override _createRelay(
		_connectionId: string,
		_workspaceFolder: string,
		command: string,
		_endpoint: { readonly type: 'tcp'; readonly host: string; readonly port: number } | { readonly type: 'socket'; readonly path: string },
		_connectionToken: string | undefined,
		_token: CancellationToken,
	): Promise<IDevContainerRelay> {
		this.relayCommand = command;
		return Promise.resolve(this.relay);
	}
}

suite('Dev Container Agent Host Main Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the final Dev Container CLI result', () => {
		assert.deepStrictEqual(parseDevContainerUpResult([
			'[10 ms] Starting container',
			'{"outcome":"success","containerId":"abc","remoteWorkspaceFolder":"/workspaces/project"}',
		].join('\n')), {
			containerId: 'abc',
			remoteWorkspaceFolder: '/workspaces/project',
		});
	});

	test('parses Docker inspect mount information', () => {
		assert.deepStrictEqual({
			valid: parseDevContainerMounts('[{"Type":"bind","Source":"/host/project","Destination":"/workspaces/project"}]'),
		}, {
			valid: [{ Type: 'bind', Source: '/host/project', Destination: '/workspaces/project' }],
		});
		assert.throws(
			() => parseDevContainerMounts('[{"Type":"bind","Source":"/host/project"}]'),
			/Docker returned invalid mount information: Error in element 0: Error in property 'Destination': Expected string/,
		);
		assert.throws(() => parseDevContainerMounts('not json'), /Unable to parse Docker mount information/);
	});

	test('resolves the bundled Dev Container CLI', () => {
		const cliPath = getDevContainerCliPath();
		const result = spawnSync(process.execPath, [cliPath, '--version'], {
			encoding: 'utf8',
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		});
		assert.deepStrictEqual({
			exists: existsSync(cliPath),
			status: result.status,
			version: result.stdout.trim(),
		}, {
			exists: true,
			status: 0,
			version: '0.88.0',
		});
	});

	test('configures Dev Container CLI certificates like Remote Containers', async () => {
		const suppliedCertificatePath = '/custom/certificates.pem';
		const supplied = store.add(new TestDevContainerAgentHostMainService('', false, undefined, {
			...process.env,
			NODE_EXTRA_CA_CERTS: suppliedCertificatePath,
		}, true, ['ignored'], new Set([suppliedCertificatePath])));
		const disabled = store.add(new TestDevContainerAgentHostMainService('', false, undefined, process.env, false, ['ignored']));
		const loaded = store.add(new TestDevContainerAgentHostMainService('', false, undefined, process.env, true, ['CERT A', 'CERT B']));

		assert.deepStrictEqual({
			supplied: (await supplied.resolveDevContainerEnvironment()).NODE_EXTRA_CA_CERTS,
			suppliedLoads: supplied.loadedCertificates,
			disabled: (await disabled.resolveDevContainerEnvironment()).NODE_EXTRA_CA_CERTS,
			disabledLoads: disabled.loadedCertificates,
			loaded: (await loaded.resolveDevContainerEnvironment()).NODE_EXTRA_CA_CERTS,
			loadedCertificates: loaded.writtenCertificates,
		}, {
			supplied: suppliedCertificatePath,
			suppliedLoads: 0,
			disabled: process.env.NODE_EXTRA_CA_CERTS,
			disabledLoads: 0,
			loaded: '/tmp/vscode-dev-container/certificates.pem',
			loadedCertificates: ['CERT A', 'CERT B'],
		});
	});

	test('writes certificates to an owner-only cache and handles a concurrent writer', async () => {
		const testTmpDir = await mkdtemp(join(tmpdir(), 'vscode-dev-container-certificates-'));
		try {
			const service = store.add(new TestDevContainerAgentHostMainService('', false, undefined, process.env, true, [], new Set(), testTmpDir));
			service.forceConcurrentRenameCollision = true;
			const paths = await Promise.all([
				service.writeCertificatesFile(['CERT A', 'CERT B']),
				service.writeCertificatesFile(['CERT A', 'CERT B']),
			]);
			const directory = service.getCertificatesDirectory();
			const directoryStat = await lstat(directory);
			const fileStat = await lstat(paths[0]);

			assert.deepStrictEqual({
				samePath: paths[0] === paths[1],
				content: await readFile(paths[0], 'utf8'),
				entries: await readdir(directory),
				directoryIsSymlink: directoryStat.isSymbolicLink(),
				directoryMode: process.platform === 'win32' ? undefined : directoryStat.mode & 0o777,
				fileIsSymlink: fileStat.isSymbolicLink(),
				fileMode: process.platform === 'win32' ? undefined : fileStat.mode & 0o777,
			}, {
				samePath: true,
				content: `CERT A${process.platform === 'win32' ? '\r\n' : '\n'}CERT B`,
				entries: [paths[0].slice(directory.length + 1)],
				directoryIsSymlink: false,
				directoryMode: process.platform === 'win32' ? undefined : 0o700,
				fileIsSymlink: false,
				fileMode: process.platform === 'win32' ? undefined : 0o600,
			});
		} finally {
			await rm(testTmpDir, { recursive: true, force: true });
		}
	});

	(process.platform === 'win32' ? test.skip : test)('rejects a symlinked certificate cache directory', async () => {
		const testTmpDir = await mkdtemp(join(tmpdir(), 'vscode-dev-container-certificates-'));
		try {
			const service = store.add(new TestDevContainerAgentHostMainService('', false, undefined, process.env, true, [], new Set(), testTmpDir));
			const target = join(testTmpDir, 'target');
			await mkdir(target);
			await symlink(target, service.getCertificatesDirectory());

			await assert.rejects(service.writeCertificatesFile(['CERT']), /Owner-only path is not a directory/);
		} finally {
			await rm(testTmpDir, { recursive: true, force: true });
		}
	});

	test('uses the inherited environment when shell environment resolution fails', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService('', false, new Error('shell environment timeout')));
		service.platform = 'linux';
		service.inheritedEnvironment = { PATH: '/inherited/bin', VSCODE_TEST_VALUE: 'inherited' };

		assert.deepStrictEqual(await service.resolveShellEnvironment(), service.inheritedEnvironment);
	});

	test('merges the resolved shell environment with the inherited environment', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService('', false, undefined, { VSCODE_TEST_VALUE: 'resolved' }));
		service.platform = 'linux';

		const environment = await service.resolveShellEnvironment();

		assert.deepStrictEqual({
			path: getCaseInsensitive(environment, 'PATH'),
			testValue: environment.VSCODE_TEST_VALUE,
		}, {
			path: getCaseInsensitive(process.env, 'PATH'),
			testValue: 'resolved',
		});
	});

	test('adds the macOS Docker PATH fallback after a shell timeout without mutating the inherited environment', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService('', false, new Error('shell environment timeout')));
		service.platform = 'darwin';
		service.inheritedEnvironment = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', VSCODE_TEST_VALUE: 'inherited' };

		const environment = await service.resolveShellEnvironment();
		const launchEnvironment = await service.resolveDevContainerEnvironment();

		assert.deepStrictEqual({
			environment,
			launchPath: launchEnvironment.PATH,
			inheritedPath: service.inheritedEnvironment.PATH,
			cached: await service.resolveShellEnvironment() === environment,
		}, {
			environment: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin', VSCODE_TEST_VALUE: 'inherited' },
			launchPath: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
			inheritedPath: '/usr/bin:/bin:/usr/sbin:/sbin',
			cached: true,
		});
	});

	const pathCases: { name: string; platform: NodeJS.Platform; path: string | undefined; expectedPath: string | undefined }[] = [
		{ name: 'appends the macOS fallback after existing entries', platform: 'darwin', path: '/custom/bin:/usr/bin', expectedPath: '/custom/bin:/usr/bin:/usr/local/bin' },
		{ name: 'handles an empty macOS PATH without adding the current directory', platform: 'darwin', path: '', expectedPath: '/usr/local/bin' },
		{ name: 'handles a missing macOS PATH', platform: 'darwin', path: undefined, expectedPath: '/usr/local/bin' },
		{ name: 'preserves a leading macOS fallback entry', platform: 'darwin', path: '/usr/local/bin:/usr/bin', expectedPath: '/usr/local/bin:/usr/bin' },
		{ name: 'preserves a middle macOS fallback entry ignoring case', platform: 'darwin', path: '/custom/bin:/USR/LOCAL/BIN:/usr/bin', expectedPath: '/custom/bin:/USR/LOCAL/BIN:/usr/bin' },
		{ name: 'preserves a trailing macOS fallback entry', platform: 'darwin', path: '/usr/bin:/usr/local/bin', expectedPath: '/usr/bin:/usr/local/bin' },
		{ name: 'does not mistake a partial directory name for the macOS fallback', platform: 'darwin', path: '/usr/local/bin-extra:/custom/usr/local/bin', expectedPath: '/usr/local/bin-extra:/custom/usr/local/bin:/usr/local/bin' },
		{ name: 'leaves Linux PATH unchanged', platform: 'linux', path: '/usr/bin:/bin', expectedPath: '/usr/bin:/bin' },
		{ name: 'leaves Windows PATH unchanged', platform: 'win32', path: 'C:\\Windows\\System32', expectedPath: 'C:\\Windows\\System32' },
	];

	for (const { name, platform, path, expectedPath } of pathCases) {
		test(name, async () => {
			const shellEnvironment = { PATH: path };
			const service = store.add(new TestDevContainerAgentHostMainService('', false, undefined, shellEnvironment));
			service.platform = platform;
			service.inheritedEnvironment = { PATH: '/inherited/bin' };

			assert.deepStrictEqual({
				path: (await service.resolveShellEnvironment()).PATH,
				launchPath: (await service.resolveDevContainerEnvironment()).PATH,
				inheritedPath: service.inheritedEnvironment.PATH,
				shellPath: shellEnvironment.PATH,
			}, {
				path: expectedPath,
				launchPath: expectedPath,
				inheritedPath: '/inherited/bin',
				shellPath: path,
			});
		});
	}

	test('reuses a standalone endpoint and exposes its relay', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService());
		const output: string[] = [];
		store.add(service.onDidOutput(event => output.push(`${event.connectionId}:${event.data}`)));
		const result = await service.connect({
			connectionId: 'connection',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});
		await service.relaySend('connection', '{"jsonrpc":"2.0"}');
		await service.disconnect('connection');

		assert.deepStrictEqual({
			result,
			devContainerArgs: service.devContainerArgs,
			relayCommand: service.relayCommand,
			sent: service.relay.sent,
			disposed: service.relay.disposed,
			output,
		}, {
			result: {
				connectionId: 'connection',
				address: 'devcontainer:container-id',
				name: 'Project Dev Container',
				remoteWorkspaceFolder: '/workspaces/project',
			},
			devContainerArgs: [['up', '--log-level', 'debug', '--workspace-folder', '/workspace']],
			relayCommand: '~/.vscode-server-oss/code-insiders --cli-data-dir ~/.vscode-server-oss/cli agent relay \'instance\' --user-data-dir \'/home/vscode/.config/Code\'',
			sent: ['{"jsonrpc":"2.0"}'],
			disposed: true,
			output: ['connection:Starting Dev Container\n'],
		});
	});

	test('adds the exact bind-mounted repository root to Git safe.directory only when host-owned', async () => {
		const configured = store.add(new TestDevContainerAgentHostMainService());
		configured.remoteWorkspaceFolder = '/workspaces/project/folder';
		configured.gitRootFolder = '/workspaces/project';
		configured.gitRootReportedAsDubiousOwnership = true;
		configured.containerMounts = [{ Type: 'bind', Source: '/host/workspace', Destination: '/workspaces' }];
		await configured.connect({
			connectionId: 'configured',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});

		const unowned = store.add(new TestDevContainerAgentHostMainService());
		unowned.gitRootFolder = '/workspaces/project';
		unowned.containerMounts = configured.containerMounts;
		unowned.hostDirectoryOwnedByCurrentUser = false;
		await unowned.connect({
			connectionId: 'unowned',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});

		const outsideMount = store.add(new TestDevContainerAgentHostMainService());
		outsideMount.gitRootFolder = '/other/project';
		outsideMount.containerMounts = configured.containerMounts;
		await outsideMount.connect({
			connectionId: 'outside-mount',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});

		assert.deepStrictEqual({
			configuredHostDirectories: configured.checkedHostDirectories,
			configuredCommands: configured.execCommands.filter(command => command.includes('safe.directory')),
			unownedHostDirectories: unowned.checkedHostDirectories,
			unownedCommands: unowned.execCommands.filter(command => command.includes('safe.directory')),
			outsideMountHostDirectories: outsideMount.checkedHostDirectories,
			outsideMountCommands: outsideMount.execCommands.filter(command => command.includes('safe.directory')),
		}, {
			configuredHostDirectories: [join('/host/workspace', 'project')],
			configuredCommands: [
				'git config --global --get-all safe.directory',
				'git config --global --add safe.directory \'/workspaces/project\'',
			],
			unownedHostDirectories: [join('/host/workspace', 'project')],
			unownedCommands: [],
			outsideMountHostDirectories: [],
			outsideMountCommands: [],
		});
	});

	test('logs the safe.directory configuration duration on success and failure', async () => {
		const successLog = new TestLogService();
		const successful = store.add(new TestDevContainerAgentHostMainService('', false, undefined, process.env, true, [], new Set(), '/tmp', successLog));
		await successful.connect({
			connectionId: 'successful',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});

		const failureLog = new TestLogService();
		const failed = store.add(new TestDevContainerAgentHostMainService('', false, undefined, process.env, true, [], new Set(), '/tmp', failureLog));
		failed.gitRootFolder = '/workspaces/project';
		failed.gitRootReportedAsDubiousOwnership = true;
		failed.containerMountsError = new Error('Mount inspection failed');
		await failed.connect({
			connectionId: 'failed',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});

		const normalizeDuration = (message: string) => message.replace(/\d+ms/, '<duration>');
		const warning = failureLog.warnings.find(entry => entry.message.includes('Git safe.directory'));
		assert.deepStrictEqual({
			info: successLog.infoMessages.filter(message => message.includes('Git safe.directory configuration completed')).map(normalizeDuration),
			warning: warning && normalizeDuration(warning.message),
			error: warning?.args[0] instanceof Error ? warning.args[0].message : undefined,
		}, {
			info: ['[DevContainerAgentHost] Git safe.directory configuration completed in <duration>'],
			warning: '[DevContainerAgentHost] Failed to configure Git safe.directory after <duration>',
			error: 'Mount inspection failed',
		});
	});

	test('runs Dev Container exec commands with debug logging', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService());
		const exec = service.createDevContainerExec('connection', '/workspace', CancellationToken.None);

		await exec('printf test');

		assert.deepStrictEqual(service.devContainerArgs, [[
			'exec',
			'--log-level',
			'debug',
			'--workspace-folder',
			'/workspace',
			'/bin/sh',
			'-c',
			'printf test',
		]]);
	});

	test('runs the relay Dev Container exec command with debug logging', () => {
		assert.deepStrictEqual(
			getDevContainerExecArgs('/workspace', 'relay command'),
			['exec', '--log-level', 'debug', '--workspace-folder', '/workspace', '/bin/sh', '-c', 'relay command'],
		);
	});

	test('allows a cold Agent Host to register after the short default deadline', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const service = store.add(new TestDevContainerAgentHostMainService());
		service.endpointPollsBeforeAvailable = 21;

		const result = await service.connect({
			connectionId: 'connection',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});
		await service.disconnect('connection');

		assert.deepStrictEqual({
			address: result.address,
			polledPastShortDeadline: service.endpointPolls > 20,
		}, {
			address: 'devcontainer:container-id',
			polledPastShortDeadline: true,
		});
	}));

	test('installs the Alpine CLI artifact in a musl container', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService('musl', true));
		await service.connect({
			connectionId: 'connection',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});
		await service.disconnect('connection');

		assert.ok(service.execCommands.some(command =>
			command.includes('https://update.code.visualstudio.com/latest/cli-alpine-x64/insider')
		));
	});
});

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
import { DevContainerAgentHostMainService, getDevContainerCliPath, IDevContainerRelay, parseDevContainerUpResult } from '../../node/devContainerAgentHostService.js';
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

class TestDevContainerAgentHostMainService extends DevContainerAgentHostMainService {
	readonly relay = new TestRelay();
	readonly execCommands: string[] = [];
	relayCommand: string | undefined;
	endpointPollsBeforeAvailable = 0;
	endpointPolls = 0;
	loadedCertificates = 0;
	writtenCertificates: readonly string[] | undefined;
	forceConcurrentRenameCollision = false;
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
	) {
		const configurationService = new TestConfigurationService({ 'http.systemCertificates': systemCertificates });
		super(
			new NullLogService(),
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
		assert.deepStrictEqual(args, ['up', '--workspace-folder', '/workspace']);
		this._reportOutput(connectionId, 'Starting Dev Container\n');
		return Promise.resolve({
			stdout: '[1 ms] Starting...\n{"outcome":"success","containerId":"container-id","remoteWorkspaceFolder":"/workspaces/project"}\n',
			stderr: '',
			code: 0,
		});
	}

	protected override _createExec(): ISshExec {
		return async command => {
			this.execCommands.push(command);
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

		assert.strictEqual(await service.resolveShellEnvironment(), process.env);
	});

	test('merges the resolved shell environment with the inherited environment', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService('', false, undefined, { VSCODE_TEST_VALUE: 'resolved' }));

		const environment = await service.resolveShellEnvironment();

		assert.deepStrictEqual({
			path: getCaseInsensitive(environment, 'PATH'),
			testValue: environment.VSCODE_TEST_VALUE,
		}, {
			path: getCaseInsensitive(process.env, 'PATH'),
			testValue: 'resolved',
		});
	});

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
			relayCommand: '~/.vscode-server-oss/code-insiders --cli-data-dir ~/.vscode-server-oss/cli agent relay \'instance\' --user-data-dir \'/home/vscode/.config/Code\'',
			sent: ['{"jsonrpc":"2.0"}'],
			disposed: true,
			output: ['connection:Starting Dev Container\n'],
		});
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

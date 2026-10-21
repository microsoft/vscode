/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { arch } from '../../../../base/common/process.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileService } from '../../../files/common/files.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentNetworkDomainSettingId } from '../../../networkFilter/common/settings.js';
import type { ISandboxDependencyStatus, } from '../../common/sandboxHelperService.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isTerminalSandboxSupported } from '../../common/settings.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../common/terminalSandboxEngine.js';
import { type ITerminalSandboxResolvedNetworkDomains, TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from '../../common/terminalSandboxService.js';

suite('TerminalSandboxEngine', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let sandboxSettings: Map<string, unknown>;
	let sandboxSettingsEmitter: Emitter<void>;
	let fileService: MockFileService;
	let createdFiles: Map<string, string>;
	let createFileCount: number;
	let createdFolders: string[];

	function setSandboxSetting(key: string, value: unknown): void {
		sandboxSettings.set(key, value);
		sandboxSettingsEmitter.fire();
	}

	class MockFileService {
		private readonly _realpaths = new Map<string, string>();

		setRealpath(path: string, realpath: string): void {
			this._realpaths.set(path, realpath);
		}

		async realpath(uri: URI): Promise<URI | undefined> {
			const realpath = this._realpaths.get(uri.path);
			return realpath ? uri.with({ path: realpath }) : undefined;
		}

		async createFile(uri: URI, content: VSBuffer): Promise<any> {
			createFileCount++;
			const contentString = content.toString();
			createdFiles.set(uri.path, contentString);
			createdFiles.set(uri.fsPath, contentString);
			if (/^\/[a-zA-Z]:/.test(uri.path)) {
				createdFiles.set(uri.path.slice(1).replace(/\//g, '\\'), contentString);
			}
			return {};
		}
		async createFolder(uri: URI): Promise<any> {
			createdFolders.push(uri.path);
			return {};
		}
		async del(_uri: URI): Promise<void> { }
	}

	function createHost(overrides: Partial<ITerminalSandboxEngineHost> = {}): ITerminalSandboxEngineHost & { rootsEmitter: Emitter<void> } {
		const rootsEmitter = new Emitter<void>();
		const defaultRuntime: ITerminalSandboxRuntimeInfo = {
			appRoot: '/app',
			execPath: '/app/node',
			runAsNode: false,
		};
		const host: ITerminalSandboxEngineHost = {
			getOS: () => Promise.resolve(OperatingSystem.Linux),
			getRuntimeInfo: () => Promise.resolve(defaultRuntime),
			getUserHome: () => Promise.resolve(URI.file('/home/user')),
			getSandboxTempDir: () => Promise.resolve(URI.file('/home/user/.test-data/tmp')),
			getWorkspaceStorageReadRoot: () => Promise.resolve(undefined),
			getReadRoots: () => [],
			getWriteRoots: () => [URI.file('/workspace')],
			onDidChangeRoots: rootsEmitter.event,
			checkSandboxDependencies: (): Promise<ISandboxDependencyStatus | undefined> => Promise.resolve({ bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true }),
			getSandboxSetting: <T>(settingId: string): T | undefined => sandboxSettings.has(settingId) ? sandboxSettings.get(settingId) as T : undefined,
			onDidChangeSandboxSettings: sandboxSettingsEmitter.event,
			...overrides,
		};
		return Object.assign(host, { rootsEmitter });
	}

	setup(() => {
		createdFiles = new Map();
		createFileCount = 0;
		createdFolders = [];
		instantiationService = store.add(new TestInstantiationService());
		sandboxSettings = new Map();
		sandboxSettingsEmitter = store.add(new Emitter<void>());
		fileService = new MockFileService();

		sandboxSettings.set(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
		sandboxSettings.set(AgentSandboxSettingId.AgentSandboxAllowNetwork, false);
		sandboxSettings.set(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);

		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
	});

	test('runAsNode=true prefixes the wrapped command with ELECTRON_RUN_AS_NODE=1', async () => {
		const host = createHost({
			getRuntimeInfo: () => Promise.resolve({ appRoot: '/app', execPath: '/app/electron', runAsNode: true }),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();

		const wrapped = await engine.wrapCommand('echo hi');

		strictEqual(wrapped.isSandboxWrapped, true);
		ok(wrapped.command.startsWith('ELECTRON_RUN_AS_NODE=1 '), `Expected ELECTRON_RUN_AS_NODE=1 prefix. Actual: ${wrapped.command}`);
	});

	for (const enabled of [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On, true]) {
		test(`Windows sandbox is unsupported with enablement ${enabled}`, async () => {
			setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, enabled);
			setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
			const host = createHost({
				getOS: async () => OperatingSystem.Windows,
				getRuntimeInfo: async () => { throw new Error('Windows must not resolve a sandbox runtime'); },
				checkSandboxDependencies: async () => { throw new Error('Windows must not probe sandbox dependencies'); },
			});
			const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

			deepStrictEqual({
				enabled: await engine.isEnabled(),
				network: await engine.isSandboxAllowNetworkEnabled(),
				configPath: await engine.getSandboxConfigPath(),
				prerequisites: await engine.checkForSandboxingPrereqs(true),
				wrapped: await engine.wrapCommand('curl https://example.com', false, 'pwsh'),
				createdFiles: createFileCount,
				createdFolders,
			}, {
				enabled: false,
				network: false,
				configPath: undefined,
				prerequisites: { enabled: false, sandboxConfigPath: undefined, failedCheck: undefined },
				wrapped: { command: 'curl https://example.com', isSandboxWrapped: false },
				createdFiles: 0,
				createdFolders: [],
			});
		});
	}

	test('Local sandbox toggle support follows the execution OS', () => {
		deepStrictEqual([
			isTerminalSandboxSupported(OperatingSystem.Windows),
			isTerminalSandboxSupported(OperatingSystem.Linux),
			isTerminalSandboxSupported(OperatingSystem.Macintosh),
		], [false, true, true]);
	});

	test('runAsNode=false omits the ELECTRON_RUN_AS_NODE=1 prefix', async () => {
		const host = createHost({
			getRuntimeInfo: () => Promise.resolve({ appRoot: '/app', execPath: '/app/node', runAsNode: false }),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();

		const wrapped = await engine.wrapCommand('echo hi');

		strictEqual(wrapped.isSandboxWrapped, true);
		ok(!wrapped.command.startsWith('ELECTRON_RUN_AS_NODE='), `Did not expect ELECTRON_RUN_AS_NODE prefix. Actual: ${wrapped.command}`);
	});

	test('wrapCommand adds ripgrep-universal platform-arch bin directory to PATH', async () => {
		const host = createHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();

		const wrapped = await engine.wrapCommand('echo hi');

		ok(wrapped.command.includes(`/app/node_modules/@vscode/ripgrep-universal/bin/linux-${arch}`), `Expected ripgrep-universal platform-arch path in command. Actual: ${wrapped.command}`);
	});

	test('sandbox config enables PTY access by default on macOS', async () => {
		const host = createHost({ getOS: () => Promise.resolve(OperatingSystem.Macintosh) });
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(config.allowPty, true);
	});

	test('sandbox config does not enable PTY access by default on Linux', async () => {
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(Object.prototype.hasOwnProperty.call(config, 'allowPty'), false);
	});

	test('sandbox config includes host read roots without granting write access', async () => {
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({
			getReadRoots: () => [URI.file('/home/user/copilot-terminal-output')],
		})));

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		deepStrictEqual({
			allowRead: config.filesystem.allowRead.includes('/home/user/copilot-terminal-output'),
			allowWrite: config.filesystem.allowWrite.includes('/home/user/copilot-terminal-output'),
		}, {
			allowRead: true,
			allowWrite: false,
		});
	});

	test('sandbox config respects explicitly disabled PTY access on macOS', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, { allowPty: false });
		const host = createHost({ getOS: () => Promise.resolve(OperatingSystem.Macintosh) });
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(config.allowPty, false);
	});

	test('sandbox config preserves advanced runtime network settings when allowNetwork is enabled', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, {
			network: {
				allowAllUnixSockets: true,
				enabled: true,
			},
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		deepStrictEqual(config.network, {
			allowedDomains: [],
			deniedDomains: [],
			enabled: false,
			allowAllUnixSockets: true,
		});
	});

	for (const { name, os } of [
		{ name: 'Linux', os: OperatingSystem.Linux },
		{ name: 'macOS', os: OperatingSystem.Macintosh },
	]) {
		test(`canonicalizes Unicode domain policies before writing the ${name} sandbox configuration`, async () => {
			const allowedDomains = ['*.example.test', 'b\u00fccher.allowed.test', 'localhost', '127.0.0.1'];
			const deniedDomains = ['*.b\u00fccher.example.test', 'b\u00fccher.example.test', '*.xn--bcher-kva.existing.test'];
			setSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains, allowedDomains);
			setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, deniedDomains);
			const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({
				getOS: () => Promise.resolve(os),
			})));

			const wrapped = await engine.wrapCommand('node ./script.js');
			const configPath = await engine.getSandboxConfigPath();
			ok(configPath);
			const config: { network: ITerminalSandboxResolvedNetworkDomains } = JSON.parse(createdFiles.get(configPath)!);

			deepStrictEqual({
				network: config.network,
				resolvedDomains: engine.getResolvedNetworkDomains(),
				isSandboxWrapped: wrapped.isSandboxWrapped,
				requiresAllowNetworkConfirmation: wrapped.requiresAllowNetworkConfirmation,
				configuredDomains: { allowedDomains, deniedDomains },
			}, {
				network: {
					allowedDomains: ['*.example.test', 'xn--bcher-kva.allowed.test', 'localhost', '127.0.0.1'],
					deniedDomains: ['*.xn--bcher-kva.example.test', 'xn--bcher-kva.example.test', '*.xn--bcher-kva.existing.test'],
				},
				resolvedDomains: {
					allowedDomains: ['*.example.test', 'xn--bcher-kva.allowed.test', 'localhost', '127.0.0.1'],
					deniedDomains: ['*.xn--bcher-kva.example.test', 'xn--bcher-kva.example.test', '*.xn--bcher-kva.existing.test'],
				},
				isSandboxWrapped: true,
				requiresAllowNetworkConfirmation: undefined,
				configuredDomains: {
					allowedDomains: ['*.example.test', 'b\u00fccher.allowed.test', 'localhost', '127.0.0.1'],
					deniedDomains: ['*.b\u00fccher.example.test', 'b\u00fccher.example.test', '*.xn--bcher-kva.existing.test'],
				},
			});
		});
	}

	for (const settingId of [AgentNetworkDomainSettingId.AllowedNetworkDomains, AgentNetworkDomainSettingId.DeniedNetworkDomains]) {
		test(`invalid sandbox domain patterns in ${settingId} use a deny-all policy without throwing`, async () => {
			setSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.example.test']);
			setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['blocked.example.test']);
			setSandboxSetting(settingId, ['*.example.test', '*.bad..example.test']);
			const warn = instantiationService.spy(ILogService, 'warn');
			const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

			const resolvedDomains = engine.getResolvedNetworkDomains();
			const wrapped = await engine.wrapCommand('echo offline');
			const configPath = await engine.getSandboxConfigPath();
			ok(configPath);
			const config: { network: ITerminalSandboxResolvedNetworkDomains } = JSON.parse(createdFiles.get(configPath)!);

			deepStrictEqual({
				resolvedDomains,
				network: config.network,
				isSandboxWrapped: wrapped.isSandboxWrapped,
				requiresAllowNetworkConfirmation: wrapped.requiresAllowNetworkConfirmation,
				warningLogged: warn.calledWith(`TerminalSandboxEngine: Cannot normalize a domain pattern in ${settingId}; blocking all network access.`),
			}, {
				resolvedDomains: { allowedDomains: [], deniedDomains: [] },
				network: { allowedDomains: [], deniedDomains: [] },
				isSandboxWrapped: true,
				requiresAllowNetworkConfirmation: undefined,
				warningLogged: true,
			});
		});
	}

	test('recovers after invalid sandbox domain patterns are corrected', async () => {
		setSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.example.test']);
		setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['*.bad..example.test']);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath);
		const invalidConfig: { network: ITerminalSandboxResolvedNetworkDomains } = JSON.parse(createdFiles.get(configPath)!);

		setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['*.b\u00fccher.example.test']);
		const wrapped = await engine.wrapCommand('echo offline');
		const correctedConfig: { network: ITerminalSandboxResolvedNetworkDomains } = JSON.parse(createdFiles.get(configPath)!);

		deepStrictEqual({
			invalidNetwork: invalidConfig.network,
			correctedNetwork: correctedConfig.network,
			resolvedDomains: engine.getResolvedNetworkDomains(),
			isSandboxWrapped: wrapped.isSandboxWrapped,
		}, {
			invalidNetwork: { allowedDomains: [], deniedDomains: [] },
			correctedNetwork: {
				allowedDomains: ['*.example.test'],
				deniedDomains: ['*.xn--bcher-kva.example.test'],
			},
			resolvedDomains: {
				allowedDomains: ['*.example.test'],
				deniedDomains: ['*.xn--bcher-kva.example.test'],
			},
			isSandboxWrapped: true,
		});
	});

	test('requestAllowNetwork keeps the command sandboxed and refreshes its network config', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const wrapped = await engine.wrapCommand('curl https://example.com', false, 'bash', undefined, undefined, true);
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const unrestrictedConfig = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.isSandboxWrapped, true);
		strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
		deepStrictEqual(unrestrictedConfig.network, { allowedDomains: [], deniedDomains: [], enabled: false });

		await engine.wrapCommand('echo restricted again');
		const restrictedConfig = JSON.parse(createdFiles.get(configPath)!);
		deepStrictEqual(restrictedConfig.network, { allowedDomains: [], deniedDomains: [] });
	});

	test('requestAllowNetwork does not relax network access when per-command requests are disabled', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const wrapped = await engine.wrapCommand('curl https://example.com', false, 'bash', undefined, undefined, true);
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.isSandboxWrapped, true);
		strictEqual(wrapped.requiresAllowNetworkConfirmation, undefined);
		deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [] });
	});

	test('unsandboxed retry preserves the original working directory on Linux', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
		await engine.getSandboxConfigPath();

		const wrapped = await engine.wrapCommand('pwd', true, 'bash', URI.file('/workspace/with spaces'));

		strictEqual(wrapped.isSandboxWrapped, false);
		ok(wrapped.command.includes(`/workspace/with spaces`), `Expected the unsandboxed command to include cwd. Actual: ${wrapped.command}`);
		ok(wrapped.command.includes(`&& pwd`), `Expected the unsandboxed command to change to cwd before execution. Actual: ${wrapped.command}`);
	});

	test('blocked domains request sandboxed network access before execution when enabled', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
		setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['example.com']);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const wrapped = await engine.wrapCommand('curl https://example.com', false, 'bash');
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.isSandboxWrapped, true);
		strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
		deepStrictEqual(wrapped.blockedDomains, ['example.com']);
		deepStrictEqual(wrapped.deniedDomains, ['example.com']);
		deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [], enabled: false });
	});

	test('detects Unicode URL domains denied by sandbox policy before network relaxation', async () => {
		setSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.example.test']);
		setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['*.b\u00fccher.example.test']);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
		const commands = [
			'curl https://x.b\u00fccher.example.test/private',
			'curl https://x.xn--bcher-kva.example.test/private',
			'curl https://x.allowed.example.test/private',
		];
		const results = [];
		for (const command of commands) {
			const wrapped = await engine.wrapCommand(command);
			results.push({
				isSandboxWrapped: wrapped.isSandboxWrapped,
				requiresAllowNetworkConfirmation: wrapped.requiresAllowNetworkConfirmation,
				blockedDomains: wrapped.blockedDomains,
				deniedDomains: wrapped.deniedDomains,
			});
		}

		deepStrictEqual(results, [
			{
				isSandboxWrapped: true,
				requiresAllowNetworkConfirmation: true,
				blockedDomains: ['x.xn--bcher-kva.example.test'],
				deniedDomains: ['x.xn--bcher-kva.example.test'],
			},
			{
				isSandboxWrapped: true,
				requiresAllowNetworkConfirmation: true,
				blockedDomains: ['x.xn--bcher-kva.example.test'],
				deniedDomains: ['x.xn--bcher-kva.example.test'],
			},
			{
				isSandboxWrapped: true,
				requiresAllowNetworkConfirmation: undefined,
				blockedDomains: undefined,
				deniedDomains: undefined,
			},
		]);
	});

	test('onDidChangeRoots triggers a sandbox config rewrite on the next wrap', async () => {
		let writeRoots: URI[] = [URI.file('/workspace-a')];
		const host = createHost({
			getWriteRoots: () => writeRoots,
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();
		await engine.wrapCommand('echo a');
		const initialWriteCount = createFileCount;

		writeRoots = [URI.file('/workspace-b')];
		host.rootsEmitter.fire();
		await engine.wrapCommand('echo b');

		ok(createFileCount > initialWriteCount, `Expected sandbox config to be rewritten after onDidChangeRoots (initial=${initialWriteCount}, after=${createFileCount})`);
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath!)!);
		ok(config.filesystem.allowWrite.includes('/workspace-b'), 'Refreshed config should include the new write root');
		ok(!config.filesystem.allowWrite.includes('/workspace-a'), 'Refreshed config should drop the old write root');
	});

	test('always denies reads of the sandbox config file on Linux and macOS', async () => {
		for (const os of [OperatingSystem.Linux, OperatingSystem.Macintosh]) {
			const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({
				getOS: () => Promise.resolve(os),
			})));

			const configPath = await engine.getSandboxConfigPath();
			ok(configPath, 'Config path should be defined');
			const tempDirPath = engine.getTempDir()?.path;
			ok(tempDirPath, 'Temp dir path should be defined');
			const config = JSON.parse(createdFiles.get(configPath)!);

			deepStrictEqual({
				denyRead: config.filesystem.denyRead.includes(configPath),
				configAllowWrite: config.filesystem.allowWrite.includes(configPath),
				tempDirAllowWrite: config.filesystem.allowWrite.includes(tempDirPath),
			}, {
				denyRead: true,
				configAllowWrite: false,
				tempDirAllowWrite: true,
			});
		}
	});

	test('preserves filesystem symlink paths and resolves their targets on Linux when writing the config', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
			allowRead: ['~/read-link'],
			allowWrite: ['/write-link'],
			denyRead: ['~/deny-read-link'],
			denyWrite: ['/deny-write-link'],
		});
		fileService.setRealpath('/workspace-link', '/real/workspace');
		fileService.setRealpath('/write-link', '/real/write');
		fileService.setRealpath('/home/user/read-link', '/real/read');
		fileService.setRealpath('/home/user/deny-read-link', '/real/deny-read');
		fileService.setRealpath('/deny-write-link', '/real/deny-write');
		fileService.setRealpath('/home/user/.gnupg', '/real/gnupg');
		const host = createHost({
			getWriteRoots: () => [URI.file('/workspace-link')],
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		await engine.wrapCommand('git commit -S', false, undefined, undefined, [{ keyword: 'git', args: ['commit', '-S'] }]);

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);
		ok(config.filesystem.allowWrite.includes('/workspace-link'), 'Workspace write root symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/real/workspace'), 'Workspace write root symlink target should be included');
		ok(config.filesystem.allowWrite.includes('/write-link'), 'Configured allowWrite symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/real/write'), 'Configured allowWrite symlink target should be included');
		ok(config.filesystem.allowRead.includes('/home/user/read-link'), 'Configured allowRead should expand ~ and preserve the symlink');
		ok(config.filesystem.allowRead.includes('/real/read'), 'Configured allowRead symlink target should be included');
		ok(config.filesystem.allowRead.includes('/home/user/.gnupg'), 'Command runtime allowRead symlink should be preserved');
		ok(config.filesystem.allowRead.includes('/real/gnupg'), 'Command runtime allowRead symlink target should be included');
		ok(config.filesystem.allowWrite.includes('/home/user/.gnupg'), 'Command runtime allowWrite symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/real/gnupg'), 'Command runtime allowWrite symlink target should be included');
		ok(config.filesystem.denyRead.includes('/home/user/deny-read-link'), 'Configured denyRead should expand ~ and preserve the symlink');
		ok(config.filesystem.denyRead.includes('/real/deny-read'), 'Configured denyRead symlink target should be included');
		ok(config.filesystem.denyWrite.includes('/deny-write-link'), 'Configured denyWrite symlink should be preserved');
		ok(config.filesystem.denyWrite.includes('/real/deny-write'), 'Configured denyWrite symlink target should be included');
	});

	test('keeps filesystem paths without symlinks when writing the config', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
			allowRead: ['~/read-plain'],
			allowWrite: ['/write-plain'],
			denyRead: ['~/deny-read-plain'],
			denyWrite: ['/deny-write-plain'],
		});
		const host = createHost({
			getWriteRoots: () => [URI.file('/workspace-plain')],
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);
		ok(config.filesystem.allowWrite.includes('/workspace-plain'), 'Workspace write root without symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/write-plain'), 'Configured allowWrite without symlink should be preserved');
		ok(config.filesystem.allowRead.includes('/home/user/read-plain'), 'Configured allowRead without symlink should expand ~ and be preserved');
		ok(config.filesystem.denyRead.includes('/home/user/deny-read-plain'), 'Configured denyRead without symlink should expand ~ and be preserved');
		ok(config.filesystem.denyWrite.includes('/deny-write-plain'), 'Configured denyWrite without symlink should be preserved');
	});

	test('checkFileAccess validates write paths against allowWrite and denyWrite on Linux', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
			allowWrite: ['/configured/write', '/glob/**/*.ts'],
			denyWrite: ['/workspace/blocked'],
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const result = await engine.checkFileAccess('write', [
			'/workspace/file.txt',
			'/configured/write/file.txt',
			'/glob/nested/file.ts',
			'/outside/file.txt',
			'/workspace/blocked/file.txt',
		]);

		deepStrictEqual(result, {
			allowed: false,
			denied: ['/outside/file.txt', '/workspace/blocked/file.txt'],
		});
	});

	test('checkFileAccess validates read paths against denyRead and allowRead on Linux', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
			allowRead: ['~/.allowed-read'],
			allowWrite: ['~/.allowed-write'],
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const result = await engine.checkFileAccess('read', [
			'/home/user/private.txt',
			'/home/user/.allowed-read/config.json',
			'/home/user/.allowed-write/file.txt',
			'/etc/hosts',
		]);

		deepStrictEqual(result, {
			allowed: false,
			denied: ['/home/user/private.txt'],
		});
	});

	test('checkFileAccess preserves symlink source and target permissions on Linux', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
			allowWrite: ['/write-link'],
		});
		fileService.setRealpath('/write-link', '/real/write');
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		deepStrictEqual(await engine.checkFileAccess('write', ['/write-link/file.txt', '/real/write/file.txt']), {
			allowed: true,
			denied: [],
		});
	});

	test('cleanupTempDir is a no-op when no temp dir was ever created', async () => {
		const host = createHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		// Disable the sandbox so the engine never creates a temp dir.
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);

		strictEqual(engine.getTempDir(), undefined);
		await engine.cleanupTempDir(); // must not throw
	});

	test('precheck inputs can disable sandboxing when default approval permission is disabled', async () => {
		const host = createHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: true }), true);
		strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
		strictEqual(await engine.isSandboxAllowNetworkEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
		strictEqual(await engine.getSandboxConfigPath(false, { isDefaultApprovalPermissionEnabled: false }), undefined);

		deepStrictEqual(await engine.checkForSandboxingPrereqs(false, { isDefaultApprovalPermissionEnabled: false }), {
			enabled: false,
			sandboxConfigPath: undefined,
			failedCheck: undefined,
		});

		strictEqual(createFileCount, 0, 'Disabled sandbox precheck should not create sandbox config files');
	});

	test('uses OS-specific filesystem absolute path detection', async () => {
		const linuxEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
		await linuxEngine.getOS();
		const isLinuxAbsolutePath = (linuxEngine as unknown as { _isAbsoluteFileSystemPath(path: string): boolean })._isAbsoluteFileSystemPath.bind(linuxEngine);

		strictEqual(isLinuxAbsolutePath('/home/user'), true);
		strictEqual(isLinuxAbsolutePath('relative/path'), false);
		strictEqual(isLinuxAbsolutePath('C:\\Users\\user'), false);

		const windowsEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({ getOS: () => Promise.resolve(OperatingSystem.Windows) })));
		await windowsEngine.getOS();
		const isWindowsAbsolutePath = (windowsEngine as unknown as { _isAbsoluteFileSystemPath(path: string): boolean })._isAbsoluteFileSystemPath.bind(windowsEngine);

		strictEqual(isWindowsAbsolutePath('/Users/user'), true);
		strictEqual(isWindowsAbsolutePath('C:\\Users\\user'), true);
		strictEqual(isWindowsAbsolutePath('C:/Users/user'), true);
		strictEqual(isWindowsAbsolutePath('\\\\server\\share'), true);
		strictEqual(isWindowsAbsolutePath('relative\\path'), false);
	});

	test('checkForSandboxingPrereqs reports missing dependencies', async () => {
		let status: ISandboxDependencyStatus = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true, dependencyInstallCommand: 'sudo pacman -S --needed --noconfirm' };
		const host = createHost({
			checkSandboxDependencies: () => Promise.resolve(status),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const result = await engine.checkForSandboxingPrereqs();
		strictEqual(result.enabled, true);
		strictEqual(result.failedCheck, 'dependencies');
		strictEqual(result.missingDependencies?.[0], 'bubblewrap');
		strictEqual(result.canInstallMissingDependencies, true);

		status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
		const result2 = await engine.checkForSandboxingPrereqs(true);
		strictEqual(result2.failedCheck, undefined);
	});

	test('checkForSandboxingPrereqs caches missing dependencies until force refresh', async () => {
		let callCount = 0;
		let status: ISandboxDependencyStatus = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true };
		const host = createHost({
			checkSandboxDependencies: () => {
				callCount++;
				return Promise.resolve(status);
			},
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const first = await engine.checkForSandboxingPrereqs();
		const second = await engine.checkForSandboxingPrereqs();

		strictEqual(first.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
		strictEqual(second.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
		strictEqual(callCount, 1, 'Missing dependencies should be checked once and cached');

		status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
		const cached = await engine.checkForSandboxingPrereqs();
		strictEqual(cached.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies, 'Non-forced checks should keep using the cached missing status');
		strictEqual(callCount, 1);

		const refreshed = await engine.checkForSandboxingPrereqs(true);
		strictEqual(refreshed.failedCheck, undefined);
		strictEqual(callCount, 2, 'Force refresh should re-check dependencies after install or repair');
	});

	test('checkForSandboxingPrereqs reports remediation when bubblewrap is unusable', async () => {
		const host = createHost({
			checkSandboxDependencies: () => Promise.resolve({
				bubblewrapInstalled: true,
				bubblewrapUsable: false,
				bubblewrapError: 'Creating new namespace failed',
				socatInstalled: true,
				apparmorRestrictsUnprivilegedUserNamespaces: true,
			}),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const result = await engine.checkForSandboxingPrereqs();

		strictEqual(result.failedCheck, TerminalSandboxPrerequisiteCheck.Bubblewrap);
		deepStrictEqual(result.remediations, [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]);
		strictEqual(result.detail, 'Creating new namespace failed');
		strictEqual(result.missingDependencies, undefined);
	});

	test('checkForSandboxingPrereqs enables weaker nested sandbox when AppArmor is not restricting user namespaces', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, { allowPty: false });
		const host = createHost({
			checkSandboxDependencies: () => Promise.resolve({
				bubblewrapInstalled: true,
				bubblewrapUsable: false,
				socatInstalled: true,
				apparmorRestrictsUnprivilegedUserNamespaces: false,
			}),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const result = await engine.checkForSandboxingPrereqs();
		const configPath = await engine.getSandboxConfigPath();
		const config = JSON.parse(createdFiles.get(configPath!)!);

		strictEqual(result.failedCheck, undefined);
		strictEqual(config.enableWeakerNestedSandbox, true);
		strictEqual(config.allowPty, false);
	});

	test('checkForSandboxingPrereqs enables weaker nested sandbox after AppArmor remediation does not fix bubblewrap', async () => {
		const host = createHost({
			checkSandboxDependencies: () => Promise.resolve({
				bubblewrapInstalled: true,
				bubblewrapUsable: false,
				socatInstalled: true,
				apparmorRestrictsUnprivilegedUserNamespaces: true,
			}),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const beforeRemediation = await engine.checkForSandboxingPrereqs();
		const afterRemediation = await engine.checkForSandboxingPrereqs(true);
		const config = JSON.parse(createdFiles.get(afterRemediation.sandboxConfigPath!)!);

		strictEqual(beforeRemediation.failedCheck, TerminalSandboxPrerequisiteCheck.Bubblewrap);
		strictEqual(afterRemediation.failedCheck, undefined);
		strictEqual(config.enableWeakerNestedSandbox, true);
	});

});

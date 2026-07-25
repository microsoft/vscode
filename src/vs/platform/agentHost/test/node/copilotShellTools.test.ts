/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Tool, ToolInvocation, ToolResultObject } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import * as platform from '../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ISandboxHelperService } from '../../../sandbox/common/sandboxHelperService.js';
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from '../../../sandbox/common/terminalSandboxMxcRuntime.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from '../../common/sandboxConfigSchema.js';
import { AgentSandboxEnabledValue } from '../../../sandbox/common/settings.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import type { CreateTerminalParams } from '../../common/state/protocol/commands.js';
import { TerminalClaimKind, type TerminalClaim, type TerminalInfo } from '../../common/state/protocol/state.js';
import { formatTerminalText, IAgentHostTerminalManager, type ICommandFinishedEvent, type ISendTextOptions } from '../../node/agentHostTerminalManager.js';
import { createShellTools, type IUnsandboxedCommandConfirmationRequest, isMultilineCommand, ShellManager, prefixForHistorySuppression, shellTypeForExecutable } from '../../node/copilot/copilotShellTools.js';

class TestAgentHostTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	defaultShell = '/bin/bash';
	readonly created: { params: CreateTerminalParams; options?: { shell?: string; preventShellHistory?: boolean; nonInteractive?: boolean } }[] = [];
	readonly writes: { uri: string; data: string }[] = [];
	readonly sentTexts: { uri: string; data: string; options: ISendTextOptions }[] = [];
	readonly existingTerminalUris = new Set<string>();
	commandDetectionSupported = false;
	readonly commandFinishedListenerRegistered = new DeferredPromise<void>();
	private readonly _onCommandFinished = new Emitter<ICommandFinishedEvent>();
	private readonly _onData = new Emitter<string>();
	private readonly _onExit = new Emitter<number>();
	private readonly _onClaimChanged = new Emitter<TerminalClaim>();
	private readonly _onDidSendText = new Emitter<void>();
	readonly onDidSendText = this._onDidSendText.event;
	private readonly _altBufferPromises: DeferredPromise<void>[] = [];
	private _content: string | undefined;

	async createTerminal(params: CreateTerminalParams, options?: { shell?: string; preventShellHistory?: boolean; nonInteractive?: boolean }): Promise<void> {
		this.created.push({ params, options: { ...options, shell: options?.shell ?? this.defaultShell } });
	}
	writeInput(uri: string, data: string): void {
		this.writes.push({ uri, data });
	}
	async sendText(uri: string, data: string, options: ISendTextOptions): Promise<void> {
		this.sentTexts.push({ uri, data, options });
		this.writeInput(uri, formatTerminalText(data, options));
		this._onDidSendText.fire();
	}
	onData(_uri: string, cb: (data: string) => void): IDisposable { return this._onData.event(cb); }
	onExit(_uri: string, cb: (exitCode: number) => void): IDisposable { return this._onExit.event(cb); }
	onClaimChanged(_uri: string, cb: (claim: TerminalClaim) => void): IDisposable { return this._onClaimChanged.event(cb); }
	onCommandFinished(_uri: string, cb: (event: ICommandFinishedEvent) => void): IDisposable {
		this.commandFinishedListenerRegistered.complete();
		return this._onCommandFinished.event(cb);
	}
	createAltBufferPromise(_uri: string, store: DisposableStore): Promise<void> {
		const deferred = new DeferredPromise<void>();
		this._altBufferPromises.push(deferred);
		store.add({
			dispose: () => {
				const index = this._altBufferPromises.indexOf(deferred);
				if (index !== -1) {
					this._altBufferPromises.splice(index, 1);
				}
			}
		});
		return deferred.p;
	}
	getContent(): string | undefined { return this._content; }
	getClaim(): TerminalClaim | undefined { return undefined; }
	hasTerminal(uri: string): boolean { return this.existingTerminalUris.has(uri); }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return this.commandDetectionSupported; }
	disposeTerminal(): void { }
	getTerminalInfos(): TerminalInfo[] { return []; }
	getTerminalState(): undefined { return undefined; }
	async getDefaultShell(): Promise<string> { return this.defaultShell; }
	createOutputTerminal(): void { }
	appendOutputTerminalData(): void { }
	resetOutputTerminal(): void { }
	finalizeOutputTerminal(): void { }
	fireCommandFinished(event: ICommandFinishedEvent): void { this._onCommandFinished.fire(event); }
	fireData(data: string): void { this._onData.fire(data); }
	fireExit(exitCode: number): void { this._onExit.fire(exitCode); }
	fireClaimChanged(claim: TerminalClaim): void { this._onClaimChanged.fire(claim); }
	setContent(content: string | undefined): void { this._content = content; }
	fireDidEnterAltBuffer(): void {
		for (const promise of [...this._altBufferPromises]) {
			promise.complete();
		}
	}
}

suite('CopilotShellTools', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	interface IFakeAgentConfigurationService {
		readonly service: IAgentConfigurationService;
		setSandboxValue(key: string, value: unknown): void;
	}

	function createFakeAgentConfigurationService(initialSandbox?: Record<string, unknown>): IFakeAgentConfigurationService {
		const sandbox: Record<string, unknown> = { ...initialSandbox };
		const configValues: Record<string, unknown> = { [AgentHostSandboxConfigKey.Sandbox]: sandbox };
		const emitter = disposables.add(new Emitter<void>());
		const service: IAgentConfigurationService = {
			_serviceBrand: undefined,
			onDidRootConfigChange: emitter.event,
			onDidSessionConfigChange: Event.None,
			getEffectiveValue: () => undefined,
			getEffectiveWorkingDirectory: () => undefined,
			isWorkingDirectoryPending: () => false,
			resolveWorkingDirectoryForResume: async (_session, workingDirectory) => workingDirectory,
			getSessionConfigValues: () => undefined,
			updateSessionConfig: () => { /* no-op */ },
			getRootValue: ((_schema: unknown, key: string) => configValues[key]) as IAgentConfigurationService['getRootValue'],
			updateRootConfig: () => { /* no-op */ },
			persistRootConfig: () => { /* no-op */ },
			whenIdle: async () => { /* no-op */ },
		};
		return {
			service,
			setSandboxValue(key, value) {
				sandbox[key] = value;
				emitter.fire();
			},
		};
	}

	function createStubSandboxHelperService(): ISandboxHelperService {
		// Stub used by every test that constructs a `ShellManager`. Avoids loading
		// the real node-only `SandboxHelperService`, which dynamically imports
		// `@microsoft/mxc-sdk` and fails to resolve in the electron renderer test
		// runner used by `scripts/test.bat`.
		return {
			_serviceBrand: undefined,
			checkSandboxDependencies: async () => undefined,
			getWindowsMxcFilesystemPolicy: async () => ({ readonlyPaths: [], readwritePaths: [] }),
			getWindowsMxcEnvironment: async () => [],
			buildWindowsMxcSandboxPayload: async (commandLine, policy, workingDirectory, containerName = 'vscode-terminal-sandbox', containment = 'process') => ({
				version: policy.version,
				containerId: containerName,
				containment,
				lifecycle: { destroyOnExit: true, preservePolicy: false },
				process: { commandLine, cwd: workingDirectory, timeout: policy.timeoutMs ?? 0 },
				filesystem: {
					readwritePaths: [...(policy.filesystem?.readwritePaths ?? [])],
					readonlyPaths: [...(policy.filesystem?.readonlyPaths ?? [])],
					deniedPaths: [...(policy.filesystem?.deniedPaths ?? [])],
				},
				network: { defaultPolicy: policy.network?.allowOutbound ? 'allow' : 'block' },
				ui: { disable: !(policy.ui?.allowWindows ?? false), clipboard: policy.ui?.clipboard ?? 'none', injection: policy.ui?.allowInputInjection ?? false },
			}),
		} satisfies ISandboxHelperService;
	}

	function createServices(options?: { sandboxEnabled?: boolean; deletedFolders?: string[]; createdFiles?: Map<string, string> }): { instantiationService: IInstantiationService; terminalManager: TestAgentHostTerminalManager; agentConfigurationService: IFakeAgentConfigurationService } {
		const terminalManager = new TestAgentHostTerminalManager();
		const initialSandboxValues: Record<string, unknown> = {};
		if (options?.sandboxEnabled) {
			initialSandboxValues[AgentHostSandboxKey.Enabled] = AgentSandboxEnabledValue.On;
			// Windows uses a separate enable key; the engine treats
			// `Enabled=On` on non-Windows and `WindowsEnabled=AllowNetwork`
			// on Windows as "sandbox active". Set both so tests exercise
			// the sandbox path on every OS.
			initialSandboxValues[AgentHostSandboxKey.WindowsEnabled] = AgentSandboxEnabledValue.AllowNetwork;
		}
		const agentConfigurationService = createFakeAgentConfigurationService(initialSandboxValues);
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IAgentHostTerminalManager, terminalManager);
		services.set(IAgentConfigurationService, agentConfigurationService.service);
		services.set(IFileService, {
			createFile: async (uri: URI, content: VSBuffer) => {
				if (options?.createdFiles) {
					options.createdFiles.set(uri.path, content.toString());
				}
				return ({} as never);
			},
			createFolder: async () => ({} as never),
			del: async (uri: URI) => { options?.deletedFolders?.push(uri.path); },
			realpath: async () => undefined,
		} as Partial<IFileService> as IFileService);
		services.set(IEnvironmentService, {
			userHome: URI.file('/home/test-user'),
		} as Partial<IEnvironmentService> & { userHome: URI } as IEnvironmentService);
		services.set(IProductService, { dataFolderName: '.test-data' } as Partial<IProductService> as IProductService);
		// Stub the sandbox helper so the engine never imports `@microsoft/mxc-sdk`
		// (a node-only dynamic import that fails to resolve in the electron
		// renderer test runner used by `scripts/test.bat` on Windows CI).
		services.set(ISandboxHelperService, createStubSandboxHelperService());
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		services.set(IInstantiationService, instantiationService);
		services.set(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
		return { instantiationService, terminalManager, agentConfigurationService };
	}

	async function waitForSentTexts(terminalManager: TestAgentHostTerminalManager, count: number): Promise<void> {
		while (terminalManager.sentTexts.length < count) {
			const didTimeOut = await new Promise<boolean>(resolve => {
				const disposables = new DisposableStore();
				const listener = Event.once(terminalManager.onDidSendText)(() => {
					disposables.dispose();
					resolve(false);
				});
				disposables.add(listener);
				const handle = setTimeout(() => {
					disposables.dispose();
					resolve(true);
				}, 1000);
				disposables.add({ dispose: () => clearTimeout(handle) });
			});
			if (didTimeOut) {
				assert.fail(`Timed out waiting for ${count} sendText calls; saw ${terminalManager.sentTexts.length}`);
			}
		}
	}

	function markCreatedTerminalsExist(terminalManager: TestAgentHostTerminalManager): void {
		for (const created of terminalManager.created) {
			terminalManager.existingTerminalUris.add(created.params.channel);
		}
	}

	test('uses session working directory for created shells', async () => {
		const { instantiationService, terminalManager } = createServices();
		const worktreePath = URI.file('/workspace/worktree').fsPath;
		const explicitCwd = URI.file('/explicit/cwd').fsPath;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), URI.file(worktreePath)));

		(await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1')).dispose();
		(await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2', explicitCwd)).dispose();

		assert.deepStrictEqual(terminalManager.created.map(c => c.params.cwd), [
			worktreePath,
			explicitCwd,
		]);
	});

	test('opts every managed shell into shell-history suppression and non-interactive mode', async () => {
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');

		assert.strictEqual(terminalManager.created.length, 1);
		assert.strictEqual(terminalManager.created[0].options?.preventShellHistory, true);
		assert.strictEqual(terminalManager.created[0].options?.nonInteractive, true);
	});

	test('uses the executable resolved by the terminal manager', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.defaultShell = '/custom/path/to/pwsh';
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		await shellManager.getOrCreateShell('powershell', 'turn-1', 'tool-1');

		assert.strictEqual(terminalManager.created[0].options?.shell, '/custom/path/to/pwsh');
	});

	test('prefixForHistorySuppression prepends a space for POSIX shells, no-op for PowerShell', () => {
		assert.strictEqual(prefixForHistorySuppression('bash'), ' ');
		assert.strictEqual(prefixForHistorySuppression('powershell'), '');
	});

	test('shellTypeForExecutable maps known shell basenames and falls back to platform default', () => {
		assert.deepStrictEqual([
			shellTypeForExecutable('C:\\Program Files\\PowerShell\\7\\pwsh.exe'),
			shellTypeForExecutable('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
			shellTypeForExecutable('/usr/bin/bash'),
			shellTypeForExecutable('/usr/bin/zsh'),
			shellTypeForExecutable('/bin/sh'),
		], ['powershell', 'powershell', 'bash', 'bash', 'bash']);

		// Unknown shells fall through to the platform default — just assert it's one of the known types.
		const unknownDefault = shellTypeForExecutable('C:\\Windows\\System32\\cmd.exe');
		assert.ok(unknownDefault === 'bash' || unknownDefault === 'powershell');
	});

	test('zsh executable keeps bash tool name but uses zsh-specific guidance', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.defaultShell = '/bin/zsh';
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');

		assert.ok(bashTool);
		assert.strictEqual(bashTool.name, 'bash');
		assert.ok(bashTool.description);
		const description = bashTool.description;
		assert.match(description, /persistent zsh terminal session/);
		assert.match(description, /zsh globbing features/);
		assert.match(description, /bare == or ===/);
		assert.match(description, /status as a variable name/);
		assert.doesNotMatch(description, /bang history/);
		assert.doesNotMatch(description, /# comments/);
	});

	test('getOrCreateShell reuses an idle shell after the reference is disposed', async () => {
		const terminalManager = new TestAgentHostTerminalManager();
		// Pretend created terminals exist and are still running.
		(terminalManager as unknown as { hasTerminal: () => boolean }).hasTerminal = () => true;
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IAgentHostTerminalManager, terminalManager);
		services.set(ISandboxHelperService, createStubSandboxHelperService());
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		services.set(IInstantiationService, instantiationService);
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		const first = await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');
		first.dispose();
		const second = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.strictEqual(second.object.id, first.object.id, 'should reuse idle shell');
		assert.strictEqual(terminalManager.created.length, 1);
		second.dispose();
	});

	test('getOrCreateShell creates a new shell when the existing reference is still held', async () => {
		const terminalManager = new TestAgentHostTerminalManager();
		(terminalManager as unknown as { hasTerminal: () => boolean }).hasTerminal = () => true;
		const services = new ServiceCollection();
		services.set(ILogService, new NullLogService());
		services.set(IAgentHostTerminalManager, terminalManager);
		services.set(ISandboxHelperService, createStubSandboxHelperService());
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		services.set(IInstantiationService, instantiationService);
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		const first = await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');
		const second = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.notStrictEqual(second.object.id, first.object.id, 'should create a new shell when existing is busy');
		assert.strictEqual(terminalManager.created.length, 2);
		first.dispose();
		second.dispose();
	});

	test('shell helper tools (read/write/shutdown/list/redirect) are registered with skipPermission: true', async () => {
		// Regression guard: the SDK's built-in shell helpers never call
		// `permissions.request`. Our PTY-backed overrides must mirror that
		// or the agent host will surface a permission prompt for every
		// `write_bash` / `read_bash` / `bash_shutdown` / `list_bash` call,
		// which breaks interactive shell flows.
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());

		const skipPermissionByName = Object.fromEntries(tools.map(t => [t.name, t.skipPermission ?? false]));
		assert.deepStrictEqual(skipPermissionByName, {
			bash: false,
			read_bash: true,
			write_bash: true,
			bash_shutdown: true,
			list_bash: true,
			powershell: true,
		});
	});

	test('primary shell tool normalizes multiline command input', async () => {
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo first\necho second', timeout: 1 },
		};
		const result = await bashTool.handler!({ command: 'echo first\necho second', timeout: 1 }, invocation) as ToolResultObject;

		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, true);
		assert.strictEqual(terminalManager.sentTexts[1].options.bracketedPasteMode, undefined);
		assert.strictEqual(terminalManager.writes[0].data, ' echo first\recho second\r');
		assert.match(terminalManager.writes[1].data, /^echo "<<<COPILOT_SENTINEL_[a-f0-9]+_EXIT_\$\?>>>"\r$/);
	});

	test('primary shell tool ignores echoed sentinel command text', async () => {
		const { instantiationService, terminalManager } = createServices();

		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo MOCKED_AGENT_HOST_SANDBOX_RESPONSE', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'echo MOCKED_AGENT_HOST_SANDBOX_RESPONSE', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 2);

		const sentinelMatch = terminalManager.writes[1].data.match(/<<<COPILOT_SENTINEL_([a-f0-9]+)_EXIT_\$\?>>/);
		assert.ok(sentinelMatch, 'sentinel marker should be present');
		const sentinelId = sentinelMatch[1];
		const content = [
			' echo MOCKED_AGENT_HOST_SANDBOX_RESPONSE',
			'MOCKED_AGENT_HOST_SANDBOX_RESPONSE',
			`echo "<<<COPILOT_SENTINEL_${sentinelId}_EXIT_$?>>>"`,
			`<<<COPILOT_SENTINEL_${sentinelId}_EXIT_0>>>`,
		].join('\r\n');
		terminalManager.setContent(content);
		terminalManager.fireData(content);

		const result = await resultPromise;
		assert.strictEqual(result.resultType, 'success');
		assert.match(result.textResultForLlm, /Exit code: 0/);
		assert.match(result.textResultForLlm, /MOCKED_AGENT_HOST_SANDBOX_RESPONSE/);
	});

	test('primary shell tool forces bracketed paste with shell integration', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo first\necho second', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'echo first\necho second', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await terminalManager.commandFinishedListenerRegistered.p;
		terminalManager.fireCommandFinished({ commandId: 'cmd-1', exitCode: 0, command: 'echo first\necho second', output: 'first\nsecond' });
		const result = await resultPromise;

		assert.strictEqual(result.resultType, 'success');
		assert.strictEqual(terminalManager.sentTexts.length, 1);
		assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, true);
		assert.strictEqual(terminalManager.writes[0].data, ' echo first\recho second\r');
	});

	test('primary shell tool returns alternateBuffer when shell integration enters alt buffer', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'vim README.md', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'vim README.md', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 1);
		terminalManager.fireDidEnterAltBuffer();
		const result = await resultPromise;

		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(result.error, 'alternateBuffer');
		assert.match(result.textResultForLlm, /opened the alternate buffer/);
	});

	test('primary shell tool returns alternateBuffer when sentinel fallback enters alt buffer', async () => {
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'vim README.md', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'vim README.md', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 2);
		terminalManager.fireDidEnterAltBuffer();
		const result = await resultPromise;

		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(result.error, 'alternateBuffer');
		assert.match(result.textResultForLlm, /opened the alternate buffer/);
	});

	test('alt-buffer shell is released when command finishes', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'vim README.md', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'vim README.md', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 1);
		terminalManager.fireDidEnterAltBuffer();
		const result = await resultPromise;
		assert.strictEqual(result.error, 'alternateBuffer');
		markCreatedTerminalsExist(terminalManager);
		const shell = shellManager.listShells()[0];

		terminalManager.fireCommandFinished({ commandId: 'cmd-1', exitCode: 0, command: 'vim README.md', output: '' });
		const next = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.strictEqual(next.object.id, shell.id);
		assert.strictEqual(terminalManager.created.length, 1);
		next.dispose();
	});

	test('alt-buffer shell is not immediately reused', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'vim README.md', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'vim README.md', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 1);
		terminalManager.fireDidEnterAltBuffer();
		const result = await resultPromise;
		assert.strictEqual(result.error, 'alternateBuffer');
		markCreatedTerminalsExist(terminalManager);
		const shell = shellManager.listShells()[0];

		const next = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.notStrictEqual(next.object.id, shell.id);
		assert.strictEqual(terminalManager.created.length, 2);
		next.dispose();
	});

	test('backgrounded shell is not immediately reused', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'sleep 100', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'sleep 100', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 1);
		terminalManager.fireClaimChanged({ kind: TerminalClaimKind.Session, session: 'copilot:/session-1', turnId: 'turn-1' });
		const result = await resultPromise;
		assert.strictEqual(result.resultType, 'success');
		assert.match(result.textResultForLlm, /continue this command in the background/);
		markCreatedTerminalsExist(terminalManager);
		const shell = shellManager.listShells()[0];

		const next = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.notStrictEqual(next.object.id, shell.id);
		assert.strictEqual(terminalManager.created.length, 2);
		next.dispose();
	});

	test('backgrounded shell is released when command finishes', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'sleep 100', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'sleep 100', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 1);
		terminalManager.fireClaimChanged({ kind: TerminalClaimKind.Session, session: 'copilot:/session-1', turnId: 'turn-1' });
		const result = await resultPromise;
		assert.strictEqual(result.resultType, 'success');
		markCreatedTerminalsExist(terminalManager);
		const shell = shellManager.listShells()[0];

		terminalManager.fireCommandFinished({ commandId: 'cmd-1', exitCode: 0, command: 'sleep 100', output: '' });
		const next = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.strictEqual(next.object.id, shell.id);
		assert.strictEqual(terminalManager.created.length, 1);
		next.dispose();
	});

	test('backgrounded shell is released when terminal exits', async () => {
		const { instantiationService, terminalManager } = createServices();
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'sleep 100', timeout: 1000 },
		};
		const resultPromise = bashTool.handler!({ command: 'sleep 100', timeout: 1000 }, invocation) as Promise<ToolResultObject>;
		await waitForSentTexts(terminalManager, 1);
		terminalManager.fireClaimChanged({ kind: TerminalClaimKind.Session, session: 'copilot:/session-1', turnId: 'turn-1' });
		const result = await resultPromise;
		assert.strictEqual(result.resultType, 'success');
		markCreatedTerminalsExist(terminalManager);
		const shell = shellManager.listShells()[0];

		terminalManager.fireExit(0);
		const next = await shellManager.getOrCreateShell('bash', 'turn-2', 'tool-2');

		assert.strictEqual(next.object.id, shell.id);
		assert.strictEqual(terminalManager.created.length, 1);
		next.dispose();
	});

	test('primary shell tool only forces bracketed paste for single-line commands on macOS', async () => {
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo first', timeout: 1 },
		};
		const result = await bashTool.handler!({ command: 'echo first', timeout: 1 }, invocation) as ToolResultObject;

		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, platform.isMacintosh);
		assert.strictEqual(terminalManager.sentTexts[1].options.bracketedPasteMode, undefined);
	});

	test('detects multiline commands like the workbench terminal tool', () => {
		assert.strictEqual(isMultilineCommand('echo first\necho second'), true);
		assert.strictEqual(isMultilineCommand('echo first\r\necho second'), true);
		assert.strictEqual(isMultilineCommand('echo first\\\necho second'), false);
	});

	test('write shell tool normalizes input without appending enter', async () => {
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const shellRef = await shellManager.getOrCreateShell('bash', 'turn-1', 'tool-1');
		terminalManager.existingTerminalUris.add(shellRef.object.terminalUri);
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const writeTool = tools.find(tool => tool.name === 'write_bash');
		assert.ok(writeTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-2',
			toolName: 'write_bash',
			arguments: { command: 'answer\n' },
		};
		const result = await writeTool.handler!({ command: 'answer\n' }, invocation) as ToolResultObject;

		assert.strictEqual(result.resultType, 'success');
		assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, undefined);
		assert.strictEqual(terminalManager.writes[0].uri, shellRef.object.terminalUri);
		assert.strictEqual(terminalManager.writes[0].data, 'answer\r');
		shellRef.dispose();
	});

	test('getOrCreateSandboxEngine returns the same engine across calls', async () => {
		const { instantiationService } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));

		const engineA = shellManager.getOrCreateSandboxEngine();
		const engineB = shellManager.getOrCreateSandboxEngine();

		assert.strictEqual(engineA, engineB, 'Sandbox engine should be cached across calls');
	});

	test('primary shell tool schema only exposes requestUnsandboxedExecution params when the sandbox is enabled', async () => {
		const enabled = createServices({ sandboxEnabled: true });
		const enabledShell = disposables.add(enabled.instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-enabled'), undefined));
		const enabledTools = await createShellTools(enabledShell, enabled.terminalManager, new NullLogService());
		const enabledPrimary = enabledTools[0] as Tool<unknown>;
		const enabledSchema = enabledPrimary.parameters as { properties: Record<string, unknown> };
		const enabledPropertyNames = Object.keys(enabledSchema.properties);

		assert.ok(enabledPropertyNames.includes('requestUnsandboxedExecution'), 'Sandbox-enabled schema should expose requestUnsandboxedExecution');
		assert.ok(enabledPropertyNames.includes('requestUnsandboxedExecutionReason'), 'Sandbox-enabled schema should expose requestUnsandboxedExecutionReason');

		const disabled = createServices();
		const disabledShell = disposables.add(disabled.instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-disabled'), undefined));
		const disabledTools = await createShellTools(disabledShell, disabled.terminalManager, new NullLogService());
		const disabledPrimary = disabledTools[0] as Tool<unknown>;
		const disabledSchema = disabledPrimary.parameters as { properties: Record<string, unknown> };
		const disabledPropertyNames = Object.keys(disabledSchema.properties);

		assert.ok(!disabledPropertyNames.includes('requestUnsandboxedExecution'), 'Sandbox-disabled schema should not expose requestUnsandboxedExecution');
		assert.ok(!disabledPropertyNames.includes('requestUnsandboxedExecutionReason'), 'Sandbox-disabled schema should not expose requestUnsandboxedExecutionReason');
	});

	test('primary shell tool sends commands unwrapped when the sandbox is disabled', async () => {
		const { instantiationService, terminalManager } = createServices();
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo hello', timeout: 1 },
		};
		await bashTool.handler!({ command: 'echo hello', timeout: 1 }, invocation);

		const sentCommand = terminalManager.sentTexts[0]?.data ?? '';
		assert.ok(sentCommand.includes('echo hello'), `Expected the raw command to be sent. Sent: ${sentCommand}`);
		assert.ok(!sentCommand.includes('sandbox-runtime'), `Sandbox wrapper should not be applied when sandbox is disabled. Sent: ${sentCommand}`);
	});

	test('primary shell tool wraps commands through the sandbox engine when the sandbox is enabled', async function () {
		const { instantiationService, terminalManager } = createServices({ sandboxEnabled: true });
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo hello', timeout: 1 },
		};
		await bashTool.handler!({ command: 'echo hello', timeout: 1 }, invocation);

		const sentCommand = terminalManager.sentTexts[0]?.data ?? '';
		// POSIX wraps via `sandbox-runtime` and embeds the user command;
		// Windows wraps via the MXC executable and carries the user command
		// in the JSON config file referenced by the wrapper.
		if (platform.isWindows) {
			assert.ok(sentCommand.includes('wxc-exec'), `Expected the command to be wrapped by the MXC runtime. Sent: ${sentCommand}`);
		} else {
			assert.ok(sentCommand.includes('sandbox-runtime'), `Expected the command to be wrapped by the sandbox runtime. Sent: ${sentCommand}`);
			assert.ok(sentCommand.includes('echo hello'), `Wrapped command should still contain the user command. Sent: ${sentCommand}`);
		}
	});

	test('primary shell tool writes a sandbox config exposing the working directory as writable', async () => {
		// Cross-platform smoke test: enabling the sandbox should result in a sandbox config file
		// being written, and the session's working directory should be a writable path in that
		// config. The JSON shape differs between POSIX (`filesystem.allowWrite`) and the Windows
		// MXC runtime (`filesystem.readwritePaths`).
		const createdFiles = new Map<string, string>();
		const workingDirectory = URI.file('/workspace/test-workspace');
		const { instantiationService, terminalManager } = createServices({ sandboxEnabled: true, createdFiles });
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), workingDirectory));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo hello', timeout: 1 },
		};
		await bashTool.handler!({ command: 'echo hello', timeout: 1 }, invocation);

		const sandboxConfigEntry = [...createdFiles.entries()].find(([path]) => /vscode-sandbox-settings-.*\.json$/.test(path));
		assert.ok(sandboxConfigEntry, `Expected a sandbox config file to be written. Files: ${[...createdFiles.keys()].join(', ')}`);
		const config = JSON.parse(sandboxConfigEntry[1]);
		const writablePaths: string[] = platform.isWindows ? config.filesystem.readwritePaths : config.filesystem.allowWrite;
		assert.ok(Array.isArray(writablePaths), `Expected writable paths array. Got: ${JSON.stringify(config.filesystem)}`);
		const expectedPath = platform.isWindows ? '\\workspace\\test-workspace' : '/workspace/test-workspace';
		assert.ok(writablePaths.includes(expectedPath), `Expected working directory in writable paths. Got: ${JSON.stringify(writablePaths)}`);
	});

	test('primary shell tool merges configured filesystem allowRead paths into the sandbox config', async () => {
		// Cross-platform: pick the OS-specific filesystem setting key and verify the configured
		// allowRead path lands in the rendered sandbox config (POSIX `filesystem.allowRead` /
		// Windows MXC `filesystem.readonlyPaths`).
		const createdFiles = new Map<string, string>();
		const configuredReadPath = platform.isWindows ? 'C:\\tools\\custom' : '/tools/custom';
		const fileSystemKey = platform.isWindows
			? AgentHostSandboxKey.WindowsFileSystem
			: platform.isMacintosh ? AgentHostSandboxKey.MacFileSystem : AgentHostSandboxKey.LinuxFileSystem;
		const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true, createdFiles });
		agentConfigurationService.setSandboxValue(fileSystemKey, { allowRead: [configuredReadPath] });
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), URI.file('/workspace/test-workspace')));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'echo hello', timeout: 1 },
		};
		await bashTool.handler!({ command: 'echo hello', timeout: 1 }, invocation);

		const sandboxConfigEntry = [...createdFiles.entries()].find(([path]) => /vscode-sandbox-settings-.*\.json$/.test(path));
		assert.ok(sandboxConfigEntry, `Expected a sandbox config file to be written. Files: ${[...createdFiles.keys()].join(', ')}`);
		const config = JSON.parse(sandboxConfigEntry[1]);
		const readablePaths: string[] = platform.isWindows ? config.filesystem.readonlyPaths : config.filesystem.allowRead;
		assert.ok(Array.isArray(readablePaths), `Expected readable paths array. Got: ${JSON.stringify(config.filesystem)}`);
		assert.ok(readablePaths.includes(configuredReadPath), `Expected configured read path in readable paths. Got: ${JSON.stringify(readablePaths)}`);
	});

	test('primary shell tool requests confirmation before rerunning outside the sandbox', async function () {
		// The Windows sandbox only exposes Off/AllowNetwork — there is no "enabled but network-blocked"
		// state, so `requiresUnsandboxConfirmation` is unreachable on Windows.
		if (platform.isWindows) {
			this.skip();
		}
		const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true });
		// `requiresUnsandboxConfirmation` only fires when unsandboxed commands are allowed AND a
		// blocked domain is detected — otherwise the engine keeps the command sandboxed.
		agentConfigurationService.setSandboxValue(AgentHostSandboxKey.AllowUnsandboxedCommands, true);
		terminalManager.commandDetectionSupported = true;
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const confirmationRequests: IUnsandboxedCommandConfirmationRequest[] = [];
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async request => {
			confirmationRequests.push(request);
			return true;
		});
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'curl https://example.com' },
		};
		const resultPromise = bashTool.handler!({ command: 'curl https://example.com' }, invocation);
		await terminalManager.commandFinishedListenerRegistered.p;
		terminalManager.fireCommandFinished({
			commandId: 'cmd-1',
			exitCode: 0,
			command: 'curl https://example.com',
			output: '',
		});
		const result = await resultPromise as ToolResultObject;

		assert.strictEqual(confirmationRequests.length, 1);
		assert.deepStrictEqual(confirmationRequests[0]?.blockedDomains, ['example.com']);
		assert.ok(terminalManager.sentTexts.length >= 1, 'Approved command should be sent to the terminal unsandboxed');
		assert.ok(terminalManager.sentTexts.every(entry => !entry.data.includes('sandbox-runtime')), 'No wrapped sandbox-runtime command should be sent after approval');
		assert.strictEqual(result.resultType, 'success');
	});

	test('primary shell tool returns sandbox_blocked when user declines unsandboxed rerun', async function () {
		// See above: the Windows sandbox never reports blocked domains, so this confirmation flow
		// is unreachable on Windows.
		if (platform.isWindows) {
			this.skip();
		}
		const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true });
		agentConfigurationService.setSandboxValue(AgentHostSandboxKey.AllowUnsandboxedCommands, true);
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async () => false);
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: { command: 'curl https://example.com' },
		};
		const result = await bashTool.handler!({ command: 'curl https://example.com' }, invocation) as ToolResultObject;

		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(result.error, 'sandbox_blocked');
		assert.match(result.textResultForLlm ?? '', /declined/i);
		assert.strictEqual(terminalManager.sentTexts.length, 0);
	});

	test('primary shell tool asks for confirmation when requestUnsandboxedExecution is explicitly set', async function () {
		const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true });
		agentConfigurationService.setSandboxValue(AgentHostSandboxKey.AllowUnsandboxedCommands, true);
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const confirmationRequests: IUnsandboxedCommandConfirmationRequest[] = [];
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async request => {
			confirmationRequests.push(request);
			return false;
		});
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: {
				command: 'echo hello',
				requestUnsandboxedExecution: true,
				requestUnsandboxedExecutionReason: 'sandbox blocked required syscall',
			},
		};
		const result = await bashTool.handler!({
			command: 'echo hello',
			requestUnsandboxedExecution: true,
			requestUnsandboxedExecutionReason: 'sandbox blocked required syscall',
		}, invocation) as ToolResultObject;

		assert.strictEqual(confirmationRequests.length, 1);
		assert.strictEqual(confirmationRequests[0]?.reason, 'sandbox blocked required syscall');
		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(result.error, 'sandbox_blocked');
		assert.match(result.textResultForLlm ?? '', /declined/i);
		assert.strictEqual(terminalManager.sentTexts.length, 0);
	});

	test('primary shell tool returns unsandboxed_disabled when allowUnsandboxedCommands is off', async function () {
		const { instantiationService, terminalManager } = createServices({ sandboxEnabled: true });
		// `chat.agent.sandbox.allowUnsandboxedCommands` is intentionally not set,
		// so the engine would silently re-sandbox the command. The shell tool
		// must surface a dedicated failure instead.
		const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse('copilot:/session-1'), undefined));
		const confirmationRequests: IUnsandboxedCommandConfirmationRequest[] = [];
		const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async request => {
			confirmationRequests.push(request);
			return true;
		});
		const bashTool = tools.find(tool => tool.name === 'bash');
		assert.ok(bashTool);

		const invocation: ToolInvocation = {
			sessionId: 'session-1',
			toolCallId: 'tool-1',
			toolName: 'bash',
			arguments: {
				command: 'echo hello',
				requestUnsandboxedExecution: true,
				requestUnsandboxedExecutionReason: 'sandbox blocked required syscall',
			},
		};
		const result = await bashTool.handler!({
			command: 'echo hello',
			requestUnsandboxedExecution: true,
			requestUnsandboxedExecutionReason: 'sandbox blocked required syscall',
		}, invocation) as ToolResultObject;

		assert.strictEqual(result.resultType, 'failure');
		assert.strictEqual(result.error, 'unsandboxed_disabled');
		assert.match(result.textResultForLlm ?? '', /allowUnsandboxedCommands/);
		assert.strictEqual(confirmationRequests.length, 0, 'No confirmation should have been requested');
		assert.strictEqual(terminalManager.sentTexts.length, 0, 'Disallowed command should not be sent to the terminal');
	});

});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { constObservable, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { INativeCliProxyService } from '../../../../../../platform/agentHost/common/nativeCliProxy.js';
import { MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED } from '../../../../../../platform/policy/common/managedSettingsFreshness.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileContent, IFileService, IFileStatWithMetadata, IReadFileOptions } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IShellLaunchConfig, ITerminalBackend, ITerminalLaunchError, TerminalExitReason, TitleEventSource } from '../../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IGitService } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { ICreateTerminalOptions, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IConfigurationResolverService } from '../../../../../../workbench/services/configurationResolver/common/configurationResolver.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/electron-browser/environmentService.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISessionTerminalService, SessionTerminalService } from '../../../../../services/terminal/browser/sessionTerminalService.js';
import { NATIVE_CLI_STORAGE_KEY, readNativeCliTerminalData } from '../../common/nativeCli.js';
import { NativeCliSessionsProvider } from '../../electron-browser/nativeCliSessionsProvider.js';
import { NativeCliSession } from '../../electron-browser/nativeCliSession.js';
import { INativeCliLifecycleEvent, INativeCliLifecycleService } from '../../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';

type TerminalXterm = NonNullable<Awaited<ITerminalInstance['xtermReadyPromise']>>;
type TerminalBuffer = TerminalXterm['raw']['buffer']['active'];

class TestTerminal extends mock<ITerminalInstance>() {
	override readonly store = new DisposableStore();
	override readonly instanceId = 1;
	override readonly processReady = Promise.resolve();
	private _bufferText = '';
	private readonly _writeParsed = this.store.add(new Emitter<void>());
	readonly progress = this.store.add(new Emitter<TerminalXterm['progressState']>());
	override readonly xtermReadyPromise = Promise.resolve(upcastPartial<TerminalXterm>({
		raw: upcastPartial<TerminalXterm['raw']>({
			onWriteParsed: this._writeParsed.event,
			buffer: upcastPartial<TerminalXterm['raw']['buffer']>({
				active: upcastPartial<TerminalBuffer>({
					type: 'alternate', baseY: 0, length: 1,
					getLine: () => upcastPartial<NonNullable<ReturnType<TerminalBuffer['getLine']>>>({ translateToString: () => this._bufferText }),
				}),
			}),
		}),
		onDidChangeProgress: this.progress.event,
		progressState: { state: 0, value: 0 },
	}));
	override isDisposed = false;
	override hasFocus = false;
	override exitReason: TerminalExitReason | undefined;
	override title = 'CLI';
	override titleSource: TitleEventSource = TitleEventSource.Process;
	readonly titleChanged = this.store.add(new Emitter<ITerminalInstance>());
	override readonly onTitleChanged = this.titleChanged.event;
	readonly lines = this.store.add(new Emitter<string>());
	override readonly onLineData = this.lines.event;
	readonly input = this.store.add(new Emitter<string>());
	override readonly onDidInputData = this.input.event;
	readonly exited = this.store.add(new Emitter<number | ITerminalLaunchError | undefined>());
	override readonly onExit = this.exited.event;
	readonly disposed = this.store.add(new Emitter<ITerminalInstance>());
	override readonly onDisposed = this.disposed.event;
	override get reconnectionProperties() { return this.shellLaunchConfig.reconnectionProperties; }
	readonly sent: string[] = [];

	constructor(override readonly shellLaunchConfig: IShellLaunchConfig, initialOutput = 'CLI ready') {
		super();
		this._bufferText = initialOutput;
	}

	override async sendText(text: string): Promise<void> { this.sent.push(text); }

	writeOutput(text: string): void {
		this._bufferText = text;
		this._writeParsed.fire();
	}

	/**
	 * Matches `TerminalInstance` under `waitOnExit`: the process exit fires `onExit` but
	 * leaves the instance alive, so `exitReason` stays undefined.
	 */
	finish(code: number): void {
		this.exited.fire(code);
	}

	override dispose(): void {
		if (!this.isDisposed) {
			this.isDisposed = true;
			this.exitReason = TerminalExitReason.User;
			this.disposed.fire(this);
			// `TerminalInstance` flushes xterm data before firing `onExit`, so consumers
			// that clear their listeners during `dispose()` never observe this.
			queueMicrotask(() => this.exited.fire(undefined));
			this.store.dispose();
		}
	}
}

suite('Native CLI sessions provider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file(isWindows ? 'C:\\repository' : '/repository');
	const executable = isWindows ? 'C:\\tools\\agent.exe' : '/tools/agent';

	function createHarness(gate?: DeferredPromise<void>, gitGate?: DeferredPromise<void>, initialOutput = 'CLI ready', copilotMetadata = false) {
		const instantiation = store.add(new TestInstantiationService());
		const storage = store.add(new InMemoryStorageService());
		const registry = new SessionTerminalService();
		const terminals: TestTerminal[] = [];
		const configurations: IShellLaunchConfig[] = [];
		const creating = new DeferredPromise<void>();
		const environmentRequested = new DeferredPromise<void>();
		const repositoryInitialization = { gate: gitGate };
		const availability = { trusted: true, hidden: false, exists: true, gitOpens: 0, account: true, signIns: 0, managed: false, proxyAlive: true, launchGate: undefined as DeferredPromise<void> | undefined };
		const proxyCalls: string[] = [];
		const lifecycleFiles = new Map<string, string>();
		const opened: string[] = [];
		const focusRequests: boolean[] = [];
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const hostExit = store.add(new Emitter<number>());
		const proxy: INativeCliProxyService = new class extends mock<INativeCliProxyService>() {
			override async getNativeCliModels() { return [{ id: 'copilot-model', name: 'Copilot Model' }]; }
			override async startNativeCliProxy(sessionId: string) {
				proxyCalls.push(`start:${sessionId}`);
				return { leaseId: sessionId, baseUrl: 'http://127.0.0.1:12345', token: 'local-proxy-capability', model: 'copilot-model', settingsFile: '/private/cli-settings.json' };
			}
			override async retainNativeCliProxy(sessionId: string) {
				proxyCalls.push(`retain:${sessionId}`);
				return availability.proxyAlive;
			}
			override async releaseNativeCliProxy(sessionId: string) { proxyCalls.push(`release:${sessionId}`); }
		}();
		const configuration = new TestConfigurationService({
			sessions: { terminal: { copilotExecutable: executable, claudeExecutable: executable, codexExecutable: executable } },
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IConfigurationResolverService, new class extends mock<IConfigurationResolverService>() {
			override async resolveWithEnvironment(...args: Parameters<IConfigurationResolverService['resolveWithEnvironment']>): Promise<string> { return args[2]; }
		}());
		instantiation.stub(IStorageService, storage);
		instantiation.stub(ISessionTerminalService, registry);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override readonly onAgentHostExit = hostExit.event;
			override readonly authenticationPending = constObservable(false);
			override readonly nativeCliProxy = proxy;
			override readonly nativeCliLifecycle = new class extends mock<INativeCliLifecycleService>() {
				override async releaseNativeCliLifecycle(): Promise<void> { }
				override async createNativeCliLifecycle() {
					const id = generateUuid();
					const directory = folder.with({ path: `/vscode-cli-lifecycle-${id}-test` }).fsPath;
					const eventsFile = URI.file(directory).with({ path: `${URI.file(directory).path}/events.jsonl` }).fsPath;
					lifecycleFiles.set(eventsFile, '');
					const logsDirectory = copilotMetadata ? joinPath(URI.file(directory), 'logs').fsPath : undefined;
					return { id, directory, eventsFile, logsDirectory, args: [] };
				}
			}();
			override startAgentHost(): void { }
		}());
		instantiation.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = Event.None;
			override readonly onDidChangePolicyData = Event.None;
			override readonly onDidChangeManagedSettingsFreshness = Event.None;
			override readonly managedSettingsFreshness = MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED;
			override async getDefaultAccount() { return availability.account ? upcastPartial<IDefaultAccount>({ sessionId: 'account' }) : null; }
			override async signIn() { availability.signIns++; return this.getDefaultAccount(); }
			override get policyData() { return { managedSettingsActive: availability.managed }; }
		}());
		const telemetry: { event: string; data: Record<string, unknown> }[] = [];
		instantiation.stub(ITelemetryService, new class extends mock<ITelemetryService>() {
			override publicLog2(event: string, data?: Record<string, unknown>): void { telemetry.push({ event, data: data ?? {} }); }
		}());
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(): void { }
			override warn(): void { }
		}());
		instantiation.stub(IFileService, new class extends mock<IFileService>() {
			override async exists(): Promise<boolean> { return availability.exists; }
			override createWatcher() { return { onDidChange: Event.None, dispose: () => { } }; }
			override async readFile(uri: URI, options?: IReadFileOptions): Promise<IFileContent> {
				const data = VSBuffer.fromString(lifecycleFiles.get(uri.fsPath) ?? '');
				return upcastPartial<IFileContent>({ value: data.slice(options?.position ?? 0, (options?.position ?? 0) + (options?.length ?? data.byteLength)) });
			}
			override async resolve(resource: URI): Promise<IFileStatWithMetadata> {
				return upcastPartial<IFileStatWithMetadata>({
					resource, isDirectory: true,
					children: [...lifecycleFiles.keys()].map(path => URI.file(path)).filter(file => isEqual(dirname(file), resource))
						.map(file => upcastPartial<IFileStatWithMetadata>({ resource: file, name: basename(file), isFile: true })),
				});
			}
			override async del(): Promise<void> { }
		}());
		instantiation.stub(IGitService, new class extends mock<IGitService>() {
			override readonly onDidOpenRepository = Event.None;
			override async openRepository() {
				availability.gitOpens++;
				await repositoryInitialization.gate?.p;
				return undefined;
			}
		}());
		instantiation.stub(INativeWorkbenchEnvironmentService, {
			userHome: URI.file(isWindows ? 'C:\\home' : '/home'),
			execPath: executable,
			os: { arch: 'arm64', release: '', hostname: '' },
		});
		instantiation.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: availability.trusted }; }
		}());
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override get sentiment() { return { hidden: availability.hidden }; }
			override readonly onDidChangeSentiment = Event.None;
		}());
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override async openSession(...args: Parameters<ISessionsService['openSession']>): Promise<void> {
				opened.push(args[0].toString());
				focusRequests.push(!args[1]?.preserveFocus);
			}
		}());
		instantiation.stub(ITerminalInstanceService, new class extends mock<ITerminalInstanceService>() {
			override async getBackend(): Promise<ITerminalBackend> {
				void environmentRequested.complete();
				return upcastPartial<ITerminalBackend>({ getShellEnvironment: async () => ({}), getEnvironment: async () => ({}) });
			}
		}());
		instantiation.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override readonly whenConnected = Promise.resolve();
			override get instances() { return terminals; }
			override registerEmbeddedTerminal() { return toDisposable(() => { }); }
			override async createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
				const config = options?.config;
				if (!config || !hasKey(config, { executable: true })) {
					throw new Error('Expected a native executable launch');
				}
				configurations.push(config);
				void creating.complete();
				await gate?.p;
				await availability.launchGate?.p;
				const terminal = store.add(new TestTerminal(config, initialOutput));
				terminals.push(terminal);
				return terminal;
			}
		}());
		const createProvider = () => store.add(instantiation.createInstance(NativeCliSessionsProvider));
		const emitLifecycle = async (session: ISession, event: INativeCliLifecycleEvent) => {
			assert.ok(session instanceof NativeCliSession);
			const data = readNativeCliTerminalData(session.instance.get()?.reconnectionProperties?.data);
			assert.ok(data?.lifecycle);
			const file = data.lifecycle.eventsFile;
			lifecycleFiles.set(file, `${lifecycleFiles.get(file)}${JSON.stringify(event)}\n`);
			await session.runtime?.readLifecycle();
		};
		const emitCopilotForeground = async (session: ISession, foregroundId?: string, name = 'Native task') => {
			assert.ok(session instanceof NativeCliSession);
			const data = readNativeCliTerminalData(session.instance.get()?.reconnectionProperties?.data);
			assert.ok(data?.lifecycle?.logsDirectory && data.metadataHome);
			const id = foregroundId ?? session.nativeSessionId.get() ?? session.id;
			const file = joinPath(URI.file(data.lifecycle.logsDirectory), 'process-1-1.log').fsPath;
			lifecycleFiles.set(file, `${lifecycleFiles.get(file) ?? ''}${new Date().toISOString()} [INFO] Registering foreground session: ${id}\n`);
			lifecycleFiles.set(joinPath(URI.file(data.metadataHome), 'session-state', id, 'workspace.yaml').fsPath, `id: ${id}\ncwd: ${folder.fsPath}\nname: ${name}\n`);
			await session.runtime?.readLifecycle();
		};
		return { provider: createProvider(), createProvider, storage, registry, terminals, configurations, configuration, telemetry, availability, creating, environmentRequested, repositoryInitialization, proxyCalls, hostExit, emitLifecycle, emitCopilotForeground, lifecycleFiles, opened, activeSession, focusRequests };
	}

	test('new CLI drafts default to Copilot without launching, signing in or billing on picker changes', () => {
		const { provider, registry, configurations, availability, proxyCalls } = createHarness();
		const defaults: ('native' | 'copilot')[] = [];
		for (const type of ['terminal-claude', 'terminal-codex']) {
			const session = provider.createNewSession(folder, type);
			const authentication = registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!;
			defaults.push(authentication.source.get());
			authentication.setSource('native');
			authentication.setSource('copilot');
			authentication.setModel({ id: 'model', name: 'Model' });
		}
		assert.deepStrictEqual({
			defaults, launches: configurations.length, signIns: availability.signIns,
			proxyCalls, published: provider.getSessions().length,
		}, { defaults: ['copilot', 'copilot'], launches: 0, signIns: 0, proxyCalls: [], published: 0 });
	});

	test('explicit native routing overrides the Copilot default without persisting credentials', async () => {
		const { provider, configurations, registry, storage, proxyCalls, emitLifecycle } = createHarness();
		const native = provider.createNewSession(folder, 'terminal-claude');
		registry.getSessionTerminal(native.sessionId)!.ensureAuthentication!()!.setSource('native');
		await provider.sendRequest(native.sessionId, native.resource, { query: '' });
		const proxied = provider.createNewSession(folder, 'terminal-codex');
		const authentication = registry.getSessionTerminal(proxied.sessionId)?.ensureAuthentication?.();
		assert.ok(authentication);
		authentication.setSource('copilot');
		authentication.setModel({ id: 'copilot-model', name: 'Copilot Model' });
		await provider.sendRequest(proxied.sessionId, proxied.resource, { query: '' });
		const stored = storage.get(NATIVE_CLI_STORAGE_KEY, StorageScope.PROFILE)!;
		assert.deepStrictEqual({
			nativeEnvironment: configurations[0].env,
			proxyEnvironment: configurations[1].env,
			proxyProvider: configurations[1].args?.includes('model_provider="vscode-copilot"'),
			starts: proxyCalls.filter(call => call.startsWith('start:')).length,
			persistedSource: JSON.parse(stored)[1].authentication,
			secretPersisted: stored.includes('local-proxy-capability') || stored.includes('127.0.0.1'),
		}, { nativeEnvironment: undefined, proxyEnvironment: { VSCODE_CLI_PROXY_TOKEN: 'local-proxy-capability' }, proxyProvider: true, starts: 1, persistedSource: 'copilot', secretPersisted: false });
		await emitLifecycle(proxied, { event: 'prompt', sessionId: generateUuid(), cwd: folder.fsPath, timestamp: Date.now(), title: 'Do work' });
		assert.throws(() => authentication.setSource('native'), /creating a new terminal session/);
	});

	test('no Copilot credentials or managed runtime controls never cause native-account fallback', async () => {
		const { provider, registry, availability, configurations } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-claude');
		const authentication = registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!;
		authentication.setSource('copilot');
		authentication.setModel({ id: 'copilot-model', name: 'Copilot Model' });
		availability.account = false;
		await assert.rejects(provider.sendRequest(session.sessionId, session.resource, { query: '' }), /Sign in/);
		availability.account = true;
		availability.managed = true;
		await assert.rejects(provider.sendRequest(session.sessionId, session.resource, { query: '' }), /managed settings/);
		assert.deepStrictEqual({ source: authentication.source.get(), launches: configurations.length, signIns: availability.signIns }, { source: 'copilot', launches: 0, signIns: 1 });
	});

	test('Claude and Codex can start through Copilot without a preselected model', async () => {
		const { provider, registry, configurations } = createHarness();
		for (const kind of ['terminal-claude', 'terminal-codex']) {
			const session = provider.createNewSession(folder, kind);
			await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		}
		assert.deepStrictEqual({
			launches: configurations.length,
			modelChoices: provider.getSessions().map(session => registry.getSessionTerminal(session.sessionId)?.ensureAuthentication?.()?.model.get()),
		}, { launches: 2, modelChoices: [undefined, undefined] });
	});

	test('the account choice is locked after launch even before the first native prompt', async () => {
		const { provider, registry, configurations, terminals } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-claude');
		const authentication = registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!;
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		assert.throws(() => authentication.setSource('native'), /creating a new terminal session/);
		assert.throws(() => authentication.setModel({ id: 'model', name: 'Model' }), /creating a new terminal session/);
		assert.deepStrictEqual({ source: authentication.source.get(), launches: configurations.length, alive: !terminals[0].isDisposed }, { source: 'copilot', launches: 1, alive: true });
	});

	test('saved native choices and legacy sessions keep their billing source on restore', async () => {
		const { provider, registry, storage, createProvider } = createHarness();
		const explicit = provider.createNewSession(folder, 'terminal-claude');
		registry.getSessionTerminal(explicit.sessionId)!.ensureAuthentication!()!.setSource('native');
		await provider.sendRequest(explicit.sessionId, explicit.resource, { query: '' });
		await provider.archiveSession(explicit.sessionId);
		provider.dispose();
		const stored = JSON.parse(storage.get(NATIVE_CLI_STORAGE_KEY, StorageScope.PROFILE)!) as { authentication?: 'native' | 'copilot'; id: string }[];
		const legacy = { ...stored[0], id: generateUuid(), authentication: undefined };
		storage.store(NATIVE_CLI_STORAGE_KEY, JSON.stringify([...stored, legacy]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const restored = createProvider().getSessions();
		assert.deepStrictEqual(restored.map(session => registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!.source.get()), ['native', 'native']);
	});

	test('losing the Copilot host stops only proxied terminals without contacting the stopped host', async () => {
		const { provider, registry, terminals, proxyCalls, hostExit } = createHarness();
		const native = provider.createNewSession(folder, 'terminal-claude');
		registry.getSessionTerminal(native.sessionId)!.ensureAuthentication!()!.setSource('native');
		await provider.sendRequest(native.sessionId, native.resource, { query: '' });
		const proxied = provider.createNewSession(folder, 'terminal-codex');
		const authentication = registry.getSessionTerminal(proxied.sessionId)!.ensureAuthentication!()!;
		authentication.setSource('copilot');
		authentication.setModel({ id: 'copilot-model', name: 'Copilot Model' });
		await provider.sendRequest(proxied.sessionId, proxied.resource, { query: '' });
		hostExit.fire(1);
		await Promise.resolve();
		assert.deepStrictEqual({
			nativeStopped: terminals[0].isDisposed,
			proxyStopped: terminals[1].isDisposed,
			error: proxied.status.get(),
			releases: proxyCalls.filter(call => call.startsWith('release:')).length,
		}, { nativeStopped: false, proxyStopped: true, error: SessionStatus.Error, releases: 0 });
	});

	test('restored Copilot sessions retain the original lease rather than launching another CLI', async () => {
		const { provider, createProvider, registry, terminals, configurations, proxyCalls } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-codex');
		const authentication = registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!;
		authentication.setSource('copilot');
		authentication.setModel({ id: 'copilot-model', name: 'Copilot Model' });
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		provider.dispose();
		const restored = createProvider().getSessions()[0];
		await waitForState(registry.getSessionTerminal(restored.sessionId)!.instance, instance => instance === terminals[0]);
		assert.deepStrictEqual({
			source: registry.getSessionTerminal(restored.sessionId)?.ensureAuthentication?.()?.source.get(),
			launches: configurations.length,
			starts: proxyCalls.filter(call => call.startsWith('start:')).length,
			retains: proxyCalls.filter(call => call.startsWith('retain:')).length,
		}, { source: 'copilot', launches: 1, starts: 1, retains: 1 });
	});

	test('a proxy acquired before a cancelled launch is released without leaving a terminal', async () => {
		const gate = new DeferredPromise<void>();
		const { provider, registry, creating, terminals, proxyCalls } = createHarness(gate);
		const session = provider.createNewSession(folder, 'terminal-codex');
		const authentication = registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!;
		authentication.setSource('copilot');
		authentication.setModel({ id: 'copilot-model', name: 'Copilot Model' });
		const pending = provider.sendRequest(session.sessionId, session.resource, { query: '' });
		await creating.p;
		provider.deleteNewSession(session.sessionId);
		await gate.complete();
		await assert.rejects(pending, /Canceled/);
		assert.deepStrictEqual({
			stopped: terminals[0].isDisposed,
			releases: proxyCalls.filter(call => call.startsWith('release:')).length,
			listed: provider.getSessions().length,
		}, { stopped: true, releases: 1, listed: 0 });
	});

	test('drafts remain unlisted and launch all three native-account CLIs only on explicit start', async () => {
		const { provider, configurations, terminals, registry } = createHarness();
		const drafts = ['terminal-copilot', 'terminal-claude', 'terminal-codex'].map(type => provider.createNewSession(folder, type));
		assert.deepStrictEqual({ sessions: provider.getSessions().length, launches: configurations.length }, { sessions: 0, launches: 0 });
		for (const draft of drafts) {
			registry.getSessionTerminal(draft.sessionId)?.ensureAuthentication?.()?.setSource('native');
			await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		}
		assert.deepStrictEqual({
			presentations: provider.getSessions().map(session => session.presentation),
			statuses: provider.getSessions().map(session => session.status.get()),
			launches: configurations.map(config => {
				assert.ok(Array.isArray(config.args));
				return {
					executable: config.executable, cwd: URI.isUri(config.cwd) ? config.cwd.toString() : config.cwd,
					hidden: config.hideFromUser, rawTui: config.ignoreShellIntegration, revival: config.reconnectionProperties?.canRevive,
					args: config.args.map(argument => /^[0-9a-f-]{36}$/.test(argument) ? '<id>' : argument),
				};
			}),
			count: terminals.length,
		}, {
			presentations: ['terminal', 'terminal', 'terminal'],
			statuses: [SessionStatus.Completed, SessionStatus.Completed, SessionStatus.Completed],
			launches: [
				{ executable, cwd: folder.toString(), hidden: true, rawTui: true, revival: false, args: ['--session-id', '<id>'] },
				{ executable, cwd: folder.toString(), hidden: true, rawTui: true, revival: false, args: ['--session-id', '<id>'] },
				{ executable, cwd: folder.toString(), hidden: true, rawTui: true, revival: false, args: [] },
			],
			count: 3,
		});
	});

	test('prepares the CLI concurrently with repository initialization without launching before the baseline is ready', async () => {
		const gitGate = new DeferredPromise<void>();
		const { provider, terminals, environmentRequested } = createHarness(undefined, gitGate);
		const session = provider.createNewSession(folder, 'terminal-copilot');
		const launch = provider.sendRequest(session.sessionId, session.resource, { query: '' });
		await environmentRequested.p;
		const beforeBaseline = terminals.length;
		await gitGate.complete();
		await launch;
		assert.deepStrictEqual({ beforeBaseline, afterBaseline: terminals.length }, { beforeBaseline: 0, afterBaseline: 1 });
	});

	test('a silent CLI stays an unpublished draft until its initial screen arrives', async () => {
		const { provider, registry, terminals } = createHarness(undefined, undefined, '');
		const session = provider.createNewSession(folder, 'terminal-copilot');
		const launch = provider.sendRequest(session.sessionId, session.resource, { query: '' });
		const state = registry.getSessionTerminal(session.sessionId)!;
		await waitForState(state.instance, instance => !!instance);
		const beforeOutput = {
			initializing: state.isInitializing?.get(), starting: state.isStarting.get(),
			published: provider.getSessions().length, status: session.status.get(),
		};
		terminals[0].writeOutput('   ');
		const afterEmptyLine = state.isInitializing?.get();
		terminals[0].writeOutput('Confirm folder trust');
		await launch;
		assert.deepStrictEqual({
			beforeOutput, afterEmptyLine,
			afterOutput: state.isInitializing?.get(),
			status: session.status.get(),
		}, {
			beforeOutput: { initializing: true, starting: true, published: 0, status: SessionStatus.Untitled },
			afterEmptyLine: true, afterOutput: false, status: SessionStatus.Completed,
		});
	});

	test('preparation waits for the CLI screen without publishing the draft or sending a prompt', async () => {
		const { provider, registry, terminals, configurations, emitLifecycle } = createHarness(undefined, undefined, '');
		const session = provider.createNewSession(folder, 'terminal-copilot');
		const preparation = provider.prepareNewSession(session.sessionId, CancellationToken.None);
		await waitForState(registry.getSessionTerminal(session.sessionId)!.instance, instance => !!instance);
		await emitLifecycle(session, { event: 'activity', activity: 'working', sessionId: session.resource.path.slice(1), cwd: folder.fsPath, timestamp: Date.now() });
		terminals[0].writeOutput('Sign in to continue');
		await preparation;
		const prepared = { published: provider.getSessions().length, status: session.status.get(), sent: [...terminals[0].sent] };
		const chat = await provider.createNewChat(session.sessionId);
		await provider.sendRequest(session.sessionId, chat.resource, { query: 'Hello' });
		assert.deepStrictEqual({
			prepared, launches: configurations.length,
			published: provider.getSessions().length, sent: terminals[0].sent,
		}, { prepared: { published: 0, status: SessionStatus.Untitled, sent: [] }, launches: 1, published: 1, sent: ['Hello'] });
	});

	test('cancelling native screen preparation stops the unpublished CLI', async () => {
		const { provider, registry, terminals } = createHarness(undefined, undefined, '');
		const session = provider.createNewSession(folder, 'terminal-copilot');
		const cancellation = store.add(new CancellationTokenSource());
		const preparation = provider.prepareNewSession(session.sessionId, cancellation.token);
		await waitForState(registry.getSessionTerminal(session.sessionId)!.instance, instance => !!instance);
		cancellation.cancel();
		await assert.rejects(preparation, /Canceled/);
		assert.deepStrictEqual({
			stopped: terminals[0].isDisposed, published: provider.getSessions().length,
			error: registry.getSessionTerminal(session.sessionId)!.error.get(),
		}, { stopped: true, published: 0, error: undefined });
	});

	test('exiting before the initial CLI screen fails instead of opening a stopped session', async () => {
		const { provider, registry, terminals } = createHarness(undefined, undefined, '');
		const session = provider.createNewSession(folder, 'terminal-copilot');
		const preparation = provider.prepareNewSession(session.sessionId, CancellationToken.None);
		await waitForState(registry.getSessionTerminal(session.sessionId)!.instance, instance => !!instance);
		terminals[0].finish(1);
		await assert.rejects(preparation, /before it was ready/);
		assert.deepStrictEqual({ stopped: terminals[0].isDisposed, published: provider.getSessions().length }, { stopped: true, published: 0 });
	});

	test('opening an already running CLI does not wait for repository changes to refresh', async () => {
		const { provider, repositoryInitialization, terminals } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		const pending = repositoryInitialization.gate = new DeferredPromise<void>();
		await provider.prepareSessionForOpen(session);
		const runningBeforeRefresh = !terminals[0].isDisposed;
		await pending.complete();
		assert.strictEqual(runningBeforeRefresh, true);
	});

	test('native lifecycle hooks report real working, input-required and idle states without exiting the CLI', async () => {
		const { provider, emitLifecycle, terminals } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		assert.ok(draft instanceof NativeCliSession);
		const statuses = [draft.status.get()];
		const event = { sessionId: draft.id, cwd: folder.fsPath, timestamp: Date.now() };
		await emitLifecycle(draft, { ...event, event: 'prompt', title: 'Fix the login flow' });
		statuses.push(draft.status.get());
		await emitLifecycle(draft, { ...event, timestamp: event.timestamp + 1, event: 'input' });
		statuses.push(draft.status.get());
		await emitLifecycle(draft, { ...event, timestamp: event.timestamp + 2, event: 'stop' });
		statuses.push(draft.status.get());
		assert.deepStrictEqual({ statuses, title: draft.title.get(), running: !terminals[0].isDisposed }, {
			statuses: [SessionStatus.Completed, SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Completed],
			title: 'Fix the login flow', running: true,
		});
	});

	test('Copilot foreground and progress signals do not show a hook-only tracking warning', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { provider, registry, terminals, emitCopilotForeground, lifecycleFiles } = createHarness(undefined, undefined, 'CLI ready', true);
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		terminals[0].input.fire('\r');
		await timeout(1000);
		await emitCopilotForeground(session);
		terminals[0].progress.fire({ state: 3, value: 0 });
		terminals[0].progress.fire({ state: 0, value: 0 });
		await timeout(30_001);
		const lifecycle = readNativeCliTerminalData(terminals[0].reconnectionProperties?.data)?.lifecycle;
		assert.deepStrictEqual({
			hookData: lifecycleFiles.get(lifecycle!.eventsFile),
			warning: registry.getSessionTerminal(session.sessionId)!.warning?.get(),
			status: session.status.get(),
		}, { hookData: '', warning: undefined, status: SessionStatus.Completed });
	}));

	test('missing tracking data does not diagnose authentication or workspace trust', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { provider, registry, terminals } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		terminals[0].input.fire('\r');
		await timeout(30_001);
		assert.strictEqual(
			registry.getSessionTerminal(session.sessionId)!.warning?.get(),
			'VS Code has not received native CLI session tracking data yet. The CLI can still run, but session details and activity may be out of date.',
		);
	}));

	test('missing conversation data is distinguished from working activity and clears on recovery', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { provider, registry, terminals, emitCopilotForeground } = createHarness(undefined, undefined, 'CLI ready', true);
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		const state = registry.getSessionTerminal(session.sessionId)!;
		terminals[0].input.fire('\r');
		terminals[0].progress.fire({ state: 3, value: 0 });
		await timeout(30_001);
		const missing = state.warning?.get();
		await emitCopilotForeground(session);
		assert.deepStrictEqual({
			missing, recovered: state.warning?.get(), alive: !terminals[0].isDisposed,
		}, {
			missing: 'CLI activity is available, but VS Code has not received conversation details. Titles and session switching may be out of date.',
			recovered: undefined, alive: true,
		});
	}));

	test('healthy progress or foreground metadata cannot hide an actual lifecycle read error', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { provider, registry, terminals, emitCopilotForeground, emitLifecycle, lifecycleFiles } = createHarness(undefined, undefined, 'CLI ready', true);
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		assert.ok(session instanceof NativeCliSession);
		await emitCopilotForeground(session);
		const lifecycle = readNativeCliTerminalData(terminals[0].reconnectionProperties?.data)!.lifecycle!;
		lifecycleFiles.set(lifecycle.eventsFile, 'invalid record\n');
		await assert.rejects(session.runtime!.readLifecycle(), /Invalid native CLI lifecycle record/);
		terminals[0].progress.fire({ state: 3, value: 0 });
		await emitCopilotForeground(session);
		const failed = registry.getSessionTerminal(session.sessionId)!.warning?.get();
		await emitLifecycle(session, { event: 'stop', sessionId: session.id, cwd: folder.fsPath, timestamp: Date.now() });
		assert.deepStrictEqual({
			failed, recovered: registry.getSessionTerminal(session.sessionId)!.warning?.get(),
		}, {
			failed: 'Some native CLI session updates could not be read. Session information may be out of date. See the window log for details.',
			recovered: undefined,
		});
	}));

	test('a stopped terminal cannot acquire a late tracking warning', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { provider, registry, terminals } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		terminals[0].input.fire('\r');
		terminals[0].finish(0);
		await timeout(30_001);
		assert.strictEqual(registry.getSessionTerminal(session.sessionId)!.warning?.get(), undefined);
	}));

	test('in-CLI resume activates a separate conversation while the original stays open in the same process', async () => {
		const { provider, emitLifecycle, terminals, opened, activeSession, configurations, registry } = createHarness();
		const initial = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(initial.sessionId, initial.resource, { query: '' });
		assert.ok(initial instanceof NativeCliSession);
		activeSession.set(upcastPartial<IActiveSession>({ sessionId: initial.sessionId }), undefined);
		const timestamp = Date.now();
		await emitLifecycle(initial, { event: 'prompt', sessionId: initial.id, cwd: folder.fsPath, title: 'Original task', timestamp });
		await emitLifecycle(initial, { event: 'stop', sessionId: initial.id, cwd: folder.fsPath, timestamp: timestamp + 1 });
		const nativeId = generateUuid();
		await emitLifecycle(initial, { event: 'start', sessionId: nativeId, cwd: folder.with({ path: '/other-repository' }).fsPath, timestamp: timestamp + 2 });
		const next = provider.getSessions().find(session => session.sessionId !== initial.sessionId);
		assert.ok(next instanceof NativeCliSession);
		activeSession.set(upcastPartial<IActiveSession>({ sessionId: next.sessionId }), undefined);
		await emitLifecycle(next, { event: 'prompt', sessionId: nativeId, cwd: next.folder.fsPath, title: 'Resumed task', timestamp: timestamp + 3 });
		const afterSwitch = {
			originalTitle: initial.title.get(),
			originalSharesTerminal: initial.instance.get() === terminals[0],
			originalShows: registry.getSessionTerminal(initial.sessionId)!.displaysOtherSession?.get(),
			nextHasTerminal: next.instance.get() === terminals[0],
			nextShows: registry.getSessionTerminal(next.sessionId)!.displaysOtherSession?.get(),
			folder: next.folder.path,
		};
		await initial.start();
		const startedWhileBackground = configurations.length;
		await emitLifecycle(next, { event: 'start', sessionId: initial.id, cwd: folder.fsPath, timestamp: timestamp + 4 });
		assert.deepStrictEqual({
			afterSwitch, opened, startedWhileBackground,
			sessions: provider.getSessions().map(session => session.title.get()),
			launches: configurations.length,
			alive: !terminals[0].isDisposed,
			returnedTerminal: initial.instance.get() === terminals[0],
			returnedShows: registry.getSessionTerminal(initial.sessionId)!.displaysOtherSession?.get(),
			nextShows: registry.getSessionTerminal(next.sessionId)!.displaysOtherSession?.get(),
		}, {
			afterSwitch: { originalTitle: 'Original task', originalSharesTerminal: true, originalShows: 'Resumed task', nextHasTerminal: true, nextShows: undefined, folder: '/other-repository' },
			opened: [next.resource.toString(), initial.resource.toString()],
			startedWhileBackground: 1,
			sessions: ['Original task', 'Resumed task'], launches: 1, alive: true, returnedTerminal: true,
			returnedShows: undefined, nextShows: 'Original task',
		});
	});

	test('a conversation the CLI closes in-process detaches and can be resumed on its own', async () => {
		const { provider, emitLifecycle, terminals, configurations } = createHarness();
		const initial = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(initial.sessionId, initial.resource, { query: '' });
		assert.ok(initial instanceof NativeCliSession);
		const timestamp = Date.now();
		const nativeId = generateUuid();
		await emitLifecycle(initial, { event: 'start', sessionId: nativeId, cwd: folder.fsPath, timestamp });
		const next = provider.getSessions().find(session => session.sessionId !== initial.sessionId);
		assert.ok(next instanceof NativeCliSession);
		await emitLifecycle(next, { event: 'end', sessionId: initial.id, cwd: folder.fsPath, timestamp: timestamp + 1 });
		const afterClose = { originalHasTerminal: !!initial.instance.get(), nextHasTerminal: next.instance.get() === terminals[0], alive: !terminals[0].isDisposed };
		await initial.start();
		assert.deepStrictEqual({
			afterClose, launches: configurations.length,
			resumedOwnConversation: configurations[1].args?.join(' ').includes(initial.id),
			separateTerminal: initial.instance.get() === terminals[1] && next.instance.get() === terminals[0],
		}, {
			afterClose: { originalHasTerminal: false, nextHasTerminal: true, alive: true },
			launches: 2, resumedOwnConversation: true, separateTerminal: true,
		});
	});

	test('a Copilot switch to a conversation whose own launch has not started keeps the live CLI and cancels the duplicate', async () => {
		const { provider, terminals, configurations, emitCopilotForeground, activeSession, opened, registry, availability } = createHarness(undefined, undefined, 'CLI ready', true);
		const original = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(original.sessionId, original.resource, { query: '' });
		assert.ok(original instanceof NativeCliSession);
		await emitCopilotForeground(original);
		const cold = provider.createNewSession(folder, 'terminal-copilot');
		assert.ok(cold instanceof NativeCliSession);
		await provider.sendRequest(cold.sessionId, cold.resource, { query: '' });
		terminals[1].finish(0);
		await waitForState(cold.isRunning, running => !running);
		activeSession.set(upcastPartial<IActiveSession>({ sessionId: original.sessionId }), undefined);
		// The user clicks the stopped row, which starts a resume, then opens the same conversation inside the live CLI.
		availability.launchGate = new DeferredPromise<void>();
		const resume = cold.start().catch(() => 'cancelled');
		while (configurations.length < 3) {
			await timeout(1);
		}
		await emitCopilotForeground(original, cold.id, 'Conduct Testing Session');
		availability.launchGate.complete();
		const resumeOutcome = await resume;
		assert.deepStrictEqual({
			liveAlive: !terminals[0].isDisposed,
			coldTerminal: cold.instance.get() === terminals[0],
			coldShows: registry.getSessionTerminal(cold.sessionId)!.displaysOtherSession?.get(),
			originalShows: registry.getSessionTerminal(original.sessionId)!.displaysOtherSession?.get(),
			opened,
			launches: configurations.length,
			duplicateDisposed: terminals[2]?.isDisposed ?? true,
			resumeOutcome,
		}, {
			liveAlive: true, coldTerminal: true, coldShows: undefined, originalShows: 'Conduct Testing Session',
			opened: [cold.resource.toString()], launches: 3, duplicateDisposed: true, resumeOutcome: 'cancelled',
		});
	});

	test('a Copilot switch to a conversation another live CLI runs neither kills a process nor moves the row', async () => {
		const { provider, terminals, emitCopilotForeground, registry, activeSession, opened } = createHarness(undefined, undefined, 'CLI ready', true);
		const first = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(first.sessionId, first.resource, { query: '' });
		const second = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(second.sessionId, second.resource, { query: '' });
		assert.ok(first instanceof NativeCliSession && second instanceof NativeCliSession);
		await emitCopilotForeground(first);
		await emitCopilotForeground(second);
		activeSession.set(upcastPartial<IActiveSession>({ sessionId: first.sessionId }), undefined);
		await emitCopilotForeground(first, second.id, 'Other task');
		assert.deepStrictEqual({
			alive: terminals.map(terminal => !terminal.isDisposed),
			firstTerminal: first.instance.get() === terminals[0],
			secondTerminal: second.instance.get() === terminals[1],
			warning: registry.getSessionTerminal(first.sessionId)!.warning?.get(),
			opened,
		}, {
			alive: [true, true], firstTerminal: true, secondTerminal: true,
			warning: 'The CLI opened “Other task”, which is already running in another terminal session.',
			opened: [],
		});
	});

	test('background conversations report their own activity and detach when the shared process exits', async () => {
		const { provider, emitLifecycle, terminals, configurations } = createHarness();
		const initial = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(initial.sessionId, initial.resource, { query: '' });
		assert.ok(initial instanceof NativeCliSession);
		const timestamp = Date.now();
		const nativeId = generateUuid();
		await emitLifecycle(initial, { event: 'start', sessionId: nativeId, cwd: folder.fsPath, timestamp });
		const next = provider.getSessions().find(session => session.sessionId !== initial.sessionId);
		assert.ok(next instanceof NativeCliSession);
		await emitLifecycle(next, { event: 'prompt', sessionId: initial.id, cwd: folder.fsPath, timestamp: timestamp + 1, title: 'Background work' });
		const backgroundWorking = initial.status.get();
		const foregroundIdle = next.status.get();
		await emitLifecycle(next, { event: 'stop', sessionId: initial.id, cwd: folder.fsPath, timestamp: timestamp + 2 });
		const backgroundDone = initial.status.get();
		terminals[0].finish(0);
		await waitForState(initial.instance, instance => !instance);
		await initial.start();
		assert.deepStrictEqual({
			backgroundWorking, foregroundIdle, backgroundDone,
			nextStillAttached: next.instance.get() === terminals[0],
			resumedOwnConversation: configurations[1].args?.join(' ').includes(initial.id),
		}, {
			backgroundWorking: SessionStatus.InProgress, foregroundIdle: SessionStatus.Completed, backgroundDone: SessionStatus.Completed,
			nextStillAttached: true, resumedOwnConversation: true,
		});
	});

	test('background conversation switches do not steal the active session', async () => {
		const { provider, emitLifecycle, opened } = createHarness();
		const initial = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(initial.sessionId, initial.resource, { query: '' });
		await emitLifecycle(initial, { event: 'start', sessionId: generateUuid(), cwd: folder.fsPath, timestamp: Date.now() });
		assert.deepStrictEqual({ count: provider.getSessions().length, opened }, { count: 2, opened: [] });
	});

	test('switching the foreground native conversation restores terminal keyboard focus', async () => {
		const { provider, emitLifecycle, terminals, activeSession, focusRequests } = createHarness();
		const original = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(original.sessionId, original.resource, { query: '' });
		terminals[0].hasFocus = true;
		activeSession.set(upcastPartial<IActiveSession>({ sessionId: original.sessionId }), undefined);
		await emitLifecycle(original, { event: 'start', sessionId: generateUuid(), cwd: folder.fsPath, timestamp: Date.now() });
		assert.deepStrictEqual(focusRequests, [true]);
	});

	test('an unopened Codex conversation restarts without attempting to resume a nonexistent rollout', async () => {
		const { provider, emitLifecycle, terminals, configurations, registry } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-codex');
		registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!.setSource('native');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		const first = generateUuid();
		const second = generateUuid();
		await emitLifecycle(session, { event: 'start', source: 'startup', sessionId: first, cwd: folder.fsPath, timestamp: Date.now() });
		terminals[0].finish(0);
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		await emitLifecycle(session, { event: 'start', source: 'startup', sessionId: second, cwd: folder.fsPath, timestamp: Date.now() });
		assert.deepStrictEqual({
			args: configurations[1].args, sessions: provider.getSessions().length, aliases: session.resourceAliases?.get().map(uri => uri.toString()),
		}, { args: [], sessions: 1, aliases: [`agent-host-codex:/${second}`] });
	});

	test('native protocol activity and errors are not overwritten with idle and Escape is not guessed to stop work', async () => {
		const { provider, emitLifecycle, terminals } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-codex');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		const id = generateUuid();
		const timestamp = Date.now();
		await emitLifecycle(session, { event: 'start', sessionId: id, cwd: folder.fsPath, timestamp });
		const statuses: SessionStatus[] = [];
		for (const [index, activity] of (['working', 'input', 'working', 'error', 'idle'] as const).entries()) {
			await emitLifecycle(session, { event: 'activity', activity, sessionId: id, cwd: folder.fsPath, timestamp: timestamp + index + 1 });
			terminals[0].input.fire('\x1b');
			statuses.push(session.status.get());
		}
		assert.deepStrictEqual(statuses, [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.InProgress, SessionStatus.Error, SessionStatus.Completed]);
	});

	test('a late stop from the previous conversation cannot stop the selected conversation', async () => {
		const { provider, emitLifecycle } = createHarness();
		const original = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(original.sessionId, original.resource, { query: '' });
		assert.ok(original instanceof NativeCliSession);
		const id = generateUuid();
		const timestamp = Date.now();
		await emitLifecycle(original, { event: 'start', sessionId: id, cwd: folder.fsPath, timestamp });
		const current = provider.getSessions().find(session => session !== original)!;
		await emitLifecycle(current, { event: 'prompt', sessionId: id, cwd: folder.fsPath, timestamp: timestamp + 1 });
		await emitLifecycle(current, { event: 'stop', sessionId: original.id, cwd: folder.fsPath, timestamp: timestamp + 2 });
		assert.deepStrictEqual({ count: provider.getSessions().length, status: current.status.get() }, { count: 2, status: SessionStatus.InProgress });
	});

	test('unconfirmed resume directories cannot attach an unrelated repository to a new Claude conversation', async () => {
		const { provider, emitLifecycle } = createHarness();
		const original = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(original.sessionId, original.resource, { query: '' });
		const id = generateUuid();
		const timestamp = Date.now();
		await emitLifecycle(original, { event: 'start', sessionId: id, cwd: folder.fsPath, cwdConfirmed: false, timestamp });
		const countBeforeConfirmation = provider.getSessions().length;
		await emitLifecycle(original, { event: 'start', sessionId: id, cwd: folder.with({ path: '/correct-repository' }).fsPath, cwdConfirmed: true, timestamp: timestamp + 1 });
		assert.deepStrictEqual({ countBeforeConfirmation, folders: provider.getSessions().map(session => session.workspace.get()?.uri.path) }, {
			countBeforeConfirmation: 1, folders: [folder.path, '/correct-repository'],
		});
	});

	test('deleting the previous row does not terminate the runtime now owned by the selected conversation', async () => {
		const { provider, emitLifecycle, terminals } = createHarness();
		const original = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(original.sessionId, original.resource, { query: '' });
		await emitLifecycle(original, { event: 'start', sessionId: generateUuid(), cwd: folder.fsPath, timestamp: Date.now() });
		await provider.deleteSession(original.sessionId);
		assert.deepStrictEqual({ count: provider.getSessions().length, disposed: terminals[0].isDisposed }, { count: 1, disposed: false });
	});

	test('runtime ownership survives reload after an in-CLI conversation switch', async () => {
		const { provider, emitLifecycle, createProvider, registry, terminals, configurations } = createHarness();
		const initial = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(initial.sessionId, initial.resource, { query: '' });
		const nativeId = generateUuid();
		await emitLifecycle(initial, { event: 'start', sessionId: nativeId, cwd: folder.fsPath, timestamp: Date.now() });
		const next = provider.getSessions().find(session => session.sessionId !== initial.sessionId)!;
		provider.dispose();
		const restored = createProvider();
		await waitForState(registry.getSessionTerminal(next.sessionId)!.instance, instance => instance === terminals[0]);
		await waitForState(registry.getSessionTerminal(initial.sessionId)!.instance, instance => instance === terminals[0]);
		const restoredInitial = restored.getSessions().find(session => session.sessionId === initial.sessionId);
		const restoredNext = restored.getSessions().find(session => session.sessionId === next.sessionId);
		assert.ok(restoredInitial instanceof NativeCliSession && restoredNext instanceof NativeCliSession);
		assert.deepStrictEqual({
			count: restored.getSessions().length,
			sharedProcess: restoredInitial.runtime === restoredNext.runtime,
			foreground: restoredNext.isBackground === false && restoredInitial.isBackground === true,
			launches: configurations.length,
		}, { count: 2, sharedProcess: true, foreground: true, launches: 1 });
	});

	test('titles follow native terminal titles until renamed, and session metadata survives restoration', async () => {
		const { provider, createProvider, terminals, configurations, registry } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		const terminal = terminals[0];
		terminal.titleSource = TitleEventSource.Sequence;
		terminal.title = 'Fix the login flow';
		terminal.titleChanged.fire(terminal);
		await waitForState(draft.title, title => title === 'Fix the login flow');
		const autoTitle = draft.title.get();
		await provider.renameSession(draft.sessionId, 'My task');
		terminal.title = 'Working';
		terminal.titleChanged.fire(terminal);
		provider.dispose();
		const restoredProvider = createProvider();
		const restored = restoredProvider.getSessions()[0];
		await waitForState(registry.getSessionTerminal(restored.sessionId)!.instance, instance => instance === terminal);
		const reconnectedBeforeOpen = registry.getSessionTerminal(restored.sessionId)?.instance.get() === terminal;
		await restoredProvider.sendRequest(restored.sessionId, restored.resource, { query: '' });
		assert.deepStrictEqual({
			autoTitle,
			title: restored.title.get(),
			resource: restored.resource.toString(),
			folder: restored.workspace.get()?.uri.toString(),
			launches: configurations.length,
			disposed: terminal.isDisposed,
			reconnectedBeforeOpen,
		}, { autoTitle: 'Fix the login flow', title: 'My task', resource: draft.resource.toString(), folder: folder.toString(), launches: 1, disposed: false, reconnectedBeforeOpen: true });
	});

	test('Claude title activity clears cancelled work but does not clear a native permission wait', async () => {
		const { provider, terminals, emitLifecycle } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-claude');
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		const terminal = terminals[0];
		terminal.titleSource = TitleEventSource.Sequence;
		const setTitle = async (title: string) => {
			terminal.title = title;
			terminal.titleChanged.fire(terminal);
			await (draft as NativeCliSession).runtime!.readLifecycle();
			await Promise.resolve();
		};
		await setTitle('\u25d0 Claude Code');
		const working = draft.status.get();
		terminal.input.fire('\x1b');
		terminal.input.fire('\x03');
		const inputDoesNotGuess = draft.status.get();
		await setTitle('\u2733 Claude Code');
		const cancelled = draft.status.get();
		await setTitle('\u25d1 Native task');
		await emitLifecycle(draft, { event: 'input', sessionId: draft.resource.path.slice(1), cwd: folder.fsPath, timestamp: Date.now() });
		await setTitle('\u2733 Native task');

		assert.deepStrictEqual({
			working, inputDoesNotGuess, cancelled,
			waiting: draft.status.get(), title: draft.title.get(),
		}, {
			working: SessionStatus.InProgress,
			inputDoesNotGuess: SessionStatus.InProgress,
			cancelled: SessionStatus.Completed,
			waiting: SessionStatus.NeedsInput, title: 'Native task',
		});
	});

	test('restores cached sidebar counts without scanning every repository or launching a CLI', async () => {
		const { provider, storage, createProvider, configurations, availability } = createHarness();
		provider.dispose();
		storage.store(NATIVE_CLI_STORAGE_KEY, JSON.stringify([{
			id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
			kind: 'copilot', folder: folder.toString(), title: 'Saved terminal',
			createdAt: 1, updatedAt: 2, isArchived: false, isRead: true, hasStarted: true, titleIsUserDefined: false,
			baseRef: 'a'.repeat(40),
			changesSummary: { files: 2, additions: 8, deletions: 3 },
		}]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const restored = createProvider().getSessions()[0];
		await Promise.resolve();
		assert.deepStrictEqual({
			counts: restored.changesSummary?.get(),
			scans: availability.gitOpens,
			launches: configurations.length,
		}, { counts: { files: 2, additions: 8, deletions: 3 }, scans: 0, launches: 0 });
	});

	test('captures Codex resume identity and does not resume another latest session', async () => {
		const { provider, terminals, configurations, emitLifecycle, registry } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-codex');
		registry.getSessionTerminal(draft.sessionId)!.ensureAuthentication!()!.setSource('native');
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		const nativeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
		await emitLifecycle(draft, { event: 'start', sessionId: nativeId, cwd: folder.fsPath, timestamp: Date.now() });
		await emitLifecycle(draft, { event: 'prompt', sessionId: nativeId, cwd: folder.fsPath, timestamp: Date.now() });
		terminals[0].finish(0);
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		assert.deepStrictEqual({
			args: configurations[1].args,
			aliases: draft.resourceAliases?.get().map(uri => uri.toString()),
		}, { args: ['resume', nativeId], aliases: [`agent-host-codex:/${nativeId}`] });
	});

	test('archive and delete stop the terminal but preserve native CLI-owned history', async () => {
		const { provider, terminals, storage, registry } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		await provider.archiveSession(draft.sessionId);
		assert.deepStrictEqual({ archived: draft.isArchived.get(), disposed: terminals[0].isDisposed }, { archived: true, disposed: true });
		await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: '' }), /Restore this session/);
		await provider.deleteSession(draft.sessionId);
		assert.deepStrictEqual({ sessions: provider.getSessions(), registration: registry.getSessionTerminal(draft.sessionId), stored: storage.get(NATIVE_CLI_STORAGE_KEY, StorageScope.PROFILE) }, { sessions: [], registration: undefined, stored: '[]' });
	});

	test('trust, AI visibility and missing executables fail before a process is launched', async () => {
		const { provider, availability, configurations } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-copilot');
		availability.trusted = false;
		await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: '' }), /Trust this folder/);
		availability.trusted = true;
		availability.hidden = true;
		await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: '' }), /AI features are disabled/);
		availability.hidden = false;
		availability.exists = false;
		await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: '' }), /does not exist/);
		assert.deepStrictEqual({ launches: configurations.length, sessions: provider.getSessions().length }, { launches: 0, sessions: 0 });
	});

	test('revoked trust and disabled AI also prevent requests to an already-running CLI', async () => {
		const { provider, availability, terminals } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		availability.trusted = false;
		await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'Do not send' }), /Trust this folder/);
		availability.trusted = true;
		availability.hidden = true;
		await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'Do not send' }), /AI features are disabled/);
		assert.deepStrictEqual(terminals[0].sent, []);
	});

	test('restored archived sessions load repository details without starting a CLI', async () => {
		const { provider, createProvider, terminals, availability } = createHarness();
		const draft = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		await provider.archiveSession(draft.sessionId);
		provider.dispose();
		const restoredProvider = createProvider();
		const restored = restoredProvider.getSessions()[0];
		await restoredProvider.prepareSessionForOpen(restored);
		assert.deepStrictEqual({
			archived: restored.isArchived.get(),
			gitOpens: availability.gitOpens,
			terminals: terminals.length,
			disposed: terminals[0].isDisposed,
		}, { archived: true, gitOpens: 2, terminals: 1, disposed: true });
	});

	test('discarding a pending draft cannot publish or leak a late-created terminal', async () => {
		const gate = new DeferredPromise<void>();
		const { provider, terminals, registry, creating } = createHarness(gate);
		const draft = provider.createNewSession(folder, 'terminal-copilot');
		const request = provider.sendRequest(draft.sessionId, draft.resource, { query: '' });
		await creating.p;
		provider.deleteNewSession(draft.sessionId);
		await gate.complete();
		await assert.rejects(request, /Canceled/);
		assert.deepStrictEqual({
			sessions: provider.getSessions().length,
			disposed: terminals[0].isDisposed,
			registration: registry.getSessionTerminal(draft.sessionId),
		}, { sessions: 0, disposed: true, registration: undefined });
	});

	test('unreadable persisted history is not overwritten', () => {
		const { provider, storage, createProvider } = createHarness();
		provider.dispose();
		storage.store(NATIVE_CLI_STORAGE_KEY, '{invalid', StorageScope.PROFILE, StorageTarget.MACHINE);
		const restored = createProvider();
		assert.throws(() => restored.createNewSession(folder, 'terminal-copilot'), /could not be read/);
		assert.strictEqual(storage.get(NATIVE_CLI_STORAGE_KEY, StorageScope.PROFILE), '{invalid');
	});

	test('one unrecognized record is skipped without discarding the rest of the history', async () => {
		const { provider, storage, createProvider } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		provider.dispose();
		const stored: unknown[] = JSON.parse(storage.get(NATIVE_CLI_STORAGE_KEY, StorageScope.PROFILE)!);
		stored.unshift({ ...(stored[0] as object), id: generateUuid(), kind: 'a-cli-from-a-newer-build' });
		storage.store(NATIVE_CLI_STORAGE_KEY, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
		const restored = createProvider();
		assert.deepStrictEqual({
			sessions: restored.getSessions().length,
			stillWritable: (() => {
				try {
					restored.createNewSession(folder, 'terminal-copilot');
					return true;
				} catch {
					return false;
				}
			})(),
		}, { sessions: 1, stillWritable: true });
	});

	test('a CLI that exits on its own stops the session instead of accepting dropped input', async () => {
		const { provider, registry, terminals } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: 'first' });
		const terminal = terminals[0];
		// `waitOnExit` keeps the instance alive, so the exit event is the only liveness signal.
		terminal.finish(0);
		assert.deepStrictEqual({
			running: registry.getSessionTerminal(session.sessionId)!.isRunning.get(),
			instanceStillAlive: !terminal.isDisposed && terminal.exitReason === undefined,
			sentBeforeExit: terminal.sent.length,
		}, { running: false, instanceStillAlive: true, sentBeforeExit: 0 });
		await provider.sendRequest(session.sessionId, session.resource, { query: 'second' });
		// The relaunch path runs rather than writing into the dead pty.
		assert.strictEqual(terminals.length, 2);
	});

	test('administrator policy hides and blocks the third-party CLIs it disables', async () => {
		const { provider, configuration } = createHarness();
		const typeChanges: string[][] = [];
		store.add(provider.onDidChangeSessionTypes(() => typeChanges.push(provider.sessionTypes.map(type => type.id))));
		await configuration.setUserConfiguration('chat.agentHost.claudeAgent.enabled', false);
		configuration.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => key === 'chat.agentHost.claudeAgent.enabled',
		} as never);
		assert.deepStrictEqual({
			announced: typeChanges.at(-1),
			forFolder: provider.getSessionTypes(folder).map(type => type.id),
			created: (() => {
				try {
					provider.createNewSession(folder, 'terminal-claude');
					return 'created';
				} catch {
					return 'rejected';
				}
			})(),
		}, {
			announced: ['terminal-copilot', 'terminal-codex'],
			forFolder: ['terminal-copilot', 'terminal-codex'],
			created: 'rejected',
		});
	});

	test('launch telemetry records a bounded outcome without paths, prompts or CLI output', async () => {
		const { provider, telemetry } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: 'a secret prompt' });
		const started = telemetry.filter(entry => entry.event === 'agents/nativeCli/start');
		const serialized = JSON.stringify(started);
		assert.deepStrictEqual({
			count: started.length,
			outcome: started[0]?.data.outcome,
			cliKind: started[0]?.data.cliKind,
			accountSource: started[0]?.data.accountSource,
			leaksPrompt: serialized.includes('a secret prompt'),
			leaksPath: serialized.includes(folder.fsPath),
		}, { count: 1, outcome: 'success', cliKind: 'copilot', accountSource: 'native', leaksPrompt: false, leaksPath: false });
	});

	test('stopping a Copilot-backed CLI releases its proxy lease', async () => {		const { provider, registry, proxyCalls } = createHarness();
		const session = provider.createNewSession(folder, 'terminal-codex');
		const authentication = registry.getSessionTerminal(session.sessionId)!.ensureAuthentication!()!;
		authentication.setSource('copilot');
		await provider.sendRequest(session.sessionId, session.resource, { query: '' });
		// `ITerminalInstance.dispose` fires `onExit` a microtask later, so `stop()` has to
		// release the lease itself rather than relying on its exit listener.
		provider.archiveSession(session.sessionId);
		assert.strictEqual(proxyCalls.filter(call => call.startsWith('release:')).length, 1);
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IProcessEnvironment, isMacintosh, isWindows, OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ILocalPtyService, IProcessPropertyMap, IPtyHostLatencyMeasurement, IPtyService, IShellLaunchConfig, ITerminalBackend, ITerminalBackendRegistry, ITerminalChildProcess, ITerminalEnvironment, ITerminalLogService, ITerminalProcessOptions, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, ProcessPropertyType, TerminalExtensions, TerminalIpcChannels, TerminalSettingId, TitleEventSource } from 'vs/platform/terminal/common/terminal';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, ISetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalConfiguration, ITerminalProfileResolverService, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import { LocalPty } from 'vs/workbench/contrib/terminal/electron-sandbox/localPty';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IShellEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/shellEnvironmentService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { IProductService } from 'vs/platform/product/common/productService';
import { IEnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { BaseTerminalBackend } from 'vs/workbench/contrib/terminal/browser/baseTerminalBackend';
import { INativeHostService } from 'vs/platform/native/common/native';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/common/ipc.mp';
import { acquirePort } from 'vs/base/parts/ipc/electron-sandbox/ipc.mp';
import { getDelayedChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { mark, PerformanceMark } from 'vs/base/common/performance';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { DeferredPromise } from 'vs/base/common/async';
import { IStatusbarService } from 'vs/workbench/services/statusbar/browser/statusbar';
import { memoize } from 'vs/base/common/decorators';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { shouldUseEnvironmentVariableCollection } from 'vs/platform/terminal/common/terminalEnvironment';

export class LocalTerminalBackendContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.localTerminalBackend';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService
	) {
		const backend = instantiationService.createInstance(LocalTerminalBackend);
		Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).registerTerminalBackend(backend);
		terminalInstanceService.didRegisterBackend(backend.remoteAuthority);
	}
}

class LocalTerminalBackend extends BaseTerminalBackend implements ITerminalBackend {
	readonly remoteAuthority = undefined;

	private readonly _ptys: Map<number, LocalPty> = new Map();

	private _directProxyClientEventually: DeferredPromise<MessagePortClient> | undefined;
	private _directProxy: IPtyService | undefined;
	/**
	 * Communicate to the direct proxy (renderer<->ptyhost) if it's available, otherwise use the
	 * indirect proxy (renderer<->main<->ptyhost). The latter may not need to actually launch the
	 * pty host, for example when detecting profiles.
	 */
	private get _proxy(): IPtyService { return this._directProxy || this._localPtyService; }

	private readonly _whenReady = new DeferredPromise<void>();
	get whenReady(): Promise<void> { return this._whenReady.p; }
	setReady(): void { this._whenReady.complete(); }

	private readonly _onDidRequestDetach = this._register(new Emitter<{ requestId: number; workspaceId: string; instanceId: number }>());
	readonly onDidRequestDetach = this._onDidRequestDetach.event;

	constructor(
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ITerminalLogService logService: ITerminalLogService,
		@ILocalPtyService private readonly _localPtyService: ILocalPtyService,
		@ILabelService private readonly _labelService: ILabelService,
		@IShellEnvironmentService private readonly _shellEnvironmentService: IShellEnvironmentService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IProductService private readonly _productService: IProductService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@IHistoryService historyService: IHistoryService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IStatusbarService statusBarService: IStatusbarService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
	) {
		super(_localPtyService, logService, historyService, _configurationResolverService, statusBarService, workspaceContextService);

		this._register(this.onPtyHostRestart(() => {
			this._directProxy = undefined;
			this._directProxyClientEventually = undefined;
			this._connectToDirectProxy();
		}));
	}

	/**
	 * Request a direct connection to the pty host, this will launch the pty host process if necessary.
	 */
	private async _connectToDirectProxy(): Promise<void> {
		// Check if connecting is in progress
		if (this._directProxyClientEventually) {
			await this._directProxyClientEventually.p;
			return;
		}

		this._logService.debug('Starting pty host');
		const directProxyClientEventually = new DeferredPromise<MessagePortClient>();
		this._directProxyClientEventually = directProxyClientEventually;
		const directProxy = ProxyChannel.toService<IPtyService>(getDelayedChannel(this._directProxyClientEventually.p.then(client => client.getChannel(TerminalIpcChannels.PtyHostWindow))));
		this._directProxy = directProxy;

		// The pty host should not get launched until at least the window restored phase
		// if remote auth exists, don't await
		if (!this._remoteAgentService.getConnection()?.remoteAuthority) {
			await this._lifecycleService.when(LifecyclePhase.Restored);
		}

		mark('code/terminal/willConnectPtyHost');
		this._logService.trace('Renderer->PtyHost#connect: before acquirePort');
		acquirePort('vscode:createPtyHostMessageChannel', 'vscode:createPtyHostMessageChannelResult').then(port => {
			mark('code/terminal/didConnectPtyHost');
			this._logService.trace('Renderer->PtyHost#connect: connection established');
			// There are two connections to the pty host; one to the regular shared process
			// _localPtyService, and one directly via message port _ptyHostDirectProxy. The former is
			// used for pty host management messages, it would make sense in the future to use a
			// separate interface/service for this one.
			const client = new MessagePortClient(port, `window:${this._nativeHostService.windowId}`);
			directProxyClientEventually.complete(client);
			this._onPtyHostConnected.fire();

			// Attach process listeners
			directProxy.onProcessData(e => this._ptys.get(e.id)?.handleData(e.event));
			directProxy.onDidChangeProperty(e => this._ptys.get(e.id)?.handleDidChangeProperty(e.property));
			directProxy.onProcessExit(e => {
				const pty = this._ptys.get(e.id);
				if (pty) {
					pty.handleExit(e.event);
					this._ptys.delete(e.id);
				}
			});
			directProxy.onProcessReady(e => this._ptys.get(e.id)?.handleReady(e.event));
			directProxy.onProcessReplay(e => this._ptys.get(e.id)?.handleReplay(e.event));
			directProxy.onProcessOrphanQuestion(e => this._ptys.get(e.id)?.handleOrphanQuestion());
			directProxy.onDidRequestDetach(e => this._onDidRequestDetach.fire(e));

			// Listen for config changes
			const initialConfig = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
			for (const match of Object.keys(initialConfig.autoReplies)) {
				// Ensure the reply is value
				const reply = initialConfig.autoReplies[match] as string | null;
				if (reply) {
					directProxy.installAutoReply(match, reply);
				}
			}
			// TODO: Could simplify update to a single call
			this._register(this._configurationService.onDidChangeConfiguration(async e => {
				if (e.affectsConfiguration(TerminalSettingId.AutoReplies)) {
					directProxy.uninstallAllAutoReplies();
					const config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
					for (const match of Object.keys(config.autoReplies)) {
						// Ensure the reply is value
						const reply = config.autoReplies[match] as string | null;
						if (reply) {
							this._proxy.installAutoReply(match, reply);
						}
					}
				}
			}));

			// Eagerly fetch the backend's environment for memoization
			this.getEnvironment();
		});
	}

	async requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		return this._proxy.requestDetachInstance(workspaceId, instanceId);
	}

	async acceptDetachInstanceReply(requestId: number, persistentProcessId?: number): Promise<void> {
		if (!persistentProcessId) {
			this._logService.warn('Cannot attach to feature terminals, custom pty terminals, or those without a persistentProcessId');
			return;
		}
		return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
	}

	async persistTerminalState(): Promise<void> {
		const ids = Array.from(this._ptys.keys());
		const serialized = await this._proxy.serializeTerminalState(ids);
		this._storageService.store(TerminalStorageKeys.TerminalBufferState, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	async updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void> {
		await this._proxy.updateTitle(id, title, titleSource);
	}

	async updateIcon(id: number, userInitiated: boolean, icon: URI | { light: URI; dark: URI } | { id: string; color?: { id: string } }, color?: string): Promise<void> {
		await this._proxy.updateIcon(id, userInitiated, icon, color);
	}

	async updateProperty<T extends ProcessPropertyType>(id: number, property: ProcessPropertyType, value: IProcessPropertyMap[T]): Promise<void> {
		return this._proxy.updateProperty(id, property, value);
	}

	async createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment,
		options: ITerminalProcessOptions,
		shouldPersist: boolean
	): Promise<ITerminalChildProcess> {
		await this._connectToDirectProxy();
		const executableEnv = await this._shellEnvironmentService.getShellEnv();
		const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, this._getWorkspaceId(), this._getWorkspaceName());
		const pty = new LocalPty(id, shouldPersist, this._proxy);
		this._ptys.set(id, pty);
		return pty;
	}

	async attachToProcess(id: number): Promise<ITerminalChildProcess | undefined> {
		await this._connectToDirectProxy();
		try {
			await this._proxy.attachToProcess(id);
			const pty = new LocalPty(id, true, this._proxy);
			this._ptys.set(id, pty);
			return pty;
		} catch (e) {
			this._logService.warn(`Couldn't attach to process ${e.message}`);
		}
		return undefined;
	}

	async attachToRevivedProcess(id: number): Promise<ITerminalChildProcess | undefined> {
		await this._connectToDirectProxy();
		try {
			const newId = await this._proxy.getRevivedPtyNewId(this._getWorkspaceId(), id) ?? id;
			return await this.attachToProcess(newId);
		} catch (e) {
			this._logService.warn(`Couldn't attach to process ${e.message}`);
		}
		return undefined;
	}

	async listProcesses(): Promise<IProcessDetails[]> {
		await this._connectToDirectProxy();
		return this._proxy.listProcesses();
	}

	async getLatency(): Promise<IPtyHostLatencyMeasurement[]> {
		const measurements: IPtyHostLatencyMeasurement[] = [];
		const sw = new StopWatch();
		if (this._directProxy) {
			await this._directProxy.getLatency();
			sw.stop();
			measurements.push({
				label: 'window<->ptyhost (message port)',
				latency: sw.elapsed()
			});
			sw.reset();
		}
		const results = await this._localPtyService.getLatency();
		sw.stop();
		measurements.push({
			label: 'window<->ptyhostservice<->ptyhost',
			latency: sw.elapsed()
		});
		return [
			...measurements,
			...results
		];
	}

	async getPerformanceMarks(): Promise<PerformanceMark[]> {
		return this._proxy.getPerformanceMarks();
	}

	async reduceConnectionGraceTime(): Promise<void> {
		this._proxy.reduceConnectionGraceTime();
	}

	async getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string> {
		return this._proxy.getDefaultSystemShell(osOverride);
	}

	async getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean) {
		return this._localPtyService.getProfiles(this._workspaceContextService.getWorkspace().id, profiles, defaultProfile, includeDetectedProfiles) || [];
	}

	@memoize
	async getEnvironment(): Promise<IProcessEnvironment> {
		return this._proxy.getEnvironment();
	}

	@memoize
	async getShellEnvironment(): Promise<IProcessEnvironment> {
		return this._shellEnvironmentService.getShellEnv();
	}

	async getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string> {
		return this._proxy.getWslPath(original, direction);
	}

	async setTerminalLayoutInfo(layoutInfo?: ITerminalsLayoutInfoById): Promise<void> {
		const args: ISetTerminalLayoutInfoArgs = {
			workspaceId: this._getWorkspaceId(),
			tabs: layoutInfo ? layoutInfo.tabs : []
		};
		await this._proxy.setTerminalLayoutInfo(args);
		// Store in the storage service as well to be used when reviving processes as normally this
		// is stored in memory on the pty host
		this._storageService.store(TerminalStorageKeys.TerminalLayoutInfo, JSON.stringify(args), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	async getTerminalLayoutInfo(): Promise<ITerminalsLayoutInfo | undefined> {
		const workspaceId = this._getWorkspaceId();
		const layoutArgs: IGetTerminalLayoutInfoArgs = { workspaceId };

		// Revive processes if needed
		const serializedState = this._storageService.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
		const reviveBufferState = this._deserializeTerminalState(serializedState);
		if (reviveBufferState && reviveBufferState.length > 0) {
			try {
				// Create variable resolver
				const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
				const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
				const variableResolver = terminalEnvironment.createVariableResolver(lastActiveWorkspace, await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority), this._configurationResolverService);

				// Re-resolve the environments and replace it on the state so local terminals use a fresh
				// environment
				mark('code/terminal/willGetReviveEnvironments');
				await Promise.all(reviveBufferState.map(state => new Promise<void>(r => {
					this._resolveEnvironmentForRevive(variableResolver, state.shellLaunchConfig).then(freshEnv => {
						state.processLaunchConfig.env = freshEnv;
						r();
					});
				})));
				mark('code/terminal/didGetReviveEnvironments');

				mark('code/terminal/willReviveTerminalProcesses');
				await this._proxy.reviveTerminalProcesses(workspaceId, reviveBufferState, Intl.DateTimeFormat().resolvedOptions().locale);
				mark('code/terminal/didReviveTerminalProcesses');
				this._storageService.remove(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
				// If reviving processes, send the terminal layout info back to the pty host as it
				// will not have been persisted on application exit
				const layoutInfo = this._storageService.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
				if (layoutInfo) {
					mark('code/terminal/willSetTerminalLayoutInfo');
					await this._proxy.setTerminalLayoutInfo(JSON.parse(layoutInfo));
					mark('code/terminal/didSetTerminalLayoutInfo');
					this._storageService.remove(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
				}
			} catch (e: unknown) {
				this._logService.warn('LocalTerminalBackend#getTerminalLayoutInfo Error', e && typeof e === 'object' && 'message' in e ? e.message : e);
			}
		}

		return this._proxy.getTerminalLayoutInfo(layoutArgs);
	}

	private async _resolveEnvironmentForRevive(variableResolver: terminalEnvironment.VariableResolver | undefined, shellLaunchConfig: IShellLaunchConfig): Promise<IProcessEnvironment> {
		const platformKey = isWindows ? 'windows' : (isMacintosh ? 'osx' : 'linux');
		const envFromConfigValue = this._configurationService.getValue<ITerminalEnvironment | undefined>(`terminal.integrated.env.${platformKey}`);
		const baseEnv = await (shellLaunchConfig.useShellEnvironment ? this.getShellEnvironment() : this.getEnvironment());
		const env = await terminalEnvironment.createTerminalEnvironment(shellLaunchConfig, envFromConfigValue, variableResolver, this._productService.version, this._configurationService.getValue(TerminalSettingId.DetectLocale), baseEnv);
		if (shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
			const workspaceFolder = terminalEnvironment.getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
			await this._environmentVariableService.mergedCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
		}
		return env;
	}

	private _getWorkspaceName(): string {
		return this._labelService.getWorkspaceLabel(this._workspaceContextService.getWorkspace());
	}
}

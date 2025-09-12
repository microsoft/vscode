/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { revive } from '../../../../base/common/marshalling.js';
import { PerformanceMark, mark } from '../../../../base/common/performance.js';
import { IProcessEnvironment, OperatingSystem } from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISerializedTerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPtyHostLatencyMeasurement, IShellLaunchConfig, IShellLaunchConfigDto, ITerminalBackend, ITerminalBackendRegistry, ITerminalChildProcess, ITerminalEnvironment, ITerminalLogService, ITerminalProcessOptions, ITerminalProfile, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, ProcessPropertyType, TerminalExtensions, TerminalIcon, TerminalSettingId, TitleEventSource } from '../../../../platform/terminal/common/terminal.js';
import { IProcessDetails } from '../../../../platform/terminal/common/terminalProcess.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { BaseTerminalBackend } from './baseTerminalBackend.js';
import { RemotePty } from './remotePty.js';
import { ITerminalInstanceService } from './terminal.js';
import { RemoteTerminalChannelClient, REMOTE_TERMINAL_CHANNEL_NAME } from '../common/remote/remoteTerminalChannel.js';
import { ICompleteTerminalConfiguration, ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from '../common/terminal.js';
import { TerminalStorageKeys } from '../common/terminalStorageKeys.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';

export class RemoteTerminalBackendContribution implements IWorkbenchContribution {
	static ID = 'remoteTerminalBackend';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService
	) {
		const connection = remoteAgentService.getConnection();
		if (connection?.remoteAuthority) {
			const channel = instantiationService.createInstance(RemoteTerminalChannelClient, connection.remoteAuthority, connection.getChannel(REMOTE_TERMINAL_CHANNEL_NAME));
			const backend = instantiationService.createInstance(RemoteTerminalBackend, connection.remoteAuthority, channel);
			Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).registerTerminalBackend(backend);
			terminalInstanceService.didRegisterBackend(backend);
		}
	}
}

class RemoteTerminalBackend extends BaseTerminalBackend implements ITerminalBackend {
	private readonly _ptys: Map<number, RemotePty> = new Map();

	private readonly _whenConnected = new DeferredPromise<void>();
	get whenReady(): Promise<void> { return this._whenConnected.p; }
	setReady(): void { this._whenConnected.complete(); }

	private readonly _onDidRequestDetach = this._register(new Emitter<{ requestId: number; workspaceId: string; instanceId: number }>());
	readonly onDidRequestDetach = this._onDidRequestDetach.event;
	private readonly _onRestoreCommands = this._register(new Emitter<{ id: number; commands: ISerializedTerminalCommand[] }>());
	readonly onRestoreCommands = this._onRestoreCommands.event;

	constructor(
		readonly remoteAuthority: string | undefined,
		private readonly _remoteTerminalChannel: RemoteTerminalChannelClient,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalLogService logService: ITerminalLogService,
		@ICommandService private readonly _commandService: ICommandService,
		@IStorageService private readonly _storageService: IStorageService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStatusbarService statusBarService: IStatusbarService
	) {
		super(_remoteTerminalChannel, logService, _historyService, configurationResolverService, statusBarService, workspaceContextService);

		this._remoteTerminalChannel.onProcessData(e => this._ptys.get(e.id)?.handleData(e.event));
		this._remoteTerminalChannel.onProcessReplay(e => {
			this._ptys.get(e.id)?.handleReplay(e.event);
			if (e.event.commands.commands.length > 0) {
				this._onRestoreCommands.fire({ id: e.id, commands: e.event.commands.commands });
			}
		});
		this._remoteTerminalChannel.onProcessOrphanQuestion(e => this._ptys.get(e.id)?.handleOrphanQuestion());
		this._remoteTerminalChannel.onDidRequestDetach(e => this._onDidRequestDetach.fire(e));
		this._remoteTerminalChannel.onProcessReady(e => this._ptys.get(e.id)?.handleReady(e.event));
		this._remoteTerminalChannel.onDidChangeProperty(e => this._ptys.get(e.id)?.handleDidChangeProperty(e.property));
		this._remoteTerminalChannel.onProcessExit(e => {
			const pty = this._ptys.get(e.id);
			if (pty) {
				pty.handleExit(e.event);
				pty.dispose();
				this._ptys.delete(e.id);
			}
		});

		const allowedCommands = ['_remoteCLI.openExternal', '_remoteCLI.windowOpen', '_remoteCLI.getSystemStatus', '_remoteCLI.manageExtensions'];
		this._remoteTerminalChannel.onExecuteCommand(async e => {
			// Ensure this request for for this window
			const pty = this._ptys.get(e.persistentProcessId);
			if (!pty) {
				return;
			}
			const reqId = e.reqId;
			const commandId = e.commandId;
			if (!allowedCommands.includes(commandId)) {
				this._remoteTerminalChannel.sendCommandResult(reqId, true, 'Invalid remote cli command: ' + commandId);
				return;
			}
			const commandArgs = e.commandArgs.map(arg => revive(arg));
			try {
				const result = await this._commandService.executeCommand(e.commandId, ...commandArgs);
				this._remoteTerminalChannel.sendCommandResult(reqId, false, result);
			} catch (err) {
				this._remoteTerminalChannel.sendCommandResult(reqId, true, err);
			}
		});

		this._onPtyHostConnected.fire();
	}

	async requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot request detach instance when there is no remote!`);
		}
		return this._remoteTerminalChannel.requestDetachInstance(workspaceId, instanceId);
	}

	async acceptDetachInstanceReply(requestId: number, persistentProcessId?: number): Promise<void> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot accept detached instance when there is no remote!`);
		} else if (!persistentProcessId) {
			this._logService.warn('Cannot attach to feature terminals, custom pty terminals, or those without a persistentProcessId');
			return;
		}

		return this._remoteTerminalChannel.acceptDetachInstanceReply(requestId, persistentProcessId);
	}

	async persistTerminalState(): Promise<void> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot persist terminal state when there is no remote!`);
		}
		const ids = Array.from(this._ptys.keys());
		const serialized = await this._remoteTerminalChannel.serializeTerminalState(ids);
		this._storageService.store(TerminalStorageKeys.TerminalBufferState, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	async createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string, // TODO: This is ignored
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment, // TODO: This is ignored
		options: ITerminalProcessOptions,
		shouldPersist: boolean
	): Promise<ITerminalChildProcess> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot create remote terminal when there is no remote!`);
		}

		// Fetch the environment to check shell permissions
		const remoteEnv = await this._remoteAgentService.getEnvironment();
		if (!remoteEnv) {
			// Extension host processes are only allowed in remote extension hosts currently
			throw new Error('Could not fetch remote environment');
		}

		const terminalConfig = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
		const configuration: ICompleteTerminalConfiguration = {
			'terminal.integrated.env.windows': this._configurationService.getValue(TerminalSettingId.EnvWindows) as ITerminalEnvironment,
			'terminal.integrated.env.osx': this._configurationService.getValue(TerminalSettingId.EnvMacOs) as ITerminalEnvironment,
			'terminal.integrated.env.linux': this._configurationService.getValue(TerminalSettingId.EnvLinux) as ITerminalEnvironment,
			'terminal.integrated.cwd': this._configurationService.getValue(TerminalSettingId.Cwd) as string,
			'terminal.integrated.detectLocale': terminalConfig.detectLocale
		};

		const shellLaunchConfigDto: IShellLaunchConfigDto = {
			name: shellLaunchConfig.name,
			executable: shellLaunchConfig.executable,
			args: shellLaunchConfig.args,
			cwd: shellLaunchConfig.cwd,
			env: shellLaunchConfig.env,
			useShellEnvironment: shellLaunchConfig.useShellEnvironment,
			reconnectionProperties: shellLaunchConfig.reconnectionProperties,
			type: shellLaunchConfig.type,
			isFeatureTerminal: shellLaunchConfig.isFeatureTerminal,
			tabActions: shellLaunchConfig.tabActions,
			shellIntegrationEnvironmentReporting: shellLaunchConfig.shellIntegrationEnvironmentReporting,
		};
		const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();

		const result = await this._remoteTerminalChannel.createProcess(
			shellLaunchConfigDto,
			configuration,
			activeWorkspaceRootUri,
			options,
			shouldPersist,
			cols,
			rows,
			unicodeVersion
		);
		const pty = this._instantiationService.createInstance(RemotePty, result.persistentTerminalId, shouldPersist, this._remoteTerminalChannel);
		this._ptys.set(result.persistentTerminalId, pty);
		return pty;
	}

	async attachToProcess(id: number): Promise<ITerminalChildProcess | undefined> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot create remote terminal when there is no remote!`);
		}

		try {
			await this._remoteTerminalChannel.attachToProcess(id);
			const pty = this._instantiationService.createInstance(RemotePty, id, true, this._remoteTerminalChannel);
			this._ptys.set(id, pty);
			return pty;
		} catch (e) {
			this._logService.trace(`Couldn't attach to process ${e.message}`);
		}
		return undefined;
	}

	async attachToRevivedProcess(id: number): Promise<ITerminalChildProcess | undefined> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot create remote terminal when there is no remote!`);
		}

		try {
			const newId = await this._remoteTerminalChannel.getRevivedPtyNewId(id) ?? id;
			return await this.attachToProcess(newId);
		} catch (e) {
			this._logService.trace(`Couldn't attach to process ${e.message}`);
		}
		return undefined;
	}

	async listProcesses(): Promise<IProcessDetails[]> {
		return this._remoteTerminalChannel.listProcesses();
	}

	async getLatency(): Promise<IPtyHostLatencyMeasurement[]> {
		const sw = new StopWatch();
		const results = await this._remoteTerminalChannel.getLatency();
		sw.stop();
		return [
			{
				label: 'window<->ptyhostservice<->ptyhost',
				latency: sw.elapsed()
			},
			...results
		];
	}

	async updateProperty<T extends ProcessPropertyType>(id: number, property: T, value: any): Promise<void> {
		await this._remoteTerminalChannel.updateProperty(id, property, value);
	}

	async updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void> {
		await this._remoteTerminalChannel.updateTitle(id, title, titleSource);
	}

	async updateIcon(id: number, userInitiated: boolean, icon: TerminalIcon, color?: string): Promise<void> {
		await this._remoteTerminalChannel.updateIcon(id, userInitiated, icon, color);
	}

	async getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string> {
		return this._remoteTerminalChannel.getDefaultSystemShell(osOverride) || '';
	}

	async getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return this._remoteTerminalChannel.getProfiles(profiles, defaultProfile, includeDetectedProfiles) || [];
	}

	async getEnvironment(): Promise<IProcessEnvironment> {
		return this._remoteTerminalChannel.getEnvironment() || {};
	}

	async getShellEnvironment(): Promise<IProcessEnvironment | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (!connection) {
			return undefined;
		}
		const resolverResult = await this._remoteAuthorityResolverService.resolveAuthority(connection.remoteAuthority);
		return resolverResult.options?.extensionHostEnv as any;
	}

	async getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string> {
		const env = await this._remoteAgentService.getEnvironment();
		if (env?.os !== OperatingSystem.Windows) {
			return original;
		}
		return this._remoteTerminalChannel.getWslPath(original, direction) || original;
	}

	async setTerminalLayoutInfo(layout?: ITerminalsLayoutInfoById): Promise<void> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot call setActiveInstanceId when there is no remote`);
		}

		return this._remoteTerminalChannel.setTerminalLayoutInfo(layout);
	}

	async reduceConnectionGraceTime(): Promise<void> {
		if (!this._remoteTerminalChannel) {
			throw new Error('Cannot reduce grace time when there is no remote');
		}
		return this._remoteTerminalChannel.reduceConnectionGraceTime();
	}

	async getTerminalLayoutInfo(): Promise<ITerminalsLayoutInfo | undefined> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot call getActiveInstanceId when there is no remote`);
		}

		const workspaceId = this._getWorkspaceId();

		// Revive processes if needed
		const serializedState = this._storageService.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
		const reviveBufferState = this._deserializeTerminalState(serializedState);
		if (reviveBufferState && reviveBufferState.length > 0) {
			try {
				// Note that remote terminals do not get their environment re-resolved unlike in local terminals

				mark('code/terminal/willReviveTerminalProcessesRemote');
				await this._remoteTerminalChannel.reviveTerminalProcesses(workspaceId, reviveBufferState, Intl.DateTimeFormat().resolvedOptions().locale);
				mark('code/terminal/didReviveTerminalProcessesRemote');
				this._storageService.remove(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
				// If reviving processes, send the terminal layout info back to the pty host as it
				// will not have been persisted on application exit
				const layoutInfo = this._storageService.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
				if (layoutInfo) {
					mark('code/terminal/willSetTerminalLayoutInfoRemote');
					await this._remoteTerminalChannel.setTerminalLayoutInfo(JSON.parse(layoutInfo));
					mark('code/terminal/didSetTerminalLayoutInfoRemote');
					this._storageService.remove(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
				}
			} catch (e: unknown) {
				this._logService.warn('RemoteTerminalBackend#getTerminalLayoutInfo Error', e && typeof e === 'object' && 'message' in e ? e.message : e);
			}
		}

		return this._remoteTerminalChannel.getTerminalLayoutInfo();
	}

	async getPerformanceMarks(): Promise<PerformanceMark[]> {
		return this._remoteTerminalChannel.getPerformanceMarks();
	}

	installAutoReply(match: string, reply: string): Promise<void> {
		return this._remoteTerminalChannel.installAutoReply(match, reply);
	}

	uninstallAllAutoReplies(): Promise<void> {
		return this._remoteTerminalChannel.uninstallAllAutoReplies();
	}
}

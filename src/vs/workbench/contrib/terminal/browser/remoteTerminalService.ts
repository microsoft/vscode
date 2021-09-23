/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import { IProcessEnvironment, OperatingSystem } from 'vs/base/common/platform';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationHandle, INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IRequestResolveVariablesEvent, IShellLaunchConfig, IShellLaunchConfigDto, ITerminalChildProcess, ITerminalProfile, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, ProcessPropertyType, TerminalIcon } from 'vs/platform/terminal/common/terminal';
import { IProcessDetails } from 'vs/platform/terminal/common/terminalProcess';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { RemotePty } from 'vs/workbench/contrib/terminal/browser/remotePty';
import { IRemoteTerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ICompleteTerminalConfiguration, RemoteTerminalChannelClient, REMOTE_TERMINAL_CHANNEL_NAME } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class RemoteTerminalService extends Disposable implements IRemoteTerminalService {
	declare _serviceBrand: undefined;

	private readonly _ptys: Map<number, RemotePty> = new Map();
	private readonly _remoteTerminalChannel: RemoteTerminalChannelClient | null;
	private _isPtyHostUnresponsive: boolean = false;

	private readonly _onPtyHostUnresponsive = this._register(new Emitter<void>());
	readonly onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
	private readonly _onPtyHostResponsive = this._register(new Emitter<void>());
	readonly onPtyHostResponsive = this._onPtyHostResponsive.event;
	private readonly _onPtyHostRestart = this._register(new Emitter<void>());
	readonly onPtyHostRestart = this._onPtyHostRestart.event;
	private readonly _onPtyHostRequestResolveVariables = this._register(new Emitter<IRequestResolveVariablesEvent>());
	readonly onPtyHostRequestResolveVariables = this._onPtyHostRequestResolveVariables.event;
	private readonly _onDidRequestDetach = this._register(new Emitter<{ requestId: number, workspaceId: string, instanceId: number }>());
	readonly onDidRequestDetach = this._onDidRequestDetach.event;

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IStorageService private readonly _storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IHistoryService historyService: IHistoryService
	) {
		super();

		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			const channel = this._instantiationService.createInstance(RemoteTerminalChannelClient, connection.remoteAuthority, connection.getChannel(REMOTE_TERMINAL_CHANNEL_NAME));
			this._remoteTerminalChannel = channel;

			channel.onProcessData(e => this._ptys.get(e.id)?.handleData(e.event));
			channel.onProcessExit(e => {
				const pty = this._ptys.get(e.id);
				if (pty) {
					pty.handleExit(e.event);
					this._ptys.delete(e.id);
				}
			});
			channel.onProcessReady(e => this._ptys.get(e.id)?.handleReady(e.event));
			channel.onProcessTitleChanged(e => this._ptys.get(e.id)?.handleTitleChanged(e.event));
			channel.onProcessShellTypeChanged(e => this._ptys.get(e.id)?.handleShellTypeChanged(e.event));
			channel.onProcessOverrideDimensions(e => this._ptys.get(e.id)?.handleOverrideDimensions(e.event));
			channel.onProcessResolvedShellLaunchConfig(e => this._ptys.get(e.id)?.handleResolvedShellLaunchConfig(e.event));
			channel.onProcessReplay(e => this._ptys.get(e.id)?.handleReplay(e.event));
			channel.onProcessOrphanQuestion(e => this._ptys.get(e.id)?.handleOrphanQuestion());
			channel.onDidRequestDetach(e => this._onDidRequestDetach.fire(e));
			channel.onProcessDidChangeHasChildProcesses(e => this._ptys.get(e.id)?.handleDidChangeHasChildProcesses(e.event));
			channel.onDidChangeProperty(e => this._ptys.get(e.id)?.handleDidChangeProperty(e.property));

			const allowedCommands = ['_remoteCLI.openExternal', '_remoteCLI.windowOpen', '_remoteCLI.getSystemStatus', '_remoteCLI.manageExtensions'];
			channel.onExecuteCommand(async e => {
				const reqId = e.reqId;
				const commandId = e.commandId;
				if (!allowedCommands.includes(commandId)) {
					channel!.sendCommandResult(reqId, true, 'Invalid remote cli command: ' + commandId);
					return;
				}
				const commandArgs = e.commandArgs.map(arg => revive(arg));
				try {
					const result = await this._commandService.executeCommand(e.commandId, ...commandArgs);
					channel!.sendCommandResult(reqId, false, result);
				} catch (err) {
					channel!.sendCommandResult(reqId, true, err);
				}
			});

			// Attach pty host listeners
			if (channel.onPtyHostExit) {
				this._register(channel.onPtyHostExit(() => {
					this._logService.error(`The terminal's pty host process exited, the connection to all terminal processes was lost`);
				}));
			}
			let unresponsiveNotification: INotificationHandle | undefined;
			if (channel.onPtyHostStart) {
				this._register(channel.onPtyHostStart(() => {
					this._logService.info(`ptyHost restarted`);
					this._onPtyHostRestart.fire();
					unresponsiveNotification?.close();
					unresponsiveNotification = undefined;
					this._isPtyHostUnresponsive = false;
				}));
			}
			if (channel.onPtyHostUnresponsive) {
				this._register(channel.onPtyHostUnresponsive(() => {
					const choices: IPromptChoice[] = [{
						label: localize('restartPtyHost', "Restart pty host"),
						run: () => channel.restartPtyHost!()
					}];
					unresponsiveNotification = notificationService.prompt(Severity.Error, localize('nonResponsivePtyHost', "The connection to the terminal's pty host process is unresponsive, the terminals may stop working."), choices);
					this._isPtyHostUnresponsive = true;
					this._onPtyHostUnresponsive.fire();
				}));
			}
			if (channel.onPtyHostResponsive) {
				this._register(channel.onPtyHostResponsive(() => {
					if (!this._isPtyHostUnresponsive) {
						return;
					}
					this._logService.info('The pty host became responsive again');
					unresponsiveNotification?.close();
					unresponsiveNotification = undefined;
					this._isPtyHostUnresponsive = false;
					this._onPtyHostResponsive.fire();
				}));
			}
			this._register(channel.onPtyHostRequestResolveVariables(async e => {
				// Only answer requests for this workspace
				if (e.workspaceId !== workspaceContextService.getWorkspace().id) {
					return;
				}
				const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.vscodeRemote);
				const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? withNullAsUndefined(workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
				const resolveCalls: Promise<string>[] = e.originalText.map(t => {
					return configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, t);
				});
				const result = await Promise.all(resolveCalls);
				channel.acceptPtyHostResolvedVariables(e.requestId, result);
			}));
		} else {
			this._remoteTerminalChannel = null;
		}
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

	async createProcess(shellLaunchConfig: IShellLaunchConfig, configuration: ICompleteTerminalConfiguration, activeWorkspaceRootUri: URI | undefined, cols: number, rows: number, unicodeVersion: '6' | '11', shouldPersist: boolean): Promise<ITerminalChildProcess> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot create remote terminal when there is no remote!`);
		}

		// Fetch the environment to check shell permissions
		const remoteEnv = await this._remoteAgentService.getEnvironment();
		if (!remoteEnv) {
			// Extension host processes are only allowed in remote extension hosts currently
			throw new Error('Could not fetch remote environment');
		}

		const shellLaunchConfigDto: IShellLaunchConfigDto = {
			name: shellLaunchConfig.name,
			executable: shellLaunchConfig.executable,
			args: shellLaunchConfig.args,
			cwd: shellLaunchConfig.cwd,
			env: shellLaunchConfig.env,
			useShellEnvironment: shellLaunchConfig.useShellEnvironment
		};
		const result = await this._remoteTerminalChannel.createProcess(
			shellLaunchConfigDto,
			configuration,
			activeWorkspaceRootUri,
			shouldPersist,
			cols,
			rows,
			unicodeVersion
		);
		const pty = new RemotePty(result.persistentTerminalId, shouldPersist, this._remoteTerminalChannel, this._remoteAgentService, this._logService);
		this._ptys.set(result.persistentTerminalId, pty);
		return pty;
	}

	async attachToProcess(id: number): Promise<ITerminalChildProcess | undefined> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot create remote terminal when there is no remote!`);
		}

		try {
			await this._remoteTerminalChannel.attachToProcess(id);
			const pty = new RemotePty(id, true, this._remoteTerminalChannel, this._remoteAgentService, this._logService);
			this._ptys.set(id, pty);
			return pty;
		} catch (e) {
			this._logService.trace(`Couldn't attach to process ${e.message}`);
		}
		return undefined;
	}

	async listProcesses(): Promise<IProcessDetails[]> {
		const terms = this._remoteTerminalChannel ? await this._remoteTerminalChannel.listProcesses() : [];
		return terms.map(termDto => {
			return <IProcessDetails>{
				id: termDto.id,
				pid: termDto.pid,
				title: termDto.title,
				titleSource: termDto.titleSource,
				cwd: termDto.cwd,
				workspaceId: termDto.workspaceId,
				workspaceName: termDto.workspaceName,
				icon: termDto.icon,
				color: termDto.color,
				isOrphan: termDto.isOrphan,
				fixedDimensions: termDto.fixedDimensions
			};
		});
	}

	async updateProperty(id: number, property: ProcessPropertyType, value: any): Promise<void> {
		await this._remoteTerminalChannel?.updateProperty(id, property, value);
	}

	async updateTitle(id: number, title: string): Promise<void> {
		await this._remoteTerminalChannel?.updateTitle(id, title);
	}

	async updateIcon(id: number, icon: TerminalIcon, color?: string): Promise<void> {
		await this._remoteTerminalChannel?.updateIcon(id, icon, color);
	}

	async getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string> {
		return this._remoteTerminalChannel?.getDefaultSystemShell(osOverride) || '';
	}

	async getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return this._remoteTerminalChannel?.getProfiles(profiles, defaultProfile, includeDetectedProfiles) || [];
	}

	async getEnvironment(): Promise<IProcessEnvironment> {
		return this._remoteTerminalChannel?.getEnvironment() || {};
	}

	async getShellEnvironment(): Promise<IProcessEnvironment | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (!connection) {
			return undefined;
		}
		const resolverResult = await this._remoteAuthorityResolverService.resolveAuthority(connection.remoteAuthority);
		return resolverResult.options?.extensionHostEnv as any;
	}

	async getWslPath(original: string): Promise<string> {
		const env = await this._remoteAgentService.getEnvironment();
		if (env?.os !== OperatingSystem.Windows) {
			return original;
		}
		return this._remoteTerminalChannel?.getWslPath(original) || original;
	}

	setTerminalLayoutInfo(layout: ITerminalsLayoutInfoById): Promise<void> {
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

		// Revive processes if needed
		const serializedState = this._storageService.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
		if (serializedState) {
			try {
				await this._remoteTerminalChannel.reviveTerminalProcesses(serializedState);
				this._storageService.remove(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
				// If reviving processes, send the terminal layout info back to the pty host as it
				// will not have been persisted on application exit
				const layoutInfo = this._storageService.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
				if (layoutInfo) {
					await this._remoteTerminalChannel.setTerminalLayoutInfo(JSON.parse(layoutInfo));
					this._storageService.remove(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
				}
			} catch {
				// no-op
			}
		}

		return this._remoteTerminalChannel.getTerminalLayoutInfo();
	}
}

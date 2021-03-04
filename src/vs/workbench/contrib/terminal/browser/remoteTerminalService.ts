/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Barrier } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteTerminalService, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IRemoteTerminalProcessExecCommandEvent, IShellLaunchConfigDto, RemoteTerminalChannelClient, REMOTE_TERMINAL_CHANNEL_NAME } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { IRemoteTerminalAttachTarget, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IProcessDataEvent, IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensionsOverride, ITerminalLaunchError, ITerminalsLayoutInfo, ITerminalsLayoutInfoById } from 'vs/platform/terminal/common/terminal';

export class RemoteTerminalService extends Disposable implements IRemoteTerminalService {
	public _serviceBrand: undefined;

	private readonly _remoteTerminalChannel: RemoteTerminalChannelClient | null;
	private _hasConnectedToRemote = false;

	constructor(
		@ITerminalInstanceService readonly terminalInstanceService: ITerminalInstanceService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			this._remoteTerminalChannel = this._instantiationService.createInstance(RemoteTerminalChannelClient, connection.remoteAuthority, connection.getChannel(REMOTE_TERMINAL_CHANNEL_NAME));
		} else {
			this._remoteTerminalChannel = null;
		}
	}

	public async createRemoteTerminalProcess(instanceId: number, shellLaunchConfig: IShellLaunchConfig, activeWorkspaceRootUri: URI | undefined, cols: number, rows: number, shouldPersist: boolean, configHelper: ITerminalConfigHelper): Promise<ITerminalChildProcess> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot create remote terminal when there is no remote!`);
		}

		let isPreconnectionTerminal = false;
		if (!this._hasConnectedToRemote) {
			isPreconnectionTerminal = true;
			this._remoteAgentService.getEnvironment().then(() => {
				this._hasConnectedToRemote = true;
			});
		}

		return new RemoteTerminalProcess(instanceId, shouldPersist, shellLaunchConfig, activeWorkspaceRootUri, cols, rows, configHelper, isPreconnectionTerminal, this._remoteTerminalChannel, this._remoteAgentService, this._logService, this._commandService);
	}

	public async listTerminals(isInitialization = false): Promise<IRemoteTerminalAttachTarget[]> {
		const terms = this._remoteTerminalChannel ? await this._remoteTerminalChannel.listTerminals(isInitialization) : [];
		return terms.map(termDto => {
			return <IRemoteTerminalAttachTarget>{
				id: termDto.id,
				pid: termDto.pid,
				title: termDto.title,
				cwd: termDto.cwd,
				workspaceId: termDto.workspaceId,
				workspaceName: termDto.workspaceName
			};
		});
	}

	public setTerminalLayoutInfo(layout: ITerminalsLayoutInfoById): Promise<void> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot call setActiveInstanceId when there is no remote`);
		}

		return this._remoteTerminalChannel.setTerminalLayoutInfo(layout);
	}

	public getTerminalLayoutInfo(): Promise<ITerminalsLayoutInfo | undefined> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot call getActiveInstanceId when there is no remote`);
		}

		return this._remoteTerminalChannel.getTerminalLayoutInfo();
	}
}

export class RemoteTerminalProcess extends Disposable implements ITerminalChildProcess {

	public readonly _onProcessData = this._register(new Emitter<IProcessDataEvent>());
	public readonly onProcessData: Event<IProcessDataEvent> = this._onProcessData.event;
	private readonly _onProcessExit = this._register(new Emitter<number | undefined>());
	public readonly onProcessExit: Event<number | undefined> = this._onProcessExit.event;
	public readonly _onProcessReady = this._register(new Emitter<{ pid: number, cwd: string }>());
	public get onProcessReady(): Event<{ pid: number, cwd: string }> { return this._onProcessReady.event; }
	private readonly _onProcessTitleChanged = this._register(new Emitter<string>());
	public readonly onProcessTitleChanged: Event<string> = this._onProcessTitleChanged.event;
	private readonly _onProcessOverrideDimensions = this._register(new Emitter<ITerminalDimensionsOverride | undefined>());
	public readonly onProcessOverrideDimensions: Event<ITerminalDimensionsOverride | undefined> = this._onProcessOverrideDimensions.event;
	private readonly _onProcessResolvedShellLaunchConfig = this._register(new Emitter<IShellLaunchConfig>());
	public get onProcessResolvedShellLaunchConfig(): Event<IShellLaunchConfig> { return this._onProcessResolvedShellLaunchConfig.event; }

	private _startBarrier: Barrier;
	private _persistentProcessId: number;
	public get id(): number { return this._persistentProcessId; }

	private _inReplay = false;

	constructor(
		private readonly _instanceId: number,
		readonly shouldPersist: boolean,
		private readonly _shellLaunchConfig: IShellLaunchConfig,
		private readonly _activeWorkspaceRootUri: URI | undefined,
		private readonly _cols: number,
		private readonly _rows: number,
		private readonly _configHelper: ITerminalConfigHelper,
		private readonly _isPreconnectionTerminal: boolean,
		private readonly _remoteTerminalChannel: RemoteTerminalChannelClient,
		private readonly _remoteAgentService: IRemoteAgentService,
		private readonly _logService: ILogService,
		private readonly _commandService: ICommandService,
	) {
		super();
		this._startBarrier = new Barrier();
		this._persistentProcessId = 0;

		if (this._isPreconnectionTerminal) {
			// Add a loading title only if this terminal is
			// instantiated before a connection is up and running
			setTimeout(() => this._onProcessTitleChanged.fire(nls.localize('terminal.integrated.starting', "Starting...")), 0);
		}
	}

	public async start(): Promise<ITerminalLaunchError | undefined> {
		// Fetch the environment to check shell permissions
		const env = await this._remoteAgentService.getEnvironment();
		if (!env) {
			// Extension host processes are only allowed in remote extension hosts currently
			throw new Error('Could not fetch remote environment');
		}

		if (!this._shellLaunchConfig.attachPersistentProcess) {
			const isWorkspaceShellAllowed = this._configHelper.checkWorkspaceShellPermissions(env.os);

			const shellLaunchConfigDto: IShellLaunchConfigDto = {
				name: this._shellLaunchConfig.name,
				executable: this._shellLaunchConfig.executable,
				args: this._shellLaunchConfig.args,
				cwd: this._shellLaunchConfig.cwd,
				env: this._shellLaunchConfig.env
			};

			this._logService.trace('Spawning remote agent process', { terminalId: this._instanceId, shellLaunchConfigDto });

			const result = await this._remoteTerminalChannel.createTerminalProcess(
				shellLaunchConfigDto,
				this._activeWorkspaceRootUri,
				this.shouldPersist,
				this._cols,
				this._rows,
				isWorkspaceShellAllowed,
			);

			this._persistentProcessId = result.terminalId;
			this.setupTerminalEventListener();
			this._onProcessResolvedShellLaunchConfig.fire(reviveIShellLaunchConfig(result.resolvedShellLaunchConfig));

			const startResult = await this._remoteTerminalChannel.startTerminalProcess(this._persistentProcessId);

			if (typeof startResult !== 'undefined') {
				// An error occurred
				return startResult;
			}
		} else {
			this._persistentProcessId = this._shellLaunchConfig.attachPersistentProcess.id;
			this._onProcessReady.fire({ pid: this._shellLaunchConfig.attachPersistentProcess.pid, cwd: this._shellLaunchConfig.attachPersistentProcess.cwd });
			this.setupTerminalEventListener();

			setTimeout(() => {
				this._onProcessTitleChanged.fire(this._shellLaunchConfig.attachPersistentProcess!.title);
			}, 0);
		}

		this._startBarrier.open();
		return undefined;
	}

	public shutdown(immediate: boolean): void {
		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.shutdownTerminalProcess(this._persistentProcessId, immediate);
		});
	}

	public input(data: string): void {
		if (this._inReplay) {
			return;
		}

		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.sendInputToTerminalProcess(this._persistentProcessId, data);
		});
	}

	private setupTerminalEventListener(): void {
		this._register(this._remoteTerminalChannel.onTerminalProcessEvent(this._persistentProcessId)(event => {
			switch (event.type) {
				case 'ready':
					return this._onProcessReady.fire({ pid: event.pid, cwd: event.cwd });
				case 'titleChanged':
					return this._onProcessTitleChanged.fire(event.title);
				case 'data':
					return this._onProcessData.fire({ data: event.data, sync: false });
				case 'replay': {
					try {
						this._inReplay = true;

						for (const e of event.events) {
							if (e.cols !== 0 || e.rows !== 0) {
								// never override with 0x0 as that is a marker for an unknown initial size
								this._onProcessOverrideDimensions.fire({ cols: e.cols, rows: e.rows, forceExactSize: true });
							}
							this._onProcessData.fire({ data: e.data, sync: true });
						}
					} finally {
						this._inReplay = false;
					}

					// remove size override
					this._onProcessOverrideDimensions.fire(undefined);

					return;
				}
				case 'exit':
					return this._onProcessExit.fire(event.exitCode);
				case 'execCommand':
					return this._execCommand(event);
				case 'orphan?': {
					this._remoteTerminalChannel.orphanQuestionReply(this._persistentProcessId);
					return;
				}
			}
		}));
	}

	public resize(cols: number, rows: number): void {
		if (this._inReplay) {
			return;
		}
		this._startBarrier.wait().then(_ => {

			this._remoteTerminalChannel.resizeTerminalProcess(this._persistentProcessId, cols, rows);
		});
	}

	public acknowledgeDataEvent(charCount: number): void {
		// Support flow control for server spawned processes
		if (this._inReplay) {
			return;
		}

		this._startBarrier.wait().then(_ => {
			this._remoteTerminalChannel.sendCharCountToTerminalProcess(this._persistentProcessId, charCount);
		});
	}

	public async getInitialCwd(): Promise<string> {
		await this._startBarrier.wait();
		return this._remoteTerminalChannel.getTerminalInitialCwd(this._persistentProcessId);
	}

	public async getCwd(): Promise<string> {
		await this._startBarrier.wait();
		return this._remoteTerminalChannel.getTerminalCwd(this._persistentProcessId);
	}

	/**
	 * TODO@roblourens I don't think this does anything useful in the EH and the value isn't used
	 */
	public async getLatency(): Promise<number> {
		return 0;
	}

	private async _execCommand(event: IRemoteTerminalProcessExecCommandEvent): Promise<void> {
		const reqId = event.reqId;
		const commandArgs = event.commandArgs.map(arg => revive(arg));
		try {
			const result = await this._commandService.executeCommand(event.commandId, ...commandArgs);
			this._remoteTerminalChannel.sendCommandResultToTerminalProcess(this._persistentProcessId, reqId, false, result);
		} catch (err) {
			this._remoteTerminalChannel.sendCommandResultToTerminalProcess(this._persistentProcessId, reqId, true, err);
		}
	}
}

function reviveIShellLaunchConfig(dto: IShellLaunchConfigDto): IShellLaunchConfig {
	return {
		name: dto.name,
		executable: dto.executable,
		args: dto.args,
		cwd: (
			(typeof dto.cwd === 'string' || typeof dto.cwd === 'undefined')
				? dto.cwd
				: URI.revive(dto.cwd)
		),
		env: dto.env,
		hideFromUser: dto.hideFromUser
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IShellLaunchConfig, ITerminalChildProcess, ITerminalsLayoutInfo, ITerminalsLayoutInfoById } from 'vs/platform/terminal/common/terminal';
import { RemotePty } from 'vs/workbench/contrib/terminal/browser/remotePty';
import { IRemoteTerminalService, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IShellLaunchConfigDto, RemoteTerminalChannelClient, REMOTE_TERMINAL_CHANNEL_NAME } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { IRemoteTerminalAttachTarget, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class RemoteTerminalService extends Disposable implements IRemoteTerminalService {
	public _serviceBrand: undefined;

	private readonly _ptys: Map<number, RemotePty> = new Map();

	private readonly _remoteTerminalChannel: RemoteTerminalChannelClient | null;
	private _hasConnectedToRemote = false;

	constructor(
		@ITerminalInstanceService readonly terminalInstanceService: ITerminalInstanceService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService
	) {
		super();

		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			this._remoteTerminalChannel = this._instantiationService.createInstance(RemoteTerminalChannelClient, connection.remoteAuthority, connection.getChannel(REMOTE_TERMINAL_CHANNEL_NAME));

			this._remoteTerminalChannel.onProcessData(e => {
				console.log('onProcessData', e);
				this._ptys.get(e.id)?.handleData(e.event);
			});
			this._remoteTerminalChannel.onProcessExit(e => {
				const pty = this._ptys.get(e.id);
				if (pty) {
					pty.handleExit(e.event);
					this._ptys.delete(e.id);
				}
			});
			this._remoteTerminalChannel.onProcessReady(e => {
				console.log('onProcessReady', e);
				this._ptys.get(e.id)?.handleReady(e.event);
			});
			this._remoteTerminalChannel.onProcessTitleChanged(e => this._ptys.get(e.id)?.handleTitleChanged(e.event));
			this._remoteTerminalChannel.onProcessOverrideDimensions(e => this._ptys.get(e.id)?.handleOverrideDimensions(e.event));
			this._remoteTerminalChannel.onProcessResolvedShellLaunchConfig(e => this._ptys.get(e.id)?.handleResolvedShellLaunchConfig(e.event));
			this._remoteTerminalChannel.onProcessReplay(e => this._ptys.get(e.id)?.handleReplay(e.event));
		} else {
			this._remoteTerminalChannel = null;
		}
	}

	public async createRemoteTerminalProcess(shellLaunchConfig: IShellLaunchConfig, activeWorkspaceRootUri: URI | undefined, cols: number, rows: number, shouldPersist: boolean, configHelper: ITerminalConfigHelper): Promise<ITerminalChildProcess> {
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


		const shellLaunchConfigDto: IShellLaunchConfigDto = {
			name: shellLaunchConfig.name,
			executable: shellLaunchConfig.executable,
			args: shellLaunchConfig.args,
			cwd: shellLaunchConfig.cwd,
			env: shellLaunchConfig.env
		};
		// TODO: Fix workspace shell permissions
		const isWorkspaceShellAllowed = false;//this._configHelper.checkWorkspaceShellPermissions(env.os);
		const result = await this._remoteTerminalChannel.createTerminalProcess(
			shellLaunchConfigDto,
			activeWorkspaceRootUri,
			shouldPersist,
			cols,
			rows,
			isWorkspaceShellAllowed,
		);
		// const id = await this._remoteTerminalChannel.createTerminalProcess(shellLaunchConfig, cwd, cols, rows, env, processEnv as IProcessEnvironment, windowsEnableConpty, shouldPersist, this._getWorkspaceId(), this._getWorkspaceName());
		const pty = new RemotePty(result.persistentTerminalId, shouldPersist, isPreconnectionTerminal, this._remoteTerminalChannel, this._remoteAgentService, this._logService, this._commandService);
		this._ptys.set(result.persistentTerminalId, pty);
		return pty;
	}

	public async attachToProcess(persistentProcessId: number): Promise<ITerminalChildProcess | undefined> {
		if (!this._remoteTerminalChannel) {
			throw new Error(`Cannot create remote terminal when there is no remote!`);
		}

		// TODO: Only do this once
		let isPreconnectionTerminal = false;
		if (!this._hasConnectedToRemote) {
			isPreconnectionTerminal = true;
			this._remoteAgentService.getEnvironment().then(() => {
				this._hasConnectedToRemote = true;
			});
		}

		try {
			await this._remoteTerminalChannel.attachToProcess(persistentProcessId);
			const pty = new RemotePty(persistentProcessId, true, isPreconnectionTerminal, this._remoteTerminalChannel, this._remoteAgentService, this._logService, this._commandService);
			this._ptys.set(persistentProcessId, pty);
			return pty;
		} catch (e) {
			this._logService.trace(`Couldn't attach to process ${e.message}`);
		}
		return undefined;
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


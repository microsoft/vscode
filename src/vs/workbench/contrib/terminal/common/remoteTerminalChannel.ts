/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentVariableService, ISerializableEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { serializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';
import { ITerminalConfiguration, ITerminalEnvironment, ITerminalLaunchError, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { SideBySideEditor, EditorResourceAccessor } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Schemas } from 'vs/base/common/network';
import { ILabelService } from 'vs/platform/label/common/label';

export const REMOTE_TERMINAL_CHANNEL_NAME = 'remoteterminal';

export interface IShellLaunchConfigDto {
	name?: string;
	executable?: string;
	args?: string[] | string;
	cwd?: string | UriComponents;
	env?: { [key: string]: string | null; };
	hideFromUser?: boolean;
}

export interface ISingleTerminalConfiguration<T> {
	userValue: T | undefined;
	value: T | undefined;
	defaultValue: T | undefined;
}

export interface ICompleteTerminalConfiguration {
	'terminal.integrated.automationShell.windows': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.automationShell.osx': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.automationShell.linux': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.shell.windows': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.shell.osx': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.shell.linux': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.shellArgs.windows': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.shellArgs.osx': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.shellArgs.linux': ISingleTerminalConfiguration<string | string[]>;
	'terminal.integrated.env.windows': ISingleTerminalConfiguration<ITerminalEnvironment>;
	'terminal.integrated.env.osx': ISingleTerminalConfiguration<ITerminalEnvironment>;
	'terminal.integrated.env.linux': ISingleTerminalConfiguration<ITerminalEnvironment>;
	'terminal.integrated.inheritEnv': boolean;
	'terminal.integrated.cwd': string;
	'terminal.integrated.detectLocale': 'auto' | 'off' | 'on';
}

export type ITerminalEnvironmentVariableCollections = [string, ISerializableEnvironmentVariableCollection][];

export interface IWorkspaceFolderData {
	uri: UriComponents;
	name: string;
	index: number;
}

export interface ICreateTerminalProcessArguments {
	configuration: ICompleteTerminalConfiguration;
	resolvedVariables: { [name: string]: string; };
	envVariableCollections: ITerminalEnvironmentVariableCollections;
	shellLaunchConfig: IShellLaunchConfigDto;
	workspaceId: string;
	workspaceName: string;
	workspaceFolders: IWorkspaceFolderData[];
	activeWorkspaceFolder: IWorkspaceFolderData | null;
	activeFileResource: UriComponents | undefined;
	shouldPersistTerminal: boolean;
	cols: number;
	rows: number;
	isWorkspaceShellAllowed: boolean;
	resolverEnv: { [key: string]: string | null; } | undefined
}

export interface ICreateTerminalProcessResult {
	terminalId: number;
	resolvedShellLaunchConfig: IShellLaunchConfigDto;
}

export interface IStartTerminalProcessArguments {
	id: number;
}

export interface ISendInputToTerminalProcessArguments {
	id: number;
	data: string;
}

export interface IShutdownTerminalProcessArguments {
	id: number;
	immediate: boolean;
}

export interface IResizeTerminalProcessArguments {
	id: number;
	cols: number;
	rows: number;
}

export interface IGetTerminalInitialCwdArguments {
	id: number;
}

export interface IGetTerminalCwdArguments {
	id: number;
}

export interface ISendCommandResultToTerminalProcessArguments {
	id: number;
	reqId: number;
	isError: boolean;
	payload: any;
}

export interface IOrphanQuestionReplyArgs {
	id: number;
}

export interface IListTerminalsArgs {
	isInitialization: boolean;
}

export interface IRemoteTerminalDescriptionDto {
	id: number;
	pid: number;
	title: string;
	cwd: string;
	workspaceId: string;
	workspaceName: string;
}

export interface ITriggerTerminalDataReplayArguments {
	id: number;
}

export interface IRemoteTerminalProcessReadyEvent {
	type: 'ready';
	pid: number;
	cwd: string;
}
export interface IRemoteTerminalProcessTitleChangedEvent {
	type: 'titleChanged';
	title: string;
}
export interface IRemoteTerminalProcessDataEvent {
	type: 'data';
	data: string;
}
export interface ReplayEntry { cols: number; rows: number; data: string; }
export interface IRemoteTerminalProcessReplayEvent {
	type: 'replay';
	events: ReplayEntry[];
}
export interface IRemoteTerminalProcessExitEvent {
	type: 'exit';
	exitCode: number | undefined;
}
export interface IRemoteTerminalProcessExecCommandEvent {
	type: 'execCommand';
	reqId: number;
	commandId: string;
	commandArgs: any[];
}
export interface IRemoteTerminalProcessOrphanQuestionEvent {
	type: 'orphan?';
}
export type IRemoteTerminalProcessEvent = (
	IRemoteTerminalProcessReadyEvent
	| IRemoteTerminalProcessTitleChangedEvent
	| IRemoteTerminalProcessDataEvent
	| IRemoteTerminalProcessReplayEvent
	| IRemoteTerminalProcessExitEvent
	| IRemoteTerminalProcessExecCommandEvent
	| IRemoteTerminalProcessOrphanQuestionEvent
);

export interface IOnTerminalProcessEventArguments {
	id: number;
}

export class RemoteTerminalChannelClient {

	constructor(
		private readonly _remoteAuthority: string,
		private readonly _channel: IChannel,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationResolverService private readonly _resolverService: IConfigurationResolverService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService private readonly _logService: ILogService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	private _readSingleTerminalConfiguration<T>(key: string): ISingleTerminalConfiguration<T> {
		const result = this._configurationService.inspect<T>(key);
		return {
			userValue: result.userValue,
			value: result.value,
			defaultValue: result.defaultValue,
		};
	}

	public async createTerminalProcess(shellLaunchConfig: IShellLaunchConfigDto, activeWorkspaceRootUri: URI | undefined, shouldPersistTerminal: boolean, cols: number, rows: number, isWorkspaceShellAllowed: boolean): Promise<ICreateTerminalProcessResult> {
		const terminalConfig = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
		const configuration: ICompleteTerminalConfiguration = {
			'terminal.integrated.automationShell.windows': this._readSingleTerminalConfiguration('terminal.integrated.automationShell.windows'),
			'terminal.integrated.automationShell.osx': this._readSingleTerminalConfiguration('terminal.integrated.automationShell.osx'),
			'terminal.integrated.automationShell.linux': this._readSingleTerminalConfiguration('terminal.integrated.automationShell.linux'),
			'terminal.integrated.shell.windows': this._readSingleTerminalConfiguration('terminal.integrated.shell.windows'),
			'terminal.integrated.shell.osx': this._readSingleTerminalConfiguration('terminal.integrated.shell.osx'),
			'terminal.integrated.shell.linux': this._readSingleTerminalConfiguration('terminal.integrated.shell.linux'),
			'terminal.integrated.shellArgs.windows': this._readSingleTerminalConfiguration('terminal.integrated.shellArgs.windows'),
			'terminal.integrated.shellArgs.osx': this._readSingleTerminalConfiguration('terminal.integrated.shellArgs.osx'),
			'terminal.integrated.shellArgs.linux': this._readSingleTerminalConfiguration('terminal.integrated.shellArgs.linux'),
			'terminal.integrated.env.windows': this._readSingleTerminalConfiguration('terminal.integrated.env.windows'),
			'terminal.integrated.env.osx': this._readSingleTerminalConfiguration('terminal.integrated.env.osx'),
			'terminal.integrated.env.linux': this._readSingleTerminalConfiguration('terminal.integrated.env.linux'),
			'terminal.integrated.inheritEnv': terminalConfig.inheritEnv,
			'terminal.integrated.cwd': terminalConfig.cwd,
			'terminal.integrated.detectLocale': terminalConfig.detectLocale,
		};

		// We will use the resolver service to resolve all the variables in the config / launch config
		// But then we will keep only some variables, since the rest need to be resolved on the remote side
		const resolvedVariables = Object.create(null);
		const lastActiveWorkspace = activeWorkspaceRootUri ? withNullAsUndefined(this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
		let allResolvedVariables: Map<string, string> | undefined = undefined;
		try {
			allResolvedVariables = await this._resolverService.resolveWithInteraction(lastActiveWorkspace, {
				shellLaunchConfig,
				configuration
			});
		} catch (err) {
			this._logService.error(err);
		}
		if (allResolvedVariables) {
			for (const [name, value] of allResolvedVariables.entries()) {
				if (/^config:/.test(name) || name === 'selectedText' || name === 'lineNumber') {
					resolvedVariables[name] = value;
				}
			}
		}

		const envVariableCollections: ITerminalEnvironmentVariableCollections = [];
		for (const [k, v] of this._environmentVariableService.collections.entries()) {
			envVariableCollections.push([k, serializeEnvironmentVariableCollection(v.map)]);
		}

		const resolverResult = await this._remoteAuthorityResolverService.resolveAuthority(this._remoteAuthority);
		const resolverEnv = resolverResult.options && resolverResult.options.extensionHostEnv;

		const workspace = this._workspaceContextService.getWorkspace();
		const workspaceFolders = workspace.folders;
		const activeWorkspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) : null;

		const activeFileResource = EditorResourceAccessor.getOriginalUri(this._editorService.activeEditor, {
			supportSideBySide: SideBySideEditor.PRIMARY,
			filterByScheme: [Schemas.file, Schemas.userData, Schemas.vscodeRemote]
		});

		const args: ICreateTerminalProcessArguments = {
			configuration,
			resolvedVariables,
			envVariableCollections,
			shellLaunchConfig,
			workspaceId: workspace.id,
			workspaceName: this._labelService.getWorkspaceLabel(workspace),
			workspaceFolders,
			activeWorkspaceFolder,
			activeFileResource,
			shouldPersistTerminal,
			cols,
			rows,
			isWorkspaceShellAllowed,
			resolverEnv
		};
		return await this._channel.call<ICreateTerminalProcessResult>('$createTerminalProcess', args);
	}

	public async startTerminalProcess(terminalId: number): Promise<ITerminalLaunchError | void> {
		const args: IStartTerminalProcessArguments = {
			id: terminalId
		};
		return this._channel.call<ITerminalLaunchError | void>('$startTerminalProcess', args);
	}

	public onTerminalProcessEvent(terminalId: number): Event<IRemoteTerminalProcessEvent> {
		const args: IOnTerminalProcessEventArguments = {
			id: terminalId
		};
		return this._channel.listen<IRemoteTerminalProcessEvent>('$onTerminalProcessEvent', args);
	}

	public sendInputToTerminalProcess(id: number, data: string): Promise<void> {
		const args: ISendInputToTerminalProcessArguments = {
			id, data
		};
		return this._channel.call<void>('$sendInputToTerminalProcess', args);
	}

	public shutdownTerminalProcess(id: number, immediate: boolean): Promise<void> {
		const args: IShutdownTerminalProcessArguments = {
			id, immediate
		};
		return this._channel.call<void>('$shutdownTerminalProcess', args);
	}

	public resizeTerminalProcess(id: number, cols: number, rows: number): Promise<void> {
		const args: IResizeTerminalProcessArguments = {
			id, cols, rows
		};
		return this._channel.call<void>('$resizeTerminalProcess', args);
	}

	public getTerminalInitialCwd(id: number): Promise<string> {
		const args: IGetTerminalInitialCwdArguments = {
			id
		};
		return this._channel.call<string>('$getTerminalInitialCwd', args);
	}

	public getTerminalCwd(id: number): Promise<string> {
		const args: IGetTerminalCwdArguments = {
			id
		};
		return this._channel.call<string>('$getTerminalCwd', args);
	}

	public sendCommandResultToTerminalProcess(id: number, reqId: number, isError: boolean, payload: any): Promise<void> {
		const args: ISendCommandResultToTerminalProcessArguments = {
			id,
			reqId,
			isError,
			payload
		};
		return this._channel.call<void>('$sendCommandResultToTerminalProcess', args);
	}

	public orphanQuestionReply(id: number): Promise<void> {
		const args: IOrphanQuestionReplyArgs = {
			id
		};
		return this._channel.call<void>('$orphanQuestionReply', args);
	}

	public listTerminals(isInitialization: boolean): Promise<IRemoteTerminalDescriptionDto[]> {
		const args: IListTerminalsArgs = {
			isInitialization
		};
		return this._channel.call<IRemoteTerminalDescriptionDto[]>('$listTerminals', args);
	}
}

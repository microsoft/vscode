/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { IWorkbenchConfigurationService } from '../../../../services/configuration/common/configuration.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { serializeEnvironmentDescriptionMap, serializeEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariableShared.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { SideBySideEditor, EditorResourceAccessor } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEnvironmentVariableService } from '../environmentVariable.js';
import { IProcessDataEvent, IRequestResolveVariablesEvent, IShellLaunchConfigDto, ITerminalLaunchError, ITerminalProfile, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, TerminalIcon, IProcessProperty, ProcessPropertyType, IProcessPropertyMap, TitleEventSource, ISerializedTerminalState, IPtyHostController, ITerminalProcessOptions, IProcessReadyEvent, ITerminalLogService, IPtyHostLatencyMeasurement } from '../../../../../platform/terminal/common/terminal.js';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, ISetTerminalLayoutInfoArgs } from '../../../../../platform/terminal/common/terminalProcess.js';
import { IProcessEnvironment, OperatingSystem } from '../../../../../base/common/platform.js';
import { ICompleteTerminalConfiguration } from '../terminal.js';
import { IPtyHostProcessReplayEvent } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ISerializableEnvironmentDescriptionMap as ISerializableEnvironmentDescriptionMap, ISerializableEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariable.js';
import type * as performance from '../../../../../base/common/performance.js';
import { RemoteTerminalChannelEvent, RemoteTerminalChannelRequest } from './terminal.js';

export const REMOTE_TERMINAL_CHANNEL_NAME = 'remoteterminal';

export type ITerminalEnvironmentVariableCollections = [string, ISerializableEnvironmentVariableCollection, ISerializableEnvironmentDescriptionMap][];

export interface IWorkspaceFolderData {
	uri: UriComponents;
	name: string;
	index: number;
}

export interface ICreateTerminalProcessArguments {
	configuration: ICompleteTerminalConfiguration;
	resolvedVariables: { [name: string]: string };
	envVariableCollections: ITerminalEnvironmentVariableCollections;
	shellLaunchConfig: IShellLaunchConfigDto;
	workspaceId: string;
	workspaceName: string;
	workspaceFolders: IWorkspaceFolderData[];
	activeWorkspaceFolder: IWorkspaceFolderData | null;
	activeFileResource: UriComponents | undefined;
	shouldPersistTerminal: boolean;
	options: ITerminalProcessOptions;
	cols: number;
	rows: number;
	unicodeVersion: '6' | '11';
	resolverEnv: { [key: string]: string | null } | undefined;
}

export interface ICreateTerminalProcessResult {
	persistentTerminalId: number;
	resolvedShellLaunchConfig: IShellLaunchConfigDto;
}

export class RemoteTerminalChannelClient implements IPtyHostController {
	get onPtyHostExit(): Event<number> {
		return this._channel.listen<number>(RemoteTerminalChannelEvent.OnPtyHostExitEvent);
	}
	get onPtyHostStart(): Event<void> {
		return this._channel.listen<void>(RemoteTerminalChannelEvent.OnPtyHostStartEvent);
	}
	get onPtyHostUnresponsive(): Event<void> {
		return this._channel.listen<void>(RemoteTerminalChannelEvent.OnPtyHostUnresponsiveEvent);
	}
	get onPtyHostResponsive(): Event<void> {
		return this._channel.listen<void>(RemoteTerminalChannelEvent.OnPtyHostResponsiveEvent);
	}
	get onPtyHostRequestResolveVariables(): Event<IRequestResolveVariablesEvent> {
		return this._channel.listen<IRequestResolveVariablesEvent>(RemoteTerminalChannelEvent.OnPtyHostRequestResolveVariablesEvent);
	}
	get onProcessData(): Event<{ id: number; event: IProcessDataEvent | string }> {
		return this._channel.listen<{ id: number; event: IProcessDataEvent | string }>(RemoteTerminalChannelEvent.OnProcessDataEvent);
	}
	get onProcessExit(): Event<{ id: number; event: number | undefined }> {
		return this._channel.listen<{ id: number; event: number | undefined }>(RemoteTerminalChannelEvent.OnProcessExitEvent);
	}
	get onProcessReady(): Event<{ id: number; event: IProcessReadyEvent }> {
		return this._channel.listen<{ id: number; event: IProcessReadyEvent }>(RemoteTerminalChannelEvent.OnProcessReadyEvent);
	}
	get onProcessReplay(): Event<{ id: number; event: IPtyHostProcessReplayEvent }> {
		return this._channel.listen<{ id: number; event: IPtyHostProcessReplayEvent }>(RemoteTerminalChannelEvent.OnProcessReplayEvent);
	}
	get onProcessOrphanQuestion(): Event<{ id: number }> {
		return this._channel.listen<{ id: number }>(RemoteTerminalChannelEvent.OnProcessOrphanQuestion);
	}
	get onExecuteCommand(): Event<{ reqId: number; persistentProcessId: number; commandId: string; commandArgs: any[] }> {
		return this._channel.listen<{ reqId: number; persistentProcessId: number; commandId: string; commandArgs: any[] }>(RemoteTerminalChannelEvent.OnExecuteCommand);
	}
	get onDidRequestDetach(): Event<{ requestId: number; workspaceId: string; instanceId: number }> {
		return this._channel.listen<{ requestId: number; workspaceId: string; instanceId: number }>(RemoteTerminalChannelEvent.OnDidRequestDetach);
	}
	get onDidChangeProperty(): Event<{ id: number; property: IProcessProperty<any> }> {
		return this._channel.listen<{ id: number; property: IProcessProperty<any> }>(RemoteTerminalChannelEvent.OnDidChangeProperty);
	}

	constructor(
		private readonly _remoteAuthority: string,
		private readonly _channel: IChannel,
		@IWorkbenchConfigurationService private readonly _configurationService: IWorkbenchConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationResolverService private readonly _resolverService: IConfigurationResolverService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	restartPtyHost(): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.RestartPtyHost, []);
	}

	async createProcess(
		shellLaunchConfig: IShellLaunchConfigDto,
		configuration: ICompleteTerminalConfiguration,
		activeWorkspaceRootUri: URI | undefined,
		options: ITerminalProcessOptions,
		shouldPersistTerminal: boolean,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11'
	): Promise<ICreateTerminalProcessResult> {
		// Be sure to first wait for the remote configuration
		await this._configurationService.whenRemoteConfigurationLoaded();

		// We will use the resolver service to resolve all the variables in the config / launch config
		// But then we will keep only some variables, since the rest need to be resolved on the remote side
		const resolvedVariables = Object.create(null);
		const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
		let allResolvedVariables: Map<string, string> | undefined = undefined;
		try {
			allResolvedVariables = (await this._resolverService.resolveAnyMap(lastActiveWorkspace, {
				shellLaunchConfig,
				configuration
			})).resolvedVariables;
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
			envVariableCollections.push([k, serializeEnvironmentVariableCollection(v.map), serializeEnvironmentDescriptionMap(v.descriptionMap)]);
		}

		const resolverResult = await this._remoteAuthorityResolverService.resolveAuthority(this._remoteAuthority);
		const resolverEnv = resolverResult.options && resolverResult.options.extensionHostEnv;

		const workspace = this._workspaceContextService.getWorkspace();
		const workspaceFolders = workspace.folders;
		const activeWorkspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) : null;

		const activeFileResource = EditorResourceAccessor.getOriginalUri(this._editorService.activeEditor, {
			supportSideBySide: SideBySideEditor.PRIMARY,
			filterByScheme: [Schemas.file, Schemas.vscodeUserData, Schemas.vscodeRemote]
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
			options,
			cols,
			rows,
			unicodeVersion,
			resolverEnv
		};
		return await this._channel.call<ICreateTerminalProcessResult>(RemoteTerminalChannelRequest.CreateProcess, args);
	}

	requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		return this._channel.call(RemoteTerminalChannelRequest.RequestDetachInstance, [workspaceId, instanceId]);
	}
	acceptDetachInstanceReply(requestId: number, persistentProcessId: number): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.AcceptDetachInstanceReply, [requestId, persistentProcessId]);
	}
	attachToProcess(id: number): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.AttachToProcess, [id]);
	}
	detachFromProcess(id: number, forcePersist?: boolean): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.DetachFromProcess, [id, forcePersist]);
	}
	listProcesses(): Promise<IProcessDetails[]> {
		return this._channel.call(RemoteTerminalChannelRequest.ListProcesses);
	}
	getLatency(): Promise<IPtyHostLatencyMeasurement[]> {
		return this._channel.call(RemoteTerminalChannelRequest.GetLatency);
	}
	getPerformanceMarks(): Promise<performance.PerformanceMark[]> {
		return this._channel.call(RemoteTerminalChannelRequest.GetPerformanceMarks);
	}
	reduceConnectionGraceTime(): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.ReduceConnectionGraceTime);
	}
	processBinary(id: number, data: string): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.ProcessBinary, [id, data]);
	}
	start(id: number): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined> {
		return this._channel.call(RemoteTerminalChannelRequest.Start, [id]);
	}
	input(id: number, data: string): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.Input, [id, data]);
	}
	acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.AcknowledgeDataEvent, [id, charCount]);
	}
	setUnicodeVersion(id: number, version: '6' | '11'): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.SetUnicodeVersion, [id, version]);
	}
	shutdown(id: number, immediate: boolean): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.Shutdown, [id, immediate]);
	}
	resize(id: number, cols: number, rows: number): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.Resize, [id, cols, rows]);
	}
	clearBuffer(id: number): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.ClearBuffer, [id]);
	}
	getInitialCwd(id: number): Promise<string> {
		return this._channel.call(RemoteTerminalChannelRequest.GetInitialCwd, [id]);
	}
	getCwd(id: number): Promise<string> {
		return this._channel.call(RemoteTerminalChannelRequest.GetCwd, [id]);
	}
	orphanQuestionReply(id: number): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.OrphanQuestionReply, [id]);
	}
	sendCommandResult(reqId: number, isError: boolean, payload: any): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.SendCommandResult, [reqId, isError, payload]);
	}
	freePortKillProcess(port: string): Promise<{ port: string; processId: string }> {
		return this._channel.call(RemoteTerminalChannelRequest.FreePortKillProcess, [port]);
	}
	getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string> {
		return this._channel.call(RemoteTerminalChannelRequest.GetDefaultSystemShell, [osOverride]);
	}
	getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return this._channel.call(RemoteTerminalChannelRequest.GetProfiles, [this._workspaceContextService.getWorkspace().id, profiles, defaultProfile, includeDetectedProfiles]);
	}
	acceptPtyHostResolvedVariables(requestId: number, resolved: string[]): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.AcceptPtyHostResolvedVariables, [requestId, resolved]);
	}

	getEnvironment(): Promise<IProcessEnvironment> {
		return this._channel.call(RemoteTerminalChannelRequest.GetEnvironment);
	}

	getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string> {
		return this._channel.call(RemoteTerminalChannelRequest.GetWslPath, [original, direction]);
	}

	setTerminalLayoutInfo(layout?: ITerminalsLayoutInfoById): Promise<void> {
		const workspace = this._workspaceContextService.getWorkspace();
		const args: ISetTerminalLayoutInfoArgs = {
			workspaceId: workspace.id,
			tabs: layout ? layout.tabs : []
		};
		return this._channel.call<void>(RemoteTerminalChannelRequest.SetTerminalLayoutInfo, args);
	}

	updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<string> {
		return this._channel.call(RemoteTerminalChannelRequest.UpdateTitle, [id, title, titleSource]);
	}

	updateIcon(id: number, userInitiated: boolean, icon: TerminalIcon, color?: string): Promise<string> {
		return this._channel.call(RemoteTerminalChannelRequest.UpdateIcon, [id, userInitiated, icon, color]);
	}

	refreshProperty<T extends ProcessPropertyType>(id: number, property: T): Promise<IProcessPropertyMap[T]> {
		return this._channel.call(RemoteTerminalChannelRequest.RefreshProperty, [id, property]);
	}

	updateProperty<T extends ProcessPropertyType>(id: number, property: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.UpdateProperty, [id, property, value]);
	}

	getTerminalLayoutInfo(): Promise<ITerminalsLayoutInfo | undefined> {
		const workspace = this._workspaceContextService.getWorkspace();
		const args: IGetTerminalLayoutInfoArgs = {
			workspaceId: workspace.id,
		};
		return this._channel.call<ITerminalsLayoutInfo>(RemoteTerminalChannelRequest.GetTerminalLayoutInfo, args);
	}

	reviveTerminalProcesses(workspaceId: string, state: ISerializedTerminalState[], dateTimeFormatLocate: string): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.ReviveTerminalProcesses, [workspaceId, state, dateTimeFormatLocate]);
	}

	getRevivedPtyNewId(id: number): Promise<number | undefined> {
		return this._channel.call(RemoteTerminalChannelRequest.GetRevivedPtyNewId, [id]);
	}

	serializeTerminalState(ids: number[]): Promise<string> {
		return this._channel.call(RemoteTerminalChannelRequest.SerializeTerminalState, [ids]);
	}

	// #region Pty service contribution RPC calls

	installAutoReply(match: string, reply: string): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.InstallAutoReply, [match, reply]);
	}
	uninstallAllAutoReplies(): Promise<void> {
		return this._channel.call(RemoteTerminalChannelRequest.UninstallAllAutoReplies, []);
	}

	// #endregion
}

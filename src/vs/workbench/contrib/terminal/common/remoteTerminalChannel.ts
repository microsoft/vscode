/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { serializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { SideBySideEditor, EditorResourceAccessor } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Schemas } from 'vs/base/common/network';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEnvironmentVariableService, ISerializableEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IProcessDataEvent, IRequestResolveVariablesEvent, IShellLaunchConfigDto, ITerminalLaunchError, ITerminalProfile, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, TerminalIcon, IProcessProperty, ProcessPropertyType, IProcessPropertyMap, TitleEventSource, ISerializedTerminalState, IPtyHostController, ITerminalProcessOptions } from 'vs/platform/terminal/common/terminal';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, ISetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';
import { IProcessEnvironment, OperatingSystem } from 'vs/base/common/platform';
import { ICompleteTerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { IPtyHostProcessReplayEvent } from 'vs/platform/terminal/common/capabilities/capabilities';

export const REMOTE_TERMINAL_CHANNEL_NAME = 'remoteterminal';

export type ITerminalEnvironmentVariableCollections = [string, ISerializableEnvironmentVariableCollection][];

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
		return this._channel.listen<number>('$onPtyHostExitEvent');
	}
	get onPtyHostStart(): Event<void> {
		return this._channel.listen<void>('$onPtyHostStartEvent');
	}
	get onPtyHostUnresponsive(): Event<void> {
		return this._channel.listen<void>('$onPtyHostUnresponsiveEvent');
	}
	get onPtyHostResponsive(): Event<void> {
		return this._channel.listen<void>('$onPtyHostResponsiveEvent');
	}
	get onPtyHostRequestResolveVariables(): Event<IRequestResolveVariablesEvent> {
		return this._channel.listen<IRequestResolveVariablesEvent>('$onPtyHostRequestResolveVariablesEvent');
	}
	get onProcessData(): Event<{ id: number; event: IProcessDataEvent | string }> {
		return this._channel.listen<{ id: number; event: IProcessDataEvent | string }>('$onProcessDataEvent');
	}
	get onProcessExit(): Event<{ id: number; event: number | undefined }> {
		return this._channel.listen<{ id: number; event: number | undefined }>('$onProcessExitEvent');
	}
	get onProcessReady(): Event<{ id: number; event: { pid: number; cwd: string; requireWindowsMode?: boolean } }> {
		return this._channel.listen<{ id: number; event: { pid: number; cwd: string; requiresWindowsMode?: boolean } }>('$onProcessReadyEvent');
	}
	get onProcessReplay(): Event<{ id: number; event: IPtyHostProcessReplayEvent }> {
		return this._channel.listen<{ id: number; event: IPtyHostProcessReplayEvent }>('$onProcessReplayEvent');
	}
	get onProcessOrphanQuestion(): Event<{ id: number }> {
		return this._channel.listen<{ id: number }>('$onProcessOrphanQuestion');
	}
	get onExecuteCommand(): Event<{ reqId: number; persistentProcessId: number; commandId: string; commandArgs: any[] }> {
		return this._channel.listen<{ reqId: number; persistentProcessId: number; commandId: string; commandArgs: any[] }>('$onExecuteCommand');
	}
	get onDidRequestDetach(): Event<{ requestId: number; workspaceId: string; instanceId: number }> {
		return this._channel.listen<{ requestId: number; workspaceId: string; instanceId: number }>('$onDidRequestDetach');
	}
	get onDidChangeProperty(): Event<{ id: number; property: IProcessProperty<any> }> {
		return this._channel.listen<{ id: number; property: IProcessProperty<any> }>('$onDidChangeProperty');
	}

	constructor(
		private readonly _remoteAuthority: string,
		private readonly _channel: IChannel,
		@IWorkbenchConfigurationService private readonly _configurationService: IWorkbenchConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationResolverService private readonly _resolverService: IConfigurationResolverService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService private readonly _logService: ILogService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	restartPtyHost(): Promise<void> {
		return this._channel.call('$restartPtyHost', []);
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
		const lastActiveWorkspace = activeWorkspaceRootUri ? withNullAsUndefined(this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
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
			envVariableCollections.push([k, serializeEnvironmentVariableCollection(v.map)]);
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
		return await this._channel.call<ICreateTerminalProcessResult>('$createProcess', args);
	}

	requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
		return this._channel.call('$requestDetachInstance', [workspaceId, instanceId]);
	}
	acceptDetachInstanceReply(requestId: number, persistentProcessId: number): Promise<void> {
		return this._channel.call('$acceptDetachInstanceReply', [requestId, persistentProcessId]);
	}
	attachToProcess(id: number): Promise<void> {
		return this._channel.call('$attachToProcess', [id]);
	}
	detachFromProcess(id: number, forcePersist?: boolean): Promise<void> {
		return this._channel.call('$detachFromProcess', [id, forcePersist]);
	}
	listProcesses(): Promise<IProcessDetails[]> {
		return this._channel.call('$listProcesses');
	}
	reduceConnectionGraceTime(): Promise<void> {
		return this._channel.call('$reduceConnectionGraceTime');
	}
	processBinary(id: number, data: string): Promise<void> {
		return this._channel.call('$processBinary', [id, data]);
	}
	start(id: number): Promise<ITerminalLaunchError | void> {
		return this._channel.call('$start', [id]);
	}
	input(id: number, data: string): Promise<void> {
		return this._channel.call('$input', [id, data]);
	}
	acknowledgeDataEvent(id: number, charCount: number): Promise<void> {
		return this._channel.call('$acknowledgeDataEvent', [id, charCount]);
	}
	setUnicodeVersion(id: number, version: '6' | '11'): Promise<void> {
		return this._channel.call('$setUnicodeVersion', [id, version]);
	}
	shutdown(id: number, immediate: boolean): Promise<void> {
		return this._channel.call('$shutdown', [id, immediate]);
	}
	resize(id: number, cols: number, rows: number): Promise<void> {
		return this._channel.call('$resize', [id, cols, rows]);
	}
	getInitialCwd(id: number): Promise<string> {
		return this._channel.call('$getInitialCwd', [id]);
	}
	getCwd(id: number): Promise<string> {
		return this._channel.call('$getCwd', [id]);
	}
	orphanQuestionReply(id: number): Promise<void> {
		return this._channel.call('$orphanQuestionReply', [id]);
	}
	sendCommandResult(reqId: number, isError: boolean, payload: any): Promise<void> {
		return this._channel.call('$sendCommandResult', [reqId, isError, payload]);
	}

	installAutoReply(match: string, reply: string): Promise<void> {
		return this._channel.call('$installAutoReply', [match, reply]);
	}
	uninstallAllAutoReplies(): Promise<void> {
		return this._channel.call('$uninstallAllAutoReplies', []);
	}
	getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string> {
		return this._channel.call('$getDefaultSystemShell', [osOverride]);
	}
	getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return this._channel.call('$getProfiles', [this._workspaceContextService.getWorkspace().id, profiles, defaultProfile, includeDetectedProfiles]);
	}
	acceptPtyHostResolvedVariables(requestId: number, resolved: string[]): Promise<void> {
		return this._channel.call('$acceptPtyHostResolvedVariables', [requestId, resolved]);
	}

	getEnvironment(): Promise<IProcessEnvironment> {
		return this._channel.call('$getEnvironment');
	}

	getWslPath(original: string): Promise<string> {
		return this._channel.call('$getWslPath', [original]);
	}

	setTerminalLayoutInfo(layout?: ITerminalsLayoutInfoById): Promise<void> {
		const workspace = this._workspaceContextService.getWorkspace();
		const args: ISetTerminalLayoutInfoArgs = {
			workspaceId: workspace.id,
			tabs: layout ? layout.tabs : []
		};
		return this._channel.call<void>('$setTerminalLayoutInfo', args);
	}

	updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<string> {
		return this._channel.call('$updateTitle', [id, title, titleSource]);
	}

	updateIcon(id: number, icon: TerminalIcon, color?: string): Promise<string> {
		return this._channel.call('$updateIcon', [id, icon, color]);
	}

	refreshProperty<T extends ProcessPropertyType>(id: number, property: T): Promise<IProcessPropertyMap[T]> {
		return this._channel.call('$refreshProperty', [id, property]);
	}

	updateProperty<T extends ProcessPropertyType>(id: number, property: T, value: IProcessPropertyMap[T]): Promise<void> {
		return this._channel.call('$updateProperty', [id, property, value]);
	}

	getTerminalLayoutInfo(): Promise<ITerminalsLayoutInfo | undefined> {
		const workspace = this._workspaceContextService.getWorkspace();
		const args: IGetTerminalLayoutInfoArgs = {
			workspaceId: workspace.id,
		};
		return this._channel.call<ITerminalsLayoutInfo>('$getTerminalLayoutInfo', args);
	}

	reviveTerminalProcesses(state: ISerializedTerminalState[], dateTimeFormatLocate: string): Promise<void> {
		return this._channel.call('$reviveTerminalProcesses', [state, dateTimeFormatLocate]);
	}

	getRevivedPtyNewId(id: number): Promise<number | undefined> {
		return this._channel.call('$getRevivedPtyNewId', [id]);
	}

	serializeTerminalState(ids: number[]): Promise<string> {
		return this._channel.call('$serializeTerminalState', [ids]);
	}
}

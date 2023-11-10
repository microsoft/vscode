/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from 'vs/base/common/uri';
import { IShellLaunchConfigDto, ITerminalProcessOptions } from 'vs/platform/terminal/common/terminal';
import { ICompleteTerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { ISerializableEnvironmentDescriptionMap as ISerializableEnvironmentDescriptionMap, ISerializableEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';

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

export const enum RemoteTerminalChannelEvent {
	OnPtyHostExitEvent = '$onPtyHostExitEvent',
	OnPtyHostStartEvent = '$onPtyHostStartEvent',
	OnPtyHostUnresponsiveEvent = '$onPtyHostUnresponsiveEvent',
	OnPtyHostResponsiveEvent = '$onPtyHostResponsiveEvent',
	OnPtyHostRequestResolveVariablesEvent = '$onPtyHostRequestResolveVariablesEvent',
	OnProcessDataEvent = '$onProcessDataEvent',
	OnProcessReadyEvent = '$onProcessReadyEvent',
	OnProcessExitEvent = '$onProcessExitEvent',
	OnProcessReplayEvent = '$onProcessReplayEvent',
	OnProcessOrphanQuestion = '$onProcessOrphanQuestion',
	OnExecuteCommand = '$onExecuteCommand',
	OnDidRequestDetach = '$onDidRequestDetach',
	OnDidChangeProperty = '$onDidChangeProperty',
}

export const enum RemoteTerminalChannelRequest {
	RestartPtyHost = '$restartPtyHost',
	CreateProcess = '$createProcess',
	AttachToProcess = '$attachToProcess',
	DetachFromProcess = '$detachFromProcess',
	ListProcesses = '$listProcesses',
	GetLatency = '$getLatency',
	GetPerformanceMarks = '$getPerformanceMarks',
	OrphanQuestionReply = '$orphanQuestionReply',
	AcceptPtyHostResolvedVariables = '$acceptPtyHostResolvedVariables',
	Start = '$start',
	Input = '$input',
	AcknowledgeDataEvent = '$acknowledgeDataEvent',
	Shutdown = '$shutdown',
	Resize = '$resize',
	ClearBuffer = '$clearBuffer',
	GetInitialCwd = '$getInitialCwd',
	GetCwd = '$getCwd',
	ProcessBinary = '$processBinary',
	SendCommandResult = '$sendCommandResult',
	InstallAutoReply = '$installAutoReply',
	UninstallAllAutoReplies = '$uninstallAllAutoReplies',
	GetDefaultSystemShell = '$getDefaultSystemShell',
	GetProfiles = '$getProfiles',
	GetEnvironment = '$getEnvironment',
	GetWslPath = '$getWslPath',
	GetTerminalLayoutInfo = '$getTerminalLayoutInfo',
	SetTerminalLayoutInfo = '$setTerminalLayoutInfo',
	SerializeTerminalState = '$serializeTerminalState',
	ReviveTerminalProcesses = '$reviveTerminalProcesses',
	GetRevivedPtyNewId = '$getRevivedPtyNewId',
	SetUnicodeVersion = '$setUnicodeVersion',
	ReduceConnectionGraceTime = '$reduceConnectionGraceTime',
	UpdateIcon = '$updateIcon',
	UpdateTitle = '$updateTitle',
	UpdateProperty = '$updateProperty',
	RefreshProperty = '$refreshProperty',
	RequestDetachInstance = '$requestDetachInstance',
	AcceptDetachInstanceReply = '$acceptDetachInstanceReply',
	AcceptDetachedInstance = '$acceptDetachedInstance',
	FreePortKillProcess = '$freePortKillProcess',
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from 'vs/base/common/uri';
import { IRawTerminalTabLayoutInfo, ITerminalEnvironment, ITerminalTabLayoutInfoById } from 'vs/platform/terminal/common/terminal';
import { ISerializableEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';

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
	'terminal.flowControl': boolean;
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

export interface ISetTerminalLayoutInfoArgs {
	workspaceId: string;
	tabs: ITerminalTabLayoutInfoById[];
}

export interface IGetTerminalLayoutInfoArgs {
	workspaceId: string;
}

export interface IPtyHostDescriptionDto {
	id: number;
	pid: number;
	title: string;
	cwd: string;
	workspaceId: string;
	workspaceName: string;
	isOrphan: boolean;
}

export type ITerminalTabLayoutInfoDto = IRawTerminalTabLayoutInfo<IPtyHostDescriptionDto>;

export interface ITriggerTerminalDataReplayArguments {
	id: number;
}

export interface ISendCharCountToTerminalProcessArguments {
	id: number;
	charCount: number;
}

export interface IPtyHostProcessReadyEvent {
	type: 'ready';
	pid: number;
	cwd: string;
}
export interface IPtyHostProcessTitleChangedEvent {
	type: 'titleChanged';
	title: string;
}
export interface IPtyHostProcessDataEvent {
	type: 'data';
	data: string;
}
export interface ReplayEntry { cols: number; rows: number; data: string; }
export interface IPtyHostProcessReplayEvent {
	type: 'replay';
	events: ReplayEntry[];
}
export interface IPtyHostProcessExitEvent {
	type: 'exit';
	exitCode: number | undefined;
}
export interface IPtyHostProcessExecCommandEvent {
	type: 'execCommand';
	reqId: number;
	commandId: string;
	commandArgs?: any[];
}
export interface IPtyHostProcessOrphanQuestionEvent {
	type: 'orphan?';
}
export type IPtyHostProcessEvent = (
	IPtyHostProcessReadyEvent
	| IPtyHostProcessTitleChangedEvent
	| IPtyHostProcessDataEvent
	| IPtyHostProcessReplayEvent
	| IPtyHostProcessExitEvent
	| IPtyHostProcessExecCommandEvent
	| IPtyHostProcessOrphanQuestionEvent
);

export interface IOnTerminalProcessEventArguments {
	id: number;
}

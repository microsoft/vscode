/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import type { Dto } from 'vs/workbench/services/extensions/common/proxyIdentifier';

export interface ITaskDefinitionDTO {
	type: string;
	[name: string]: any;
}

export interface ITaskPresentationOptionsDTO {
	reveal?: number;
	echo?: boolean;
	focus?: boolean;
	panel?: number;
	showReuseMessage?: boolean;
	clear?: boolean;
	group?: string;
	close?: boolean;
}

export interface IRunOptionsDTO {
	reevaluateOnRerun?: boolean;
}

export interface IExecutionOptionsDTO {
	cwd?: string;
	env?: { [key: string]: string };
}

export interface IProcessExecutionOptionsDTO extends IExecutionOptionsDTO {
}

export interface IProcessExecutionDTO {
	process: string;
	args: string[];
	options?: IProcessExecutionOptionsDTO;
}

export interface IShellQuotingOptionsDTO {
	escape?: string | {
		escapeChar: string;
		charsToEscape: string;
	};
	strong?: string;
	weak?: string;
}

export interface IShellExecutionOptionsDTO extends IExecutionOptionsDTO {
	executable?: string;
	shellArgs?: string[];
	shellQuoting?: IShellQuotingOptionsDTO;
}

export interface IShellQuotedStringDTO {
	value: string;
	quoting: number;
}

export interface IShellExecutionDTO {
	commandLine?: string;
	command?: string | IShellQuotedStringDTO;
	args?: Array<string | IShellQuotedStringDTO>;
	options?: IShellExecutionOptionsDTO;
}

export interface ICustomExecutionDTO {
	customExecution: 'customExecution';
}

export interface ITaskSourceDTO {
	label: string;
	extensionId?: string;
	scope?: number | UriComponents;
	color?: string;
	icon?: string;
	hide?: boolean;
}

export interface ITaskHandleDTO {
	id: string;
	workspaceFolder: UriComponents | string;
}

export interface ITaskGroupDTO {
	isDefault?: boolean;
	_id: string;
}

export interface ITaskDTO {
	_id: string;
	name?: string;
	execution: IProcessExecutionDTO | IShellExecutionDTO | ICustomExecutionDTO | undefined;
	definition: ITaskDefinitionDTO;
	isBackground?: boolean;
	source: ITaskSourceDTO;
	group?: ITaskGroupDTO;
	detail?: string;
	presentationOptions?: ITaskPresentationOptionsDTO;
	problemMatchers: string[];
	hasDefinedMatchers: boolean;
	runOptions?: IRunOptionsDTO;
}

export interface ITaskSetDTO {
	tasks: ITaskDTO[];
	extension: Dto<IExtensionDescription>;
}

export interface ITaskExecutionDTO {
	id: string;
	task: ITaskDTO | undefined;
}

export interface ITaskProcessStartedDTO {
	id: string;
	processId: number;
}

export interface ITaskProcessEndedDTO {
	id: string;
	exitCode: number | undefined;
}


export interface ITaskFilterDTO {
	version?: string;
	type?: string;
}

export interface ITaskSystemInfoDTO {
	scheme: string;
	authority: string;
	platform: string;
}

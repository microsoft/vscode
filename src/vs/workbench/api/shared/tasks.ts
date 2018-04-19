/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { UriComponents } from 'vs/base/common/uri';

export interface TaskDefinitionDTO {
	type: string;
	[name: string]: any;
}

export interface TaskPresentationOptionsDTO {
	reveal?: number;
	echo?: boolean;
	focus?: boolean;
	panel?: number;
}

export interface ExecutionOptionsDTO {
	cwd?: string;
	env?: { [key: string]: string };
}

export interface ProcessExecutionOptionsDTO extends ExecutionOptionsDTO {
}

export interface ProcessExecutionDTO {
	process: string;
	args: string[];
	options?: ProcessExecutionOptionsDTO;
}

export interface ShellQuotingOptionsDTO {
	escape?: string | {
		escapeChar: string;
		charsToEscape: string;
	};
	strong?: string;
	weak?: string;
}

export interface ShellExecutionOptionsDTO extends ExecutionOptionsDTO {
	executable?: string;
	shellArgs?: string[];
	shellQuoting?: ShellQuotingOptionsDTO;
}

export interface ShellQuotedStringDTO {
	value: string;
	quoting: number;
}

export interface ShellExecutionDTO {
	commandLine?: string;
	command?: string | ShellQuotedStringDTO;
	args?: (string | ShellQuotedStringDTO)[];
	options?: ShellExecutionOptionsDTO;
}

export interface TaskSourceDTO {
	label: string;
	extensionId?: string;
	scope?: number | UriComponents;
}

export interface TaskHandleDTO {
	id: string;
	workspaceFolder: UriComponents;
}

export interface TaskDTO {
	_id: string;
	name: string;
	execution: ProcessExecutionDTO | ShellExecutionDTO;
	definition: TaskDefinitionDTO;
	isBackground: boolean;
	source: TaskSourceDTO;
	group?: string;
	presentationOptions: TaskPresentationOptionsDTO;
	problemMatchers: string[];
	hasDefinedMatchers: boolean;
}

export interface TaskExecutionDTO {
	id: string;
	task: TaskDTO;
}
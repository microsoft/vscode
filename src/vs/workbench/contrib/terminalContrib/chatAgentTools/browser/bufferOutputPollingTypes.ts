/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Task } from '../../../tasks/common/taskService.js';
import type { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import type { ILinkLocation } from './taskHelpers.js';

export interface IConfirmationPrompt {
	prompt: string;
	options: string[];
}

export interface IExecution {
	getOutput: () => string;
	isActive?: () => Promise<boolean>;
	task?: Task | Pick<Task, 'configurationProperties'>;
	instance: Pick<ITerminalInstance, 'sendText' | 'instanceId'>;
}

export interface IPollingResult {
	output: string;
	resources?: ILinkLocation[];
	modelOutputEvalResponse?: string;
	state: OutputMonitorState;
}

export enum OutputMonitorState {
	Initial = 'Initial',
	Idle = 'Idle',
	Polling = 'Polling',
	Prompting = 'Prompting',
	Timeout = 'Timeout',
	Active = 'Active',
	Cancelled = 'Cancelled',
}

export interface IRacePollingOrPromptResult {
	output: string;
	pollDurationMs?: number;
	modelOutputEvalResponse?: string;
	state: OutputMonitorState;
}

export const enum PollingConsts {
	MinNoDataEvents = 2, // Minimum number of no data checks before considering the terminal idle
	MinPollingDuration = 500,
	FirstPollingMaxDuration = 20000, // 20 seconds
	ExtendedPollingMaxDuration = 120000, // 2 minutes
	MaxPollingIntervalDuration = 2000, // 2 seconds
}

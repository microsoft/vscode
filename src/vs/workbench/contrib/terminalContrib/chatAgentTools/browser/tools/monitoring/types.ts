/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Task } from '../../../../../tasks/common/taskService.js';
import type { ITerminalInstance } from '../../../../../terminal/browser/terminal.js';
import type { ILinkLocation } from '../../taskHelpers.js';
import type { IMarker as XtermMarker } from '@xterm/xterm';

export interface IConfirmationPrompt {
	prompt: string;
	options: string[];
	descriptions?: string[];
	detectedRequestForFreeFormInput: boolean;
}

export interface IExecution {
	getOutput: (marker?: XtermMarker) => string;
	isActive?: () => Promise<boolean>;
	task?: Task | Pick<Task, 'configurationProperties'>;
	dependencyTasks?: Task[];
	instance: Pick<ITerminalInstance, 'sendText' | 'instanceId' | 'onDidInputData' | 'onDisposed' | 'onData' | 'focus' | 'registerMarker'>;
	sessionId: string | undefined;
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
	PollingForIdle = 'PollingForIdle',
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
	MinIdleEvents = 2, // Minimum number of idle checks before considering the terminal idle
	MinPollingDuration = 500,
	FirstPollingMaxDuration = 20000, // 20 seconds
	ExtendedPollingMaxDuration = 120000, // 2 minutes
	MaxPollingIntervalDuration = 2000, // 2 seconds
	MaxRecursionCount = 5
}

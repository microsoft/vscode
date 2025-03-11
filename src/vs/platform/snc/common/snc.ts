/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

export interface IVisualizationItem {
	line: number;
	visIndex: number; // within line
	runId: string;
	execution_step: number;
	html: string;
	model?: unknown;
	unhandledEvents?: UiEvent[];
	last_line_in_containing_loop?: number;
}

export type UiEvent = { line: number; visIndex: number, pythonEventStr: string, eventJSON: any };

export interface IProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface IProcessOptions {
	timeout?: number; // Optional timeout in milliseconds
	workingDirectory: string; // Required working directory for code execution
	modelsAndEventsJson?: string; // visualizers state, and events to apply
}

export type SNCStreamMessage =
	| { runId: string; type: 'item'; item: IVisualizationItem }
	| { runId: string; type: 'end'; result: IProcessResult }
	| { runId: string; type: 'error'; error: string };

export const ISNCProcessService = createDecorator<ISNCProcessService>('sncProcessService');

export interface ISNCProcessService {
	/**
	 * Streaming API: event that delivers incremental visualization items and completion.
	 * Listen via `channel.listen('onStream')` on the renderer side.
	 */
	readonly onStream: Event<SNCStreamMessage>;

	/**
	 * Start a streaming run. Use `runId` to correlate `onStream` messages.
	 * Returns when the child process is successfully spawned and stdin sent.
	 */
	startProgram(content: string, options: IProcessOptions, runId: string): Promise<void>;

	/**
	 * Cancel a streaming run by runId. No-op if already finished or not found.
	 */
	cancel(runId: string): Promise<void>;
}

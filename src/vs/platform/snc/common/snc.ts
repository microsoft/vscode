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
	syntaxError?: boolean;
}

export interface IProcessOptions {
	timeout?: number; // Optional timeout in milliseconds
	workingDirectory: string; // Required working directory for code execution
	modelsAndEventsJson?: string; // visualizers state, and events to apply
}

export type SNCCommand =
	| { type: 'NewCode'; code: string };

/**
 * Timing data for visualizer performance measurement.
 * All times are in milliseconds and relative to spawn time unless otherwise noted.
 */
export interface SNCTimingData {
	/** Backend timestamp (Date.now()) when spawn was called */
	spawnTimeMs: number;
	/** Time from spawn to stdin end (code sent) */
	spawnToStdinEndMs?: number;
	/** Time from spawn to first byte on stdout */
	spawnToStdoutFirstMs?: number;
	/** Time from spawn to first visualization item parsed */
	spawnToFirstItemMs?: number;
	/** Time from spawn to run completion */
	spawnToEndMs?: number;
}

export type SNCStreamMessage =
	| { runId: string; type: 'item'; item: IVisualizationItem }
	| { runId: string; type: 'command'; command: SNCCommand }
	| { runId: string; type: 'end'; result: IProcessResult; timing?: SNCTimingData }
	| { runId: string; type: 'spawn'; timing: SNCTimingData }
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

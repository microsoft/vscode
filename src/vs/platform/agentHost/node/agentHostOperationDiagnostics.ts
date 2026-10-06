/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../base/common/stopwatch.js';
import { type ILogger, LogLevel } from '../../log/common/log.js';

let nextOperationId = 0;

/** Traces asynchronous phase boundaries without logging arguments, results, or error contents. */
export function traceAgentHostOperation<T>(logService: ILogger | undefined, scope: string, phase: string, operation: () => Promise<T>): Promise<T> {
	if (!logService || logService.getLevel() !== LogLevel.Trace) {
		return operation();
	}
	const logger = logService;
	const operationId = `${process.pid}-${++nextOperationId}`;
	const stopwatch = StopWatch.create();
	const prefix = `[AgentHostOperation] scope=${scope} phase=${phase} operationId=${operationId}`;
	logger.trace(`${prefix} outcome=started`);
	return run();

	async function run(): Promise<T> {
		try {
			const result = await operation();
			logger.trace(`${prefix} outcome=succeeded durationMs=${stopwatch.elapsed()}`);
			return result;
		} catch (error) {
			logger.trace(`${prefix} outcome=failed durationMs=${stopwatch.elapsed()}`);
			throw error;
		}
	}
}

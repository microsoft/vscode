/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogEntryLike } from '../executionGraph.js';
import { Trace, TraceContext } from './trace.js';

/**
 * A minimal logger for tests that captures the active {@link Trace} at log
 * time so messages can later be woven into a swimlane diagram next to the
 * timer events that produced them.
 */
export interface ITraceLogger {
	log(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	/**
	 * Run `fn` synchronously and log it as a marker in the trace. The
	 * marker text is `fn.toString()` so call sites read naturally as e.g.
	 * `logger.logRun(() => model.trigger())`. Returns whatever `fn`
	 * returns.
	 */
	logRun<T>(fn: () => T): T;
}

/**
 * One log entry produced by an {@link ITraceLogger}. Extends
 * {@link LogEntryLike} (consumed by `buildHistoryFromTasks`) with a level so
 * renderers can differentiate `log` / `warn` / `error`.
 */
export interface ITraceLogEntry extends LogEntryLike {
	readonly trace: Trace;
	readonly level: 'log' | 'warn' | 'error';
}

/**
 * Build an {@link ITraceLogger} that pushes every call into `buffer`,
 * tagging each entry with the trace that's current at call time.
 *
 * Pass the same `buffer` to `buildHistoryFromTasks(history, startTime,
 * buffer)` to interleave log lines with the timer swimlane.
 */
export function createTraceLogger(buffer: ITraceLogEntry[]): ITraceLogger {
	const make = (level: 'log' | 'warn' | 'error') => (message: string) => {
		buffer.push({
			trace: TraceContext.instance.currentTrace(),
			level,
			message: level === 'log' ? message : `[${level}] ${message}`,
		});
	};
	const log = make('log');
	return {
		log,
		warn: make('warn'),
		error: make('error'),
		logRun<T>(fn: () => T): T {
			log(`run: ${_describeFn(fn)}`);
			return fn();
		},
	};
}

/** Best-effort one-line description of `fn` for trace log markers. */
function _describeFn(fn: () => unknown): string {
	const src = fn.toString();
	// Strip `() => ` / `function () {` wrappers so the body reads naturally.
	const arrow = src.match(/^\s*(?:async\s+)?\(\s*\)\s*=>\s*([\s\S]+?)\s*$/);
	if (arrow) { return _collapseWhitespace(arrow[1]); }
	const fnExpr = src.match(/^\s*(?:async\s+)?function\s*\w*\s*\(\s*\)\s*\{\s*([\s\S]+?)\s*\}\s*$/);
	if (fnExpr) { return _collapseWhitespace(fnExpr[1]); }
	return _collapseWhitespace(src);
}

function _collapseWhitespace(s: string): string {
	return s.replace(/\s+/g, ' ').trim();
}

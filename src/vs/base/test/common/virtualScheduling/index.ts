/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Greenfield virtual scheduling primitives.
//
// This folder is the new home for virtual-time scheduling. It supersedes
// `timeTravelScheduler.ts` and `traceableTimeApi.ts`, both of which are
// retained as @deprecated re-export shims.

export type { TimeApi } from './timeApi.js';
export { captureGlobalTimeApi, realTimeApi } from './timeApi.js';

export type { EventSource, VirtualEvent, VirtualTime } from './virtualClock.js';
export { VirtualClock } from './virtualClock.js';

export type { RunAsHandlerOptions } from './trace.js';
export { ROOT_TRACE, Trace, TraceContext, createTraceRoot } from './trace.js';

export type { Embedding } from './embedding.js';
export { drainMicrotasksEmbedding, nextMacrotask, syncEmbedding } from './embedding.js';

export type { RunOptions, TerminationPolicy, VirtualTimeProcessorOptions } from './processor.js';
export { VirtualTimeProcessor, untilIdle, untilTime, untilToken } from './processor.js';

export { pushGlobalTimeApi } from './globalTimeApi.js';
export type { CreateVirtualTimeApiOptions } from './virtualTimeApi.js';
export { createVirtualTimeApi } from './virtualTimeApi.js';
export { createLoggingTimeApi } from './loggingTimeApi.js';
export type { RecordedTimerEvent } from './recordingTimeApi.js';
export { createRecordingRealTimeApi } from './recordingTimeApi.js';
export type { ITraceLogEntry, ITraceLogger } from './traceLogger.js';
export { createTraceLogger } from './traceLogger.js';
export type { RunWithFakedTimersOptions } from './runWithFakedTimers.js';
export { runWithFakedTimers } from './runWithFakedTimers.js';

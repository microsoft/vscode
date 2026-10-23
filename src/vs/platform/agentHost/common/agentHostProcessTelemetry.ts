/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { packErrorForTelemetry } from '../../telemetry/common/errorTelemetry.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import type { IAgentHostProcessExitDiagnostics } from './agentHostProcessExit.js';
import { AgentHostLaunchKind } from './agentHostTelemetry.js';

export type AgentHostProcessErrorData = {
	hostLaunchKind: AgentHostLaunchKind;
	kind: 'unexpectedExit' | 'startFailed';
	code?: number;
	restartCount: number;
	willRestart: boolean;
	exitDiagnostics?: IAgentHostProcessExitDiagnostics;
};

type AgentHostProcessErrorEvent = Omit<AgentHostProcessErrorData, 'exitDiagnostics'> & {
	isError: true;
	callstack?: string;
	msg?: string;
	errorName?: string;
	errorCode?: string;
	exitReason?: string;
	uptimeMs?: number;
	fatalSignature?: string;
	exitPath?: string;
	exitCaller?: string;
	workingSetMb?: number;
	peakWorkingSetMb?: number;
	memorySampleAgeMs?: number;
};

type AgentHostProcessErrorClassification = {
	hostLaunchKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the agent host process was launched by the VS Code main process or VS Code CLI.' };
	kind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The kind of agent host process failure.' };
	code?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The agent host process exit code, when available.' };
	restartCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The number of agent host restart attempts before this failure.' };
	willRestart: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether VS Code will attempt to restart the agent host after this failure.' };
	isError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this is an error event.' };
	callstack?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The callstack of an agent host process start failure, or of the startup error that made the process exit.' };
	msg?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The message of an agent host process start failure, or of the startup error that made the process exit.' };
	errorName?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The name of the startup error that made the agent host process exit.' };
	errorCode?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The code of the startup error that made the agent host process exit, such as a file system or SQLite error code.' };
	exitReason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Electron\'s bounded reason for the process termination, such as crashed, oom, or killed, or none when Electron reported no crash or kill.' };
	uptimeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from agent host process spawn until exit.' };
	fatalSignature?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded fatal condition recognized in the final stderr output, such as a V8 heap out-of-memory error. The stderr text is not sent.' };
	exitPath?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the process exited through process.exit(), because its event loop drained, or abruptly without running Node exit handlers.' };
	exitCaller?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The package name, written as @scope:name for scoped packages, or VS Code module name that called process.exit(), without its path. Callers outside VS Code\'s installation and packages are reported as external.' };
	workingSetMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Agent host working set in megabytes at the most recent periodic memory sample before exit.' };
	peakWorkingSetMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Largest agent host working set in megabytes observed by periodic memory samples before exit.' };
	memorySampleAgeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds between the most recent agent host memory sample and the exit.' };
	owner: 'bryanchen-d';
	comment: 'Tracks agent host process failures that cannot be reported reliably from inside the agent host process.';
};

export function reportAgentHostProcessError(telemetryService: ITelemetryService, data: AgentHostProcessErrorData, error?: unknown): void {
	const { exitDiagnostics, ...processData } = data;
	const errorData = error === undefined ? undefined : packErrorForTelemetry(error);
	telemetryService.publicLogError2<AgentHostProcessErrorEvent, AgentHostProcessErrorClassification>('agentHost.processError', {
		...processData,
		isError: true,
		...(errorData ? { callstack: errorData.callstack, msg: errorData.msg } : {}),
		...(exitDiagnostics ? toExitDiagnosticsTelemetry(exitDiagnostics) : {}),
	});
}

function toExitDiagnosticsTelemetry(diagnostics: IAgentHostProcessExitDiagnostics): Partial<AgentHostProcessErrorEvent> {
	const startupFailure = diagnostics.startupFailure;
	const telemetry: Partial<AgentHostProcessErrorEvent> = {
		exitReason: diagnostics.reason,
		uptimeMs: diagnostics.uptimeMs,
		fatalSignature: diagnostics.fatalSignature,
		exitPath: diagnostics.exitPath,
		exitCaller: diagnostics.exitCaller,
		msg: startupFailure?.msg,
		callstack: startupFailure?.callstack,
		errorName: startupFailure?.name,
		errorCode: startupFailure?.code,
		workingSetMb: diagnostics.workingSetMb,
		peakWorkingSetMb: diagnostics.peakWorkingSetMb,
		memorySampleAgeMs: diagnostics.memorySampleAgeMs,
	};
	return Object.fromEntries(Object.entries(telemetry).filter(([, value]) => value !== undefined));
}

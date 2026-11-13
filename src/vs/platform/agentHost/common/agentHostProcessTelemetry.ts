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
	lastStartupPhase?: string;
	startupPhaseAgeMs?: number;
	heartbeatAgeMs?: number;
	heapUsedMb?: number;
	heapLimitMb?: number;
	externalMb?: number;
	arrayBuffersMb?: number;
	rssMb?: number;
	peakHeapUsedMb?: number;
	oomHeapMb?: number;
	activeTurns?: number;
	runningToolCalls?: number;
	loadedSessions?: number;
	connectedClients?: number;
	activity?: string;
	lastAction?: string;
	msSinceSuspend?: number;
	msSinceResume?: number;
	systemSuspended?: boolean;
	quitRequested?: boolean;
	lifecyclePhase?: number;
	windowCount?: number;
	agentsWindowConnected?: boolean;
	osSessionEnd?: string;
	msSinceOsSessionEnd?: number;
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
	lastStartupPhase?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The last bounded startup phase the agent host reported before exit, such as database or ready, or none when it reported no phase.' };
	startupPhaseAgeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds between the last startup phase report and the exit.' };
	heartbeatAgeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds between the last agent host heartbeat and the exit. The heartbeat fields below describe that heartbeat.' };
	heapUsedMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'V8 heap used by the agent host in megabytes at the last heartbeat.' };
	heapLimitMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'V8 heap size limit of the agent host in megabytes.' };
	externalMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Memory used by C++ objects bound to JavaScript objects in the agent host, in megabytes at the last heartbeat.' };
	arrayBuffersMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Memory used by ArrayBuffers and Buffers in the agent host, in megabytes at the last heartbeat.' };
	rssMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Resident set size of the agent host in megabytes at the last heartbeat.' };
	peakHeapUsedMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Largest V8 heap used by the agent host in megabytes across its heartbeats.' };
	oomHeapMb?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'V8 heap size in megabytes after the final garbage collection that V8 reported on stderr before a heap out-of-memory error.' };
	activeTurns?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of chats with an active turn at the last heartbeat.' };
	runningToolCalls?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of tool calls that had started and not completed at the last heartbeat.' };
	loadedSessions?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of sessions loaded in agent host memory at the last heartbeat.' };
	connectedClients?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of clients connected to the agent host protocol at the last heartbeat.' };
	activity?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded agent host activity at the last heartbeat: idle, turn, or tool with the kind of contributor of the most recently started running tool (host, client, or mcp).' };
	lastAction?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The protocol action type, such as chat:toolCallStart, most recently emitted before the last heartbeat.' };
	msSinceSuspend?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds between the most recent system suspend observed by the main process and the exit.' };
	msSinceResume?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds between the most recent system resume observed by the main process and the exit.' };
	systemSuspended?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the system was suspended or going to sleep when the agent host exited.' };
	quitRequested?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether VS Code was quitting when the agent host exited.' };
	lifecyclePhase?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The main process lifecycle phase when the agent host exited.' };
	windowCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of open windows when the agent host exited.' };
	agentsWindowConnected?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether an Agents window that requested a connection to the agent host was still open when the agent host exited, to attribute agent host exits to the Agents window.' };
	osSessionEnd?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Why the most recently observed operating system session end was happening (shutdown, logoff, closeApp, or critical), or none. The session end may have been cancelled; see msSinceOsSessionEnd.' };
	msSinceOsSessionEnd?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds between the most recently observed operating system session end and the exit.' };
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
		lastStartupPhase: diagnostics.lastStartupPhase ?? 'none',
		startupPhaseAgeMs: diagnostics.startupPhaseAgeMs,
		heartbeatAgeMs: diagnostics.heartbeatAgeMs,
		...diagnostics.heartbeat,
		peakHeapUsedMb: diagnostics.peakHeapUsedMb,
		oomHeapMb: diagnostics.oomHeapMb,
		...diagnostics.context,
	};
	return Object.fromEntries(Object.entries(telemetry).filter(([, value]) => value !== undefined));
}

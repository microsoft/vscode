/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload } from '@github/copilot-sdk';
import { getErrorCode } from '../../../../base/common/errors.js';
import type { URI } from '../../../../base/common/uri.js';
import { packErrorForTelemetry } from '../../../telemetry/common/errorTelemetry.js';
import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { toInitiatorTelemetry, type IAgentHostInitiatorClassification, type IAgentHostInitiatorTelemetry } from '../agentHostTelemetryReporter.js';

export type CopilotClientOperation = 'abort' | 'changeAgent' | 'changeModel' | 'getSessionMetadata' | 'listSessions' | 'modelRefresh' | 'resumeTurn' | 'sendMessage';
export type CopilotClientOperationFailureKind = 'clientNotConnected' | 'connectionClosed' | 'connectionDisposed' | 'runtimeConnectionClosed';
type CopilotClientStartupOutcome = 'success' | 'failure' | 'cancelled';
type CopilotStartupFailureCause = 'nativeModuleProcedureNotFound' | 'nativeModuleInitializationFailed' | 'nativeModuleNotFound' | 'permissionDenied' | 'timeout' | 'spawnFailed' | 'processExitedUnexpectedly' | 'processExited' | 'configurationChanged' | 'other';
type CopilotStartupFailureResource = 'runtime' | 'cliNative' | 'conpty' | 'sandbox' | 'other';

export class CopilotClientStartupConfigChangedError extends Error {
	constructor() {
		super('Copilot startup config changed while the client was starting');
		this.name = 'CopilotClientStartupConfigChangedError';
	}
}

export interface ICopilotFailureCorrelation extends IAgentHostInitiatorTelemetry {
	readonly agentSessionId?: string;
	readonly chatSessionId?: string;
	readonly turnId?: string;
	readonly sdkSessionId?: string;
}

type CopilotSessionFailureCorrelation = IAgentHostInitiatorTelemetry & {
	readonly agentSessionId: string;
	readonly chatSessionId: string;
	readonly turnId: string | undefined;
	readonly sdkSessionId: string;
};

export type CopilotModelCallEndpointTelemetryKind = 'anthropicMessages' | 'chatCompletions' | 'other' | 'responses' | 'responsesWebSocket';

const normalizedCopilotApiEndpointKinds = new Map<string, CopilotModelCallEndpointTelemetryKind>([
	['/chat/completions', 'chatCompletions'],
	['/responses', 'responses'],
	['/v1/messages', 'anthropicMessages'],
	['ws:/responses', 'responsesWebSocket'],
]);

export function normalizeCopilotApiEndpoint(endpoint: string | undefined): CopilotModelCallEndpointTelemetryKind | undefined {
	if (!endpoint) {
		return undefined;
	}

	const trimmedEndpoint = endpoint.trim();
	const directMatch = normalizedCopilotApiEndpointKinds.get(trimmedEndpoint.toLowerCase());
	if (directMatch) {
		return directMatch;
	}

	if (URL.canParse(trimmedEndpoint)) {
		const parsed = new URL(trimmedEndpoint);
		const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
		if ((parsed.protocol === 'ws:' || parsed.protocol === 'wss:') && normalizedPath === '/responses') {
			return 'responsesWebSocket';
		}
		return normalizedCopilotApiEndpointKinds.get(normalizedPath.toLowerCase()) ?? 'other';
	}

	return 'other';
}

export function createCopilotFailureCorrelation(sessionUri: URI, chatUri: URI, turnId: string | undefined, sdkSessionId: string, clientContext?: IAgentHostClientTelemetryContext): CopilotSessionFailureCorrelation {
	return {
		...toInitiatorTelemetry(clientContext),
		agentSessionId: AgentSession.id(sessionUri),
		chatSessionId: getTelemetryChatSessionId(chatUri),
		turnId: turnId || undefined,
		sdkSessionId,
	};
}

export function classifyCopilotClientOperationFailure(error: unknown): CopilotClientOperationFailureKind | undefined {
	if (!(error instanceof Error)) {
		return undefined;
	}
	switch (error.message) {
		case 'Client not connected':
			return 'clientNotConnected';
		case 'Connection is closed.':
			return 'connectionClosed';
		case 'Connection is disposed.':
			return 'connectionDisposed';
		case 'The in-process runtime connection is closed.':
			return 'runtimeConnectionClosed';
	}
	return undefined;
}

export function isRecognizedCopilotClientStartupFailure(error: unknown): boolean {
	return error instanceof Error && getCopilotStartupFailureCause(error) !== undefined;
}

type CopilotClientOperationFailureEvent = ICopilotFailureCorrelation & {
	clientFailureId: string;
	failureKind: CopilotClientOperationFailureKind;
	operation: CopilotClientOperation;
	activeTurnCount: number;
	recoveryStarted: boolean;
	errorName: string | undefined;
	errorCode: string | undefined;
	msg: string;
	callstack: string | undefined;
};

type CopilotClientOperationFailureClassification = IAgentHostInitiatorClassification & {
	clientFailureId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier shared by detections and recovery telemetry for one Copilot client failure episode.' };
	failureKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded category of Copilot client failure that was detected.' };
	operation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot provider operation that detected the client failure.' };
	agentSessionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host session identifier, when the failing operation targeted a session.' };
	chatSessionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host chat identifier, when the failing operation targeted a chat.' };
	turnId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host turn identifier, when available.' };
	sdkSessionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK session identifier, when available.' };
	activeTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The number of Copilot chats with an active turn when the client failure was detected.' };
	recoveryStarted: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this detection started client recovery instead of joining recovery already in progress.' };
	errorName: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The name of the client failure exception, when available.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The client failure exception or protocol error code, when available.' };
	msg: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The client failure message. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The client failure stack. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	owner: 'roblourens';
	comment: 'Tracks failures detected while operating an established Copilot client and whether recovery was started.';
};

type CopilotClientStartupEvent = {
	outcome: CopilotClientStartupOutcome;
	durationMs: number;
	attemptNumber: number;
	startupFailureCause?: CopilotStartupFailureCause;
	startupFailureResource?: CopilotStartupFailureResource;
	startupExitCode?: number;
};

type CopilotClientStartupClassification = {
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the startup attempt succeeded, failed, or was cancelled during shutdown.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock duration of the Copilot client startup attempt in milliseconds.' };
	attemptNumber: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'One-based Copilot client startup attempt number within this Agent Host process.' };
	startupFailureCause?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded cause of a failed Copilot client startup attempt.' };
	startupFailureResource?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded Copilot CLI resource involved in a failed startup attempt.' };
	startupExitCode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The Copilot CLI process exit code reported for a failed startup attempt.' };
	owner: 'roblourens';
	comment: 'Tracks one terminal outcome for every Copilot client startup attempt.';
};

function getCopilotStartupFailureCause(error: Error): CopilotStartupFailureCause | undefined {
	if (error instanceof CopilotClientStartupConfigChangedError) {
		return 'configurationChanged';
	}

	const message = error.message;
	const normalizedMessage = message.toLowerCase();
	if (normalizedMessage.includes('specified procedure could not be found')) {
		return 'nativeModuleProcedureNotFound';
	}
	if (normalizedMessage.includes('dynamic link library') && normalizedMessage.includes('initialization')) {
		return 'nativeModuleInitializationFailed';
	}
	if (normalizedMessage.includes('permission denied') || /\b(?:eacces|eperm)\b/.test(normalizedMessage)) {
		return 'permissionDenied';
	}
	if (normalizedMessage.includes('cannot find module')) {
		return 'nativeModuleNotFound';
	}
	if (message === 'Timeout waiting for CLI server to start') {
		return 'timeout';
	}
	if (message.startsWith('Failed to start CLI server:')) {
		return 'spawnFailed';
	}
	if (message.startsWith('CLI server exited unexpectedly with code ')) {
		return 'processExitedUnexpectedly';
	}
	if (message.startsWith('CLI server exited with code ')) {
		return 'processExited';
	}
	return undefined;
}

function getCopilotStartupFailureResource(message: string): CopilotStartupFailureResource {
	const normalizedMessage = message.toLowerCase();
	if (normalizedMessage.includes('cli-native')) {
		return 'cliNative';
	}
	if (normalizedMessage.includes('conpty')) {
		return 'conpty';
	}
	if (normalizedMessage.includes('runtime.node') || normalizedMessage.includes('runtime.win32') || normalizedMessage.includes('native addon "runtime"')) {
		return 'runtime';
	}
	if (normalizedMessage.includes('sandbox')
		|| normalizedMessage.includes('lxc-exec')
		|| normalizedMessage.includes('mxc-exec-mac')
		|| normalizedMessage.includes('wxc-exec.exe')) {
		return 'sandbox';
	}
	return 'other';
}

function getCopilotStartupFailureDetails(error: unknown): Pick<CopilotClientStartupEvent, 'startupFailureCause' | 'startupFailureResource' | 'startupExitCode'> {
	if (!(error instanceof Error)) {
		return {};
	}
	const startupFailureCause = getCopilotStartupFailureCause(error);
	if (!startupFailureCause) {
		return {};
	}

	const message = error.message;
	const exitCodeMatch = /^CLI server exited(?: unexpectedly)? with code (?<exitCode>\d+)/.exec(message);
	const parsedExitCode = exitCodeMatch?.groups?.exitCode === undefined ? undefined : Number(exitCodeMatch.groups.exitCode);

	return {
		startupFailureCause,
		startupFailureResource: getCopilotStartupFailureResource(message),
		startupExitCode: parsedExitCode !== undefined && Number.isSafeInteger(parsedExitCode) ? parsedExitCode : undefined,
	};
}

export function reportCopilotClientStartup(
	telemetryService: ITelemetryService,
	data: Omit<CopilotClientStartupEvent, 'startupFailureCause' | 'startupFailureResource' | 'startupExitCode'>,
	error?: unknown,
): void {
	let failureDetails: Pick<CopilotClientStartupEvent, 'startupFailureCause' | 'startupFailureResource' | 'startupExitCode'> = {};
	if (data.outcome === 'failure') {
		failureDetails = getCopilotStartupFailureDetails(error);
		if (!failureDetails.startupFailureCause) {
			failureDetails = {
				startupFailureCause: 'other',
				startupFailureResource: 'other',
			};
		}
	}
	telemetryService.publicLog2<CopilotClientStartupEvent, CopilotClientStartupClassification>('agentHost.copilotClientStartup', {
		...data,
		...failureDetails,
	});
}

export function reportCopilotClientOperationFailure(
	telemetryService: ITelemetryService,
	clientFailureId: string,
	failureKind: CopilotClientOperationFailureKind,
	operation: CopilotClientOperation,
	activeTurnCount: number,
	recoveryStarted: boolean,
	error: unknown,
	correlation?: ICopilotFailureCorrelation,
): void {
	const packed = packErrorForTelemetry(error);
	telemetryService.publicLogError2<CopilotClientOperationFailureEvent, CopilotClientOperationFailureClassification>('agentHost.copilotClientFailure', {
		clientFailureId,
		failureKind,
		operation,
		...correlation,
		activeTurnCount,
		recoveryStarted,
		errorName: error instanceof Error ? error.name : undefined,
		errorCode: getErrorCode(error),
		msg: packed.msg,
		callstack: packed.callstack,
	});
}

type CopilotClientRecoveryEvent = {
	clientFailureId: string;
	failureKind: CopilotClientOperationFailureKind;
	durationMs: number;
	failedTurnCount: number;
	stopSucceeded: boolean;
};

type CopilotClientRecoveryClassification = {
	clientFailureId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier shared by detections and recovery telemetry for one Copilot client failure episode.' };
	failureKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded category of Copilot client failure that initiated recovery.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds spent recovering the failed Copilot client.' };
	failedTurnCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of active Agent Host turns failed during client recovery.' };
	stopSucceeded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether stopping the failed Copilot client completed without throwing.' };
	owner: 'roblourens';
	comment: 'Tracks the outcome of Copilot client recovery.';
};

export function reportCopilotClientRecovery(telemetryService: ITelemetryService, event: CopilotClientRecoveryEvent): void {
	telemetryService.publicLog2<CopilotClientRecoveryEvent, CopilotClientRecoveryClassification>('agentHost.copilotClientRecovery', event);
}

type CopilotClientRecoveryTurnEvent = CopilotSessionFailureCorrelation & {
	clientFailureId: string;
};

type CopilotClientRecoveryTurnClassification = IAgentHostInitiatorClassification & {
	clientFailureId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier shared by all telemetry for one Copilot client failure episode.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host chat identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host turn failed during client recovery.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK session identifier.' };
	owner: 'roblourens';
	comment: 'Correlates each turn failed during Copilot client recovery with its client failure episode.';
};

export function reportCopilotClientRecoveryTurn(telemetryService: ITelemetryService, clientFailureId: string, correlation: CopilotSessionFailureCorrelation): void {
	telemetryService.publicLogError2<CopilotClientRecoveryTurnEvent, CopilotClientRecoveryTurnClassification>('agentHost.copilotClientRecoveryTurnFailed', {
		clientFailureId,
		...correlation,
	});
}

type CopilotSdkSessionErrorEvent = CopilotSessionFailureCorrelation & {
	sdkEventId: string;
	sdkParentEventId: string | undefined;
	sdkAgentId: string | undefined;
	errorType: string;
	errorCode: string | undefined;
	statusCode: number | undefined;
	providerCallId: string | undefined;
	serviceRequestId: string | undefined;
	eligibleForAutoSwitch: boolean | undefined;
	msg: string;
	callstack: string | undefined;
};

type CopilotSdkSessionErrorClassification = IAgentHostInitiatorClassification & {
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host chat identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host turn identifier, when available.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK session identifier.' };
	sdkEventId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK event identifier.' };
	sdkParentEventId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The preceding Copilot SDK event identifier, when available.' };
	sdkAgentId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK subagent identifier, when applicable.' };
	errorType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The structured Copilot SDK session error type.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The upstream provider error code, when available.' };
	statusCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The upstream HTTP status code, when available.' };
	providerCallId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The GitHub provider request identifier, when available.' };
	serviceRequestId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot service request identifier, when available.' };
	eligibleForAutoSwitch: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the error can trigger an Auto model switch.' };
	msg: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The SDK session error message. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The SDK session error stack. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	owner: 'roblourens';
	comment: 'Captures Copilot SDK session errors with Agent Host, SDK, and provider correlation identifiers.';
};

export function reportCopilotSdkSessionError(telemetryService: ITelemetryService, event: SessionEventPayload<'session.error'>, correlation: CopilotSessionFailureCorrelation): void {
	telemetryService.publicLogError2<CopilotSdkSessionErrorEvent, CopilotSdkSessionErrorClassification>('agentHost.copilotSdkSessionError', {
		...correlation,
		sdkEventId: event.id,
		sdkParentEventId: event.parentId ?? undefined,
		sdkAgentId: event.agentId,
		errorType: event.data.errorType,
		errorCode: event.data.errorCode,
		statusCode: event.data.statusCode,
		providerCallId: event.data.providerCallId,
		serviceRequestId: event.data.serviceRequestId,
		eligibleForAutoSwitch: event.data.eligibleForAutoSwitch,
		msg: event.data.message,
		callstack: event.data.stack,
	});
}

type CopilotModelCallFailureEvent = CopilotSessionFailureCorrelation & {
	sdkEventId: string;
	sdkParentEventId: string | undefined;
	sdkAgentId: string | undefined;
	failureKind: string | undefined;
	source: string;
	transport: string | undefined;
	apiEndpoint: CopilotModelCallEndpointTelemetryKind | undefined;
	statusCode: number | undefined;
	durationMs: number | undefined;
	model: string | undefined;
	reasoningEffort: string | undefined;
	isAuto: boolean | undefined;
	isByok: boolean | undefined;
	rte: boolean | undefined;
	badRequestKind: string | undefined;
	apiCallId: string | undefined;
	providerCallId: string | undefined;
	serviceRequestId: string | undefined;
	messageCount: number | undefined;
	toolCallCount: number | undefined;
	toolResultMessageCount: number | undefined;
	namelessToolCallCount: number | undefined;
	imagePartCount: number | undefined;
	imagePartsMissingMediaType: number | undefined;
};

type CopilotModelCallFailureClassification = IAgentHostInitiatorClassification & {
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host chat identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Agent Host turn identifier, when available.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK session identifier.' };
	sdkEventId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK event identifier.' };
	sdkParentEventId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The preceding Copilot SDK event identifier, when available.' };
	sdkAgentId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot SDK subagent identifier, when applicable.' };
	failureKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the SDK model call failed at the API or transport boundary.' };
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the model call came from the top-level agent, a subagent, or MCP sampling.' };
	transport: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The HTTP or WebSocket transport used by the failed model call.' };
	apiEndpoint: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded API endpoint category used by the failed model call. Values are chatCompletions, responses, responsesWebSocket, anthropicMessages, or other.' };
	statusCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The HTTP status code, when available.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of the failed model call in milliseconds.' };
	model: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider model identifier used by the failed call.' };
	reasoningEffort: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The reasoning effort used by the failed call, when applicable.' };
	isAuto: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether Auto selected the model for the failed call.' };
	isByok: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the failed call used a bring-your-own-key provider.' };
	rte: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The SDK runtime RTE flag for the failed call, when available.' };
	badRequestKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded HTTP 400 response category, when available.' };
	apiCallId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The model-provider completion identifier, when available.' };
	providerCallId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The GitHub provider request identifier, when available.' };
	serviceRequestId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The Copilot service request identifier, when available.' };
	messageCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of messages in the failing request.' };
	toolCallCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of tool calls in the failing request.' };
	toolResultMessageCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of tool-result messages in the failing request.' };
	namelessToolCallCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of tool calls with no name in the failing request.' };
	imagePartCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of image parts in the failing request.' };
	imagePartsMissingMediaType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of image parts missing a media type in the failing request.' };
	owner: 'roblourens';
	comment: 'Captures structured Copilot SDK model-call failures. Raw model error messages remain restricted to SDK-owned telemetry and are not duplicated here.';
};

export function reportCopilotModelCallFailure(telemetryService: ITelemetryService, event: SessionEventPayload<'model.call_failure'>, correlation: CopilotSessionFailureCorrelation): void {
	const fingerprint = event.data.requestFingerprint;
	telemetryService.publicLogError2<CopilotModelCallFailureEvent, CopilotModelCallFailureClassification>('agentHost.copilotModelCallFailure', {
		...correlation,
		sdkEventId: event.id,
		sdkParentEventId: event.parentId ?? undefined,
		sdkAgentId: event.agentId,
		failureKind: event.data.failureKind,
		source: event.data.source,
		transport: event.data.transport,
		apiEndpoint: normalizeCopilotApiEndpoint(event.data.apiEndpoint),
		statusCode: event.data.statusCode,
		durationMs: event.data.durationMs,
		model: event.data.isByok ? 'byokModel' : event.data.model,
		reasoningEffort: event.data.reasoningEffort,
		isAuto: event.data.isAuto,
		isByok: event.data.isByok,
		rte: event.data.rte,
		badRequestKind: event.data.badRequestKind,
		apiCallId: event.data.apiCallId,
		providerCallId: event.data.providerCallId,
		serviceRequestId: event.data.serviceRequestId,
		messageCount: fingerprint?.messageCount,
		toolCallCount: fingerprint?.toolCallCount,
		toolResultMessageCount: fingerprint?.toolResultMessageCount,
		namelessToolCallCount: fingerprint?.namelessToolCallCount,
		imagePartCount: fingerprint?.imagePartCount,
		imagePartsMissingMediaType: fingerprint?.imagePartsMissingMediaType,
	});
}

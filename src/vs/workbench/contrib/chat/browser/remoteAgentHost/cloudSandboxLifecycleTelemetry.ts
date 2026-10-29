/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../../base/common/errors.js';
import { generateUuid, isUUID } from '../../../../../base/common/uuid.js';
import { getConnectionDiagnosticError, getGitHubRequestId, type IConnectionDiagnosticEvent, type IConnectionDiagnosticState } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { getConnectionTelemetryError, type ConnectionTelemetryErrorClassification, type IConnectionTelemetryError } from '../../../../../platform/agentHost/common/connectionTelemetry.js';
import { cloudSandboxTaskCreationPaths, type CloudSandboxTaskCreationPath, type ICloudSandboxConnectionRequest } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

const phases = [
	'preparation', 'task.reserve', 'task.create', 'task.delete', 'binding',
	'connection.connect', 'connection.recover', 'connection.closed', 'connection.disposed',
	'credentials', 'credentials.connect', 'credentials.refresh', 'credentials.stopped',
	'credentials.acquire', 'credentials.retryWait', 'credentials.authentication',
	'transport.connect', 'transport.reconnect', 'protocol.initialize', 'protocol.reconnect',
	'protocol.authentication', 'protocol.subscriptions', 'protocol.firstSessionRequest', 'protocol.sessionOpen',
	'repository.prepare', 'repository.clone', 'session.create', 'session.subscribe',
	'session.snapshot', 'session.ready', 'session.dispose', 'chat.binding',
	'turn.submit', 'turn.accepted', 'turn.complete',
] as const;

const failurePoints = [
	'credentials.request', 'credentials.invalidResponse', 'credentials.incompleteResponse', 'credentials.clientMismatch',
	'credentialRefresh.request', 'credentialRefresh.retryBudget', 'credentialRefresh.environmentWaking',
	'credentialRefresh.invalidExpiry', 'credentialRefresh.inconsistentCredentials', 'credentialRefresh.authenticationTokenUnchanged',
	'turn.rejected', 'session.rejected', 'turn.hostError', 'session.hostError',
] as const;
const recoveryActions = ['attempting', 'waiting', 'deferred', 'acquired', 'recovered', 'stopped', 'cancelled', 'superseded'] as const;
const refreshStopReasons = ['permanentError', 'consecutiveFailures', 'environmentWaking', 'unusableToken'] as const;
const connectionStates = ['connecting', 'connected', 'reconnecting', 'incompatible', 'closed'] as const;
const outcomes = ['started', 'succeeded', 'failed', 'cancelled', 'observed', 'rejected', 'waking'] as const;
const preparationSteps = ['started', 'receipt', 'reservationFailed', 'sendWait', 'handoff', 'sendBlocked', 'sendWithoutReservation', 'sendFallback', 'releaseRequested', 'released', 'releaseFailed', 'submitted'] as const;
const MAX_DIAGNOSTIC_DURATION_MS = 7 * 24 * 60 * 60_000;

export type CloudSandboxLifecyclePhase = typeof phases[number];
export type CloudSandboxLifecycleFailurePoint = typeof failurePoints[number];
export type CloudSandboxRefreshStopReason = typeof refreshStopReasons[number];
export type CloudSandboxLifecycleOutcome = typeof outcomes[number];
export type CloudSandboxPreparationStep = typeof preparationSteps[number];

export interface ICloudSandboxLifecycleContext extends IConnectionDiagnosticState {
	/** Local-only reporting scope. It is never part of the uploaded event. */
	readonly environmentKind?: ICloudSandboxConnectionRequest['environmentKind'];
	readonly environmentId?: string;
	readonly agentSessionId?: string;
	readonly taskId?: string;
	readonly relatedTaskId?: string;
	readonly parentOperationId?: string;
	readonly connectionId?: string;
	readonly attemptId?: string;
	readonly chatId?: string;
	readonly requestId?: string;
	readonly serverRequestId?: string;
	readonly taskCreationPath?: CloudSandboxTaskCreationPath;
	readonly preparationStep?: CloudSandboxPreparationStep;
	readonly sessionState?: 'creating' | 'ready' | 'failed';
	readonly failurePoint?: CloudSandboxLifecycleFailurePoint;
	readonly recoveryAction?: typeof recoveryActions[number];
	readonly refreshStopReason?: CloudSandboxRefreshStopReason;
	readonly attemptNumber?: number;
	readonly consecutiveFailures?: number;
	readonly retryDelayMs?: number;
	readonly hostCanResume?: boolean;
}

export interface ICloudSandboxLifecycleEvent extends ICloudSandboxLifecycleContext {
	readonly phase: CloudSandboxLifecyclePhase;
	readonly outcome: CloudSandboxLifecycleOutcome;
	readonly operationId: string;
	readonly timestamp?: number;
	readonly durationMs?: number;
	readonly error?: unknown;
	readonly statusCode?: number;
	readonly hostErrorType?: string;
}

type LifecycleEvent = Omit<ICloudSandboxLifecycleEvent, 'error' | 'timestamp' | 'hostErrorType' | 'environmentKind' | 'phase' | 'outcome'> & IConnectionTelemetryError & {
	phase: CloudSandboxLifecyclePhase | 'unknown';
	outcome: CloudSandboxLifecycleOutcome | 'unknown';
	schemaVersion: number;
	eventId: string;
	observerId: string;
	sequence: number;
	omittedCorrelationFields: number;
	omittedCorrelationFieldNames: string;
	observedAtUnixMs: number;
	hostErrorKind?: 'policyResolutionFailed' | 'executionInterrupted' | 'sessionInUse' | 'unknown';
};

type LifecycleClassification = ConnectionTelemetryErrorClassification & {
	owner: 'osortega';
	comment: 'Content-free client observations for a sandbox environment/session timeline. Not authoritative compute lifecycle or evidence of warm allocation.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Lifecycle event schema version.' };
	eventId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Random event identity for deduplicating uploads.' };
	observerId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Random reporter lifetime identity; not an account or environment.' };
	sequence: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Reporter-local ordering; not a cross-machine clock.' };
	phase: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted client-observed lifecycle operation; invalid supplied values become unknown.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted operation start/result or passive observation. Invalid supplied values become unknown, never success.' };
	operationId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Client operation UUID pairing start/result, including before backend identity exists.' };
	parentOperationId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Enclosing client operation UUID, when known.' };
	observedAtUnixMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Client observation time in Unix milliseconds, distinct from upload time.' };
	durationMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Client-observed elapsed duration, not backend execution time.' };
	environmentId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Opaque service environment identity, never the allocation sentinel or an address.' };
	agentSessionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Backend session UUID normalized only for telemetry lookup; not the common client session ID.' };
	taskId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Service task UUID bound to the observed session.' };
	relatedTaskId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Requested reservation UUID; not a claim that fallback reused that task.' };
	connectionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Protocol client UUID for this connection, which can serve several sessions.' };
	attemptId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Connection-attempt UUID, distinct from logical recovery and session identity.' };
	chatId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Opaque UUID or hexadecimal chat identity; no message content.' };
	requestId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'UUID-based client turn identifier for correlation with invocation telemetry.' };
	serverRequestId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Validated service request identifier for backend investigation, not an authentication token.' };
	taskCreationPath?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Client task creation/reservation path, not warm or cold compute provenance.' };
	preparationStep?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted draft preparation observation, without draft content or repository names.' };
	sessionState?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Session lifecycle read from a host snapshot, not a claim of a new transition.' };
	failurePoint?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted first-party failure branch, never an exception message or stack.' };
	recoveryAction?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Observed recovery decision. Deferred means eligible on demand, not an automatically scheduled request.' };
	refreshStopReason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted reason client credential acquisition stopped.' };
	attemptNumber?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'One plus the prior unhealthy acquisition cycle count at attempt entry, capped at 10000; not a lifetime request count.' };
	consecutiveFailures?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Existing failed acquisition cycle count, capped at 10000; an immediate permanent error can have count zero.' };
	retryDelayMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Remaining on-demand credential retry wait in milliseconds, capped at seven days; not proof a retry is scheduled.' };
	connectionState?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Client protocol connection state at the observation, not backend liveness.' };
	authenticationRestorePending?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether client authentication restoration remains pending, not proof an authentication request is running.' };
	lastSuccessfulResponseAgeMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Age of the last accepted successful RPC response on the current transport, capped at seven days. Does not prove the next request is authorized.' };
	reconnectAttempt?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Attempts already performed in the current protocol reconnect cycle, capped at 10000.' };
	reconnectScheduled?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the protocol client currently has a reconnect timer.' };
	reconnectDelayMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Remaining scheduled protocol reconnect delay, capped at seven days.' };
	hostErrorKind?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Recognized host error type mapped to a fixed category; all other supplied types become unknown.' };
	hostCanResume?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Optional host-provided resumable flag on a failed turn; not a claim that resume was attempted.' };
	omittedCorrelationFields: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of supplied identifiers omitted because they do not match the content-free identifier contract.' };
	omittedCorrelationFieldNames: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted identifier field names omitted by validation, never their values.' };
};

/** Normalizes UUID-backed session resources for telemetry without changing protocol identity. */
export function getCloudSandboxLifecycleSessionId(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const id = value.match(/^[a-z][a-z\d+.-]*:\/(?<id>[^/?#]+)$/i)?.groups?.id ?? value;
	return isUUID(id) ? id.toLowerCase() : undefined;
}

function uuid(value: string | undefined): string | undefined {
	return value && isUUID(value) ? value.toLowerCase() : undefined;
}

function environmentId(value: string | undefined): string | undefined {
	return uuid(value) ?? (value?.startsWith('env_') && uuid(value.slice(4)) ? `env_${value.slice(4).toLowerCase()}` : undefined);
}

function chatId(value: string | undefined): string | undefined {
	const id = value?.match(/^ahp-chat:\/(?<id>[^/?#]+)$/)?.groups?.id ?? value;
	return getCloudSandboxLifecycleSessionId(id) ?? (id && /^[a-f\d]{16,64}$/i.test(id) ? id.toLowerCase() : undefined);
}

function requestId(value: string | undefined): string | undefined {
	return uuid(value) ?? (value?.startsWith('request_') && uuid(value.slice(8)) ? `request_${value.slice(8).toLowerCase()}` : undefined);
}

function boundedDuration(value: number | undefined): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, MAX_DIAGNOSTIC_DURATION_MS) : undefined;
}

function boundedCount(value: number | undefined): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? Math.min(value, 10_000) : undefined;
}

function hostErrorKind(value: string | undefined): LifecycleEvent['hostErrorKind'] {
	switch (value) {
		case undefined: return undefined;
		case 'policyResolutionFailed': return 'policyResolutionFailed';
		case 'executionInterrupted': return 'executionInterrupted';
		case 'CodexThreadInUse': return 'sessionInUse';
		default: return 'unknown';
	}
}

export class CloudSandboxLifecycleTelemetry {
	private readonly observerId = generateUuid();
	private sequence = 0;

	constructor(private readonly telemetryService: ITelemetryService) { }

	start(phase: CloudSandboxLifecyclePhase, context: ICloudSandboxLifecycleContext = {}): CloudSandboxLifecycleOperation {
		return new CloudSandboxLifecycleOperation(this, phase, context);
	}

	record(event: ICloudSandboxLifecycleEvent): void {
		if (event.environmentKind === 'user-local') {
			return;
		}
		const ids = {
			operationId: uuid(event.operationId),
			parentOperationId: uuid(event.parentOperationId),
			environmentId: environmentId(event.environmentId),
			agentSessionId: getCloudSandboxLifecycleSessionId(event.agentSessionId),
			taskId: uuid(event.taskId),
			relatedTaskId: uuid(event.relatedTaskId),
			connectionId: uuid(event.connectionId),
			attemptId: uuid(event.attemptId),
			chatId: chatId(event.chatId),
			requestId: requestId(event.requestId),
			serverRequestId: getGitHubRequestId(event.serverRequestId),
		};
		const omittedCorrelationFields = (Object.keys(ids) as (keyof typeof ids)[])
			.filter(key => event[key] !== undefined && ids[key] === undefined);
		const error = event.error === undefined ? undefined : getConnectionDiagnosticError(event.error);
		const errorFields = getConnectionTelemetryError(error);
		const status = event.statusCode ?? errorFields.statusCode;
		this.telemetryService.publicLog2<LifecycleEvent, LifecycleClassification>('cloudSandboxLifecycle', {
			schemaVersion: 1, eventId: generateUuid(), observerId: this.observerId, sequence: ++this.sequence,
			...ids,
			operationId: ids.operationId ?? generateUuid(),
			phase: phases.find(phase => phase === event.phase) ?? 'unknown',
			outcome: outcomes.find(outcome => outcome === event.outcome) ?? 'unknown',
			observedAtUnixMs: event.timestamp !== undefined && Number.isFinite(event.timestamp) ? event.timestamp : Date.now(),
			durationMs: event.durationMs !== undefined && Number.isFinite(event.durationMs) ? Math.max(0, event.durationMs) : undefined,
			taskCreationPath: event.taskCreationPath === undefined ? undefined : cloudSandboxTaskCreationPaths.find(path => path === event.taskCreationPath) ?? 'unknown',
			preparationStep: preparationSteps.find(step => step === event.preparationStep),
			sessionState: event.sessionState === 'creating' || event.sessionState === 'ready' || event.sessionState === 'failed' ? event.sessionState : undefined,
			failurePoint: failurePoints.find(value => value === event.failurePoint),
			recoveryAction: recoveryActions.find(value => value === event.recoveryAction),
			refreshStopReason: refreshStopReasons.find(value => value === event.refreshStopReason),
			attemptNumber: boundedCount(event.attemptNumber),
			consecutiveFailures: boundedCount(event.consecutiveFailures),
			retryDelayMs: boundedDuration(event.retryDelayMs),
			connectionState: connectionStates.find(value => value === event.connectionState),
			authenticationRestorePending: typeof event.authenticationRestorePending === 'boolean' ? event.authenticationRestorePending : undefined,
			lastSuccessfulResponseAgeMs: boundedDuration(event.lastSuccessfulResponseAgeMs),
			reconnectAttempt: boundedCount(event.reconnectAttempt),
			reconnectScheduled: typeof event.reconnectScheduled === 'boolean' ? event.reconnectScheduled : undefined,
			reconnectDelayMs: boundedDuration(event.reconnectDelayMs),
			hostErrorKind: hostErrorKind(event.hostErrorType),
			hostCanResume: typeof event.hostCanResume === 'boolean' ? event.hostCanResume : undefined,
			...errorFields,
			statusCode: status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
			serverRequestId: ids.serverRequestId ?? getGitHubRequestId(error?.requestId),
			omittedCorrelationFields: omittedCorrelationFields.length,
			omittedCorrelationFieldNames: omittedCorrelationFields.join(','),
		});
	}

	recordDiagnostic(event: IConnectionDiagnosticEvent, context: ICloudSandboxLifecycleContext): void {
		const phase = phases.find(phase => phase === event.phase);
		if (!phase) {
			return;
		}
		this.record({
			...context, phase, operationId: event.operationId, attemptId: event.attemptId,
			agentSessionId: event.sessionResource, chatId: event.chatResource, requestId: event.turnId,
			sessionState: event.sessionState,
			connectionState: event.connectionState, authenticationRestorePending: event.authenticationRestorePending,
			lastSuccessfulResponseAgeMs: event.lastSuccessfulResponseAgeMs,
			reconnectAttempt: event.reconnectAttempt, reconnectScheduled: event.reconnectScheduled, reconnectDelayMs: event.reconnectDelayMs,
			timestamp: event.timestamp, durationMs: event.durationMs, error: event.error,
			outcome: event.outcome === 'info' ? 'observed' : event.outcome === 'failed' && event.error?.name === 'Canceled' ? 'cancelled' : event.outcome,
		});
	}
}

export class CloudSandboxLifecycleOperation {
	readonly id = generateUuid();
	private readonly startedAt = Date.now();
	private finished = false;

	constructor(
		private readonly telemetry: CloudSandboxLifecycleTelemetry,
		private readonly phase: CloudSandboxLifecyclePhase,
		private context: ICloudSandboxLifecycleContext,
	) {
		this.telemetry.record({ ...context, phase, operationId: this.id, outcome: 'started', timestamp: this.startedAt });
	}

	bind(context: ICloudSandboxLifecycleContext): void {
		const definedContext = { ...context };
		let changed = false;
		for (const key of Object.keys(context) as (keyof ICloudSandboxLifecycleContext)[]) {
			if (context[key] === undefined) {
				delete definedContext[key];
			} else if (context[key] !== this.context[key]) {
				changed = true;
			}
		}
		if (!changed) {
			return;
		}
		this.context = { ...this.context, ...definedContext };
		this.telemetry.record({ ...this.context, phase: this.phase, operationId: this.id, outcome: 'observed' });
	}

	complete(outcome: CloudSandboxLifecycleOutcome, context: ICloudSandboxLifecycleContext = {}, error?: unknown, statusCode?: number): void {
		if (this.finished) {
			return;
		}
		this.finished = true;
		this.telemetry.record({
			...this.context, ...context, phase: this.phase, operationId: this.id, outcome,
			environmentKind: this.context.environmentKind ?? context.environmentKind,
			durationMs: Date.now() - this.startedAt, error, statusCode,
		});
	}

	failed(error: unknown, cancelled = isCancellationError(error)): void {
		this.complete(cancelled ? 'cancelled' : 'failed', {}, error);
	}
}

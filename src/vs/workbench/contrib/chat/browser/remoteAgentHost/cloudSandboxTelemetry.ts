/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { CloudSandboxRequestError, type ICloudSandboxConnectOptions } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IConnectionDiagnosticEvent } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { RemoteAgentHostConnectionObserver } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../../../../platform/agentHost/common/state/protocol/errors.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

/** The Mission Control call being reported. A closed set, so it is safe to send verbatim. */
export type CloudSandboxRequestAction = 'connect' | 'reconnect' | 'getEnvironment' | 'listEnvironments' | 'listTasks' | 'getTask' | 'createTask' | 'deleteTask' | 'renameTask' | 'archiveTask' | 'unarchiveTask' | 'getTaskEvents' | 'getRepository' | 'listModels';

/**
 * How a Mission Control request ended, bucketed so a count is meaningful without carrying the
 * response itself. `waking` is the 202 an environment returns while it boots, which is neither a
 * success nor a failure but is the response most likely to be retried in a loop. `unexpectedStatus`
 * covers 1xx/3xx, which the client does not treat as success either — see
 * {@link requestOutcomeForStatus}.
 */
export type CloudSandboxRequestOutcome = 'succeeded' | 'waking' | 'clientError' | 'serverError' | 'networkError' | 'unexpectedStatus';

/** Why the credential-refresh scheduler stopped. A closed set of client-side decisions. */
export type CloudSandboxRefreshStopReason =
	/** Mission Control rejected the request in a way that repeating cannot fix (e.g. 404). */
	| 'permanentError'
	/** Too many consecutive failed refreshes. */
	| 'consecutiveFailures'
	/** `/reconnect` kept answering "waking" for a client that is supposed to be connected. */
	| 'environmentWaking'
	/** Refreshed tokens kept arriving already expired, or without a usable `expires_at`. */
	| 'unusableToken';

export type CloudSandboxConnectionStage = 'credentials' | 'connection' | 'relay' | 'protocol' | 'authentication' | 'restoration';
export type CloudSandboxConnectionOutcome = 'success' | 'failure' | 'cancelled';
export type CloudSandboxConnectionSurface = 'agentsDesktop' | 'agentsWeb' | 'editorDesktop' | 'editorWeb' | 'unknown';
type CloudSandboxConnectionSource = NonNullable<ICloudSandboxConnectOptions['connectionSource']>;
type CloudSandboxEnvironmentKind = 'cloud' | 'user-local';
type CloudSandboxEnvironmentClassification = {
	environmentKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Cloud sandbox or user-local Mission Control host; no environment identity.' };
};
type CloudSandboxConnectionPhase = Exclude<CloudSandboxConnectionStage, 'connection'>;
type CloudSandboxEnvironmentOperation = 'provision' | 'resume' | 'recover' | 'attach';
type CloudSandboxConnectionContext = Pick<ICloudSandboxConnectOptions, 'provisioningStartedAt' | 'environmentKind'>;

export function getCloudSandboxConnectionSurface(isSessionsWindow: boolean, isWeb: boolean): CloudSandboxConnectionSurface {
	return isSessionsWindow ? (isWeb ? 'agentsWeb' : 'agentsDesktop') : (isWeb ? 'editorWeb' : 'editorDesktop');
}

export interface ICloudSandboxConnectionTelemetry extends IDisposable {
	setConnectStage(stage: CloudSandboxConnectionStage): void;
	completeConnect(outcome: CloudSandboxConnectionOutcome): void;
	onConnectionStateChange(state: Parameters<RemoteAgentHostConnectionObserver>[0]): void;
	recordReceivedFrame(): void;
	createRequestObserver(): (event: 'issued' | 'waking') => void;
	recordConnectionDiagnostic(event: IConnectionDiagnosticEvent): void;
}

export const ICloudSandboxTelemetryService = createDecorator<ICloudSandboxTelemetryService>('cloudSandboxTelemetryService');

/**
 * Telemetry for the cloud sandbox integration.
 *
 * Owns every event the sandbox path emits so the reporting rules — what is aggregated, which values
 * are closed sets, what must never carry a URL or token — live in one place instead of being
 * restated at each call site. New sandbox events belong here as additional methods.
 */
export interface ICloudSandboxTelemetryService {
	readonly _serviceBrand: undefined;

	/**
	 * Record how a Mission Control request ended.
	 *
	 * Cheap to call on every request: outcomes are accumulated and reported periodically rather than
	 * sent individually, because a single connect can fan out to tens of calls through waking retries
	 * and readiness polls.
	 */
	reportRequest(action: CloudSandboxRequestAction, outcome: CloudSandboxRequestOutcome): void;

	/** Report client-observed task/VM provisioning separately from connecting to the returned environment. */
	reportProvisioningOutcome(outcome: CloudSandboxConnectionOutcome, durationMs: number): void;

	/**
	 * Report that credential refresh for a connection stopped, and why.
	 *
	 * Refresh is what keeps a sandbox connection usable, so each of these marks a connection that
	 * will drop once its current token expires — and, equally, a retry loop that was stopped from
	 * running indefinitely.
	 */
	reportCredentialRefreshStopped(reason: CloudSandboxRefreshStopReason, consecutiveFailures: number, error?: unknown): void;

	/** Track one logical connection, including retries and subsequent outages. No identity is recorded. */
	trackConnection(stage: CloudSandboxConnectionStage, surface?: CloudSandboxConnectionSurface, source?: CloudSandboxConnectionSource, context?: CloudSandboxConnectionContext): ICloudSandboxConnectionTelemetry;
}

/** How often accumulated request counts are reported. */
const REQUEST_REPORT_INTERVAL_MS = 30 * 60_000;
const CONNECTION_REPORT_INTERVAL_MS = 5 * 60_000;
const KNOWN_PROTOCOL_ERROR_CODES = [...Object.values(JsonRpcErrorCodes), ...Object.values(AhpErrorCodes)];

const nullConnectionTelemetry: ICloudSandboxConnectionTelemetry = {
	setConnectStage() { },
	completeConnect() { },
	onConnectionStateChange() { },
	recordReceivedFrame() { },
	createRequestObserver: () => () => { },
	recordConnectionDiagnostic() { },
	dispose() { },
};

/**
 * The outcome bucket for a response with {@link statusCode}.
 *
 * Only 2xx counts as a success, matching the client's own `isSuccess` check — a 1xx or 3xx is
 * thrown as a request failure, so counting it as a success would understate the failure rate.
 */
export function requestOutcomeForStatus(statusCode: number | undefined): CloudSandboxRequestOutcome {
	if (statusCode === undefined) {
		return 'networkError';
	}
	if (statusCode === 202) {
		return 'waking';
	}
	if (statusCode >= 200 && statusCode < 300) {
		return 'succeeded';
	}
	if (statusCode >= 500) {
		return 'serverError';
	}
	if (statusCode >= 400) {
		return 'clientError';
	}
	return 'unexpectedStatus';
}

/** Per-action counts accumulated between reports. */
type RequestCounts = Record<CloudSandboxRequestOutcome, number>;

function emptyCounts(): RequestCounts {
	return { succeeded: 0, waking: 0, clientError: 0, serverError: 0, networkError: 0, unexpectedStatus: 0 };
}

export class CloudSandboxTelemetryService extends Disposable implements ICloudSandboxTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly _counts = new Map<CloudSandboxRequestAction, RequestCounts>();
	private readonly _reportTimer = this._register(new IntervalTimer());
	private readonly _connections = new Set<CloudSandboxConnectionTelemetry>();
	private readonly _connectionReportTimer = this._register(new IntervalTimer());
	/** When the current window began, i.e. when its first request was recorded. */
	private _windowStart = Date.now();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		// Report whatever has accumulated rather than losing the last window on shutdown.
		this._register({ dispose: () => this.flushRequestCounts() });
		this._register({
			dispose: () => {
				for (const connection of this._connections) {
					connection.dispose();
				}
			}
		});
	}

	trackConnection(stage: CloudSandboxConnectionStage, surface: CloudSandboxConnectionSurface = 'unknown', source: CloudSandboxConnectionSource = 'existing', context?: CloudSandboxConnectionContext): ICloudSandboxConnectionTelemetry {
		if (this._store.isDisposed) {
			return nullConnectionTelemetry;
		}
		const environmentOperation = context?.environmentKind === 'user-local' ? 'attach' : source === 'created' ? 'provision' : 'resume';
		const connection = new CloudSandboxConnectionTelemetry(stage, surface, source, context?.environmentKind ?? 'cloud', environmentOperation, context?.provisioningStartedAt, event => {
			this._telemetryService.publicLog2<CloudSandboxConnectionOutcomeEvent, CloudSandboxConnectionOutcomeClassification>('cloudSandboxConnectionOutcome', event);
		}, event => {
			this._telemetryService.publicLog2<CloudSandboxFirstSessionRequestEvent, CloudSandboxFirstSessionRequestClassification>('cloudSandboxFirstSessionRequest', event);
		}, () => {
			const counts = connection.takeHealthSnapshot(Date.now());
			this._connections.delete(connection);
			if (this._connections.size === 0) {
				this._connectionReportTimer.cancel();
			}
			this._reportConnectionHealth(counts);
		});
		this._connections.add(connection);
		if (this._connections.size === 1) {
			this._connectionReportTimer.cancelAndSet(() => this.flushConnectionHealth(), CONNECTION_REPORT_INTERVAL_MS);
		}
		return connection;
	}

	flushConnectionHealth(): void {
		const now = Date.now();
		const counts = new Map<CloudSandboxEnvironmentKind, CloudSandboxConnectionHealthEvent>();
		for (const connection of this._connections) {
			const delta = connection.takeHealthSnapshot(now);
			const aggregate = counts.get(delta.environmentKind);
			if (aggregate) {
				aggregate.connectedMs += delta.connectedMs;
				aggregate.unexpectedDisconnects += delta.unexpectedDisconnects;
				aggregate.receivedFrames += delta.receivedFrames;
			} else {
				counts.set(delta.environmentKind, delta);
			}
		}
		for (const aggregate of counts.values()) {
			this._reportConnectionHealth(aggregate);
		}
	}

	private _reportConnectionHealth(counts: CloudSandboxConnectionHealthEvent): void {
		if (counts.connectedMs || counts.unexpectedDisconnects || counts.receivedFrames) {
			this._telemetryService.publicLog2<CloudSandboxConnectionHealthEvent, CloudSandboxConnectionHealthClassification>('cloudSandboxConnectionHealth', counts);
		}
	}

	reportRequest(action: CloudSandboxRequestAction, outcome: CloudSandboxRequestOutcome): void {
		let counts = this._counts.get(action);
		if (!counts) {
			counts = emptyCounts();
			this._counts.set(action, counts);
			// Only tick while there is something to report, so an idle window stays idle. The window
			// starts here rather than at the last flush, so an idle stretch is not folded into
			// `windowMs` — that would make the reported request rate look far lower than it was.
			if (this._counts.size === 1) {
				this._windowStart = Date.now();
				this._reportTimer.cancelAndSet(() => this.flushRequestCounts(), REQUEST_REPORT_INTERVAL_MS);
			}
		}
		counts[outcome]++;
	}

	reportProvisioningOutcome(outcome: CloudSandboxConnectionOutcome, durationMs: number): void {
		this._telemetryService.publicLog2<CloudSandboxProvisioningOutcomeEvent, CloudSandboxProvisioningOutcomeClassification>(
			'cloudSandboxProvisioningOutcome', { outcome, durationMs },
		);
	}

	reportCredentialRefreshStopped(reason: CloudSandboxRefreshStopReason, consecutiveFailures: number, error?: unknown): void {
		this._telemetryService.publicLog2<CloudSandboxRefreshStoppedEvent, CloudSandboxRefreshStoppedClassification>(
			'cloudSandboxCredentialRefreshStopped',
			{
				reason,
				consecutiveFailures,
				statusCode: error instanceof CloudSandboxRequestError ? error.statusCode : undefined,
			},
		);
	}

	/** Report and reset the accumulated request counts. Safe to call when nothing has been recorded. */
	flushRequestCounts(): void {
		if (this._counts.size === 0) {
			return;
		}
		const windowMs = Date.now() - this._windowStart;
		for (const [action, counts] of this._counts) {
			this._telemetryService.publicLog2<CloudSandboxRequestsEvent, CloudSandboxRequestsClassification>(
				'cloudSandboxRequests',
				{
					action,
					windowMs,
					total: counts.succeeded + counts.waking + counts.clientError + counts.serverError + counts.networkError + counts.unexpectedStatus,
					succeeded: counts.succeeded,
					waking: counts.waking,
					clientError: counts.clientError,
					serverError: counts.serverError,
					networkError: counts.networkError,
					unexpectedStatus: counts.unexpectedStatus,
				},
			);
		}
		this._counts.clear();
		this._reportTimer.cancel();
	}
}

interface IConnectionOperation {
	readonly operation: 'connect' | 'recover';
	readonly startedAt: number;
	readonly provisioningMs: number | undefined;
	stage: CloudSandboxConnectionStage;
	preparationStartedAt: number | undefined;
	preparationMs: number;
	credentialRequests: number;
	wakingResponses: number;
	transportAttempts: number;
	firstFailure?: { readonly phase: string; readonly code: number | undefined };
	readonly failures: Record<CloudSandboxConnectionPhase, number>;
	readonly durations: Record<CloudSandboxConnectionPhase, number>;
	readonly phases: Map<CloudSandboxConnectionPhase, { readonly id: string; readonly startedAt: number }>;
}

class CloudSandboxConnectionTelemetry extends Disposable implements ICloudSandboxConnectionTelemetry {
	private _operation: IConnectionOperation | undefined;
	private _firstRequest: { readonly id: string; readonly startedAt: number } | undefined;
	private _connectedSince: number | undefined;
	private _restoring = false;
	private _counts = { connectedMs: 0, unexpectedDisconnects: 0, receivedFrames: 0 };

	constructor(
		stage: CloudSandboxConnectionStage,
		private readonly _surface: CloudSandboxConnectionSurface,
		private readonly _source: CloudSandboxConnectionSource,
		private readonly _environmentKind: CloudSandboxEnvironmentKind,
		private readonly _initialEnvironmentOperation: Exclude<CloudSandboxEnvironmentOperation, 'recover'>,
		provisioningStartedAt: number | undefined,
		private readonly _reportOutcome: (event: CloudSandboxConnectionOutcomeEvent) => void,
		private readonly _reportFirstRequest: (event: CloudSandboxFirstSessionRequestEvent) => void,
		private readonly _onDispose: () => void,
	) {
		super();
		this._operation = this._newOperation('connect', stage, provisioningStartedAt);
		if (stage === 'credentials') {
			this._operation.phases.set('credentials', { id: 'initial', startedAt: this._operation.startedAt });
		}
	}

	private _newOperation(operation: 'connect' | 'recover', stage: CloudSandboxConnectionStage, provisioningStartedAt?: number): IConnectionOperation {
		const startedAt = Date.now();
		const provisioningMs = operation === 'connect' && this._initialEnvironmentOperation === 'provision'
			? provisioningStartedAt === undefined ? undefined : Math.max(0, startedAt - provisioningStartedAt)
			: 0;
		return {
			operation, stage, startedAt, credentialRequests: 0, wakingResponses: 0, transportAttempts: 0,
			provisioningMs,
			preparationStartedAt: stage === 'credentials' ? startedAt : undefined, preparationMs: 0,
			failures: { credentials: 0, relay: 0, protocol: 0, authentication: 0, restoration: 0 },
			durations: { credentials: 0, relay: 0, protocol: 0, authentication: 0, restoration: 0 },
			phases: new Map(),
		};
	}

	private get isConnecting(): boolean {
		return this._operation?.operation === 'connect';
	}

	setConnectStage(stage: CloudSandboxConnectionStage): void {
		if (this._operation) {
			if (stage === 'connection') {
				this._finishPhase(this._operation, 'credentials');
			}
			this._setPreparing(this._operation, stage === 'credentials');
			this._operation.stage = stage;
		}
	}

	completeConnect(outcome: CloudSandboxConnectionOutcome): void {
		// A failed waiter does not end retries still owned by the remote service.
		if (!this.isConnecting || (outcome === 'failure' && this._restoring)) {
			return;
		}
		this._complete(outcome);
		if (outcome === 'cancelled') {
			this.dispose();
		}
	}

	onConnectionStateChange(state: Parameters<RemoteAgentHostConnectionObserver>[0]): void {
		if (this._store.isDisposed) {
			return;
		}
		switch (state) {
			case 'connecting':
				this.setConnectStage('connection');
				break;
			case 'connected':
				this._restoring = false;
				this._connectedSince ??= Date.now();
				this._complete('success');
				break;
			case 'reconnecting':
				this._completeFirstRequest('failure');
				this._restoring = true;
				if (this._connectedSince !== undefined) {
					this._pauseConnectedTime();
					this._counts.unexpectedDisconnects++;
					this._operation = this._newOperation('recover', 'connection');
				}
				break;
			case 'failed':
				this._completeFirstRequest('failure');
				this._complete('failure');
				this.dispose();
				break;
			case 'disposed':
				this.dispose();
				break;
		}
	}

	recordReceivedFrame(): void {
		if (!this._store.isDisposed) {
			this._counts.receivedFrames++;
		}
	}

	createRequestObserver(): (event: 'issued' | 'waking') => void {
		let operation: IConnectionOperation | undefined;
		return event => {
			if (this._store.isDisposed) {
				return;
			}
			if (event === 'issued') {
				operation = this._operation;
				if (operation) {
					operation.credentialRequests++;
				}
			} else if (operation && operation === this._operation) {
				operation.wakingResponses++;
			}
		};
	}

	recordConnectionDiagnostic(event: IConnectionDiagnosticEvent): void {
		if (this._store.isDisposed) {
			return;
		}
		if (event.phase === 'protocol.firstSessionRequest') {
			if (event.outcome === 'started') {
				this._firstRequest = { id: event.operationId, startedAt: Date.now() };
			} else if (this._firstRequest?.id === event.operationId && (event.outcome === 'succeeded' || event.outcome === 'failed')) {
				this._completeFirstRequest(event.outcome === 'succeeded' ? 'success' : 'failure');
			}
			return;
		}
		const phase = this._diagnosticPhase(event.phase);
		const operation = this._operation;
		if (!phase || !operation) {
			return;
		}
		if (event.outcome === 'started') {
			this._finishPhase(operation, phase);
			this._setPreparing(operation, phase === 'credentials');
			operation.stage = phase;
			operation.phases.set(phase, { id: event.operationId, startedAt: Date.now() });
			if (phase === 'relay') {
				operation.transportAttempts++;
			}
		} else if (operation.phases.get(phase)?.id === event.operationId && (event.outcome === 'succeeded' || event.outcome === 'failed')) {
			this._finishPhase(operation, phase);
			if (phase === 'credentials' && event.outcome === 'succeeded') {
				this._setPreparing(operation, false);
			}
			if (event.outcome === 'failed') {
				operation.failures[phase]++;
				operation.firstFailure ??= {
					phase: event.phase,
					code: KNOWN_PROTOCOL_ERROR_CODES.find(code => String(code) === event.error?.code),
				};
			}
			const enclosingPhase = [...operation.phases.keys()].at(-1);
			if (event.outcome === 'succeeded' && enclosingPhase) {
				operation.stage = enclosingPhase;
			}
		}
	}

	private _diagnosticPhase(phase: string): CloudSandboxConnectionPhase | undefined {
		switch (phase) {
			case 'credentials': return 'credentials';
			case 'transport.connect':
			case 'transport.reconnect': return 'relay';
			case 'protocol.initialize':
			case 'protocol.reconnect': return 'protocol';
			case 'protocol.authentication': return 'authentication';
			case 'protocol.subscriptions': return 'restoration';
			default: return undefined;
		}
	}

	private _finishPhase(operation: IConnectionOperation, phase: CloudSandboxConnectionPhase): void {
		const active = operation.phases.get(phase);
		if (active) {
			operation.durations[phase] += Math.max(0, Date.now() - active.startedAt);
			operation.phases.delete(phase);
		}
	}

	private _setPreparing(operation: IConnectionOperation, preparing: boolean): void {
		if (preparing) {
			operation.preparationStartedAt ??= Date.now();
		} else if (operation.preparationStartedAt !== undefined) {
			operation.preparationMs += Math.max(0, Date.now() - operation.preparationStartedAt);
			operation.preparationStartedAt = undefined;
		}
	}

	private _completeFirstRequest(outcome: CloudSandboxConnectionOutcome): void {
		if (this._firstRequest) {
			const durationMs = Math.max(0, Date.now() - this._firstRequest.startedAt);
			this._firstRequest = undefined;
			this._reportFirstRequest({ surface: this._surface, source: this._source, environmentKind: this._environmentKind, outcome, durationMs });
		}
	}

	takeHealthSnapshot(now: number): CloudSandboxConnectionHealthEvent {
		if (this._connectedSince !== undefined) {
			this._counts.connectedMs += Math.max(0, now - this._connectedSince);
			this._connectedSince = now;
		}
		const counts = this._counts;
		this._counts = { connectedMs: 0, unexpectedDisconnects: 0, receivedFrames: 0 };
		return { ...counts, environmentKind: this._environmentKind };
	}

	private _pauseConnectedTime(): void {
		if (this._connectedSince !== undefined) {
			this._counts.connectedMs += Math.max(0, Date.now() - this._connectedSince);
			this._connectedSince = undefined;
		}
	}

	private _complete(outcome: CloudSandboxConnectionOutcome): void {
		const operation = this._operation;
		if (!operation) {
			return;
		}
		this._operation = undefined;
		for (const phase of operation.phases.keys()) {
			this._finishPhase(operation, phase);
		}
		this._setPreparing(operation, false);
		const durationMs = Math.max(0, Date.now() - operation.startedAt);
		const preparationMs = Math.min(durationMs, operation.preparationMs);
		this._reportOutcome({
			operation: operation.operation, outcome, stage: operation.stage, durationMs,
			environmentOperation: operation.operation === 'recover' ? 'recover' : this._initialEnvironmentOperation,
			provisioningMs: operation.provisioningMs,
			readinessMs: operation.provisioningMs === undefined ? undefined : operation.provisioningMs + durationMs,
			preparationMs, connectionMs: durationMs - preparationMs,
			surface: this._surface, source: this._source, environmentKind: this._environmentKind,
			credentialRequests: operation.credentialRequests, wakingResponses: operation.wakingResponses, transportAttempts: operation.transportAttempts,
			credentialsMs: operation.durations.credentials, relayMs: operation.durations.relay, protocolMs: operation.durations.protocol,
			authenticationMs: operation.durations.authentication, restorationMs: operation.durations.restoration,
			firstFailurePhase: operation.firstFailure?.phase, firstFailureCode: operation.firstFailure?.code,
			credentialFailures: operation.failures.credentials, relayFailures: operation.failures.relay, protocolFailures: operation.failures.protocol,
			authenticationFailures: operation.failures.authentication, restorationFailures: operation.failures.restoration,
		});
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._pauseConnectedTime();
		this._complete('cancelled');
		this._completeFirstRequest('cancelled');
		super.dispose();
		this._onDispose();
	}
}

type CloudSandboxConnectionOutcomeEvent = {
	environmentKind: CloudSandboxEnvironmentKind;
	operation: 'connect' | 'recover';
	environmentOperation: CloudSandboxEnvironmentOperation;
	outcome: CloudSandboxConnectionOutcome;
	stage: CloudSandboxConnectionStage;
	durationMs: number;
	provisioningMs: number | undefined;
	readinessMs: number | undefined;
	preparationMs: number;
	connectionMs: number;
	surface: CloudSandboxConnectionSurface;
	source: CloudSandboxConnectionSource;
	credentialRequests: number;
	wakingResponses: number;
	transportAttempts: number;
	credentialsMs: number;
	relayMs: number;
	protocolMs: number;
	authenticationMs: number;
	restorationMs: number;
	firstFailurePhase: string | undefined;
	firstFailureCode: number | undefined;
	credentialFailures: number;
	relayFailures: number;
	protocolFailures: number;
	authenticationFailures: number;
	restorationFailures: number;
};

export type CloudSandboxConnectionOutcomeClassification = CloudSandboxEnvironmentClassification & {
	operation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Logical connect or recovery, including all retries.' };
	environmentOperation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Provision connects a newly created sandbox; resume opens an existing sandbox, including already-warm environments; recover follows loss of a ready connection, regardless of its original source; attach connects a user-local Mission Control host. Client workflow, not confirmed VM lifecycle state.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Success, failure, or cancellation; cancellations are not failures.' };
	stage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Last observed connection stage: credentials, connection, relay, protocol, authentication, or restoration.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed milliseconds to readiness, terminal failure, or cancellation, including backoff.' };
	provisioningMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from task creation start to connection start, including local provider setup. Zero for resume, recovery and user-local attach; absent when a created-environment caller did not supply the start time. Never carried into later recoveries.' };
	readinessMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'End-to-end client-observed milliseconds through authenticated AHP readiness, failure or cancellation: provisioningMs plus durationMs. Includes protocol waits even after credentials arrive. Absent when provisioning start is unknown; success samples compare provisioning with resuming at the same readiness boundary.' };
	preparationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Exclusive client-observed credential preparation time, including environment wake/resume, token waits and backoff after credential failures until preparation succeeds or connection setup resumes. Includes HTTP and authentication overhead; not pure server startup time. Excludes task provisioning.' };
	connectionMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed milliseconds outside credential preparation, including relay, protocol, authentication, restoration and connection retry backoff. Together with preparationMs equals durationMs, without nested phase overlap.' };
	surface: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Editor or Agents window, on desktop or web; unknown when not supplied.' };
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Created or existing environment from the caller; does not imply warm or cold compute.' };
	credentialRequests: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Credential requests handed to the request service during this operation, including failed and cancelled in-flight requests.' };
	wakingResponses: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Credential requests answered with a pending response during this operation.' };
	transportAttempts: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Relay connection attempts begun during this operation.' };
	credentialsMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative credential acquisition and waiting time, including partial spans; may overlap authentication.' };
	relayMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative relay connection time, including interrupted attempts.' };
	protocolMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative protocol initialization or reconnect time, including interrupted attempts.' };
	authenticationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative authentication time, including credential preparation and interrupted attempts.' };
	restorationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cumulative subscription restoration time, including interrupted attempts.' };
	firstFailurePhase: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'First failed diagnostic phase: credentials, transport.connect, transport.reconnect, protocol.initialize, protocol.reconnect, protocol.authentication, or protocol.subscriptions. Absent if no phase failure was observed; preserved across later retries and cancellation. This is the recovery step, not necessarily the failed RPC method.' };
	firstFailureCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Known JSON-RPC or AHP error code on the first failed phase. Absent for unrecognized or missing codes; no messages or error data are included.' };
	credentialFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Failed credential preparation phases, including local cooldown rejections. Nested phase failures may overlap; not a count of HTTP requests.' };
	relayFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Failed transport establishment phases in this operation.' };
	protocolFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Failed initialization or reconnect phases, including fallback initialization failures; not a count of individual RPC requests.' };
	authenticationFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Failed authentication phases. May overlap nested credential preparation failures.' };
	restorationFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Failed subscription restoration phases in this operation.' };
	owner: 'osortega';
	comment: 'One outcome per logical sandbox connect or recovery, excluding reuse of a ready connection.';
};

type CloudSandboxProvisioningOutcomeEvent = {
	outcome: CloudSandboxConnectionOutcome;
	durationMs: number;
};

export type CloudSandboxProvisioningOutcomeClassification = {
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Success, failure, or cancellation of sandbox task/VM provisioning; success requires a usable environment/session binding, not connection readiness.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Client-observed task creation milliseconds, including account resolution, HTTP, response validation and failure cleanup. Excludes subsequent environment connection and repository preparation; not pure server provisioning time.' };
	owner: 'osortega';
	comment: 'One outcome per sandbox task creation, measured separately from connect and recovery.';
};

type CloudSandboxFirstSessionRequestEvent = {
	environmentKind: CloudSandboxEnvironmentKind;
	surface: CloudSandboxConnectionSurface;
	source: CloudSandboxConnectionSource;
	outcome: CloudSandboxConnectionOutcome;
	durationMs: number;
};

export type CloudSandboxFirstSessionRequestClassification = CloudSandboxEnvironmentClassification & {
	surface: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Editor or Agents window, on desktop or web; unknown when not supplied.' };
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Created or existing environment from the caller; does not imply warm or cold compute.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Outcome of the first session create, list, or subscribe request issued while ready; not turn completion.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds for the first post-readiness session request, excluding user idle time before it.' };
	owner: 'osortega';
	comment: 'At most one first session request sample per ready connection cycle, without issuing an extra request or recording its content.';
};

type CloudSandboxConnectionHealthEvent = {
	environmentKind: CloudSandboxEnvironmentKind;
	connectedMs: number;
	unexpectedDisconnects: number;
	receivedFrames: number;
};

export type CloudSandboxConnectionHealthClassification = CloudSandboxEnvironmentClassification & {
	connectedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Sum of authenticated ready connection milliseconds since the previous snapshot, excluding outages.' };
	unexpectedDisconnects: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Losses of previously ready connections; excludes initial retries and intentional teardown.' };
	receivedFrames: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Inbound relay WebSocket frames, including setup, recovery, control, malformed and chunk frames; not unique protocol messages.' };
	owner: 'osortega';
	comment: 'Delta sandbox connection exposure, unexpected losses and receive load, aggregated every five minutes with a final teardown flush.';
};

type CloudSandboxRequestsEvent = {
	action: string;
	windowMs: number;
	total: number;
	succeeded: number;
	waking: number;
	clientError: number;
	serverError: number;
	networkError: number;
	unexpectedStatus: number;
};

type CloudSandboxRequestsClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Which Mission Control operation was counted, including model discovery, task operations, and environment connections.' };
	windowMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds covered by these counts.' };
	total: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests issued for this action during the window.' };
	succeeded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that returned a success status.' };
	waking: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests answered with HTTP 202, meaning the sandbox environment was still waking.' };
	clientError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests rejected with a 4xx status.' };
	serverError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that failed with a 5xx status.' };
	networkError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that never produced a response, such as a timeout.' };
	unexpectedStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests answered with a status the client does not expect, such as 1xx or 3xx.' };
	owner: 'osortega';
	comment: 'Volume and outcome of the requests the cloud sandbox integration sends to GitHub Mission Control, used to size its load and detect runaway retry loops.';
};

type CloudSandboxRefreshStoppedEvent = {
	reason: string;
	consecutiveFailures: number;
	statusCode: number | undefined;
};

type CloudSandboxRefreshStoppedClassification = {
	reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Why the scheduler gave up: permanentError, consecutiveFailures, environmentWaking or unusableToken.' };
	consecutiveFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Consecutive unhealthy refresh cycles preceding the stop.' };
	statusCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP status that caused a permanent stop, when the stop was caused by a rejected request.' };
	owner: 'osortega';
	comment: 'Reports that credential refresh for a cloud sandbox connection stopped, so unrecoverable sandbox sessions can be distinguished from transient failures.';
};

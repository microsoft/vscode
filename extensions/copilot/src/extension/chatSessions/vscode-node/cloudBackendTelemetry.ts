/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';

/** Cloud agent backend version. v1 = Jobs API (PR-based), v2 = Task API (task-based). */
export type CloudBackendVersion = 'v1' | 'v2';

/** Outcome of a cloud backend funnel step. */
export type CloudBackendOutcome = 'success' | 'failure';

/**
 * Canonical operation names for cloud backend telemetry. Shared by both backends so v1 and v2
 * error/duration rates can be sliced by the same `operation` dimension.
 */
export type CloudBackendOperation =
	| 'createSession'
	| 'fetchSessionList'
	| 'fetchContent'
	| 'fetchEvents'
	| 'pollUpdate'
	| 'followUp'
	| 'findTaskForPullRequest'
	| 'createPullRequest';

const MAX_ERROR_MESSAGE_LENGTH = 300;

/**
 * Shared telemetry surface for the Cloud Agent backends. The whole point of this abstraction is
 * that the {@link JobsApiBackend} (v1) and {@link TaskApiBackend} (v2) emit *identical* funnel and
 * guardrail signals, each stamped with the backend version (`backendVersion`), so the
 * `chat.cloudAgentBackend.version` experiment can be monitored apples-to-apples and rolled back
 * the moment v2 regresses against v1.
 */
export interface ICloudBackendInstrumentation {
	readonly backendVersion: CloudBackendVersion;

	/** Funnel: a session/task creation attempt settled (success or failure). */
	sessionCreated(outcome: CloudBackendOutcome, durationMs: number, error?: unknown): void;

	/**
	 * Funnel: a session became active and started producing output — a PR became available (v1) or
	 * the task's first turn appeared (v2). `durationMs` is the time from creation to activation.
	 */
	sessionActivated(durationMs: number): void;

	/** Funnel: a follow-up / steer attempt settled (success or failure). */
	followUp(outcome: CloudBackendOutcome, error?: unknown): void;

	/**
	 * Guardrail: a backend operation failed. `status` is the HTTP status when known. This is the
	 * primary early-warning signal — a rising v2-vs-v1 error-rate delta should trigger rollback.
	 */
	operationFailed(operation: CloudBackendOperation, error: unknown, status?: number): void;

	/**
	 * Legacy v1 (Jobs API) event: a remote-agent job invocation started. Retained for dashboard
	 * continuity alongside the version-tagged {@link sessionCreated} signal. Emitted by the v1 backend only.
	 */
	legacyJobInvoke(hasHeadRef: boolean): void;

	/**
	 * Legacy v1 (Jobs API) event: a remote-agent job first returned pull request information. Retained
	 * for dashboard continuity alongside the version-tagged {@link sessionActivated} signal. v1 backend only.
	 */
	legacyJobPullRequestReady(): void;
}

/** Resolve a numeric HTTP status from an explicit value or a duck-typed `error.status`. */
function cloudHttpStatus(error: unknown, status?: number): number | undefined {
	if (typeof status === 'number') {
		return status;
	}
	const ducked = (error && typeof error === 'object' && 'status' in error)
		? (error as { status?: unknown }).status
		: undefined;
	return typeof ducked === 'number' ? ducked : undefined;
}

/** Extract a low-cardinality error classifier suitable for a telemetry/metric dimension. */
export function cloudErrorType(error: unknown, status?: number): string {
	const resolvedStatus = cloudHttpStatus(error, status);
	if (typeof resolvedStatus === 'number') {
		return `http_${resolvedStatus}`;
	}
	if (error instanceof Error) {
		return error.name || 'Error';
	}
	return 'unknown';
}

function errorMessageOf(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.length > MAX_ERROR_MESSAGE_LENGTH ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH) : message;
}

/**
 * Concrete instrumentation backed by {@link ITelemetryService} (MSFT telemetry events) and
 * {@link IOTelService} (OTel metrics). Constructed once in `CopilotCloudSessionsProvider` with the
 * resolved backend version and shared by whichever backend is active.
 */
export class CloudBackendInstrumentation implements ICloudBackendInstrumentation {

	constructor(
		public readonly backendVersion: CloudBackendVersion,
		private readonly _telemetryService: ITelemetryService,
		private readonly _otelService: IOTelService,
	) { }

	sessionCreated(outcome: CloudBackendOutcome, durationMs: number, error?: unknown): void {
		if (outcome === 'failure') {
			/* __GDPR__
				"copilotcloud.chat.sessionCreate" : {
					"owner": "osortega",
					"comment": "Cloud agent session/task creation outcome, used to compare the v1 (Jobs API) and v2 (Task API) backend versions.",
					"backendVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Cloud agent backend version: v1 (Jobs API) or v2 (Task API)." },
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether session creation succeeded or failed." },
					"errorType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Low-cardinality error classifier (e.g. http_500) when creation failed." },
					"errorMessage": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Error message when creation failed." },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in milliseconds from create attempt to failure." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('copilotcloud.chat.sessionCreate', {
				backendVersion: this.backendVersion,
				outcome,
				errorType: cloudErrorType(error),
				errorMessage: errorMessageOf(error),
			}, { durationMs });
		} else {
			/* __GDPR__
				"copilotcloud.chat.sessionCreate" : {
					"owner": "osortega",
					"comment": "Cloud agent session/task creation outcome, used to compare the v1 (Jobs API) and v2 (Task API) backend versions.",
					"backendVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Cloud agent backend version: v1 (Jobs API) or v2 (Task API)." },
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether session creation succeeded or failed." },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in milliseconds from create attempt to success." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.sessionCreate', {
				backendVersion: this.backendVersion,
				outcome,
			}, { durationMs });
		}
		GenAiMetrics.recordCloudOperation(this._otelService, 'createSession', this.backendVersion, outcome === 'success', durationMs);
	}

	sessionActivated(durationMs: number): void {
		/* __GDPR__
			"copilotcloud.chat.sessionActivated" : {
				"owner": "osortega",
				"comment": "Cloud agent session became active (PR available on v1, first turn on v2). Used to compare time-to-activation across backend versions.",
				"backendVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Cloud agent backend version: v1 (Jobs API) or v2 (Task API)." },
				"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in milliseconds from creation to activation." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.sessionActivated', {
			backendVersion: this.backendVersion,
		}, { durationMs });
		GenAiMetrics.recordCloudOperation(this._otelService, 'sessionActivated', this.backendVersion, true, durationMs);
		// pr_ready is a v1 (Jobs API) concept; v2 (Task API) activation is a first turn, not a PR becoming available.
		if (this.backendVersion === 'v1') {
			GenAiMetrics.incrementCloudPrReadyCount(this._otelService, this.backendVersion);
		}
	}

	followUp(outcome: CloudBackendOutcome, error?: unknown): void {
		if (outcome === 'failure') {
			/* __GDPR__
				"copilotcloud.chat.followup" : {
					"owner": "osortega",
					"comment": "Cloud agent follow-up/steer outcome, used to compare the v1 (Jobs API) and v2 (Task API) backend versions.",
					"backendVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Cloud agent backend version: v1 (Jobs API) or v2 (Task API)." },
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the follow-up succeeded or failed." },
					"errorType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Low-cardinality error classifier when the follow-up failed." },
					"errorMessage": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Error message when the follow-up failed." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('copilotcloud.chat.followup', {
				backendVersion: this.backendVersion,
				outcome,
				errorType: cloudErrorType(error),
				errorMessage: errorMessageOf(error),
			});
		} else {
			/* __GDPR__
				"copilotcloud.chat.followup" : {
					"owner": "osortega",
					"comment": "Cloud agent follow-up/steer outcome, used to compare the v1 (Jobs API) and v2 (Task API) backend versions.",
					"backendVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Cloud agent backend version: v1 (Jobs API) or v2 (Task API)." },
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the follow-up succeeded or failed." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.followup', {
				backendVersion: this.backendVersion,
				outcome,
			});
		}
		GenAiMetrics.recordCloudOperation(this._otelService, 'followUp', this.backendVersion, outcome === 'success');
	}

	operationFailed(operation: CloudBackendOperation, error: unknown, status?: number): void {
		const resolvedStatus = cloudHttpStatus(error, status);
		const errorType = cloudErrorType(error, resolvedStatus);
		/* __GDPR__
			"copilotcloud.chat.operationError" : {
				"owner": "osortega",
				"comment": "A cloud agent backend operation failed. Primary guardrail signal for the v1/v2 rollout — a rising v2-vs-v1 error rate should trigger rollback.",
				"backendVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Cloud agent backend version: v1 (Jobs API) or v2 (Task API)." },
				"operation": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The backend operation that failed (e.g. fetchSessionList, createPullRequest)." },
				"errorType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Low-cardinality error classifier (e.g. http_500)." },
				"errorMessage": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The error message." },
				"status": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "HTTP status code when known." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryErrorEvent('copilotcloud.chat.operationError', {
			backendVersion: this.backendVersion,
			operation,
			errorType,
			errorMessage: errorMessageOf(error),
		}, resolvedStatus !== undefined ? { status: resolvedStatus } : undefined);
		GenAiMetrics.incrementCloudError(this._otelService, operation, this.backendVersion, errorType);
	}

	legacyJobInvoke(hasHeadRef: boolean): void {
		/* __GDPR__
			"copilotcloud.chat.remoteAgentJobInvoke" : {
				"owner": "joshspicer",
				"comment": "Event sent when a remote agent job invocation starts.",
				"hasHeadRef": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether a head ref was provided for delegation." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.remoteAgentJobInvoke', {
			hasHeadRef: String(hasHeadRef),
		});
	}

	legacyJobPullRequestReady(): void {
		/* __GDPR__
			"copilotcloud.chat.remoteAgentJobPullRequestReady" : {
				"owner": "joshspicer",
				"comment": "Event sent when a remote agent job first returns pull request information."
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.remoteAgentJobPullRequestReady');
	}
}

/** No-op instrumentation for tests and callers that don't wire telemetry. */
export const NullCloudBackendInstrumentation: ICloudBackendInstrumentation = {
	backendVersion: 'v1',
	sessionCreated() { /* no-op */ },
	sessionActivated() { /* no-op */ },
	followUp() { /* no-op */ },
	operationFailed() { /* no-op */ },
	legacyJobInvoke() { /* no-op */ },
	legacyJobPullRequestReady() { /* no-op */ },
};

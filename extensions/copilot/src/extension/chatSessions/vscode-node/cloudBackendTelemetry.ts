/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';

export type CloudBackendOutcome = 'success' | 'failure';

export type CloudBackendOperation =
	| 'createSession'
	| 'fetchSessionList'
	| 'fetchContent'
	| 'fetchEvents'
	| 'pollUpdate'
	| 'followUp'
	| 'createPullRequest';

const MAX_ERROR_MESSAGE_LENGTH = 300;

export interface ICloudBackendInstrumentation {
	sessionCreated(outcome: CloudBackendOutcome, durationMs: number, error?: unknown): void;
	sessionActivated(durationMs: number): void;
	followUp(outcome: CloudBackendOutcome, error?: unknown): void;
	operationFailed(operation: CloudBackendOperation, error: unknown, status?: number): void;
}

function cloudHttpStatus(error: unknown, status?: number): number | undefined {
	if (typeof status === 'number') {
		return status;
	}
	const ducked = (error && typeof error === 'object' && 'status' in error)
		? (error as { status?: unknown }).status
		: undefined;
	return typeof ducked === 'number' ? ducked : undefined;
}

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

export class CloudBackendInstrumentation implements ICloudBackendInstrumentation {

	constructor(
		private readonly _telemetryService: ITelemetryService,
		private readonly _otelService: IOTelService,
	) { }

	sessionCreated(outcome: CloudBackendOutcome, durationMs: number, error?: unknown): void {
		if (outcome === 'failure') {
			/* __GDPR__
				"copilotcloud.chat.sessionCreate" : {
					"owner": "osortega",
					"comment": "Cloud agent task creation outcome.",
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether task creation succeeded or failed." },
					"errorType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Low-cardinality error classifier (e.g. http_500) when creation failed." },
					"errorMessage": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Error message when creation failed." },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in milliseconds from create attempt to failure." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('copilotcloud.chat.sessionCreate', {
				outcome,
				errorType: cloudErrorType(error),
				errorMessage: errorMessageOf(error),
			}, { durationMs });
		} else {
			/* __GDPR__
				"copilotcloud.chat.sessionCreate" : {
					"owner": "osortega",
					"comment": "Cloud agent task creation outcome.",
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether task creation succeeded or failed." },
					"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in milliseconds from create attempt to success." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.sessionCreate', { outcome }, { durationMs });
		}
		GenAiMetrics.recordCloudOperation(this._otelService, 'createSession', outcome === 'success', durationMs);
	}

	sessionActivated(durationMs: number): void {
		/* __GDPR__
			"copilotcloud.chat.sessionActivated" : {
				"owner": "osortega",
				"comment": "Cloud agent task started producing output.",
				"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in milliseconds from creation to activation." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.sessionActivated', {}, { durationMs });
		GenAiMetrics.recordCloudOperation(this._otelService, 'sessionActivated', true, durationMs);
	}

	followUp(outcome: CloudBackendOutcome, error?: unknown): void {
		if (outcome === 'failure') {
			/* __GDPR__
				"copilotcloud.chat.followup" : {
					"owner": "osortega",
					"comment": "Cloud agent steer outcome.",
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the follow-up succeeded or failed." },
					"errorType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Low-cardinality error classifier when the follow-up failed." },
					"errorMessage": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Error message when the follow-up failed." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('copilotcloud.chat.followup', {
				outcome,
				errorType: cloudErrorType(error),
				errorMessage: errorMessageOf(error),
			});
		} else {
			/* __GDPR__
				"copilotcloud.chat.followup" : {
					"owner": "osortega",
					"comment": "Cloud agent steer outcome.",
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the follow-up succeeded or failed." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.followup', { outcome });
		}
		GenAiMetrics.recordCloudOperation(this._otelService, 'followUp', outcome === 'success');
	}

	operationFailed(operation: CloudBackendOperation, error: unknown, status?: number): void {
		const resolvedStatus = cloudHttpStatus(error, status);
		const errorType = cloudErrorType(error, resolvedStatus);
		/* __GDPR__
			"copilotcloud.chat.operationError" : {
				"owner": "osortega",
				"comment": "A cloud agent task operation failed.",
				"operation": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The task operation that failed (e.g. fetchSessionList, createPullRequest)." },
				"errorType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Low-cardinality error classifier (e.g. http_500)." },
				"errorMessage": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The error message." },
				"status": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "HTTP status code when known." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryErrorEvent('copilotcloud.chat.operationError', {
			operation,
			errorType,
			errorMessage: errorMessageOf(error),
		}, resolvedStatus !== undefined ? { status: resolvedStatus } : undefined);
		GenAiMetrics.incrementCloudError(this._otelService, operation, errorType);
	}
}

export const NullCloudBackendInstrumentation: ICloudBackendInstrumentation = {
	sessionCreated() { },
	sessionActivated() { },
	followUp() { },
	operationFailed() { },
};

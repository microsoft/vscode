/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IConnectionDiagnosticError } from './connectionDiagnostics.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from './state/protocol/errors.js';

type ConnectionTelemetryErrorCategory = 'authentication' | 'authorization' | 'notFound' | 'offline' | 'timeout' | 'cancelled' | 'connectionClosed' | 'dns' | 'tls' | 'network' | 'throttled' | 'httpClient' | 'httpServer' | 'protocol' | 'unknown';

export interface IConnectionTelemetryError {
	readonly errorCategory?: ConnectionTelemetryErrorCategory;
	readonly errorCode?: number;
	readonly statusCode?: number;
}

export type ConnectionTelemetryErrorClassification = {
	errorCategory?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted failure category derived from structured codes, never error text.' };
	errorCode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Known JSON-RPC or AHP error code; arbitrary server codes are omitted.' };
	statusCode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Validated HTTP status from the failure or its bounded cause chain.' };
};

const knownProtocolCodes = [...Object.values(JsonRpcErrorCodes), ...Object.values(AhpErrorCodes)];

/** Reads structured metadata only; diagnostic messages, names, request IDs and details are never returned. */
export function getConnectionTelemetryError(error: IConnectionDiagnosticError | undefined): IConnectionTelemetryError {
	if (!error) {
		return {};
	}
	let errorCode: number | undefined;
	let statusCode: number | undefined;
	let errorCategory: ConnectionTelemetryErrorCategory = 'unknown';
	for (let current: IConnectionDiagnosticError | undefined = error, depth = 0; current && depth < 3; current = current.cause, depth++) {
		const code = knownProtocolCodes.find(code => String(code) === current?.code);
		const status = typeof current.status === 'number' && Number.isInteger(current.status) && current.status >= 100 && current.status <= 599 ? current.status : undefined;
		errorCode ??= code;
		statusCode ??= status;
		let category: ConnectionTelemetryErrorCategory | undefined;
		if (code === AhpErrorCodes.AuthRequired || status === 401) {
			category = 'authentication';
		} else if (code === AhpErrorCodes.PermissionDenied || status === 403) {
			category = 'authorization';
		} else if (code === AhpErrorCodes.NotFound || code === AhpErrorCodes.SessionNotFound || code === AhpErrorCodes.ProviderNotFound || status === 404) {
			category = 'notFound';
		} else if (current.name === 'Canceled' || current.name === 'AbortError') {
			category = 'cancelled';
		} else if (current.name === 'TimeoutError' || current.code === 'ETIMEDOUT' || current.code === 'UND_ERR_CONNECT_TIMEOUT' || status === 408 || status === 504) {
			category = 'timeout';
		} else if (current.code === '-32000') {
			category = 'connectionClosed';
		} else if (current.code === 'ENOTFOUND' || current.code === 'EAI_AGAIN') {
			category = 'dns';
		} else if (current.code === 'CERT_HAS_EXPIRED' || current.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || current.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || current.code === 'ERR_TLS_CERT_ALTNAME_INVALID'
			|| current.code === 'SELF_SIGNED_CERT_IN_CHAIN' || current.code === 'UNABLE_TO_GET_ISSUER_CERT' || current.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || current.code === 'CERT_UNTRUSTED') {
			category = 'tls';
		} else if (current.code === 'ECONNRESET' || current.code === 'ECONNREFUSED' || current.code === 'ENETUNREACH' || current.code === 'EHOSTUNREACH' || current.code === 'EPIPE' || current.code === 'UND_ERR_SOCKET') {
			category = 'network';
		} else if (status === 429) {
			category = 'throttled';
		} else if (status !== undefined && status >= 500 && status <= 599) {
			category = 'httpServer';
		} else if (status !== undefined && status >= 400 && status <= 499) {
			category = 'httpClient';
		}
		if (errorCategory === 'unknown' && category) {
			errorCategory = category;
		}
	}
	if (errorCategory === 'unknown' && errorCode !== undefined) {
		errorCategory = 'protocol';
	}
	return {
		errorCategory,
		...(errorCode === undefined ? {} : { errorCode }),
		...(statusCode === undefined ? {} : { statusCode }),
	};
}

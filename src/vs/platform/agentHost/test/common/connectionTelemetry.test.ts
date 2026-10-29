/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getConnectionDiagnosticError, type IConnectionDiagnosticError } from '../../common/connectionDiagnostics.js';
import { getConnectionTelemetryError, type ConnectionTelemetryErrorClassification } from '../../common/connectionTelemetry.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../common/state/protocol/errors.js';

suite('Connection telemetry privacy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies only known structured metadata, including nested network failures', () => {
		const errors = [
			undefined,
			{ code: AhpErrorCodes.AuthRequired },
			{ code: AhpErrorCodes.PermissionDenied },
			{ code: AhpErrorCodes.SessionNotFound },
			{ code: JsonRpcErrorCodes.InvalidParams },
			{ code: -32000 },
			{ code: 'ETIMEDOUT' },
			{ name: 'AbortError' },
			{ status: 429 },
			{ status: 503 },
			{ status: 400 },
			{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' },
			{ cause: { code: 'ENOTFOUND', message: 'secret host.example.com' } },
			{ cause: { code: 'ECONNRESET' } },
			{ cause: { response: { status: 403 } } },
		];
		assert.deepStrictEqual(errors.map(error => getConnectionTelemetryError(error === undefined ? undefined : getConnectionDiagnosticError(error))), [
			{},
			{ errorCategory: 'authentication', errorCode: AhpErrorCodes.AuthRequired },
			{ errorCategory: 'authorization', errorCode: AhpErrorCodes.PermissionDenied },
			{ errorCategory: 'notFound', errorCode: AhpErrorCodes.SessionNotFound },
			{ errorCategory: 'protocol', errorCode: JsonRpcErrorCodes.InvalidParams },
			{ errorCategory: 'connectionClosed' },
			{ errorCategory: 'timeout' },
			{ errorCategory: 'cancelled' },
			{ errorCategory: 'throttled', statusCode: 429 },
			{ errorCategory: 'httpServer', statusCode: 503 },
			{ errorCategory: 'httpClient', statusCode: 400 },
			{ errorCategory: 'tls' },
			{ errorCategory: 'dns' },
			{ errorCategory: 'network' },
			{ errorCategory: 'authorization', statusCode: 403 },
		]);
	});

	test('drops private messages, arbitrary codes, names, request IDs and invalid statuses', () => {
		const errors: IConnectionDiagnosticError[] = [
			{ name: 'alice@example.com', message: '/Users/alice/private.txt Bearer secret', code: 'private-code', requestId: 'private-request' },
			{ name: 'Error', message: 'authentication timeout ENOTFOUND 401', code: '-12345', status: 999 },
			{ name: 'Error', message: 'private', code: '-32603/private', status: 503.5 },
			{ name: 'Error', message: 'private', status: Number.NaN },
		];
		assert.deepStrictEqual(errors.map(getConnectionTelemetryError), errors.map(() => ({ errorCategory: 'unknown' })));
	});

	test('bounds cyclic causes and preserves a known outer protocol code with an actionable cause', () => {
		const cyclic: IConnectionDiagnosticError & { cause?: IConnectionDiagnosticError } = { name: 'Error', message: 'private' };
		cyclic.cause = cyclic;
		assert.deepStrictEqual([
			getConnectionTelemetryError(cyclic),
			getConnectionTelemetryError({ name: 'Error', message: 'private', code: String(JsonRpcErrorCodes.InternalError), cause: { name: 'Error', message: 'private', code: 'EAI_AGAIN' } }),
		], [
			{ errorCategory: 'unknown' },
			{ errorCategory: 'dns', errorCode: JsonRpcErrorCodes.InternalError },
		]);
	});

	test('classifies numeric telemetry fields as measurements and categories as properties', () => {
		type ClassifiedSample<T> = { [K in keyof T]: NonNullable<T[K]> extends { isMeasurement: true } ? number : string };
		const sample: ClassifiedSample<ConnectionTelemetryErrorClassification> = {
			errorCategory: 'authorization', errorCode: AhpErrorCodes.PermissionDenied, statusCode: 403,
		};
		assert.deepStrictEqual(sample, { errorCategory: 'authorization', errorCode: -32009, statusCode: 403 });
	});
});

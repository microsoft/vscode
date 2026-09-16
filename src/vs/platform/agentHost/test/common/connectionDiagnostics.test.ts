/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConnectionDiagnosticBuffer, ConnectionDiagnosticOperation, formatConnectionDiagnosticError, getConnectionDiagnosticError, IConnectionDiagnosticEvent, sanitizeConnectionDiagnosticText, traceConnectionOperation } from '../../common/connectionDiagnostics.js';

suite('Connection diagnostic evidence', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('redacts known credentials before truncating error descriptions', () => {
		const error = Object.assign(new Error('TLS failed https://user:pass@relay.test/connect?token=secret#fragment\nAuthorization: Bearer private-value cookie=sessionid=private'), {
			code: 'ECONNRESET', statusCode: 502, requestId: 'request-123',
			cause: new Error('certificate expired'),
		});
		const diagnostic = getConnectionDiagnosticError(error);
		assert.deepStrictEqual({
			name: diagnostic.name,
			code: diagnostic.code,
			status: diagnostic.status,
			requestId: diagnostic.requestId,
			cause: diagnostic.cause?.message,
			secrets: /user:pass|token=secret|Bearer private|sessionid=private|fragment|\n/.test(diagnostic.message),
			bounded: sanitizeConnectionDiagnosticText('x'.repeat(2000)).length,
		}, {
			name: 'Error', code: 'ECONNRESET', status: 502, requestId: 'request-123', cause: 'certificate expired', secrets: false, bounded: 1024,
		});
	});

	test('preserves useful nested failure metadata without serializing response bodies', () => {
		const diagnostic = getConnectionDiagnosticError({
			name: 'TunnelError', message: 'Relay handshake rejected', response: { status: 403, body: 'private response', headers: { authorization: 'private' } },
			cause: { code: 'EAI_AGAIN', message: 'Name lookup failed' },
			requestId: 'not a valid identifier',
		});
		assert.deepStrictEqual({
			text: formatConnectionDiagnosticError(diagnostic),
			requestId: diagnostic.requestId,
		}, {
			text: 'TunnelError: Relay handshake rejected; HTTP 403; cause: Error: Name lookup failed; code=EAI_AGAIN',
			requestId: undefined,
		});
	});

	test('extracts correlation IDs only from the known response header fields', () => {
		const diagnostic = getConnectionDiagnosticError({
			message: 'request rejected',
			response: { status: 403, headers: { 'x-ms-request-id': 'correlation-123', 'authorization': 'secret' } },
		});
		assert.deepStrictEqual({ requestId: diagnostic.requestId, status: diagnostic.status, secret: JSON.stringify(diagnostic).includes('secret') }, {
			requestId: 'correlation-123', status: 403, secret: false,
		});
	});

	test('records a pending stage before awaiting, then completion with the same operation ID', async () => {
		const events: IConnectionDiagnosticEvent[] = [];
		const operation = new DeferredPromise<number>();
		const result = traceConnectionOperation(event => events.push(event), 'relay.connect', () => operation.p);
		assert.deepStrictEqual(events.map(event => [event.phase, event.outcome]), [['relay.connect', 'started']]);
		await operation.complete(42);
		assert.strictEqual(await result, 42);
		assert.deepStrictEqual({
			outcomes: events.map(event => event.outcome),
			sameId: events[0].operationId === events[1].operationId,
			duration: typeof events[1].durationMs,
		}, { outcomes: ['started', 'succeeded'], sameId: true, duration: 'number' });
	});

	test('records the failed stage but rethrows the identical error', async () => {
		const events: IConnectionDiagnosticEvent[] = [];
		const error = new Error('WebSocket handshake failed');
		await assert.rejects(traceConnectionOperation(event => events.push(event), 'relay.websocket', async () => { throw error; }), caught => caught === error);
		assert.deepStrictEqual(events.map(event => ({ phase: event.phase, outcome: event.outcome, error: event.error?.message })), [
			{ phase: 'relay.websocket', outcome: 'started', error: undefined },
			{ phase: 'relay.websocket', outcome: 'failed', error: 'WebSocket handshake failed' },
		]);
	});

	test('observer exceptions are reported without replacing operation outcomes', async () => {
		const previous = errorHandler.getUnexpectedErrorHandler();
		const reported: Error[] = [];
		const observerError = new Error('observer failed');
		const operationError = new Error('operation failed');
		const events: string[] = [];
		setUnexpectedErrorHandler(error => reported.push(error));
		try {
			const observer = (event: IConnectionDiagnosticEvent) => {
				events.push(event.outcome);
				throw observerError;
			};
			const value = await traceConnectionOperation(observer, 'success', async () => 42);
			await assert.rejects(traceConnectionOperation(observer, 'failure', async () => { throw operationError; }), error => error === operationError);
			assert.deepStrictEqual({ value, events, reported }, {
				value: 42,
				events: ['started', 'succeeded', 'started', 'failed'],
				reported: [observerError, observerError, observerError, observerError],
			});
		} finally {
			setUnexpectedErrorHandler(previous);
		}
	});

	test('records operation details and attempt context without wrapping the operation', () => {
		const events: IConnectionDiagnosticEvent[] = [];
		const diagnostic = new ConnectionDiagnosticOperation(event => events.push({ ...event, attemptId: 'attempt' }), 'factory', 'userInitiated=true');
		diagnostic.succeeded('clientId=client');
		assert.deepStrictEqual({
			sameOperation: events[0].operationId === events[1].operationId,
			events: events.map(event => [event.outcome, event.attemptId, event.detail]),
		}, {
			sameOperation: true,
			events: [['started', 'attempt', 'userInitiated=true'], ['succeeded', 'attempt', 'clientId=client']],
		});
	});

	test('manual completion uses the same bounded error conversion as traced operations', () => {
		const events: IConnectionDiagnosticEvent[] = [];
		const diagnostic = new ConnectionDiagnosticOperation(event => events.push(event), 'factory');
		diagnostic.failed(new Error('Failed with token=private'));
		assert.deepStrictEqual({
			outcomes: events.map(event => event.outcome),
			sameOperation: events[0].operationId === events[1].operationId,
			error: events[1].error?.message,
		}, { outcomes: ['started', 'failed'], sameOperation: true, error: 'Failed with token=[redacted]' });
	});

	test('bounds event retention without changing chronological order', () => {
		const buffer = new ConnectionDiagnosticBuffer();
		for (let i = 0; i < 205; i++) {
			buffer.record('tunnel:test', { operationId: String(i), timestamp: i, phase: 'relay.connect', outcome: 'started' });
		}
		const events = buffer.getEvents();
		assert.deepStrictEqual({ count: events.length, first: events[0].operationId, last: events.at(-1)?.operationId }, { count: 200, first: '5', last: '204' });
	});
});

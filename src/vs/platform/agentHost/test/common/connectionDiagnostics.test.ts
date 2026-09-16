/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConnectionDiagnosticBuffer, formatConnectionDiagnosticError, getConnectionDiagnosticError, IConnectionDiagnosticEvent, sanitizeConnectionDiagnosticText, traceConnectionOperation } from '../../common/connectionDiagnostics.js';

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

	test('bounds event retention without changing chronological order', () => {
		const buffer = new ConnectionDiagnosticBuffer();
		for (let i = 0; i < 205; i++) {
			buffer.record('tunnel:test', { operationId: String(i), timestamp: i, phase: 'relay.connect', outcome: 'started' });
		}
		const events = buffer.getEvents();
		assert.deepStrictEqual({ count: events.length, first: events[0].operationId, last: events.at(-1)?.operationId }, { count: 200, first: '5', last: '204' });
	});
});

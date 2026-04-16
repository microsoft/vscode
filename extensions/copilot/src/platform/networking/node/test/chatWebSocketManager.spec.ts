/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// NOTE: When a handle.done or handle.firstEvent promise is expected to reject,
// attach .catch(() => {}) BEFORE the action that triggers the rejection.
// Otherwise Vitest reports an unhandled rejection even if the test later
// uses `await expect(...).rejects.toThrow()`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { TestLogService } from '../../../testing/common/testLogService';
import { HeadersImpl, WebSocketConnection } from '../../common/fetcherService';
import { CAPIWebSocketErrorEvent, ChatWebSocketManager, isCAPIWebSocketError } from '../chatWebSocketManager';

class FakeWebSocket extends EventTarget {
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;
	readyState = this.CONNECTING;
	readonly sent: string[] = [];

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.readyState = this.CLOSED;
	}

	simulateOpen(): void {
		this.readyState = this.OPEN;
		this.dispatchEvent(new Event('open'));
	}

	simulateMessage(data: string): void {
		this.dispatchEvent(Object.assign(new Event('message'), { data }));
	}
}

function createFakeCAPIClientService(ws: FakeWebSocket): ICAPIClientService {
	return {
		createResponsesWebSocket: async () => ({
			webSocket: ws as unknown as WebSocket,
			responseHeaders: new HeadersImpl({}),
			responseStatusCode: 101,
			responseStatusText: 'Switching Protocols',
			networkError: undefined,
		} satisfies WebSocketConnection as unknown as WebSocketConnection),
	} as unknown as ICAPIClientService;
}

describe('ChatWebSocketManager', () => {
	let disposables: DisposableStore;
	let ws: FakeWebSocket;
	let manager: ChatWebSocketManager;

	beforeEach(() => {
		disposables = new DisposableStore();
		ws = new FakeWebSocket();
	});

	afterEach(() => {
		disposables.dispose();
	});

	async function getConnection(headers: Record<string, string> = {}) {
		manager = new ChatWebSocketManager(
			new TestLogService(),
			createFakeCAPIClientService(ws),
			new NullTelemetryService(),
			{ getConfig: () => undefined } as unknown as IConfigurationService,
		);
		disposables.add(manager);
		const connection = manager.getOrCreateConnection('conv-1', headers, 'req-conn');
		const connectPromise = connection.connect();
		// Defer open event to allow connect() to attach listeners first
		await Promise.resolve();
		ws.simulateOpen();
		await connectPromise;
		return connection;
	}

	const completedEvent = JSON.stringify({ type: 'response.completed', response: { id: 'resp-1' } });

	describe('cross-turn connection reuse', () => {
		it('reuses an open connection across different turns', async () => {
			const connection = await getConnection();

			// Request a connection for a new turn — should return the same object
			const connection2 = manager.getOrCreateConnection('conv-1', {}, 'req-conn-2');
			expect(connection2).toBe(connection);
			expect(manager.hasActiveConnection('conv-1')).toBe(true);
		});

		it('creates a new connection when the previous one is closed', async () => {
			const connection = await getConnection();
			connection.dispose();

			// Same manager, new getOrCreateConnection call should replace the disposed one
			const connection2 = manager.getOrCreateConnection('conv-1', {}, 'req-conn-2');
			expect(connection2).not.toBe(connection);
		});

		it('hasActiveConnection returns true regardless of current turnId', async () => {
			await getConnection(); // connected on turn-1
			expect(manager.hasActiveConnection('conv-1')).toBe(true);
		});

		it('hasActiveConnection returns false after connection is disposed', async () => {
			const connection = await getConnection();
			connection.dispose();
			expect(manager.hasActiveConnection('conv-1')).toBe(false);
		});
	});

	describe('initiator field on response.create message', () => {
		it('sets initiator to "user" when userInitiated is true', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			expect(ws.sent).toHaveLength(1);
			const message = JSON.parse(ws.sent[0]);
			expect(message.initiator).toBe('user');
			expect(message.type).toBe('response.create');

			ws.simulateMessage(completedEvent);
			await handle.done;
		});

		it('sets initiator to "agent" when userInitiated is false', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: false, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			expect(ws.sent).toHaveLength(1);
			const message = JSON.parse(ws.sent[0]);
			expect(message.initiator).toBe('agent');

			ws.simulateMessage(completedEvent);
			await handle.done;
		});

		it('strips the stream property from the message', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			const message = JSON.parse(ws.sent[0]);
			expect(message.stream).toBeUndefined();
			expect(message.model).toBe('test-model');

			ws.simulateMessage(completedEvent);
			await handle.done;
		});
	});

	describe('firstEvent promise', () => {
		it('resolves with the first stream event', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			const textDelta = JSON.stringify({ type: 'response.output_text.delta', delta: 'hello' });
			ws.simulateMessage(textDelta);

			const first = await handle.firstEvent;
			expect(first.type).toBe('response.output_text.delta');
			expect(isCAPIWebSocketError(first)).toBe(false);

			ws.simulateMessage(completedEvent);
			await handle.done;
		});

		it('resolves with CAPI error when that is the first message', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			const capiError = JSON.stringify({ type: 'error', error: { code: 'rate_limited', message: 'Too many requests' } });
			const donePromise = handle.done.catch(() => { });
			ws.simulateMessage(capiError);

			const first = await handle.firstEvent;
			expect(isCAPIWebSocketError(first)).toBe(true);
			expect((first as CAPIWebSocketErrorEvent).error.code).toBe('rate_limited');

			await expect(handle.done).rejects.toThrow('Too many requests');
			await donePromise;
		});

		it('rejects when connection closes before any event', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			handle.firstEvent.catch(() => { });
			handle.done.catch(() => { });
			ws.dispatchEvent(Object.assign(new Event('close'), { code: 1006, reason: '', wasClean: false }));

			await expect(handle.firstEvent).rejects.toThrow();
			await expect(handle.done).rejects.toThrow();
		});
	});

	describe('CAPI error handling', () => {
		it('fires onCAPIError for nested CAPI error events', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			const capiErrors: CAPIWebSocketErrorEvent[] = [];
			handle.onCAPIError(e => capiErrors.push(e));

			const capiError = JSON.stringify({ type: 'error', error: { code: 'quota_exceeded', message: 'Monthly quota exceeded' } });
			handle.done.catch(() => { });
			ws.simulateMessage(capiError);

			expect(capiErrors).toHaveLength(1);
			expect(capiErrors[0].error.code).toBe('quota_exceeded');
			expect(capiErrors[0].error.message).toBe('Monthly quota exceeded');

			await expect(handle.done).rejects.toThrow('Monthly quota exceeded');
		});

		it('does not fire onEvent for CAPI error events', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			const events: unknown[] = [];
			handle.onEvent(e => events.push(e));

			const capiError = JSON.stringify({ type: 'error', error: { code: 'rate_limited', message: 'Rate limited' } });
			handle.done.catch(() => { });
			ws.simulateMessage(capiError);

			expect(events).toHaveLength(0);
			await expect(handle.done).rejects.toThrow();
		});

		it('includes copilot_quota_snapshots when present', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			const capiErrors: CAPIWebSocketErrorEvent[] = [];
			handle.onCAPIError(e => capiErrors.push(e));

			const capiError = JSON.stringify({
				type: 'error',
				error: { code: 'quota_exceeded', message: 'Quota exceeded' },
				copilot_quota_snapshots: {
					'premium-chat-requests': {
						entitlement: '300',
						percent_remaining: 0,
						overage_permitted: false,
						overage_count: 0,
					}
				}
			});
			handle.done.catch(() => { });
			ws.simulateMessage(capiError);

			expect(capiErrors[0].copilot_quota_snapshots).toBeDefined();
			expect(capiErrors[0].copilot_quota_snapshots!['premium-chat-requests'].percent_remaining).toBe(0);

			await expect(handle.done).rejects.toThrow();
		});
	});

	describe('stateful marker', () => {
		it('updates statefulMarker on response.completed', async () => {
			const connection = await getConnection();
			expect(connection.statefulMarker).toBeUndefined();

			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			ws.simulateMessage(completedEvent);
			await handle.done;

			expect(connection.statefulMarker).toBe('resp-1');
		});

		it('does not update statefulMarker on CAPI error', async () => {
			const connection = await getConnection();
			const cts = disposables.add(new CancellationTokenSource());
			const handle = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts.token,
			);

			const capiError = JSON.stringify({ type: 'error', error: { code: 'rate_limited', message: 'Rate limited' } });
			const donePromise = handle.done.catch(() => { });
			ws.simulateMessage(capiError);

			expect(connection.statefulMarker).toBeUndefined();
			await expect(handle.done).rejects.toThrow();
			await donePromise;
		});
	});

	describe('active request lifecycle', () => {
		it('supersedes an active request when a new one starts', async () => {
			const connection = await getConnection();
			const cts1 = disposables.add(new CancellationTokenSource());
			const handle1 = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts1.token,
			);

			// Start a second request before the first completes
			handle1.done.catch(() => { });
			handle1.firstEvent.catch(() => { });
			const cts2 = disposables.add(new CancellationTokenSource());
			const handle2 = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: false, turnId: 'turn-2', requestId: 'req-2', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts2.token,
			);

			// First request should be superseded
			await expect(handle1.done).rejects.toThrow('superseded');

			// Second request completes normally
			ws.simulateMessage(completedEvent);
			await handle2.done;
		});

		it('does not supersede a completed request when a new one starts', async () => {
			const connection = await getConnection();
			const cts1 = disposables.add(new CancellationTokenSource());
			const handle1 = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: true, turnId: 'turn-1', requestId: 'req-1', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts1.token,
			);

			// Complete the first request
			ws.simulateMessage(completedEvent);
			await handle1.done;

			// Start a second request — first was already done, so no supersede
			const cts2 = disposables.add(new CancellationTokenSource());
			const handle2 = connection.sendRequest(
				{ model: 'test-model', messages: [], stream: true },
				{ userInitiated: false, turnId: 'turn-2', requestId: 'req-2', model: 'test-model', countTokens: () => Promise.resolve(0), tokenCountMax: 4096, modelMaxPromptTokens: 128000 },
				cts2.token,
			);

			const completedEvent2 = JSON.stringify({ type: 'response.completed', response: { id: 'resp-2' } });
			ws.simulateMessage(completedEvent2);
			await handle2.done;

			expect(connection.statefulMarker).toBe('resp-2');
		});
	});

	describe('isCAPIWebSocketError', () => {
		it('returns true for nested CAPI error shape', () => {
			const event = { type: 'error' as const, error: { code: 'rate_limited', message: 'test' } };
			expect(isCAPIWebSocketError(event)).toBe(true);
		});

		it('returns false for flat OpenAI error shape', () => {
			const event = { type: 'error' as const, code: 'server_error', message: 'test', param: null, sequence_number: 0 };
			expect(isCAPIWebSocketError(event)).toBe(false);
		});

		it('returns false for non-error event types', () => {
			const event = { type: 'response.created' as const, response: {} };
			expect(isCAPIWebSocketError(event as any)).toBe(false);
		});
	});
});

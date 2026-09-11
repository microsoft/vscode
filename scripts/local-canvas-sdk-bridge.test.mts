/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import type { CopilotSession, SessionEvent, SessionEventHandler, SessionEventPayload, SessionEventType, TypedSessionEventHandler } from 'vscode-canvas-development-sdk';
import type { SessionEvent as HostSessionEvent } from '@github/copilot-sdk';
import { DisposableStore, toDisposable } from '../src/vs/base/common/lifecycle.js';
import { upcastDeepPartial, upcastPartial } from '../src/vs/base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../src/vs/base/test/common/utils.js';
import { adaptSession } from './local-canvas-sdk-bridge.mts';

type TestEventType = 'assistant.message_delta' | 'assistant.reasoning_delta' | 'tool.execution_progress' | 'session.permissions_changed' | 'session.retained';
type TestEvent = { [T in TestEventType]: Pick<SessionEventPayload<T>, 'type' | 'data'> }[TestEventType];

function event(payload: TestEvent): SessionEvent {
	return { ...payload, id: 'event', timestamp: '2026-09-10T00:00:00.000Z', parentId: null, ephemeral: true };
}

function isEventType<K extends SessionEventType>(event: SessionEvent, type: K): event is SessionEventPayload<K> {
	return event.type === type;
}

function sessionFixture() {
	const globalHandlers = new Set<SessionEventHandler>();
	const typedHandlers = new Map<SessionEventType, Set<SessionEventHandler>>();
	const registrations: (SessionEventType | 'all')[] = [];
	const history: SessionEvent[] = [];
	let delivered = 0;
	function on<K extends SessionEventType>(type: K, handler: TypedSessionEventHandler<K>): () => void;
	function on(handler: SessionEventHandler): () => void;
	function on<K extends SessionEventType>(typeOrHandler: K | SessionEventHandler, handler?: TypedSessionEventHandler<K>): () => void {
		const type = typeof typeOrHandler === 'function' ? 'all' : typeOrHandler;
		registrations.push(type);
		const listeners = type === 'all' ? globalHandlers : typedHandlers.get(type) ?? new Set<SessionEventHandler>();
		if (type !== 'all') {
			typedHandlers.set(type, listeners);
		}
		const listener: SessionEventHandler = typeof typeOrHandler === 'function' ? typeOrHandler : event => {
			if (handler && isEventType(event, typeOrHandler)) {
				handler(event);
			}
		};
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
			if (type !== 'all' && listeners.size === 0) {
				typedHandlers.delete(type);
			}
		};
	}
	const session = upcastPartial<CopilotSession>({
		sessionId: 'sdk-session',
		on,
		getEvents: async () => history,
		rpc: upcastDeepPartial<CopilotSession['rpc']>({ tasks: { list: async () => ({ tasks: [] }) } }),
		disconnect: async () => {
			globalHandlers.clear();
			typedHandlers.clear();
		},
	});
	return {
		session: adaptSession(session), history, registrations,
		emit: (event: SessionEvent) => {
			for (const handler of [...globalHandlers, ...(typedHandlers.get(event.type) ?? [])]) {
				delivered++;
				handler(event);
			}
		},
		get delivered() { return delivered; },
		get listeners() { return globalHandlers.size + [...typedHandlers.values()].reduce((sum, listeners) => sum + listeners.size, 0); },
	};
}

suite('Local canvas SDK bridge typed events', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('streaming deltas only enter their indexed typed subscription, not 51 unrelated handlers', () => {
		const fixture = sessionFixture();
		const subscriptions = disposables.add(new DisposableStore());
		for (let index = 0; index < 51; index++) {
			subscriptions.add(toDisposable(fixture.session.on('session.start', () => assert.fail('Unrelated event handler'))));
		}
		const deltas: string[] = [];
		subscriptions.add(toDisposable(fixture.session.on('assistant.message_delta', event => deltas.push(event.data.deltaContent))));
		for (let index = 0; index < 100; index++) {
			fixture.emit(event({ type: 'assistant.message_delta', data: { messageId: 'message', deltaContent: String(index) } }));
		}
		assert.deepStrictEqual({
			globalRegistrations: fixture.registrations.filter(type => type === 'all').length,
			typedRegistrations: fixture.registrations.length,
			delivered: fixture.delivered,
			deltas,
		}, {
			globalRegistrations: 0, typedRegistrations: 52, delivered: 100,
			deltas: Array.from({ length: 100 }, (_, index) => String(index)),
		});
		subscriptions.clear();
		fixture.emit(event({ type: 'assistant.message_delta', data: { messageId: 'message', deltaContent: 'late' } }));
		assert.deepStrictEqual({ listeners: fixture.listeners, delivered: fixture.delivered, deltas: deltas.length }, { listeners: 0, delivered: 100, deltas: 100 });
	});

	test('public typed and catch-all subscriptions preserve message, reasoning and tool progress', () => {
		const fixture = sessionFixture();
		const seen: { kind: string; event: HostSessionEvent }[] = [];
		disposables.add(toDisposable(fixture.session.on('assistant.message_delta', event => seen.push({ kind: 'message', event }))));
		disposables.add(toDisposable(fixture.session.on('assistant.reasoning_delta', event => seen.push({ kind: 'reasoning', event }))));
		disposables.add(toDisposable(fixture.session.on('tool.execution_progress', event => seen.push({ kind: 'tool', event }))));
		disposables.add(toDisposable(fixture.session.on(event => seen.push({ kind: 'all', event }))));
		const events = [
			event({ type: 'assistant.message_delta', data: { messageId: 'message', deltaContent: 'hello', parentToolCallId: 'parent' } }),
			event({ type: 'assistant.reasoning_delta', data: { reasoningId: 'reasoning', deltaContent: 'thinking' } }),
			event({ type: 'tool.execution_progress', data: { toolCallId: 'tool', progressMessage: 'working' } }),
		];
		for (const event of events) {
			fixture.emit(event);
		}
		assert.deepStrictEqual({ seen, delivered: fixture.delivered }, {
			seen: [
				{ kind: 'all', event: events[0] }, { kind: 'message', event: events[0] },
				{ kind: 'all', event: events[1] }, { kind: 'reasoning', event: events[1] },
				{ kind: 'all', event: events[2] }, { kind: 'tool', event: events[2] },
			],
			delivered: 6,
		});
	});

	test('partial permissions diagnostics never invent a permission-mode transition in typed, global or history projections', async () => {
		const fixture = sessionFixture();
		const typed: HostSessionEvent[] = [];
		const all: HostSessionEvent[] = [];
		disposables.add(toDisposable(fixture.session.on('session.permissions_changed', event => typed.push(event))));
		disposables.add(toDisposable(fixture.session.on(event => all.push(event))));
		const transition = event({ type: 'session.permissions_changed', data: { mode: 'manual', previousMode: 'allow-all', assistedApprovalModel: 'judge' } });
		fixture.history.push(
			event({ type: 'session.permissions_changed', data: { assistedApprovalModel: 'judge-only' } }),
			event({ type: 'session.permissions_changed', data: { mode: 'manual' } }),
			event({ type: 'session.permissions_changed', data: { previousMode: 'allow-all' } }),
			event({ type: 'session.retained', data: {} }),
			transition,
		);
		for (const event of fixture.history) {
			fixture.emit(event);
		}
		assert.deepStrictEqual({ typed, all, history: await fixture.session.getEvents() }, {
			typed: [transition], all: [transition], history: [transition],
		});
	});

	test('unsubscribing a typed or global listener detaches immediately and leaves other public subscriptions live', async () => {
		const fixture = sessionFixture();
		const seen: string[] = [];
		const first = disposables.add(toDisposable(fixture.session.on('assistant.message_delta', () => seen.push('first'))));
		disposables.add(toDisposable(fixture.session.on('assistant.message_delta', () => seen.push('second'))));
		const global = disposables.add(toDisposable(fixture.session.on(() => seen.push('all'))));
		first.dispose();
		global.dispose();
		const delta = event({ type: 'assistant.message_delta', data: { messageId: 'message', deltaContent: 'hello' } });
		fixture.emit(delta);
		assert.deepStrictEqual({ seen, listeners: fixture.listeners, delivered: fixture.delivered }, { seen: ['second'], listeners: 1, delivered: 1 });
		await fixture.session.disconnect();
		fixture.emit(delta);
		assert.deepStrictEqual({ seen, listeners: fixture.listeners, delivered: fixture.delivered }, { seen: ['second'], listeners: 0, delivered: 1 });
	});
});

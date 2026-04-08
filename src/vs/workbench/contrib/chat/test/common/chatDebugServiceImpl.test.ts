/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugGenericEvent, IChatDebugLogProvider, IChatDebugModelTurnEvent, IChatDebugResolvedEventContent, IChatDebugToolCallEvent } from '../../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../common/chatDebugServiceImpl.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';

suite('ChatDebugServiceImpl', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: ChatDebugServiceImpl;

	const session1 = URI.parse('vscode-chat-session://local/session-1');
	const session2 = URI.parse('vscode-chat-session://local/session-2');
	const sessionA = LocalChatSessionUri.forSession('a');
	const sessionB = LocalChatSessionUri.forSession('b');
	const sessionGeneric = URI.parse('vscode-chat-session://local/session');
	const nonLocalSession = URI.parse('some-other-scheme://authority/session-1');
	const copilotCliSession = URI.parse('copilotcli:/test-session-id');
	const claudeCodeSession = URI.parse('claude-code:/test-session-id');

	setup(() => {
		service = disposables.add(new ChatDebugServiceImpl());
	});

	suite('addEvent and getEvents', () => {
		test('should add and retrieve events', () => {
			const event: IChatDebugGenericEvent = {
				kind: 'generic',
				sessionResource: session1,
				created: new Date(),
				name: 'test-event',
				level: ChatDebugLogLevel.Info,
			};

			service.addEvent(event);

			assert.deepStrictEqual(service.getEvents(), [event]);
		});

		test('should filter events by sessionResource', () => {
			const event1: IChatDebugGenericEvent = {
				kind: 'generic',
				sessionResource: session1,
				created: new Date(),
				name: 'event-1',
				level: ChatDebugLogLevel.Info,
			};
			const event2: IChatDebugGenericEvent = {
				kind: 'generic',
				sessionResource: session2,
				created: new Date(),
				name: 'event-2',
				level: ChatDebugLogLevel.Warning,
			};

			service.addEvent(event1);
			service.addEvent(event2);

			assert.deepStrictEqual(service.getEvents(session1), [event1]);
			assert.deepStrictEqual(service.getEvents(session2), [event2]);
			assert.strictEqual(service.getEvents().length, 2);
		});

		test('should fire onDidAddEvent when event is added', () => {
			const firedEvents: IChatDebugEvent[] = [];
			disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));

			const event: IChatDebugGenericEvent = {
				kind: 'generic',
				sessionResource: session1,
				created: new Date(),
				name: 'test',
				level: ChatDebugLogLevel.Info,
			};
			service.addEvent(event);

			assert.deepStrictEqual(firedEvents, [event]);
		});

		test('should handle different event kinds', () => {
			const toolCall: IChatDebugToolCallEvent = {
				kind: 'toolCall',
				sessionResource: session1,
				created: new Date(),
				toolName: 'readFile',
				toolCallId: 'call-1',
				input: '{"path": "/foo.ts"}',
				output: 'file contents',
				result: 'success',
				durationInMillis: 42,
			};
			const modelTurn: IChatDebugModelTurnEvent = {
				kind: 'modelTurn',
				sessionResource: session1,
				created: new Date(),
				model: 'gpt-4',
				inputTokens: 100,
				outputTokens: 50,
				totalTokens: 150,
				durationInMillis: 1200,
			};

			service.addEvent(toolCall);
			service.addEvent(modelTurn);

			const events = service.getEvents(session1);
			assert.strictEqual(events.length, 2);
			assert.strictEqual(events[0].kind, 'toolCall');
			assert.strictEqual(events[1].kind, 'modelTurn');
		});
	});

	suite('log', () => {
		test('should create a generic event with defaults', () => {
			const firedEvents: IChatDebugEvent[] = [];
			disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));

			service.log(session1, 'Some name', 'Some details');

			assert.strictEqual(firedEvents.length, 1);
			const event = firedEvents[0];
			assert.strictEqual(event.kind, 'generic');
			assert.strictEqual(event.sessionResource.toString(), session1.toString());
			assert.strictEqual((event as IChatDebugGenericEvent).name, 'Some name');
			assert.strictEqual((event as IChatDebugGenericEvent).details, 'Some details');
			assert.strictEqual((event as IChatDebugGenericEvent).level, ChatDebugLogLevel.Info);
		});

		test('should accept custom level and options', () => {
			const firedEvents: IChatDebugEvent[] = [];
			disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));

			service.log(session1, 'warning-event', 'oh no', ChatDebugLogLevel.Warning, {
				id: 'my-id',
				category: 'testing',
				parentEventId: 'parent-1',
			});

			const event = firedEvents[0] as IChatDebugGenericEvent;
			assert.strictEqual(event.level, ChatDebugLogLevel.Warning);
			assert.strictEqual(event.id, 'my-id');
			assert.strictEqual(event.category, 'testing');
			assert.strictEqual(event.parentEventId, 'parent-1');
		});

		test('should not log events for ineligible session schemes', () => {
			const firedEvents: IChatDebugEvent[] = [];
			disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));

			service.log(nonLocalSession, 'should-be-skipped', 'details');

			assert.strictEqual(firedEvents.length, 0);
			assert.strictEqual(service.getEvents(nonLocalSession).length, 0);
		});

		test('should log events for copilotcli sessions', () => {
			const firedEvents: IChatDebugEvent[] = [];
			disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));

			service.log(copilotCliSession, 'cli-event', 'details');

			assert.strictEqual(firedEvents.length, 1);
			assert.strictEqual(service.getEvents(copilotCliSession).length, 1);
		});

		test('should log events for claude-code sessions', () => {
			const firedEvents: IChatDebugEvent[] = [];
			disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));

			service.log(claudeCodeSession, 'claude-event', 'details');

			assert.strictEqual(firedEvents.length, 1);
			assert.strictEqual(service.getEvents(claudeCodeSession).length, 1);
		});
	});

	suite('getSessionResources', () => {
		test('should return unique session resources', () => {
			service.addEvent({ kind: 'generic', sessionResource: sessionA, created: new Date(), name: 'e1', level: ChatDebugLogLevel.Info });
			service.addEvent({ kind: 'generic', sessionResource: sessionB, created: new Date(), name: 'e2', level: ChatDebugLogLevel.Info });
			service.addEvent({ kind: 'generic', sessionResource: sessionA, created: new Date(), name: 'e3', level: ChatDebugLogLevel.Info });

			const resources = service.getSessionResources();
			assert.strictEqual(resources.length, 2);
		});

		test('should return empty array when no events', () => {
			assert.deepStrictEqual(service.getSessionResources(), []);
		});
	});

	suite('clear', () => {
		test('should clear all events', () => {
			service.addEvent({ kind: 'generic', sessionResource: sessionA, created: new Date(), name: 'e', level: ChatDebugLogLevel.Info });
			service.addEvent({ kind: 'generic', sessionResource: sessionB, created: new Date(), name: 'e', level: ChatDebugLogLevel.Info });

			service.clear();

			assert.strictEqual(service.getEvents().length, 0);
		});
	});

	suite('MAX_EVENTS_PER_SESSION cap', () => {
		test('should evict oldest events when exceeding per-session cap', () => {
			// The max per session is 10_000. Add more than that to a single session.
			for (let i = 0; i < 10_001; i++) {
				service.addEvent({ kind: 'generic', sessionResource: sessionGeneric, created: new Date(), name: `event-${i}`, level: ChatDebugLogLevel.Info });
			}

			const events = service.getEvents();
			assert.ok(events.length <= 10_000, 'Should not exceed MAX_EVENTS_PER_SESSION');
			// The first event should have been evicted
			assert.ok(!(events as IChatDebugGenericEvent[]).find(e => e.name === 'event-0'), 'Event-0 should have been evicted');
			// The last event should be present
			assert.ok((events as IChatDebugGenericEvent[]).find(e => e.name === 'event-10000'), 'Last event should be present');
		});

		test('should evict oldest session when exceeding MAX_SESSIONS', () => {
			// MAX_SESSIONS is 5 — add events to 6 different sessions
			const sessions: URI[] = [];
			for (let i = 0; i < 6; i++) {
				const uri = URI.parse(`vscode-chat-session://local/session-lru-${i}`);
				sessions.push(uri);
				service.addEvent({ kind: 'generic', sessionResource: uri, created: new Date(), name: `event-${i}`, level: ChatDebugLogLevel.Info });
			}

			const resources = service.getSessionResources();
			assert.strictEqual(resources.length, 5, 'Should not exceed MAX_SESSIONS');
			// The first session should have been evicted
			assert.ok(!resources.some(r => r.toString() === sessions[0].toString()), 'Session-0 should have been evicted');
			assert.strictEqual(service.getEvents(sessions[0]).length, 0, 'Events from evicted session should be gone');
			// The last session should be present
			assert.ok(resources.some(r => r.toString() === sessions[5].toString()), 'Session-5 should be present');
		});

		test('should use LRU eviction — recently-used sessions are kept', () => {
			// Fill to MAX_SESSIONS (5)
			const sessions: URI[] = [];
			for (let i = 0; i < 5; i++) {
				const uri = URI.parse(`vscode-chat-session://local/session-lru2-${i}`);
				sessions.push(uri);
				service.addEvent({ kind: 'generic', sessionResource: uri, created: new Date(), name: `init-${i}`, level: ChatDebugLogLevel.Info });
			}

			// Touch session-0 so it moves to the back of the LRU order
			service.addEvent({ kind: 'generic', sessionResource: sessions[0], created: new Date(), name: 'touch', level: ChatDebugLogLevel.Info });

			// Add a 6th session — session-1 (the true LRU) should be evicted, not session-0
			const session6 = URI.parse('vscode-chat-session://local/session-lru2-5');
			service.addEvent({ kind: 'generic', sessionResource: session6, created: new Date(), name: 'new', level: ChatDebugLogLevel.Info });

			const resources = service.getSessionResources();
			assert.strictEqual(resources.length, 5);
			assert.ok(resources.some(r => r.toString() === sessions[0].toString()), 'Session-0 should be kept (recently used)');
			assert.ok(!resources.some(r => r.toString() === sessions[1].toString()), 'Session-1 should be evicted (LRU)');
			assert.ok(resources.some(r => r.toString() === session6.toString()), 'Session-5 should be present');
		});
	});

	suite('activeSessionResource', () => {
		test('should default to undefined', () => {
			assert.strictEqual(service.activeSessionResource, undefined);
		});

		test('should be settable', () => {
			service.activeSessionResource = session1;

			assert.strictEqual(service.activeSessionResource, session1);
		});
	});

	suite('registerProvider', () => {
		test('should register and unregister a provider', async () => {
			const extSession = URI.parse('vscode-chat-session://local/ext-session');
			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => [{
					kind: 'generic',
					sessionResource: extSession,
					created: new Date(),
					name: 'from-provider',
					level: ChatDebugLogLevel.Info,
				}],
			};

			const reg = service.registerProvider(provider);
			await service.invokeProviders(extSession);

			const events = service.getEvents(extSession);
			assert.ok(events.some(e => e.kind === 'generic' && (e as IChatDebugGenericEvent).name === 'from-provider'));

			reg.dispose();
		});

		test('provider returning undefined should not add events', async () => {
			const emptySession = URI.parse('vscode-chat-session://local/empty-session');
			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => undefined,
			};

			disposables.add(service.registerProvider(provider));
			await service.invokeProviders(emptySession);

			assert.strictEqual(service.getEvents(emptySession).length, 0);
		});

		test('provider errors should be handled gracefully', async () => {
			const errorSession = URI.parse('vscode-chat-session://local/error-session');
			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => { throw new Error('boom'); },
			};

			disposables.add(service.registerProvider(provider));
			// Suppress the expected onUnexpectedError from _invokeProvider
			const origHandler = errorHandler.getUnexpectedErrorHandler();
			errorHandler.setUnexpectedErrorHandler(() => { });
			try {
				await service.invokeProviders(errorSession);
			} finally {
				errorHandler.setUnexpectedErrorHandler(origHandler);
			}
			assert.strictEqual(service.getEvents(errorSession).length, 0);
		});
	});

	suite('invokeProviders', () => {
		test('should invoke multiple providers and merge events', async () => {
			const providerA: IChatDebugLogProvider = {
				provideChatDebugLog: async () => [{
					kind: 'generic',
					sessionResource: sessionGeneric,
					created: new Date(),
					name: 'from-A',
					level: ChatDebugLogLevel.Info,
				}],
			};
			const providerB: IChatDebugLogProvider = {
				provideChatDebugLog: async () => [{
					kind: 'generic',
					sessionResource: sessionGeneric,
					created: new Date(),
					name: 'from-B',
					level: ChatDebugLogLevel.Info,
				}],
			};

			disposables.add(service.registerProvider(providerA));
			disposables.add(service.registerProvider(providerB));
			await service.invokeProviders(sessionGeneric);

			const names = (service.getEvents(sessionGeneric) as IChatDebugGenericEvent[]).map(e => e.name);
			assert.ok(names.includes('from-A'));
			assert.ok(names.includes('from-B'));
		});

		test('should cancel previous invocation for same session', async () => {
			let cancelledToken: CancellationToken | undefined;

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async (_sessionResource, token) => {
					cancelledToken = token;
					return [];
				},
			};

			disposables.add(service.registerProvider(provider));

			// First invocation
			await service.invokeProviders(sessionGeneric);
			const firstToken = cancelledToken!;

			// Second invocation for same session should cancel the first
			await service.invokeProviders(sessionGeneric);
			assert.strictEqual(firstToken.isCancellationRequested, true);
		});

		test('should fire onDidClearProviderEvents when clearing provider events', async () => {
			const clearedSessions: URI[] = [];
			disposables.add(service.onDidClearProviderEvents(sessionResource => clearedSessions.push(sessionResource)));

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async (sessionResource) => [{
					kind: 'generic',
					sessionResource,
					created: new Date(),
					name: 'provider-event',
					level: ChatDebugLogLevel.Info,
				}],
			};

			disposables.add(service.registerProvider(provider));

			// First invocation clears empty set and fires clear event
			await service.invokeProviders(sessionGeneric);
			assert.strictEqual(clearedSessions.length, 1, 'Clear event should fire on first invocation');

			// Second invocation clears provider events from first invocation
			await service.invokeProviders(sessionGeneric);
			assert.strictEqual(clearedSessions.length, 2, 'Clear event should fire on second invocation');
			assert.strictEqual(clearedSessions[1].toString(), sessionGeneric.toString());
		});

		test('should not cancel invocations for different sessions', async () => {
			const tokens: Map<string, CancellationToken> = new Map();

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async (sessionResource, token) => {
					tokens.set(sessionResource.toString(), token);
					return [];
				},
			};

			disposables.add(service.registerProvider(provider));

			await service.invokeProviders(sessionA);
			await service.invokeProviders(sessionB);

			const tokenA = tokens.get(sessionA.toString())!;
			assert.strictEqual(tokenA.isCancellationRequested, false, 'session-a token should not be cancelled');
		});

		test('should not invoke providers for ineligible session schemes', async () => {
			let providerCalled = false;

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => {
					providerCalled = true;
					return [{
						kind: 'generic',
						sessionResource: nonLocalSession,
						created: new Date(),
						name: 'should-not-appear',
						level: ChatDebugLogLevel.Info,
					}];
				},
			};

			disposables.add(service.registerProvider(provider));
			await service.invokeProviders(nonLocalSession);

			assert.strictEqual(providerCalled, false);
			assert.strictEqual(service.getEvents(nonLocalSession).length, 0);
		});

		test('should invoke providers for copilotcli sessions', async () => {
			let providerCalled = false;

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => {
					providerCalled = true;
					return [{
						kind: 'generic',
						sessionResource: copilotCliSession,
						created: new Date(),
						name: 'cli-provider-event',
						level: ChatDebugLogLevel.Info,
					}];
				},
			};

			disposables.add(service.registerProvider(provider));
			await service.invokeProviders(copilotCliSession);

			assert.strictEqual(providerCalled, true);
			assert.ok(service.getEvents(copilotCliSession).length > 0);
		});

		test('should invoke providers for claude-code sessions', async () => {
			let providerCalled = false;

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => {
					providerCalled = true;
					return [{
						kind: 'generic',
						sessionResource: claudeCodeSession,
						created: new Date(),
						name: 'claude-provider-event',
						level: ChatDebugLogLevel.Info,
					}];
				},
			};

			disposables.add(service.registerProvider(provider));
			await service.invokeProviders(claudeCodeSession);

			assert.strictEqual(providerCalled, true);
			assert.ok(service.getEvents(claudeCodeSession).length > 0);
		});

		test('newly registered provider should be invoked for active sessions', async () => {
			// Start an invocation before the provider is registered
			const firstProvider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => [],
			};
			disposables.add(service.registerProvider(firstProvider));
			await service.invokeProviders(sessionGeneric);

			// Now register a new provider — it should be invoked for the active session
			const lateEvents: IChatDebugEvent[] = [];
			const lateProvider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => {
					const event: IChatDebugGenericEvent = {
						kind: 'generic',
						sessionResource: sessionGeneric,
						created: new Date(),
						name: 'late-provider-event',
						level: ChatDebugLogLevel.Info,
					};
					lateEvents.push(event);
					return [event];
				},
			};

			disposables.add(service.registerProvider(lateProvider));

			// Give it a tick to let the async invocation complete
			await new Promise(resolve => setTimeout(resolve, 10));

			assert.ok(lateEvents.length > 0, 'Late provider should have been invoked');
		});
	});

	suite('resolveEvent', () => {
		test('should delegate to provider with resolveChatDebugLogEvent', async () => {
			const resolved: IChatDebugResolvedEventContent = {
				kind: 'text',
				value: 'resolved detail text',
			};

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => undefined,
				resolveChatDebugLogEvent: async (eventId) => {
					if (eventId === 'my-event') {
						return resolved;
					}
					return undefined;
				},
			};

			disposables.add(service.registerProvider(provider));

			const result = await service.resolveEvent('my-event');
			assert.deepStrictEqual(result, resolved);
		});

		test('should return undefined if no provider resolves the event', async () => {
			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => undefined,
				resolveChatDebugLogEvent: async () => undefined,
			};

			disposables.add(service.registerProvider(provider));

			const result = await service.resolveEvent('nonexistent');
			assert.strictEqual(result, undefined);
		});

		test('should return undefined when no providers registered', async () => {
			const result = await service.resolveEvent('any-id');
			assert.strictEqual(result, undefined);
		});

		test('should return first non-undefined resolution from multiple providers', async () => {
			const provider1: IChatDebugLogProvider = {
				provideChatDebugLog: async () => undefined,
				resolveChatDebugLogEvent: async () => undefined,
			};
			const provider2: IChatDebugLogProvider = {
				provideChatDebugLog: async () => undefined,
				resolveChatDebugLogEvent: async () => ({ kind: 'text', value: 'from provider 2' }),
			};

			disposables.add(service.registerProvider(provider1));
			disposables.add(service.registerProvider(provider2));

			const result = await service.resolveEvent('any');
			assert.deepStrictEqual(result, { kind: 'text', value: 'from provider 2' });
		});
	});

	suite('endSession', () => {
		test('should cancel and remove the CTS for a session', async () => {
			let capturedToken: CancellationToken | undefined;

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async (_sessionResource, token) => {
					capturedToken = token;
					return [];
				},
			};

			disposables.add(service.registerProvider(provider));
			await service.invokeProviders(sessionGeneric);

			assert.ok(capturedToken);
			assert.strictEqual(capturedToken.isCancellationRequested, false);

			service.endSession(sessionGeneric);

			assert.strictEqual(capturedToken.isCancellationRequested, true);
		});

		test('should be safe to call for unknown session', () => {
			// Should not throw
			service.endSession(URI.parse('vscode-chat-session://local/nonexistent'));
		});

		test('late provider should not be invoked for ended session', async () => {
			const firstProvider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => [],
			};
			disposables.add(service.registerProvider(firstProvider));
			await service.invokeProviders(sessionGeneric);

			service.endSession(sessionGeneric);

			let lateCalled = false;
			const lateProvider: IChatDebugLogProvider = {
				provideChatDebugLog: async () => {
					lateCalled = true;
					return [];
				},
			};
			disposables.add(service.registerProvider(lateProvider));

			await new Promise(resolve => setTimeout(resolve, 10));
			assert.strictEqual(lateCalled, false, 'Late provider should not be invoked for ended session');
		});
	});

	suite('dispose', () => {
		test('should cancel active invocations on dispose', async () => {
			let capturedToken: CancellationToken | undefined;

			const provider: IChatDebugLogProvider = {
				provideChatDebugLog: async (_sessionResource, token) => {
					capturedToken = token;
					return [];
				},
			};

			disposables.add(service.registerProvider(provider));
			await service.invokeProviders(sessionGeneric);

			const cts = new CancellationTokenSource();
			disposables.add(cts);

			service.dispose();

			assert.ok(capturedToken);
			assert.strictEqual(capturedToken.isCancellationRequested, true);
		});
	});

	suite('event deduplication', () => {
		test('should deduplicate events with the same ID, keeping the richer kind', () => {
			const userMsg: IChatDebugEvent = {
				kind: 'userMessage',
				id: 'shared-id-1',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:00Z'),
				message: 'hello',
				sections: [],
			};
			const subagent: IChatDebugEvent = {
				kind: 'subagentInvocation',
				id: 'shared-id-1',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:01Z'),
				agentName: 'Explore',
			};
			service.addEvent(userMsg);
			service.addEvent(subagent);

			const events = service.getEvents(session1);
			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].kind, 'subagentInvocation');
		});

		test('should keep richer event when it arrives first', () => {
			const subagent: IChatDebugEvent = {
				kind: 'subagentInvocation',
				id: 'shared-id-2',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:00Z'),
				agentName: 'Explore',
			};
			const userMsg: IChatDebugEvent = {
				kind: 'userMessage',
				id: 'shared-id-2',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:01Z'),
				message: 'hello',
				sections: [],
			};
			service.addEvent(subagent);
			service.addEvent(userMsg);

			const events = service.getEvents(session1);
			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].kind, 'subagentInvocation');
		});

		test('should not fire onDidAddEvent for skipped duplicates', () => {
			const firedKinds: string[] = [];
			disposables.add(service.onDidAddEvent(e => firedKinds.push(e.kind)));

			const subagent: IChatDebugEvent = {
				kind: 'subagentInvocation',
				id: 'shared-id-3',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:00Z'),
				agentName: 'Explore',
			};
			const userMsg: IChatDebugEvent = {
				kind: 'userMessage',
				id: 'shared-id-3',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:01Z'),
				message: 'hello',
				sections: [],
			};
			service.addEvent(subagent);
			service.addEvent(userMsg); // should be skipped

			assert.deepStrictEqual(firedKinds, ['subagentInvocation']);
		});

		test('should allow events without IDs to coexist', () => {
			const event1: IChatDebugGenericEvent = {
				kind: 'generic',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:00Z'),
				name: 'a',
				level: ChatDebugLogLevel.Info,
			};
			const event2: IChatDebugGenericEvent = {
				kind: 'generic',
				sessionResource: session1,
				created: new Date('2026-01-01T00:00:01Z'),
				name: 'b',
				level: ChatDebugLogLevel.Info,
			};
			service.addEvent(event1);
			service.addEvent(event2);

			const events = service.getEvents(session1);
			assert.strictEqual(events.length, 2);
		});
	});
});

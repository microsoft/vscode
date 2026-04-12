/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatDebugLogLevel } from '../../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../common/chatDebugServiceImpl.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
suite('ChatDebugServiceImpl', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let service;
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
            const event = {
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
            const event1 = {
                kind: 'generic',
                sessionResource: session1,
                created: new Date(),
                name: 'event-1',
                level: ChatDebugLogLevel.Info,
            };
            const event2 = {
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
            const firedEvents = [];
            disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));
            const event = {
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
            const toolCall = {
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
            const modelTurn = {
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
            const firedEvents = [];
            disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));
            service.log(session1, 'Some name', 'Some details');
            assert.strictEqual(firedEvents.length, 1);
            const event = firedEvents[0];
            assert.strictEqual(event.kind, 'generic');
            assert.strictEqual(event.sessionResource.toString(), session1.toString());
            assert.strictEqual(event.name, 'Some name');
            assert.strictEqual(event.details, 'Some details');
            assert.strictEqual(event.level, ChatDebugLogLevel.Info);
        });
        test('should accept custom level and options', () => {
            const firedEvents = [];
            disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));
            service.log(session1, 'warning-event', 'oh no', ChatDebugLogLevel.Warning, {
                id: 'my-id',
                category: 'testing',
                parentEventId: 'parent-1',
            });
            const event = firedEvents[0];
            assert.strictEqual(event.level, ChatDebugLogLevel.Warning);
            assert.strictEqual(event.id, 'my-id');
            assert.strictEqual(event.category, 'testing');
            assert.strictEqual(event.parentEventId, 'parent-1');
        });
        test('should not log events for ineligible session schemes', () => {
            const firedEvents = [];
            disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));
            service.log(nonLocalSession, 'should-be-skipped', 'details');
            assert.strictEqual(firedEvents.length, 0);
            assert.strictEqual(service.getEvents(nonLocalSession).length, 0);
        });
        test('should log events for copilotcli sessions', () => {
            const firedEvents = [];
            disposables.add(service.onDidAddEvent(e => firedEvents.push(e)));
            service.log(copilotCliSession, 'cli-event', 'details');
            assert.strictEqual(firedEvents.length, 1);
            assert.strictEqual(service.getEvents(copilotCliSession).length, 1);
        });
        test('should log events for claude-code sessions', () => {
            const firedEvents = [];
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
            assert.ok(!events.find(e => e.name === 'event-0'), 'Event-0 should have been evicted');
            // The last event should be present
            assert.ok(events.find(e => e.name === 'event-10000'), 'Last event should be present');
        });
        test('should evict oldest session when exceeding MAX_SESSIONS', () => {
            // MAX_SESSIONS is 5 — add events to 6 different sessions
            const sessions = [];
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
            const sessions = [];
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
    suite('markDebugDataAttached', () => {
        test('should track attached debug data per session', () => {
            assert.strictEqual(service.hasAttachedDebugData(sessionGeneric), false);
            const fired = [];
            disposables.add(service.onDidAttachDebugData(uri => fired.push(uri)));
            service.markDebugDataAttached(sessionGeneric);
            assert.strictEqual(service.hasAttachedDebugData(sessionGeneric), true);
            assert.strictEqual(fired.length, 1);
            assert.strictEqual(fired[0].toString(), sessionGeneric.toString());
            // Idempotent — second call should not fire again
            service.markDebugDataAttached(sessionGeneric);
            assert.strictEqual(fired.length, 1);
            // Other sessions remain unaffected
            assert.strictEqual(service.hasAttachedDebugData(sessionA), false);
        });
        test('should clear attached debug data on endSession', () => {
            service.markDebugDataAttached(sessionGeneric);
            assert.strictEqual(service.hasAttachedDebugData(sessionGeneric), true);
            service.endSession(sessionGeneric);
            assert.strictEqual(service.hasAttachedDebugData(sessionGeneric), false);
        });
        test('should clear attached debug data on clear', () => {
            service.markDebugDataAttached(sessionA);
            service.markDebugDataAttached(sessionB);
            service.clear();
            assert.strictEqual(service.hasAttachedDebugData(sessionA), false);
            assert.strictEqual(service.hasAttachedDebugData(sessionB), false);
        });
    });
    suite('registerProvider', () => {
        test('should register and unregister a provider', async () => {
            const extSession = URI.parse('vscode-chat-session://local/ext-session');
            const provider = {
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
            assert.ok(events.some(e => e.kind === 'generic' && e.name === 'from-provider'));
            reg.dispose();
        });
        test('provider returning undefined should not add events', async () => {
            const emptySession = URI.parse('vscode-chat-session://local/empty-session');
            const provider = {
                provideChatDebugLog: async () => undefined,
            };
            disposables.add(service.registerProvider(provider));
            await service.invokeProviders(emptySession);
            assert.strictEqual(service.getEvents(emptySession).length, 0);
        });
        test('provider errors should be handled gracefully', async () => {
            const errorSession = URI.parse('vscode-chat-session://local/error-session');
            const provider = {
                provideChatDebugLog: async () => { throw new Error('boom'); },
            };
            disposables.add(service.registerProvider(provider));
            // Suppress the expected onUnexpectedError from _invokeProvider
            const origHandler = errorHandler.getUnexpectedErrorHandler();
            errorHandler.setUnexpectedErrorHandler(() => { });
            try {
                await service.invokeProviders(errorSession);
            }
            finally {
                errorHandler.setUnexpectedErrorHandler(origHandler);
            }
            assert.strictEqual(service.getEvents(errorSession).length, 0);
        });
    });
    suite('invokeProviders', () => {
        test('should invoke multiple providers and merge events', async () => {
            const providerA = {
                provideChatDebugLog: async () => [{
                        kind: 'generic',
                        sessionResource: sessionGeneric,
                        created: new Date(),
                        name: 'from-A',
                        level: ChatDebugLogLevel.Info,
                    }],
            };
            const providerB = {
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
            const names = service.getEvents(sessionGeneric).map(e => e.name);
            assert.ok(names.includes('from-A'));
            assert.ok(names.includes('from-B'));
        });
        test('should cancel previous invocation for same session', async () => {
            let cancelledToken;
            const provider = {
                provideChatDebugLog: async (_sessionResource, token) => {
                    cancelledToken = token;
                    return [];
                },
            };
            disposables.add(service.registerProvider(provider));
            // First invocation
            await service.invokeProviders(sessionGeneric);
            const firstToken = cancelledToken;
            // Second invocation for same session should cancel the first
            await service.invokeProviders(sessionGeneric);
            assert.strictEqual(firstToken.isCancellationRequested, true);
        });
        test('should fire onDidClearProviderEvents when clearing provider events', async () => {
            const clearedSessions = [];
            disposables.add(service.onDidClearProviderEvents(sessionResource => clearedSessions.push(sessionResource)));
            const provider = {
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
            const tokens = new Map();
            const provider = {
                provideChatDebugLog: async (sessionResource, token) => {
                    tokens.set(sessionResource.toString(), token);
                    return [];
                },
            };
            disposables.add(service.registerProvider(provider));
            await service.invokeProviders(sessionA);
            await service.invokeProviders(sessionB);
            const tokenA = tokens.get(sessionA.toString());
            assert.strictEqual(tokenA.isCancellationRequested, false, 'session-a token should not be cancelled');
        });
        test('should not invoke providers for ineligible session schemes', async () => {
            let providerCalled = false;
            const provider = {
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
            const provider = {
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
            const provider = {
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
            const firstProvider = {
                provideChatDebugLog: async () => [],
            };
            disposables.add(service.registerProvider(firstProvider));
            await service.invokeProviders(sessionGeneric);
            // Now register a new provider — it should be invoked for the active session
            const lateEvents = [];
            const lateProvider = {
                provideChatDebugLog: async () => {
                    const event = {
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
            const resolved = {
                kind: 'text',
                value: 'resolved detail text',
            };
            const provider = {
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
            const provider = {
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
            const provider1 = {
                provideChatDebugLog: async () => undefined,
                resolveChatDebugLogEvent: async () => undefined,
            };
            const provider2 = {
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
            let capturedToken;
            const provider = {
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
            const firstProvider = {
                provideChatDebugLog: async () => [],
            };
            disposables.add(service.registerProvider(firstProvider));
            await service.invokeProviders(sessionGeneric);
            service.endSession(sessionGeneric);
            let lateCalled = false;
            const lateProvider = {
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
            let capturedToken;
            const provider = {
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnU2VydmljZUltcGwudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdERlYnVnU2VydmljZUltcGwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFxSixNQUFNLGtDQUFrQyxDQUFDO0FBQ3hOLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXBFLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7SUFDbEMsTUFBTSxXQUFXLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUU5RCxJQUFJLE9BQTZCLENBQUM7SUFFbEMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO0lBQ3BFLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsdUNBQXVDLENBQUMsQ0FBQztJQUNwRSxNQUFNLFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDckQsTUFBTSxRQUFRLEdBQUcsbUJBQW1CLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lB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
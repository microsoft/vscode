/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSessionsModel, isAgentSession, isAgentSessionsModel, isLocalAgentSessionItem } from '../../../browser/agentSessions/agentSessionsModel.js';
import { AgentSessionsFilter } from '../../../browser/agentSessions/agentSessionsFilter.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { AgentSessionProviders, getAgentCanContinueIn, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../../../browser/agentSessions/agentSessions.js';
class StaticChatSessionItemController {
    constructor(sessionItems) {
        this.sessionItems = sessionItems;
        this.onDidChangeChatSessionItems = Event.None;
    }
    get items() {
        return this.sessionItems;
    }
    async refresh() { }
}
suite('AgentSessions', () => {
    suite('AgentSessionsViewModel', () => {
        const disposables = new DisposableStore();
        let mockChatSessionsService;
        let mockLifecycleService;
        let viewModel;
        let instantiationService;
        function createViewModel() {
            return disposables.add(instantiationService.createInstance(AgentSessionsModel));
        }
        function registerContribution(type) {
            disposables.add(mockChatSessionsService.registerChatSessionContribution({ type, name: type, displayName: type, description: type }));
        }
        setup(() => {
            mockChatSessionsService = new MockChatSessionsService();
            mockLifecycleService = disposables.add(new TestLifecycleService());
            instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
            instantiationService.stub(IChatSessionsService, mockChatSessionsService);
            instantiationService.stub(ILifecycleService, mockLifecycleService);
        });
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should initialize with empty sessions', () => {
            viewModel = createViewModel();
            assert.strictEqual(viewModel.sessions.length, 0);
        });
        test('should resolve sessions from controllers', async () => {
            return runWithFakedTimers({}, async () => {
                const chatSessionType = chatSessionTestType;
                const controller = new StaticChatSessionItemController([
                    makeSimpleSessionItem('session-1', {
                        label: 'Test Session 1'
                    }),
                    makeSimpleSessionItem('session-2', {
                        label: 'Test Session 2'
                    })
                ]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 2);
                assert.strictEqual(viewModel.sessions[0].resource.toString(), `${chatSessionTestType}://session-1`);
                assert.strictEqual(viewModel.sessions[0].label, 'Test Session 1');
                assert.strictEqual(viewModel.sessions[1].resource.toString(), `${chatSessionTestType}://session-2`);
                assert.strictEqual(viewModel.sessions[1].label, 'Test Session 2');
            });
        });
        test('should resolve sessions from multiple controllers', async () => {
            return runWithFakedTimers({}, async () => {
                const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem('session-2')]);
                registerContribution('type-1');
                registerContribution('type-2');
                mockChatSessionsService.registerChatSessionItemController('type-1', controller1);
                mockChatSessionsService.registerChatSessionItemController('type-2', controller2);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 2);
                const uris = viewModel.sessions.map(s => s.resource.toString()).sort();
                assert.deepStrictEqual(uris, [
                    `${chatSessionTestType}://session-1`,
                    `${chatSessionTestType}://session-2`,
                ]);
            });
        });
        test('should fire onWillResolve and onDidResolve events', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                let willResolveFired = false;
                let didResolveFired = false;
                disposables.add(viewModel.onWillResolve(provider => {
                    willResolveFired = true;
                    assert.strictEqual(typeof provider, 'string', 'onWillResolve should carry the provider');
                    assert.strictEqual(didResolveFired, false, 'onDidResolve should not fire before onWillResolve completes');
                }));
                disposables.add(viewModel.onDidResolve(provider => {
                    didResolveFired = true;
                    assert.strictEqual(typeof provider, 'string', 'onDidResolve should carry the provider');
                    assert.strictEqual(willResolveFired, true, 'onWillResolve should fire before onDidResolve');
                }));
                await viewModel.resolve(undefined);
                assert.strictEqual(willResolveFired, true, 'onWillResolve should have fired');
                assert.strictEqual(didResolveFired, true, 'onDidResolve should have fired');
            });
        });
        test('should fire onDidChangeSessions event after resolving', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                let sessionsChangedFired = false;
                disposables.add(viewModel.onDidChangeSessions(() => {
                    sessionsChangedFired = true;
                }));
                await viewModel.resolve(undefined);
                assert.strictEqual(sessionsChangedFired, true, 'onDidChangeSessions should have fired');
            });
        });
        test('should handle session with all properties', async () => {
            return runWithFakedTimers({}, async () => {
                const created = Date.now();
                const lastRequestEnded = created + 1000;
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-1'),
                        label: 'Test Session',
                        description: new MarkdownString('**Bold** description'),
                        status: 1 /* ChatSessionStatus.Completed */,
                        tooltip: 'Session tooltip',
                        iconPath: ThemeIcon.fromId('check'),
                        timing: { created, lastRequestStarted: created, lastRequestEnded },
                        changes: { files: 1, insertions: 10, deletions: 5 }
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 1);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.resource.toString(), 'test://session-1');
                assert.strictEqual(session.label, 'Test Session');
                assert.ok(session.description instanceof MarkdownString);
                if (session.description instanceof MarkdownString) {
                    assert.strictEqual(session.description.value, '**Bold** description');
                }
                assert.strictEqual(session.status, 1 /* ChatSessionStatus.Completed */);
                assert.strictEqual(session.timing.created, created);
                assert.strictEqual(session.timing.lastRequestEnded, lastRequestEnded);
                assert.deepStrictEqual(session.changes, { files: 1, insertions: 10, deletions: 5 });
            });
        });
        test('should handle resolve with specific provider', async () => {
            return runWithFakedTimers({}, async () => {
                const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem('session-2')]);
                registerContribution('type-1');
                registerContribution('type-2');
                disposables.add(mockChatSessionsService.registerChatSessionItemController('type-1', controller1));
                disposables.add(mockChatSessionsService.registerChatSessionItemController('type-2', controller2));
                viewModel = createViewModel();
                // First resolve all
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 2);
                // Now resolve only type-1
                await viewModel.resolve('type-1');
                // Per-provider resolution preserves sessions from other providers
                assert.strictEqual(viewModel.sessions.length, 2);
            });
        });
        test('should handle resolve with multiple specific controllers', async () => {
            return runWithFakedTimers({}, async () => {
                const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem('session-2')]);
                registerContribution('type-1');
                registerContribution('type-2');
                mockChatSessionsService.registerChatSessionItemController('type-1', controller1);
                mockChatSessionsService.registerChatSessionItemController('type-2', controller2);
                viewModel = createViewModel();
                await viewModel.resolve(['type-1', 'type-2']);
                assert.strictEqual(viewModel.sessions.length, 2);
            });
        });
        test('should respond to onDidChangeItemsProviders event', async () => {
            return runWithFakedTimers({}, async () => {
                const chatSessionType = chatSessionTestType;
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
                viewModel = createViewModel();
                const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
                // Trigger event - this should automatically call resolve
                mockChatSessionsService.fireDidChangeItemsProviders({ chatSessionType });
                // Wait for the sessions to be resolved
                await sessionsChangedPromise;
                assert.strictEqual(viewModel.sessions.length, 1);
            });
        });
        test('should respond to onDidChangeAvailability event', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
                // Trigger event - this should automatically call resolve
                mockChatSessionsService.fireDidChangeAvailability();
                // Wait for the sessions to be resolved
                await sessionsChangedPromise;
                assert.strictEqual(viewModel.sessions.length, 1);
            });
        });
        test('should respond to onDidChangeSessionItems event', async () => {
            return runWithFakedTimers({}, async () => {
                const testSession = makeSimpleSessionItem('session-1');
                const controller = new StaticChatSessionItemController([testSession]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
                // Trigger event - this should automatically call resolve
                mockChatSessionsService.fireDidChangeSessionItems({ addedOrUpdated: [testSession] });
                // Wait for the sessions to be resolved
                await sessionsChangedPromise;
                assert.strictEqual(viewModel.sessions.length, 1);
            });
        });
        test('should maintain provider reference in session view model', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 1);
                assert.strictEqual(viewModel.sessions[0].providerType, chatSessionTestType);
            });
        });
        test('should handle empty provider results', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 0);
            });
        });
        test('should handle sessions with different statuses', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([
                    {
                        resource: URI.parse('test://session-failed'),
                        label: 'Failed Session',
                        status: 0 /* ChatSessionStatus.Failed */,
                        timing: makeNewSessionTiming()
                    },
                    {
                        resource: URI.parse('test://session-completed'),
                        label: 'Completed Session',
                        status: 1 /* ChatSessionStatus.Completed */,
                        timing: makeNewSessionTiming()
                    },
                    {
                        resource: URI.parse('test://session-inprogress'),
                        label: 'In Progress Session',
                        status: 2 /* ChatSessionStatus.InProgress */,
                        timing: makeNewSessionTiming()
                    }
                ]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 3);
                assert.strictEqual(viewModel.sessions[0].status, 0 /* ChatSessionStatus.Failed */);
                assert.strictEqual(viewModel.sessions[1].status, 1 /* ChatSessionStatus.Completed */);
                assert.strictEqual(viewModel.sessions[2].status, 2 /* ChatSessionStatus.InProgress */);
            });
        });
        test('should replace sessions on re-resolve', async () => {
            return runWithFakedTimers({}, async () => {
                let sessionCount = 1;
                let _items = [];
                const controller = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        _items = [];
                        for (let i = 0; i < sessionCount; i++) {
                            _items.push(makeSimpleSessionItem(`session-${i + 1}`));
                        }
                    },
                    get items() { return _items; }
                };
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 1);
                sessionCount = 3;
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 3);
            });
        });
        test('should handle local agent session type specially', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([{
                        resource: LocalChatSessionUri.forSession('local-session'),
                        label: 'Local Session',
                        timing: makeNewSessionTiming()
                    }]);
                mockChatSessionsService.registerChatSessionItemController(localChatSessionType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 1);
                assert.strictEqual(viewModel.sessions[0].providerType, localChatSessionType);
            });
        });
        test('should correctly construct resource URIs for sessions', async () => {
            return runWithFakedTimers({}, async () => {
                const resource = URI.parse('custom://my-session/path');
                const controller = new StaticChatSessionItemController([{
                        resource: resource,
                        label: 'Test Session',
                        timing: makeNewSessionTiming()
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = createViewModel();
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 1);
                assert.strictEqual(viewModel.sessions[0].resource.toString(), resource.toString());
            });
        });
        test('should throttle multiple rapid resolve calls', async () => {
            return runWithFakedTimers({}, async () => {
                let controllerCallCount = 0;
                const controller = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => { controllerCallCount++; },
                    get items() {
                        return [makeSimpleSessionItem('session-1')];
                    }
                };
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                // Registering calls a refresh initially
                assert.strictEqual(controllerCallCount, 1);
                viewModel = createViewModel();
                // Make multiple rapid resolve calls
                const resolvePromises = [
                    viewModel.resolve(undefined),
                    viewModel.resolve(undefined),
                    viewModel.resolve(undefined)
                ];
                await Promise.all(resolvePromises);
                // Should only call controller once more due to throttling
                assert.strictEqual(controllerCallCount, 2);
                assert.strictEqual(viewModel.sessions.length, 1);
            });
        });
        test('should preserve sessions from non-resolved controllers', async () => {
            return runWithFakedTimers({}, async () => {
                let controller1CallCount = 0;
                let controller2CallCount = 0;
                let _items1 = [];
                let _items2 = [];
                const controller1 = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        controller1CallCount++;
                        _items1 = [{
                                resource: URI.parse('test://session-1'),
                                label: `Session 1 (call ${controller1CallCount})`,
                                timing: makeNewSessionTiming()
                            }];
                    },
                    get items() { return _items1; }
                };
                const controller2 = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        controller2CallCount++;
                        _items2 = [{
                                resource: URI.parse('test://session-2'),
                                label: `Session 2 (call ${controller2CallCount})`,
                                timing: makeNewSessionTiming()
                            }];
                    },
                    get items() { return _items2; }
                };
                registerContribution('type-1');
                registerContribution('type-2');
                mockChatSessionsService.registerChatSessionItemController('type-1', controller1);
                mockChatSessionsService.registerChatSessionItemController('type-2', controller2);
                viewModel = createViewModel();
                // First resolve all
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 2);
                assert.strictEqual(controller1CallCount, 2); // One from registration and one from resolve
                assert.strictEqual(controller2CallCount, 2); // One from registration and one from resolve
                // Now resolve only type-2
                await viewModel.resolve('type-2');
                // Per-provider resolution: type-1 sessions are preserved
                assert.strictEqual(viewModel.sessions.length, 2);
                // Controller 1 should not be called again
                assert.strictEqual(controller1CallCount, 2);
                // Controller 2 should be called again
                assert.strictEqual(controller2CallCount, 3);
            });
        });
        test('should resolve providers independently (per-provider delayers)', async () => {
            return runWithFakedTimers({}, async () => {
                let controller1RefreshCount = 0;
                let controller2RefreshCount = 0;
                let _items1 = [];
                let _items2 = [];
                const controller1 = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        controller1RefreshCount++;
                        _items1 = [makeSimpleSessionItem('session-1', { label: `Session 1 v${controller1RefreshCount}` })];
                    },
                    get items() { return _items1; }
                };
                const controller2 = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        controller2RefreshCount++;
                        _items2 = [makeSimpleSessionItem('session-2', { label: `Session 2 v${controller2RefreshCount}` })];
                    },
                    get items() { return _items2; }
                };
                registerContribution('type-1');
                registerContribution('type-2');
                mockChatSessionsService.registerChatSessionItemController('type-1', controller1);
                mockChatSessionsService.registerChatSessionItemController('type-2', controller2);
                viewModel = createViewModel();
                // Resolve all to populate both providers
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 2);
                // Resolve only type-1: should refresh only type-1, preserve type-2
                const type1RefreshBefore = controller1RefreshCount;
                const type2RefreshBefore = controller2RefreshCount;
                await viewModel.resolve('type-1');
                assert.strictEqual(controller1RefreshCount, type1RefreshBefore + 1);
                assert.strictEqual(controller2RefreshCount, type2RefreshBefore); // not refreshed
                assert.strictEqual(viewModel.sessions.length, 2); // type-2 session preserved
                // Resolve only type-2: should refresh only type-2, preserve type-1
                await viewModel.resolve('type-2');
                assert.strictEqual(controller2RefreshCount, type2RefreshBefore + 1);
                assert.strictEqual(viewModel.sessions.length, 2); // type-1 session preserved
            });
        });
        test('should accumulate providers when resolve is called with different provider types', async () => {
            return runWithFakedTimers({}, async () => {
                let resolveCount = 0;
                const resolvedProviders = [];
                let _items1 = [];
                let _items2 = [];
                const controller1 = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        resolveCount++;
                        resolvedProviders.push('type-1');
                        _items1 = [makeSimpleSessionItem('session-1')];
                    },
                    get items() { return _items1; }
                };
                const controller2 = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        resolveCount++;
                        resolvedProviders.push('type-2');
                        _items2 = [{
                                resource: URI.parse('test://session-2'),
                                label: 'Session 2',
                                timing: makeNewSessionTiming()
                            }];
                    },
                    get items() { return _items2; }
                };
                registerContribution('type-1');
                registerContribution('type-2');
                mockChatSessionsService.registerChatSessionItemController('type-1', controller1);
                mockChatSessionsService.registerChatSessionItemController('type-2', controller2);
                viewModel = createViewModel();
                // Call resolve with different types rapidly - they should accumulate
                const promise1 = viewModel.resolve('type-1');
                const promise2 = viewModel.resolve(['type-2']);
                await Promise.all([promise1, promise2]);
                // Both providers should be resolved
                assert.strictEqual(viewModel.sessions.length, 2);
            });
        });
    });
    suite('AgentSessionsViewModel - Helper Functions', () => {
        const disposables = new DisposableStore();
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('isLocalAgentSessionItem should identify local sessions', () => {
            const localSession = {
                providerType: localChatSessionType,
                providerLabel: 'Local',
                icon: Codicon.chatSparkle,
                resource: URI.parse('test://local-1'),
                label: 'Local',
                description: 'test',
                timing: makeNewSessionTiming(),
                status: 1 /* ChatSessionStatus.Completed */,
                isArchived: () => false,
                setArchived: archived => { },
                isPinned: () => false,
                setPinned: pinned => { },
                isRead: () => false,
                isMarkedUnread: () => false,
                setRead: read => { }
            };
            const remoteSession = {
                providerType: 'remote',
                providerLabel: 'Remote',
                icon: Codicon.chatSparkle,
                resource: URI.parse('test://remote-1'),
                label: 'Remote',
                description: 'test',
                timing: makeNewSessionTiming(),
                status: 1 /* ChatSessionStatus.Completed */,
                isArchived: () => false,
                setArchived: archived => { },
                isPinned: () => false,
                setPinned: pinned => { },
                isRead: () => false,
                isMarkedUnread: () => false,
                setRead: read => { }
            };
            assert.strictEqual(isLocalAgentSessionItem(localSession), true);
            assert.strictEqual(isLocalAgentSessionItem(remoteSession), false);
        });
        test('isAgentSession should identify session view models', () => {
            const session = {
                providerType: 'test',
                providerLabel: 'Local',
                icon: Codicon.chatSparkle,
                resource: URI.parse('test://test-1'),
                label: 'Test',
                description: 'test',
                timing: makeNewSessionTiming(),
                status: 1 /* ChatSessionStatus.Completed */,
                isArchived: () => false,
                setArchived: archived => { },
                isPinned: () => false,
                setPinned: pinned => { },
                isRead: () => false,
                isMarkedUnread: () => false,
                setRead: read => { }
            };
            // Test with a session object
            assert.strictEqual(isAgentSession(session), true);
            // Test with a sessions container - pass as session to see it returns false
            const sessionOrContainer = session;
            assert.strictEqual(isAgentSession(sessionOrContainer), true);
        });
        test('isAgentSessionsViewModel should identify sessions view models', () => {
            const session = {
                providerType: 'test',
                providerLabel: 'Local',
                icon: Codicon.chatSparkle,
                resource: URI.parse('test://test-1'),
                label: 'Test',
                description: 'test',
                timing: makeNewSessionTiming(),
                status: 1 /* ChatSessionStatus.Completed */,
                isArchived: () => false,
                setArchived: archived => { },
                isPinned: () => false,
                setPinned: pinned => { },
                isRead: () => false,
                isMarkedUnread: () => false,
                setRead: read => { }
            };
            // Test with actual view model
            const instantiationService = workbenchInstantiationService(undefined, disposables);
            const lifecycleService = disposables.add(new TestLifecycleService());
            instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
            instantiationService.stub(ILifecycleService, lifecycleService);
            const actualViewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
            assert.strictEqual(isAgentSessionsModel(actualViewModel), true);
            // Test with session object
            assert.strictEqual(isAgentSessionsModel(session), false);
        });
    });
    suite('AgentSessionsFilter', () => {
        const disposables = new DisposableStore();
        const storageKey = 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu';
        let mockChatSessionsService;
        let instantiationService;
        function createSession(overrides = {}) {
            return {
                providerType: chatSessionTestType,
                providerLabel: 'Test Provider',
                icon: Codicon.chatSparkle,
                resource: URI.parse('test://session'),
                label: 'Test Session',
                timing: makeNewSessionTiming(),
                status: 1 /* ChatSessionStatus.Completed */,
                isArchived: () => false,
                setArchived: () => { },
                isPinned: () => false,
                setPinned: () => { },
                isRead: () => false,
                isMarkedUnread: () => false,
                setRead: read => { },
                ...overrides
            };
        }
        setup(() => {
            mockChatSessionsService = new MockChatSessionsService();
            instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
            instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        });
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should initialize with default excludes', () => {
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            // Default: archived sessions should NOT be excluded unless grouped by capped
            const archivedSession = createSession({
                isArchived: () => true
            });
            const activeSession = createSession({
                isArchived: () => false
            });
            assert.strictEqual(filter.exclude(archivedSession), false);
            assert.strictEqual(filter.exclude(activeSession), false);
        });
        test('should filter out sessions from excluded provider', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const session1 = createSession({
                providerType: 'type-1',
                resource: URI.parse('test://session-1')
            });
            const session2 = createSession({
                providerType: 'type-2',
                resource: URI.parse('test://session-2')
            });
            // Initially, no sessions should be filtered by provider
            assert.strictEqual(filter.exclude(session1), false);
            assert.strictEqual(filter.exclude(session2), false);
            // Exclude type-1 by setting it in storage
            const excludes = {
                providers: ['type-1'],
                states: [],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // After excluding type-1, session1 should be filtered but not session2
            assert.strictEqual(filter.exclude(session1), true);
            assert.strictEqual(filter.exclude(session2), false);
        });
        test('should filter out multiple excluded controllers', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const session1 = createSession({ providerType: 'type-1' });
            const session2 = createSession({ providerType: 'type-2' });
            const session3 = createSession({ providerType: 'type-3' });
            // Exclude type-1 and type-2
            const excludes = {
                providers: ['type-1', 'type-2'],
                states: [],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            assert.strictEqual(filter.exclude(session1), true);
            assert.strictEqual(filter.exclude(session2), true);
            assert.strictEqual(filter.exclude(session3), false);
        });
        test('should not exclude archived sessions when not capped', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const archivedSession = createSession({
                resource: URI.parse('test://archived-session'),
                isArchived: () => true
            });
            const activeSession = createSession({
                resource: URI.parse('test://active-session'),
                isArchived: () => false
            });
            // By default, archived sessions should NOT be filtered when not capped
            assert.strictEqual(filter.exclude(archivedSession), false);
            assert.strictEqual(filter.exclude(activeSession), false);
            // Exclude archived by setting archived to true in storage
            const excludes = {
                providers: [],
                states: [],
                archived: true
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // Archived exclusion only applies when grouped by capped
            assert.strictEqual(filter.exclude(archivedSession), false);
            assert.strictEqual(filter.exclude(activeSession), false);
        });
        test('should filter out sessions with excluded status', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const failedSession = createSession({
                resource: URI.parse('test://failed-session'),
                status: 0 /* ChatSessionStatus.Failed */
            });
            const completedSession = createSession({
                resource: URI.parse('test://completed-session'),
                status: 1 /* ChatSessionStatus.Completed */
            });
            const inProgressSession = createSession({
                resource: URI.parse('test://inprogress-session'),
                status: 2 /* ChatSessionStatus.InProgress */
            });
            // Initially, no sessions should be filtered by status (archived is default exclude)
            assert.strictEqual(filter.exclude(failedSession), false);
            assert.strictEqual(filter.exclude(completedSession), false);
            assert.strictEqual(filter.exclude(inProgressSession), false);
            // Exclude failed status by setting it in storage
            const excludes = {
                providers: [],
                states: [0 /* ChatSessionStatus.Failed */],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // After excluding failed status, only failedSession should be filtered
            assert.strictEqual(filter.exclude(failedSession), true);
            assert.strictEqual(filter.exclude(completedSession), false);
            assert.strictEqual(filter.exclude(inProgressSession), false);
        });
        test('should filter out multiple excluded statuses', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const failedSession = createSession({ status: 0 /* ChatSessionStatus.Failed */ });
            const completedSession = createSession({ status: 1 /* ChatSessionStatus.Completed */ });
            const inProgressSession = createSession({ status: 2 /* ChatSessionStatus.InProgress */ });
            // Exclude failed and in-progress
            const excludes = {
                providers: [],
                states: [0 /* ChatSessionStatus.Failed */, 2 /* ChatSessionStatus.InProgress */],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            assert.strictEqual(filter.exclude(failedSession), true);
            assert.strictEqual(filter.exclude(completedSession), false);
            assert.strictEqual(filter.exclude(inProgressSession), true);
        });
        test('should combine multiple filter conditions', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const session1 = createSession({
                providerType: 'type-1',
                status: 0 /* ChatSessionStatus.Failed */,
                isArchived: () => true
            });
            const session2 = createSession({
                providerType: 'type-2',
                status: 1 /* ChatSessionStatus.Completed */,
                isArchived: () => false
            });
            // Exclude type-1, failed status, and archived
            const excludes = {
                providers: ['type-1'],
                states: [0 /* ChatSessionStatus.Failed */],
                archived: true
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // session1 should be excluded for multiple reasons
            assert.strictEqual(filter.exclude(session1), true);
            // session2 should not be excluded
            assert.strictEqual(filter.exclude(session2), false);
        });
        test('should emit onDidChange when excludes are updated', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            let changeEventFired = false;
            disposables.add(filter.onDidChange(() => {
                changeEventFired = true;
            }));
            // Update excludes
            const excludes = {
                providers: ['type-1'],
                states: [],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            assert.strictEqual(changeEventFired, true);
        });
        test('should handle storage updates from other windows', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const session = createSession({ providerType: 'type-1' });
            // Initially not excluded
            assert.strictEqual(filter.exclude(session), false);
            // Simulate storage update from another window
            const excludes = {
                providers: ['type-1'],
                states: [],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // Should now be excluded
            assert.strictEqual(filter.exclude(session), true);
        });
        test('should register provider filter actions', () => {
            const controller = new StaticChatSessionItemController([]);
            mockChatSessionsService.registerChatSessionItemController('custom-type-1', controller);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            // Filter should work with custom provider
            const session = createSession({ providerType: 'custom-type-1' });
            assert.strictEqual(filter.exclude(session), false);
        });
        test('should handle providers registered after filter creation', () => {
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const chatSessionType = 'new-type';
            const controller = new StaticChatSessionItemController([]);
            // Register provider after filter creation
            mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
            mockChatSessionsService.fireDidChangeItemsProviders({ chatSessionType });
            // Filter should work with new provider
            const session = createSession({ providerType: 'new-type' });
            assert.strictEqual(filter.exclude(session), false);
        });
        test('should not exclude when all filters are disabled', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const session = createSession({
                providerType: 'type-1',
                status: 0 /* ChatSessionStatus.Failed */,
                isArchived: () => true
            });
            // Disable all filters
            const excludes = {
                providers: [],
                states: [],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // Nothing should be excluded
            assert.strictEqual(filter.exclude(session), false);
        });
        test('should handle empty provider list in storage', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const session = createSession({ providerType: 'type-1' });
            // Set empty provider list
            const excludes = {
                providers: [],
                states: [],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            assert.strictEqual(filter.exclude(session), false);
        });
        test('should handle different MenuId contexts', () => {
            const storageService = instantiationService.get(IStorageService);
            // Create two filters with different menu IDs
            const filter1 = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const filter2 = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewItemContext }));
            const session = createSession({ providerType: 'type-1' });
            // Set excludes only for ViewTitle
            const excludes = {
                providers: ['type-1'],
                states: [],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // filter1 should exclude the session
            assert.strictEqual(filter1.exclude(session), true);
            // filter2 should also exclude the session (shared storage key)
            assert.strictEqual(filter2.exclude(session), true);
        });
        test('should handle malformed storage data gracefully', () => {
            const storageService = instantiationService.get(IStorageService);
            // Store malformed JSON
            storageService.store(storageKey, 'invalid json', 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // Filter should still be created with default excludes
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const archivedSession = createSession({ isArchived: () => true });
            // Default behavior: archived should NOT be excluded
            assert.strictEqual(filter.exclude(archivedSession), false);
        });
        test('should prioritize archived check first', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const session = createSession({
                providerType: 'type-1',
                status: 1 /* ChatSessionStatus.Completed */,
                isArchived: () => true
            });
            // Set excludes for provider and status, but include archived
            const excludes = {
                providers: ['type-1'],
                states: [1 /* ChatSessionStatus.Completed */],
                archived: true
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            // Should be excluded due to archived (checked first)
            assert.strictEqual(filter.exclude(session), true);
        });
        test('should handle all three status types correctly', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const completedSession = createSession({ status: 1 /* ChatSessionStatus.Completed */ });
            const inProgressSession = createSession({ status: 2 /* ChatSessionStatus.InProgress */ });
            const failedSession = createSession({ status: 0 /* ChatSessionStatus.Failed */ });
            // Exclude all statuses
            const excludes = {
                providers: [],
                states: [1 /* ChatSessionStatus.Completed */, 2 /* ChatSessionStatus.InProgress */, 0 /* ChatSessionStatus.Failed */],
                archived: false
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            assert.strictEqual(filter.exclude(completedSession), true);
            assert.strictEqual(filter.exclude(inProgressSession), true);
            assert.strictEqual(filter.exclude(failedSession), true);
        });
        test('should exclude sessions from non-allowed providers when allowedProviders is set', () => {
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, {
                filterMenuId: MenuId.ViewTitle,
                allowedProviders: [AgentSessionProviders.Background, AgentSessionProviders.Cloud],
            }));
            const backgroundSession = createSession({ providerType: AgentSessionProviders.Background });
            const cloudSession = createSession({ providerType: AgentSessionProviders.Cloud });
            const claudeSession = createSession({ providerType: AgentSessionProviders.Claude });
            const codexSession = createSession({ providerType: AgentSessionProviders.Codex });
            const localSession = createSession({ providerType: AgentSessionProviders.Local });
            assert.strictEqual(filter.exclude(backgroundSession), false, 'Background should be allowed');
            assert.strictEqual(filter.exclude(cloudSession), false, 'Cloud should be allowed');
            assert.strictEqual(filter.exclude(claudeSession), true, 'Claude should be excluded');
            assert.strictEqual(filter.exclude(codexSession), true, 'Codex should be excluded');
            assert.strictEqual(filter.exclude(localSession), true, 'Local should be excluded');
        });
        test('should not exclude any provider when allowedProviders is not set', () => {
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            const claudeSession = createSession({ providerType: AgentSessionProviders.Claude });
            const codexSession = createSession({ providerType: AgentSessionProviders.Codex });
            const unknownSession = createSession({ providerType: 'some-unknown-type' });
            assert.strictEqual(filter.exclude(claudeSession), false);
            assert.strictEqual(filter.exclude(codexSession), false);
            assert.strictEqual(filter.exclude(unknownSession), false);
        });
        test('should still apply user excludes on top of allowedProviders', () => {
            const storageService = instantiationService.get(IStorageService);
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, {
                filterMenuId: MenuId.ViewTitle,
                allowedProviders: [AgentSessionProviders.Background, AgentSessionProviders.Cloud],
            }));
            // User excludes Cloud via storage
            const excludes = {
                providers: [AgentSessionProviders.Cloud],
                states: [],
                archived: false,
                read: false,
            };
            storageService.store(storageKey, JSON.stringify(excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            const backgroundSession = createSession({ providerType: AgentSessionProviders.Background });
            const cloudSession = createSession({ providerType: AgentSessionProviders.Cloud });
            const claudeSession = createSession({ providerType: AgentSessionProviders.Claude });
            assert.strictEqual(filter.exclude(backgroundSession), false, 'Background is allowed and not user-excluded');
            assert.strictEqual(filter.exclude(cloudSession), true, 'Cloud is allowed but user-excluded');
            assert.strictEqual(filter.exclude(claudeSession), true, 'Claude is not in allowedProviders');
        });
    });
    suite('AgentSessionsViewModel - Session Archiving', () => {
        const disposables = new DisposableStore();
        let mockChatSessionsService;
        let instantiationService;
        let viewModel;
        setup(() => {
            mockChatSessionsService = new MockChatSessionsService();
            instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
            instantiationService.stub(IChatSessionsService, mockChatSessionsService);
            instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        });
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should archive and unarchive sessions', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.isArchived(), false);
                // Archive the session
                session.setArchived(true);
                assert.strictEqual(session.isArchived(), true);
                // Unarchive the session
                session.setArchived(false);
                assert.strictEqual(session.isArchived(), false);
            });
        });
        test('should fire onDidChangeSessions when archiving', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                let changeEventFired = false;
                disposables.add(viewModel.onDidChangeSessions(() => {
                    changeEventFired = true;
                }));
                session.setArchived(true);
                assert.strictEqual(changeEventFired, true);
            });
        });
        test('should not fire onDidChangeSessions when archiving with same value', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                session.setArchived(true);
                let changeEventFired = false;
                disposables.add(viewModel.onDidChangeSessions(() => {
                    changeEventFired = true;
                }));
                // Try to archive again with same value
                session.setArchived(true);
                assert.strictEqual(changeEventFired, false);
            });
        });
        test('should preserve archived state from provider', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-1'),
                        label: 'Test Session',
                        archived: true,
                        timing: makeNewSessionTiming()
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.isArchived(), true);
            });
        });
        test('should override provider archived state with user preference', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-1'),
                        label: 'Test Session',
                        archived: true,
                        timing: makeNewSessionTiming()
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.isArchived(), true);
                // User unarchives
                session.setArchived(false);
                assert.strictEqual(session.isArchived(), false);
                // Re-resolve should preserve user preference
                await viewModel.resolve(undefined);
                const sessionAfterResolve = viewModel.sessions[0];
                assert.strictEqual(sessionAfterResolve.isArchived(), false);
            });
        });
    });
    suite('AgentSessionsViewModel - Session Read State', () => {
        const disposables = new DisposableStore();
        let mockChatSessionsService;
        let instantiationService;
        let viewModel;
        setup(() => {
            mockChatSessionsService = new MockChatSessionsService();
            instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
            instantiationService.stub(IChatSessionsService, mockChatSessionsService);
            instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
            const storageService = instantiationService.get(IStorageService);
            storageService.store('agentSessions.readDateBaseline2', 1, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        });
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should mark session as read and unread', async () => {
            return runWithFakedTimers({}, async () => {
                const futureSessionTiming = {
                    created: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-1'),
                        label: 'Session 1',
                        timing: futureSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Mark as read
                session.setRead(true);
                assert.strictEqual(session.isRead(), true);
                // Mark as unread
                session.setRead(false);
                assert.strictEqual(session.isRead(), false);
                assert.strictEqual(session.isMarkedUnread(), true);
            });
        });
        test('should report isMarkedUnread only when explicitly marked unread', async () => {
            return runWithFakedTimers({}, async () => {
                const futureSessionTiming = {
                    created: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-1'),
                        label: 'Session 1',
                        timing: futureSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Naturally unread session is NOT marked unread (no explicit user action)
                assert.strictEqual(session.isRead(), false);
                assert.strictEqual(session.isMarkedUnread(), false);
                // Mark as read, then explicitly mark as unread
                session.setRead(true);
                assert.strictEqual(session.isMarkedUnread(), false);
                session.setRead(false);
                assert.strictEqual(session.isMarkedUnread(), true);
            });
        });
        test('should fire onDidChangeSessions when marking as read', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                session.setRead(false); // ensure it's unread first
                let changeEventFired = false;
                disposables.add(viewModel.onDidChangeSessions(() => {
                    changeEventFired = true;
                }));
                session.setRead(true);
                assert.strictEqual(changeEventFired, true);
            });
        });
        test('should not fire onDidChangeSessions when marking as read with same value', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                session.setRead(true);
                let changeEventFired = false;
                disposables.add(viewModel.onDidChangeSessions(() => {
                    changeEventFired = true;
                }));
                // Try to mark as read again with same value
                session.setRead(true);
                assert.strictEqual(changeEventFired, false);
            });
        });
        test('should preserve read state after re-resolve', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                session.setRead(true);
                assert.strictEqual(session.isRead(), true);
                // Re-resolve should preserve read state
                await viewModel.resolve(undefined);
                const sessionAfterResolve = viewModel.sessions[0];
                assert.strictEqual(sessionAfterResolve.isRead(), true);
            });
        });
        test('should consider sessions before initial date as read by default', async () => {
            return runWithFakedTimers({}, async () => {
                // Without migration, all sessions are unread by default
                const oldSessionTiming = {
                    created: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestEnded: Date.UTC(2025, 10 /* November */, 2),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://old-session'),
                        label: 'Old Session',
                        timing: oldSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Sessions are unread by default (migration already happened in setup)
                assert.strictEqual(session.isRead(), false);
            });
        });
        test('should consider sessions after initial date as unread by default', async () => {
            return runWithFakedTimers({}, async () => {
                const newSessionTiming = {
                    created: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://new-session'),
                        label: 'New Session',
                        timing: newSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Sessions after the initial date should be considered unread
                assert.strictEqual(session.isRead(), false);
            });
        });
        test('should use endTime for read state comparison when available', async () => {
            return runWithFakedTimers({}, async () => {
                // Session with startTime before initial date but endTime after
                const sessionTiming = {
                    created: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestEnded: Date.UTC(2026, 1 /* February */, 1),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-with-endtime'),
                        label: 'Session With EndTime',
                        timing: sessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Should use lastRequestEnded (December 10) which is after the initial date
                assert.strictEqual(session.isRead(), false);
            });
        });
        test('should use startTime for read state comparison when endTime is not available', async () => {
            return runWithFakedTimers({}, async () => {
                // Session with only startTime
                const sessionTiming = {
                    created: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestEnded: undefined,
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-no-endtime'),
                        label: 'Session Without EndTime',
                        timing: sessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Sessions are unread by default
                assert.strictEqual(session.isRead(), false);
            });
        });
        test('should treat archived sessions as read', async () => {
            return runWithFakedTimers({}, async () => {
                const newSessionTiming = {
                    created: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://new-session'),
                        label: 'New Session',
                        timing: newSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Session after the initial date should be unread by default
                assert.strictEqual(session.isRead(), false);
                assert.strictEqual(session.isArchived(), false);
                // Archive the session
                session.setArchived(true);
                // Archived sessions should always be considered read
                assert.strictEqual(session.isArchived(), true);
                assert.strictEqual(session.isRead(), true);
            });
        });
        test('should mark session as read when archiving', async () => {
            return runWithFakedTimers({}, async () => {
                const newSessionTiming = {
                    created: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://new-session'),
                        label: 'New Session',
                        timing: newSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.isRead(), false);
                // Archive the session
                session.setArchived(true);
                // Should be read after archiving (archived sessions are always read)
                assert.strictEqual(session.isRead(), true);
                // Unarchive the session
                session.setArchived(false);
                // After unarchiving, the read state depends on the stored read date vs session timing.
                // When archiving marked the session as read, the read date was set to the test's
                // faked Date.now() which may be earlier than the session's lastRequestEnded,
                // so the session may appear unread again based on the time comparison.
                assert.strictEqual(session.isArchived(), false);
            });
        });
        test('should fire onDidChangeSessions when archiving an unread session', async () => {
            return runWithFakedTimers({}, async () => {
                const newSessionTiming = {
                    created: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
                    lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
                };
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://new-session'),
                        label: 'New Session',
                        timing: newSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.isRead(), false);
                let changeEventCount = 0;
                disposables.add(viewModel.onDidChangeSessions(() => {
                    changeEventCount++;
                }));
                // Archive the session (which also marks as read)
                session.setArchived(true);
                // Fires twice: once for setting read state, once for setting archived state
                assert.strictEqual(changeEventCount, 2);
            });
        });
        test('should not fire onDidChangeSessions when archiving an already read session', async () => {
            return runWithFakedTimers({}, async () => {
                // Session with timing
                const oldSessionTiming = {
                    created: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
                    lastRequestEnded: Date.UTC(2025, 10 /* November */, 2),
                };
                const chatSessionType = chatSessionTestType;
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://old-session'),
                        label: 'Old Session',
                        timing: oldSessionTiming,
                    }]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                // Mark session as read first
                session.setRead(true);
                assert.strictEqual(session.isRead(), true);
                let changeEventCount = 0;
                disposables.add(viewModel.onDidChangeSessions(() => {
                    changeEventCount++;
                }));
                // Archive the session
                session.setArchived(true);
                // Should fire only once for archived state change since session is already read
                assert.strictEqual(changeEventCount, 1);
            });
        });
    });
    suite('AgentSessionsViewModel - State Tracking', () => {
        const disposables = new DisposableStore();
        let mockChatSessionsService;
        let instantiationService;
        let viewModel;
        setup(() => {
            mockChatSessionsService = new MockChatSessionsService();
            instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
            instantiationService.stub(IChatSessionsService, mockChatSessionsService);
            instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        });
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should track status transitions', async () => {
            return runWithFakedTimers({}, async () => {
                let sessionStatus = 2 /* ChatSessionStatus.InProgress */;
                let _items = [];
                const controller = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        _items = [{
                                resource: URI.parse('test://session-1'),
                                label: 'Test Session',
                                status: sessionStatus,
                                timing: makeNewSessionTiming()
                            }];
                    },
                    get items() { return _items; }
                };
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions[0].status, 2 /* ChatSessionStatus.InProgress */);
                // Change status
                sessionStatus = 1 /* ChatSessionStatus.Completed */;
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions[0].status, 1 /* ChatSessionStatus.Completed */);
            });
        });
        test('should clean up state tracking for removed sessions', async () => {
            return runWithFakedTimers({}, async () => {
                let includeSessions = true;
                let _items = [];
                const controller = {
                    onDidChangeChatSessionItems: Event.None,
                    refresh: async () => {
                        if (includeSessions) {
                            _items = [makeSimpleSessionItem('session-1')];
                        }
                        else {
                            _items = [];
                        }
                    },
                    get items() { return _items; }
                };
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 1);
                // Remove sessions
                includeSessions = false;
                await viewModel.resolve(undefined);
                assert.strictEqual(viewModel.sessions.length, 0);
            });
        });
    });
    suite('AgentSessionsViewModel - Provider Icons and Names', () => {
        const disposables = new DisposableStore();
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should return correct name for Local provider', () => {
            const name = getAgentSessionProviderName(AgentSessionProviders.Local);
            assert.ok(name.length > 0);
        });
        test('should return correct name for Background provider', () => {
            const name = getAgentSessionProviderName(AgentSessionProviders.Background);
            assert.ok(name.length > 0);
        });
        test('should return correct name for Cloud provider', () => {
            const name = getAgentSessionProviderName(AgentSessionProviders.Cloud);
            assert.ok(name.length > 0);
        });
        test('should return correct icon for Local provider', () => {
            const icon = getAgentSessionProviderIcon(AgentSessionProviders.Local);
            assert.strictEqual(icon.id, Codicon.vm.id);
        });
        test('should return correct icon for Background provider', () => {
            const icon = getAgentSessionProviderIcon(AgentSessionProviders.Background);
            assert.strictEqual(icon.id, Codicon.worktree.id);
        });
        test('should return correct icon for Cloud provider', () => {
            const icon = getAgentSessionProviderIcon(AgentSessionProviders.Cloud);
            assert.strictEqual(icon.id, Codicon.cloud.id);
        });
        test('should return correct name for Growth provider', () => {
            const name = getAgentSessionProviderName(AgentSessionProviders.Growth);
            assert.strictEqual(name, 'Growth');
        });
        test('should return correct icon for Growth provider', () => {
            const icon = getAgentSessionProviderIcon(AgentSessionProviders.Growth);
            assert.strictEqual(icon.id, Codicon.lightbulb.id);
        });
        test('should handle Local provider type in model', async () => {
            return runWithFakedTimers({}, async () => {
                const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
                const mockChatSessionsService = new MockChatSessionsService();
                instantiationService.stub(IChatSessionsService, mockChatSessionsService);
                instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Local, controller);
                const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.providerType, AgentSessionProviders.Local);
                assert.strictEqual(session.icon.id, Codicon.vm.id);
                assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Local));
            });
        });
        test('should handle Background provider type in model', async () => {
            return runWithFakedTimers({}, async () => {
                const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
                const mockChatSessionsService = new MockChatSessionsService();
                instantiationService.stub(IChatSessionsService, mockChatSessionsService);
                instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Background, controller);
                const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.providerType, AgentSessionProviders.Background);
                assert.strictEqual(session.icon.id, Codicon.worktree.id);
                assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Background));
            });
        });
        test('should handle Cloud provider type in model', async () => {
            return runWithFakedTimers({}, async () => {
                const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
                const mockChatSessionsService = new MockChatSessionsService();
                instantiationService.stub(IChatSessionsService, mockChatSessionsService);
                instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Cloud, controller);
                const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.providerType, AgentSessionProviders.Cloud);
                assert.strictEqual(session.icon.id, Codicon.cloud.id);
                assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Cloud));
            });
        });
        test('should use custom icon from session item', async () => {
            return runWithFakedTimers({}, async () => {
                const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
                const mockChatSessionsService = new MockChatSessionsService();
                instantiationService.stub(IChatSessionsService, mockChatSessionsService);
                instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
                const customIcon = ThemeIcon.fromId('beaker');
                const controller = new StaticChatSessionItemController([{
                        resource: URI.parse('test://session-1'),
                        label: 'Test Session',
                        iconPath: customIcon,
                        timing: makeNewSessionTiming()
                    }]);
                mockChatSessionsService.registerChatSessionItemController('custom-type', controller);
                const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.icon.id, customIcon.id);
            });
        });
        test('should use default icon for custom provider without iconPath', async () => {
            return runWithFakedTimers({}, async () => {
                const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
                const mockChatSessionsService = new MockChatSessionsService();
                instantiationService.stub(IChatSessionsService, mockChatSessionsService);
                instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController('custom-type', controller);
                const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                await viewModel.resolve(undefined);
                const session = viewModel.sessions[0];
                assert.strictEqual(session.icon.id, Codicon.terminal.id);
            });
        });
    });
    suite('AgentSessionsViewModel - getAgentCanContinueIn', () => {
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should return true for Cloud provider', () => {
            const result = getAgentCanContinueIn(AgentSessionProviders.Cloud);
            assert.strictEqual(result, true);
        });
        test('should return false for Growth provider', () => {
            const result = getAgentCanContinueIn(AgentSessionProviders.Growth);
            assert.strictEqual(result, false);
        });
    });
    suite('AgentSessionsViewModel - Cancellation and Lifecycle', () => {
        const disposables = new DisposableStore();
        let mockChatSessionsService;
        let mockLifecycleService;
        let instantiationService;
        let viewModel;
        setup(() => {
            mockChatSessionsService = new MockChatSessionsService();
            mockLifecycleService = disposables.add(new TestLifecycleService());
            instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
            instantiationService.stub(IChatSessionsService, mockChatSessionsService);
            instantiationService.stub(ILifecycleService, mockLifecycleService);
        });
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should not resolve if lifecycle will shutdown', async () => {
            return runWithFakedTimers({}, async () => {
                const controller = new StaticChatSessionItemController([makeSimpleSessionItem('session-1')]);
                mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
                viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
                // Set willShutdown to true
                mockLifecycleService.willShutdown = true;
                await viewModel.resolve(undefined);
                // Should not resolve sessions
                assert.strictEqual(viewModel.sessions.length, 0);
            });
        });
    });
    suite('AgentSessionsFilter - Dynamic Provider Registration', () => {
        const disposables = new DisposableStore();
        let mockChatSessionsService;
        let instantiationService;
        setup(() => {
            mockChatSessionsService = new MockChatSessionsService();
            instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
            instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        });
        teardown(() => {
            disposables.clear();
        });
        ensureNoDisposablesAreLeakedInTestSuite();
        test('should respond to onDidChangeAvailability', () => {
            const filter = disposables.add(instantiationService.createInstance(AgentSessionsFilter, { filterMenuId: MenuId.ViewTitle }));
            disposables.add(filter.onDidChange(() => {
                // Event handler registered to verify filter responds to availability changes
            }));
            // Trigger availability change
            mockChatSessionsService.fireDidChangeAvailability();
            // Filter should update its actions (internally)
            // We can't directly test action registration but we verified event handling
        });
    });
}); // End of Agent Sessions suite
const chatSessionTestType = 'test-type';
function makeSimpleSessionItem(id, overrides) {
    return {
        resource: URI.parse(`${chatSessionTestType}://${id}`),
        label: `Session ${id}`,
        timing: makeNewSessionTiming(),
        ...overrides
    };
}
function makeNewSessionTiming(options) {
    const now = Date.now();
    return {
        created: options?.created ?? now,
        lastRequestStarted: options?.lastRequestStarted,
        lastRequestEnded: options?.lastRequestEnded,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uVmlld01vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvblZpZXdNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBaUIsY0FBYyxFQUFFLG9CQUFvQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDeEssT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDNUYsT0FBTyxFQUFtRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JLLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEy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
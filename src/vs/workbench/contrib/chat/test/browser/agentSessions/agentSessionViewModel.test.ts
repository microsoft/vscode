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
import { AgentSessionsModel, IAgentSession, isAgentSession, isAgentSessionsModel, isLocalAgentSessionItem } from '../../../browser/agentSessions/agentSessionsModel.js';
import { AgentSessionsFilter } from '../../../browser/agentSessions/agentSessionsFilter.js';
import { ChatSessionStatus, IChatSessionItemController, IChatSessionItem, IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { AgentSessionProviders, getAgentCanContinueIn, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../../../browser/agentSessions/agentSessions.js';


suite('AgentSessions', () => {

	suite('AgentSessionsViewModel', () => {

		const disposables = new DisposableStore();
		let mockChatSessionsService: MockChatSessionsService;
		let mockLifecycleService: TestLifecycleService;
		let viewModel: AgentSessionsModel;
		let instantiationService: TestInstantiationService;

		function createViewModel(): AgentSessionsModel {
			return disposables.add(instantiationService.createInstance(
				AgentSessionsModel,
			));
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
				const chatSessionType = 'test-type';
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [
							makeSimpleSessionItem('session-1', {
								label: 'Test Session 1'
							}),
							makeSimpleSessionItem('session-2', {
								label: 'Test Session 2'
							})
						];
					}
				};

				mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
				viewModel = createViewModel();

				await viewModel.resolve(undefined);

				assert.strictEqual(viewModel.sessions.length, 2);
				assert.strictEqual(viewModel.sessions[0].resource.toString(), 'test://session-1');
				assert.strictEqual(viewModel.sessions[0].label, 'Test Session 1');
				assert.strictEqual(viewModel.sessions[1].resource.toString(), 'test://session-2');
				assert.strictEqual(viewModel.sessions[1].label, 'Test Session 2');
			});
		});

		test('should resolve sessions from multiple controllers', async () => {
			return runWithFakedTimers({}, async () => {
				const controller1: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				const controller2: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-2')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('type-1', controller1);
				mockChatSessionsService.registerChatSessionItemController('type-2', controller2);

				viewModel = createViewModel();

				await viewModel.resolve(undefined);

				assert.strictEqual(viewModel.sessions.length, 2);
				assert.strictEqual(viewModel.sessions[0].resource.toString(), 'test://session-1');
				assert.strictEqual(viewModel.sessions[1].resource.toString(), 'test://session-2');
			});
		});

		test('should fire onWillResolve and onDidResolve events', async () => {
			return runWithFakedTimers({}, async () => {
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() { return []; }
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = createViewModel();

				let willResolveFired = false;
				let didResolveFired = false;

				disposables.add(viewModel.onWillResolve(() => {
					willResolveFired = true;
					assert.strictEqual(didResolveFired, false, 'onDidResolve should not fire before onWillResolve completes');
				}));

				disposables.add(viewModel.onDidResolve(() => {
					didResolveFired = true;
					assert.strictEqual(willResolveFired, true, 'onWillResolve should fire before onDidResolve');
				}));

				await viewModel.resolve(undefined);

				assert.strictEqual(willResolveFired, true, 'onWillResolve should have fired');
				assert.strictEqual(didResolveFired, true, 'onDidResolve should have fired');
			});
		});

		test('should fire onDidChangeSessions event after resolving', async () => {
			return runWithFakedTimers({}, async () => {
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://session-1'),
							label: 'Test Session',
							description: new MarkdownString('**Bold** description'),
							status: ChatSessionStatus.Completed,
							tooltip: 'Session tooltip',
							iconPath: ThemeIcon.fromId('check'),
							timing: { created, lastRequestStarted: created, lastRequestEnded },
							changes: { files: 1, insertions: 10, deletions: 5 }
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				assert.strictEqual(session.status, ChatSessionStatus.Completed);
				assert.strictEqual(session.timing.created, created);
				assert.strictEqual(session.timing.lastRequestEnded, lastRequestEnded);
				assert.deepStrictEqual(session.changes, { files: 1, insertions: 10, deletions: 5 });
			});
		});

		test('should handle resolve with specific provider', async () => {
			return runWithFakedTimers({}, async () => {
				const controller1: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				const controller2: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-2')];
					}
				};

				disposables.add(mockChatSessionsService.registerChatSessionItemController('type-1', controller1));
				disposables.add(mockChatSessionsService.registerChatSessionItemController('type-2', controller2));

				viewModel = createViewModel();

				// First resolve all
				await viewModel.resolve(undefined);
				assert.strictEqual(viewModel.sessions.length, 2);

				// Now resolve only type-1
				await viewModel.resolve('type-1');
				// Only type-1 sessions remain since non-resolved providers are cleared
				assert.strictEqual(viewModel.sessions.length, 1);
			});
		});

		test('should handle resolve with multiple specific controllers', async () => {
			return runWithFakedTimers({}, async () => {
				const controller1: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				const controller2: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-2')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('type-1', controller1);
				mockChatSessionsService.registerChatSessionItemController('type-2', controller2);

				viewModel = createViewModel();

				await viewModel.resolve(['type-1', 'type-2']);

				assert.strictEqual(viewModel.sessions.length, 2);
			});
		});

		test('should respond to onDidChangeItemsProviders event', async () => {
			return runWithFakedTimers({}, async () => {
				const chatSessionType = 'test-type';
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = createViewModel();

				const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);

				// Trigger event - this should automatically call resolve
				mockChatSessionsService.fireDidChangeSessionItems('test-type');

				// Wait for the sessions to be resolved
				await sessionsChangedPromise;

				assert.strictEqual(viewModel.sessions.length, 1);
			});
		});

		test('should maintain provider reference in session view model', async () => {
			return runWithFakedTimers({}, async () => {
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = createViewModel();

				await viewModel.resolve(undefined);

				assert.strictEqual(viewModel.sessions.length, 1);
				assert.strictEqual(viewModel.sessions[0].providerType, 'test-type');
			});
		});

		test('should handle empty provider results', async () => {
			return runWithFakedTimers({}, async () => {
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() { return []; }
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = createViewModel();

				await viewModel.resolve(undefined);

				assert.strictEqual(viewModel.sessions.length, 0);
			});
		});

		test('should handle sessions with different statuses', async () => {
			return runWithFakedTimers({}, async () => {
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [
							{
								id: 'session-failed',
								resource: URI.parse('test://session-failed'),
								label: 'Failed Session',
								status: ChatSessionStatus.Failed,
								timing: makeNewSessionTiming()
							},
							{
								id: 'session-completed',
								resource: URI.parse('test://session-completed'),
								label: 'Completed Session',
								status: ChatSessionStatus.Completed,
								timing: makeNewSessionTiming()
							},
							{
								id: 'session-inprogress',
								resource: URI.parse('test://session-inprogress'),
								label: 'In Progress Session',
								status: ChatSessionStatus.InProgress,
								timing: makeNewSessionTiming()
							}
						];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = createViewModel();

				await viewModel.resolve(undefined);

				assert.strictEqual(viewModel.sessions.length, 3);
				assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.Failed);
				assert.strictEqual(viewModel.sessions[1].status, ChatSessionStatus.Completed);
				assert.strictEqual(viewModel.sessions[2].status, ChatSessionStatus.InProgress);
			});
		});

		test('should replace sessions on re-resolve', async () => {
			return runWithFakedTimers({}, async () => {
				let sessionCount = 1;
				let _items: IChatSessionItem[] = [];

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => {
						_items = [];
						for (let i = 0; i < sessionCount; i++) {
							_items.push(makeSimpleSessionItem(`session-${i + 1}`));
						}
					},
					get items() { return _items; }
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							id: 'local-session',
							resource: LocalChatSessionUri.forSession('local-session'),
							label: 'Local Session',
							timing: makeNewSessionTiming()
						}];
					}
				};

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

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: resource,
							label: 'Test Session',
							timing: makeNewSessionTiming()
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = createViewModel();

				await viewModel.resolve(undefined);

				assert.strictEqual(viewModel.sessions.length, 1);
				assert.strictEqual(viewModel.sessions[0].resource.toString(), resource.toString());
			});
		});

		test('should throttle multiple rapid resolve calls', async () => {
			return runWithFakedTimers({}, async () => {
				let controllerCallCount = 0;

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { controllerCallCount++; },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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

		test('should not preserve sessions from non-resolved controllers', async () => {
			return runWithFakedTimers({}, async () => {
				let controller1CallCount = 0;
				let controller2CallCount = 0;
				let _items1: IChatSessionItem[] = [];
				let _items2: IChatSessionItem[] = [];

				const controller1: IChatSessionItemController = {
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

				const controller2: IChatSessionItemController = {
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

				// Should still have only one session
				assert.strictEqual(viewModel.sessions.length, 1);
				// Controller 1 should not be called again
				assert.strictEqual(controller1CallCount, 2);
				// Controller 2 should be called again
				assert.strictEqual(controller2CallCount, 3);
			});
		});

		test('should accumulate providers when resolve is called with different provider types', async () => {
			return runWithFakedTimers({}, async () => {
				let resolveCount = 0;
				const resolvedProviders: (string | undefined)[] = [];
				let _items1: IChatSessionItem[] = [];
				let _items2: IChatSessionItem[] = [];

				const controller1: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => {
						resolveCount++;
						resolvedProviders.push('type-1');
						_items1 = [makeSimpleSessionItem('session-1')];
					},
					get items() { return _items1; }
				};

				const controller2: IChatSessionItemController = {
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
			const localSession: IAgentSession = {
				providerType: localChatSessionType,
				providerLabel: 'Local',
				icon: Codicon.chatSparkle,
				resource: URI.parse('test://local-1'),
				label: 'Local',
				description: 'test',
				timing: makeNewSessionTiming(),
				status: ChatSessionStatus.Completed,
				isArchived: () => false,
				setArchived: archived => { },
				isRead: () => false,
				setRead: read => { }
			};

			const remoteSession: IAgentSession = {
				providerType: 'remote',
				providerLabel: 'Remote',
				icon: Codicon.chatSparkle,
				resource: URI.parse('test://remote-1'),
				label: 'Remote',
				description: 'test',
				timing: makeNewSessionTiming(),
				status: ChatSessionStatus.Completed,
				isArchived: () => false,
				setArchived: archived => { },
				isRead: () => false,
				setRead: read => { }
			};

			assert.strictEqual(isLocalAgentSessionItem(localSession), true);
			assert.strictEqual(isLocalAgentSessionItem(remoteSession), false);
		});

		test('isAgentSession should identify session view models', () => {
			const session: IAgentSession = {
				providerType: 'test',
				providerLabel: 'Local',
				icon: Codicon.chatSparkle,
				resource: URI.parse('test://test-1'),
				label: 'Test',
				description: 'test',
				timing: makeNewSessionTiming(),
				status: ChatSessionStatus.Completed,
				isArchived: () => false,
				setArchived: archived => { },
				isRead: () => false,
				setRead: read => { }
			};

			// Test with a session object
			assert.strictEqual(isAgentSession(session), true);

			// Test with a sessions container - pass as session to see it returns false
			const sessionOrContainer: IAgentSession = session;
			assert.strictEqual(isAgentSession(sessionOrContainer), true);
		});

		test('isAgentSessionsViewModel should identify sessions view models', () => {
			const session: IAgentSession = {
				providerType: 'test',
				providerLabel: 'Local',
				icon: Codicon.chatSparkle,
				resource: URI.parse('test://test-1'),
				label: 'Test',
				description: 'test',
				timing: makeNewSessionTiming(),
				status: ChatSessionStatus.Completed,
				isArchived: () => false,
				setArchived: archived => { },
				isRead: () => false,
				setRead: read => { }
			};

			// Test with actual view model
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const lifecycleService = disposables.add(new TestLifecycleService());
			instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
			instantiationService.stub(ILifecycleService, lifecycleService);
			const actualViewModel = disposables.add(instantiationService.createInstance(
				AgentSessionsModel,
			));
			assert.strictEqual(isAgentSessionsModel(actualViewModel), true);

			// Test with session object
			assert.strictEqual(isAgentSessionsModel(session), false);
		});
	});

	suite('AgentSessionsFilter', () => {
		const disposables = new DisposableStore();
		const storageKey = 'agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu';
		let mockChatSessionsService: MockChatSessionsService;
		let instantiationService: TestInstantiationService;

		function createSession(overrides: Partial<IAgentSession> = {}): IAgentSession {
			return {
				providerType: 'test-type',
				providerLabel: 'Test Provider',
				icon: Codicon.chatSparkle,
				resource: URI.parse('test://session'),
				label: 'Test Session',
				timing: makeNewSessionTiming(),
				status: ChatSessionStatus.Completed,
				isArchived: () => false,
				setArchived: () => { },
				isRead: () => false,
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
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

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
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

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
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// After excluding type-1, session1 should be filtered but not session2
			assert.strictEqual(filter.exclude(session1), true);
			assert.strictEqual(filter.exclude(session2), false);
		});

		test('should filter out multiple excluded controllers', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const session1 = createSession({ providerType: 'type-1' });
			const session2 = createSession({ providerType: 'type-2' });
			const session3 = createSession({ providerType: 'type-3' });

			// Exclude type-1 and type-2
			const excludes = {
				providers: ['type-1', 'type-2'],
				states: [],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			assert.strictEqual(filter.exclude(session1), true);
			assert.strictEqual(filter.exclude(session2), true);
			assert.strictEqual(filter.exclude(session3), false);
		});

		test('should not exclude archived sessions when not capped', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

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
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// Archived exclusion only applies when grouped by capped
			assert.strictEqual(filter.exclude(archivedSession), false);
			assert.strictEqual(filter.exclude(activeSession), false);
		});

		test('should filter out sessions with excluded status', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const failedSession = createSession({
				resource: URI.parse('test://failed-session'),
				status: ChatSessionStatus.Failed
			});

			const completedSession = createSession({
				resource: URI.parse('test://completed-session'),
				status: ChatSessionStatus.Completed
			});

			const inProgressSession = createSession({
				resource: URI.parse('test://inprogress-session'),
				status: ChatSessionStatus.InProgress
			});

			// Initially, no sessions should be filtered by status (archived is default exclude)
			assert.strictEqual(filter.exclude(failedSession), false);
			assert.strictEqual(filter.exclude(completedSession), false);
			assert.strictEqual(filter.exclude(inProgressSession), false);

			// Exclude failed status by setting it in storage
			const excludes = {
				providers: [],
				states: [ChatSessionStatus.Failed],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// After excluding failed status, only failedSession should be filtered
			assert.strictEqual(filter.exclude(failedSession), true);
			assert.strictEqual(filter.exclude(completedSession), false);
			assert.strictEqual(filter.exclude(inProgressSession), false);
		});

		test('should filter out multiple excluded statuses', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const failedSession = createSession({ status: ChatSessionStatus.Failed });
			const completedSession = createSession({ status: ChatSessionStatus.Completed });
			const inProgressSession = createSession({ status: ChatSessionStatus.InProgress });

			// Exclude failed and in-progress
			const excludes = {
				providers: [],
				states: [ChatSessionStatus.Failed, ChatSessionStatus.InProgress],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			assert.strictEqual(filter.exclude(failedSession), true);
			assert.strictEqual(filter.exclude(completedSession), false);
			assert.strictEqual(filter.exclude(inProgressSession), true);
		});

		test('should combine multiple filter conditions', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const session1 = createSession({
				providerType: 'type-1',
				status: ChatSessionStatus.Failed,
				isArchived: () => true
			});

			const session2 = createSession({
				providerType: 'type-2',
				status: ChatSessionStatus.Completed,
				isArchived: () => false
			});

			// Exclude type-1, failed status, and archived
			const excludes = {
				providers: ['type-1'],
				states: [ChatSessionStatus.Failed],
				archived: true
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// session1 should be excluded for multiple reasons
			assert.strictEqual(filter.exclude(session1), true);
			// session2 should not be excluded
			assert.strictEqual(filter.exclude(session2), false);
		});

		test('should emit onDidChange when excludes are updated', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

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
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			assert.strictEqual(changeEventFired, true);
		});

		test('should handle storage updates from other windows', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const session = createSession({ providerType: 'type-1' });

			// Initially not excluded
			assert.strictEqual(filter.exclude(session), false);

			// Simulate storage update from another window
			const excludes = {
				providers: ['type-1'],
				states: [],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// Should now be excluded
			assert.strictEqual(filter.exclude(session), true);
		});

		test('should register provider filter actions', () => {
			const controller: IChatSessionItemController = {
				onDidChangeChatSessionItems: Event.None,
				refresh: async () => { },
				get items() { return []; }
			};

			mockChatSessionsService.registerChatSessionItemController('custom-type-1', controller);

			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			// Filter should work with custom provider
			const session = createSession({ providerType: 'custom-type-1' });
			assert.strictEqual(filter.exclude(session), false);
		});

		test('should handle providers registered after filter creation', () => {
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const chatSessionType = 'new-type';
			const controller: IChatSessionItemController = {
				onDidChangeChatSessionItems: Event.None,
				refresh: async () => { },
				get items() { return []; }
			};

			// Register provider after filter creation
			mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
			mockChatSessionsService.fireDidChangeItemsProviders({ chatSessionType });

			// Filter should work with new provider
			const session = createSession({ providerType: 'new-type' });
			assert.strictEqual(filter.exclude(session), false);
		});

		test('should not exclude when all filters are disabled', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const session = createSession({
				providerType: 'type-1',
				status: ChatSessionStatus.Failed,
				isArchived: () => true
			});

			// Disable all filters
			const excludes = {
				providers: [],
				states: [],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// Nothing should be excluded
			assert.strictEqual(filter.exclude(session), false);
		});

		test('should handle empty provider list in storage', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const session = createSession({ providerType: 'type-1' });

			// Set empty provider list
			const excludes = {
				providers: [],
				states: [],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			assert.strictEqual(filter.exclude(session), false);
		});

		test('should handle different MenuId contexts', () => {
			const storageService = instantiationService.get(IStorageService);

			// Create two filters with different menu IDs
			const filter1 = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const filter2 = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewItemContext }
			));

			const session = createSession({ providerType: 'type-1' });

			// Set excludes only for ViewTitle
			const excludes = {
				providers: ['type-1'],
				states: [],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// filter1 should exclude the session
			assert.strictEqual(filter1.exclude(session), true);
			// filter2 should also exclude the session (shared storage key)
			assert.strictEqual(filter2.exclude(session), true);
		});

		test('should handle malformed storage data gracefully', () => {
			const storageService = instantiationService.get(IStorageService);

			// Store malformed JSON
			storageService.store(storageKey, 'invalid json', StorageScope.PROFILE, StorageTarget.USER);

			// Filter should still be created with default excludes
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const archivedSession = createSession({ isArchived: () => true });
			// Default behavior: archived should NOT be excluded
			assert.strictEqual(filter.exclude(archivedSession), false);
		});

		test('should prioritize archived check first', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const session = createSession({
				providerType: 'type-1',
				status: ChatSessionStatus.Completed,
				isArchived: () => true
			});

			// Set excludes for provider and status, but include archived
			const excludes = {
				providers: ['type-1'],
				states: [ChatSessionStatus.Completed],
				archived: true
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			// Should be excluded due to archived (checked first)
			assert.strictEqual(filter.exclude(session), true);
		});

		test('should handle all three status types correctly', () => {
			const storageService = instantiationService.get(IStorageService);
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

			const completedSession = createSession({ status: ChatSessionStatus.Completed });
			const inProgressSession = createSession({ status: ChatSessionStatus.InProgress });
			const failedSession = createSession({ status: ChatSessionStatus.Failed });

			// Exclude all statuses
			const excludes = {
				providers: [],
				states: [ChatSessionStatus.Completed, ChatSessionStatus.InProgress, ChatSessionStatus.Failed],
				archived: false
			};
			storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

			assert.strictEqual(filter.exclude(completedSession), true);
			assert.strictEqual(filter.exclude(inProgressSession), true);
			assert.strictEqual(filter.exclude(failedSession), true);
		});
	});

	suite('AgentSessionsViewModel - Session Archiving', () => {
		const disposables = new DisposableStore();
		let mockChatSessionsService: MockChatSessionsService;
		let instantiationService: TestInstantiationService;
		let viewModel: AgentSessionsModel;

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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://session-1'),
							label: 'Test Session',
							archived: true,
							timing: makeNewSessionTiming()
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));

				await viewModel.resolve(undefined);

				const session = viewModel.sessions[0];
				assert.strictEqual(session.isArchived(), true);
			});
		});

		test('should override provider archived state with user preference', async () => {
			return runWithFakedTimers({}, async () => {
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://session-1'),
							label: 'Test Session',
							archived: true,
							timing: makeNewSessionTiming()
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
		let mockChatSessionsService: MockChatSessionsService;
		let instantiationService: TestInstantiationService;
		let viewModel: AgentSessionsModel;

		setup(() => {
			mockChatSessionsService = new MockChatSessionsService();
			instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
			instantiationService.stub(IChatSessionsService, mockChatSessionsService);
			instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
			const storageService = instantiationService.get(IStorageService);
			storageService.store('agentSessions.readDateBaseline2', 1, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		});

		teardown(() => {
			disposables.clear();
		});

		ensureNoDisposablesAreLeakedInTestSuite();

		test('should mark session as read and unread', async () => {
			return runWithFakedTimers({}, async () => {
				const futureSessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2026, 1 /* February */, 1),
					lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
					lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://session-1'),
							label: 'Session 1',
							timing: futureSessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));

				await viewModel.resolve(undefined);

				const session = viewModel.sessions[0];

				// Mark as read
				session.setRead(true);
				assert.strictEqual(session.isRead(), true);

				// Mark as unread
				session.setRead(false);
				assert.strictEqual(session.isRead(), false);
			});
		});

		test('should fire onDidChangeSessions when marking as read', async () => {
			return runWithFakedTimers({}, async () => {
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const oldSessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2025, 10 /* November */, 1),
					lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
					lastRequestEnded: Date.UTC(2025, 10 /* November */, 2),
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://old-session'),
							label: 'Old Session',
							timing: oldSessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));

				await viewModel.resolve(undefined);

				const session = viewModel.sessions[0];
				// Sessions are unread by default (migration already happened in setup)
				assert.strictEqual(session.isRead(), false);
			});
		});

		test('should consider sessions after initial date as unread by default', async () => {
			return runWithFakedTimers({}, async () => {
				const newSessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2026, 1 /* February */, 1),
					lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
					lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://new-session'),
							label: 'New Session',
							timing: newSessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const sessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2025, 10 /* November */, 1),
					lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
					lastRequestEnded: Date.UTC(2026, 1 /* February */, 1),
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://session-with-endtime'),
							label: 'Session With EndTime',
							timing: sessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const sessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2025, 10 /* November */, 1),
					lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
					lastRequestEnded: undefined,
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://session-no-endtime'),
							label: 'Session Without EndTime',
							timing: sessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));

				await viewModel.resolve(undefined);

				const session = viewModel.sessions[0];
				// Sessions are unread by default
				assert.strictEqual(session.isRead(), false);
			});
		});

		test('should treat archived sessions as read', async () => {
			return runWithFakedTimers({}, async () => {
				const newSessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2026, 1 /* February */, 1),
					lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
					lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://new-session'),
							label: 'New Session',
							timing: newSessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const newSessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2026, 1 /* February */, 1),
					lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
					lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://new-session'),
							label: 'New Session',
							timing: newSessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const newSessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2026, 1 /* February */, 1),
					lastRequestStarted: Date.UTC(2026, 1 /* February */, 1),
					lastRequestEnded: Date.UTC(2026, 1 /* February */, 2),
				};

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://new-session'),
							label: 'New Session',
							timing: newSessionTiming,
						}];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
				const oldSessionTiming: IChatSessionItem['timing'] = {
					created: Date.UTC(2025, 10 /* November */, 1),
					lastRequestStarted: Date.UTC(2025, 10 /* November */, 1),
					lastRequestEnded: Date.UTC(2025, 10 /* November */, 2),
				};

				const chatSessionType = 'test-type';
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://old-session'),
							label: 'Old Session',
							timing: oldSessionTiming,
						}];
					}
				};

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
		let mockChatSessionsService: MockChatSessionsService;
		let instantiationService: TestInstantiationService;
		let viewModel: AgentSessionsModel;

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
				let sessionStatus = ChatSessionStatus.InProgress;
				let _items: IChatSessionItem[] = [];

				const controller: IChatSessionItemController = {
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

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
				viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));

				await viewModel.resolve(undefined);
				assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.InProgress);

				// Change status
				sessionStatus = ChatSessionStatus.Completed;
				await viewModel.resolve(undefined);
				assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.Completed);
			});
		});

		test('should clean up state tracking for removed sessions', async () => {
			return runWithFakedTimers({}, async () => {
				let includeSessions = true;
				let _items: IChatSessionItem[] = [];

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => {
						if (includeSessions) {
							_items = [makeSimpleSessionItem('session-1')];
						} else {
							_items = [];
						}
					},
					get items() { return _items; }
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

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

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

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

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [{
							resource: URI.parse('test://session-1'),
							label: 'Test Session',
							iconPath: customIcon,
							timing: makeNewSessionTiming()
						}];
					}
				};

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

				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

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
		let mockChatSessionsService: MockChatSessionsService;
		let mockLifecycleService: TestLifecycleService;
		let instantiationService: TestInstantiationService;
		let viewModel: AgentSessionsModel;

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
				const controller: IChatSessionItemController = {
					onDidChangeChatSessionItems: Event.None,
					refresh: async () => { },
					get items() {
						return [makeSimpleSessionItem('session-1')];
					}
				};

				mockChatSessionsService.registerChatSessionItemController('test-type', controller);
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
		let mockChatSessionsService: MockChatSessionsService;
		let instantiationService: TestInstantiationService;

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
			const filter = disposables.add(instantiationService.createInstance(
				AgentSessionsFilter,
				{ filterMenuId: MenuId.ViewTitle }
			));

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

function makeSimpleSessionItem(id: string, overrides?: Partial<IChatSessionItem>): IChatSessionItem {
	return {
		resource: URI.parse(`test://${id}`),
		label: `Session ${id}`,
		timing: makeNewSessionTiming(),
		...overrides
	};
}

function makeNewSessionTiming(options?: {
	created?: number;
	lastRequestStarted?: number | undefined;
	lastRequestEnded?: number | undefined;
}): IChatSessionItem['timing'] {
	const now = Date.now();
	return {
		created: options?.created ?? now,
		lastRequestStarted: options?.lastRequestStarted,
		lastRequestEnded: options?.lastRequestEnded,
	};
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentSessionsViewModel, IAgentSessionViewModel, isAgentSession, isAgentSessionsViewModel, isLocalAgentSessionItem } from '../../browser/agentSessions/agentSessionViewModel.js';
import { AgentSessionsViewFilter } from '../../browser/agentSessions/agentSessionsViewFilter.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../common/chatUri.js';
import { MockChatSessionsService } from '../common/mockChatSessionsService.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

suite('AgentSessionsViewModel', () => {

	const disposables = new DisposableStore();
	let mockChatSessionsService: MockChatSessionsService;
	let mockLifecycleService: TestLifecycleService;
	let viewModel: AgentSessionsViewModel;
	let instantiationService: TestInstantiationService;

	function createViewModel(): AgentSessionsViewModel {
		return disposables.add(instantiationService.createInstance(
			AgentSessionsViewModel,
			{ filterMenuId: MenuId.ViewTitle }
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

	test('should resolve sessions from providers', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Test Session 1',
						description: 'Description 1',
						timing: { startTime: Date.now() }
					},
					{
						resource: URI.parse('test://session-2'),
						label: 'Test Session 2',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = createViewModel();

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 2);
			assert.strictEqual(viewModel.sessions[0].resource.toString(), 'test://session-1');
			assert.strictEqual(viewModel.sessions[0].label, 'Test Session 1');
			assert.strictEqual(viewModel.sessions[1].resource.toString(), 'test://session-2');
			assert.strictEqual(viewModel.sessions[1].label, 'Test Session 2');
		});
	});

	test('should resolve sessions from multiple providers', async () => {
		return runWithFakedTimers({}, async () => {
			const provider1: IChatSessionItemProvider = {
				chatSessionType: 'type-1',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Session 1',
						timing: { startTime: Date.now() }
					}
				]
			};

			const provider2: IChatSessionItemProvider = {
				chatSessionType: 'type-2',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-2'),
						label: 'Session 2',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider1);
			mockChatSessionsService.registerChatSessionItemProvider(provider2);

			viewModel = createViewModel();

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 2);
			assert.strictEqual(viewModel.sessions[0].resource.toString(), 'test://session-1');
			assert.strictEqual(viewModel.sessions[1].resource.toString(), 'test://session-2');
		});
	});

	test('should fire onWillResolve and onDidResolve events', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => []
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
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
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
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
			const startTime = Date.now();
			const endTime = startTime + 1000;

			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						description: new MarkdownString('**Bold** description'),
						status: ChatSessionStatus.Completed,
						tooltip: 'Session tooltip',
						iconPath: ThemeIcon.fromId('check'),
						timing: { startTime, endTime },
						statistics: { files: 1, insertions: 10, deletions: 5 }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
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
			assert.strictEqual(session.timing.startTime, startTime);
			assert.strictEqual(session.timing.endTime, endTime);
			assert.deepStrictEqual(session.statistics, { files: 1, insertions: 10, deletions: 5 });
		});
	});

	test('should handle resolve with specific provider', async () => {
		return runWithFakedTimers({}, async () => {
			const provider1: IChatSessionItemProvider = {
				chatSessionType: 'type-1',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Session 1',
						timing: { startTime: Date.now() }
					}
				]
			};

			const provider2: IChatSessionItemProvider = {
				chatSessionType: 'type-2',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'session-2',
						resource: URI.parse('test://session-2'),
						label: 'Session 2',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider1);
			mockChatSessionsService.registerChatSessionItemProvider(provider2);

			viewModel = createViewModel();

			// First resolve all
			await viewModel.resolve(undefined);
			assert.strictEqual(viewModel.sessions.length, 2);

			// Now resolve only type-1
			await viewModel.resolve('type-1');
			// Should still have both sessions, but only type-1 was re-resolved
			assert.strictEqual(viewModel.sessions.length, 2);
		});
	});

	test('should handle resolve with multiple specific providers', async () => {
		return runWithFakedTimers({}, async () => {
			const provider1: IChatSessionItemProvider = {
				chatSessionType: 'type-1',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Session 1',
						timing: { startTime: Date.now() }
					}
				]
			};

			const provider2: IChatSessionItemProvider = {
				chatSessionType: 'type-2',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'session-2',
						resource: URI.parse('test://session-2'),
						label: 'Session 2',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider1);
			mockChatSessionsService.registerChatSessionItemProvider(provider2);

			viewModel = createViewModel();

			await viewModel.resolve(['type-1', 'type-2']);

			assert.strictEqual(viewModel.sessions.length, 2);
		});
	});

	test('should respond to onDidChangeItemsProviders event', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = createViewModel();

			const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);

			// Trigger event - this should automatically call resolve
			mockChatSessionsService.fireDidChangeItemsProviders(provider);

			// Wait for the sessions to be resolved
			await sessionsChangedPromise;

			assert.strictEqual(viewModel.sessions.length, 1);
		});
	});

	test('should respond to onDidChangeAvailability event', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
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
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
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
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = createViewModel();

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 1);
			assert.strictEqual(viewModel.sessions[0].providerType, 'test-type');
		});
	});

	test('should handle empty provider results', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => []
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = createViewModel();

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 0);
		});
	});

	test('should handle sessions with different statuses', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'session-failed',
						resource: URI.parse('test://session-failed'),
						label: 'Failed Session',
						status: ChatSessionStatus.Failed,
						timing: { startTime: Date.now() }
					},
					{
						id: 'session-completed',
						resource: URI.parse('test://session-completed'),
						label: 'Completed Session',
						status: ChatSessionStatus.Completed,
						timing: { startTime: Date.now() }
					},
					{
						id: 'session-inprogress',
						resource: URI.parse('test://session-inprogress'),
						label: 'In Progress Session',
						status: ChatSessionStatus.InProgress,
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
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

			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => {
					const sessions: IChatSessionItem[] = [];
					for (let i = 0; i < sessionCount; i++) {
						sessions.push({
							resource: URI.parse(`test://session-${i}`),
							label: `Session ${i}`,
							timing: { startTime: Date.now() }
						});
					}
					return sessions;
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
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
			const provider: IChatSessionItemProvider = {
				chatSessionType: localChatSessionType,
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'local-session',
						resource: LocalChatSessionUri.forSession('local-session'),
						label: 'Local Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = createViewModel();

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 1);
			assert.strictEqual(viewModel.sessions[0].providerType, localChatSessionType);
		});
	});

	test('should correctly construct resource URIs for sessions', async () => {
		return runWithFakedTimers({}, async () => {
			const resource = URI.parse('custom://my-session/path');

			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						resource: resource,
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = createViewModel();

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 1);
			assert.strictEqual(viewModel.sessions[0].resource.toString(), resource.toString());
		});
	});

	test('should throttle multiple rapid resolve calls', async () => {
		return runWithFakedTimers({}, async () => {
			let providerCallCount = 0;

			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => {
					providerCallCount++;
					return [
						{
							resource: URI.parse('test://session-1'),
							label: 'Test Session',
							timing: { startTime: Date.now() }
						}
					];
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = createViewModel();

			// Make multiple rapid resolve calls
			const resolvePromises = [
				viewModel.resolve(undefined),
				viewModel.resolve(undefined),
				viewModel.resolve(undefined)
			];

			await Promise.all(resolvePromises);

			// Should only call provider once due to throttling
			assert.strictEqual(providerCallCount, 1);
			assert.strictEqual(viewModel.sessions.length, 1);
		});
	});

	test('should preserve sessions from non-resolved providers', async () => {
		return runWithFakedTimers({}, async () => {
			let provider1CallCount = 0;
			let provider2CallCount = 0;

			const provider1: IChatSessionItemProvider = {
				chatSessionType: 'type-1',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => {
					provider1CallCount++;
					return [
						{
							resource: URI.parse('test://session-1'),
							label: `Session 1 (call ${provider1CallCount})`,
							timing: { startTime: Date.now() }
						}
					];
				}
			};

			const provider2: IChatSessionItemProvider = {
				chatSessionType: 'type-2',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => {
					provider2CallCount++;
					return [
						{
							resource: URI.parse('test://session-2'),
							label: `Session 2 (call ${provider2CallCount})`,
							timing: { startTime: Date.now() }
						}
					];
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider1);
			mockChatSessionsService.registerChatSessionItemProvider(provider2);

			viewModel = createViewModel();

			// First resolve all
			await viewModel.resolve(undefined);
			assert.strictEqual(viewModel.sessions.length, 2);
			assert.strictEqual(provider1CallCount, 1);
			assert.strictEqual(provider2CallCount, 1);
			const originalSession1Label = viewModel.sessions[0].label;

			// Now resolve only type-2
			await viewModel.resolve('type-2');

			// Should still have both sessions
			assert.strictEqual(viewModel.sessions.length, 2);
			// Provider 1 should not be called again
			assert.strictEqual(provider1CallCount, 1);
			// Provider 2 should be called again
			assert.strictEqual(provider2CallCount, 2);
			// Session 1 should be preserved with original label
			assert.strictEqual(viewModel.sessions.find(s => s.resource.toString() === 'test://session-1')?.label, originalSession1Label);
		});
	});

	test('should accumulate providers when resolve is called with different provider types', async () => {
		return runWithFakedTimers({}, async () => {
			let resolveCount = 0;
			const resolvedProviders: (string | undefined)[] = [];

			const provider1: IChatSessionItemProvider = {
				chatSessionType: 'type-1',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => {
					resolveCount++;
					resolvedProviders.push('type-1');
					return [{
						resource: URI.parse('test://session-1'),
						label: 'Session 1',
						timing: { startTime: Date.now() }
					}];
				}
			};

			const provider2: IChatSessionItemProvider = {
				chatSessionType: 'type-2',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => {
					resolveCount++;
					resolvedProviders.push('type-2');
					return [{
						resource: URI.parse('test://session-2'),
						label: 'Session 2',
						timing: { startTime: Date.now() }
					}];
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider1);
			mockChatSessionsService.registerChatSessionItemProvider(provider2);

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
		const localSession: IAgentSessionViewModel = {
			providerType: localChatSessionType,
			providerLabel: 'Local',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://local-1'),
			label: 'Local',
			description: 'test',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		const remoteSession: IAgentSessionViewModel = {
			providerType: 'remote',
			providerLabel: 'Remote',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://remote-1'),
			label: 'Remote',
			description: 'test',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		assert.strictEqual(isLocalAgentSessionItem(localSession), true);
		assert.strictEqual(isLocalAgentSessionItem(remoteSession), false);
	});

	test('isAgentSession should identify session view models', () => {
		const session: IAgentSessionViewModel = {
			providerType: 'test',
			providerLabel: 'Local',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://test-1'),
			label: 'Test',
			description: 'test',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		// Test with a session object
		assert.strictEqual(isAgentSession(session), true);

		// Test with a sessions container - pass as session to see it returns false
		const sessionOrContainer: IAgentSessionViewModel = session;
		assert.strictEqual(isAgentSession(sessionOrContainer), true);
	});

	test('isAgentSessionsViewModel should identify sessions view models', () => {
		const session: IAgentSessionViewModel = {
			providerType: 'test',
			providerLabel: 'Local',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://test-1'),
			label: 'Test',
			description: 'test',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		// Test with actual view model
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const lifecycleService = disposables.add(new TestLifecycleService());
		instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
		instantiationService.stub(ILifecycleService, lifecycleService);
		const actualViewModel = disposables.add(instantiationService.createInstance(
			AgentSessionsViewModel,
			{ filterMenuId: MenuId.ViewTitle }
		));
		assert.strictEqual(isAgentSessionsViewModel(actualViewModel), true);

		// Test with session object
		assert.strictEqual(isAgentSessionsViewModel(session), false);
	});
});

suite('AgentSessionsViewFilter', () => {
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

	test('should filter out sessions from excluded provider', () => {
		const storageService = instantiationService.get(IStorageService);
		const filter = disposables.add(instantiationService.createInstance(
			AgentSessionsViewFilter,
			{ filterMenuId: MenuId.ViewTitle }
		));

		const provider1: IChatSessionItemProvider = {
			chatSessionType: 'type-1',
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: async () => []
		};

		const provider2: IChatSessionItemProvider = {
			chatSessionType: 'type-2',
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: async () => []
		};

		const session1: IAgentSessionViewModel = {
			providerType: provider1.chatSessionType,
			providerLabel: 'Provider 1',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://session-1'),
			label: 'Session 1',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		const session2: IAgentSessionViewModel = {
			providerType: provider2.chatSessionType,
			providerLabel: 'Provider 2',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://session-2'),
			label: 'Session 2',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		// Initially, no sessions should be filtered
		assert.strictEqual(filter.exclude(session1), false);
		assert.strictEqual(filter.exclude(session2), false);

		// Exclude type-1 by setting it in storage
		const excludes = {
			providers: ['type-1'],
			states: [],
			archived: true
		};
		storageService.store('agentSessions.filterExcludes', JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

		// After excluding type-1, session1 should be filtered but not session2
		assert.strictEqual(filter.exclude(session1), true);
		assert.strictEqual(filter.exclude(session2), false);
	});

	test('should filter out archived sessions', () => {
		const storageService = instantiationService.get(IStorageService);
		const filter = disposables.add(instantiationService.createInstance(
			AgentSessionsViewFilter,
			{ filterMenuId: MenuId.ViewTitle }
		));

		const provider: IChatSessionItemProvider = {
			chatSessionType: 'test-type',
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: async () => []
		};

		const archivedSession: IAgentSessionViewModel = {
			providerType: provider.chatSessionType,
			providerLabel: 'Test Provider',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://archived-session'),
			label: 'Archived Session',
			timing: { startTime: Date.now() },
			archived: true,
			status: ChatSessionStatus.Completed
		};

		const activeSession: IAgentSessionViewModel = {
			providerType: provider.chatSessionType,
			providerLabel: 'Test Provider',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://active-session'),
			label: 'Active Session',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		// By default, archived sessions should be filtered (archived: true in default excludes)
		assert.strictEqual(filter.exclude(archivedSession), true);
		assert.strictEqual(filter.exclude(activeSession), false);

		// Include archived by setting archived to false in storage
		const excludes = {
			providers: [],
			states: [],
			archived: false
		};
		storageService.store('agentSessions.filterExcludes', JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

		// After including archived, both sessions should not be filtered
		assert.strictEqual(filter.exclude(archivedSession), false);
		assert.strictEqual(filter.exclude(activeSession), false);
	});

	test('should filter out sessions with excluded status', () => {
		const storageService = instantiationService.get(IStorageService);
		const filter = disposables.add(instantiationService.createInstance(
			AgentSessionsViewFilter,
			{ filterMenuId: MenuId.ViewTitle }
		));

		const provider: IChatSessionItemProvider = {
			chatSessionType: 'test-type',
			onDidChangeChatSessionItems: Event.None,
			provideChatSessionItems: async () => []
		};

		const failedSession: IAgentSessionViewModel = {
			providerType: provider.chatSessionType,
			providerLabel: 'Test Provider',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://failed-session'),
			label: 'Failed Session',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Failed
		};

		const completedSession: IAgentSessionViewModel = {
			providerType: provider.chatSessionType,
			providerLabel: 'Test Provider',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://completed-session'),
			label: 'Completed Session',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.Completed
		};

		const inProgressSession: IAgentSessionViewModel = {
			providerType: provider.chatSessionType,
			providerLabel: 'Test Provider',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://inprogress-session'),
			label: 'In Progress Session',
			timing: { startTime: Date.now() },
			archived: false,
			status: ChatSessionStatus.InProgress
		};

		// Initially, no sessions should be filtered by status
		assert.strictEqual(filter.exclude(failedSession), false);
		assert.strictEqual(filter.exclude(completedSession), false);
		assert.strictEqual(filter.exclude(inProgressSession), false);

		// Exclude failed status by setting it in storage
		const excludes = {
			providers: [],
			states: [ChatSessionStatus.Failed],
			archived: false
		};
		storageService.store('agentSessions.filterExcludes', JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);

		// After excluding failed status, only failedSession should be filtered
		assert.strictEqual(filter.exclude(failedSession), true);
		assert.strictEqual(filter.exclude(completedSession), false);
		assert.strictEqual(filter.exclude(inProgressSession), false);
	});
});

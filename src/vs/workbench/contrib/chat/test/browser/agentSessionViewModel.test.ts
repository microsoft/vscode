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
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, localChatSessionType } from '../../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../common/chatUri.js';
import { MockChatSessionsService } from '../common/mockChatSessionsService.js';
import { TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { Codicon } from '../../../../../base/common/codicons.js';

suite('AgentSessionsViewModel', () => {

	const disposables = new DisposableStore();
	let mockChatSessionsService: MockChatSessionsService;
	let mockLifecycleService: TestLifecycleService;
	let viewModel: AgentSessionsViewModel;

	setup(() => {
		mockChatSessionsService = new MockChatSessionsService();
		mockLifecycleService = disposables.add(new TestLifecycleService());
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should initialize with empty sessions', () => {
		viewModel = disposables.add(new AgentSessionsViewModel(
			mockChatSessionsService,
			mockLifecycleService
		));

		assert.strictEqual(viewModel.sessions.length, 0);
	});

	test('should resolve sessions from providers', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session 1',
						description: 'Description 1',
						timing: { startTime: Date.now() }
					},
					{
						id: 'session-2',
						resource: URI.parse('test://session-2'),
						label: 'Test Session 2',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
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

			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						description: new MarkdownString('**Bold** description'),
						status: ChatSessionStatus.Completed,
						tooltip: 'Session tooltip',
						iconPath: ThemeIcon.fromId('check'),
						timing: { startTime, endTime },
						statistics: { insertions: 10, deletions: 5 }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
			assert.deepStrictEqual(session.statistics, { insertions: 10, deletions: 5 });
		});
	});

	test('should add default description for sessions without description', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 1);
			assert.ok(typeof viewModel.sessions[0].description === 'string');
		});
	});

	test('should filter out special session IDs', async () => {
		return runWithFakedTimers({}, async () => {
			const provider: IChatSessionItemProvider = {
				chatSessionType: 'test-type',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'show-history',
						resource: URI.parse('test://show-history'),
						label: 'Show History',
						timing: { startTime: Date.now() }
					},
					{
						id: 'workbench.panel.chat.view.copilot',
						resource: URI.parse('test://copilot'),
						label: 'Copilot',
						timing: { startTime: Date.now() }
					},
					{
						id: 'valid-session',
						resource: URI.parse('test://valid'),
						label: 'Valid Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 1);
			assert.strictEqual(viewModel.sessions[0].resource.toString(), 'test://valid');
		});
	});

	test('should handle resolve with specific provider', async () => {
		return runWithFakedTimers({}, async () => {
			const provider1: IChatSessionItemProvider = {
				chatSessionType: 'type-1',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => [
					{
						id: 'session-1',
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

			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
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

			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
						resource: URI.parse('test://session-1'),
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 1);
			assert.strictEqual(viewModel.sessions[0].provider, provider);
			assert.strictEqual(viewModel.sessions[0].provider.chatSessionType, 'test-type');
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
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
							id: `session-${i}`,
							resource: URI.parse(`test://session-${i}`),
							label: `Session ${i}`,
							timing: { startTime: Date.now() }
						});
					}
					return sessions;
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

			await viewModel.resolve(undefined);

			assert.strictEqual(viewModel.sessions.length, 1);
			assert.strictEqual(viewModel.sessions[0].provider.chatSessionType, localChatSessionType);
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
						id: 'session-1',
						resource: resource,
						label: 'Test Session',
						timing: { startTime: Date.now() }
					}
				]
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
							id: 'session-1',
							resource: URI.parse('test://session-1'),
							label: 'Test Session',
							timing: { startTime: Date.now() }
						}
					];
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider);
			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
							id: 'session-1',
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
							id: 'session-2',
							resource: URI.parse('test://session-2'),
							label: `Session 2 (call ${provider2CallCount})`,
							timing: { startTime: Date.now() }
						}
					];
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider1);
			mockChatSessionsService.registerChatSessionItemProvider(provider2);

			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
						id: 'session-1',
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
						id: 'session-2',
						resource: URI.parse('test://session-2'),
						label: 'Session 2',
						timing: { startTime: Date.now() }
					}];
				}
			};

			mockChatSessionsService.registerChatSessionItemProvider(provider1);
			mockChatSessionsService.registerChatSessionItemProvider(provider2);

			viewModel = disposables.add(new AgentSessionsViewModel(
				mockChatSessionsService,
				mockLifecycleService
			));

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
			provider: {
				chatSessionType: localChatSessionType,
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => []
			},
			providerLabel: 'Local',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://local-1'),
			label: 'Local',
			description: 'test',
			timing: { startTime: Date.now() }
		};

		const remoteSession: IAgentSessionViewModel = {
			provider: {
				chatSessionType: 'remote',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => []
			},
			providerLabel: 'Local',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://remote-1'),
			label: 'Remote',
			description: 'test',
			timing: { startTime: Date.now() }
		};

		assert.strictEqual(isLocalAgentSessionItem(localSession), true);
		assert.strictEqual(isLocalAgentSessionItem(remoteSession), false);
	});

	test('isAgentSession should identify session view models', () => {
		const session: IAgentSessionViewModel = {
			provider: {
				chatSessionType: 'test',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => []
			},
			providerLabel: 'Local',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://test-1'),
			label: 'Test',
			description: 'test',
			timing: { startTime: Date.now() }
		};

		// Test with a session object
		assert.strictEqual(isAgentSession(session), true);

		// Test with a sessions container - pass as session to see it returns false
		const sessionOrContainer: IAgentSessionViewModel = session;
		assert.strictEqual(isAgentSession(sessionOrContainer), true);
	});

	test('isAgentSessionsViewModel should identify sessions view models', () => {
		const session: IAgentSessionViewModel = {
			provider: {
				chatSessionType: 'test',
				onDidChangeChatSessionItems: Event.None,
				provideChatSessionItems: async () => []
			},
			providerLabel: 'Local',
			icon: Codicon.chatSparkle,
			resource: URI.parse('test://test-1'),
			label: 'Test',
			description: 'test',
			timing: { startTime: Date.now() }
		};

		// Test with actual view model
		const actualViewModel = new AgentSessionsViewModel(new MockChatSessionsService(), disposables.add(new TestLifecycleService()));
		disposables.add(actualViewModel);
		assert.strictEqual(isAgentSessionsViewModel(actualViewModel), true);

		// Test with session object
		assert.strictEqual(isAgentSessionsViewModel(session), false);
	});
});

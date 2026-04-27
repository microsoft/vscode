/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LocalAgentsSessionsController } from '../../../browser/agentSessions/localAgentSessionsController.js';
import { IChatService, ResponseModelState } from '../../../common/chatService/chatService.js';
import { chatModelToChatDetail } from '../../../common/chatService/chatServiceImpl.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatEditingSessionState, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IChatChangedRequestEvent, IChatChangeEvent, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';

function createTestTiming(options?: {
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

interface MockChatModel extends IChatModel {
	setCustomTitle(title: string): void;
	setRequestInProgress(inProgress: boolean): void;
}

function createMockChatModel(options: {
	sessionResource: URI;
	hasRequests?: boolean;
	requestInProgress?: boolean;
	timestamp?: number;
	lastResponseComplete?: boolean;
	lastResponseCanceled?: boolean;
	lastResponseHasError?: boolean;
	lastResponseTimestamp?: number;
	lastResponseCompletedAt?: number;
	customTitle?: string;
	editingSession?: {
		entries: Array<{
			state: ModifiedFileEntryState;
			linesAdded: number;
			linesRemoved: number;
			modifiedURI: URI;
		}>;
	};
}): MockChatModel {
	const requests: IChatRequestModel[] = [];

	if (options.hasRequests !== false) {
		const mockResponse: Partial<IChatResponseModel> = {
			isComplete: options.lastResponseComplete ?? true,
			isCanceled: options.lastResponseCanceled ?? false,
			result: options.lastResponseHasError ? { errorDetails: { message: 'error' } } : undefined,
			timestamp: options.lastResponseTimestamp ?? Date.now(),
			completedAt: options.lastResponseCompletedAt,
			response: {
				value: [],
				getMarkdown: () => '',
				getFinalResponse: () => '',
				toString: () => options.customTitle ? '' : 'Test response content'
			}
		};

		requests.push({
			id: 'request-1',
			response: mockResponse as IChatResponseModel
		} as IChatRequestModel);
	}

	const editingSessionEntries = options.editingSession?.entries.map(entry => ({
		state: observableValue('state', entry.state),
		linesAdded: observableValue('linesAdded', entry.linesAdded),
		linesRemoved: observableValue('linesRemoved', entry.linesRemoved),
		originalURI: entry.modifiedURI,
		modifiedURI: entry.modifiedURI,
	}));

	const mockEditingSession = options.editingSession ? {
		entries: observableValue('entries', editingSessionEntries ?? []),
		state: observableValue('state', ChatEditingSessionState.Idle)
	} : undefined;

	const _onDidChange = new Emitter<IChatChangeEvent>();

	let title = options.customTitle ?? 'Test Chat Title';
	const requestInProgress = observableValue('requestInProgress', options.requestInProgress ?? false);
	return {
		get title() {
			return title;
		},
		sessionResource: options.sessionResource,
		hasRequests: options.hasRequests !== false,
		timestamp: options.timestamp ?? Date.now(),
		timing: createTestTiming({ created: options.timestamp }),
		requestInProgress,
		getRequests: () => requests,
		onDidChange: _onDidChange.event,
		editingSession: mockEditingSession as IChatModel['editingSession'],
		lastRequestObs: observableValue('lastRequest', undefined),

		// Mock helpers
		setCustomTitle: (newTitle: string) => {
			title = newTitle;
			_onDidChange.fire({ kind: 'setCustomTitle', title });
		},
		setRequestInProgress: (inProgress: boolean) => {
			if (requestInProgress.get() === inProgress) {
				return;
			}
			requestInProgress.set(inProgress, undefined);
			_onDidChange.fire({ kind: 'changedRequest' } as IChatChangedRequestEvent);
		},
	} as Partial<IChatModel> as MockChatModel;
}

suite('LocalAgentsSessionsController', () => {
	const disposables = new DisposableStore();
	let mockChatService: MockChatService;
	let mockChatSessionsService: MockChatSessionsService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		mockChatService = new MockChatService();
		mockChatSessionsService = new MockChatSessionsService();
		instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		instantiationService.stub(IChatService, mockChatService);
		instantiationService.stub(IChatSessionsService, mockChatSessionsService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createController(): LocalAgentsSessionsController {
		return disposables.add(instantiationService.createInstance(LocalAgentsSessionsController));
	}

	test('should have correct session type', () => {
		const controller = createController();
		assert.strictEqual(controller.chatSessionType, localChatSessionType);
	});

	test('should register itself with chat sessions service', async () => {
		const controller = createController();

		const controllerResults: { readonly chatSessionType: string; readonly items: readonly IChatSessionItem[] }[] = [];
		for await (const result of mockChatSessionsService.getChatSessionItems(undefined, CancellationToken.None)) {
			controllerResults.push(result);
		}
		assert.strictEqual(controllerResults.length, 1);
		assert.strictEqual(controllerResults[0].chatSessionType, controller.chatSessionType);
	});

	test('should provide empty sessions when no live or history sessions', async () => {
		return runWithFakedTimers({}, async () => {
			const controller = createController();

			mockChatService.setLiveSessionItems([]);
			mockChatService.setHistorySessionItems([]);

			await controller.refresh(CancellationToken.None);
			const sessions = controller.items;
			assert.strictEqual(sessions.length, 0);
		});
	});

	test('should provide live session items', async () => {
		return runWithFakedTimers({}, async () => {
			const controller = createController();

			const sessionResource = LocalChatSessionUri.forSession('test-session');
			const mockModel = createMockChatModel({
				sessionResource,
				hasRequests: true,
				timestamp: Date.now()
			});

			mockChatService.addSession(mockModel);
			mockChatService.setLiveSessionItems([{
				sessionResource,
				title: 'Test Session',
				lastMessageDate: Date.now(),
				isActive: true,
				timing: createTestTiming(),
				lastResponseState: ResponseModelState.Complete
			}]);

			await controller.refresh(CancellationToken.None);
			const sessions = controller.items;
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].label, 'Test Session');
			assert.strictEqual(sessions[0].resource.toString(), sessionResource.toString());
		});
	});

	test('should provide history session items', async () => {
		return runWithFakedTimers({}, async () => {
			const controller = createController();

			const sessionResource = LocalChatSessionUri.forSession('history-session');

			mockChatService.setLiveSessionItems([]);
			mockChatService.setHistorySessionItems([{
				sessionResource,
				title: 'History Session',
				lastMessageDate: Date.now() - 10000,
				isActive: false,
				lastResponseState: ResponseModelState.Complete,
				timing: createTestTiming()
			}]);

			await controller.refresh(CancellationToken.None);
			const sessions = controller.items;
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].label, 'History Session');
		});
	});

	test('should not duplicate sessions in history and live', async () => {
		return runWithFakedTimers({}, async () => {
			const controller = createController();

			const sessionResource = LocalChatSessionUri.forSession('duplicate-session');
			const mockModel = createMockChatModel({
				sessionResource,
				hasRequests: true
			});

			mockChatService.addSession(mockModel);
			mockChatService.setLiveSessionItems([{
				sessionResource,
				title: 'Live Session',
				lastMessageDate: Date.now(),
				isActive: true,
				lastResponseState: ResponseModelState.Complete,
				timing: createTestTiming()
			}]);
			mockChatService.setHistorySessionItems([{
				sessionResource,
				title: 'History Session',
				lastMessageDate: Date.now() - 10000,
				isActive: false,
				lastResponseState: ResponseModelState.Complete,
				timing: createTestTiming()
			}]);

			await controller.refresh(CancellationToken.None);
			const sessions = controller.items;
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].label, 'Live Session');
		});
	});

	suite('Session Status', () => {
		test('should return InProgress status when request in progress', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('in-progress-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: true
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'In Progress Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming()
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.InProgress);
			});
		});

		test('should return Completed status when last response is complete', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('completed-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false,
					lastResponseComplete: true,
					lastResponseCanceled: false,
					lastResponseHasError: false
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Completed Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming(),
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.Completed);
			});
		});

		test('should return Success status when last response was canceled', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('canceled-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false,
					lastResponseComplete: false,
					lastResponseCanceled: true
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Canceled Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming(),
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.Completed);
			});
		});

		test('should return Failed status when last response has error', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('error-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false,
					lastResponseComplete: true,
					lastResponseHasError: true
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Error Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming(),
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.Failed);
			});
		});
	});

	suite('Session Statistics', () => {
		test('should return statistics for sessions with modified entries', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('stats-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					editingSession: {
						entries: [
							{
								state: ModifiedFileEntryState.Modified,
								linesAdded: 10,
								linesRemoved: 5,
								modifiedURI: URI.file('/test/file1.ts')
							},
							{
								state: ModifiedFileEntryState.Modified,
								linesAdded: 20,
								linesRemoved: 3,
								modifiedURI: URI.file('/test/file2.ts')
							}
						]
					}
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Stats Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming(),
					stats: {
						added: 30,
						removed: 8,
						fileCount: 2
					}
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.ok(sessions[0].changes);
				const changes = sessions[0].changes as { files: number; insertions: number; deletions: number };
				assert.strictEqual(changes.files, 2);
				assert.strictEqual(changes.insertions, 30);
				assert.strictEqual(changes.deletions, 8);
			});
		});

		test('should not return statistics for sessions without modified entries', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('no-stats-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					editingSession: {
						entries: [
							{
								state: ModifiedFileEntryState.Accepted,
								linesAdded: 10,
								linesRemoved: 5,
								modifiedURI: URI.file('/test/file1.ts')
							}
						]
					}
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'No Stats Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming()
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].changes, undefined);
			});
		});
	});

	suite('Session Timing', () => {
		test('should use model timestamp for created when model exists', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('timing-session');
				const modelTimestamp = Date.now() - 5000;
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					timestamp: modelTimestamp
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Timing Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming({ created: modelTimestamp })
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].timing.created, modelTimestamp);
			});
		});

		test('should use lastMessageDate for created when model does not exist', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('history-timing');
				const lastMessageDate = Date.now() - 10000;

				mockChatService.setLiveSessionItems([]);
				mockChatService.setHistorySessionItems([{
					sessionResource,
					title: 'History Timing Session',
					lastMessageDate,
					isActive: false,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming({ created: lastMessageDate })
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].timing.created, lastMessageDate);
			});
		});

		test('should set lastRequestEnded from last response completedAt', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('endtime-session');
				const completedAt = Date.now() - 1000;
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					lastResponseComplete: true,
					lastResponseCompletedAt: completedAt
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'EndTime Session',
					lastMessageDate: Date.now(),
					isActive: true,
					lastResponseState: ResponseModelState.Complete,
					timing: createTestTiming({ lastRequestEnded: completedAt })
				}]);

				await controller.refresh(CancellationToken.None);
				const sessions = controller.items;
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].timing.lastRequestEnded, completedAt);
			});
		});
	});

	suite('Events', () => {
		test('should fire onDidChangeChatSessionItems when model progress changes', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('progress-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: true
				});

				// Add the session first
				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Test Session',
					lastMessageDate: Date.now(),
					isActive: true,
					timing: createTestTiming(),
					lastResponseState: ResponseModelState.Complete
				}]);

				let changeEventCount = 0;
				disposables.add(controller.onDidChangeChatSessionItems(() => {
					changeEventCount++;
				}));

				await controller.refresh(CancellationToken.None);

				const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);

				// Simulate progress change by triggering the progress listener
				mockModel.setRequestInProgress(true);
				await onDidChangeChatSessionItems;

				assert.strictEqual(changeEventCount, 2);
			});
		});

		test('should fire onDidChangeChatSessionItems when model request status changes', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = disposables.add(createController());

				const sessionResource = LocalChatSessionUri.forSession('status-change-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false
				});

				// Add the session first
				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);

				let changeEventCount = 0;
				disposables.add(controller.onDidChangeChatSessionItems(() => {
					changeEventCount++;
				}));
				await controller.refresh(CancellationToken.None);
				assert.strictEqual(changeEventCount, 0);

				const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);

				mockModel.setRequestInProgress(true);

				await onDidChangeChatSessionItems;
				assert.strictEqual(changeEventCount, 1);
			});
		});

		test('should clean up model listeners when model is removed via chatModels observable', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('cleanup-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true
				});

				// Add the session first
				mockChatService.addSession(mockModel);

				// Now remove the session - the observable should trigger cleanup
				mockChatService.removeSession(sessionResource);

				// Verify the listener was cleaned up by triggering a title change
				// The onDidChangeChatSessionItems from registerModelListeners cleanup should fire once
				// but after that, title changes should NOT fire onDidChangeChatSessionItems
				let changeEventCount = 0;
				disposables.add(controller.onDidChangeChatSessionItems(() => {
					changeEventCount++;
				}));

				mockModel.setCustomTitle('New Title');

				assert.strictEqual(changeEventCount, 0, 'onDidChangeChatSessionItems should NOT fire after model is removed');
			});
		});
	});
});

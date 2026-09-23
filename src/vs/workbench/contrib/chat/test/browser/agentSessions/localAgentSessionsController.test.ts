/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { nullDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LocalAgentsSessionsController } from '../../../browser/agentSessions/localAgentSessionsController.js';
import { IChatDetail, IChatService, ResponseModelState } from '../../../common/chatService/chatService.js';
import { chatModelToChatDetail } from '../../../common/chatService/chatServiceImpl.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemsDelta, IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatEditingSessionState, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ChatRequestRemovalReason, IChatChangedRequestEvent, IChatChangeEvent, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../common/model/chatModel.js';
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
	addFirstRequest(): void;
	removeRequests(): void;
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
			getDiffInfo?: IModifiedFileEntry['getDiffInfo'];
		}>;
	};
}): MockChatModel {
	const requests: IChatRequestModel[] = [];

	const createRequest = (): IChatRequestModel => {
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

		return {
			id: 'request-1',
			response: mockResponse as IChatResponseModel
		} as IChatRequestModel;
	};

	let hasRequests = options.hasRequests !== false;
	if (hasRequests) {
		requests.push(createRequest());
	}

	const editingSessionEntries = options.editingSession?.entries.map(entry => ({
		state: observableValue('state', entry.state),
		linesAdded: observableValue('linesAdded', entry.linesAdded),
		linesRemoved: observableValue('linesRemoved', entry.linesRemoved),
		originalURI: entry.modifiedURI,
		modifiedURI: entry.modifiedURI,
		getDiffInfo: entry.getDiffInfo,
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
		get hasRequests() {
			return hasRequests;
		},
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
		addFirstRequest: () => {
			if (hasRequests) {
				return;
			}
			hasRequests = true;
			const request = createRequest();
			requests.push(request);
			_onDidChange.fire({ kind: 'addRequest', request });
		},
		removeRequests: () => {
			if (!hasRequests) {
				return;
			}
			hasRequests = false;
			const [request] = requests.splice(0, requests.length);
			_onDidChange.fire({ kind: 'removeRequest', requestId: request.id, reason: ChatRequestRemovalReason.Removal });
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

	function createHistoryItem(sessionId: string): IChatDetail {
		const timing = createTestTiming();
		return {
			sessionResource: LocalChatSessionUri.forSession(sessionId),
			title: sessionId,
			lastMessageDate: timing.created,
			isActive: false,
			lastResponseState: ResponseModelState.Complete,
			timing,
		};
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

	suite('Refresh races', () => {
		test('serializes and coalesces overlapping refreshes', async () => {
			const controller = createController();
			await controller.refresh(CancellationToken.None);
			const item = createHistoryItem('overlapping-refresh');
			const history = new DeferredPromise<IChatDetail[]>();
			const started = new DeferredPromise<void>();
			let reads = 0;
			mockChatService.getHistorySessionItems = async () => {
				if (++reads === 1) {
					started.complete();
					return history.p;
				}
				return [{ ...item, title: 'Latest title' }];
			};

			const first = controller.refresh(CancellationToken.None);
			await started.p;
			const second = controller.refresh(CancellationToken.None);
			const third = controller.refresh(CancellationToken.None);
			history.complete([item]);
			await Promise.all([first, second, third]);

			assert.deepStrictEqual({
				reads,
				titles: controller.items.map(item => item.label),
			}, { reads: 2, titles: ['Latest title'] });
		});

		for (const cancelAll of [false, true]) {
			for (const timing of ['before starting', 'while reading history']) {
				test(`${cancelAll ? 'cancels' : 'preserves'} a coalesced refresh when ${cancelAll ? 'all callers cancel' : 'only the latest caller cancels'} ${timing}`, async () => {
					const controller = createController();
					await controller.refresh(CancellationToken.None);
					const item = createHistoryItem('coalesced-cancellation');
					const history = new DeferredPromise<IChatDetail[]>();
					const started = new DeferredPromise<void>();
					const queuedHistory = new DeferredPromise<IChatDetail[]>();
					const queuedStarted = new DeferredPromise<void>();
					let reads = 0;
					mockChatService.getHistorySessionItems = () => {
						if (++reads === 1) {
							started.complete();
							return history.p;
						}
						queuedStarted.complete();
						return queuedHistory.p;
					};

					const active = controller.refresh(CancellationToken.None);
					await started.p;
					const firstToken = disposables.add(new CancellationTokenSource());
					const latestToken = disposables.add(new CancellationTokenSource());
					const first = controller.refresh(firstToken.token);
					const latest = controller.refresh(latestToken.token);
					if (timing === 'while reading history') {
						history.complete([]);
						await queuedStarted.p;
					}
					latestToken.cancel();
					if (cancelAll) {
						firstToken.cancel();
					}
					if (timing === 'before starting') {
						history.complete([]);
					}
					queuedHistory.complete([item]);
					await Promise.all([active, first, latest]);

					assert.deepStrictEqual({
						reads,
						items: controller.items.map(item => item.resource),
					}, {
						reads: cancelAll && timing === 'before starting' ? 1 : 2,
						items: cancelAll ? [] : [item.sessionResource],
					});
				});
			}
		}

		test('accepts a new queued refresh after earlier queued callers cancel', async () => {
			const controller = createController();
			await controller.refresh(CancellationToken.None);
			const item = createHistoryItem('refresh-after-cancellation');
			const history = new DeferredPromise<IChatDetail[]>();
			const started = new DeferredPromise<void>();
			let reads = 0;
			mockChatService.getHistorySessionItems = async () => {
				if (++reads === 1) {
					started.complete();
					return history.p;
				}
				return [item];
			};

			const active = controller.refresh(CancellationToken.None);
			await started.p;
			const cts = disposables.add(new CancellationTokenSource());
			const cancelled = controller.refresh(cts.token);
			cts.cancel();
			const latest = controller.refresh(CancellationToken.None);
			history.complete([]);
			await Promise.all([active, cancelled, latest]);

			assert.deepStrictEqual({
				reads,
				items: controller.items.map(item => item.resource),
			}, { reads: 2, items: [item.sessionResource] });
		});

		test('preserves the required unload refresh when a later caller cancels', async () => {
			const item = createHistoryItem('unpersisted-session');
			mockChatService.addSession(createMockChatModel({ sessionResource: item.sessionResource, customTitle: item.title }));
			mockChatService.setLiveSessionItems([{ ...item, isActive: true }]);
			const controller = createController();
			await controller.refresh(CancellationToken.None);

			const history = new DeferredPromise<IChatDetail[]>();
			const started = new DeferredPromise<void>();
			let reads = 0;
			mockChatService.getHistorySessionItems = async () => {
				if (++reads === 1) {
					started.complete();
					return history.p;
				}
				return [];
			};
			const removed: URI[] = [];
			disposables.add(controller.onDidChangeChatSessionItems(delta => removed.push(...delta.removed ?? [])));

			const active = controller.refresh(CancellationToken.None);
			await started.p;
			mockChatService.removeSession(item.sessionResource);
			mockChatService.setLiveSessionItems([]);
			mockChatService.fireDidDisposeSession([item.sessionResource], 'disposed');
			const cts = disposables.add(new CancellationTokenSource());
			const cancelled = controller.refresh(cts.token);
			cts.cancel();
			history.complete([]);
			await Promise.all([active, cancelled]);

			assert.deepStrictEqual({
				reads,
				items: controller.items,
				removed,
			}, { reads: 2, items: [], removed: [item.sessionResource] });
		});

		test('publishes changed history items but not unchanged refreshes', async () => {
			const controller = createController();
			const item = createHistoryItem('updated-history');
			mockChatService.setHistorySessionItems([item]);
			await controller.refresh(CancellationToken.None);

			const updates: IChatSessionItemsDelta[] = [];
			disposables.add(controller.onDidChangeChatSessionItems(delta => updates.push(delta)));
			mockChatService.setHistorySessionItems([{ ...item, title: 'Updated title' }]);
			await controller.refresh(CancellationToken.None);
			await controller.refresh(CancellationToken.None);

			assert.deepStrictEqual(updates.map(delta => ({
				titles: delta.addedOrUpdated?.map(item => item.label),
				removed: delta.removed,
			})), [{ titles: ['Updated title'], removed: undefined }]);
		});

		test('publishes working directory metadata changes and removals', async () => {
			const controller = createController();
			const item = createHistoryItem('working-directory-metadata');
			const originalDirectory = URI.file('/workspace/original');
			const changedDirectory = URI.file('/workspace/changed');
			mockChatService.setHistorySessionItems([{ ...item, workingDirectory: originalDirectory }]);
			await controller.refresh(CancellationToken.None);

			const updates: IChatSessionItemsDelta[] = [];
			disposables.add(controller.onDidChangeChatSessionItems(delta => updates.push(delta)));
			for (const workingDirectory of [URI.file(originalDirectory.fsPath), changedDirectory, undefined]) {
				mockChatService.setHistorySessionItems([{ ...item, workingDirectory }]);
				await controller.refresh(CancellationToken.None);
			}
			await controller.refresh(CancellationToken.None);

			assert.deepStrictEqual(updates.map(delta => ({
				metadata: delta.addedOrUpdated?.map(item => item.metadata),
				removed: delta.removed,
			})), [
				{ metadata: [{ workingDirectoryPath: changedDirectory.fsPath }], removed: undefined },
				{ metadata: [undefined], removed: undefined },
			]);
		});

		test('does not apply a refresh cancelled while reading history', async () => {
			const controller = createController();
			const item = createHistoryItem('cancelled-refresh');
			mockChatService.setHistorySessionItems([item]);
			await controller.refresh(CancellationToken.None);

			const history = new DeferredPromise<IChatDetail[]>();
			const started = new DeferredPromise<void>();
			mockChatService.getHistorySessionItems = () => {
				started.complete();
				return history.p;
			};
			const cts = disposables.add(new CancellationTokenSource());
			const refresh = controller.refresh(cts.token);
			await started.p;
			cts.cancel();
			history.complete([]);
			await refresh;

			assert.deepStrictEqual(controller.items.map(item => item.resource), [item.sessionResource]);
		});

		test('does not start a queued refresh after the controller is disposed', async () => {
			const controller = createController();
			await controller.refresh(CancellationToken.None);
			const history = new DeferredPromise<IChatDetail[]>();
			const started = new DeferredPromise<void>();
			let reads = 0;
			mockChatService.getHistorySessionItems = () => {
				if (++reads === 1) {
					started.complete();
				}
				return history.p;
			};

			const first = controller.refresh(CancellationToken.None);
			await started.p;
			const second = controller.refresh(CancellationToken.None);
			controller.dispose();
			history.complete([createHistoryItem('disposed-controller')]);
			await Promise.all([first, second]);

			assert.deepStrictEqual({ reads, items: controller.items }, { reads: 1, items: [] });
		});

		test('keeps deletion immediate without readding an in-flight history snapshot', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();
				const deleted = createHistoryItem('deleted-during-refresh');
				const added = createHistoryItem('added-during-refresh');
				mockChatService.setHistorySessionItems([deleted]);
				await controller.refresh(CancellationToken.None);

				const history = new DeferredPromise<IChatDetail[]>();
				const started = new DeferredPromise<void>();
				let reads = 0;
				mockChatService.getHistorySessionItems = async () => {
					if (++reads === 1) {
						started.complete();
						return history.p;
					}
					return [added];
				};
				const updates: URI[] = [];
				disposables.add(controller.onDidChangeChatSessionItems(delta => updates.push(...delta.addedOrUpdated?.map(item => item.resource) ?? [])));
				const refresh = controller.refresh(CancellationToken.None);
				await started.p;
				mockChatService.fireDidDisposeSession([deleted.sessionResource], 'cleared');
				const immediate = controller.items.map(item => item.resource);
				history.complete([deleted]);
				await refresh;
				await timeout(0);

				assert.deepStrictEqual({
					immediate,
					items: controller.items.map(item => item.resource),
					updates,
				}, { immediate: [], items: [added.sessionResource], updates: [added.sessionResource] });
			});
		});

		test('does not remove saved history when an older refresh completes after unload', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();
				const item = createHistoryItem('unloaded-during-refresh');
				mockChatService.setHistorySessionItems([item]);
				await controller.refresh(CancellationToken.None);

				const history = new DeferredPromise<IChatDetail[]>();
				const started = new DeferredPromise<void>();
				let reads = 0;
				mockChatService.getHistorySessionItems = async () => {
					if (++reads === 1) {
						started.complete();
						return history.p;
					}
					return [item];
				};
				const removed: URI[] = [];
				disposables.add(controller.onDidChangeChatSessionItems(delta => removed.push(...delta.removed ?? [])));
				const refresh = controller.refresh(CancellationToken.None);
				await started.p;
				mockChatService.fireDidDisposeSession([item.sessionResource], 'disposed');
				history.complete([]);
				await refresh;
				await timeout(0);

				assert.deepStrictEqual({
					items: controller.items.map(item => item.resource),
					removed,
				}, { items: [item.sessionResource], removed: [] });
			});
		});

		for (const reason of ['disposed', 'cleared'] as const) {
			test(`ignores a delayed live update after the session is ${reason}`, async () => {
				return runWithFakedTimers({}, async () => {
					const controller = createController();
					const item = createHistoryItem('delayed-live-update');
					const detail = new DeferredPromise<void>();
					const started = new DeferredPromise<void>();
					let holdDetail = false;
					const model = createMockChatModel({
						sessionResource: item.sessionResource,
						customTitle: item.title,
						editingSession: {
							entries: [{
								state: ModifiedFileEntryState.Modified,
								linesAdded: 1,
								linesRemoved: 0,
								modifiedURI: URI.file('/test/file.ts'),
								getDiffInfo: async () => {
									if (holdDetail) {
										started.complete();
										await detail.p;
									}
									return nullDocumentDiff;
								},
							}],
						},
					});
					mockChatService.setLiveSessionItems([item]);
					mockChatService.addSession(model);
					await timeout(0);

					holdDetail = true;
					model.setCustomTitle('Stale title');
					await started.p;
					mockChatService.setLiveSessionItems([]);
					if (reason === 'disposed') {
						mockChatService.removeSession(item.sessionResource);
						mockChatService.setHistorySessionItems([item]);
					}
					mockChatService.fireDidDisposeSession([item.sessionResource], reason);
					await timeout(0);
					detail.complete();
					await timeout(0);

					assert.deepStrictEqual(controller.items.map(item => item.label), reason === 'disposed' ? [item.title] : []);
				});
			});
		}

		test('does not attach model listeners when deletion happens during initial refresh', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();
				await controller.refresh(CancellationToken.None);
				const item = createHistoryItem('deleted-before-listening');
				const model = createMockChatModel({ sessionResource: item.sessionResource });
				const history = new DeferredPromise<IChatDetail[]>();
				const started = new DeferredPromise<void>();
				let reads = 0;
				mockChatService.getHistorySessionItems = async () => {
					if (++reads === 1) {
						started.complete();
						return history.p;
					}
					return [];
				};

				mockChatService.addSession(model);
				await started.p;
				mockChatService.fireDidDisposeSession([item.sessionResource], 'cleared');
				history.complete([]);
				await timeout(0);
				model.setCustomTitle('Must not reappear');
				await timeout(0);

				assert.deepStrictEqual(controller.items, []);
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
					requestInProgress: false
				});

				// Add the session first
				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);

				// Flush the initial add/reconcile churn from session creation.
				await controller.refresh(CancellationToken.None);
				await timeout(0);

				let changeEventCount = 0;
				disposables.add(controller.onDidChangeChatSessionItems(() => {
					changeEventCount++;
				}));

				const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);

				// Simulate a real progress change by toggling the in-progress state.
				mockModel.setRequestInProgress(true);
				await onDidChangeChatSessionItems;

				assert.strictEqual(changeEventCount, 1);
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
				assert.strictEqual(changeEventCount, 1); // 1 from refresh detecting the new session

				const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);

				mockModel.setRequestInProgress(true);

				await onDidChangeChatSessionItems;
				assert.strictEqual(changeEventCount, 2);
			});
		});

		test('should fire onDidChangeChatSessionItems when refresh discovers new sessions', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource1 = LocalChatSessionUri.forSession('session-1');
				const mockModel1 = createMockChatModel({ sessionResource: sessionResource1, hasRequests: true });
				mockChatService.addSession(mockModel1);
				mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel1)]);

				// Initial refresh populates _items
				await controller.refresh(CancellationToken.None);
				assert.strictEqual(controller.items.length, 1);

				// Simulate a forked session appearing (new model added, live items updated)
				const sessionResource2 = LocalChatSessionUri.forSession('session-2-forked');
				const mockModel2 = createMockChatModel({ sessionResource: sessionResource2, hasRequests: true, customTitle: 'Forked: Test Chat Title' });
				mockChatService.addSession(mockModel2);
				mockChatService.setLiveSessionItems([
					await chatModelToChatDetail(mockModel1),
					await chatModelToChatDetail(mockModel2),
				]);

				const fired: { addedOrUpdated?: readonly IChatSessionItem[]; removed?: readonly URI[] }[] = [];
				disposables.add(controller.onDidChangeChatSessionItems(delta => fired.push(delta)));

				await controller.refresh(CancellationToken.None);

				assert.strictEqual(controller.items.length, 2);
				// The event must have fired with the new (forked) session
				const addedResources = fired.flatMap(d => d.addedOrUpdated ?? []).map(i => i.resource.toString());
				assert.ok(addedResources.includes(sessionResource2.toString()), 'forked session should appear in addedOrUpdated');
				assert.ok(!addedResources.includes(sessionResource1.toString()), 'existing session should not appear in addedOrUpdated');
			});
		});

		test('should add a newly started session once it gets its first request', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('new-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: false
				});

				const fired: { addedOrUpdated?: readonly IChatSessionItem[]; removed?: readonly URI[] }[] = [];
				disposables.add(controller.onDidChangeChatSessionItems(delta => fired.push(delta)));

				// A brand new session is created without any requests yet.
				mockChatService.addSession(mockModel);
				await timeout(0);
				assert.strictEqual(controller.items.length, 0, 'session without requests should not be listed yet');

				// The user sends the first message, so the session now qualifies as a list item.
				mockModel.addFirstRequest();
				await timeout(0);

				assert.strictEqual(controller.items.length, 1, 'session should appear as soon as it has a request');
				const addedResources = fired.flatMap(d => d.addedOrUpdated ?? []).map(i => i.resource.toString());
				assert.ok(addedResources.includes(sessionResource.toString()), 'new session should appear in addedOrUpdated without a manual refresh');
			});
		});

		test('should remove a listed session once its requests are removed', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('emptied-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true
				});

				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
				await controller.refresh(CancellationToken.None);
				assert.strictEqual(controller.items.length, 1);

				const removedResources: URI[] = [];
				disposables.add(controller.onDidChangeChatSessionItems(delta => {
					if (delta.removed) {
						removedResources.push(...delta.removed);
					}
				}));

				// All requests are removed, so the session no longer qualifies as a list item.
				mockModel.removeRequests();
				await timeout(0);

				assert.strictEqual(controller.items.length, 0, 'session should be dropped once it has no requests');
				assert.ok(removedResources.some(r => r.toString() === sessionResource.toString()), 'emptied session should be removed without a manual refresh');
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

		test('should remove session from items and fire removed event on onDidDisposeSession', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('dispose-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true
				});

				// Add the session and populate items
				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
				await controller.refresh(CancellationToken.None);
				assert.strictEqual(controller.items.length, 1);

				// Listen for the removed event
				const removedResources: URI[] = [];
				disposables.add(controller.onDidChangeChatSessionItems(delta => {
					if (delta.removed) {
						removedResources.push(...delta.removed);
					}
				}));

				// Fire onDidDisposeSession (simulates removeHistoryEntry)
				mockChatService.fireDidDisposeSession([sessionResource]);

				// Session should be removed from items immediately
				assert.strictEqual(controller.items.length, 0, 'items should be empty after dispose');
				assert.strictEqual(removedResources.length, 1, 'removed event should fire');
				assert.strictEqual(removedResources[0].toString(), sessionResource.toString());

				// Even if refresh is called again, the session should not reappear
				// (because getLiveSessionItems would still return it, but shouldBeInHistory
				// would filter it in the real ChatService — here we simulate by keeping
				// liveSessionItems unchanged, but _items was already cleared)
			});
		});

		test('should not re-add disposed session to items on refresh', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();

				const sessionResource = LocalChatSessionUri.forSession('disposed-refresh-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true
				});

				// Add the session and populate items
				mockChatService.addSession(mockModel);
				mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
				await controller.refresh(CancellationToken.None);
				assert.strictEqual(controller.items.length, 1);

				// Dispose the session
				mockChatService.fireDidDisposeSession([sessionResource]);
				assert.strictEqual(controller.items.length, 0);

				// Clear live items (simulates isDeleted filtering in real ChatService)
				mockChatService.setLiveSessionItems([]);

				// Refresh should not bring it back
				await controller.refresh(CancellationToken.None);
				assert.strictEqual(controller.items.length, 0, 'disposed session should not reappear after refresh');
			});
		});

		test('keeps a closed session in the list when its history was persisted', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();
				const sessionResource = LocalChatSessionUri.forSession('closed-persisted-session');
				const model = createMockChatModel({ sessionResource, hasRequests: true });
				mockChatService.addSession(model);
				const detail = await chatModelToChatDetail(model);
				mockChatService.setLiveSessionItems([detail]);
				await controller.refresh(CancellationToken.None);
				await timeout(0);

				const removed: URI[] = [];
				disposables.add(controller.onDidChangeChatSessionItems(delta => removed.push(...delta.removed ?? [])));
				mockChatService.setLiveSessionItems([]);
				mockChatService.setHistorySessionItems([{ ...detail, isActive: false }]);
				mockChatService.removeSession(sessionResource);
				mockChatService.fireDidDisposeSession([sessionResource], 'disposed');
				await timeout(0);

				assert.deepStrictEqual({
					items: controller.items.map(item => item.resource),
					removed,
				}, { items: [sessionResource], removed: [] });
			});
		});

		test('removes a closed session when no history was persisted', async () => {
			return runWithFakedTimers({}, async () => {
				const controller = createController();
				const sessionResource = LocalChatSessionUri.forSession('closed-unpersisted-session');
				const model = createMockChatModel({ sessionResource, hasRequests: true });
				mockChatService.addSession(model);
				mockChatService.setLiveSessionItems([await chatModelToChatDetail(model)]);
				await controller.refresh(CancellationToken.None);
				await timeout(0);

				mockChatService.setLiveSessionItems([]);
				mockChatService.removeSession(sessionResource);
				mockChatService.fireDidDisposeSession([sessionResource], 'disposed');
				await timeout(0);

				assert.deepStrictEqual(controller.items, []);
			});
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { LocalAgentsSessionsProvider } from '../../browser/agentSessions/localAgentSessionsProvider.js';
import { ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../common/chatModel.js';
import { IChatDetail, IChatService, IChatSessionStartOptions } from '../../common/chatService.js';
import { ChatSessionStatus, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../common/chatUri.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { MockChatSessionsService } from '../common/mockChatSessionsService.js';

class MockChatService implements IChatService {
	private readonly _chatModels: ISettableObservable<Iterable<IChatModel>> = observableValue('chatModels', []);
	readonly chatModels = this._chatModels;
	requestInProgressObs = observableValue('name', false);
	edits2Enabled: boolean = false;
	_serviceBrand: undefined;
	editingSessions = [];
	transferredSessionData = undefined;
	readonly onDidSubmitRequest = Event.None;

	private sessions = new Map<string, IChatModel>();
	private liveSessionItems: IChatDetail[] = [];
	private historySessionItems: IChatDetail[] = [];

	private readonly _onDidDisposeSession = new Emitter<{ sessionResource: URI; reason: 'cleared' }>();
	readonly onDidDisposeSession = this._onDidDisposeSession.event;

	fireDidDisposeSession(sessionResource: URI): void {
		this._onDidDisposeSession.fire({ sessionResource, reason: 'cleared' });
	}

	setSaveModelsEnabled(enabled: boolean): void {

	}

	setLiveSessionItems(items: IChatDetail[]): void {
		this.liveSessionItems = items;
	}

	setHistorySessionItems(items: IChatDetail[]): void {
		this.historySessionItems = items;
	}

	addSession(sessionResource: URI, session: IChatModel): void {
		this.sessions.set(sessionResource.toString(), session);
		// Update the chatModels observable
		this._chatModels.set([...this.sessions.values()], undefined);
	}

	removeSession(sessionResource: URI): void {
		this.sessions.delete(sessionResource.toString());
		// Update the chatModels observable
		this._chatModels.set([...this.sessions.values()], undefined);
	}

	isEnabled(_location: ChatAgentLocation): boolean {
		return true;
	}

	hasSessions(): boolean {
		return this.sessions.size > 0;
	}

	getProviderInfos() {
		return [];
	}

	startSession(_location: ChatAgentLocation, _options?: IChatSessionStartOptions): any {
		throw new Error('Method not implemented.');
	}

	getSession(sessionResource: URI): IChatModel | undefined {
		return this.sessions.get(sessionResource.toString());
	}

	getOrRestoreSession(_sessionResource: URI): Promise<any> {
		throw new Error('Method not implemented.');
	}

	getPersistedSessionTitle(_sessionResource: URI): string | undefined {
		return undefined;
	}

	loadSessionFromContent(_data: any): any {
		throw new Error('Method not implemented.');
	}

	loadSessionForResource(_resource: URI, _position: ChatAgentLocation, _token: CancellationToken): Promise<any> {
		throw new Error('Method not implemented.');
	}

	getActiveSessionReference(_sessionResource: URI): any {
		return undefined;
	}

	setTitle(_sessionResource: URI, _title: string): void { }

	appendProgress(_request: IChatRequestModel, _progress: any): void { }

	sendRequest(_sessionResource: URI, _message: string): Promise<any> {
		throw new Error('Method not implemented.');
	}

	resendRequest(_request: IChatRequestModel, _options?: any): Promise<void> {
		throw new Error('Method not implemented.');
	}

	adoptRequest(_sessionResource: URI, _request: IChatRequestModel): Promise<void> {
		throw new Error('Method not implemented.');
	}

	removeRequest(_sessionResource: URI, _requestId: string): Promise<void> {
		throw new Error('Method not implemented.');
	}

	cancelCurrentRequestForSession(_sessionResource: URI): void { }

	addCompleteRequest(): void { }

	async getLocalSessionHistory(): Promise<IChatDetail[]> {
		return this.historySessionItems;
	}

	async clearAllHistoryEntries(): Promise<void> { }

	async removeHistoryEntry(_resource: URI): Promise<void> { }

	readonly onDidPerformUserAction = Event.None;

	notifyUserAction(_event: any): void { }

	transferChatSession(): void { }

	setChatSessionTitle(): void { }

	isEditingLocation(_location: ChatAgentLocation): boolean {
		return false;
	}

	getChatStorageFolder(): URI {
		return URI.file('/tmp');
	}

	logChatIndex(): void { }

	isPersistedSessionEmpty(_sessionResource: URI): boolean {
		return false;
	}

	activateDefaultAgent(_location: ChatAgentLocation): Promise<void> {
		return Promise.resolve();
	}

	getChatSessionFromInternalUri(_sessionResource: URI): any {
		return undefined;
	}

	async getLiveSessionItems(): Promise<IChatDetail[]> {
		return this.liveSessionItems;
	}

	async getHistorySessionItems(): Promise<IChatDetail[]> {
		return this.historySessionItems;
	}

	waitForModelDisposals(): Promise<void> {
		return Promise.resolve();
	}

	getMetadataForSession(sessionResource: URI): Promise<IChatDetail | undefined> {
		throw new Error('Method not implemented.');
	}
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
}): IChatModel {
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
		modifiedURI: entry.modifiedURI
	}));

	const mockEditingSession = options.editingSession ? {
		entries: observableValue('entries', editingSessionEntries ?? [])
	} : undefined;

	const _onDidChange = new Emitter<{ kind: string } | undefined>();

	return {
		sessionResource: options.sessionResource,
		hasRequests: options.hasRequests !== false,
		timestamp: options.timestamp ?? Date.now(),
		requestInProgress: observableValue('requestInProgress', options.requestInProgress ?? false),
		getRequests: () => requests,
		onDidChange: _onDidChange.event,
		editingSession: mockEditingSession,
		setCustomTitle: (_title: string) => {
			_onDidChange.fire({ kind: 'setCustomTitle' });
		}
	} as unknown as IChatModel;
}

suite('LocalAgentsSessionsProvider', () => {
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

	function createProvider(): LocalAgentsSessionsProvider {
		return disposables.add(instantiationService.createInstance(LocalAgentsSessionsProvider));
	}

	test('should have correct session type', () => {
		const provider = createProvider();
		assert.strictEqual(provider.chatSessionType, localChatSessionType);
	});

	test('should register itself with chat sessions service', () => {
		const provider = createProvider();

		const providers = mockChatSessionsService.getAllChatSessionItemProviders();
		assert.strictEqual(providers.length, 1);
		assert.strictEqual(providers[0], provider);
	});

	test('should provide empty sessions when no live or history sessions', async () => {
		return runWithFakedTimers({}, async () => {
			const provider = createProvider();

			mockChatService.setLiveSessionItems([]);
			mockChatService.setHistorySessionItems([]);

			const sessions = await provider.provideChatSessionItems(CancellationToken.None);
			assert.strictEqual(sessions.length, 0);
		});
	});

	test('should provide live session items', async () => {
		return runWithFakedTimers({}, async () => {
			const provider = createProvider();

			const sessionResource = LocalChatSessionUri.forSession('test-session');
			const mockModel = createMockChatModel({
				sessionResource,
				hasRequests: true,
				timestamp: Date.now()
			});

			mockChatService.addSession(sessionResource, mockModel);
			mockChatService.setLiveSessionItems([{
				sessionResource,
				title: 'Test Session',
				lastMessageDate: Date.now(),
				isActive: true
			}]);

			const sessions = await provider.provideChatSessionItems(CancellationToken.None);
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].label, 'Test Session');
			assert.strictEqual(sessions[0].resource.toString(), sessionResource.toString());
		});
	});

	test('should provide history session items', async () => {
		return runWithFakedTimers({}, async () => {
			const provider = createProvider();

			const sessionResource = LocalChatSessionUri.forSession('history-session');

			mockChatService.setLiveSessionItems([]);
			mockChatService.setHistorySessionItems([{
				sessionResource,
				title: 'History Session',
				lastMessageDate: Date.now() - 10000,
				isActive: false
			}]);

			const sessions = await provider.provideChatSessionItems(CancellationToken.None);
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].label, 'History Session');
		});
	});

	test('should not duplicate sessions in history and live', async () => {
		return runWithFakedTimers({}, async () => {
			const provider = createProvider();

			const sessionResource = LocalChatSessionUri.forSession('duplicate-session');
			const mockModel = createMockChatModel({
				sessionResource,
				hasRequests: true
			});

			mockChatService.addSession(sessionResource, mockModel);
			mockChatService.setLiveSessionItems([{
				sessionResource,
				title: 'Live Session',
				lastMessageDate: Date.now(),
				isActive: true
			}]);
			mockChatService.setHistorySessionItems([{
				sessionResource,
				title: 'History Session',
				lastMessageDate: Date.now() - 10000,
				isActive: false
			}]);

			const sessions = await provider.provideChatSessionItems(CancellationToken.None);
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].label, 'Live Session');
		});
	});

	suite('Session Status', () => {
		test('should return InProgress status when request in progress', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('in-progress-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: true
				});

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'In Progress Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.InProgress);
			});
		});

		test('should return Completed status when last response is complete', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('completed-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false,
					lastResponseComplete: true,
					lastResponseCanceled: false,
					lastResponseHasError: false
				});

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Completed Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.Completed);
			});
		});

		test('should return Failed status when last response was canceled', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('canceled-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false,
					lastResponseComplete: false,
					lastResponseCanceled: true
				});

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Canceled Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.Failed);
			});
		});

		test('should return Failed status when last response has error', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('error-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false,
					lastResponseComplete: true,
					lastResponseHasError: true
				});

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Error Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].status, ChatSessionStatus.Failed);
			});
		});
	});

	suite('Session Statistics', () => {
		test('should return statistics for sessions with modified entries', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

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

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Stats Session',
					lastMessageDate: Date.now(),
					isActive: true,
					stats: {
						added: 30,
						removed: 8,
						fileCount: 2
					}
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
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
				const provider = createProvider();

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

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'No Stats Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].changes, undefined);
			});
		});
	});

	suite('Session Timing', () => {
		test('should use model timestamp for startTime when model exists', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('timing-session');
				const modelTimestamp = Date.now() - 5000;
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					timestamp: modelTimestamp
				});

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Timing Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].timing.startTime, modelTimestamp);
			});
		});

		test('should use lastMessageDate for startTime when model does not exist', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('history-timing');
				const lastMessageDate = Date.now() - 10000;

				mockChatService.setLiveSessionItems([]);
				mockChatService.setHistorySessionItems([{
					sessionResource,
					title: 'History Timing Session',
					lastMessageDate,
					isActive: false
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].timing.startTime, lastMessageDate);
			});
		});

		test('should set endTime from last response completedAt', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('endtime-session');
				const completedAt = Date.now() - 1000;
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					lastResponseComplete: true,
					lastResponseCompletedAt: completedAt
				});

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'EndTime Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].timing.endTime, completedAt);
			});
		});
	});

	suite('Session Icon', () => {
		test('should use Codicon.chatSparkle as icon', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('icon-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true
				});

				mockChatService.addSession(sessionResource, mockModel);
				mockChatService.setLiveSessionItems([{
					sessionResource,
					title: 'Icon Session',
					lastMessageDate: Date.now(),
					isActive: true
				}]);

				const sessions = await provider.provideChatSessionItems(CancellationToken.None);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].iconPath, Codicon.chatSparkle);
			});
		});
	});

	suite('Events', () => {
		test('should fire onDidChangeChatSessionItems when model progress changes', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('progress-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: true
				});

				// Add the session first
				mockChatService.addSession(sessionResource, mockModel);

				let changeEventCount = 0;
				disposables.add(provider.onDidChangeChatSessionItems(() => {
					changeEventCount++;
				}));

				// Simulate progress change by triggering the progress listener
				mockChatSessionsService.triggerProgressEvent();

				assert.strictEqual(changeEventCount, 1);
			});
		});

		test('should fire onDidChangeChatSessionItems when model request status changes', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('status-change-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true,
					requestInProgress: false
				});

				// Add the session first
				mockChatService.addSession(sessionResource, mockModel);

				let changeEventCount = 0;
				disposables.add(provider.onDidChangeChatSessionItems(() => {
					changeEventCount++;
				}));

				// Simulate progress change by triggering the progress listener
				mockChatSessionsService.triggerProgressEvent();

				assert.strictEqual(changeEventCount, 1);
			});
		});

		test('should clean up model listeners when model is removed via chatModels observable', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				const sessionResource = LocalChatSessionUri.forSession('cleanup-session');
				const mockModel = createMockChatModel({
					sessionResource,
					hasRequests: true
				});

				// Add the session first
				mockChatService.addSession(sessionResource, mockModel);

				// Now remove the session - the observable should trigger cleanup
				mockChatService.removeSession(sessionResource);

				// Verify the listener was cleaned up by triggering a title change
				// The onDidChangeChatSessionItems from registerModelListeners cleanup should fire once
				// but after that, title changes should NOT fire onDidChangeChatSessionItems
				let changeEventCount = 0;
				disposables.add(provider.onDidChangeChatSessionItems(() => {
					changeEventCount++;
				}));

				(mockModel as unknown as { setCustomTitle: (title: string) => void }).setCustomTitle('New Title');

				assert.strictEqual(changeEventCount, 0, 'onDidChangeChatSessionItems should NOT fire after model is removed');
			});
		});

		test('should fire onDidChange when session items change for local type', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				let changeEventFired = false;
				disposables.add(provider.onDidChange(() => {
					changeEventFired = true;
				}));

				mockChatSessionsService.notifySessionItemsChanged(localChatSessionType);

				assert.strictEqual(changeEventFired, true);
			});
		});

		test('should not fire onDidChange when session items change for other types', async () => {
			return runWithFakedTimers({}, async () => {
				const provider = createProvider();

				let changeEventFired = false;
				disposables.add(provider.onDidChange(() => {
					changeEventFired = true;
				}));

				mockChatSessionsService.notifySessionItemsChanged('other-type');

				assert.strictEqual(changeEventFired, false);
			});
		});
	});
});

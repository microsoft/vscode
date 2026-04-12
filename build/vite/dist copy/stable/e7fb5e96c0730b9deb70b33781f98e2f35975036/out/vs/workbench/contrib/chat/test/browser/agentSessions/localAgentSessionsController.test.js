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
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LocalAgentsSessionsController } from '../../../browser/agentSessions/localAgentSessionsController.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { chatModelToChatDetail } from '../../../common/chatService/chatServiceImpl.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';
function createTestTiming(options) {
    const now = Date.now();
    return {
        created: options?.created ?? now,
        lastRequestStarted: options?.lastRequestStarted,
        lastRequestEnded: options?.lastRequestEnded,
    };
}
function createMockChatModel(options) {
    const requests = [];
    if (options.hasRequests !== false) {
        const mockResponse = {
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
            response: mockResponse
        });
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
        state: observableValue('state', 2 /* ChatEditingSessionState.Idle */)
    } : undefined;
    const _onDidChange = new Emitter();
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
        editingSession: mockEditingSession,
        lastRequestObs: observableValue('lastRequest', undefined),
        // Mock helpers
        setCustomTitle: (newTitle) => {
            title = newTitle;
            _onDidChange.fire({ kind: 'setCustomTitle', title });
        },
        setRequestInProgress: (inProgress) => {
            if (requestInProgress.get() === inProgress) {
                return;
            }
            requestInProgress.set(inProgress, undefined);
            _onDidChange.fire({ kind: 'changedRequest' });
        },
    };
}
suite('LocalAgentsSessionsController', () => {
    const disposables = new DisposableStore();
    let mockChatService;
    let mockChatSessionsService;
    let instantiationService;
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
    function createController() {
        return disposables.add(instantiationService.createInstance(LocalAgentsSessionsController));
    }
    test('should have correct session type', () => {
        const controller = createController();
        assert.strictEqual(controller.chatSessionType, localChatSessionType);
    });
    test('should register itself with chat sessions service', async () => {
        const controller = createController();
        const controllerResults = [];
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
                    lastResponseState: 1 /* ResponseModelState.Complete */
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
                    lastResponseState: 1 /* ResponseModelState.Complete */,
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
                    lastResponseState: 1 /* ResponseModelState.Complete */,
                    timing: createTestTiming()
                }]);
            mockChatService.setHistorySessionItems([{
                    sessionResource,
                    title: 'History Session',
                    lastMessageDate: Date.now() - 10000,
                    isActive: false,
                    lastResponseState: 1 /* ResponseModelState.Complete */,
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
                        timing: createTestTiming()
                    }]);
                await controller.refresh(CancellationToken.None);
                const sessions = controller.items;
                assert.strictEqual(sessions.length, 1);
                assert.strictEqual(sessions[0].status, 2 /* ChatSessionStatus.InProgress */);
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
                        timing: createTestTiming(),
                    }]);
                await controller.refresh(CancellationToken.None);
                const sessions = controller.items;
                assert.strictEqual(sessions.length, 1);
                assert.strictEqual(sessions[0].status, 1 /* ChatSessionStatus.Completed */);
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
                        timing: createTestTiming(),
                    }]);
                await controller.refresh(CancellationToken.None);
                const sessions = controller.items;
                assert.strictEqual(sessions.length, 1);
                assert.strictEqual(sessions[0].status, 1 /* ChatSessionStatus.Completed */);
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
                        timing: createTestTiming(),
                    }]);
                await controller.refresh(CancellationToken.None);
                const sessions = controller.items;
                assert.strictEqual(sessions.length, 1);
                assert.strictEqual(sessions[0].status, 0 /* ChatSessionStatus.Failed */);
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
                                state: 0 /* ModifiedFileEntryState.Modified */,
                                linesAdded: 10,
                                linesRemoved: 5,
                                modifiedURI: URI.file('/test/file1.ts')
                            },
                            {
                                state: 0 /* ModifiedFileEntryState.Modified */,
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
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
                const changes = sessions[0].changes;
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
                                state: 1 /* ModifiedFileEntryState.Accepted */,
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
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
                        lastResponseState: 1 /* ResponseModelState.Complete */,
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
                        lastResponseState: 1 /* ResponseModelState.Complete */
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxBZ2VudFNlc3Npb25zQ29udHJvbGxlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9sb2NhbEFnZW50U2Vzc2lvbnNDb250cm9sbGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFdEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDL0csT0FBTyxFQUFFLFlBQVksRUFBc0IsTUFBTSw0Q0FBNEMsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2RixPQUFPLEVBQXVDLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHekksT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdkUsT0FBTyxFQUFF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
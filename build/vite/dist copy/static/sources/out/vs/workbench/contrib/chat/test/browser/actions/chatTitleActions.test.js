/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidgetService, IChatAccessibilityService } from '../../../browser/chat.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatModeKind } from '../../../common/constants.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { registerChatTitleActions } from '../../../browser/actions/chatTitleActions.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
suite('RetryChatAction', () => {
    const store = new DisposableStore();
    let instantiationService;
    // Register actions once for all tests
    let actionsRegistered = false;
    function ensureActionsRegistered() {
        if (!actionsRegistered) {
            registerChatTitleActions();
            actionsRegistered = true;
        }
    }
    setup(() => {
        instantiationService = store.add(new TestInstantiationService());
        ensureActionsRegistered();
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMockResponseVM(sessionResource, requestId) {
        return {
            sessionResource,
            requestId,
            setVote: () => { }, // Required by isResponseVM check
        };
    }
    function createMockRequest(id) {
        return {
            id,
            attempt: 0,
        };
    }
    function createMockEditingSession(entriesModifiedByRequest) {
        return {
            entries: observableValue('entries', entriesModifiedByRequest),
            restoreSnapshot: async (_requestId, _undoIndex) => { },
        };
    }
    function createMockWidget(mode, editingSession, lastResponseItem) {
        return {
            input: {
                currentModeKind: mode,
                currentLanguageModel: 'test-model',
            },
            viewModel: {
                model: {
                    editingSession,
                },
                getItems: () => lastResponseItem ? [lastResponseItem] : [],
            },
            getModeRequestOptions: () => ({}),
        };
    }
    test('retry action should not throw when using accessor synchronously', async () => {
        const sessionResource = URI.parse('test://session');
        const requestId = 'test-request-1';
        const mockRequest = createMockRequest(requestId);
        const mockResponse = createMockResponseVM(sessionResource, requestId);
        const editingSession = createMockEditingSession([]);
        const mockWidget = createMockWidget(ChatModeKind.Edit, editingSession, mockResponse);
        // Mock chat model
        const mockChatModel = {
            getRequests: () => [mockRequest],
        };
        // Create MockChatWidgetService with widget lookup override
        const mockChatWidgetService = new class extends MockChatWidgetService {
            getWidgetBySessionResource(_resource) {
                return mockWidget;
            }
        };
        let resendCalled = false;
        const mockChatService = new class extends MockChatService {
            getSession(_sessionResource) {
                return mockChatModel;
            }
            async resendRequest(_request, _options) {
                resendCalled = true;
            }
        };
        const mockConfigService = new TestConfigurationService();
        await mockConfigService.setUserConfiguration('chat.editing.confirmEditRequestRetry', false);
        const mockDialogService = new class extends mock() {
            async confirm(_confirmation) {
                return { confirmed: true };
            }
        };
        let acceptRequestCalled = false;
        const mockChatAccessibilityService = new class extends mock() {
            acceptRequest(_resource) {
                acceptRequestCalled = true;
            }
        };
        // Use set() instead of stub() for more direct service registration
        instantiationService.set(IChatWidgetService, mockChatWidgetService);
        instantiationService.set(IChatService, mockChatService);
        instantiationService.set(IConfigurationService, mockConfigService);
        instantiationService.set(IDialogService, mockDialogService);
        instantiationService.set(IChatAccessibilityService, mockChatAccessibilityService);
        // Get the action handler
        const commandHandler = CommandsRegistry.getCommand('workbench.action.chat.retry')?.handler;
        assert.ok(commandHandler, 'Command handler should be registered');
        // Run the action with the instantiation service acting as accessor
        await commandHandler(instantiationService, mockResponse);
        assert.ok(resendCalled, 'resendRequest should have been called');
        assert.ok(acceptRequestCalled, 'acceptRequest should have been called');
    });
    test('retry action should work with confirmation dialog (accessor used after await)', async () => {
        const sessionResource = URI.parse('test://session');
        const requestId = 'test-request-1';
        const mockRequest = createMockRequest(requestId);
        const mockResponse = createMockResponseVM(sessionResource, requestId);
        // Create an entry that was modified by this request to trigger confirmation
        const modifiedEntry = {
            modifiedURI: URI.parse('test://file.ts'),
            lastModifyingRequestId: requestId,
        };
        const editingSession = createMockEditingSession([modifiedEntry]);
        const mockWidget = createMockWidget(ChatModeKind.Edit, editingSession, mockResponse);
        // Mock chat model
        const mockChatModel = {
            getRequests: () => [mockRequest],
        };
        // Create MockChatWidgetService with widget lookup override
        const mockChatWidgetService = new class extends MockChatWidgetService {
            getWidgetBySessionResource(_resource) {
                return mockWidget;
            }
        };
        let resendCalled = false;
        const mockChatService = new class extends MockChatService {
            getSession(_sessionResource) {
                return mockChatModel;
            }
            async resendRequest(_request, _options) {
                resendCalled = true;
            }
        };
        // Enable confirmation dialog - this will trigger an await
        const mockConfigService = new TestConfigurationService();
        await mockConfigService.setUserConfiguration('chat.editing.confirmEditRequestRetry', true);
        let dialogShown = false;
        const mockDialogService = new class extends mock() {
            async confirm(_confirmation) {
                dialogShown = true;
                // Simulate async delay that would happen in real dialog
                await new Promise(resolve => setTimeout(resolve, 10));
                return { confirmed: true, checkboxChecked: false };
            }
        };
        let acceptRequestCalled = false;
        const mockChatAccessibilityService = new class extends mock() {
            acceptRequest(_resource) {
                acceptRequestCalled = true;
            }
        };
        // Use set() for more direct service registration
        instantiationService.set(IChatWidgetService, mockChatWidgetService);
        instantiationService.set(IChatService, mockChatService);
        instantiationService.set(IConfigurationService, mockConfigService);
        instantiationService.set(IDialogService, mockDialogService);
        instantiationService.set(IChatAccessibilityService, mockChatAccessibilityService);
        // Get the action handler
        const commandHandler = CommandsRegistry.getCommand('workbench.action.chat.retry')?.handler;
        assert.ok(commandHandler, 'Command handler should be registered');
        // Create a strict accessor that throws when used after dispose
        // This simulates the behavior of the real ServicesAccessor which becomes
        // invalid after the synchronous portion of the action handler
        let disposed = false;
        const strictAccessor = {
            get(id) {
                if (disposed) {
                    throw new Error(`Accessor was used after being disposed. Tried to get service: ${id.toString()}`);
                }
                return instantiationService.get(id);
            }
        };
        // Create a wrapper that disposes the accessor after the first await
        // by wrapping the dialog service
        const originalConfirm = mockDialogService.confirm.bind(mockDialogService);
        mockDialogService.confirm = async (confirmation) => {
            const result = await originalConfirm(confirmation);
            // Mark accessor as disposed after the await, simulating real behavior
            disposed = true;
            return result;
        };
        // Run the action - this should throw if accessor is used after the confirm await
        let threwError = false;
        let errorMessage = '';
        try {
            await commandHandler(strictAccessor, mockResponse);
        }
        catch (e) {
            threwError = true;
            errorMessage = e.message;
        }
        assert.ok(dialogShown, 'Dialog should have been shown');
        // The bug is that accessor.get(IChatAccessibilityService) is called after the await
        // This test should fail until the bug is fixed
        if (threwError) {
            assert.fail(`Action threw an error because accessor was used after await: ${errorMessage}`);
        }
        assert.ok(resendCalled, 'resendRequest should have been called');
        assert.ok(acceptRequestCalled, 'acceptRequest should have been called');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRpdGxlQWN0aW9ucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0VGl0bGVBY3Rpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsY0FBYyxFQUFzQyxNQUFNLHNEQUFzRCxDQUFDO0FBRTFILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxrQkFBa0IsRUFBZSx5QkFBeUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXRHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUcxRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDMUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEYsT0FBTyxFQUFF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
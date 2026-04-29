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
import { IDialogService, IConfirmation, IConfirmationResult } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ServiceIdentifier } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatWidgetService, IChatWidget, IChatAccessibilityService } from '../../../browser/chat.js';
import { IChatEditingSession, IModifiedFileEntry } from '../../../common/editing/chatEditingService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { ChatModeKind } from '../../../common/constants.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { registerChatTitleActions } from '../../../browser/actions/chatTitleActions.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

suite('RetryChatAction', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

	// Register actions once for all tests
	let actionsRegistered = false;
	function ensureActionsRegistered(): void {
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

	function createMockResponseVM(sessionResource: URI, requestId: string): IChatResponseViewModel {
		return {
			sessionResource,
			requestId,
			setVote: () => { }, // Required by isResponseVM check
		} as unknown as IChatResponseViewModel;
	}

	function createMockRequest(id: string): IChatRequestModel {
		return {
			id,
			attempt: 0,
		} as IChatRequestModel;
	}

	function createMockEditingSession(entriesModifiedByRequest: IModifiedFileEntry[]): IChatEditingSession {
		return {
			entries: observableValue('entries', entriesModifiedByRequest),
			restoreSnapshot: async (_requestId: string, _undoIndex: number | undefined) => { },
		} as unknown as IChatEditingSession;
	}

	function createMockWidget(mode: ChatModeKind, editingSession: IChatEditingSession | undefined, lastResponseItem?: IChatResponseViewModel): Partial<IChatWidget> {
		return {
			input: {
				currentModeKind: mode,
				currentLanguageModel: 'test-model',
			} as IChatWidget['input'],
			viewModel: {
				model: {
					editingSession,
				},
				getItems: () => lastResponseItem ? [lastResponseItem] : [],
			} as unknown as IChatWidget['viewModel'],
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
		const mockChatModel: Partial<IChatModel> = {
			getRequests: () => [mockRequest as IChatRequestModel],
		};

		// Create MockChatWidgetService with widget lookup override
		const mockChatWidgetService = new class extends MockChatWidgetService {
			override getWidgetBySessionResource(_resource: URI) {
				return mockWidget as IChatWidget;
			}
		};

		let resendCalled = false;
		const mockChatService = new class extends MockChatService {
			override getSession(_sessionResource: URI) {
				return mockChatModel as IChatModel;
			}
			override async resendRequest(_request: IChatRequestModel, _options?: unknown) {
				resendCalled = true;
			}
		};

		const mockConfigService = new TestConfigurationService();
		await mockConfigService.setUserConfiguration('chat.editing.confirmEditRequestRetry', false);

		const mockDialogService = new class extends mock<IDialogService>() {
			override async confirm(_confirmation: IConfirmation): Promise<IConfirmationResult> {
				return { confirmed: true };
			}
		};

		let acceptRequestCalled = false;
		const mockChatAccessibilityService = new class extends mock<IChatAccessibilityService>() {
			override acceptRequest(_resource: URI) {
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
		const modifiedEntry: IModifiedFileEntry = {
			modifiedURI: URI.parse('test://file.ts'),
			lastModifyingRequestId: requestId,
		} as IModifiedFileEntry;

		const editingSession = createMockEditingSession([modifiedEntry]);
		const mockWidget = createMockWidget(ChatModeKind.Edit, editingSession, mockResponse);

		// Mock chat model
		const mockChatModel: Partial<IChatModel> = {
			getRequests: () => [mockRequest as IChatRequestModel],
		};

		// Create MockChatWidgetService with widget lookup override
		const mockChatWidgetService = new class extends MockChatWidgetService {
			override getWidgetBySessionResource(_resource: URI) {
				return mockWidget as IChatWidget;
			}
		};

		let resendCalled = false;
		const mockChatService = new class extends MockChatService {
			override getSession(_sessionResource: URI) {
				return mockChatModel as IChatModel;
			}
			override async resendRequest(_request: IChatRequestModel, _options?: unknown) {
				resendCalled = true;
			}
		};

		// Enable confirmation dialog - this will trigger an await
		const mockConfigService = new TestConfigurationService();
		await mockConfigService.setUserConfiguration('chat.editing.confirmEditRequestRetry', true);

		let dialogShown = false;
		const mockDialogService = new class extends mock<IDialogService>() {
			override async confirm(_confirmation: IConfirmation): Promise<IConfirmationResult> {
				dialogShown = true;
				// Simulate async delay that would happen in real dialog
				await new Promise(resolve => setTimeout(resolve, 10));
				return { confirmed: true, checkboxChecked: false };
			}
		};

		let acceptRequestCalled = false;
		const mockChatAccessibilityService = new class extends mock<IChatAccessibilityService>() {
			override acceptRequest(_resource: URI) {
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
			get<T>(id: ServiceIdentifier<T>): T {
				if (disposed) {
					throw new Error(`Accessor was used after being disposed. Tried to get service: ${id.toString()}`);
				}
				return instantiationService.get(id);
			}
		};

		// Create a wrapper that disposes the accessor after the first await
		// by wrapping the dialog service
		const originalConfirm = mockDialogService.confirm.bind(mockDialogService);
		mockDialogService.confirm = async (confirmation: IConfirmation): Promise<IConfirmationResult> => {
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
		} catch (e) {
			threwError = true;
			errorMessage = (e as Error).message;
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

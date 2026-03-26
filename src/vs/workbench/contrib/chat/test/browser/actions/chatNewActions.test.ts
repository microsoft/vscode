/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { registerNewChatActions } from '../../../browser/actions/chatNewActions.js';
import { ACTION_ID_NEW_CHAT } from '../../../browser/actions/chatActions.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';

registerNewChatActions();

suite('NewChatAction', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockWidget(sessionResource: URI, hasRequests: boolean): {
		widget: IChatWidget;
		state: {
			attachmentClearCalls: number;
			focusCalls: number;
		};
	} {
		const state = {
			attachmentClearCalls: 0,
			focusCalls: 0,
		};

		const widget: Partial<IChatWidget> = {
			location: ChatAgentLocation.Chat,
			viewContext: { viewId: ChatViewId },
			viewModel: {
				model: {
					sessionResource,
					hasRequests,
				},
			} as IChatWidget['viewModel'],
			attachmentModel: {
				clear: () => {
					state.attachmentClearCalls++;
				},
			} as IChatWidget['attachmentModel'],
			input: {
				currentModeKind: ChatModeKind.Agent,
				setChatMode: () => { },
			} as IChatWidget['input'],
			focusInput: () => {
				state.focusCalls++;
			},
		};

		return {
			widget: widget as IChatWidget,
			state,
		};
	}

	test('reuses the current untitled contributed session when it is still empty', async () => {
		const currentSession = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-draft' });
		const widgetState = createMockWidget(currentSession, false);
		const alerts: string[] = [];
		let openedViewId: string | undefined;

		instantiationService.set(IChatWidgetService, new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widgetState.widget;
		});
		instantiationService.set(IChatEditingService, new class extends mock<IChatEditingService>() {
			override getEditingSession() {
				return undefined;
			}
		});
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override async openView(id: string) {
				openedViewId = id;
				return {
					loadSession: async () => undefined,
				};
			}
		});
		instantiationService.set(IDialogService, new class extends mock<IDialogService>() { });
		instantiationService.set(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override readonly onDidChangeReducedMotion = Event.None;
			override readonly onDidChangeReducedTransparency = Event.None;
			override readonly onDidChangeScreenReaderOptimized = Event.None;
			override alert(message: string): void {
				alerts.push(message);
			}
		});
		instantiationService.set(IConfigurationService, new TestConfigurationService());

		const handler = CommandsRegistry.getCommand(ACTION_ID_NEW_CHAT)?.handler;
		assert.ok(handler);

		await handler(instantiationService);

		assert.strictEqual(openedViewId, undefined);
		assert.strictEqual(widgetState.state.attachmentClearCalls, 1);
		assert.strictEqual(widgetState.state.focusCalls, 1);
		assert.deepStrictEqual(alerts, ['New chat']);
	});

	test('creates a new contributed session when the current one already has requests', async () => {
		const currentSession = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-has-history' });
		const widgetState = createMockWidget(currentSession, true);
		const loadedSessions: URI[] = [];

		instantiationService.set(IChatWidgetService, new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = widgetState.widget;
		});
		instantiationService.set(IChatEditingService, new class extends mock<IChatEditingService>() {
			override getEditingSession() {
				return undefined;
			}
		});
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override async openView(id: string) {
				assert.strictEqual(id, ChatViewId);
				return {
					loadSession: async (resource: URI) => {
						loadedSessions.push(resource);
						return undefined;
					},
				};
			}
		});
		instantiationService.set(IDialogService, new class extends mock<IDialogService>() { });
		instantiationService.set(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override readonly onDidChangeReducedMotion = Event.None;
			override readonly onDidChangeReducedTransparency = Event.None;
			override readonly onDidChangeScreenReaderOptimized = Event.None;
			override alert(_message: string): void { }
		});
		instantiationService.set(IConfigurationService, new TestConfigurationService());

		const handler = CommandsRegistry.getCommand(ACTION_ID_NEW_CHAT)?.handler;
		assert.ok(handler);

		await handler(instantiationService);

		assert.strictEqual(loadedSessions.length, 1);
		assert.strictEqual(loadedSessions[0].scheme, currentSession.scheme);
		assert.ok(/^\/untitled-/.test(loadedSessions[0].path));
		assert.notStrictEqual(loadedSessions[0].path, currentSession.path);
		assert.strictEqual(widgetState.state.attachmentClearCalls, 1);
		assert.strictEqual(widgetState.state.focusCalls, 1);
	});
});

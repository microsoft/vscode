/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ACTION_ID_NEW_CHAT } from '../../../browser/actions/chatActions.js';
import { registerNewChatActions } from '../../../browser/actions/chatNewActions.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatEditor } from '../../../browser/widgetHosts/editor/chatEditor.js';
import { MockChatWidgetService } from '../widget/mockChatWidget.js';

suite('NewChatAction', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

	let actionsRegistered = false;
	function ensureActionsRegistered(): void {
		if (!actionsRegistered) {
			registerNewChatActions();
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

	function createMockWidget(viewContext: IChatWidget['viewContext']): { widget: IChatWidget; clearCalls: number; focusInputCalls: number; attachmentClearCalls: boolean[] } {
		const attachmentClearCalls: boolean[] = [];
		let clearCalls = 0;
		let focusInputCalls = 0;

		const widget = upcastPartial<IChatWidget>({
			viewContext,
			attachmentModel: {
				clear: (removeInsertedFiles: boolean) => {
					attachmentClearCalls.push(removeInsertedFiles);
				}
			} as IChatWidget['attachmentModel'],
			clear: async () => {
				clearCalls++;
			},
			focusInput: () => {
				focusInputCalls++;
			},
		});

		return {
			widget,
			get clearCalls() { return clearCalls; },
			get focusInputCalls() { return focusInputCalls; },
			attachmentClearCalls
		};
	}

	function createChatEditorPane(widget: IChatWidget): ChatEditor {
		const pane = Object.create(ChatEditor.prototype) as ChatEditor;
		(pane as unknown as { _widget: IChatWidget })._widget = widget;
		return pane;
	}

	function setCommonServices(): void {
		instantiationService.set(IAccessibilityService, upcastPartial<IAccessibilityService>({
			alert: () => { }
		}));
		instantiationService.set(IConfigurationService, new TestConfigurationService());
		instantiationService.set(IDialogService, upcastPartial<IDialogService>({}));
	}

	test('should use the active chat editor when an explicit editor position is provided', async () => {
		const fallbackWidget = createMockWidget({ viewId: ChatViewId });
		const editorWidget = createMockWidget({});

		const widgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = fallbackWidget.widget;
		};

		let openViewCalls = 0;

		setCommonServices();
		instantiationService.set(IViewsService, upcastPartial<IViewsService>({
			openView: async () => {
				openViewCalls++;
				return null;
			}
		}));
		instantiationService.set(IEditorService, upcastPartial<IEditorService>({
			activeEditorPane: createChatEditorPane(editorWidget.widget)
		}));
		instantiationService.set(IChatWidgetService, widgetService);

		const commandHandler = CommandsRegistry.getCommand(ACTION_ID_NEW_CHAT)?.handler;
		assert.ok(commandHandler, 'Command handler should be registered');

		await commandHandler(instantiationService, 'editor');

		assert.strictEqual(editorWidget.clearCalls, 1);
		assert.deepStrictEqual(editorWidget.attachmentClearCalls, [true]);
		assert.strictEqual(editorWidget.focusInputCalls, 1);
		assert.strictEqual(fallbackWidget.clearCalls, 0);
		assert.strictEqual(openViewCalls, 0);
	});

	test('should use the chat view when an explicit sidebar position is provided', async () => {
		const fallbackWidget = createMockWidget({});
		const sidebarWidget = createMockWidget({ viewId: ChatViewId });

		const widgetService = new class extends MockChatWidgetService {
			override readonly lastFocusedWidget = fallbackWidget.widget;
		};

		let openViewCalls = 0;

		setCommonServices();
		instantiationService.set(IViewsService, upcastPartial<IViewsService>({
			openView: async () => {
				openViewCalls++;
				return { widget: sidebarWidget.widget } as never;
			}
		}));
		instantiationService.set(IEditorService, upcastPartial<IEditorService>({
			activeEditorPane: createChatEditorPane(fallbackWidget.widget)
		}));
		instantiationService.set(IChatWidgetService, widgetService);

		const commandHandler = CommandsRegistry.getCommand(ACTION_ID_NEW_CHAT)?.handler;
		assert.ok(commandHandler, 'Command handler should be registered');

		await commandHandler(instantiationService, 'sidebar');

		assert.strictEqual(sidebarWidget.clearCalls, 1);
		assert.deepStrictEqual(sidebarWidget.attachmentClearCalls, [true]);
		assert.strictEqual(sidebarWidget.focusInputCalls, 1);
		assert.strictEqual(fallbackWidget.clearCalls, 0);
		assert.strictEqual(openViewCalls, 1);
	});
});

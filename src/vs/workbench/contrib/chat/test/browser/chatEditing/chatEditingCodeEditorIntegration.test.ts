/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { createCodeEditorServices } from '../../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuCreateOptions, IMenuService, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { ChatEditingCodeEditorIntegration, IDocumentDiff2 } from '../../../browser/chatEditing/chatEditingCodeEditorIntegration.js';
import { IChatEditingExplanationModelManager, IExplanationState } from '../../../browser/chatEditing/chatEditingExplanationModelManager.js';
import { IChatEditingService, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';

class TrackingMenuService extends MenuService {
	readonly activeHunkMenus = new Set<IMenu>();

	override createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu {
		const menu = super.createMenu(id, contextKeyService, options);
		if (id === MenuId.ChatEditingEditorHunk) {
			this.activeHunkMenus.add(menu);
		}
		return {
			onDidChange: menu.onDidChange,
			getActions: options => menu.getActions(options),
			dispose: () => {
				this.activeHunkMenus.delete(menu);
				menu.dispose();
			}
		};
	}
}

suite('ChatEditingCodeEditorIntegration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createIntegration() {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const completedActions: string[] = [];
		const services = new ServiceCollection(
			[ITelemetryService, new class extends NullTelemetryServiceShape {
				override publicLog2(eventName?: string, data?: { id?: string; from?: string }): void {
					if (eventName === 'workbenchActionExecuted' && data?.from === 'chatEditingEditorHunk' && data.id) {
						completedActions.push(data.id);
					}
				}
			}()],
			[IContextKeyService, disposables.add(new class extends MockContextKeyService {
				override contextMatchesRules(rules: ContextKeyExpression | undefined): boolean {
					return !rules || rules.evaluate({ getValue: key => this.getContextKeyValue(key) });
				}
			}())],
			[IEditorService, new class extends mock<IEditorService>() { }],
			[IViewsService, new class extends mock<IViewsService>() { }],
			[IChatWidgetService, new class extends mock<IChatWidgetService>() { }],
			[IChatEditingService, new class extends mock<IChatEditingService>() { }],
			[IChatEditingExplanationModelManager, new class extends mock<IChatEditingExplanationModelManager>() {
				override readonly state = constObservable(new ResourceMap<IExplanationState>());
			}],
			[IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
				override async playSignal(): Promise<void> { }
			}],
			[IContextMenuService, new class extends mock<IContextMenuService>() {
				override readonly onDidShowContextMenu = Event.None;
				override readonly onDidHideContextMenu = Event.None;
			}],
			[IActionViewItemService, new NullActionViewItemService()],
			[IStorageService, disposables.add(new InMemoryStorageService())],
		);
		const instantiationService = createCodeEditorServices(disposables, services);
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = Event.None;
			override readonly onDidExecuteCommand = Event.None;
			override async executeCommand<T>(id: string): Promise<T> {
				const command = CommandsRegistry.getCommand(id);
				assert.ok(command);
				return instantiationService.invokeFunction(command.handler) as T;
			}
		});
		const menuService = disposables.add(instantiationService.createInstance(TrackingMenuService));
		instantiationService.stub(IMenuService, menuService);
		disposables.add(MenuRegistry.appendMenuItem(MenuId.ChatEditingEditorHunk, {
			command: { id: 'test.keepHunk', title: 'Keep' }
		}));

		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		const originalModel = disposables.add(createTextModel(lines.join('\n')));
		const modifiedModel = disposables.add(createTextModel(lines.join('\n')));
		const editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, container, {
			dimension: { width: 600, height: 400 },
			useShadowDOM: false
		}, { contributions: [] }));
		editor.setModel(modifiedModel);

		const changes = [3, 8, 13].map(line => new DetailedLineRangeMapping(new LineRange(line, line + 1), new LineRange(line, line + 1), undefined));
		const diff: IDocumentDiff2 = {
			originalModel,
			modifiedModel,
			changes,
			moves: [],
			identical: false,
			quitEarly: false,
			keep: async () => true,
			undo: async () => true,
		};
		const diffInfo = observableValue('diff', diff);
		const reviewMode = observableValue('reviewMode', true);
		const entry = new class extends mock<IModifiedFileEntry>() {
			override readonly originalURI = originalModel.uri;
			override readonly modifiedURI = modifiedModel.uri;
			override readonly lastModifyingRequestId = 'request';
			override readonly state = constObservable(ModifiedFileEntryState.Modified);
			override readonly isCurrentlyBeingModifiedBy = constObservable(undefined);
			override readonly reviewMode = reviewMode;
		};
		const integration = disposables.add(instantiationService.createInstance(ChatEditingCodeEditorIntegration, entry, editor, diffInfo, false));
		return { container, editor, integration, menuService, diffInfo, diff, reviewMode, modifiedModel, completedActions };
	}

	test('owns menus only for revealed hunk toolbars', () => {
		const { editor, integration, menuService } = createIntegration();
		const menuCounts = [menuService.activeHunkMenus.size];
		for (const lineNumber of [3, 8, 1, 13, 1]) {
			editor.setPosition({ lineNumber, column: 1 });
			menuCounts.push(menuService.activeHunkMenus.size);
		}
		integration.dispose();
		menuCounts.push(menuService.activeHunkMenus.size);

		assert.deepStrictEqual(menuCounts, [0, 1, 1, 0, 1, 0, 0]);
	});

	test('preserves the visible toolbar and its focus across diff rendering', () => {
		const { container, editor, integration, diffInfo, diff } = createIntegration();
		editor.setPosition({ lineNumber: 3, column: 1 });
		editor.render(true);
		const toolbar = container.querySelector('.chat-diff-change-content-widget.hover .monaco-toolbar');
		const action = toolbar?.querySelector<HTMLElement>('.action-label');
		assert.ok(action);
		action.focus();

		for (let i = 0; i < 5; i++) {
			diffInfo.set({ ...diff }, undefined);
		}
		editor.render(true);
		const result = {
			sameToolbar: toolbar === container.querySelector('.chat-diff-change-content-widget.hover .monaco-toolbar'),
			sameFocus: mainWindow.document.activeElement === action,
		};
		integration.dispose();

		assert.deepStrictEqual(result, { sameToolbar: true, sameFocus: true });
	});

	test('releases removed and disabled toolbars and recreates them on reuse', () => {
		const { editor, integration, menuService, diffInfo, diff, reviewMode, modifiedModel } = createIntegration();
		editor.setPosition({ lineNumber: 3, column: 1 });
		const menuCounts = [menuService.activeHunkMenus.size];
		diffInfo.set({ ...diff, changes: [], identical: true }, undefined);
		menuCounts.push(menuService.activeHunkMenus.size);
		diffInfo.set(diff, undefined);
		menuCounts.push(menuService.activeHunkMenus.size);
		reviewMode.set(false, undefined);
		menuCounts.push(menuService.activeHunkMenus.size);
		reviewMode.set(true, undefined);
		menuCounts.push(menuService.activeHunkMenus.size);

		const otherModel = disposables.add(createTextModel('another file'));
		editor.setModel(otherModel);
		menuCounts.push(menuService.activeHunkMenus.size);
		editor.setModel(modifiedModel);
		editor.setPosition({ lineNumber: 3, column: 1 });
		menuCounts.push(menuService.activeHunkMenus.size);
		integration.dispose();
		editor.setPosition({ lineNumber: 8, column: 1 });
		menuCounts.push(menuService.activeHunkMenus.size);

		assert.deepStrictEqual(menuCounts, [1, 0, 1, 0, 1, 0, 1, 0]);
	});

	test('lets a resolving toolbar action report completion before disposal', async () => {
		const { container, editor, integration, menuService, diffInfo, diff, completedActions } = createIntegration();
		const commandStarted = new DeferredPromise<void>();
		const finishCommand = new DeferredPromise<void>();
		disposables.add(CommandsRegistry.registerCommand('test.keepHunk', async () => {
			diffInfo.set({ ...diff, changes: [], identical: true }, undefined);
			await commandStarted.complete();
			await finishCommand.p;
		}));
		editor.setPosition({ lineNumber: 3, column: 1 });
		editor.render(true);
		const action = container.querySelector<HTMLElement>('.chat-diff-change-content-widget.hover .action-label');
		assert.ok(action);
		action.click();
		await commandStarted.p;
		const menusWhileRunning = menuService.activeHunkMenus.size;
		await finishCommand.complete();
		await timeout(0);
		const menusAfterCompletion = menuService.activeHunkMenus.size;
		integration.dispose();

		assert.deepStrictEqual({ menusWhileRunning, menusAfterCompletion, completedActions }, {
			menusWhileRunning: 1,
			menusAfterCompletion: 0,
			completedActions: ['test.keepHunk'],
		});
	});
});

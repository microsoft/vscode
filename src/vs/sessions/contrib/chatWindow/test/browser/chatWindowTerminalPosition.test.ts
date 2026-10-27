/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ActionRunner, IAction } from '../../../../../base/common/actions.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { createEditorParts, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { computeSessionGridLayout, SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowTerminalRowContext, IChatWindow, IChatWindowKind, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { bindChatWindowContext, resolveChatWindowFromContext } from '../../browser/chatWindowService.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';
import '../../browser/chatWindowTerminalActions.js';

suite('Chat window Terminal Position', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [where, menuId, editorContext] of [['the More Actions of', MenuId.EditorTitle, false], ['the context menu of a tab of', MenuId.EditorTitleContext, true]] as const) {
		test(`from ${where} a chat window's terminals, it changes the layout of that window, not of the active one, and shows the position chosen`, async () => {
			const configurationService = new TestConfigurationService();
			const instantiationService = workbenchInstantiationService({ contextKeyService: () => disposables.add(new ContextKeyService(configurationService)) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
			instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<R>(id: string, ...args: unknown[]): Promise<R | undefined> {
					return instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, ...args)) as R | undefined;
				}
			}());
			instantiationService.stub(IMenuService, disposables.add(instantiationService.createInstance(MenuService)));
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);
			ChatContextKeys.enabled.bindTo(instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService))).set(true);

			// The terminals of a chat window, which is not the active window.
			const container = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(container);
			disposables.add({ dispose: () => container.remove() });
			const part = parts.createEditorPart({ container });
			disposables.add({ dispose: () => part.close() });
			const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };
			const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, disposables.add(new InMemoryStorageService())));
			state.setLayout(SessionLayoutMode.SideBySide);
			const partContextKeyService = parts.getScopedInstantiationService(part).invokeFunction(accessor => accessor.get(IContextKeyService));
			ChatWindowTerminalRowContext.bindTo(partContextKeyService).set(true);
			disposables.add(bindChatWindowContext(partContextKeyService, { kind, windowId: 5, hasEditorArea: true, state, session: constObservable(undefined), editorGroup: constObservable(undefined), editorAreaEditor: constObservable('') }));
			const group = part.activeGroup;

			const chatWindow = new class extends mock<IChatWindow>() {
				override readonly windowId = 5;
				override setTerminalPosition(position: SessionTerminalPosition) { state.setTerminalPosition(position); }
			}();
			instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
				override resolveWindow(context: unknown) {
					return resolveChatWindowFromContext([{ windowId: 5, parts: [part], window: chatWindow }], entry => entry.parts, context, mainWindow.vscodeWindowId)?.window;
				}
			}());

			// As the editor title toolbar of the group, or the context menu of a tab, asks for its actions: in the group's context,
			// with the resource of its editor, a terminal, as the first argument, forwarding the context of the menu after it.
			const menuService = instantiationService.invokeFunction(accessor => accessor.get(IMenuService));
			const positions = () => {
				const menu = menuService.createMenu(menuId, group.scopedContextKeyService);
				const actions = menu.getActions({ arg: URI.parse('vscode-terminal:/1/1'), shouldForwardArgs: true }).flatMap(([, groupActions]) => groupActions);
				menu.dispose();
				const submenu = actions.find((action): action is SubmenuItemAction => action instanceof SubmenuItemAction && action.label === 'Terminal Position');
				return (submenu?.actions ?? []).filter((action): action is MenuItemAction => action instanceof MenuItemAction);
			};
			const checked = (items: readonly IAction[]) => items.filter(item => item.checked).map(item => item.label);

			const before = positions();
			const shapeBefore = computeSessionGridLayout({ mode: state.layout.get(), terminalPosition: state.terminalPosition.get(), terminalsVisible: true, activityBar: true, inputOnly: false }).shapeKey;
			const underEditor = before.find(item => item.label === 'Under Editor');
			if (underEditor) {
				// The toolbar runs its actions with the group, a tab's context menu with the group and the index of the editor.
				await disposables.add(new ActionRunner()).run(underEditor, editorContext ? { groupId: group.id, editorIndex: 0 } : { groupId: group.id });
			}
			const shapeAfter = computeSessionGridLayout({ mode: state.layout.get(), terminalPosition: state.terminalPosition.get(), terminalsVisible: true, activityBar: true, inputOnly: false }).shapeKey;

			assert.deepStrictEqual({
				offered: before.map(item => item.label),
				checkedBefore: checked(before),
				position: state.terminalPosition.get(),
				layoutChanged: shapeBefore !== shapeAfter,
				checkedAfter: checked(positions()),
			}, {
				offered: ['Full Width', 'Under Editor', 'Under Chat'],
				checkedBefore: ['Full Width'],
				position: SessionTerminalPosition.UnderEditor,
				layoutChanged: true,
				checkedAfter: ['Under Editor'],
			});
		});
	}
});

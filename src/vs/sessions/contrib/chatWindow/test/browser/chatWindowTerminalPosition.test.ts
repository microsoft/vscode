/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
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
import { GroupDirection, IEditorGroupsService, IEmbeddedEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { EditorService } from '../../../../../workbench/services/editor/browser/editorService.js';
import { IEditorService, SIDE_GROUP } from '../../../../../workbench/services/editor/common/editorService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { timeout } from '../../../../../base/common/async.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { computeSessionGridLayout, SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowTerminalRowContext, IChatWindow, IChatWindowKind, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { bindChatWindowContext, createChatWindowEditorArea, createChatWindowServices, resolveChatWindowFromContext } from '../../browser/chatWindowService.js';
import { createChatWindowTerminalsPart } from '../../browser/chatWindowTerminals.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';
import '../../browser/chatWindowTerminalActions.js';

suite('Chat window Terminal Position', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const showTabs of ['multiple', 'single'] as const) {
		test(`the terminals of a chat window have no Add Tab, only the terminals' own New Terminal adds to them; the editor area keeps its Add Tab (tabs: ${showTabs})`, async () => {
			const configurationService = new TestConfigurationService({ 'workbench.editor.showTabs': showTabs });
			const instantiationService = workbenchInstantiationService({ contextKeyService: () => disposables.add(new ContextKeyService(configurationService)) }, disposables);
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
			const parts = await createEditorParts(instantiationService, disposables);
			const container = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(container);
			disposables.add({ dispose: () => container.remove() });
			const scope: ISessionScope = { _serviceBrand: undefined, session: constObservable(undefined) };
			const terminals = createChatWindowTerminalsPart(parts, append(container, $('.part.editor.chat-window-terminals')), createChatWindowServices(scope), () => undefined);
			disposables.add({ dispose: () => terminals.close() });
			const editorArea = createChatWindowEditorArea(parts, container, createChatWindowServices(scope));
			disposables.add({ dispose: () => editorArea.close() });
			const addTabs = (part: IEmbeddedEditorPart) => (part.element as HTMLElement).querySelectorAll('.tabs-bar-add-tab').length;

			assert.deepStrictEqual({ terminals: addTabs(terminals), editorArea: addTabs(editorArea) }, { terminals: 0, editorArea: 1 });
		});
	}

	for (const showTabs of ['multiple', 'single'] as const) {
		test(`the terminals of a chat window take only terminals: any other editor goes to its editor area, which shows, however it gets to them; other parts take every editor (tabs: ${showTabs})`, async () => {
			const configurationService = new TestConfigurationService({ 'workbench.editor.showTabs': showTabs });
			const instantiationService = workbenchInstantiationService({ contextKeyService: () => disposables.add(new ContextKeyService(configurationService)) }, disposables);
			instantiationService.stub(IConfigurationService, configurationService);
			disposables.add(registerTestEditor('chatWindowTerminalsOnlyEditor', [new SyncDescriptor(TestFileEditorInput)], 'chatWindowTerminalsOnlyInput'));
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);
			const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
			instantiationService.stub(IEditorService, editorService);
			const container = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(container);
			disposables.add({ dispose: () => container.remove() });
			const scope: ISessionScope = { _serviceBrand: undefined, session: constObservable(undefined) };
			const editorArea = createChatWindowEditorArea(parts, container, createChatWindowServices(scope));
			disposables.add({ dispose: () => editorArea.close() });
			let revealed = 0;
			const terminals = createChatWindowTerminalsPart(parts, append(container, $('.part.editor.chat-window-terminals')), createChatWindowServices(scope), () => {
				revealed++;
				return editorArea.activeGroup;
			});
			disposables.add({ dispose: () => terminals.close() });
			editorArea.layout(800, 400, 0, 0);
			terminals.layout(800, 200, 400, 0);
			const input = (path: string, typeId = 'chatWindowTerminalsOnlyInput') => disposables.add(new TestFileEditorInput(URI.file(path), typeId));
			const where = (editor: TestFileEditorInput) => terminals.groups.some(group => group.contains(editor)) ? 'terminals' : editorArea.groups.some(group => group.contains(editor)) ? 'editorArea' : parts.mainPart.groups.some(group => group.contains(editor)) ? 'main' : 'none';
			const pinned = { pinned: true };

			// A terminal, then with the focus in the terminals, as when a pill of the chat opens a pull request or a file.
			const terminal = input('/terminal', 'workbench.editors.terminal');
			await terminals.activeGroup.openEditor(terminal, pinned);
			terminals.activeGroup.focus();
			const fromPill = input('/pull-request');
			await editorService.openEditor(fromPill, pinned);
			terminals.activeGroup.focus();
			const toTheSide = input('/side');
			await editorService.openEditor(toTheSide, pinned, SIDE_GROUP);
			const moved = input('/moved');
			await parts.mainPart.activeGroup.openEditor(moved, pinned);
			parts.mainPart.activeGroup.moveEditor(moved, terminals.activeGroup);
			const dropped = input('/dropped');
			await editorArea.activeGroup.openEditor(dropped, pinned);
			editorArea.activeGroup.moveEditors([{ editor: dropped }], terminals.addGroup(terminals.activeGroup, GroupDirection.RIGHT));
			await timeout(0);
			const main = input('/main');
			await editorService.openEditor(main, pinned, parts.mainPart.activeGroup);

			assert.deepStrictEqual({
				terminal: where(terminal), fromPill: where(fromPill), toTheSide: where(toTheSide), moved: where(moved), dropped: where(dropped), main: where(main),
				terminalsGroups: terminals.groups.length, revealed: revealed > 0,
			}, {
				terminal: 'terminals', fromPill: 'editorArea', toTheSide: 'editorArea', moved: 'editorArea', dropped: 'editorArea', main: 'main',
				terminalsGroups: 1, revealed: true,
			});
		});
	}

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

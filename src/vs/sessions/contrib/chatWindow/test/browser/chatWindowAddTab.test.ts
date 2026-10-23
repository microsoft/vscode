/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { EmptyEditorGroupAddTab } from '../../../../browser/parts/emptyEditorGroupAddTab.js';
import { ChatWindowHasEditorAreaContext, ChatWindowSessionHasWorkspaceContext, IChatWindow, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import '../../browser/chatWindowActivityBar.js';

suite('Chat window - Add Tab watermark', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWatermark(disposables: DisposableStore, hasEditorArea: boolean, services: (instantiationService: ReturnType<typeof workbenchInstantiationService>) => void = () => { }) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IMenuService, disposables.add(new MenuService(instantiationService.get(ICommandService), instantiationService.get(IKeybindingService), instantiationService.get(IStorageService))));
		services(instantiationService);
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		ChatWindowHasEditorAreaContext.bindTo(contextKeyService).set(hasEditorArea);
		ChatWindowSessionHasWorkspaceContext.bindTo(contextKeyService).set(true);
		const element = append(mainWindow.document.body, $('.editor-group-container.empty'));
		disposables.add(toDisposable(() => element.remove()));
		disposables.add(instantiationService.createInstance(EmptyEditorGroupAddTab, {
			element,
			scopedContextKeyService: contextKeyService,
			isEmpty: true,
			onDidModelChange: Event.None,
		}, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab));
		return { element, instantiationService };
	}

	function labels(element: HTMLElement): (string | null)[] {
		return [...element.querySelectorAll('.sessions-add-tab-watermark-label')].map(label => label.textContent);
	}

	test('an empty chat window editor group lists the Add Tab entries of the main window menus, scoped to the chat window', () => {
		const disposables = store.add(new DisposableStore());
		assert.deepStrictEqual({
			withEditorArea: labels(createWatermark(disposables, true).element),
			withoutEditorArea: labels(createWatermark(disposables, false).element),
		}, {
			withEditorArea: ['Changes', 'Files', 'Browser', 'Terminal'],
			withoutEditorArea: [],
		});
	});

	test('the Changes entry opens in the editor group of the chat window for its session', async () => {
		const disposables = store.add(new DisposableStore());
		const session = URI.parse('test://session/one');
		const editorGroup = new class extends mock<IEditorGroup>() {
			override get count() { return 0; }
			override findEditors() { return []; }
		}();
		const opened: unknown[] = [];
		const { instantiationService } = createWatermark(disposables, true, services => {
			services.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
				override getActiveWindow() {
					return new class extends mock<IChatWindow>() {
						override readonly editorGroup = editorGroup;
						override readonly session = observableValue('session', { resource: session } as never);
						override showEditor() { }
					}();
				}
			}());
			services.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
				override getChangesEditorResource(resource: URI) { return resource; }
				override async openChangesEditor(resource: URI, _options?: unknown, group?: unknown) { opened.push([resource, group]); return undefined; }
			}());
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('sessions.chatWindow.openChanges')!.handler(accessor));

		assert.deepStrictEqual(opened, [[session, editorGroup]]);
	});

	test('the Terminal entry shows the terminal row, or adds a terminal to a row that has some', async () => {
		const disposables = store.add(new DisposableStore());
		const calls: unknown[] = [];
		const terminal: { row?: IEditorGroup } = {};
		const { instantiationService } = createWatermark(disposables, true, services => {
			services.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
				override getActiveWindow() {
					return new class extends mock<IChatWindow>() {
						override readonly terminalGroup = { get: () => terminal.row } as never;
						override async setTerminalShown(shown: boolean) { calls.push(['show', shown]); }
					}();
				}
			}());
			services.stub(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand(id: string, ...args: unknown[]) { calls.push([id, ...args]); return undefined; }
			}());
		});
		const run = () => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('sessions.chatWindow.addTerminal')!.handler(accessor));

		await run();
		terminal.row = new class extends mock<IEditorGroup>() {
			override readonly id = 7;
			override get isEmpty() { return false; }
		}();
		await run();

		assert.deepStrictEqual(calls, [['show', true], ['sessions.chatWindow.newTerminal', { groupId: 7 }]]);
	});
});

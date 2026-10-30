/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IsAuxiliaryWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { SessionLayoutMode } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorPane } from '../../../../../workbench/common/editor.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { ChatWindowContext, ChatWindowHasEditorAreaContext, ChatWindowSessionHasWorkspaceContext, ChatWindowTerminalRowContext, IChatWindow, IChatWindowService, isChatWindowHandle } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { resolveSessionActionTarget } from '../../../../services/sessions/browser/sessionActionTarget.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID, chatWindowTabEntries } from '../../browser/chatWindowEditorArea.js';
import '../../../sessions/browser/sessionsActions.js';
import '../../../../browser/actions/vscodeActions.js';
import '../../../chat/browser/runScriptAction.js';

function evaluate(expression: ContextKeyExpression | undefined, values: Record<string, ContextKeyValue>): boolean {
	return expression?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false;
}

suite('Chat window editor area', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindow(windowId: number, opened: string[]): IChatWindow {
		const session = { sessionId: `session-${windowId}`, resource: URI.parse(`test:/session-${windowId}`), scopedChatResource: URI.parse(`test:/chat-${windowId}`) } as IActiveSession;
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = windowId * 10;
			override readonly count = 0;
			override findEditors() { return []; }
		}();
		return new class extends mock<IChatWindow>() {
			override readonly windowId = windowId;
			override readonly session = observableValue<IActiveSession | undefined>('session', session);
			override readonly editorGroup = group;
			override showEditor() { opened.push(`${windowId}:showEditor`); }
		}();
	}

	test('an empty editor area has one close button: in a chat window, its own, which shows only the chat of the window it is in; in the main window, as before', async () => {
		const closes = (values: Record<string, ContextKeyValue>) => [MenuId.EmptyEditorGroup, MenuId.EditorGroupWatermarkToolbar].flatMap(menu => MenuRegistry.getMenuItems(menu)
			.filter(item => isIMenuItem(item) && evaluate(item.when, values))
			.map(item => isIMenuItem(item) ? item.command.id : ''))
			.filter(id => /close/i.test(id));
		const chatWindow = { isSessionsWindow: true, isAuxiliaryWindow: true, editorPartEmbedded: true, [ChatContextKeys.enabled.key]: true, [ChatWindowHasEditorAreaContext.key]: true, [ChatWindowContext.key]: 'chat' };
		const shown = {
			chatWindow: closes(chatWindow),
			chatWindowSeveralGroups: closes({ ...chatWindow, editorPartMultipleEditorGroups: true }),
			chatWindowTerminals: closes({ ...chatWindow, [ChatWindowTerminalRowContext.key]: true }),
			mainWindow: closes({ isSessionsWindow: true, [ChatContextKeys.enabled.key]: true }),
		};
		const layouts: string[] = [];
		const windows = [1, 2].map(windowId => new class extends mock<IChatWindow>() {
			override readonly windowId = windowId;
			override readonly layout = observableValue('layout', SessionLayoutMode.SideBySide);
			override readonly layouts = [SessionLayoutMode.ChatOnly, SessionLayoutMode.EditorOnly, SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide];
			override setLayout(layout: SessionLayoutMode) { layouts.push(`${windowId}:${layout}`); }
		}());
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override resolveWindow(context: unknown) { return (context as { groupId?: number } | undefined)?.groupId === 20 ? windows[1] : windows[0]; }
		}());
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID)!.handler(accessor, { groupId: 20 }));

		assert.deepStrictEqual({ shown, layouts }, {
			shown: {
				chatWindow: [CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID],
				chatWindowSeveralGroups: [],
				chatWindowTerminals: [],
				mainWindow: ['sessions.closeEditorArea'],
			},
			layouts: [`2:${SessionLayoutMode.ChatOnly}`],
		});
	});

	test('the tab entries of the Session Activity Bar and of Add Tab act on the chat window they are invoked from', async () => {
		const opened: string[] = [];
		const windows = [createWindow(1, opened), createWindow(2, opened)];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override resolveWindow(context: unknown) {
				return isChatWindowHandle(context) ? windows.find(window => window.windowId === context.chatWindowId) : windows[0];
			}
		}());
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override getChangesEditorResource(resource: URI) { return resource; }
			override async openChangesEditor(resource: URI, options: ISessionChangesEditorOptions | undefined, group: IEditorGroup) {
				opened.push(`changes:${resource.path}:${options?.chatResource?.path}:${(group as IEditorGroup).id}`);
				return group as IEditorGroup;
			}
		}());
		const changes = chatWindowTabEntries.find(entry => entry.id === 'sessions.chatWindow.openChanges')!;
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(changes.id)!.handler(accessor, { chatWindowId: 2 }));
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(changes.id)!.handler(accessor));
		assert.deepStrictEqual(opened, ['2:showEditor', 'changes:/session-2:/chat-2:20', '1:showEditor', 'changes:/session-1:/chat-1:10']);
	});

	test('the Browser entry opens a browser in the editor area of its chat window and focuses its URL input', async () => {
		const opened: string[] = [];
		const window = createWindow(3, opened);
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 30;
			override getEditors() { return []; }
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override resolveWindow() {
				return new class extends mock<IChatWindow>() {
					override readonly editorGroup = group;
					override showEditor() { window.showEditor(); }
				}();
			}
		}());
		instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
			override getOrCreateLazy() { return { url: undefined } as unknown as BrowserEditorInput; }
		}());
		const openEditor = async (_editor: unknown, _options: unknown, target: IEditorGroup) => {
			opened.push(`browser:${target.id}`);
			return { getId: () => 'pane' } as unknown as IEditorPane;
		};
		instantiationService.stub(IEditorService, { openEditor: openEditor as unknown as IEditorService['openEditor'] });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<R>(id: string): Promise<R> { opened.push(id); return undefined as R; }
		}());
		const browser = chatWindowTabEntries.find(entry => entry.id === 'sessions.chatWindow.openBrowser')!;
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(browser.id)!.handler(accessor, { chatWindowId: 3 }));
		assert.deepStrictEqual(opened, ['3:showEditor', 'browser:30', BrowserViewCommandId.FocusUrlInput]);
	});

	test('the tab entries show in chat windows only, and Changes and Files need a session with a workspace', () => {
		const shown = (values: Record<string, ContextKeyValue>) => [Menus.SessionActivityBar, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab].map(menu =>
			MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter(item => chatWindowTabEntries.some(entry => entry.id === item.command.id) && evaluate(item.when, values)).map(item => item.command.id).sort());
		const chatWindow = { [ChatContextKeys.enabled.key]: true, [ChatWindowHasEditorAreaContext.key]: true };
		const ids = (...names: string[]) => names.map(name => `sessions.chatWindow.open${name}`).sort();
		assert.deepStrictEqual({
			mainWindow: shown({ [ChatContextKeys.enabled.key]: true }),
			withoutWorkspace: shown(chatWindow),
			withWorkspace: shown({ ...chatWindow, [ChatWindowSessionHasWorkspaceContext.key]: true }),
		}, {
			mainWindow: [[], [], []],
			withoutWorkspace: [ids('Browser'), ids('Browser'), ids('Browser')],
			withWorkspace: [ids('Browser', 'Changes', 'Files'), ids('Browser', 'Changes', 'Files'), ids('Browser', 'Changes', 'Files')],
		});
	});

	test('Run and Open in VS Code show in the main window and in chat windows with a workspace, as before in editor windows', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarCenterRight);
		const visible = (values: Record<string, ContextKeyValue>) => items.filter(item => evaluate(item.when, { [SessionsWelcomeVisibleContext.key]: false, ...values })).length;
		const mainWindow = visible({});
		assert.deepStrictEqual({
			editorWindow: visible({ [IsAuxiliaryWindowContext.key]: true }),
			chatWindowWithWorkspace: visible({ [IsAuxiliaryWindowContext.key]: true, [ChatWindowSessionHasWorkspaceContext.key]: true }) === mainWindow,
			mainWindowHasThem: mainWindow > 0,
		}, { editorWindow: 0, chatWindowWithWorkspace: true, mainWindowHasThem: true });
	});

	test('session actions invoked from a chat window act on the session of that window', () => {
		const windowSession = { sessionId: 'window', resource: URI.parse('test:/window') } as IActiveSession;
		const activeSession = { sessionId: 'active', resource: URI.parse('test:/active') } as IActiveSession;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override getWindow(windowId: number) {
				return windowId === 3 ? new class extends mock<IChatWindow>() { override readonly session = observableValue<IActiveSession | undefined>('session', windowSession); }() : undefined;
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>('active', activeSession);
		}());
		const resolve = (arg?: unknown) => instantiationService.invokeFunction(accessor => resolveSessionActionTarget(accessor, arg))?.sessionId;
		assert.deepStrictEqual([resolve({ chatWindowId: 3 }), resolve()], ['window', 'active']);
	});
});

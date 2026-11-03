/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, LayoutModeContext } from '../../../../../workbench/common/contextkeys.js';
import { IEditorPane } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { IContentPart, IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../../browser/menus.js';
import { IsQuickChatSessionContext, SessionHasWorkspaceContext, SessionsWelcomeVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID, chatWindowTabEntries } from '../../browser/chatWindowActions.js';
import '../../../sessions/browser/sessionsActions.js';
import '../../../../browser/actions/vscodeActions.js';
import '../../../chat/browser/runScriptAction.js';

function evaluate(expression: ContextKeyExpression | undefined, values: Record<string, ContextKeyValue>): boolean {
	return expression?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false;
}

suite('Chat window editor area', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** The keys of a chat window: an auxiliary window of the Agents window with layout modes. */
	const chatWindowKeys = { [IsSessionsWindowContext.key]: true, [IsAuxiliaryWindowContext.key]: true, [ChatContextKeys.enabled.key]: true, [LayoutModeContext.key]: ChatWindowLayoutMode.SideBySide };

	function createWindow(windowId: number, events: string[], editors: EditorInput[] = []): IChatWindow {
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = windowId * 10;
			override readonly count = editors.length;
			override findEditors() { return []; }
			override getEditors() { return editors; }
			override async openEditor(editor: EditorInput) { events.push(`activate:${editor.resource?.path}`); return undefined; }
		}();
		const mainPart = new class extends mock<IContentPart>() {
			override readonly activeGroup = group;
		}();
		return new class extends mock<IChatWindow>() {
			override readonly windowId = windowId;
			override readonly mainPart = mainPart;
			override readonly layoutMode = constObservable(ChatWindowLayoutMode.SideBySide);
			override setLayoutMode(mode: ChatWindowLayoutMode) { events.push(`${windowId}:${mode}`); }
			override showEditor() { events.push(`${windowId}:showEditor`); }
		}();
	}

	function createInstantiationService(activeWindow: IChatWindow | undefined, session?: IActiveSession): TestInstantiationService {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override get activeWindow() { return activeWindow; }
		}());
		// The window acts on the session of its own scope, whichever session is active.
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>('active', undefined);
		}());
		const windowScope = disposables.add(instantiationService.createChild(new ServiceCollection([ISessionScope, new class extends mock<ISessionScope>() {
			override readonly session = constObservable(session);
		}()])));
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override getScopedInstantiationService() { return windowScope; }
		}());
		return instantiationService;
	}

	test('an empty main part has one close button: in a chat window, its own, which shows only the chat of the window that has focus; in the main window, as before', async () => {
		const closes = (values: Record<string, ContextKeyValue>) => [MenuId.EmptyEditorGroup, MenuId.EditorGroupWatermarkToolbar].flatMap(menu => MenuRegistry.getMenuItems(menu)
			.filter(item => isIMenuItem(item) && evaluate(item.when, values))
			.map(item => isIMenuItem(item) ? item.command.id : ''))
			.filter(id => /close/i.test(id));
		const shown = {
			chatWindow: closes(chatWindowKeys),
			chatWindowSeveralGroups: closes({ ...chatWindowKeys, editorPartMultipleEditorGroups: true }),
			mainWindow: closes({ [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true }),
		};
		const events: string[] = [];
		const instantiationService = createInstantiationService(createWindow(2, events));
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID)!.handler(accessor));

		assert.deepStrictEqual({ shown, events }, {
			shown: {
				chatWindow: [CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID],
				chatWindowSeveralGroups: [],
				mainWindow: ['sessions.closeEditorArea'],
			},
			events: [`2:${ChatWindowLayoutMode.ChatOnly}`],
		});
	});

	test('the tab entries of the Session Activity Bar and of Add Tab act on the chat window that has focus, and its session', async () => {
		const events: string[] = [];
		const session = { sessionId: 'session-2', resource: URI.parse('test:/session-2'), scopedChatResource: URI.parse('test:/chat-2') } as IActiveSession;
		const instantiationService = createInstantiationService(createWindow(2, events), session);
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override getChangesEditorResource(resource: URI) { return resource; }
			override async openChangesEditor(resource: URI, options: ISessionChangesEditorOptions | undefined, group: IEditorGroup) {
				events.push(`changes:${resource.path}:${options?.chatResource?.path}:${group.id}`);
				return group;
			}
		}());
		const changes = chatWindowTabEntries.find(entry => entry.id === 'sessions.chatWindow.openChanges')!;
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(changes.id)!.handler(accessor));
		const withoutWindow = createInstantiationService(undefined, session);
		await withoutWindow.invokeFunction(accessor => CommandsRegistry.getCommand(changes.id)!.handler(accessor));

		assert.deepStrictEqual(events, ['2:showEditor', 'changes:/session-2:/chat-2:20']);
	});

	test('the Changes entry activates a Changes tab of the session the main part shows, such as one that moved in with the chat or was restored, rather than opening another', async () => {
		const events: string[] = [];
		const session = { sessionId: 'session-2', resource: URI.parse('test:/session-2'), scopedChatResource: URI.parse('test:/chat-2') } as IActiveSession;
		// Of the session, not of its chat, and of another session.
		const ofSession = new class extends mock<EditorInput>() { override readonly typeId = 'changes'; override readonly resource = URI.parse('changes:/session-2'); }();
		const ofOther = new class extends mock<EditorInput>() { override readonly typeId = 'changes'; override readonly resource = URI.parse('changes:/other'); }();
		const instantiationService = createInstantiationService(createWindow(2, events, [ofOther, ofSession]), session);
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override getSessionResource(resource: URI) { return resource.scheme === 'changes' ? URI.parse(`test:${resource.path}`) : undefined; }
			override async openChangesEditor(resource: URI) {
				events.push(`changes:${resource.path}`);
				return undefined;
			}
		}());
		const changes = chatWindowTabEntries.find(entry => entry.id === 'sessions.chatWindow.openChanges')!;
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(changes.id)!.handler(accessor));

		assert.deepStrictEqual(events, ['2:showEditor', 'activate:/session-2']);
	});

	test('the Browser entry opens a browser in the main part of its chat window and focuses its URL input', async () => {
		const events: string[] = [];
		const instantiationService = createInstantiationService(createWindow(3, events));
		instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
			override getOrCreateLazy() { return { url: undefined } as unknown as BrowserEditorInput; }
		}());
		const openEditor = async (_editor: unknown, _options: unknown, target: IEditorGroup) => {
			events.push(`browser:${target.id}`);
			return { getId: () => 'pane' } as unknown as IEditorPane;
		};
		instantiationService.stub(IEditorService, { openEditor: openEditor as unknown as IEditorService['openEditor'] });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<R>(id: string): Promise<R> { events.push(id); return undefined as R; }
		}());
		const browser = chatWindowTabEntries.find(entry => entry.id === 'sessions.chatWindow.openBrowser')!;
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(browser.id)!.handler(accessor));

		assert.deepStrictEqual(events, ['3:showEditor', 'browser:30', BrowserViewCommandId.FocusUrlInput]);
	});

	test('the tab entries show in windows with layout modes only, and Changes and Files need a session with a workspace', () => {
		const shown = (values: Record<string, ContextKeyValue>) => [Menus.SessionActivityBar, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab].map(menu =>
			MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter(item => chatWindowTabEntries.some(entry => entry.id === item.command.id) && evaluate(item.when, values)).map(item => item.command.id).sort());
		const ids = (...names: string[]) => names.map(name => `sessions.chatWindow.open${name}`).sort();
		assert.deepStrictEqual({
			mainWindow: shown({ [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: true }),
			withoutWorkspace: shown(chatWindowKeys),
			quickChat: shown({ ...chatWindowKeys, [SessionHasWorkspaceContext.key]: true, [IsQuickChatSessionContext.key]: true }),
			withWorkspace: shown({ ...chatWindowKeys, [SessionHasWorkspaceContext.key]: true }),
		}, {
			mainWindow: [[], [], []],
			withoutWorkspace: [ids('Browser'), ids('Browser'), ids('Browser')],
			quickChat: [ids('Browser'), ids('Browser'), ids('Browser')],
			withWorkspace: [ids('Browser', 'Changes', 'Files'), ids('Browser', 'Changes', 'Files'), ids('Browser', 'Changes', 'Files')],
		});
	});

	test('Run and Open in VS Code show in the main window and in every chat window, as the main window\'s rule says, and not in editor windows', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarCenterRight);
		const visible = (values: Record<string, ContextKeyValue>) => items.filter(item => evaluate(item.when, { [SessionsWelcomeVisibleContext.key]: false, ...values })).length;
		const mainWindow = visible({});
		const chatWindow = { [IsAuxiliaryWindowContext.key]: true, [LayoutModeContext.key]: 'sideBySide' };
		assert.deepStrictEqual({
			editorWindow: visible({ [IsAuxiliaryWindowContext.key]: true }),
			chatWindowWithWorkspace: visible({ ...chatWindow, [SessionHasWorkspaceContext.key]: true }) === mainWindow,
			chatWindowQuickChat: visible({ ...chatWindow, [IsQuickChatSessionContext.key]: true }) === mainWindow,
			mainWindowHasThem: mainWindow > 0,
		}, { editorWindow: 0, chatWindowWithWorkspace: true, chatWindowQuickChat: true, mainWindowHasThem: true });
	});

});

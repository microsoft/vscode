/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';

// Side-effect import to trigger module-level menu registrations.
// Only import runScriptAction which registers the Run dropdown submenu;
// avoid chat.contribution.js and sessionsTerminalContribution.js which
// bootstrap heavy workbench contributions and leak disposables from
// KeybindingsRegistry in this lightweight test context.
import { RunScriptContribution, RunScriptDropdownMenuId, WindowScopedCache } from '../../browser/runScriptAction.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsTasksService, ISessionTaskWithTarget } from '../../browser/sessionsTasksService.js';

const titleBarCenterRightMenu = MenuId.for('SessionsTitleBarCenterRight');

suite('RunScriptContribution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes run dropdown to TitleBarCenterRight before Open in VS Code', () => {
		const items = MenuRegistry.getMenuItems(titleBarCenterRightMenu);

		const runAction = items.find(item => isISubmenuItem(item) && item.submenu.id === 'AgentSessionsRunScriptDropdown');

		assert.ok(runAction, 'run dropdown should be contributed to TitleBarCenterRight');
		assert.strictEqual(runAction.order, 6);
	});

	test('window run states are created once per window and disposed when the window closes', () => {
		const keys = observableValue<readonly string[]>('keys', ['a', 'b']);
		const disposed: string[] = [];
		let created = 0;
		const cache = new WindowScopedCache<string, object>(keys, (key, store) => {
			created++;
			store.add(toDisposable(() => disposed.push(key)));
			return {};
		});

		const first = cache.get('a');
		const again = cache.get('a');
		cache.get('b');
		keys.set(['b'], undefined);

		assert.deepStrictEqual({ same: first === again, created, disposed }, { same: true, created: 2, disposed: ['a'] });

		cache.dispose();
		assert.deepStrictEqual(disposed, ['a', 'b']);
	});

	test('the dropdown\'s configure actions are registered once, statically: switching between sessions with different tasks leaves every menu alone', () => {
		const store = new DisposableStore();
		const workspace = (workingDirectory: URI | undefined) => ({ folders: [{ root: URI.file('/r'), workingDirectory }] });
		const makeSession = (workingDirectory: URI | undefined) => ({ activeChat: constObservable({ workspace: constObservable(workspace(workingDirectory)) }) }) as unknown as IActiveSession;
		const withTasks = makeSession(URI.file('/r'));
		const withoutTasks = makeSession(undefined);
		const active = observableValue<IActiveSession | undefined>('active', withTasks);
		const tasksOf = (session: IActiveSession) => session === withTasks ? [{ task: { label: 'build', type: 'shell' }, target: 'workspace' }] as unknown as readonly ISessionTaskWithTarget[] : [];
		const contextKeyService = store.add(new MockContextKeyService());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() { });
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { override activeSession = active; });
		instantiationService.stub(ISessionsTasksService, new class extends mock<ISessionsTasksService>() {
			override getSessionTasks(chat: ISession | IChat) { return constObservable(tasksOf(chat === withTasks.activeChat.get() ? withTasks : withoutTasks)); }
			override getPinnedTaskLabel() { return constObservable(undefined); }
			override getBrowserUrl() { return constObservable(undefined); }
			override getPinnedBrowser() { return constObservable(false); }
		});
		instantiationService.stub(IActionViewItemService, new class extends mock<IActionViewItemService>() { override register() { return toDisposable(() => { }); } });
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() { override windows = constObservable([]); });
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { });
		instantiationService.stub(IContextKeyService, contextKeyService);
		const menuChanges: string[] = [];
		store.add(MenuRegistry.onDidChangeMenu(() => menuChanges.push('changed')));
		const dropdownItems = () => MenuRegistry.getMenuItems(RunScriptDropdownMenuId).filter(isIMenuItem).map(item => ({ id: item.command.id, group: item.group, order: item.order, when: item.when?.serialize() }));

		store.add(instantiationService.createInstance(RunScriptContribution));
		const initialChanges = menuChanges.length;
		const before = dropdownItems();
		active.set(withoutTasks, undefined);
		active.set(withTasks, undefined);
		active.set(withoutTasks, undefined);
		active.set(withTasks, undefined);

		assert.deepStrictEqual({ items: before, same: dropdownItems(), menuChangesAfterSwitching: menuChanges.length - initialChanges }, {
			items: [
				{ id: 'workbench.action.agentSessions.configureDefaultRunAction', group: '1_configure', order: 0, when: undefined },
				{ id: 'workbench.action.agentSessions.generateRunAction', group: '1_configure', order: 1, when: undefined },
			],
			same: before,
			menuChangesAfterSwitching: 0,
		});
		store.dispose();
	});
});

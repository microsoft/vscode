/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatAgentHostNewWorktreeSelected, ChatAgentHostNewWorktreeToggleVisible, createNewWorktreeCheckboxViewItem, ToggleAgentHostNewWorktreeAction } from '../../../../browser/agentSessions/agentHost/agentHostNewWorktreeToggle.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('Agent host New Worktree checkbox', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders in the chat input toolbar as a checkbox with its name, checked as the session is to work in a new worktree, toggled by click and keyboard, disabled once the session started', async () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		const configuration = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true });
		instantiation.stub(IConfigurationService, configuration);
		const context = store.add(instantiation.createInstance(ContextKeyService));
		instantiation.stub(IContextKeyService, context);
		const runs: unknown[] = [];
		instantiation.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { runs.push([id, ...args]); return undefined; } }));
		instantiation.stub(IMenuService, store.add(instantiation.createInstance(MenuService)));
		// A local agent host's new chat in a window with a single local folder, which has no worktrees
		context.createKey(ChatContextKeys.enabled.key, true);
		context.createKey(ChatContextKeys.chatIsAgentHostSession.key, true);
		context.createKey(ChatContextKeys.chatSessionType.key, SessionType.AgentHostCopilot);
		const sessionIsEmpty = context.createKey<boolean>(ChatContextKeys.chatSessionIsEmpty.key, true);
		context.createKey('workbenchState', 'folder');
		context.createKey('remoteName', '');
		context.createKey(ChatAgentHostNewWorktreeToggleVisible.key, true);
		const selected = context.createKey<boolean>(ChatAgentHostNewWorktreeSelected.key, false);
		const root = append(mainWindow.document.body, $('div'));
		store.add({ dispose: () => root.remove() });
		const toolbar = store.add(instantiation.createInstance(MenuWorkbenchToolBar, root, MenuId.ChatInputSecondary, {
			eventDebounceDelay: 0,
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action, options) => createNewWorktreeCheckboxViewItem(action, options),
		}));
		const widget = { name: 'the chat widget' };
		toolbar.context = { widget };
		const item = () => root.querySelector<HTMLElement>('.checkbox-action-item');
		const checkbox = () => item()?.querySelector<HTMLElement>('.monaco-custom-toggle');
		const state = () => ({ glyph: checkbox()?.classList.contains('codicon-worktree'), label: item()?.querySelector('.checkbox-label')?.textContent, role: checkbox()?.getAttribute('role'), checked: checkbox()?.getAttribute('aria-checked'), disabled: item()?.classList.contains('disabled') });
		const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

		const unchecked = state();
		checkbox()!.click();
		await settle();
		selected.set(true);
		await settle();
		const checked = state();
		checkbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true }));
		await settle();
		sessionIsEmpty.set(false);
		await settle();

		assert.deepStrictEqual({ unchecked, checked, started: state(), runs: runs.map(run => (run as unknown[])[0]), context: (runs[0] as unknown[])[1] }, {
			unchecked: { glyph: false, label: 'New Worktree', role: 'checkbox', checked: 'false', disabled: false },
			checked: { glyph: false, label: 'New Worktree', role: 'checkbox', checked: 'true', disabled: false },
			started: { glyph: false, label: 'New Worktree', role: 'checkbox', checked: 'true', disabled: true },
			runs: [ToggleAgentHostNewWorktreeAction.ID, ToggleAgentHostNewWorktreeAction.ID],
			context: { widget },
		});
	});
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { OPEN_AGENT_PROJECT_BOARD_COMMAND_ID } from '../../../../../platform/window/common/window.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ChatEditorInput } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILifecycleService, LifecyclePhase } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IProjectBoardService } from '../../browser/projectBoardService.js';
import { KanbanCustomView, KanbanCustomViewContribution } from '../../browser/kanbanView.js';
import { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { KANBAN_ADD_COLUMN_COMMAND_ID, KANBAN_ADD_ROW_COMMAND_ID, KANBAN_CUSTOM_VIEW_ID, KANBAN_NEW_SESSION_COMMAND_ID, KANBAN_TOGGLE_ARCHIVED_COMMAND_ID } from '../../../../common/projectBoard.js';
import { Menus } from '../../../../browser/menus.js';
import '../../browser/projectBoard.contribution.js';

suite('Project Board Agents routing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('PB-05 Escape is scoped to standalone chats and yields to input selections and find', async () => {
		const id = 'workbench.action.agentProjectBoard.closeSession';
		const binding = KeybindingsRegistry.getDefaultKeybindings().find(binding => binding.command === id)!;
		assert.ok(binding);
		const chord = binding.keybinding?.chords[0];
		assert.ok(chord instanceof KeyCodeChord);
		assert.strictEqual(chord.keyCode, KeyCode.Escape);
		const context = new Context(0, null);
		context.setValue(IsSessionsWindowContext.key, true);
		context.setValue(IsAuxiliaryWindowContext.key, true);
		context.setValue(ActiveEditorContext.key, ChatEditorInput.EditorID);
		assert.strictEqual(binding.when?.evaluate(context), true);
		for (const [key, value] of [
			[IsSessionsWindowContext.key, false],
			[IsAuxiliaryWindowContext.key, false],
			[ActiveEditorContext.key, 'workbench.editors.text'],
			[EditorContextKeys.hasNonEmptySelection.key, true],
			[EditorContextKeys.hasMultipleSelections.key, true],
			[ChatContextKeys.findWidgetVisible.key, true],
		] as const) {
			const previous = context.getValue(key);
			context.setValue(key, value);
			assert.strictEqual(binding.when?.evaluate(context), false, key);
			context.setValue(key, previous);
		}
		const instantiationService = store.add(new TestInstantiationService());
		let closed = 0;
		instantiationService.stub(IProjectBoardService, upcastPartial<IProjectBoardService>({ closeSession: async () => { closed++; } }));
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));
		assert.strictEqual(closed, 1);
	});

	test('PB-06: forwarded command waits for restore before opening the existing profile board', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const restored = new DeferredPromise<void>();
		const phases: LifecyclePhase[] = [];
		let opens = 0;
		instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({
			when: phase => { phases.push(phase); return restored.p; },
		}));
		instantiationService.stub(IProjectBoardService, upcastPartial<IProjectBoardService>({
			open: async () => { opens++; },
		}));
		const command = CommandsRegistry.getCommand(OPEN_AGENT_PROJECT_BOARD_COMMAND_ID)!;

		const opening = instantiationService.invokeFunction(accessor => command.handler(accessor));
		assert.deepStrictEqual({ phases, opens }, { phases: [LifecyclePhase.Restored], opens: 0 });
		await restored.complete();
		await opening;
		assert.strictEqual(opens, 1);
	});

	test('PB-06: one Agents palette entry, gated by AI and the Agents window context', () => {
		const entries = MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(item => isIMenuItem(item) && item.command.id === OPEN_AGENT_PROJECT_BOARD_COMMAND_ID);
		assert.strictEqual(entries.length, 1);
		const entry = entries[0];
		assert.ok(isIMenuItem(entry));
		assert.strictEqual(typeof entry.command.title === 'string' ? entry.command.title : entry.command.title.value, 'Agents: Open Agents Hub');
		for (const [aiEnabled, isSessions, expected] of [
			[true, true, true],
			[false, true, false],
			[true, false, false],
			[false, false, false],
		]) {
			const context = new Context(0, null);
			context.setValue(ChatContextKeys.enabled.key, aiEnabled);
			context.setValue(IsSessionsWindowContext.key, isSessions);
			assert.strictEqual(entry.command.precondition?.evaluate(context), expected);
		}
	});

	test('registers Agents Hub with the existing restorable custom view ID', () => {
		const instantiationService = store.add(new TestInstantiationService());
		let registered: ICustomViewDescriptor | undefined;
		let primaryActionId: string | undefined;
		instantiationService.stub(ICustomViewService, upcastPartial<ICustomViewService>({
			activeCustomView: constObservable(undefined),
			registerCustomView: descriptor => {
				registered = descriptor;
				return { dispose() { } };
			},
		}));
		instantiationService.stub(IActionViewItemService, upcastPartial<IActionViewItemService>({
			register: (_menu, commandId) => {
				primaryActionId = commandId instanceof MenuId ? commandId.id : commandId;
				return { dispose() { } };
			},
		}));
		store.add(instantiationService.createInstance(KanbanCustomViewContribution));
		instantiationService.stub(IProjectBoardService, upcastPartial<IProjectBoardService>({}));
		instantiationService.stub(IContextKeyService, upcastPartial<IContextKeyService>({}));
		const view = store.add(instantiationService.createInstance(KanbanCustomView));
		assert.strictEqual(view.title.get(), 'Agents Hub');
		assert.strictEqual(KANBAN_CUSTOM_VIEW_ID, 'sessions.customView.kanban');

		assert.deepStrictEqual({
			id: registered?.id,
			hasConstructor: !!registered?.ctor,
			actions: registered?.actions,
			primaryActionId,
			horizontalScrolling: registered?.horizontalScrolling,
		}, {
			id: KANBAN_CUSTOM_VIEW_ID,
			hasConstructor: true,
			actions: { style: 'buttonBar', menuId: Menus.CustomViewKanban },
			primaryActionId: KANBAN_NEW_SESSION_COMMAND_ID,
			horizontalScrolling: true,
		});
	});

	test('contributes Kanban header buttons and settings menu in display order', () => {
		const headerItems = MenuRegistry.getMenuItems(Menus.CustomViewKanban);
		const actions = headerItems.filter(isIMenuItem).map(item => ({
			id: item.command.id,
			group: item.group,
			order: item.order,
		}));
		const settings = headerItems.find(isISubmenuItem);
		const settingActions = MenuRegistry.getMenuItems(Menus.CustomViewKanbanSettings)
			.filter(isIMenuItem)
			.map(item => item.command.id);

		assert.deepStrictEqual({
			actions,
			settings: settings && {
				menu: settings.submenu,
				icon: settings.icon,
				group: settings.group,
				order: settings.order,
			},
			settingActions,
		}, {
			actions: [
				{ id: KANBAN_ADD_ROW_COMMAND_ID, group: 'navigation', order: 1 },
				{ id: KANBAN_ADD_COLUMN_COMMAND_ID, group: 'navigation', order: 2 },
				{ id: KANBAN_TOGGLE_ARCHIVED_COMMAND_ID, group: 'navigation', order: 3 },
				{ id: KANBAN_NEW_SESSION_COMMAND_ID, group: 'navigation', order: 4 },
			],
			settings: {
				menu: Menus.CustomViewKanbanSettings,
				icon: Codicon.settingsGear,
				group: 'navigation',
				order: 5,
			},
			settingActions: [
				'projectBoard.settings.autoIncludeSessions',
				'projectBoard.settings.stateDuration',
				'projectBoard.settings.credits',
				'projectBoard.settings.lastPrompt',
				'projectBoard.settings.modelDetails',
				'projectBoard.settings.permissionDetails',
			],
		});
	});

	test('routes Kanban header actions to the embedded project board', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		instantiationService.stub(IProjectBoardService, upcastPartial<IProjectBoardService>({
			addAxis: async kind => { calls.push(`add:${kind}`); },
			toggleArchived: () => { calls.push('archived'); },
			createSession: async () => { calls.push('session'); },
			toggleAutoIncludeSessions: () => { calls.push('autoInclude'); },
			toggleDisplayOption: key => { calls.push(`display:${key}`); },
		}));

		for (const id of [
			KANBAN_ADD_ROW_COMMAND_ID,
			KANBAN_ADD_COLUMN_COMMAND_ID,
			KANBAN_TOGGLE_ARCHIVED_COMMAND_ID,
			KANBAN_NEW_SESSION_COMMAND_ID,
			'projectBoard.settings.autoIncludeSessions',
			'projectBoard.settings.credits',
		]) {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));
		}

		assert.deepStrictEqual(calls, ['add:row', 'add:column', 'archived', 'session', 'autoInclude', 'display:showCredits']);
	});
});

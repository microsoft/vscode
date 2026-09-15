/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
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
import { KanbanCustomViewContribution } from '../../browser/kanbanView.js';
import { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { KANBAN_CUSTOM_VIEW_ID } from '../../../../common/projectBoard.js';
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

	test('registers Kanban as a restorable Sessions custom view', () => {
		const instantiationService = store.add(new TestInstantiationService());
		let registered: ICustomViewDescriptor | undefined;
		instantiationService.stub(ICustomViewService, upcastPartial<ICustomViewService>({
			activeCustomView: constObservable(undefined),
			registerCustomView: descriptor => {
				registered = descriptor;
				return { dispose() { } };
			},
		}));
		store.add(instantiationService.createInstance(KanbanCustomViewContribution));

		assert.deepStrictEqual({
			id: registered?.id,
			hasConstructor: !!registered?.ctor,
			actions: registered?.actions,
			horizontalScrolling: registered?.horizontalScrolling,
		}, {
			id: KANBAN_CUSTOM_VIEW_ID,
			hasConstructor: true,
			actions: undefined,
			horizontalScrolling: true,
		});
	});
});

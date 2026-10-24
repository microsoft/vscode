/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { IMenuItem, isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { Menus } from '../../../../browser/menus.js';
import { ChatLayoutMode } from '../../../../common/chatLayout.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import { MAXIMIZE_MAIN_EDITOR_PART_COMMAND_ID, RESTORE_MAIN_EDITOR_PART_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { IChatWindow } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { LayoutModeOwnerKind } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { DesktopLayoutController } from '../../browser/desktopLayoutController.js';
import { DesktopLayoutModeCoordinator, MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS } from '../../browser/desktop/desktopLayoutModeCoordinator.js';
import { createTestHarness, ITestLayoutHarness, makeSession } from './layoutControllerTestUtils.js';

suite('Sessions - DesktopLayoutModeCoordinator', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class TestDesktopController extends DesktopLayoutController {
		get layoutMode(): DesktopLayoutModeCoordinator {
			assert.ok(this._layoutMode);
			return this._layoutMode;
		}

		/** Resolves once the restore of the focused session's layout, if one runs, ends. */
		async whenRestored(): Promise<void> {
			if (this._isRestoringSessionLayout) {
				await Event.toPromise(this.onDidEndSessionLayoutRestore);
			}
		}
	}

	function createController(chatLayoutMode: ChatLayoutMode, initialSession: IActiveSession): TestDesktopController {
		harness = createTestHarness(store, { desktopLayout: true, chatLayoutMode, workspaceFolders: [{ uri: URI.file('/repo') }] });
		harness.activeSessionObs.set(initialSession, undefined);
		return store.add(harness.instaService.createInstance(TestDesktopController));
	}

	function state(controller: TestDesktopController) {
		return {
			mode: controller.layoutMode.mode.get(),
			context: harness.contextKeyService.getContextKeyValue('sessions.layoutMode'),
			arrangement: harness.sidePaneArrangement,
			maximized: harness.editorMaximized,
		};
	}

	async function focus(controller: TestDesktopController, session: IActiveSession): Promise<void> {
		harness.activeSessionObs.set(session, undefined);
		await controller.whenRestored();
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionA = makeSession(URI.parse('test:/a'));
	const sessionB = makeSession(URI.parse('test:/b'));

	for (const scope of ['chat', 'chat-shared'] as const) {
		test(`restores the arrangement and editor only of the focused chat as ${scope} scopes them`, async () => {
			const controller = createController(scope, sessionA);
			await controller.whenRestored();
			harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
			const stackedA = state(controller);

			await focus(controller, sessionB);
			const focusedB = state(controller);
			harness.layoutService.setSidePaneArrangement(SessionLayoutMode.SideBySide);
			await controller.layoutMode.setMode(SessionLayoutMode.EditorOnly);
			const editorOnlyB = state(controller);

			await focus(controller, sessionA);
			const backToA = state(controller);
			await focus(controller, sessionB);
			const backToB = state(controller);

			const expectedA = scope === 'chat'
				? { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false }
				: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: true };
			assert.deepStrictEqual({ stackedA, focusedB, editorOnlyB, backToA, backToB }, {
				stackedA: { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false },
				// An unvisited chat keeps what the window shows.
				focusedB: { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false },
				editorOnlyB: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: true },
				backToA: expectedA,
				backToB: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: true },
			});
		});
	}

	test('leads the session activity bar of the main window with the four modes while it shows its layout actions', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const items = MenuRegistry.getMenuItems(Menus.SessionActivityBar).filter(isIMenuItem).filter(item => Object.values(MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS).includes(item.command.id));
		const base: Record<string, ContextKeyValue> = { agentSessionsDesktopLayout: true, [`config.${SESSION_ACTIVITY_BAR_SETTING}`]: true, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: true };
		const shown = (values: Record<string, ContextKeyValue>) => items.filter(item => item.when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false).map(item => item.command.id);
		const toggled = (item: IMenuItem): ContextKeyExpression | undefined => {
			const value = item.command.toggled;
			return isICommandActionToggleInfo(value) ? value.condition : value;
		};
		const checked = (mode: SessionLayoutMode) => items.filter(item => toggled(item)?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => (key === 'sessions.layoutMode' ? mode : undefined) as T | undefined } satisfies IContext)).map(item => item.command.id);

		assert.deepStrictEqual({
			entries: items.map(item => ({ id: item.command.id, group: item.group, order: item.order })),
			layoutActions: shown(base),
			layoutActionsOff: shown({ ...base, [`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`]: false }),
			chatWindow: shown({ ...base, 'sessions.chatWindowHasEditorArea': true }),
			editorMaximized: shown({ ...base, editorMaximized: true }),
			checkedStacked: checked(SessionLayoutMode.Stacked),
		}, {
			entries: [
				{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.ChatOnly], group: '0_layout', order: 0 },
				{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.EditorOnly], group: '0_layout', order: 1 },
				{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.Stacked], group: '0_layout', order: 2 },
				{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.SideBySide], group: '0_layout', order: 3 },
			],
			layoutActions: Object.values(MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS),
			layoutActionsOff: [],
			chatWindow: [],
			editorMaximized: Object.values(MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS),
			checkedStacked: [MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.Stacked]],
		});
	});

	test('shows each mode through the existing side pane and maximize operations', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const steps: ReturnType<typeof state>[] = [];
		for (const mode of [SessionLayoutMode.ChatOnly, SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly, SessionLayoutMode.SideBySide, SessionLayoutMode.SideBySide]) {
			await controller.layoutMode.setMode(mode);
			steps.push(state(controller));
		}

		assert.deepStrictEqual({ steps, toggleSidePaneCalls: harness.toggleSidePaneCalls, commands: harness.executedCommands }, {
			steps: [
				{ mode: SessionLayoutMode.ChatOnly, context: SessionLayoutMode.ChatOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false },
				{ mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false },
				{ mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.Stacked, maximized: true },
				{ mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false },
				{ mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false },
			],
			// Hiding for chat only and showing again for stacked.
			toggleSidePaneCalls: 2,
			commands: [MAXIMIZE_MAIN_EDITOR_PART_COMMAND_ID, RESTORE_MAIN_EDITOR_PART_COMMAND_ID],
		});
	});

	test('with several chat surfaces shown, focus changes neither restore nor remember the mode', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		harness.visibleSessionsObs.set([sessionA, sessionB], undefined);
		await focus(controller, sessionB);
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.SideBySide);
		await focus(controller, sessionA);
		const whileSeveral = state(controller);

		assert.deepStrictEqual({
			whileSeveral,
			rememberedA: harness.layoutModeService.getMainWindowMode({ sessionResource: sessionA.resource, chatResource: sessionA.resource }, LayoutModeOwnerKind.Existing)?.mode,
			rememberedB: harness.layoutModeService.getMainWindowMode({ sessionResource: sessionB.resource, chatResource: sessionB.resource }, LayoutModeOwnerKind.Existing)?.mode,
		}, {
			whileSeveral: { mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false },
			rememberedA: SessionLayoutMode.Stacked,
			rememberedB: undefined,
		});
	});

	test('shows a chat returning from a chat window in its full chat window mode, where the main window remembers modes per chat', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const ownerB = { sessionResource: sessionB.resource, chatResource: sessionB.resource };
		harness.layoutModeService.setMainWindowMode(ownerB, LayoutModeOwnerKind.Existing, { mode: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false });
		harness.layoutModeService.setChatWindowMode(ownerB, { mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, inputOnly: true });
		const window = new class extends mock<IChatWindow>() {
			override readonly session: IObservable<IActiveSession | undefined> = observableValue<IActiveSession | undefined>('session', sessionB);
		};
		harness.chatWindowsObs.set([window], undefined);
		harness.chatWindowsObs.set([], undefined);
		await focus(controller, sessionB);

		assert.deepStrictEqual({ shown: state(controller), remembered: harness.layoutModeService.getMainWindowMode(ownerB, LayoutModeOwnerKind.Existing) }, {
			shown: { mode: SessionLayoutMode.ChatOnly, context: SessionLayoutMode.ChatOnly, arrangement: SessionLayoutMode.Stacked, maximized: false },
			remembered: { mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, inputOnly: true },
		});
	});
});

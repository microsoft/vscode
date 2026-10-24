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
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatLayoutMode } from '../../../../common/chatLayout.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { IChatWindow } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { LayoutModeOwnerKind } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { DesktopLayoutController } from '../../browser/desktopLayoutController.js';
import { DesktopLayoutModeCoordinator, MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS } from '../../browser/desktop/desktopLayoutModeCoordinator.js';
import { createTestHarness, ITestLayoutHarness, makeSession } from './layoutControllerTestUtils.js';
import { describeSessionActivityBarLayout } from '../../../../test/browser/sessionLayoutModeTestUtils.js';

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
			controller.layoutMode.setMode(SessionLayoutMode.EditorOnly);
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

	test('un-maximizes synchronously as focus moves from a chat in editor only to one that is not, before its side pane is restored', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		await focus(controller, sessionB);
		controller.layoutMode.setMode(SessionLayoutMode.SideBySide);
		await focus(controller, sessionA);
		controller.layoutMode.setMode(SessionLayoutMode.EditorOnly);
		const maximizedA = state(controller);
		harness.executedCommands.length = 0;

		// Synchronously within the focus change: a command could run later, once its activation event has run.
		harness.activeSessionObs.set(sessionB, undefined);
		const synchronously = { maximized: harness.editorMaximized, commands: [...harness.executedCommands] };
		await controller.whenRestored();

		assert.deepStrictEqual({ maximizedA, synchronously, focusedB: state(controller) }, {
			maximizedA: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: true },
			synchronously: { maximized: false, commands: [] },
			focusedB: { mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false },
		});
	});

	test('leads the session activity bar of the main window with one Layout button, opening the four modes with the current one checked, while it shows its layout actions', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const settings = { [SESSION_ACTIVITY_BAR_SETTING]: true, [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: true };
		const strip = (mode: SessionLayoutMode, contextKeys: Record<string, ContextKeyValue> = {}, overrides: Record<string, unknown> = {}) =>
			describeSessionActivityBarLayout(store, { agentSessionsDesktopLayout: true, 'sessions.layoutMode': mode, ...contextKeys }, { ...settings, ...overrides });
		const entries = (checked: SessionLayoutMode) => [
			{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.ChatOnly], label: 'Chat Only', checked: checked === SessionLayoutMode.ChatOnly },
			{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.EditorOnly], label: 'Editor Only', checked: checked === SessionLayoutMode.EditorOnly },
			{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.Stacked], label: 'Stacked', checked: checked === SessionLayoutMode.Stacked },
			{ id: MAIN_WINDOW_LAYOUT_MODE_COMMAND_IDS[SessionLayoutMode.SideBySide], label: 'Side by Side', checked: checked === SessionLayoutMode.SideBySide },
		];

		assert.deepStrictEqual({
			sideBySide: strip(SessionLayoutMode.SideBySide),
			stacked: strip(SessionLayoutMode.Stacked),
			editorOnly: strip(SessionLayoutMode.EditorOnly, { editorMaximized: true }),
			chatOnly: strip(SessionLayoutMode.ChatOnly),
			layoutActionsOff: strip(SessionLayoutMode.SideBySide, {}, { [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: false }),
			chatWindow: strip(SessionLayoutMode.SideBySide, { 'sessions.chatWindow': 'test', 'sessions.chatWindowHasEditorArea': true }),
			// A chat window without an editor area has no layout modes, not the main window's.
			chatOnlyChatWindow: strip(SessionLayoutMode.ChatOnly, { 'sessions.chatWindow': 'test' }),
		}, {
			sideBySide: [{ label: 'Layout: Side by Side', icon: 'split-horizontal', entries: entries(SessionLayoutMode.SideBySide) }],
			stacked: [{ label: 'Layout: Stacked', icon: 'split-vertical', entries: entries(SessionLayoutMode.Stacked) }],
			editorOnly: [{ label: 'Layout: Editor Only', icon: 'layout-sidebar-right', entries: entries(SessionLayoutMode.EditorOnly) }],
			chatOnly: [{ label: 'Layout: Chat Only', icon: 'layout-sidebar-left', entries: entries(SessionLayoutMode.ChatOnly) }],
			layoutActionsOff: [],
			chatWindow: [],
			chatOnlyChatWindow: [],
		});
	});

	test('shows each mode through the existing side pane and maximize operations', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const steps: ReturnType<typeof state>[] = [];
		harness.setEditorMaximizedCalls.length = 0;
		for (const mode of [SessionLayoutMode.ChatOnly, SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly, SessionLayoutMode.SideBySide, SessionLayoutMode.SideBySide]) {
			controller.layoutMode.setMode(mode);
			steps.push(state(controller));
		}

		assert.deepStrictEqual({ steps, toggleSidePaneCalls: harness.toggleSidePaneCalls, maximizeCalls: harness.setEditorMaximizedCalls, commands: harness.executedCommands }, {
			steps: [
				{ mode: SessionLayoutMode.ChatOnly, context: SessionLayoutMode.ChatOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false },
				{ mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false },
				{ mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.Stacked, maximized: true },
				{ mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false },
				{ mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false },
			],
			// Hiding for chat only and showing again for stacked.
			toggleSidePaneCalls: 2,
			// Maximized and restored directly, synchronously, rather than through their commands.
			maximizeCalls: [true, false],
			commands: [],
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

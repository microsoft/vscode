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
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ChatLayoutMode } from '../../../../common/chatLayout.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../../../common/sessionConfig.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { IChatWindow } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { LayoutModeOwnerKind } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { DesktopLayoutController } from '../../browser/desktopLayoutController.js';
import { DesktopLayoutModeCoordinator, MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS } from '../../browser/desktop/desktopLayoutModeCoordinator.js';
import { createTestHarness, ITestLayoutHarness, makeSession } from './layoutControllerTestUtils.js';
import { describeMenuGroup, describeSessionActivityBarLayout } from '../../../../test/browser/sessionLayoutModeTestUtils.js';
import { Menus } from '../../../../browser/menus.js';

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

	function createController(chatLayoutMode: ChatLayoutMode, initialSession: IActiveSession, workspaceFolder = URI.file('/repo')): TestDesktopController {
		harness = createTestHarness(store, { desktopLayout: true, chatLayoutMode, workspaceFolders: [{ uri: workspaceFolder }] });
		harness.activeSessionObs.set(initialSession, undefined);
		return store.add(harness.instaService.createInstance(TestDesktopController));
	}

	function state(controller: TestDesktopController) {
		return {
			mode: controller.layoutMode.mode.get(),
			context: harness.contextKeyService.getContextKeyValue('sessions.layoutMode'),
			arrangement: harness.sidePaneArrangement,
			maximized: harness.editorMaximized,
			chatHidden: harness.partVisibility.get(Parts.SESSIONS_PART) === false,
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
				? { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: false }
				: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: true };
			assert.deepStrictEqual({ stackedA, focusedB, editorOnlyB, backToA, backToB }, {
				stackedA: { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: false },
				// An unvisited chat keeps what the window shows.
				focusedB: { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: false },
				editorOnlyB: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: true },
				backToA: expectedA,
				backToB: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: true },
			});
		});
	}

	test('shows the chat synchronously as focus moves from a chat in editor only to one that is not, before its side pane is restored', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		await focus(controller, sessionB);
		controller.layoutMode.setMode(SessionLayoutMode.SideBySide);
		await focus(controller, sessionA);
		controller.layoutMode.setMode(SessionLayoutMode.EditorOnly);
		const editorOnlyA = state(controller);
		harness.executedCommands.length = 0;

		// Synchronously within the focus change: a command could run later, once its activation event has run.
		harness.activeSessionObs.set(sessionB, undefined);
		const synchronously = { chatHidden: harness.partVisibility.get(Parts.SESSIONS_PART) === false, commands: [...harness.executedCommands] };
		await controller.whenRestored();

		assert.deepStrictEqual({ editorOnlyA, synchronously, focusedB: state(controller) }, {
			editorOnlyA: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: true },
			synchronously: { chatHidden: false, commands: [] },
			focusedB: { mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: false },
		});
	});

	for (const scope of ['session-shared', 'chat'] as const) {
		test(`restores a remembered editor only into a closed side pane with the focused chat's own side pane, which stays remembered, as ${scope} scopes it`, async () => {
			const draft = makeSession(URI.parse('test:/draft'), { status: SessionStatus.Untitled, isCreated: false });
			// The window's folder is not the sessions' yet, as while a session's workspace hydrates, so no editor working set
			// restore is under way as the focus changes.
			const controller = createController(scope, sessionB, URI.file('/other'));
			await controller.whenRestored();
			const sidePane = () => ({
				...state(controller),
				editor: harness.partVisibility.get(Parts.EDITOR_PART) ?? true,
				details: harness.partVisibility.get(Parts.AUXILIARYBAR_PART) ?? true,
			});

			// B shows Details only, then editor only.
			harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
			controller.layoutMode.setMode(SessionLayoutMode.EditorOnly);
			const editorOnlyB = sidePane();
			// A draft in chat only closes the side pane.
			await focus(controller, draft);
			controller.layoutMode.setMode(SessionLayoutMode.ChatOnly);
			const chatOnlyDraft = sidePane();
			await focus(controller, sessionB);
			const backToB = sidePane();
			await focus(controller, draft);
			await focus(controller, sessionB);
			const againB = sidePane();

			const detailsOnly = { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: true, editor: false, details: true };
			assert.deepStrictEqual({ editorOnlyB, chatOnlyDraft, backToB, againB }, {
				editorOnlyB: detailsOnly,
				chatOnlyDraft: { mode: SessionLayoutMode.ChatOnly, context: SessionLayoutMode.ChatOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: false, editor: false, details: false },
				backToB: detailsOnly,
				againB: detailsOnly,
			});
		});
	}

	test('holds off showing the hidden chat on an emptied side pane for the whole restore of the focused chat\'s layout', async () => {
		// Per chat, A shows its editor and B its Details only.
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		await focus(controller, sessionB);
		const depths: number[] = [];
		store.add(harness.layoutService.onDidChangePartVisibility(() => depths.push(harness.showChatOnHiddenSidePaneSuppressionDepth)));
		harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
		const byUser = [...depths];
		depths.length = 0;
		await focus(controller, sessionA);
		const restoring = [...depths];

		assert.deepStrictEqual({ byUser, restoring, afterRestore: harness.showChatOnHiddenSidePaneSuppressionDepth }, {
			byUser: [0, 0],
			// Held by each of the nested restores, the editors' and the side pane's, and released as they end.
			restoring: [2, 2],
			afterRestore: 0,
		});
	});

	test('leads the session activity bar of the main window with one Layout button of the same icon in every mode, opening Show Chat, Show Editor and Stacked as the window shows them, while it shows its layout actions', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const settings = { [SESSION_ACTIVITY_BAR_SETTING]: true, [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: true };
		const strip = (mode: SessionLayoutMode, splitLayout: SessionLayoutMode, contextKeys: Record<string, ContextKeyValue> = {}, overrides: Record<string, unknown> = {}) =>
			describeSessionActivityBarLayout(store, { agentSessionsDesktopLayout: true, 'sessions.layoutMode': mode, 'sessions.splitLayout': splitLayout, ...contextKeys }, { ...settings, ...overrides });
		// Checked and enabled: Show Chat, Show Editor, Stacked.
		const layout = (chat: [boolean, boolean], editor: [boolean, boolean], stacked: [boolean, boolean]) => [{
			label: 'Layout', icon: 'layout', entries: [
				{ id: MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.chat, label: 'Show Chat', checked: chat[0], enabled: chat[1] },
				{ id: MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.editor, label: 'Show Editor', checked: editor[0], enabled: editor[1] },
				{ id: MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.stacked, label: 'Stacked', checked: stacked[0], enabled: stacked[1] },
			]
		}];

		assert.deepStrictEqual({
			sideBySide: strip(SessionLayoutMode.SideBySide, SessionLayoutMode.SideBySide),
			stacked: strip(SessionLayoutMode.Stacked, SessionLayoutMode.Stacked),
			editorOnly: strip(SessionLayoutMode.EditorOnly, SessionLayoutMode.SideBySide, { editorMaximized: true }),
			chatOnly: strip(SessionLayoutMode.ChatOnly, SessionLayoutMode.Stacked),
			layoutActionsOff: strip(SessionLayoutMode.SideBySide, SessionLayoutMode.SideBySide, {}, { [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: false }),
			chatWindow: strip(SessionLayoutMode.SideBySide, SessionLayoutMode.SideBySide, { 'sessions.chatWindow': 'test', 'sessions.chatWindowHasEditorArea': true }),
			// A chat window without an editor has no Layout menu, not the main window's.
			chatOnlyChatWindow: strip(SessionLayoutMode.ChatOnly, SessionLayoutMode.SideBySide, { 'sessions.chatWindow': 'test' }),
		}, {
			sideBySide: layout([true, true], [true, true], [false, true]),
			stacked: layout([true, true], [true, true], [true, true]),
			// The last pane shown cannot be hidden; Stacked, always enabled, then chooses how both show next.
			editorOnly: layout([false, true], [true, false], [false, true]),
			chatOnly: layout([true, false], [false, true], [true, true]),
			layoutActionsOff: [],
			chatWindow: [],
			chatOnlyChatWindow: [],
		});
	});

	test('shows the main window\'s Layout menu in one place: in its title bar after Toggle Side Panel, or in the Session Activity Bar while it shows its layout actions', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const contextKeys: Record<string, ContextKeyValue> = { agentSessionsDesktopLayout: true, 'sessions.layoutMode': SessionLayoutMode.SideBySide, 'sessions.splitLayout': SessionLayoutMode.SideBySide };
		const titleBar = (settings: Record<string, unknown>) => describeMenuGroup(store, Menus.TitleBarSessionMenu, 'navigation', contextKeys, settings)
			.filter(item => item.label === 'Layout' || item.label === 'Toggle Side Panel').map(item => item.entries ? `${item.label} (menu)` : item.label);
		const strip = (settings: Record<string, unknown>) => describeSessionActivityBarLayout(store, contextKeys, settings).map(item => item.label);
		const where = (layoutActions: boolean) => {
			const settings = { [SESSION_ACTIVITY_BAR_SETTING]: true, [SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING]: layoutActions };
			return { titleBar: titleBar(settings), strip: strip(settings) };
		};

		assert.deepStrictEqual({ off: where(false), on: where(true) }, {
			off: { titleBar: ['Toggle Side Panel', 'Layout (menu)'], strip: [] },
			on: { titleBar: [], strip: ['Layout'] },
		});
	});

	test('shows and hides the chat and the editor, and stacks them, through the toggles of the Layout menu', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		controller.layoutMode.setMode(SessionLayoutMode.SideBySide);
		const steps: { toggle: string; mode: SessionLayoutMode }[] = [];
		for (const toggle of ['editor', 'editor', 'chat', 'chat', 'stacked', 'chat', 'chat', 'stacked'] as const) {
			await harness.instaService.invokeFunction(accessor => CommandsRegistry.getCommand(MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS[toggle])!.handler(accessor));
			steps.push({ toggle, mode: controller.layoutMode.mode.get() });
		}

		assert.deepStrictEqual(steps, [
			{ toggle: 'editor', mode: SessionLayoutMode.ChatOnly },
			{ toggle: 'editor', mode: SessionLayoutMode.SideBySide },
			{ toggle: 'chat', mode: SessionLayoutMode.EditorOnly },
			{ toggle: 'chat', mode: SessionLayoutMode.SideBySide },
			{ toggle: 'stacked', mode: SessionLayoutMode.Stacked },
			// Shown again, both show as they last showed together.
			{ toggle: 'chat', mode: SessionLayoutMode.EditorOnly },
			{ toggle: 'chat', mode: SessionLayoutMode.Stacked },
			{ toggle: 'stacked', mode: SessionLayoutMode.SideBySide },
		]);
	});

	test('with only the chat or only the editor shown, Stacked only flips how both show next, which the focused chat remembers and Show Chat or Show Editor uses', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		const owner = { sessionResource: sessionA.resource, chatResource: sessionA.resource };
		const run = (toggle: keyof typeof MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS) => harness.instaService.invokeFunction(accessor => CommandsRegistry.getCommand(MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS[toggle])!.handler(accessor));
		const step = () => ({
			mode: controller.layoutMode.mode.get(),
			splitLayout: controller.layoutMode.splitLayout.get(),
			sidePane: harness.layoutService.isSidePaneVisible(),
			chatHidden: harness.partVisibility.get(Parts.SESSIONS_PART) === false,
			remembered: harness.layoutModeService.getMainWindowMode(owner, LayoutModeOwnerKind.Existing)?.splitLayout,
		});
		controller.layoutMode.setMode(SessionLayoutMode.SideBySide);
		controller.layoutMode.setMode(SessionLayoutMode.ChatOnly);
		const chatOnly = step();
		await run('stacked');
		const chatOnlyStacked = step();
		await run('editor');
		const editorShown = step();
		controller.layoutMode.setMode(SessionLayoutMode.EditorOnly);
		const editorOnly = step();
		await run('stacked');
		const editorOnlySideBySide = step();
		await run('chat');
		const chatShown = step();

		assert.deepStrictEqual({ chatOnly, chatOnlyStacked, editorShown, editorOnly, editorOnlySideBySide, chatShown }, {
			chatOnly: { mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.SideBySide, sidePane: false, chatHidden: false, remembered: SessionLayoutMode.SideBySide },
			// Only the arrangement flips: the side pane stays closed.
			chatOnlyStacked: { mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, sidePane: false, chatHidden: false, remembered: SessionLayoutMode.Stacked },
			editorShown: { mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, sidePane: true, chatHidden: false, remembered: SessionLayoutMode.Stacked },
			editorOnly: { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.Stacked, sidePane: true, chatHidden: true, remembered: SessionLayoutMode.Stacked },
			// The chat stays hidden.
			editorOnlySideBySide: { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.SideBySide, sidePane: true, chatHidden: true, remembered: SessionLayoutMode.SideBySide },
			chatShown: { mode: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, sidePane: true, chatHidden: false, remembered: SessionLayoutMode.SideBySide },
		});
	});

	test('editor only hides only the chat, keeping the sessions list and the panel, and show chat brings it back as it last showed with the editor', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		harness.partVisibility.set(Parts.SIDEBAR_PART, true);
		harness.partVisibility.set(Parts.PANEL_PART, true);
		controller.layoutMode.setMode(SessionLayoutMode.Stacked);
		harness.setEditorMaximizedCalls.length = 0;
		const parts = () => ({ ...state(controller), sidebar: harness.partVisibility.get(Parts.SIDEBAR_PART), panel: harness.partVisibility.get(Parts.PANEL_PART), editor: harness.partVisibility.get(Parts.EDITOR_PART) });

		await harness.instaService.invokeFunction(accessor => CommandsRegistry.getCommand(MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.chat)!.handler(accessor));
		const chatHidden = parts();
		await harness.instaService.invokeFunction(accessor => CommandsRegistry.getCommand(MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.chat)!.handler(accessor));
		const chatShown = parts();
		// The Maximize Editor Area action stays a thing of its own; the menu reads it as editor only, and show chat restores it.
		harness.layoutService.setEditorMaximized(true);
		const maximized = state(controller);
		await harness.instaService.invokeFunction(accessor => CommandsRegistry.getCommand(MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.chat)!.handler(accessor));

		assert.deepStrictEqual({ chatHidden, chatShown, maximized, afterShowChat: state(controller), maximizeCalls: harness.setEditorMaximizedCalls }, {
			chatHidden: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: true, sidebar: true, panel: true, editor: true },
			chatShown: { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: false, sidebar: true, panel: true, editor: true },
			maximized: { mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.Stacked, maximized: true, chatHidden: false },
			afterShowChat: { mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: false },
			// Only the user's own maximize and its restore.
			maximizeCalls: [true, false],
		});
	});

	test('in the center panel alignment, hiding the chat gives its room to the editor, not the panel, and showing it restores the sizes, also across a session switch', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		harness.partVisibility.set(Parts.PANEL_PART, true);
		harness.panelAlignment = 'center';
		const toggleChat = () => harness.instaService.invokeFunction(accessor => CommandsRegistry.getCommand(MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.chat)!.handler(accessor));
		const sizes = () => ({ editor: harness.partSizes.get(Parts.EDITOR_PART), panel: harness.partSizes.get(Parts.PANEL_PART) });
		const setSizes = (editor: [number, number], chat: [number, number], panel: [number, number]) => {
			harness.partSizes.set(Parts.EDITOR_PART, { width: editor[0], height: editor[1] });
			harness.partSizes.set(Parts.SESSIONS_PART, { width: chat[0], height: chat[1] });
			harness.partSizes.set(Parts.PANEL_PART, { width: panel[0], height: panel[1] });
		};

		// Stacked: the column of the editor, the chat and the panel.
		controller.layoutMode.setMode(SessionLayoutMode.Stacked);
		setSizes([916, 113], [916, 336], [916, 184]);
		await toggleChat();
		const stackedHidden = sizes();
		await toggleChat();
		const stackedShown = sizes();

		// Side by side: the column of the chat and the panel, beside the editor.
		controller.layoutMode.setMode(SessionLayoutMode.SideBySide);
		setSizes([300, 752], [612, 336], [612, 410]);
		await toggleChat();
		const sideBySideHidden = sizes();
		// Round trip through a chat that shows its chat, and back to the one remembered with it hidden.
		await focus(controller, sessionB);
		const otherSession = sizes();
		await focus(controller, sessionA);
		const backHidden = { ...sizes(), mode: state(controller).mode };
		// The session switched back to keeps its panel as it left it.
		const panelVisible = harness.partVisibility.get(Parts.PANEL_PART);
		await toggleChat();
		const sideBySideShown = { ...sizes(), chat: harness.partSizes.get(Parts.SESSIONS_PART) };

		assert.deepStrictEqual({ stackedHidden, stackedShown, sideBySideHidden, otherSession, backHidden, panelVisible, sideBySideShown }, {
			// The editor takes the chat's height; the panel keeps its own.
			stackedHidden: { editor: { width: 916, height: 449 }, panel: { width: 916, height: 184 } },
			stackedShown: { editor: { width: 916, height: 113 }, panel: { width: 916, height: 184 } },
			// The panel's column narrows to its least width, and the editor widens by as much.
			sideBySideHidden: { editor: { width: 592, height: 752 }, panel: { width: 320, height: 410 } },
			// An unvisited chat keeps what the window shows.
			otherSession: { editor: { width: 592, height: 752 }, panel: { width: 320, height: 410 } },
			backHidden: { editor: { width: 592, height: 752 }, panel: { width: 320, height: 410 }, mode: SessionLayoutMode.EditorOnly },
			panelVisible: false,
			// The chat's column takes its width from before, also with its panel hidden since, and the editor beside it gives
			// it (in the grid; see stackedChatColumnResize.test.ts), rather than the window's width being restored.
			sideBySideShown: { editor: { width: 592, height: 752 }, panel: { width: 320, height: 410 }, chat: { width: 612, height: 336 } },
		});
	});

	test('in the justify panel alignment, hiding the chat leaves the editor and the panel sizes to the grid', async () => {
		const controller = createController('chat', sessionA);
		await controller.whenRestored();
		harness.partVisibility.set(Parts.PANEL_PART, true);
		harness.partSizes.set(Parts.EDITOR_PART, { width: 300, height: 452 });
		harness.partSizes.set(Parts.PANEL_PART, { width: 916, height: 297 });
		await harness.instaService.invokeFunction(accessor => CommandsRegistry.getCommand(MAIN_WINDOW_LAYOUT_TOGGLE_COMMAND_IDS.chat)!.handler(accessor));

		assert.deepStrictEqual({ editor: harness.partSizes.get(Parts.EDITOR_PART), panel: harness.partSizes.get(Parts.PANEL_PART) }, {
			editor: { width: 300, height: 452 },
			panel: { width: 916, height: 297 },
		});
	});

	test('shows each mode through the existing side pane operations, editor only hiding only the chat', async () => {
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
				{ mode: SessionLayoutMode.ChatOnly, context: SessionLayoutMode.ChatOnly, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: false },
				{ mode: SessionLayoutMode.Stacked, context: SessionLayoutMode.Stacked, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: false },
				{ mode: SessionLayoutMode.EditorOnly, context: SessionLayoutMode.EditorOnly, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: true },
				{ mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: false },
				{ mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: false },
			],
			// Hiding for chat only and showing again for stacked.
			toggleSidePaneCalls: 2,
			// Editor only hides the chat, without maximizing the editor area.
			maximizeCalls: [],
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
			whileSeveral: { mode: SessionLayoutMode.SideBySide, context: SessionLayoutMode.SideBySide, arrangement: SessionLayoutMode.SideBySide, maximized: false, chatHidden: false },
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
			shown: { mode: SessionLayoutMode.ChatOnly, context: SessionLayoutMode.ChatOnly, arrangement: SessionLayoutMode.Stacked, maximized: false, chatHidden: false },
			remembered: { mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, inputOnly: true },
		});
	});
});

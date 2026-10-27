/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from '../../../../../workbench/browser/parts/editor/editor.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { LayoutModeOwnerKind } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { DesktopLayoutController } from '../../browser/desktopLayoutController.js';
import { DesktopStackedChatController } from '../../browser/desktop/desktopStackedChatController.js';
import { createTestHarness, ITestLayoutHarness, makeSession } from './layoutControllerTestUtils.js';

suite('Sessions - DesktopStackedChatController', () => {

	const store = new DisposableStore();
	let harness: ITestLayoutHarness;

	class TestDesktopController extends DesktopLayoutController {
		get stackedChat(): DesktopStackedChatController {
			assert.ok(this._stackedChat);
			return this._stackedChat;
		}

		async whenRestored(): Promise<void> {
			if (this._isRestoringSessionLayout) {
				await Event.toPromise(this.onDidEndSessionLayoutRestore);
			}
		}
	}

	/** What the controller drives of a chat view. */
	type IStackedChatView = Pick<AbstractChatView, 'inputOnly' | 'inputOnlyHeight' | 'canShowInputOnly' | 'enableInputOnly' | 'setInputOnly' | 'disableInputOnly'>;

	/** A chat view whose input, with the session header above it, needs 100 + 20 pixels. */
	class TestChatView implements IStackedChatView {
		readonly inputOnlyValue = observableValue('inputOnly', false);
		enabled = false;
		readonly inputOnly: IObservable<boolean> = this.inputOnlyValue;
		/** Grows as the input wraps to another line. */
		readonly inputOnlyHeightValue = observableValue('inputOnlyHeight', 100);
		readonly inputOnlyHeight: IObservable<number> = this.inputOnlyHeightValue;
		readonly canShowInputOnly: IObservable<boolean> = constObservable(true);
		enableInputOnly(options: { readonly maxHeight: number; readonly inputOnly?: boolean }): void {
			this.enabled = true;
			this.inputOnlyValue.set(options.inputOnly ?? true, undefined);
		}
		setInputOnly(inputOnly: boolean): void {
			this.inputOnlyValue.set(inputOnly, undefined);
		}
		disableInputOnly(): void {
			this.enabled = false;
			this.inputOnlyValue.set(false, undefined);
		}
	}

	class TestSessionView extends mock<SessionView>() {
		headerHidden = false;
		constructor(chatView: IStackedChatView) {
			super();
			// Only the members the controller drives are faked.
			this.primaryChatView = constObservable(chatView as AbstractChatView);
		}
		override readonly primaryChatView: IObservable<AbstractChatView | undefined>;
		override readonly primaryChatViewTop: IObservable<number> = constObservable(20);
		override setHeaderHidden(hidden: boolean): void {
			this.headerHidden = hidden;
		}
		sizedByHost = false;
		override setSizedByHost(sized: boolean): void {
			this.sizedByHost = sized;
		}
	}

	const session = makeSession(URI.parse('test:/a'));
	const owner = { sessionResource: session.resource, chatResource: session.resource };
	/** The chat's input, with the header and the part's chrome of 10. */
	const collapsed = 100 + 20 + 10;

	async function createController(): Promise<{ controller: TestDesktopController; chatView: TestChatView; sessionView: TestSessionView }> {
		harness = createTestHarness(store, { desktopLayout: true, chatLayoutMode: 'chat', workspaceFolders: [{ uri: URI.file('/repo') }] });
		const chatView = new TestChatView();
		const sessionView = new TestSessionView(chatView);
		harness.sessionView = sessionView;
		harness.sessionsPartChromeHeight = 10;
		harness.partSizes.set(Parts.SESSIONS_PART, { width: 800, height: 400 });
		harness.partSizes.set(Parts.EDITOR_PART, { width: 800, height: 400 });
		harness.activeSessionObs.set(session, undefined);
		const controller = store.add(harness.instaService.createInstance(TestDesktopController));
		await controller.whenRestored();
		return { controller, chatView, sessionView };
	}

	function state(chatView: TestChatView, sessionView: TestSessionView) {
		return {
			enabled: chatView.enabled,
			inputOnly: chatView.inputOnly.get(),
			headerHidden: sessionView.headerHidden,
			sizedByHost: sessionView.sizedByHost,
			height: harness.partSizes.get(Parts.SESSIONS_PART)?.height,
			minimum: harness.sessionsPartHeightConstraints?.minimum,
			remembered: harness.layoutModeService.getMainWindowMode(owner, LayoutModeOwnerKind.Existing)?.inputOnly,
		};
	}

	function drag(height: number): void {
		harness.layoutService.setSize(Parts.SESSIONS_PART, { width: 800, height });
	}

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lets the chat stacked below the editor show only its input, sized to it, and its conversation again', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { controller, chatView, sessionView } = await createController();
		const sideBySide = state(chatView, sessionView);
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		await timeout(0);
		const stacked = state(chatView, sessionView);
		controller.stackedChat.toggleConversation();
		await timeout(0);
		const inputOnly = state(chatView, sessionView);
		controller.stackedChat.toggleConversation();
		await timeout(0);
		const conversation = state(chatView, sessionView);
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.SideBySide);
		await timeout(0);
		const backSideBySide = state(chatView, sessionView);

		assert.deepStrictEqual({ sideBySide, stacked, inputOnly, conversation, backSideBySide }, {
			sideBySide: { enabled: false, inputOnly: false, headerHidden: false, sizedByHost: false, height: 400, minimum: undefined, remembered: false },
			stacked: { enabled: true, inputOnly: false, headerHidden: false, sizedByHost: false, height: 400, minimum: collapsed, remembered: false },
			// Sized to its input, shorter than a session view otherwise is: the session view sets no minimum of its own.
			inputOnly: { enabled: true, inputOnly: true, headerHidden: true, sizedByHost: true, height: collapsed, minimum: collapsed, remembered: true },
			// Half of the column of the editor and the chat.
			conversation: { enabled: true, inputOnly: false, headerHidden: false, sizedByHost: false, height: Math.round((collapsed + 400) / 2), minimum: collapsed, remembered: false },
			backSideBySide: { enabled: false, inputOnly: false, headerHidden: false, sizedByHost: false, height: Math.round((collapsed + 400) / 2), minimum: undefined, remembered: false },
		});
	}));

	test('sizes the chat showing only its input to it as the input wraps to another line and back, in one layout of the grid each time', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { controller, chatView } = await createController();
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		await timeout(0);
		controller.stackedChat.toggleConversation();
		await timeout(0);
		const step = async (inputHeight: number) => {
			harness.sessionsPartGridLayouts = 0;
			chatView.inputOnlyHeightValue.set(inputHeight, undefined);
			await timeout(0);
			return { height: harness.partSizes.get(Parts.SESSIONS_PART)?.height, minimum: harness.sessionsPartHeightConstraints?.minimum, gridLayouts: harness.sessionsPartGridLayouts };
		};

		const wrapped = await step(120);
		const unwrapped = await step(100);

		assert.deepStrictEqual({ wrapped, unwrapped }, {
			wrapped: { height: collapsed + 20, minimum: collapsed + 20, gridLayouts: 1 },
			unwrapped: { height: collapsed, minimum: collapsed, gridLayouts: 1 },
		});
	}));

	test('shows only the input of each chat as it was last left, in the chat view reused for the next chat', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { controller, chatView, sessionView } = await createController();
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		await timeout(0);
		controller.stackedChat.toggleConversation();
		await timeout(0);
		const otherSession = makeSession(URI.parse('test:/b'));
		const otherOwner = { sessionResource: otherSession.resource, chatResource: otherSession.resource };
		harness.layoutModeService.setMainWindowMode(otherOwner, LayoutModeOwnerKind.Existing, { mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: false });
		const focus = async (focused: typeof session) => {
			harness.activeSessionObs.set(focused, undefined);
			await controller.whenRestored();
			await timeout(0);
			return { inputOnly: chatView.inputOnly.get(), headerHidden: sessionView.headerHidden, height: harness.partSizes.get(Parts.SESSIONS_PART)?.height };
		};

		const other = await focus(otherSession);
		const back = await focus(session);

		assert.deepStrictEqual({ other, back, rememberedOther: harness.layoutModeService.getMainWindowMode(otherOwner, LayoutModeOwnerKind.Existing)?.inputOnly }, {
			other: { inputOnly: false, headerHidden: false, height: Math.round((collapsed + 400) / 2) },
			back: { inputOnly: true, headerHidden: true, height: collapsed },
			rememberedOther: false,
		});
	}));

	test('snaps between the input and the conversation as the sash is dragged and released', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { chatView, sessionView } = await createController();
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		await timeout(0);
		const sash = harness.layoutService.mainContainer.appendChild(mainWindow.document.createElement('div'));
		sash.className = 'monaco-sash horizontal';
		const press = () => sash.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		const release = () => mainWindow.dispatchEvent(new PointerEvent('pointerup'));

		press();
		// Below the middle of the conversation's least height above the input.
		drag(collapsed + 50);
		const draggedDown = state(chatView, sessionView);
		release();
		const releasedDown = state(chatView, sessionView);
		press();
		drag(collapsed + 70);
		const draggedUp = state(chatView, sessionView);
		release();
		const releasedUp = state(chatView, sessionView);

		assert.deepStrictEqual({ draggedDown, releasedDown, draggedUp, releasedUp }, {
			draggedDown: { enabled: true, inputOnly: true, headerHidden: true, sizedByHost: true, height: collapsed + 50, minimum: collapsed, remembered: true },
			releasedDown: { enabled: true, inputOnly: true, headerHidden: true, sizedByHost: true, height: collapsed, minimum: collapsed, remembered: true },
			draggedUp: { enabled: true, inputOnly: false, headerHidden: false, sizedByHost: false, height: collapsed + 70, minimum: collapsed, remembered: false },
			// Settles at the conversation's least height above the input.
			releasedUp: { enabled: true, inputOnly: false, headerHidden: false, sizedByHost: false, height: collapsed + 120, minimum: collapsed, remembered: false },
		});
	}));

	test('settles where the sash is when its press is cancelled, as when it is released', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { chatView, sessionView } = await createController();
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		await timeout(0);
		const sash = harness.layoutService.mainContainer.appendChild(mainWindow.document.createElement('div'));
		sash.className = 'monaco-sash horizontal';

		sash.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		drag(collapsed + 50);
		mainWindow.dispatchEvent(new PointerEvent('pointercancel'));
		const cancelled = state(chatView, sessionView);

		assert.deepStrictEqual(cancelled, { enabled: true, inputOnly: true, headerHidden: true, sizedByHost: true, height: collapsed, minimum: collapsed, remembered: true });
	}));

	test('keeps the height of a chat showing only its input as the window resizes, and hands the constraints to the chat shown next', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { controller } = await createController();
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		await timeout(0);
		const conversation = harness.sessionsPartHeightConstraints;
		controller.stackedChat.toggleConversation();
		await timeout(0);
		const inputOnly = harness.sessionsPartHeightConstraints;
		const otherSession = makeSession(URI.parse('test:/b'));
		harness.layoutModeService.setMainWindowMode({ sessionResource: otherSession.resource, chatResource: otherSession.resource }, LayoutModeOwnerKind.Existing, { mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: true });
		// The other session has its own view.
		harness.sessionView = new TestSessionView(new TestChatView());
		harness.sessionsPartHeightConstraintsCalls.length = 0;
		harness.activeSessionObs.set(otherSession, undefined);
		await controller.whenRestored();
		await timeout(0);
		const switched = [...harness.sessionsPartHeightConstraintsCalls];
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.SideBySide);
		await timeout(0);

		assert.deepStrictEqual({ conversation, inputOnly, switched, sideBySide: harness.sessionsPartHeightConstraints }, {
			conversation: { minimum: collapsed, maximum: Number.POSITIVE_INFINITY, keepHeight: false },
			inputOnly: { minimum: collapsed, maximum: Number.POSITIVE_INFINITY, keepHeight: true },
			// Never cleared in between.
			switched: [{ minimum: collapsed, maximum: Number.POSITIVE_INFINITY, keepHeight: true }],
			sideBySide: undefined,
		});
	}));

	test('shows only the input while the window is too short for the conversation, without remembering it, and the conversation once it grows', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { chatView, sessionView } = await createController();
		harness.layoutService.setSidePaneArrangement(SessionLayoutMode.Stacked);
		await timeout(0);
		// The window shrinks: the editor gives way down to its minimum, and the chat falls below its conversation.
		harness.partSizes.set(Parts.EDITOR_PART, { width: 800, height: DEFAULT_EDITOR_MIN_DIMENSIONS.height + 10 });
		harness.partSizes.set(Parts.SESSIONS_PART, { width: 800, height: collapsed + 100 });
		harness.onDidLayoutSessionsPart.fire({ width: 800, height: collapsed + 100 });
		await timeout(0);
		const shrunk = state(chatView, sessionView);
		// The window grows: the editor can give the conversation its room again.
		harness.partSizes.set(Parts.EDITOR_PART, { width: 800, height: 500 });
		harness.onDidLayoutSessionsPart.fire({ width: 800, height: collapsed });
		await timeout(0);
		const grown = state(chatView, sessionView);

		assert.deepStrictEqual({ shrunk, grown }, {
			shrunk: { enabled: true, inputOnly: true, headerHidden: true, sizedByHost: true, height: collapsed, minimum: collapsed, remembered: false },
			grown: { enabled: true, inputOnly: false, headerHidden: false, sizedByHost: false, height: Math.round((collapsed + 500) / 2), minimum: collapsed, remembered: false },
		});
	}));
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING, FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN, FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING, FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN, FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN, FOCUS_NEW_SESSION_BRANCH_PICKER_WHEN, FOCUS_NEW_SESSION_WORKTREE_PICKER_WHEN, FOCUS_SESSION_SYNC_ACTION_WHEN, registerPickerKeybindingPresentation } from '../../browser/newChatPickerKeybinding.js';
import { noSessionPickerVisibility, SessionInputPickerVisibility, SessionPickerVisibilityContextKeys } from '../../../../services/sessions/common/sessionPickerVisibility.js';

suite('New chat picker keybindings', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('repository and environment shortcuts require new-session input focus and an available control', () => {
		const rules = [
			[FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN, 'sessionEnvironmentPickerVisible'],
			[FOCUS_NEW_SESSION_BRANCH_PICKER_WHEN, 'sessionBranchPickerVisible'],
			[FOCUS_NEW_SESSION_WORKTREE_PICKER_WHEN, 'sessionWorktreePickerVisible'],
			[FOCUS_SESSION_SYNC_ACTION_WHEN, 'sessionSyncActionVisible'],
		] as const;
		const results = rules.map(([rule, key]) => {
			const context = new Context(0, null);
			for (const name of ['chatInputHasFocus', 'chatIsEnabled', 'isNewChatSession', 'isSessionsWindow', key]) {
				context.setValue(name, true);
			}
			const enabled = rule.evaluate(context);
			context.setValue('chatInputHasFocus', false);
			const outsideInput = rule.evaluate(context);
			context.setValue('chatInputHasFocus', true);
			context.setValue('isNewChatSession', false);
			const existingSession = rule.evaluate(context);
			context.setValue('isNewChatSession', true);
			context.setValue('chatIsEnabled', false);
			const disabledAI = rule.evaluate(context);
			context.setValue('chatIsEnabled', true);
			context.setValue(key, false);
			return [enabled, outsideInput, existingSession, disabledAI, rule.evaluate(context)];
		});
		assert.deepStrictEqual(results, Array.from({ length: 4 }, () => [true, false, false, false, false]));
	});

	test('registers repository controls per composer and clears visibility with their lifetime', () => {
		const first = disposables.add(new SessionInputPickerVisibility());
		const second = disposables.add(new SessionInputPickerVisibility());
		const context = new MockContextKeyService();
		const keys = disposables.add(new SessionPickerVisibilityContextKeys(context));
		const calls: string[] = [];
		const old = disposables.add(first.registerPicker('branch', () => calls.push('old')));
		const current = disposables.add(first.registerPicker('branch', () => calls.push('first')));
		disposables.add(second.registerPicker('branch', () => calls.push('second')));
		old.dispose();
		first.focusPicker('branch');
		second.focusPicker('branch');
		keys.set(first.visibility.get());
		const visible = context.getContextKeyValue('sessionBranchPickerVisible');
		current.dispose();
		keys.set(first.visibility.get());
		assert.deepStrictEqual({ calls, visible, hidden: context.getContextKeyValue('sessionBranchPickerVisible'), state: first.visibility.get() },
			{ calls: ['first', 'second'], visible: true, hidden: false, state: noSessionPickerVisibility });
	});

	test('keep Ctrl/Cmd held for both chord strokes', () => {
		assert.deepStrictEqual({
			workspace: FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING,
			harness: FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING,
		}, {
			workspace: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyF),
			harness: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyH),
		});
	});

	test('only enable picker shortcuts with the unified workspace picker', () => {
		assert.deepStrictEqual({
			workspace: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN.serialize(),
			harness: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN.serialize(),
		}, {
			workspace: 'chatInputHasFocus && chatIsEnabled && config.sessions.chat.unifiedWorkspacePicker.enabled && isNewChatSession && isSessionsWindow && sessionWorkspacePickerVisible',
			harness: 'chatInputHasFocus && chatIsEnabled && config.sessions.chat.unifiedWorkspacePicker.enabled && isNewChatSession && isSessionsWindow && sessionHarnessPickerVisible',
		});
	});

	test('updates picker hover and context menu presentation dynamically', () => {
		const store = disposables.add(new DisposableStore());
		const element = document.createElement('button');
		const enabled = observableValue('enabled', false);
		const keybindingsChanged = store.add(new Emitter<void>());
		const hoverContents: string[] = [];
		const state: { keybinding: string | undefined; contextMenuCount: number } = {
			keybinding: undefined,
			contextMenuCount: 0,
		};
		const action = store.add(new Action('sessions.focusHarness'));
		store.add(action.onDidChange(event => {
			if (event.tooltip !== undefined) {
				hoverContents.push(event.tooltip);
			}
		}));
		const keybindingService = new class extends MockKeybindingService {
			override get onDidUpdateKeybindings() {
				return keybindingsChanged.event;
			}

			override appendKeybinding(label: string): string {
				return state.keybinding ? `${label} (${state.keybinding})` : label;
			}
		}();
		const contextMenuService = new class extends mock<IContextMenuService>() {
			override showContextMenu(): void {
				state.contextMenuCount++;
			}
		}();
		registerPickerKeybindingPresentation(
			store,
			element,
			'Choose harness',
			'sessions.focusHarness',
			ContextKeyExpr.has('test'),
			enabled,
			new class extends mock<ICommandService>() { }(),
			contextMenuService,
			action,
			keybindingService,
		);

		element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		enabled.set(true, undefined);
		element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		state.keybinding = 'Cmd+K Cmd+H';
		keybindingsChanged.fire();
		enabled.set(false, undefined);
		element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			hoverContents,
			contextMenuCount: state.contextMenuCount,
		}, {
			hoverContents: [
				'Choose harness',
				'Choose harness (Cmd+K Cmd+H)',
				'Choose harness',
			],
			contextMenuCount: 1,
		});
	});
});

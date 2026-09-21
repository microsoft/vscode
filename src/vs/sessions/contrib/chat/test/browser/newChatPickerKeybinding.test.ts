/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDelayedHoverOptions, IHoverLifecycleOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING, FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN, FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING, FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN, registerPickerKeybindingPresentation } from '../../browser/newChatPickerKeybinding.js';

suite('New chat picker keybindings', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
		const hoverService = new class extends mock<IHoverService>() {
			override setupDelayedHover(
				_target: HTMLElement,
				options: (() => IDelayedHoverOptions) | IDelayedHoverOptions,
				_lifecycleOptions?: IHoverLifecycleOptions,
			): IDisposable {
				const content = (typeof options === 'function' ? options() : options).content;
				if (typeof content === 'string') {
					hoverContents.push(content);
				}
				return Disposable.None;
			}
		}();
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
			hoverService,
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
				'Choose harness',
				'Choose harness (Cmd+K Cmd+H)',
				'Choose harness',
			],
			contextMenuCount: 1,
		});
	});
});

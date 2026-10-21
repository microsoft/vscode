/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { Action } from '../../../../base/common/actions.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { createConfigureKeybindingAction } from '../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IsNewChatSessionContext, SessionEnvironmentPickerVisibleContext, SessionHarnessPickerVisibleContext, SessionWorkspacePickerVisibleContext, SessionBranchPickerVisibleContext, SessionWorktreePickerVisibleContext, SessionSyncActionVisibleContext } from '../../../common/contextkeys.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';

export const FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING = KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyF);
export const FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_KEYBINDING = KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyE);
export const FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING = KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyH);
export const FOCUS_NEW_SESSION_BRANCH_PICKER_KEYBINDING = KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyB);
export const FOCUS_NEW_SESSION_WORKTREE_PICKER_KEYBINDING = KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyT);
export const FOCUS_SESSION_SYNC_ACTION_KEYBINDING = KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyY);

export const FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsNewChatSessionContext,
	ChatContextKeys.enabled,
	ChatContextKeys.inputHasFocus,
	SessionWorkspacePickerVisibleContext,
	ContextKeyExpr.equals(`config.${UNIFIED_WORKSPACE_PICKER_SETTING}`, true),
)!;

export const FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_WHEN = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsNewChatSessionContext,
	ChatContextKeys.enabled,
	ChatContextKeys.inputHasFocus,
	SessionEnvironmentPickerVisibleContext,
)!;

export const FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsNewChatSessionContext,
	ChatContextKeys.enabled,
	ChatContextKeys.inputHasFocus,
	SessionHarnessPickerVisibleContext,
	ContextKeyExpr.equals(`config.${UNIFIED_WORKSPACE_PICKER_SETTING}`, true),
)!;

export const FOCUS_NEW_SESSION_BRANCH_PICKER_WHEN = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsNewChatSessionContext,
	ChatContextKeys.enabled,
	ChatContextKeys.inputHasFocus,
	SessionBranchPickerVisibleContext,
)!;

export const FOCUS_NEW_SESSION_WORKTREE_PICKER_WHEN = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsNewChatSessionContext,
	ChatContextKeys.enabled,
	ChatContextKeys.inputHasFocus,
	SessionWorktreePickerVisibleContext,
)!;

export const FOCUS_SESSION_SYNC_ACTION_WHEN = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsNewChatSessionContext,
	ChatContextKeys.enabled,
	ChatContextKeys.inputHasFocus,
	SessionSyncActionVisibleContext,
)!;

export function registerPickerKeybindingPresentation(
	store: DisposableStore,
	element: HTMLElement,
	label: string,
	commandId: string,
	when: ContextKeyExpression,
	enabled: IObservable<boolean>,
	commandService: ICommandService,
	contextMenuService: IContextMenuService,
	action: Action,
	keybindingService: IKeybindingService,
): void {
	const presentation = store.add(new MutableDisposable<DisposableStore>());
	store.add(autorun(reader => {
		const presentationStore = new DisposableStore();
		const isEnabled = enabled.read(reader);
		const updateHover = () => {
			action.tooltip = isEnabled ? keybindingService.appendKeybinding(label, commandId) : label;
		};
		updateHover();
		presentationStore.add(keybindingService.onDidUpdateKeybindings(updateHover));
		if (isEnabled) {
			presentationStore.add(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, event => {
				dom.EventHelper.stop(event, true);
				const anchor = new StandardMouseEvent(dom.getWindow(element), event);
				contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => [createConfigureKeybindingAction(commandService, keybindingService, commandId, when)],
				});
			}));
		}
		presentation.value = presentationStore;
	}));
}

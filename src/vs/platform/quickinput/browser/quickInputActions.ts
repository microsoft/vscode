/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { PartialExcept } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { ICommandHandler } from '../../commands/common/commands.js';
import { ContextKeyExpr } from '../../contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../contextkey/common/contextkeys.js';
import { ICommandAndKeybindingRule, KeybindingWeight, KeybindingsRegistry } from '../../keybinding/common/keybindingsRegistry.js';
import { endOfQuickInputBoxContext, inQuickInputContext, quickInputTypeContextKeyValue } from './quickInput.js';
import { IQuickInputService, IQuickPick, QuickInputType, QuickPickFocus } from '../common/quickInput.js';

const defaultCommandAndKeybindingRule = {
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(ContextKeyExpr.equals(quickInputTypeContextKeyValue, QuickInputType.QuickPick), inQuickInputContext),
	metadata: { description: localize('quickPick', "Used while in the context of the quick pick. If you change one keybinding for this command, you should change all of the other keybindings (modifier variants) of this command as well.") }
};
function registerQuickPickCommandAndKeybindingRule(rule: PartialExcept<ICommandAndKeybindingRule, 'id' | 'handler'>, options: { withAltMod?: boolean; withCtrlMod?: boolean; withCmdMod?: boolean } = {}) {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		...defaultCommandAndKeybindingRule,
		...rule,
		secondary: getSecondary(rule.primary!, rule.secondary ?? [], options)
	});
}

const ctrlKeyMod = isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd;

// This function will generate all the combinations of keybindings for the given primary keybinding
function getSecondary(primary: number, secondary: number[], options: { withAltMod?: boolean; withCtrlMod?: boolean; withCmdMod?: boolean } = {}): number[] {
	if (options.withAltMod) {
		secondary.push(KeyMod.Alt + primary);
	}
	if (options.withCtrlMod) {
		secondary.push(ctrlKeyMod + primary);
		if (options.withAltMod) {
			secondary.push(KeyMod.Alt + ctrlKeyMod + primary);
		}
	}

	if (options.withCmdMod && isMacintosh) {
		secondary.push(KeyMod.CtrlCmd + primary);
		if (options.withCtrlMod) {
			secondary.push(KeyMod.CtrlCmd + KeyMod.WinCtrl + primary);
		}
		if (options.withAltMod) {
			secondary.push(KeyMod.CtrlCmd + KeyMod.Alt + primary);
			if (options.withCtrlMod) {
				secondary.push(KeyMod.CtrlCmd + KeyMod.Alt + KeyMod.WinCtrl + primary);
			}
		}
	}

	return secondary;
}

//#region Navigation

function focusHandler(focus: QuickPickFocus, focusOnQuickNatigate?: QuickPickFocus): ICommandHandler {
	return accessor => {
		// Assuming this is a quick pick due to above when clause
		const currentQuickPick = accessor.get(IQuickInputService).currentQuickInput as IQuickPick<any> | undefined;
		if (!currentQuickPick) {
			return;
		}
		if (focusOnQuickNatigate && currentQuickPick.quickNavigate) {
			return currentQuickPick.focus(focusOnQuickNatigate);
		}
		return currentQuickPick.focus(focus);
	};
}

registerQuickPickCommandAndKeybindingRule(
	{ id: 'quickInput.pageNext', primary: KeyCode.PageDown, handler: focusHandler(QuickPickFocus.NextPage) },
	{ withAltMod: true, withCtrlMod: true, withCmdMod: true }
);
registerQuickPickCommandAndKeybindingRule(
	{ id: 'quickInput.pagePrevious', primary: KeyCode.PageUp, handler: focusHandler(QuickPickFocus.PreviousPage) },
	{ withAltMod: true, withCtrlMod: true, withCmdMod: true }
);
registerQuickPickCommandAndKeybindingRule(
	{ id: 'quickInput.first', primary: ctrlKeyMod + KeyCode.Home, handler: focusHandler(QuickPickFocus.First) },
	{ withAltMod: true, withCmdMod: true }
);
registerQuickPickCommandAndKeybindingRule(
	{ id: 'quickInput.last', primary: ctrlKeyMod + KeyCode.End, handler: focusHandler(QuickPickFocus.Last) },
	{ withAltMod: true, withCmdMod: true }
);
registerQuickPickCommandAndKeybindingRule(
	{ id: 'quickInput.next', primary: KeyCode.DownArrow, handler: focusHandler(QuickPickFocus.Next) },
	{ withCtrlMod: true }
);
registerQuickPickCommandAndKeybindingRule(
	{ id: 'quickInput.previous', primary: KeyCode.UpArrow, handler: focusHandler(QuickPickFocus.Previous) },
	{ withCtrlMod: true }
);

// The next & previous separator commands are interesting because if we are in quick access mode, we are already holding a modifier key down.
// In this case, we want that modifier key+up/down to navigate to the next/previous item, not the next/previous separator.
// To handle this, we have a separate command for navigating to the next/previous separator when we are not in quick access mode.
// If, however, we are in quick access mode, and you hold down an additional modifier key, we will navigate to the next/previous separator.

const nextSeparatorFallbackDesc = localize('quickInput.nextSeparatorWithQuickAccessFallback', "If we're in quick access mode, this will navigate to the next item. If we are not in quick access mode, this will navigate to the next separator.");
const prevSeparatorFallbackDesc = localize('quickInput.previousSeparatorWithQuickAccessFallback', "If we're in quick access mode, this will navigate to the previous item. If we are not in quick access mode, this will navigate to the previous separator.");
if (isMacintosh) {
	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.nextSeparatorWithQuickAccessFallback',
			primary: KeyMod.CtrlCmd + KeyCode.DownArrow,
			handler: focusHandler(QuickPickFocus.NextSeparator, QuickPickFocus.Next),
			metadata: { description: nextSeparatorFallbackDesc }
		},
	);
	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.nextSeparator',
			primary: KeyMod.CtrlCmd + KeyMod.Alt + KeyCode.DownArrow,
			// Since macOS has the cmd key as the primary modifier, we need to add this additional
			// keybinding to capture cmd+ctrl+upArrow
			secondary: [KeyMod.CtrlCmd + KeyMod.WinCtrl + KeyCode.DownArrow],
			handler: focusHandler(QuickPickFocus.NextSeparator)
		},
		{ withCtrlMod: true }
	);

	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.previousSeparatorWithQuickAccessFallback',
			primary: KeyMod.CtrlCmd + KeyCode.UpArrow,
			handler: focusHandler(QuickPickFocus.PreviousSeparator, QuickPickFocus.Previous),
			metadata: { description: prevSeparatorFallbackDesc }
		},
	);
	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.previousSeparator',
			primary: KeyMod.CtrlCmd + KeyMod.Alt + KeyCode.UpArrow,
			// Since macOS has the cmd key as the primary modifier, we need to add this additional
			// keybinding to capture cmd+ctrl+upArrow
			secondary: [KeyMod.CtrlCmd + KeyMod.WinCtrl + KeyCode.UpArrow],
			handler: focusHandler(QuickPickFocus.PreviousSeparator)
		},
		{ withCtrlMod: true }
	);
} else {
	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.nextSeparatorWithQuickAccessFallback',
			primary: KeyMod.Alt + KeyCode.DownArrow,
			handler: focusHandler(QuickPickFocus.NextSeparator, QuickPickFocus.Next),
			metadata: { description: nextSeparatorFallbackDesc }
		},
	);
	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.nextSeparator',
			primary: KeyMod.CtrlCmd + KeyMod.Alt + KeyCode.DownArrow,
			handler: focusHandler(QuickPickFocus.NextSeparator)
		},
	);

	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.previousSeparatorWithQuickAccessFallback',
			primary: KeyMod.Alt + KeyCode.UpArrow,
			handler: focusHandler(QuickPickFocus.PreviousSeparator, QuickPickFocus.Previous),
			metadata: { description: prevSeparatorFallbackDesc }
		},
	);
	registerQuickPickCommandAndKeybindingRule(
		{
			id: 'quickInput.previousSeparator',
			primary: KeyMod.CtrlCmd + KeyMod.Alt + KeyCode.UpArrow,
			handler: focusHandler(QuickPickFocus.PreviousSeparator)
		},
	);
}

//#endregion

//#region Accept

registerQuickPickCommandAndKeybindingRule(
	{
		id: 'quickInput.acceptInBackground',
		// If we are in the quick pick but the input box is not focused or our cursor is at the end of the input box
		when: ContextKeyExpr.and(defaultCommandAndKeybindingRule.when, ContextKeyExpr.or(InputFocusedContext.negate(), endOfQuickInputBoxContext)),
		primary: KeyCode.RightArrow,
		// Need a little extra weight to ensure this keybinding is preferred over the default cmd+alt+right arrow keybinding
		// https://github.com/microsoft/vscode/blob/1451e4fbbbf074a4355cc537c35b547b80ce1c52/src/vs/workbench/browser/parts/editor/editorActions.ts#L1178-L1195
		weight: KeybindingWeight.WorkbenchContrib + 50,
		handler: (accessor) => {
			const currentQuickPick = accessor.get(IQuickInputService).currentQuickInput as IQuickPick<any>;
			currentQuickPick?.accept(true);
		},
	},
	{ withAltMod: true, withCtrlMod: true, withCmdMod: true }
);

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyCodeUtils, KeyMod } from 'vs/base/common/keyCodes';
import { isMacintosh } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { inQuickInputContext } from 'vs/platform/quickinput/browser/quickInput';
import { IQuickInputService, IQuickPick, QuickPickFocus } from 'vs/platform/quickinput/common/quickInput';

function registerQuickInputCommandAndKeybindingRule(id: string, primary: number, handler: ICommandHandler, description?: string) {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id,
		weight: KeybindingWeight.WorkbenchContrib,
		when: inQuickInputContext,
		primary,
		handler,
		metadata: description ? { description } : undefined
	});
}

function registerQuickInputCommandAndKeybindingRules(baseId: string, primary: number, handler: ICommandHandler, options: { withAltMod?: boolean; withCtrlMod?: boolean; withCmdMod?: boolean } = {}) {
	registerQuickInputCommandAndKeybindingRule(baseId, primary, handler);
	let index = 1;
	const getName = () => baseId + 'Alternative' + index++;
	const getDesc = (modifiers: KeyCode[]) => localize('alternateKeybinding', "An alternative keybinding for the command '{0}'. Usually set to what that command is set to with additional modifier(s): {1}", baseId, modifiers.map(KeyCodeUtils.toString).join(', '));
	if (options.withAltMod) {
		registerQuickInputCommandAndKeybindingRule(getName(), KeyMod.Alt + primary, handler, getDesc([KeyCode.Alt]));
	}
	const ctrlKeyMod = isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd;
	if (options.withCtrlMod) {
		registerQuickInputCommandAndKeybindingRule(getName(), ctrlKeyMod + primary, handler, getDesc([KeyCode.Ctrl]));
	}
	if (options.withAltMod && options.withCtrlMod) {
		registerQuickInputCommandAndKeybindingRule(getName(), KeyMod.Alt + ctrlKeyMod + primary, handler, getDesc([KeyCode.Alt, KeyCode.Ctrl]));
	}
	if (options.withCmdMod && isMacintosh) {
		registerQuickInputCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + primary, handler, getDesc([KeyCode.Meta]));
		registerQuickInputCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + KeyMod.Alt + primary, handler, getDesc([KeyCode.Meta, KeyCode.Alt]));
		registerQuickInputCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + KeyMod.WinCtrl + primary, handler, getDesc([KeyCode.Meta, KeyCode.Ctrl]));
		registerQuickInputCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + KeyMod.Alt + KeyMod.WinCtrl + primary, handler, getDesc([KeyCode.Meta, KeyCode.Alt, KeyCode.Ctrl]));
	}
}

//#region Navigation

/**
 * Generate the handler for the command being registered
 * @param focus What to focus
 * @param focusOnQuickNatigate What to focus if we are in quick navigate mode
 * @returns A command handler
 */
function focusHandler(focus: QuickPickFocus, focusOnQuickNatigate?: QuickPickFocus): ICommandHandler {
	return accessor => {
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

registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.pageNext', KeyCode.PageDown, focusHandler(QuickPickFocus.NextPage), { withAltMod: true, withCtrlMod: true, withCmdMod: true });
registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.pagePrevious', KeyCode.PageUp, focusHandler(QuickPickFocus.PreviousPage), { withAltMod: true, withCtrlMod: true, withCmdMod: true });
registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.first', KeyCode.Home, focusHandler(QuickPickFocus.First), { withAltMod: true, withCtrlMod: true, withCmdMod: true });
registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.last', KeyCode.End, focusHandler(QuickPickFocus.Last), { withAltMod: true, withCtrlMod: true, withCmdMod: true });

registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.next', KeyCode.DownArrow, focusHandler(QuickPickFocus.Next), { withCtrlMod: true });
registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.previous', KeyCode.UpArrow, focusHandler(QuickPickFocus.Previous), { withCtrlMod: true });

const nextSeparatorFallbackDesc = localize('workbench.action.quickInput.nextSeparatorWithQuickAccessFallback', "Navigates to the next separator but only if we are not in quick access mode.");
const prevSeparatorFallbackDesc = localize('workbench.action.quickInput.previousSeparatorWithQuickAccessFallback', "Navigates to the previous separator but only if we are not in quick access mode.");
if (isMacintosh) {
	registerQuickInputCommandAndKeybindingRule('workbench.action.quickInput.nextSeparatorWithQuickAccessFallback', KeyMod.CtrlCmd + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator, QuickPickFocus.Next), nextSeparatorFallbackDesc);
	registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.nextSeparator', KeyMod.Alt + KeyMod.CtrlCmd + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator), { withCtrlMod: true });

	registerQuickInputCommandAndKeybindingRule('workbench.action.quickInput.previousSeparatorWithQuickAccessFallback', KeyMod.CtrlCmd + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator, QuickPickFocus.Previous), prevSeparatorFallbackDesc);
	registerQuickInputCommandAndKeybindingRules('workbench.action.quickInput.previousSeparator', KeyMod.Alt + KeyMod.CtrlCmd + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator), { withCtrlMod: true });
} else {
	registerQuickInputCommandAndKeybindingRule('workbench.action.quickInput.nextSeparatorWithQuickAccessFallback', KeyMod.Alt + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator, QuickPickFocus.Next), nextSeparatorFallbackDesc);
	registerQuickInputCommandAndKeybindingRule('workbench.action.quickInput.nextSeparator', KeyMod.WinCtrl + KeyMod.Alt + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator));

	registerQuickInputCommandAndKeybindingRule('workbench.action.quickInput.previousSeparatorWithQuickAccessFallback', KeyMod.Alt + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator, QuickPickFocus.Previous), prevSeparatorFallbackDesc);
	registerQuickInputCommandAndKeybindingRule('workbench.action.quickInput.previousSeparator', KeyMod.WinCtrl + KeyMod.Alt + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator));
}

//#endregion

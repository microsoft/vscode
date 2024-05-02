/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyCodeUtils, KeyMod } from 'vs/base/common/keyCodes';
import { isMacintosh } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommandAndKeybindingRule, KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { inQuickInputContext, quickInputTypeContextKeyValue } from 'vs/platform/quickinput/browser/quickInput';
import { IQuickInputService, IQuickPick, QuickInputType, QuickPickFocus } from 'vs/platform/quickinput/common/quickInput';

// function registerQuickPickCommandAndKeybindingRule(id: string, primary: number, handler: ICommandHandler, description?: string) {
// 	KeybindingsRegistry.registerCommandAndKeybindingRule({
// 		id,
// 		weight: KeybindingWeight.WorkbenchContrib,
// 		when: ContextKeyExpr.and(ContextKeyExpr.equals(quickInputTypeContextKeyValue, QuickInputType.QuickPick), inQuickInputContext),
// 		primary,
// 		handler,
// 		metadata: description ? { description } : undefined
// 	});
// }

// function registerQuickPickCommandAndKeybindingRules(baseId: string, primary: number, handler: ICommandHandler, options: { withAltMod?: boolean; withCtrlMod?: boolean; withCmdMod?: boolean } = {}) {
// 	registerQuickPickCommandAndKeybindingRule(baseId, primary, handler);
// 	let index = 1;
// 	const getName = () => baseId + 'Alternative' + index++;
// 	const getDesc = (modifiers: KeyCode[]) => localize('alternateKeybinding', "An alternative keybinding for the command '{0}'. Usually set to what that command is set to with additional modifier(s): {1}", baseId, modifiers.map(KeyCodeUtils.toString).join(', '));
// 	if (options.withAltMod) {
// 		registerQuickPickCommandAndKeybindingRule(getName(), KeyMod.Alt + primary, handler, getDesc([KeyCode.Alt]));
// 	}
// 	const ctrlKeyMod = isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd;
// 	if (options.withCtrlMod) {
// 		registerQuickPickCommandAndKeybindingRule(getName(), ctrlKeyMod + primary, handler, getDesc([KeyCode.Ctrl]));
// 	}
// 	if (options.withAltMod && options.withCtrlMod) {
// 		registerQuickPickCommandAndKeybindingRule(getName(), KeyMod.Alt + ctrlKeyMod + primary, handler, getDesc([KeyCode.Alt, KeyCode.Ctrl]));
// 	}
// 	if (options.withCmdMod && isMacintosh) {
// 		registerQuickPickCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + primary, handler, getDesc([KeyCode.Meta]));
// 		registerQuickPickCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + KeyMod.Alt + primary, handler, getDesc([KeyCode.Meta, KeyCode.Alt]));
// 		registerQuickPickCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + KeyMod.WinCtrl + primary, handler, getDesc([KeyCode.Meta, KeyCode.Ctrl]));
// 		registerQuickPickCommandAndKeybindingRule(getName(), KeyMod.CtrlCmd + KeyMod.Alt + KeyMod.WinCtrl + primary, handler, getDesc([KeyCode.Meta, KeyCode.Alt, KeyCode.Ctrl]));
// 	}
// }

// //#region Navigation

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

// registerQuickPickCommandAndKeybindingRules('quickInput.pageNext', KeyCode.PageDown, focusHandler(QuickPickFocus.NextPage), { withAltMod: true, withCtrlMod: true, withCmdMod: true });
// registerQuickPickCommandAndKeybindingRules('quickInput.pagePrevious', KeyCode.PageUp, focusHandler(QuickPickFocus.PreviousPage), { withAltMod: true, withCtrlMod: true, withCmdMod: true });
// registerQuickPickCommandAndKeybindingRules('quickInput.first', KeyCode.Home, focusHandler(QuickPickFocus.First), { withAltMod: true, withCtrlMod: true, withCmdMod: true });
// registerQuickPickCommandAndKeybindingRules('quickInput.last', KeyCode.End, focusHandler(QuickPickFocus.Last), { withAltMod: true, withCtrlMod: true, withCmdMod: true });

// registerQuickPickCommandAndKeybindingRules('quickInput.next', KeyCode.DownArrow, focusHandler(QuickPickFocus.Next), { withCtrlMod: true });
// registerQuickPickCommandAndKeybindingRules('quickInput.previous', KeyCode.UpArrow, focusHandler(QuickPickFocus.Previous), { withCtrlMod: true });

// const nextSeparatorFallbackDesc = localize('quickInput.nextSeparatorWithQuickAccessFallback', "Navigates to the next separator but only if we are not in quick access mode.");
// const prevSeparatorFallbackDesc = localize('quickInput.previousSeparatorWithQuickAccessFallback', "Navigates to the previous separator but only if we are not in quick access mode.");
// if (isMacintosh) {
// 	registerQuickPickCommandAndKeybindingRule('quickInput.nextSeparatorWithQuickAccessFallback', KeyMod.CtrlCmd + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator, QuickPickFocus.Next), nextSeparatorFallbackDesc);
// 	registerQuickPickCommandAndKeybindingRules('quickInput.nextSeparator', KeyMod.Alt + KeyMod.CtrlCmd + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator), { withCtrlMod: true });

// 	registerQuickPickCommandAndKeybindingRules('quickInput.previousSeparatorWithQuickAccessFallback', KeyMod.CtrlCmd + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator, QuickPickFocus.Previous), { withCtrlMod: true });
// 	registerQuickPickCommandAndKeybindingRules('quickInput.previousSeparator', KeyMod.Alt + KeyMod.CtrlCmd + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator), { withCtrlMod: true });
// } else {
// 	registerQuickPickCommandAndKeybindingRule('quickInput.nextSeparatorWithQuickAccessFallback', KeyMod.Alt + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator, QuickPickFocus.Next), nextSeparatorFallbackDesc);
// 	registerQuickPickCommandAndKeybindingRule('quickInput.nextSeparator', KeyMod.CtrlCmd + KeyMod.Alt + KeyCode.DownArrow, focusHandler(QuickPickFocus.NextSeparator));

// 	registerQuickPickCommandAndKeybindingRule('quickInput.previousSeparatorWithQuickAccessFallback', KeyMod.Alt + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator, QuickPickFocus.Previous), prevSeparatorFallbackDesc);
// 	registerQuickPickCommandAndKeybindingRule('quickInput.previousSeparator', KeyMod.CtrlCmd + KeyMod.Alt + KeyCode.UpArrow, focusHandler(QuickPickFocus.PreviousSeparator));
// }

// //#endregion

// // interface IRegisterOptions { id: string; weight?: KeybindingWeight; primary?: number; handler: ICommandHandler; descriptin }

// // function registerQuickPickCommandAndKeybindingRule(options: { id: string; weight?: KeybindingWeight; primary?: number; handler: ICommandHandler; descriptin }) {
// // 	KeybindingsRegistry.registerCommandAndKeybindingRule({
// // 		id,
// // 		weight: KeybindingWeight.WorkbenchContrib,
// // 		when: ContextKeyExpr.and(ContextKeyExpr.equals(quickInputTypeContextKeyValue, QuickInputType.QuickPick), inQuickInputContext),
// // 		primary,
// // 		handler,
// // 		metadata: description ? { description } : undefined
// // 	});
// // }

// KeybindingsRegistry.registerCommandAndKeybindingRule({
// 	id: 'quickInput.next',
// 	weight: KeybindingWeight.WorkbenchContrib,
// 	when: ContextKeyExpr.and(ContextKeyExpr.equals(quickInputTypeContextKeyValue, QuickInputType.QuickPick), inQuickInputContext),
// 	primary: KeyCode.DownArrow,
// 	secondary: [KeyMod.CtrlCmd + KeyCode.DownArrow, KeyMod.Alt + KeyCode.DownArrow, KeyMod.CtrlCmd + KeyMod.Alt + KeyCode.DownArrow],
// 	handler: focusHandler(QuickPickFocus.Next),
// });

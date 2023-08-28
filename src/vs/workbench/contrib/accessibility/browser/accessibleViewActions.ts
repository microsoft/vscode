/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Command, MultiCommand, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { AccessibleViewProviderId, accessibilityHelpIsShown, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewIsShown, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { alert } from 'vs/base/browser/ui/aria/aria';

const accessibleViewMenu = {
	id: MenuId.AccessibleView,
	group: 'navigation',
	when: accessibleViewIsShown
};
const commandPalette = {
	id: MenuId.CommandPalette,
	group: '',
	order: 1
};
class AccessibleViewNextAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.ShowNext,
			precondition: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.BracketRight,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: [
				commandPalette,
				{
					...accessibleViewMenu,
					when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
				}],
			icon: Codicon.chevronRight,
			title: localize('editor.action.accessibleViewNext', "Show Next in Accessible View")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).next();
	}
}
registerAction2(AccessibleViewNextAction);


class AccessibleViewPreviousAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.ShowPrevious,
			precondition: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.BracketLeft,
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: Codicon.chevronLeft,
			menu: [
				commandPalette,
				{
					...accessibleViewMenu,
					when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
				}
			],
			title: localize('editor.action.accessibleViewPrevious', "Show Previous in Accessible View")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).previous();
	}
}
registerAction2(AccessibleViewPreviousAction);


class AccessibleViewGoToSymbolAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.GoToSymbol,
			precondition: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewGoToSymbolSupported),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period],
				weight: KeybindingWeight.WorkbenchContrib + 10
			},
			icon: Codicon.symbolField,
			menu: [
				commandPalette,
				{
					...accessibleViewMenu,
					when: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewGoToSymbolSupported),
				}
			],
			title: localize('editor.action.accessibleViewGoToSymbol', "Go To Symbol in Accessible View")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).goToSymbol();
	}
}
registerAction2(AccessibleViewGoToSymbolAction);

function registerCommand<T extends Command>(command: T): T {
	command.register();
	return command;
}

export const AccessibilityHelpAction = registerCommand(new MultiCommand({
	id: AccessibilityCommandId.OpenAccessibilityHelp,
	precondition: undefined,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.F1,
		weight: KeybindingWeight.WorkbenchContrib,
		linux: {
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F1,
			secondary: [KeyMod.Alt | KeyCode.F1]
		}
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibilityHelp', "Open Accessibility Help"),
		order: 1
	}],
}));


export const AccessibleViewAction = registerCommand(new MultiCommand({
	id: AccessibilityCommandId.OpenAccessibleView,
	precondition: undefined,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.F2,
		weight: KeybindingWeight.WorkbenchContrib,
		linux: {
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F2,
			secondary: [KeyMod.Alt | KeyCode.F2]
		}
	},
	menuOpts: [{
		menuId: MenuId.CommandPalette,
		group: '',
		title: localize('editor.action.accessibleView', "Open Accessible View"),
		order: 1
	}],
}));

class AccessibleViewDisableHintAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.DisableVerbosityHint,
			precondition: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewVerbosityEnabled),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.F6,
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: Codicon.treeFilterClear,
			menu: [
				commandPalette,
				{
					id: MenuId.AccessibleView,
					group: 'navigation',
					when: ContextKeyExpr.and(ContextKeyExpr.or(accessibleViewIsShown, accessibilityHelpIsShown), accessibleViewVerbosityEnabled),
				}
			],
			title: localize('editor.action.accessibleViewDisableHint', "Disable Accessible View Hint")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).disableHint();
	}
}
registerAction2(AccessibleViewDisableHintAction);

class AccessibleViewAcceptInlineCompletionAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.AccessibleViewAcceptInlineCompletion,
			precondition: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.InlineCompletions)),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Slash,
				mac: { primary: KeyMod.WinCtrl | KeyCode.Slash },
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: Codicon.check,
			menu: [
				commandPalette,
				{
					id: MenuId.AccessibleView,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.InlineCompletions))
				}],
			title: localize('editor.action.accessibleViewAcceptInlineCompletionAction', "Accept Inline Completion")
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!editor) {
			return;
		}
		const model = InlineCompletionsController.get(editor)?.model.get();
		const state = model?.state.get();
		if (!model || !state) {
			return;
		}
		await model.accept(editor);
		alert('Accepted');
		model.stop();
		editor.focus();
	}
}
registerAction2(AccessibleViewAcceptInlineCompletionAction);

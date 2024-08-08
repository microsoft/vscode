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
import { accessibilityHelpIsShown, accessibleViewContainsCodeBlocks, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewHasAssignedKeybindings, accessibleViewHasUnassignedKeybindings, accessibleViewIsShown, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewProviderId, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';

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
			icon: Codicon.arrowDown,
			title: localize('editor.action.accessibleViewNext', "Show Next in Accessible View")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).next();
	}
}
registerAction2(AccessibleViewNextAction);


class AccessibleViewNextCodeBlockAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.NextCodeBlock,
			precondition: ContextKeyExpr.and(accessibleViewContainsCodeBlocks, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Chat)),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown, },
				weight: KeybindingWeight.WorkbenchContrib,
			},
			icon: Codicon.arrowRight,
			menu:
			{
				...accessibleViewMenu,
				when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewContainsCodeBlocks),
			},
			title: localize('editor.action.accessibleViewNextCodeBlock', "Accessible View: Next Code Block")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).navigateToCodeBlock('next');
	}
}
registerAction2(AccessibleViewNextCodeBlockAction);


class AccessibleViewPreviousCodeBlockAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.PreviousCodeBlock,
			precondition: ContextKeyExpr.and(accessibleViewContainsCodeBlocks, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Chat)),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp, },
				weight: KeybindingWeight.WorkbenchContrib,
			},
			icon: Codicon.arrowLeft,
			menu: {
				...accessibleViewMenu,
				when: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewContainsCodeBlocks),
			},
			title: localize('editor.action.accessibleViewPreviousCodeBlock', "Accessible View: Previous Code Block")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).navigateToCodeBlock('previous');
	}
}
registerAction2(AccessibleViewPreviousCodeBlockAction);

class AccessibleViewPreviousAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.ShowPrevious,
			precondition: ContextKeyExpr.and(accessibleViewIsShown, accessibleViewSupportsNavigation),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.BracketLeft,
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: Codicon.arrowUp,
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
		},
		kbExpr: accessibilityHelpIsShown.toNegated()
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
			icon: Codicon.bellSlash,
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

class AccessibilityHelpConfigureKeybindingsAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.AccessibilityHelpConfigureKeybindings,
			precondition: ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewHasUnassignedKeybindings),
			icon: Codicon.key,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.KeyK,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: [
				{
					id: MenuId.AccessibleView,
					group: 'navigation',
					order: 3,
					when: accessibleViewHasUnassignedKeybindings,
				}
			],
			title: localize('editor.action.accessibilityHelpConfigureUnassignedKeybindings', "Accessibility Help Configure Unassigned Keybindings")
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IAccessibleViewService).configureKeybindings(true);
	}
}
registerAction2(AccessibilityHelpConfigureKeybindingsAction);

class AccessibilityHelpConfigureAssignedKeybindingsAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.AccessibilityHelpConfigureAssignedKeybindings,
			precondition: ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewHasAssignedKeybindings),
			icon: Codicon.key,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: [
				{
					id: MenuId.AccessibleView,
					group: 'navigation',
					order: 4,
					when: accessibleViewHasAssignedKeybindings,
				}
			],
			title: localize('editor.action.accessibilityHelpConfigureAssignedKeybindings', "Accessibility Help Configure Assigned Keybindings")
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IAccessibleViewService).configureKeybindings(false);
	}
}
registerAction2(AccessibilityHelpConfigureAssignedKeybindingsAction);


class AccessibilityHelpOpenHelpLinkAction extends Action2 {
	constructor() {
		super({
			id: AccessibilityCommandId.AccessibilityHelpOpenHelpLink,
			precondition: ContextKeyExpr.and(accessibilityHelpIsShown),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.KeyH,
				weight: KeybindingWeight.WorkbenchContrib
			},
			title: localize('editor.action.accessibilityHelpOpenHelpLink', "Accessibility Help Open Help Link")
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IAccessibleViewService).openHelpLink();
	}
}
registerAction2(AccessibilityHelpOpenHelpLinkAction);

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
		model.stop();
		editor.focus();
	}
}
registerAction2(AccessibleViewAcceptInlineCompletionAction);


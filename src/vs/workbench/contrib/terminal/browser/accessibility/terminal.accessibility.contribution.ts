/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TerminalLocation, terminalTabFocusContextKey } from 'vs/platform/terminal/common/terminal';
import { editorTabFocusContextKey } from 'vs/workbench/browser/parts/editor/tabFocus';
import { AccessibilityHelpWidget } from 'vs/workbench/contrib/terminal/browser/accessibility/terminalAccessibilityHelp';
import { AccessibleBufferWidget } from 'vs/workbench/contrib/terminal/browser/accessibility/terminalAccessibleBuffer';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';

const category = terminalStrings.actionCategory;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.ShowTerminalAccessibilityHelp,
			title: { value: localize('workbench.action.terminal.showAccessibilityHelp', "Show Terminal Accessibility Help"), original: 'Show Terminal Accessibility Help' },
			f1: true,
			category,
			precondition: ContextKeyExpr.and(TerminalContextKeys.processSupported),
			keybinding: {
				primary: KeyMod.Alt | KeyCode.F1,
				weight: KeybindingWeight.WorkbenchContrib,
				linux: {
					primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F1,
					secondary: [KeyMod.Alt | KeyCode.F1]
				},
				when: TerminalContextKeys.focus
			}
		});
	}
	async run(accessor: ServicesAccessor) {
		const instantiationService = accessor.get(IInstantiationService);
		const terminalService = accessor.get(ITerminalService);
		const terminalGroupService = accessor.get(ITerminalGroupService);
		const terminalEditorService = accessor.get(ITerminalEditorService);

		const instance = await terminalService.getActiveOrCreateInstance();
		await revealActiveTerminal(instance, terminalEditorService, terminalGroupService);

		const widget = instantiationService.createInstance(AccessibilityHelpWidget, instance);
		instance.registerChildElement({
			element: widget.element
		});
		widget.show();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.FocusAccessibleBuffer,
			title: { value: localize('workbench.action.terminal.focusAccessibleBuffer', 'Focus Accessible Buffer'), original: 'Focus Accessible Buffer' },
			f1: true,
			category,
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
			keybinding: [
				{
					primary: KeyMod.Shift | KeyCode.Tab,
					weight: KeybindingWeight.WorkbenchContrib,
					when: ContextKeyExpr.or(terminalTabFocusContextKey, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, editorTabFocusContextKey))
				}
			],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const terminalService = accessor.get(ITerminalService);
		const terminalGroupService = accessor.get(ITerminalGroupService);
		const terminalEditorService = accessor.get(ITerminalEditorService);

		const instance = await terminalService.getActiveOrCreateInstance();
		await revealActiveTerminal(instance, terminalEditorService, terminalGroupService);
		const terminal = instance.xterm;
		if (!terminal) {
			return;
		}
		instantiationService.createInstance(AccessibleBufferWidget, terminal, instance.capabilities).show();
	}
});

async function revealActiveTerminal(instance: ITerminalInstance, terminalEditorService: ITerminalEditorService, terminalGroupService: ITerminalGroupService): Promise<void> {
	if (instance.target === TerminalLocation.Editor) {
		await terminalEditorService.revealActiveEditor();
	} else {
		await terminalGroupService.showPanel();
	}
}

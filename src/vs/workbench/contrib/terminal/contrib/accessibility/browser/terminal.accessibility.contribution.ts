/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { AccessibilityHelpWidget } from 'vs/workbench/contrib/terminal/contrib/accessibility/browser/terminalAccessibilityHelp';
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

async function revealActiveTerminal(instance: ITerminalInstance, terminalEditorService: ITerminalEditorService, terminalGroupService: ITerminalGroupService): Promise<void> {
	if (instance.target === TerminalLocation.Editor) {
		await terminalEditorService.revealActiveEditor();
	} else {
		await terminalGroupService.showPanel();
	}
}

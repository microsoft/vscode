/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IStatusbarService } from 'vs/workbench/services/statusbar/browser/statusbar';
import { Action } from 'vs/base/common/actions';
import { Parts, IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { StatusbarViewModel } from 'vs/workbench/browser/parts/statusbar/statusbarModel';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_STATUS_BAR_FOCUSED = new RawContextKey<boolean>('statusBarFocused', false, localize('statusBarFocused', "Whether the status bar has keyboard focus"));

export class ToggleStatusbarEntryVisibilityAction extends Action {

	constructor(id: string, label: string, private model: StatusbarViewModel) {
		super(id, label, undefined, true);

		this.checked = !model.isHidden(id);
	}

	override async run(): Promise<void> {
		if (this.model.isHidden(this.id)) {
			this.model.show(this.id);
		} else {
			this.model.hide(this.id);
		}
	}
}

export class HideStatusbarEntryAction extends Action {

	constructor(id: string, name: string, private model: StatusbarViewModel) {
		super(id, localize('hide', "Hide '{0}'", name), undefined, true);
	}

	override async run(): Promise<void> {
		this.model.hide(this.id);
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.statusBar.focusPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.LeftArrow,
	secondary: [KeyCode.UpArrow],
	when: CONTEXT_STATUS_BAR_FOCUSED,
	handler: (accessor: ServicesAccessor) => {
		const statusBarService = accessor.get(IStatusbarService);
		statusBarService.focusPreviousEntry();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.statusBar.focusNext',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.RightArrow,
	secondary: [KeyCode.DownArrow],
	when: CONTEXT_STATUS_BAR_FOCUSED,
	handler: (accessor: ServicesAccessor) => {
		const statusBarService = accessor.get(IStatusbarService);
		statusBarService.focusNextEntry();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.statusBar.focusFirst',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.Home,
	when: CONTEXT_STATUS_BAR_FOCUSED,
	handler: (accessor: ServicesAccessor) => {
		const statusBarService = accessor.get(IStatusbarService);
		statusBarService.focus(false);
		statusBarService.focusNextEntry();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.statusBar.focusLast',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.End,
	when: CONTEXT_STATUS_BAR_FOCUSED,
	handler: (accessor: ServicesAccessor) => {
		const statusBarService = accessor.get(IStatusbarService);
		statusBarService.focus(false);
		statusBarService.focusPreviousEntry();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.statusBar.clearFocus',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.Escape,
	when: CONTEXT_STATUS_BAR_FOCUSED,
	handler: (accessor: ServicesAccessor) => {
		const statusBarService = accessor.get(IStatusbarService);
		const editorService = accessor.get(IEditorService);
		if (statusBarService.isEntryFocused()) {
			statusBarService.focus(false);
		} else if (editorService.activeEditorPane) {
			editorService.activeEditorPane.focus();
		}
	}
});

class FocusStatusBarAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.focusStatusBar',
			title: { value: localize('focusStatusBar', "Focus Status Bar"), original: 'Focus Status Bar' },
			category: CATEGORIES.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.focusPart(Parts.STATUSBAR_PART);
	}
}

registerAction2(FocusStatusBarAction);

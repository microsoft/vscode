/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIconSelectBoxOptions, IconSelectBox } from 'vs/base/browser/ui/icons/iconSelectBox';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export const WorkbenchIconSelectBoxFocusContextKey = new RawContextKey<boolean>('iconSelectBoxFocus', true);

export class WorkbenchIconSelectBox extends IconSelectBox {

	private static focusedWidget: WorkbenchIconSelectBox | undefined;
	static getFocusedWidget(): WorkbenchIconSelectBox | undefined {
		return WorkbenchIconSelectBox.focusedWidget;
	}

	constructor(
		options: IIconSelectBoxOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(options);
		WorkbenchIconSelectBoxFocusContextKey.bindTo(this._register(contextKeyService.createScoped(this.domNode)));
	}

	override focus(): void {
		super.focus();
		WorkbenchIconSelectBox.focusedWidget = this;
	}

}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'iconSelectBox.focusUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchIconSelectBoxFocusContextKey,
	primary: KeyCode.UpArrow,
	handler: (accessor, arg2) => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.focusPreviousRow();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'iconSelectBox.focusDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchIconSelectBoxFocusContextKey,
	primary: KeyCode.DownArrow,
	handler: (accessor, arg2) => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.focusNextRow();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'iconSelectBox.focusNext',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchIconSelectBoxFocusContextKey,
	primary: KeyCode.RightArrow,
	handler: (accessor, arg2) => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.focusNext();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'iconSelectBox.focusPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchIconSelectBoxFocusContextKey,
	primary: KeyCode.LeftArrow,
	handler: (accessor, arg2) => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.focusPrevious();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'iconSelectBox.selectFocused',
	weight: KeybindingWeight.WorkbenchContrib,
	when: WorkbenchIconSelectBoxFocusContextKey,
	primary: KeyCode.Enter,
	handler: (accessor, arg2) => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.setSelection(selectBox.getFocus()[0]);
		}
	}
});

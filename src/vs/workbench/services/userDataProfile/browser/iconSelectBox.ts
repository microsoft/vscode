/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIconSelectBoxOptions, IconSelectBox } from '../../../../base/browser/ui/icons/iconSelectBox.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import * as dom from '../../../../base/browser/dom.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

export const WorkbenchIconSelectBoxFocusContextKey = new RawContextKey<boolean>('iconSelectBoxFocus', true);
export const WorkbenchIconSelectBoxInputFocusContextKey = new RawContextKey<boolean>('iconSelectBoxInputFocus', true);
export const WorkbenchIconSelectBoxInputEmptyContextKey = new RawContextKey<boolean>('iconSelectBoxInputEmpty', true);

export class WorkbenchIconSelectBox extends IconSelectBox {

	private static focusedWidget: WorkbenchIconSelectBox | undefined;
	static getFocusedWidget(): WorkbenchIconSelectBox | undefined {
		return WorkbenchIconSelectBox.focusedWidget;
	}

	private readonly contextKeyService: IContextKeyService;
	private readonly inputFocusContextKey: IContextKey<boolean>;
	private readonly inputEmptyContextKey: IContextKey<boolean>;

	constructor(
		options: IIconSelectBoxOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(options);
		this.contextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		WorkbenchIconSelectBoxFocusContextKey.bindTo(this.contextKeyService);
		this.inputFocusContextKey = WorkbenchIconSelectBoxInputFocusContextKey.bindTo(this.contextKeyService);
		this.inputEmptyContextKey = WorkbenchIconSelectBoxInputEmptyContextKey.bindTo(this.contextKeyService);
		if (this.inputBox) {
			const focusTracker = this._register(dom.trackFocus(this.inputBox.inputElement));
			this._register(focusTracker.onDidFocus(() => this.inputFocusContextKey.set(true)));
			this._register(focusTracker.onDidBlur(() => this.inputFocusContextKey.set(false)));
			this._register(this.inputBox.onDidChange(() => this.inputEmptyContextKey.set(this.inputBox?.value.length === 0)));
		}
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
	handler: () => {
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
	handler: () => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.focusNextRow();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'iconSelectBox.focusNext',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchIconSelectBoxFocusContextKey, ContextKeyExpr.or(WorkbenchIconSelectBoxInputEmptyContextKey, WorkbenchIconSelectBoxInputFocusContextKey.toNegated())),
	primary: KeyCode.RightArrow,
	handler: () => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.focusNext();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'iconSelectBox.focusPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WorkbenchIconSelectBoxFocusContextKey, ContextKeyExpr.or(WorkbenchIconSelectBoxInputEmptyContextKey, WorkbenchIconSelectBoxInputFocusContextKey.toNegated())),
	primary: KeyCode.LeftArrow,
	handler: () => {
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
	handler: () => {
		const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
		if (selectBox) {
			selectBox.setSelection(selectBox.getFocus()[0]);
		}
	}
});

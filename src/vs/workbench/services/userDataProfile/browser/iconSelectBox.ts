/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIconSelectBoxOptions, IconSelectBox } from '../../../../base/browser/ui/icons/iconSelectBox.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { getButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { listHoverBackground, quickInputForeground } from '../../../../platform/theme/common/colorRegistry.js';
import './iconSelectBox.css';

export const WorkbenchIconSelectBoxFocusContextKey = new RawContextKey<boolean>('iconSelectBoxFocus', false);
export const WorkbenchIconSelectBoxInputFocusContextKey = new RawContextKey<boolean>('iconSelectBoxInputFocus', false);
export const WorkbenchIconSelectBoxInputEmptyContextKey = new RawContextKey<boolean>('iconSelectBoxInputEmpty', true);

interface IWorkbenchIconSelectBoxOptions extends IIconSelectBoxOptions {
	readonly showResetButton?: boolean;
}

export class WorkbenchIconSelectBox extends IconSelectBox {
	private static focusedWidget: WorkbenchIconSelectBox | undefined;
	static getFocusedWidget(): WorkbenchIconSelectBox | undefined {
		return WorkbenchIconSelectBox.focusedWidget;
	}

	private readonly contextKeyService: IContextKeyService;
	private readonly inputFocusContextKey: IContextKey<boolean>;
	private readonly inputEmptyContextKey: IContextKey<boolean>;
	private readonly resetButton: Button | undefined;
	private readonly onDidResetEmitter = this._register(new Emitter<void>());
	readonly onDidReset = this.onDidResetEmitter.event;
	private readonly onDidCancelEmitter = this._register(new Emitter<void>());
	readonly onDidCancel = this.onDidCancelEmitter.event;

	constructor(
		options: IWorkbenchIconSelectBoxOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(options);
		if (options.showResetButton) {
			const footer = dom.append(this.domNode, dom.$('.icon-select-reset'));
			dom.append(footer, dom.$('hr', { 'aria-hidden': 'true' }));
			this.resetButton = this._register(new Button(footer, getButtonStyles({
				buttonBackground: undefined,
				buttonHoverBackground: listHoverBackground,
				buttonForeground: quickInputForeground,
				buttonBorder: undefined,
			})));
			this.resetButton.label = localize('resetIcon', "Reset to default");
			this._register(this.resetButton.onDidClick(() => this.onDidResetEmitter.fire()));
			this._register(this.resetButton.onDidEscape(() => this.onDidCancelEmitter.fire()));
			this._register(dom.addDisposableListener(footer, dom.EventType.KEY_DOWN, event => {
				const key = new StandardKeyboardEvent(event);
				if ([KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.Home, KeyCode.End].some(keyCode => key.equals(keyCode))) {
					event.stopPropagation();
				}
			}));
		}
		this.contextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		const widgetFocusContextKey = WorkbenchIconSelectBoxFocusContextKey.bindTo(this.contextKeyService);
		const widgetFocus = this._register(dom.trackFocus(this.domNode));
		this._register(widgetFocus.onDidFocus(() => {
			widgetFocusContextKey.set(true);
			WorkbenchIconSelectBox.focusedWidget = this;
		}));
		this._register(widgetFocus.onDidBlur(() => {
			widgetFocusContextKey.set(false);
			if (WorkbenchIconSelectBox.focusedWidget === this) {
				WorkbenchIconSelectBox.focusedWidget = undefined;
			}
		}));
		this._register(toDisposable(() => {
			if (WorkbenchIconSelectBox.focusedWidget === this) {
				WorkbenchIconSelectBox.focusedWidget = undefined;
			}
		}));
		this.inputFocusContextKey = WorkbenchIconSelectBoxInputFocusContextKey.bindTo(this.contextKeyService);
		this.inputEmptyContextKey = WorkbenchIconSelectBoxInputEmptyContextKey.bindTo(this.contextKeyService);
		if (this.inputBox) {
			const inputFocus = this._register(dom.trackFocus(this.inputBox.inputElement));
			this._register(inputFocus.onDidFocus(() => this.inputFocusContextKey.set(true)));
			this._register(inputFocus.onDidBlur(() => this.inputFocusContextKey.set(false)));
			this._register(this.inputBox.onDidChange(() => this.inputEmptyContextKey.set(this.inputBox?.value.length === 0)));
		}
	}

	override focus(): void {
		super.focus();
		WorkbenchIconSelectBox.focusedWidget = this;
	}

	override layout(dimension: dom.Dimension): void {
		super.layout(dimension);
		if (this.resetButton) {
			this.domNode.style.height = 'auto';
		}
	}
}

for (const [id, handler] of [
	['iconSelectBox.focusUp', (box: WorkbenchIconSelectBox) => box.focusPreviousRow()],
	['iconSelectBox.focusDown', (box: WorkbenchIconSelectBox) => box.focusNextRow()],
	['iconSelectBox.focusNext', (box: WorkbenchIconSelectBox) => box.focusNext()],
	['iconSelectBox.focusPrevious', (box: WorkbenchIconSelectBox) => box.focusPrevious()],
	['iconSelectBox.focusFirst', (box: WorkbenchIconSelectBox) => box.focusFirst()],
	['iconSelectBox.focusLast', (box: WorkbenchIconSelectBox) => box.focusLast()],
	['iconSelectBox.selectFocused', (box: WorkbenchIconSelectBox) => {
		const index = box.getFocus()[0];
		if (index !== undefined) {
			box.setSelection(index);
		}
	}],
] as const) {
	CommandsRegistry.registerCommand(id, () => {
		const box = WorkbenchIconSelectBox.getFocusedWidget();
		if (box) {
			handler(box);
		}
	});
}

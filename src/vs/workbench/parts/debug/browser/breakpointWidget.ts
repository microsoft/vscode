/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/breakpointWidget';
import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { KeyCode } from 'vs/base/common/keyCodes';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDebugService, IBreakpoint, IRawBreakpoint } from 'vs/workbench/parts/debug/common/debug';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { once } from 'vs/base/common/functional';
import { attachInputBoxStyler, attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';

const $ = dom.$;
const EXPRESSION_PLACEHOLDER = nls.localize('breakpointWidgetExpressionPlaceholder', "Break when expression evaluates to true. 'Enter' to accept, 'esc' to cancel.");
const EXPRESSION_ARIA_LABEL = nls.localize('breakpointWidgetAriaLabel', "The program will only stop here if this condition is true. Press Enter to accept or Escape to cancel.");
const HIT_COUNT_PLACEHOLDER = nls.localize('breakpointWidgetHitCountPlaceholder', "Break when hit count condition is met. 'Enter' to accept, 'esc' to cancel.");
const HIT_COUNT_ARIA_LABEL = nls.localize('breakpointWidgetHitCountAriaLabel', "The program will only stop here if the hit count is met. Press Enter to accept or Escape to cancel.");

export class BreakpointWidget extends ZoneWidget {

	private inputBox: InputBox;
	private toDispose: lifecycle.IDisposable[];
	private hitCountContext: boolean;
	private hitCountInput: string;
	private conditionInput: string;

	constructor(editor: ICodeEditor, private lineNumber: number, private column: number,
		@IContextViewService private contextViewService: IContextViewService,
		@IDebugService private debugService: IDebugService,
		@IThemeService private themeService: IThemeService
	) {
		super(editor, { showFrame: true, showArrow: false, frameWidth: 1 });

		this.toDispose = [];
		this.hitCountInput = '';
		this.conditionInput = '';
		this.create();
	}

	private get placeholder(): string {
		return this.hitCountContext ? HIT_COUNT_PLACEHOLDER : EXPRESSION_PLACEHOLDER;
	}

	private get ariaLabel(): string {
		return this.hitCountContext ? HIT_COUNT_ARIA_LABEL : EXPRESSION_ARIA_LABEL;
	}

	private getInputBoxValue(breakpoint: IBreakpoint): string {
		if (this.hitCountContext) {
			return breakpoint && breakpoint.hitCondition ? breakpoint.hitCondition : this.hitCountInput;
		}

		return breakpoint && breakpoint.condition ? breakpoint.condition : this.conditionInput;
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('breakpoint-widget');
		const uri = this.editor.getModel().uri;
		const breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === this.lineNumber && bp.column === this.column && bp.uri.toString() === uri.toString()).pop();

		this.hitCountContext = breakpoint && breakpoint.hitCondition && !breakpoint.condition;
		const selected = this.hitCountContext ? 1 : 0;
		const selectBox = new SelectBox([nls.localize('expression', "Expression"), nls.localize('hitCount', "Hit Count")], selected);
		this.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService));
		selectBox.render(dom.append(container, $('.breakpoint-select-container')));
		selectBox.onDidSelect(e => {
			this.hitCountContext = e === 'Hit Count';
			if (this.hitCountContext) {
				this.conditionInput = this.inputBox.value;
			} else {
				this.hitCountInput = this.inputBox.value;
			}

			this.inputBox.setAriaLabel(this.ariaLabel);
			this.inputBox.setPlaceHolder(this.placeholder);
			this.inputBox.value = this.getInputBoxValue(breakpoint);
		});

		const inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
		this.inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			placeholder: this.placeholder,
			ariaLabel: this.ariaLabel
		});
		this.toDispose.push(attachInputBoxStyler(this.inputBox, this.themeService));
		this.toDispose.push(this.inputBox);

		dom.addClass(this.inputBox.inputElement, isWindows ? 'windows' : isMacintosh ? 'mac' : 'linux');
		this.inputBox.value = this.getInputBoxValue(breakpoint);
		// Due to an electron bug we have to do the timeout, otherwise we do not get focus
		setTimeout(() => this.inputBox.focus(), 0);

		let disposed = false;
		const wrapUp = once((success: boolean) => {
			if (!disposed) {
				disposed = true;
				if (success) {
					// if there is already a breakpoint on this location - remove it.
					const oldBreakpoint = this.debugService.getModel().getBreakpoints()
						.filter(bp => bp.lineNumber === this.lineNumber && bp.column === this.column && bp.uri.toString() === uri.toString()).pop();

					const raw: IRawBreakpoint = {
						lineNumber: this.lineNumber,
						column: oldBreakpoint ? oldBreakpoint.column : undefined,
						enabled: true,
						condition: oldBreakpoint && oldBreakpoint.condition,
						hitCondition: oldBreakpoint && oldBreakpoint.hitCondition
					};

					if (this.hitCountContext) {
						raw.hitCondition = this.inputBox.value;
						if (this.conditionInput) {
							raw.condition = this.conditionInput;
						}
					} else {
						raw.condition = this.inputBox.value;
						if (this.hitCountInput) {
							raw.hitCondition = this.hitCountInput;
						}
					}

					if (oldBreakpoint) {
						this.debugService.removeBreakpoints(oldBreakpoint.getId()).done(null, errors.onUnexpectedError);
					}

					this.debugService.addBreakpoints(uri, [raw]).done(null, errors.onUnexpectedError);
				}

				this.dispose();
			}
		});

		this.toDispose.push(dom.addStandardDisposableListener(this.inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
			const isEscape = e.equals(KeyCode.Escape);
			const isEnter = e.equals(KeyCode.Enter);
			if (isEscape || isEnter) {
				e.stopPropagation();
				wrapUp(isEnter);
			}
		}));
	}

	public dispose(): void {
		super.dispose();
		lifecycle.dispose(this.toDispose);
		setTimeout(() => this.editor.focus(), 0);
	}
}

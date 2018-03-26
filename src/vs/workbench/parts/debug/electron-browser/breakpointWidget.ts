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
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDebugService, IBreakpoint, BreakpointWidgetContext as Context } from 'vs/workbench/parts/debug/common/debug';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { once } from 'vs/base/common/functional';
import { attachInputBoxStyler, attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';

const $ = dom.$;

export class BreakpointWidget extends ZoneWidget {

	private inputBox: InputBox;
	private toDispose: lifecycle.IDisposable[];
	private conditionInput = '';
	private hitCountInput = '';
	private logMessageInput = '';
	private breakpoint: IBreakpoint;

	constructor(editor: ICodeEditor, private lineNumber: number, private column: number, private context: Context,
		@IContextViewService private contextViewService: IContextViewService,
		@IDebugService private debugService: IDebugService,
		@IThemeService private themeService: IThemeService
	) {
		super(editor, { showFrame: true, showArrow: false, frameWidth: 1 });

		this.toDispose = [];
		const uri = this.editor.getModel().uri;
		this.breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === this.lineNumber && bp.column === this.column && bp.uri.toString() === uri.toString()).pop();

		if (this.context === undefined) {
			if (this.breakpoint && !this.breakpoint.condition && !this.breakpoint.hitCondition && this.breakpoint.logMessage) {
				this.context = Context.LOG_MESSAGE;
			} else if (this.breakpoint && !this.breakpoint.condition && this.breakpoint.hitCondition) {
				this.context = Context.HIT_COUNT;
			} else {
				this.context = Context.CONDITION;
			}
		}

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(e => {
			if (this.breakpoint && e.removed && e.removed.indexOf(this.breakpoint) >= 0) {
				this.dispose();
			}
		}));
		this.create();
	}

	private get placeholder(): string {
		switch (this.context) {
			case Context.LOG_MESSAGE:
				return nls.localize('breakpointWidgetLogMessagePlaceholder', "Message to log when breakpoint is hit. Expressions within {} are interpolated. 'Enter' to accept, 'esc' to cancel.");
			case Context.HIT_COUNT:
				return nls.localize('breakpointWidgetHitCountPlaceholder', "Break when hit count condition is met. 'Enter' to accept, 'esc' to cancel.");
			default:
				return nls.localize('breakpointWidgetExpressionPlaceholder', "Break when expression evaluates to true. 'Enter' to accept, 'esc' to cancel.");
		}
	}

	private get ariaLabel(): string {
		switch (this.context) {
			case Context.LOG_MESSAGE:
				return nls.localize('breakpointWidgetLogMessageAriaLabel', "The program will log this message everytime this breakpoint is hit. Press Enter to accept or Escape to cancel.");
			case Context.HIT_COUNT:
				return nls.localize('breakpointWidgetHitCountAriaLabel', "The program will only stop here if the hit count is met. Press Enter to accept or Escape to cancel.");
			default:
				return nls.localize('breakpointWidgetAriaLabel', "The program will only stop here if this condition is true. Press Enter to accept or Escape to cancel.");
		}
	}

	private getInputValue(breakpoint: IBreakpoint): string {
		switch (this.context) {
			case Context.LOG_MESSAGE:
				return breakpoint && breakpoint.logMessage ? breakpoint.logMessage : this.logMessageInput;
			case Context.HIT_COUNT:
				return breakpoint && breakpoint.hitCondition ? breakpoint.hitCondition : this.hitCountInput;
			default:
				return breakpoint && breakpoint.condition ? breakpoint.condition : this.conditionInput;
		}
	}

	private rememberInput(): void {
		switch (this.context) {
			case Context.LOG_MESSAGE:
				this.logMessageInput = this.inputBox.value;
				break;
			case Context.HIT_COUNT:
				this.hitCountInput = this.inputBox.value;
				break;
			default:
				this.conditionInput = this.inputBox.value;
		}
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('breakpoint-widget');
		const selectBox = new SelectBox([nls.localize('expression', "Expression"), nls.localize('hitCount', "Hit Count"), nls.localize('logMessage', "Log Message")], this.context, this.contextViewService);
		this.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService));
		selectBox.render(dom.append(container, $('.breakpoint-select-container')));
		selectBox.onDidSelect(e => {
			this.rememberInput();
			this.context = e.index;

			this.inputBox.setAriaLabel(this.ariaLabel);
			this.inputBox.setPlaceHolder(this.placeholder);
			this.inputBox.value = this.getInputValue(this.breakpoint);
		});

		const inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
		this.inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			placeholder: this.placeholder,
			ariaLabel: this.ariaLabel
		});
		this.toDispose.push(attachInputBoxStyler(this.inputBox, this.themeService));
		this.toDispose.push(this.inputBox);

		dom.addClass(this.inputBox.inputElement, isWindows ? 'windows' : isMacintosh ? 'mac' : 'linux');
		this.inputBox.value = this.getInputValue(this.breakpoint);
		// Due to an electron bug we have to do the timeout, otherwise we do not get focus
		setTimeout(() => this.inputBox.focus(), 0);

		let disposed = false;
		const wrapUp = once((success: boolean) => {
			if (!disposed) {
				disposed = true;
				if (success) {
					// if there is already a breakpoint on this location - remove it.

					let condition = this.breakpoint && this.breakpoint.condition;
					let hitCondition = this.breakpoint && this.breakpoint.hitCondition;
					let logMessage = this.breakpoint && this.breakpoint.logMessage;
					this.rememberInput();

					if (this.conditionInput) {
						condition = this.conditionInput;
					}
					if (this.hitCountInput) {
						hitCondition = this.hitCountInput;
					}
					if (this.logMessageInput) {
						logMessage = this.logMessageInput;
					}

					if (this.breakpoint) {
						this.debugService.updateBreakpoints(this.breakpoint.uri, {
							[this.breakpoint.getId()]: {
								condition,
								hitCondition,
								verified: this.breakpoint.verified,
								logMessage
							}
						}, false);
					} else {
						this.debugService.addBreakpoints(this.editor.getModel().uri, [{
							lineNumber: this.lineNumber,
							column: this.breakpoint ? this.breakpoint.column : undefined,
							enabled: true,
							condition,
							hitCondition,
							logMessage
						}]).done(null, errors.onUnexpectedError);
					}
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

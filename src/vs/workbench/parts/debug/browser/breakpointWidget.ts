/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import 'vs/css!../browser/media/breakpointWidget';
import async = require('vs/base/common/async');
import errors = require('vs/base/common/errors');
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import platform = require('vs/base/common/platform');
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import lifecycle = require('vs/base/common/lifecycle');
import dom = require('vs/base/browser/dom');
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { CommonEditorRegistry, ServicesAccessor, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { EditorContextKeys, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import debug = require('vs/workbench/parts/debug/common/debug');
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';

const $ = dom.$;
const CONTEXT_BREAKPOINT_WIDGET_VISIBLE = new RawContextKey<boolean>('breakpointWidgetVisible', false);
const CLOSE_BREAKPOINT_WIDGET_COMMAND_ID = 'closeBreakpointWidget';
const EXPRESSION_PLACEHOLDER = nls.localize('breakpointWidgetExpressionPlaceholder', "Break when expression evaluates to true");
const EXPRESSION_ARIA_LABEL = nls.localize('breakpointWidgetAriaLabel', "The program will only stop here if this condition is true. Press Enter to accept or Escape to cancel.");
const HIT_COUNT_PLACEHOLDER = nls.localize('breakpointWidgetHitCountPlaceholder', "Break when hit count condition is met");
const HIT_COUNT_ARIA_LABEL = nls.localize('breakpointWidgetHitCountAriaLabel', "The program will only stop here if the hit count is met. Press Enter to accept or Escape to cancel.");

export class BreakpointWidget extends ZoneWidget {

	public static INSTANCE: BreakpointWidget;

	private inputBox: InputBox;
	private toDispose: lifecycle.IDisposable[];
	private breakpointWidgetVisible: IContextKey<boolean>;
	private hitCountContext: boolean;

	constructor(editor: editorbrowser.ICodeEditor, private lineNumber: number,
		@IContextViewService private contextViewService: IContextViewService,
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editor, { showFrame: true, showArrow: false, frameColor: '#007ACC', frameWidth: 1 });

		this.toDispose = [];

		this.create();
		this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
		this.breakpointWidgetVisible.set(true);
		BreakpointWidget.INSTANCE = this;
		this.toDispose.push(editor.onDidChangeModel(() => this.dispose()));
	}

	public static createInstance(editor: editorbrowser.ICodeEditor, lineNumber: number, instantiationService: IInstantiationService): void {
		if (BreakpointWidget.INSTANCE) {
			BreakpointWidget.INSTANCE.dispose();
		}

		instantiationService.createInstance(BreakpointWidget, editor, lineNumber);
		BreakpointWidget.INSTANCE.show({ lineNumber, column: 1 }, 2);
	}

	protected _fillContainer(container: HTMLElement): void {
		dom.addClass(container, 'breakpoint-widget monaco-editor-background');
		const uri = this.editor.getModel().uri;
		const breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === this.lineNumber && bp.source.uri.toString() === uri.toString()).pop();

		const selectBox = new SelectBox([nls.localize('expression', "Expression"), nls.localize('hitCount', "Hit Count")], 0);
		selectBox.render(dom.append(container, $('.breakpoint-select-container')));
		selectBox.onDidSelect(e => {
			this.hitCountContext = e === 'Hit Count';
			this.inputBox.setAriaLabel(this.hitCountContext ? HIT_COUNT_ARIA_LABEL : EXPRESSION_ARIA_LABEL);
			this.inputBox.setPlaceHolder(this.hitCountContext ? HIT_COUNT_PLACEHOLDER : EXPRESSION_PLACEHOLDER);
			if (this.hitCountContext) {
				this.inputBox.value = breakpoint && breakpoint.hitCondition ? breakpoint.hitCondition : '';
			} else {
				this.inputBox.value = breakpoint && breakpoint.condition ? breakpoint.condition : '';
			}
		});

		const inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
		this.inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			placeholder: EXPRESSION_PLACEHOLDER,
			ariaLabel: EXPRESSION_ARIA_LABEL
		});
		this.toDispose.push(this.inputBox);

		dom.addClass(this.inputBox.inputElement, platform.isWindows ? 'windows' : platform.isMacintosh ? 'mac' : 'linux');
		this.inputBox.value = (breakpoint && breakpoint.condition) ? breakpoint.condition : '';
		// Due to an electron bug we have to do the timeout, otherwise we do not get focus
		setTimeout(() => this.inputBox.focus(), 0);

		let disposed = false;
		const wrapUp = async.once((success: boolean) => {
			if (!disposed) {
				disposed = true;
				if (success) {
					// if there is already a breakpoint on this location - remove it.
					const oldBreakpoint = this.debugService.getModel().getBreakpoints()
						.filter(bp => bp.lineNumber === this.lineNumber && bp.source.uri.toString() === uri.toString()).pop();

					const raw: debug.IRawBreakpoint = {
						uri,
						lineNumber: this.lineNumber,
						enabled: true,
						condition: oldBreakpoint && oldBreakpoint.condition,
						hitCondition: oldBreakpoint && oldBreakpoint.hitCondition
					};
					if (this.hitCountContext) {
						raw.hitCondition = this.inputBox.value;
					} else {
						raw.condition = this.inputBox.value;
					}

					if (oldBreakpoint) {
						this.debugService.removeBreakpoints(oldBreakpoint.getId()).done(null, errors.onUnexpectedError);
					}

					this.debugService.addBreakpoints([raw]).done(null, errors.onUnexpectedError);
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
		this.breakpointWidgetVisible.reset();
		BreakpointWidget.INSTANCE = undefined;
		lifecycle.dispose(this.toDispose);
		setTimeout(() => this.editor.focus(), 0);
	}
}

class CloseBreakpointWidgetCommand extends EditorCommand {

	constructor() {
		super({
			id: CLOSE_BREAKPOINT_WIDGET_COMMAND_ID,
			precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
			kbOpts: {
				weight: CommonEditorRegistry.commandWeight(8),
				kbExpr: EditorContextKeys.Focus,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			}
		});
	}

	protected runEditorCommand(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		if (BreakpointWidget.INSTANCE) {
			BreakpointWidget.INSTANCE.dispose();
		}
	}
}
CommonEditorRegistry.registerEditorCommand(new CloseBreakpointWidgetCommand());

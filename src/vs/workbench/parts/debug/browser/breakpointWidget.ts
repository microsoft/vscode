/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import 'vs/css!../browser/media/breakpointWidget';
import async = require('vs/base/common/async');
import errors = require('vs/base/common/errors');
import { CommonKeybindings, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import platform = require('vs/base/common/platform');
import lifecycle = require('vs/base/common/lifecycle');
import dom = require('vs/base/browser/dom');
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService, IKeybindingContextKey } from 'vs/platform/keybinding/common/keybinding';
import debug = require('vs/workbench/parts/debug/common/debug');
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';

const $ = dom.emmet;
const CONTEXT_BREAKPOINT_WIDGET_VISIBLE = 'breakpointWidgetVisible';
const CLOSE_BREAKPOINT_WIDGET_COMMAND_ID = 'closeBreakpointWidget';

export class BreakpointWidget extends ZoneWidget {

	public static INSTANCE: BreakpointWidget;

	private inputBox: InputBox;
	private toDispose: lifecycle.IDisposable[];
	private breakpointWidgetVisible: IKeybindingContextKey<boolean>;

	constructor(editor: editorbrowser.ICodeEditor, private lineNumber: number,
		@IContextViewService private contextViewService: IContextViewService,
		@debug.IDebugService private debugService: debug.IDebugService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(editor, { showFrame: true, showArrow: false });

		this.toDispose = [];
		this.create();
		this.breakpointWidgetVisible = keybindingService.createKey(CONTEXT_BREAKPOINT_WIDGET_VISIBLE, false);
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
		dom.addClass(container, 'breakpoint-widget');
		const uri = this.editor.getModel().uri;
		const breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === this.lineNumber && bp.source.uri.toString() === uri.toString()).pop();

		const inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
		this.inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			placeholder: nls.localize('breakpointWidgetPlaceholder', "Breakpoint on line {0} will only stop if this condition is true. 'Enter' to accept, 'esc' to cancel.", this.lineNumber),
			ariaLabel: nls.localize('breakpointWidgetAriaLabel', "Type the breakpoint condition for line {0}. The program will only stop here if this condition is true. Press Enter to accept or Escape to cancel.")
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
					const raw = {
						uri,
						lineNumber: this.lineNumber,
						enabled: true,
						condition: this.inputBox.value
					};

					// if there is already a breakpoint on this location - remove it.
					const oldBreakpoint = this.debugService.getModel().getBreakpoints()
						.filter(bp => bp.lineNumber === this.lineNumber && bp.source.uri.toString() === uri.toString()).pop();
					if (oldBreakpoint) {
						this.debugService.removeBreakpoints(oldBreakpoint.getId()).done(null, errors.onUnexpectedError);
					}

					this.debugService.addBreakpoints([raw]).done(null, errors.onUnexpectedError);
				}

				this.dispose();
			}
		});

		this.toDispose.push(dom.addStandardDisposableListener(this.inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
			const isEscape = e.equals(CommonKeybindings.ESCAPE);
			const isEnter = e.equals(CommonKeybindings.ENTER);
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

CommonEditorRegistry.registerEditorCommand(CLOSE_BREAKPOINT_WIDGET_COMMAND_ID, CommonEditorRegistry.commandWeight(8), { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, false, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, (ctx, editor, args) => {
	if (BreakpointWidget.INSTANCE) {
		BreakpointWidget.INSTANCE.dispose();
	}
});

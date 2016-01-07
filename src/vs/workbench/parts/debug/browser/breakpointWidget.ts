/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/breakpointWidget';
import async = require('vs/base/common/async');
import errors = require('vs/base/common/errors');
import { CommonKeybindings } from 'vs/base/common/keyCodes';
import platform = require('vs/base/common/platform');
import lifecycle = require('vs/base/common/lifecycle');
import dom = require('vs/base/browser/dom');
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import debug = require('vs/workbench/parts/debug/common/debug');

const $ = dom.emmet;

export class BreakpointWidget extends ZoneWidget {
	private inputBox: InputBox;
	private toDispose: lifecycle.IDisposable[];

	constructor(editor: editorbrowser.ICodeEditor, private lineNumber: number,
		@IContextViewService private contextViewService: IContextViewService,
		@debug.IDebugService private debugService: debug.IDebugService
	) {
		super(editor, { showFrame: true, showArrow: false });
		this.toDispose = [];
		this.create();
	}

	public fillContainer(container: HTMLElement): void {
		dom.addClass(container, 'breakpoint-widget');
		const uri = this.editor.getModel().getAssociatedResource();
		const breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === this.lineNumber && bp.source.uri.toString() === uri.toString()).pop();

		const inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
		this.inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			placeholder: `Breakpoint on line ${ this.lineNumber } will only stop if this condition is true. 'Enter' to accept, 'esc' to cancel.`
		});
		this.toDispose.push(this.inputBox);

		dom.addClass(this.inputBox.inputElement, platform.isWindows ? 'windows' : platform.isMacintosh ? 'mac' : 'linux');
		this.inputBox.value = (breakpoint && breakpoint.condition) ? breakpoint.condition : '';
		// Due to an electron bug we have to do the timeout, otherwise we do not get focus
		setTimeout(() => this.inputBox.focus(), 0);

		let disposed = false;
		const wrapUp = async.once<any, void>((success: boolean) => {
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
					if (this.debugService.getModel().getBreakpoints().some(bp => bp.lineNumber === this.lineNumber && bp.source.uri.toString() === uri.toString())) {
						this.debugService.toggleBreakpoint(raw).done(null, errors.onUnexpectedError);
					}

					this.debugService.toggleBreakpoint(raw).done(null, errors.onUnexpectedError);
				}

				this.dispose();
			}
		});

		this.toDispose.push(dom.addStandardDisposableListener(this.inputBox.inputElement, 'keydown', (e: dom.IKeyboardEvent) => {
			const isEscape = e.equals(CommonKeybindings.ESCAPE);
			const isEnter = e.equals(CommonKeybindings.ENTER);
			if (isEscape || isEnter) {
				wrapUp(isEnter);
			}
		}));
	}

	public dispose(): void {
		super.dispose();
		lifecycle.disposeAll(this.toDispose);
	}
}

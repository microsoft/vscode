/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/exceptionWidget';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDebugService, IExceptionInfo } from 'vs/workbench/parts/debug/common/debug';
import { RunOnceScheduler } from 'vs/base/common/async';
const $ = dom.$;

export class ExceptionWidget extends ZoneWidget {

	constructor(editor: ICodeEditor, private exceptionInfo: IExceptionInfo, private lineNumber: number,
		@IContextViewService private contextViewService: IContextViewService,
		@IDebugService private debugService: IDebugService
	) {
		super(editor, { showFrame: true, showArrow: true, frameWidth: 1 });

		this.create();
		const onDidLayoutChangeScheduler = new RunOnceScheduler(() => this._doLayout(undefined, undefined), 50);
		this._disposables.add(this.editor.onDidLayoutChange(() => onDidLayoutChangeScheduler.schedule()));
		this._disposables.add(onDidLayoutChangeScheduler);
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('exception-widget');
		// Set the font size and line height to the one from the editor configuration.
		const fontInfo = this.editor.getConfiguration().fontInfo;
		this.container.style.fontSize = `${fontInfo.fontSize}px`;
		this.container.style.lineHeight = `${fontInfo.lineHeight}px`;

		let title = $('.title');
		let msg = $('.message');
		const defaultConditionMessage = nls.localize('exceptionThrown', 'Exception has occurred.');

		if (this.exceptionInfo.breakMode) {
			let conditionMessage;
			switch (this.exceptionInfo.breakMode) {
				case 'never':
					conditionMessage = nls.localize('neverException', 'User-handled exception has occurred.');
					break;
				case 'always':
					conditionMessage = nls.localize('alwaysException', 'Always-breaking exception has occurred.');
					break;
				case 'unhandled':
					conditionMessage = nls.localize('unhandledException', 'Unhandled exception has occurred.');
					break;
				case 'userUnhandled':
					conditionMessage = nls.localize('userUnhandledException', 'User-unhandled exception has occurred.');
					break;
				default:
					conditionMessage = defaultConditionMessage;
					break;
			}

			title.textContent = `${conditionMessage} ${this.exceptionInfo.description}`;
			msg.textContent = this.exceptionInfo.details.stackTrace;
		} else {
			title.textContent = defaultConditionMessage;
			msg.textContent = this.exceptionInfo.description;
		}

		dom.append(container, title);
		dom.append(container, msg);
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		// Reload the height with respect to the exception text content and relayout it to match the line count.
		this.container.style.height = 'initial';

		const computedLinesNumber = Math.ceil(this.container.offsetHeight / this.editor.getConfiguration().fontInfo.lineHeight);
		this._relayout(computedLinesNumber);
	}
}

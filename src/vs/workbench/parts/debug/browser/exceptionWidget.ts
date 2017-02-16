/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { Thread } from 'vs/workbench/parts/debug/common/debugModel';

import * as dom from 'vs/base/browser/dom';

// const $ = dom.$;

export class ExceptionWidget extends ZoneWidget {

	constructor(editor: ICodeEditor, private lineNumber: number,
		@IContextViewService private contextViewService: IContextViewService,
		@IDebugService private debugService: IDebugService
	) {
		super(editor, { showFrame: true, showArrow: false, frameColor: '#007ACC', frameWidth: 1 });

		this.create();
	}

	protected _fillContainer(container: HTMLElement): void {
		dom.addClass(container, 'breakpoint-widget exception-widget monaco-editor-background');

		let newTreeInput: any = this.debugService.getModel();
		const processes = this.debugService.getModel().getProcesses();
		if (!this.debugService.getViewModel().isMultiProcessView() && processes.length) {
			const threads = processes[0].getAllThreads();
			// Only show the threads in the call stack if there is more than 1 thread.
			newTreeInput = threads.length === 1 ? threads[0] : processes[0];
		}
		if (newTreeInput instanceof Thread && newTreeInput.stoppedDetails) {
			let exceptionThrown = nls.localize('exceptionThrown', "Exception occured: {0}", newTreeInput.stoppedDetails.text);
			container.textContent = exceptionThrown;
		}
	}

	public dispose(): void {
		super.dispose();
	}
}

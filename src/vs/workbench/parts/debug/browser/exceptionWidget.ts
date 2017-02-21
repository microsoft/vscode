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
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
const $ = dom.$;

export class ExceptionWidget extends ZoneWidget {

	constructor(editor: ICodeEditor, private lineNumber: number,
		@IContextViewService private contextViewService: IContextViewService,
		@IDebugService private debugService: IDebugService
	) {
		super(editor, { showFrame: true, showArrow: true, frameWidth: 1 });

		this.create();
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('exception-widget');

		let title = $('.title');
		title.textContent = nls.localize('exceptionThrown', 'Exception occured.');
		dom.append(container, title);

		const thread = this.debugService.getViewModel().focusedThread;
		if (thread && thread.stoppedDetails) {
			let msg = $('.message');
			msg.textContent = thread.stoppedDetails.text;
			dom.append(container, msg);
		}
	}
}

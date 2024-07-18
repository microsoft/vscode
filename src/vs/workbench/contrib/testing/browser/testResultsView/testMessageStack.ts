/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallStackFrame, CallStackWidget } from 'vs/workbench/contrib/debug/browser/callStackWidget';
import { ITestMessageStackFrame } from 'vs/workbench/contrib/testing/common/testTypes';

export class TestResultStackWidget extends Disposable {
	private readonly widget: CallStackWidget;
	private readonly changeStackFrameEmitter = this._register(new Emitter<ITestMessageStackFrame>());

	public readonly onDidChangeStackFrame = this.changeStackFrameEmitter.event;

	constructor(
		private readonly container: HTMLElement,
		containingEditor: ICodeEditor | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super();

		this.widget = this._register(instantiationService.createInstance(
			CallStackWidget,
			container,
			containingEditor,
		));

		this._register(dom.addDisposableListener(container, dom.EventType.CONTEXT_MENU, e => {
			contextMenuService.showContextMenu({
				getAnchor: () => ({ x: e.x, y: e.y }),
				menuId: MenuId.TestCallStackContext
			});
		}));
	}

	public update(stack: ITestMessageStackFrame[], selection?: ITestMessageStackFrame) {
		this.widget.setFrames(stack.map(frame => new CallStackFrame(
			frame.label,
			frame.uri,
			frame.position?.lineNumber,
			frame.position?.column,
		)));
	}

	public layout(height?: number, width?: number) {
		this.widget.layout(height ?? this.container.clientHeight, width);
	}
}

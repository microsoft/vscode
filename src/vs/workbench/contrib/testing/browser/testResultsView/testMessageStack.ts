/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event';
import { Disposable } from '../../../../../base/common/lifecycle';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation';
import { AnyStackFrame, CallStackFrame, CallStackWidget } from '../../../debug/browser/callStackWidget';
import { ITestMessageStackFrame } from '../../common/testTypes';

export class TestResultStackWidget extends Disposable {
	private readonly widget: CallStackWidget;
	private readonly changeStackFrameEmitter = this._register(new Emitter<ITestMessageStackFrame>());

	public readonly onDidChangeStackFrame = this.changeStackFrameEmitter.event;

	constructor(
		private readonly container: HTMLElement,
		containingEditor: ICodeEditor | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.widget = this._register(instantiationService.createInstance(
			CallStackWidget,
			container,
			containingEditor,
		));
	}

	public update(messageFrame: AnyStackFrame, stack: ITestMessageStackFrame[]) {
		this.widget.setFrames([messageFrame, ...stack.map(frame => new CallStackFrame(
			frame.label,
			frame.uri,
			frame.position?.lineNumber,
			frame.position?.column,
		))]);
	}

	public layout(height?: number, width?: number) {
		this.widget.layout(height ?? this.container.clientHeight, width);
	}
}

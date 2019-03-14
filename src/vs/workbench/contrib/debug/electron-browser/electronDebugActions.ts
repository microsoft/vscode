/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { Variable } from 'vs/workbench/contrib/debug/common/debugModel';
import { IDebugService, IStackFrame } from 'vs/workbench/contrib/debug/common/debug';
import { isWindows } from 'vs/base/common/platform';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';

export class CopyValueAction extends Action {
	static readonly ID = 'workbench.debug.viewlet.action.copyValue';
	static LABEL = nls.localize('copyValue', "Copy Value");

	constructor(
		id: string, label: string, private value: any, private context: string,
		@IDebugService private readonly debugService: IDebugService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(id, label, 'debug-action copy-value');
		this._enabled = typeof this.value === 'string' || (this.value instanceof Variable && !!this.value.evaluateName);
	}

	public run(): Promise<any> {
		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		const session = this.debugService.getViewModel().focusedSession;

		if (this.value instanceof Variable && stackFrame && session && this.value.evaluateName) {
			return session.evaluate(this.value.evaluateName, stackFrame.frameId, this.context).then(result => {
				this.clipboardService.writeText(result.body.result);
			}, err => this.clipboardService.writeText(this.value.value));
		}

		this.clipboardService.writeText(this.value);
		return Promise.resolve(undefined);
	}
}

export class CopyEvaluatePathAction extends Action {
	static readonly ID = 'workbench.debug.viewlet.action.copyEvaluatePath';
	static LABEL = nls.localize('copyAsExpression', "Copy as Expression");

	constructor(
		id: string, label: string, private value: Variable,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(id, label);
		this._enabled = this.value && !!this.value.evaluateName;
	}

	public run(): Promise<any> {
		this.clipboardService.writeText(this.value.evaluateName!);
		return Promise.resolve(undefined);
	}
}

export class CopyAction extends Action {
	static readonly ID = 'workbench.debug.action.copy';
	static LABEL = nls.localize('copy', "Copy");

	constructor(
		id: string, label: string,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		this.clipboardService.writeText(window.getSelection().toString());
		return Promise.resolve(undefined);
	}
}

const lineDelimiter = isWindows ? '\r\n' : '\n';

export class CopyStackTraceAction extends Action {
	static readonly ID = 'workbench.action.debug.copyStackTrace';
	static LABEL = nls.localize('copyStackTrace', "Copy Call Stack");

	constructor(
		id: string, label: string,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(id, label);
	}

	public run(frame: IStackFrame): Promise<any> {
		this.clipboardService.writeText(frame.thread.getCallStack().map(sf => sf.toString()).join(lineDelimiter));
		return Promise.resolve(undefined);
	}
}

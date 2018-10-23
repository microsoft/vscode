/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { removeAnsiEscapeCodes } from 'vs/base/common/strings';
import { Variable } from 'vs/workbench/parts/debug/common/debugModel';
import { IDebugService, IStackFrame, IReplElement } from 'vs/workbench/parts/debug/common/debug';
import { clipboard } from 'electron';
import { isWindows } from 'vs/base/common/platform';

export class CopyValueAction extends Action {
	static readonly ID = 'workbench.debug.viewlet.action.copyValue';
	static LABEL = nls.localize('copyValue', "Copy Value");

	constructor(id: string, label: string, private value: any, @IDebugService private debugService: IDebugService) {
		super(id, label, 'debug-action copy-value');
		this._enabled = typeof this.value === 'string' || (this.value instanceof Variable && !!this.value.evaluateName);
	}

	public run(): TPromise<any> {
		if (this.value instanceof Variable) {
			const frameId = this.debugService.getViewModel().focusedStackFrame.frameId;
			const session = this.debugService.getViewModel().focusedSession;
			return session.evaluate(this.value.evaluateName, frameId).then(result => {
				clipboard.writeText(result.body.result);
			}, err => clipboard.writeText(this.value.value));
		}

		clipboard.writeText(this.value);
		return Promise.resolve(undefined);
	}
}

export class CopyEvaluatePathAction extends Action {
	static readonly ID = 'workbench.debug.viewlet.action.copyEvaluatePath';
	static LABEL = nls.localize('copyAsExpression', "Copy as Expression");

	constructor(id: string, label: string, private value: Variable) {
		super(id, label);
		this._enabled = this.value && !!this.value.evaluateName;
	}

	public run(): TPromise<any> {
		clipboard.writeText(this.value.evaluateName);
		return Promise.resolve(undefined);
	}
}

export class CopyAction extends Action {
	static readonly ID = 'workbench.debug.action.copy';
	static LABEL = nls.localize('copy', "Copy");

	public run(): TPromise<any> {
		clipboard.writeText(window.getSelection().toString());
		return Promise.resolve(undefined);
	}
}

const lineDelimiter = isWindows ? '\r\n' : '\n';
export class CopyAllAction extends Action {
	static readonly ID = 'workbench.debug.action.copyAll';
	static LABEL = nls.localize('copyAll', "Copy All");

	constructor(id: string, label: string, private tree: ITree) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let text = '';
		const navigator = this.tree.getNavigator();
		// skip first navigator element - the root node
		while (navigator.next()) {
			if (text) {
				text += lineDelimiter;
			}
			text += (<IReplElement>navigator.current()).toString();
		}

		clipboard.writeText(removeAnsiEscapeCodes(text));
		return Promise.resolve(undefined);
	}
}

export class CopyStackTraceAction extends Action {
	static readonly ID = 'workbench.action.debug.copyStackTrace';
	static LABEL = nls.localize('copyStackTrace', "Copy Call Stack");

	public run(frame: IStackFrame): TPromise<any> {
		clipboard.writeText(frame.thread.getCallStack().map(sf => sf.toString()).join(lineDelimiter));
		return Promise.resolve(undefined);
	}
}

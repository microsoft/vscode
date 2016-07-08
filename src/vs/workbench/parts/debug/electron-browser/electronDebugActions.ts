/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import actions = require('vs/base/common/actions');
import { TPromise } from 'vs/base/common/winjs.base';
import { clipboard } from 'electron';
import { Variable, getFullExpressionName } from 'vs/workbench/parts/debug/common/debugModel';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';

export class CopyValueAction extends actions.Action {
	static ID = 'workbench.debug.viewlet.action.copyValue';
	static LABEL = nls.localize('copyValue', "Copy Value");

	constructor(id: string, label: string, private value: any, @IDebugService private debugService: IDebugService) {
		super(id, label, 'debug-action copy-value');
	}

	public run(): TPromise<any> {
		if (this.value instanceof Variable) {
			const frameId = this.debugService.getViewModel().getFocusedStackFrame().frameId;
			const session = this.debugService.getActiveSession();
			return session.evaluate({ expression: getFullExpressionName(this.value, session.configuration.type), frameId }).then(result => {
				clipboard.writeText(result.body.result);
			}, err => clipboard.writeText(this.value.value));
		}

		clipboard.writeText(this.value);
		return TPromise.as(null);
	}
}

export class CopyAction extends actions.Action {
	static ID = 'workbench.debug.action.copy';
	static LABEL = nls.localize('copy', "Copy");

	public run(): TPromise<any> {
		clipboard.writeText(window.getSelection().toString());
		return TPromise.as(null);
	}
}

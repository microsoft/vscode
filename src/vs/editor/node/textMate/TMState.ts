/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState } from 'vs/editor/common/modes';
import { StackElement } from 'vscode-textmate';

export class TMState implements IState {

	private readonly _modeId: string;
	public readonly ruleStack: StackElement;

	constructor(modeId: string, ruleStack: StackElement) {
		this._modeId = modeId;
		this.ruleStack = ruleStack;
	}

	public clone(): TMState {
		return this;
	}

	public equals(other: IState): boolean {
		if (!other || !(other instanceof TMState)) {
			return false;
		}
		if (this._modeId !== other._modeId) {
			return false;
		}
		// Equals on `_ruleStack`
		if (this.ruleStack === null && other.ruleStack === null) {
			return true;
		}
		if (this.ruleStack === null || other.ruleStack === null) {
			return false;
		}
		return this.ruleStack.equals(other.ruleStack);
	}

	public getModeId(): string {
		return this._modeId;
	}
}

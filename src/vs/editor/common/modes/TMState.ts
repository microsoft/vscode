/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMode, IState, ITokenizationResult} from 'vs/editor/common/modes';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {StackElement} from 'vscode-textmate';

export class TMState implements IState {

	private _mode: IMode;
	private _parentEmbedderState: IState;
	private _ruleStack: StackElement;

	constructor(mode: IMode, parentEmbedderState: IState, ruleStack: StackElement) {
		this._mode = mode;
		this._parentEmbedderState = parentEmbedderState;
		this._ruleStack = ruleStack;
	}

	public clone():TMState {
		let parentEmbedderStateClone = AbstractState.safeClone(this._parentEmbedderState);
		return new TMState(this._mode, parentEmbedderStateClone, this._ruleStack);
	}

	public equals(other:IState):boolean {
		if (!other || !(other instanceof TMState)) {
			return false;
		}
		var otherState = <TMState>other;

		// Equals on `_parentEmbedderState`
		if (!AbstractState.safeEquals(this._parentEmbedderState, otherState._parentEmbedderState)) {
			return false;
		}

		// Equals on `_ruleStack`
		if (this._ruleStack === null && otherState._ruleStack === null) {
			return true;
		}
		if (this._ruleStack === null || otherState._ruleStack === null) {
			return false;
		}
		return this._ruleStack.equals(otherState._ruleStack);
	}

	public getMode():IMode {
		return this._mode;
	}

	public tokenize(stream:any):ITokenizationResult {
		throw new Error();
	}

	public getStateData():IState {
		return this._parentEmbedderState;
	}

	public setStateData(state:IState):void {
		this._parentEmbedderState = state;
	}

	public getRuleStack(): StackElement {
		return this._ruleStack;
	}

	public setRuleStack(ruleStack:StackElement): void {
		this._ruleStack = ruleStack;
	}
}
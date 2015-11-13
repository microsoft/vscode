/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {AbstractState} from 'vs/editor/common/modes/abstractState';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');

import {StackElement} from 'vscode-textmate';

function stackElementEquals(a:StackElement, b:StackElement): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	// Not comparing enterPos since it does not represent state across lines
	return (
		a.ruleId === b.ruleId
		&& a.endRule === b.endRule
		&& a.scopeName === b.scopeName
		&& a.contentName === b.contentName
	);
}

export class TMState implements Modes.IState {

	private _mode: Modes.IMode;
	private _parentEmbedderState: Modes.IState;
	private _ruleStack: StackElement[];

	constructor(mode: Modes.IMode, parentEmbedderState: Modes.IState, ruleStack: StackElement[]) {
		this._mode = mode;
		this._parentEmbedderState = parentEmbedderState;
		this._ruleStack = ruleStack;
	}

	public clone():TMState {
		let parentEmbedderStateClone = AbstractState.safeClone(this._parentEmbedderState);
		let ruleStackClone = this._ruleStack ? this._ruleStack.map(el => el.clone()) : null;
		return new TMState(this._mode, parentEmbedderStateClone, ruleStackClone);
	}

	public equals(other:Modes.IState):boolean {
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
		if (this._ruleStack.length !== otherState._ruleStack.length) {
			return false;
		}

		for (var i = 0, len = this._ruleStack.length; i < len; i++) {
			if (!stackElementEquals(this._ruleStack[i], otherState._ruleStack[i])) {
				return false;
			}
		}
		return true;
	}

	public getMode():Modes.IMode {
		return this._mode;
	}

	public tokenize(stream:any):Modes.ITokenizationResult {
		throw new Error();
	}

	public getStateData():Modes.IState {
		return this._parentEmbedderState;
	}

	public setStateData(state:Modes.IState):void {
		this._parentEmbedderState = state;
	}

	public getRuleStack(): StackElement[] {
		return this._ruleStack;
	}

	public setRuleStack(ruleStack:StackElement[]): void {
		this._ruleStack = ruleStack;
	}
}
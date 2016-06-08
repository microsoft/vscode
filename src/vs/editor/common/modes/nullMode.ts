/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as modes from 'vs/editor/common/modes';

export class NullState implements modes.IState {

	private mode: modes.IMode;
	private stateData: modes.IState;

	constructor(mode: modes.IMode, stateData: modes.IState) {
		this.mode = mode;
		this.stateData = stateData;
	}

	public clone(): modes.IState {
		var stateDataClone:modes.IState = (this.stateData ? this.stateData.clone() : null);
		return new NullState(this.mode, stateDataClone);
	}

	public equals(other:modes.IState): boolean {
		if (this.mode !== other.getMode()) {
			return false;
		}
		var otherStateData = other.getStateData();
		if (!this.stateData && !otherStateData) {
			return true;
		}
		if (this.stateData && otherStateData) {
			return this.stateData.equals(otherStateData);
		}
		return false;
	}

	public getMode(): modes.IMode {
		return this.mode;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type:'' };
	}

	public getStateData(): modes.IState {
		return this.stateData;
	}

	public setStateData(stateData:modes.IState):void {
		this.stateData = stateData;
	}
}

export class NullMode implements modes.IMode {


	public static ID = 'vs.editor.modes.nullMode';

	constructor() {
	}

	public getId():string {
		return NullMode.ID;
	}

	public toSimplifiedMode(): modes.IMode {
		return this;
	}
}

export function nullTokenize(mode: modes.IMode, buffer:string, state: modes.IState, deltaOffset:number = 0, stopAtOffset?:number): modes.ILineTokens {
	var tokens:modes.IToken[] = [
		{
			startIndex: deltaOffset,
			type: ''
		}
	];

	var modeTransitions:modes.IModeTransition[] = [
		{
			startIndex: deltaOffset,
			mode: mode
		}
	];

	return {
		tokens: tokens,
		actualStopOffset: deltaOffset + buffer.length,
		endState: state,
		modeTransitions: modeTransitions
	};
}

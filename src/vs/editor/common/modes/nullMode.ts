/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMode, IState, IStream, ITokenizationResult, ILineTokens} from 'vs/editor/common/modes';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {Token} from 'vs/editor/common/core/token';

export class NullState implements IState {

	private mode: IMode;
	private stateData: IState;

	constructor(mode: IMode, stateData: IState) {
		this.mode = mode;
		this.stateData = stateData;
	}

	public clone(): IState {
		let stateDataClone:IState = (this.stateData ? this.stateData.clone() : null);
		return new NullState(this.mode, stateDataClone);
	}

	public equals(other:IState): boolean {
		if (this.mode !== other.getMode()) {
			return false;
		}
		let otherStateData = other.getStateData();
		if (!this.stateData && !otherStateData) {
			return true;
		}
		if (this.stateData && otherStateData) {
			return this.stateData.equals(otherStateData);
		}
		return false;
	}

	public getMode(): IMode {
		return this.mode;
	}

	public tokenize(stream:IStream):ITokenizationResult {
		stream.advanceToEOS();
		return { type:'' };
	}

	public getStateData(): IState {
		return this.stateData;
	}

	public setStateData(stateData:IState):void {
		this.stateData = stateData;
	}
}

export class NullMode implements IMode {


	public static ID = 'vs.editor.nullMode';

	constructor() {
	}

	public getId():string {
		return NullMode.ID;
	}

	public toSimplifiedMode(): IMode {
		return this;
	}
}

export function nullTokenize(modeId: string, buffer:string, state: IState, deltaOffset:number = 0, stopAtOffset?:number): ILineTokens {
	let tokens:Token[] = [new Token(deltaOffset, '')];

	let modeTransitions:ModeTransition[] = [new ModeTransition(deltaOffset, modeId)];

	return {
		tokens: tokens,
		actualStopOffset: deltaOffset + buffer.length,
		endState: state,
		modeTransitions: modeTransitions
	};
}

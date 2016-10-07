/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IState, IStream} from 'vs/editor/common/modes';

/**
 * @internal
 */
export interface ITokenizationResult {
	type?:string;
	dontMergeWithPrev?:boolean;
	nextState?:AbstractState;
}

export abstract class AbstractState implements IState {

	_abstractStateBrand: void;

	private modeId:string;
	private stateData:IState;

	constructor(modeId:string, stateData:IState = null) {
		this.modeId = modeId;
		this.stateData = stateData;
	}

	public getModeId():string {
		return this.modeId;
	}

	public clone():AbstractState {
		var result:AbstractState = this.makeClone();
		result.initializeFrom(this);
		return result;
	}

	protected abstract makeClone():AbstractState;

	protected initializeFrom(other:AbstractState): void {
		this.stateData = other.stateData !== null ? other.stateData.clone() : null;
	}

	public getStateData(): IState {
		return this.stateData;
	}

	public setStateData(state:IState):void {
		this.stateData = state;
	}

	public equals(other:IState):boolean {
		if (other === null || this.modeId !== other.getModeId()) {
			return false;
		}
		if (other instanceof AbstractState) {
			return AbstractState.safeEquals(this.stateData, other.stateData);
		}
		return false;
	}

	public abstract tokenize(stream:IStream):ITokenizationResult;

	public static safeEquals(a: IState, b: IState): boolean {
		if (a === null && b === null) {
			return true;
		}
		if (a === null || b === null) {
			return false;
		}
		return a.equals(b);
	}

	public static safeClone(state: IState): IState {
		if (state) {
			return state.clone();
		}
		return null;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMode, IState, IStream, ITokenizationResult} from 'vs/editor/common/modes';

export class AbstractState implements IState {

	private mode:IMode;
	private stateData:IState;

	constructor(mode:IMode, stateData:IState = null) {
		this.mode = mode;
		this.stateData = stateData;
	}

	public getMode():IMode {
		return this.mode;
	}

	public clone():IState {
		var result:AbstractState = this.makeClone();
		result.initializeFrom(this);
		return result;
	}

	public makeClone():AbstractState {
		throw new Error('Abstract Method');
	}

	public initializeFrom(other:AbstractState): void {
		this.stateData = other.stateData !== null ? other.stateData.clone() : null;
	}

	public getStateData(): IState {
		return this.stateData;
	}

	public setStateData(state:IState):void {
		this.stateData = state;
	}

	public equals(other:IState):boolean {
		if (other === null || this.mode !== other.getMode()) {
			return false;
		}
		if (other instanceof AbstractState) {
			return AbstractState.safeEquals(this.stateData, other.stateData);
		}
		return false;
	}

	public tokenize(stream:IStream):ITokenizationResult {
		throw new Error('Abstract Method');
	}

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

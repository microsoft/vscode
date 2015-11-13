/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');

export class AbstractState implements Modes.IState {

	private mode:Modes.IMode;
	private stateData:Modes.IState;

	constructor(mode:Modes.IMode, stateData:Modes.IState = null) {
		this.mode = mode;
		this.stateData = stateData;
	}

	public getMode():Modes.IMode {
		return this.mode;
	}

	public clone():Modes.IState {
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

	public getStateData(): Modes.IState {
		return this.stateData;
	}

	public setStateData(state:Modes.IState):void {
		this.stateData = state;
	}

	public equals(other:Modes.IState):boolean {
		if (other === null || this.mode !== other.getMode()) {
			return false;
		}
		if (other instanceof AbstractState) {
			return AbstractState.safeEquals(this.stateData, other.stateData);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		throw new Error('Abstract Method');
	}

	public static safeEquals(a: Modes.IState, b: Modes.IState): boolean {
		if (a === null && b === null) {
			return true;
		}
		if (a === null || b === null) {
			return false;
		}
		return a.equals(b);
	}

	public static safeClone(state: Modes.IState): Modes.IState {
		if (state) {
			return state.clone();
		}
		return null;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, ILineTokens } from 'vs/editor/common/modes';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';
import { ITokenizationResult } from 'vs/editor/common/modes/abstractState';
import { LineStream } from 'vs/editor/common/modes/lineStream';

export class NullState implements IState {

	private modeId: string;
	private stateData: IState;

	constructor(modeId: string, stateData: IState) {
		this.modeId = modeId;
		this.stateData = stateData;
	}

	public clone(): IState {
		let stateDataClone: IState = (this.stateData ? this.stateData.clone() : null);
		return new NullState(this.modeId, stateDataClone);
	}

	public equals(other: IState): boolean {
		if (this.modeId !== other.getModeId()) {
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

	public getModeId(): string {
		return this.modeId;
	}

	public tokenize(stream: LineStream): ITokenizationResult {
		stream.advanceToEOS();
		return { type: '' };
	}

	public getStateData(): IState {
		return this.stateData;
	}

	public setStateData(stateData: IState): void {
		this.stateData = stateData;
	}
}

export const NULL_MODE_ID = 'vs.editor.nullMode';

export function nullTokenize(modeId: string, buffer: string, state: IState, deltaOffset: number = 0, stopAtOffset?: number): ILineTokens {
	let tokens: Token[] = [new Token(deltaOffset, '')];

	let modeTransitions: ModeTransition[] = [new ModeTransition(deltaOffset, modeId)];

	return {
		tokens: tokens,
		actualStopOffset: deltaOffset + buffer.length,
		endState: state,
		modeTransitions: modeTransitions
	};
}

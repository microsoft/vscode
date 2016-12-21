/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, ILineTokens } from 'vs/editor/common/modes';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';

export class NullState implements IState {

	private readonly _modeId: string;

	constructor(modeId: string) {
		this._modeId = modeId;
	}

	public clone(): IState {
		return this;
	}

	public equals(other: IState): boolean {
		return (
			other instanceof NullState
			&& this._modeId === other._modeId
		);
	}

	public getModeId(): string {
		return this._modeId;
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

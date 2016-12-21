/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, ILineTokens } from 'vs/editor/common/modes';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';

class NullStateImpl implements IState {

	public clone(): IState {
		return this;
	}

	public equals(other: IState): boolean {
		return (this === other);
	}
}

export const NULL_STATE: IState = new NullStateImpl();

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

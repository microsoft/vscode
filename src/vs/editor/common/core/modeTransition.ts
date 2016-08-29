/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMode, IModeTransition} from 'vs/editor/common/modes';
import {Arrays} from 'vs/editor/common/core/arrays';

export class ReducedModeTransition {
	_reducedModeTransitionBrand: void;

	public startIndex:number;
	public modeId: string;

	constructor(startIndex:number, modeId:string) {
		this.startIndex = startIndex|0;
		this.modeId = modeId;
	}

	public static findIndexInSegmentsArray(arr:ReducedModeTransition[], desiredIndex: number): number {
		return Arrays.findIndexInSegmentsArray(arr, desiredIndex);
	}
}

export class ModeTransition extends ReducedModeTransition {
	_modeTransitionBrand: void;

	public mode:IMode;

	constructor(startIndex:number, mode:IMode) {
		super(startIndex, mode.getId());
		this.mode = mode;
	}

	public static findIndexInSegmentsArray(arr:ModeTransition[], desiredIndex: number): number {
		return Arrays.findIndexInSegmentsArray(arr, desiredIndex);
	}

	public static create(modeTransitions:IModeTransition[]): ModeTransition[] {
		let result:ModeTransition[] = [];
		for (let i = 0, len = modeTransitions.length; i < len; i++) {
			let modeTransition = modeTransitions[i];
			result.push(new ModeTransition(modeTransition.startIndex, modeTransition.mode));
		}
		return result;
	}
}

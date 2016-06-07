/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMode, IModeTransition} from 'vs/editor/common/modes';
import {Arrays} from 'vs/editor/common/core/arrays';

export class ModeTransition {
	_modeTransitionBrand: void;

	public startIndex:number;
	public mode:IMode;
	public modeId: string;

	constructor(startIndex:number, mode:IMode) {
		this.startIndex = startIndex|0;
		this.mode = mode;
		this.modeId = mode.getId();
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

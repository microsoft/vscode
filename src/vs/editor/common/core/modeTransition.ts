/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Arrays} from 'vs/editor/common/core/arrays';

export class ModeTransition {
	_modeTransitionBrand: void;

	public startIndex:number;
	public modeId: string;

	constructor(startIndex:number, modeId:string) {
		this.startIndex = startIndex|0;
		this.modeId = modeId;
	}

	public static findIndexInSegmentsArray(arr:ModeTransition[], desiredIndex: number): number {
		return Arrays.findIndexInSegmentsArray(arr, desiredIndex);
	}
}

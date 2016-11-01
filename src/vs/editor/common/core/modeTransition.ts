/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Arrays } from 'vs/editor/common/core/arrays';

export class ModeTransition {
	_modeTransitionBrand: void;

	public readonly startIndex: number;
	public readonly modeId: string;

	constructor(startIndex: number, modeId: string) {
		this.startIndex = startIndex | 0;
		this.modeId = modeId;
	}

	public static findIndexInSegmentsArray(arr: ModeTransition[], desiredIndex: number): number {
		return Arrays.findIndexInSegmentsArray(arr, desiredIndex);
	}

	public static equals(a: ModeTransition[], b: ModeTransition[]): boolean {
		let aLen = a.length;
		let bLen = b.length;
		if (aLen !== bLen) {
			return false;
		}
		for (let i = 0; i < aLen; i++) {
			let aModeTransition = a[i];
			let bModeTransition = b[i];
			if (aModeTransition.startIndex !== bModeTransition.startIndex) {
				return false;
			}
			if (aModeTransition.modeId !== bModeTransition.modeId) {
				return false;
			}
		}
		return true;
	}
}

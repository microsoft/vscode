/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from '../ranges/offsetRange.js';
import { BaseEdit, BaseReplacement } from './edit.js';

export class LengthEdit extends BaseEdit<LengthReplacement, LengthEdit> {
	/**
	 * Creates an edit that reverts this edit.
	 */
	public inverse(): LengthEdit {
		const edits: LengthReplacement[] = [];
		let offset = 0;
		for (const e of this.replacements) {
			edits.push(new LengthReplacement(
				OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newLength),
				e.replaceRange.length,
			));
			offset += e.newLength - e.replaceRange.length;
		}
		return new LengthEdit(edits);
	}

	protected override _createNew(replacements: readonly LengthReplacement[]): LengthEdit {
		return new LengthEdit(replacements);
	}
}

export class LengthReplacement extends BaseReplacement<LengthReplacement> {
	constructor(
		range: OffsetRange,
		public readonly newLength: number,
	) {
		super(range);
	}

	override equals(other: LengthReplacement): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength;
	}

	getNewLength(): number { return this.newLength; }

	tryJoinTouching(other: LengthReplacement): LengthReplacement | undefined {
		return new LengthReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newLength + other.newLength);
	}

	slice(range: OffsetRange, rangeInReplacement: OffsetRange): LengthReplacement {
		return new LengthReplacement(range, rangeInReplacement.length);
	}
}

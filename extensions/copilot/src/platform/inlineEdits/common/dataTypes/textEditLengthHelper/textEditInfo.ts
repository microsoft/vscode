/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Length, lengthToObj } from './length';

export class TextEditInfo {
	/*public static fromModelContentChanges(changes: IModelContentChange[]): TextEditInfo[] {
		// Must be sorted in ascending order
		const edits = changes.map(c => {
			const range = Range.lift(c.range);
			return new TextEditInfo(
				positionToLength(range.getStartPosition()),
				positionToLength(range.getEndPosition()),
				lengthOfString(c.text)
			);
		}).reverse();
		return edits;
	}*/

	constructor(
		public readonly startOffset: Length,
		public readonly endOffset: Length,
		public readonly newLength: Length
	) {
	}

	toString(): string {
		return `[${lengthToObj(this.startOffset)}...${lengthToObj(this.endOffset)}) -> ${lengthToObj(this.newLength)}`;
	}
}

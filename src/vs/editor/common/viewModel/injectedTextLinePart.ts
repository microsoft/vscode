/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A fixed-width injected text range projected onto a single view line.
 */
export class InjectedTextLinePart {
	constructor(
		public readonly startColumn: number,
		public readonly endColumn: number,
		public readonly inlineClassName: string,
		public readonly widthInEm: number
	) { }

	public static equalsArr(a: readonly InjectedTextLinePart[], b: readonly InjectedTextLinePart[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (
				a[i].startColumn !== b[i].startColumn
				|| a[i].endColumn !== b[i].endColumn
				|| a[i].inlineClassName !== b[i].inlineClassName
				|| a[i].widthInEm !== b[i].widthInEm
			) {
				return false;
			}
		}
		return true;
	}
}

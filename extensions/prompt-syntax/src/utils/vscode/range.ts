/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TODO: @legomushroom
 */
export interface IRange {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber: number;
	readonly endColumn: number;

	equalsRange(other: IRange): boolean;
}

/**
 * TODO: @legomushroom
 */
export class Range implements IRange {
	constructor(
		public readonly startLineNumber: number,
		public readonly startColumn: number,
		public readonly endLineNumber: number,
		public readonly endColumn: number
	) { }

	/**
	 * TODO: @legomushroom
	 */
	public equalsRange(other: IRange): boolean {
		return (
			this.startLineNumber === other.startLineNumber &&
			this.startColumn === other.startColumn &&
			this.endLineNumber === other.endLineNumber &&
			this.endColumn === other.endColumn
		);
	}
}

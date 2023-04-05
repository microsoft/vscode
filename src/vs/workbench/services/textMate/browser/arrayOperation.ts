/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator } from 'vs/base/common/arrays';

export class ArrayEdit {
	public readonly edits: readonly SingleArrayEdit[];

	constructor(
		/**
		 * Disjoint edits that are applied in parallel
		 */
		edits: readonly SingleArrayEdit[]
	) {
		this.edits = edits.slice().sort(compareBy(c => c.offset, numberComparator));
	}

	applyToArray(array: any[]): void {
		for (let i = this.edits.length - 1; i >= 0; i--) {
			const c = this.edits[i];
			array.splice(c.offset, c.length, ...new Array(c.newLength));
		}
	}
}

export class SingleArrayEdit {
	constructor(
		public readonly offset: number,
		public readonly length: number,
		public readonly newLength: number,
	) { }

	toString() {
		return `[${this.offset}, +${this.length}) -> +${this.newLength}}`;
	}
}

export interface IIndexTransformer {
	transform(index: number): number | undefined;
}

/**
 * Can only be called with increasing values of `index`.
*/
export class MonotonousIndexTransformer implements IIndexTransformer {
	public static fromMany(transformations: ArrayEdit[]): IIndexTransformer {
		// TODO improve performance by combining transformations first
		const transformers = transformations.map(t => new MonotonousIndexTransformer(t));
		return new CombinedIndexTransformer(transformers);
	}

	private idx = 0;
	private offset = 0;

	constructor(private readonly transformation: ArrayEdit) {
	}

	/**
	 * Precondition: index >= previous-value-of(index).
	 */
	transform(index: number): number | undefined {
		let nextChange = this.transformation.edits[this.idx] as SingleArrayEdit | undefined;
		while (nextChange && nextChange.offset + nextChange.length <= index) {
			this.offset += nextChange.newLength - nextChange.length;
			this.idx++;
			nextChange = this.transformation.edits[this.idx];
		}
		// assert nextChange === undefined || index < nextChange.offset + nextChange.length

		if (nextChange && nextChange.offset <= index) {
			// Offset is touched by the change
			return undefined;
		}

		return index + this.offset;
	}
}

export class CombinedIndexTransformer implements IIndexTransformer {
	constructor(
		private readonly transformers: IIndexTransformer[]
	) { }

	transform(index: number): number | undefined {
		for (const transformer of this.transformers) {
			const result = transformer.transform(index);
			if (result === undefined) {
				return undefined;
			}
			index = result;
		}
		return index;
	}
}

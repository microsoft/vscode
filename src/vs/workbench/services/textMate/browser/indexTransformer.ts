/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnyEdit } from '../../../../editor/common/core/edits/edit.js';

export interface IIndexTransformer {
	transform(index: number): number | undefined;
}

/**
 * Can only be called with increasing values of `index`.
*/
export class MonotonousIndexTransformer implements IIndexTransformer {
	public static fromMany(transformations: AnyEdit[]): IIndexTransformer {
		// TODO improve performance by combining transformations first
		const transformers = transformations.map(t => new MonotonousIndexTransformer(t));
		return new CombinedIndexTransformer(transformers);
	}

	private idx = 0;
	private offset = 0;

	constructor(private readonly transformation: AnyEdit) {
	}

	/**
	 * Precondition: index >= previous-value-of(index).
	 */
	transform(index: number): number | undefined {
		let nextChange = this.transformation.replacements.at(this.idx);
		while (nextChange && nextChange.replaceRange.endExclusive <= index) {
			this.offset += nextChange.getLengthDelta();
			this.idx++;
			nextChange = this.transformation.replacements.at(this.idx);
		}
		// assert nextChange === undefined || index < nextChange.offset + nextChange.length

		if (nextChange && nextChange.replaceRange.start <= index) {
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

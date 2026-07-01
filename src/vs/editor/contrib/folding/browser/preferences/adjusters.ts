/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorFoldingPreferences } from '../../../../common/config/editorOptions.js';
import { ITextModel } from '../../../../common/model.js';
import { FoldRange } from '../foldingRanges.js';

/**
 * Represents a compatibility adjuster for a specific folding preference.
 */
export abstract class CompatibilityAdjuster<P extends keyof EditorFoldingPreferences> {
	constructor(readonly preference: P) { }
	/**
	 * Returns `true` if this adjuster should attempt to modify
	 * the folding ranges for the given preference value.
	 *
	 * Note: This does not guarantee that a modification will occur.
	 */
	abstract willModify(preferences: EditorFoldingPreferences): boolean;
	/**
	 * Applies the adjustment in-place to the provided FoldRange array.
	 *
	 * The array may be mutated.
	 *
	 * @returns `true` if any modification was performed.
	 */
	abstract apply(model: ITextModel, foldRanges: FoldRange[], preferences: EditorFoldingPreferences): boolean;
}

/**
 * Extends each folding range by one line, unless
 * another region starts at the target line.
 */
export class CompatibilityAdjusterIncludeClosures extends CompatibilityAdjuster<'includeClosures'> {
	constructor() {
		super('includeClosures');
	}
	willModify(preferences: EditorFoldingPreferences): boolean {
		const preferenceValue = preferences[this.preference];
		return preferenceValue === true || preferenceValue === false;
	}
	apply(model: ITextModel, foldRanges: FoldRange[], preferences: EditorFoldingPreferences): boolean {
		let adjusted = false;

		const rangesLength = foldRanges.length;
		switch (preferences[this.preference]) {
			case true: {
				const startLines = new Set<number>();
				for (let i = 0; i < rangesLength; i++) {
					startLines.add(foldRanges[i].startLineNumber);
				}

				const linesCount = model.getLineCount();
				for (let i = 0; i < rangesLength; i++) {
					const range = foldRanges[i];
					const adjustedEndLine = range.endLineNumber + 1;
					// Extend only if within document bounds and no region starts at the target line.
					if (
						adjustedEndLine <= linesCount &&
						!startLines.has(adjustedEndLine)
					) {
						range.endLineNumber = adjustedEndLine;
						adjusted = true;
					}
				}
				break;
			}
			case false: {
				for (let i = 0; i < rangesLength; i++) {
					const range = foldRanges[i];
					const adjustedEndLine = range.endLineNumber - 1;
					// Shrink if target line is not before region start.
					if (adjustedEndLine >= range.startLineNumber) {
						range.endLineNumber = adjustedEndLine;
						adjusted = true;
					}
				}
				break;
			}
		}

		return adjusted;
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWordAtPosition } from 'vs/editor/common/editorCommon';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { getWordAtText, ensureValidWordDefinition } from 'vs/editor/common/model/wordHelper';

export class WordHelper {

	public static massageWordDefinitionOf(modeId: string): RegExp {
		let wordDefinition = LanguageConfigurationRegistry.getWordDefinition(modeId);
		return ensureValidWordDefinition(wordDefinition);
	}

	private static _getWordAtColumn(txt: string, column: number, modeIndex: number, modeTransitions: ModeTransition[]): IWordAtPosition {
		let modeStartIndex = modeTransitions[modeIndex].startIndex;
		let modeEndIndex = (modeIndex + 1 < modeTransitions.length ? modeTransitions[modeIndex + 1].startIndex : txt.length);
		let modeId = modeTransitions[modeIndex].modeId;

		return getWordAtText(
			column, WordHelper.massageWordDefinitionOf(modeId),
			txt.substring(modeStartIndex, modeEndIndex), modeStartIndex
		);
	}

	public static getWordAtPosition(lineContent: string, column: number, topModeId: string, modeTransitions: ModeTransition[]): IWordAtPosition {

		if (!modeTransitions || modeTransitions.length === 0) {
			return getWordAtText(column, WordHelper.massageWordDefinitionOf(topModeId), lineContent, 0);
		}

		let result: IWordAtPosition = null;
		let columnIndex = column - 1;
		let modeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, columnIndex);

		result = WordHelper._getWordAtColumn(lineContent, column, modeIndex, modeTransitions);

		if (!result && modeIndex > 0 && modeTransitions[modeIndex].startIndex === columnIndex) {
			// The position is right at the beginning of `modeIndex`, so try looking at `modeIndex` - 1 too
			result = WordHelper._getWordAtColumn(lineContent, column, modeIndex - 1, modeTransitions);
		}

		return result;
	}
}

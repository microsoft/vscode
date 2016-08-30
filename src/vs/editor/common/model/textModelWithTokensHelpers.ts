/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IPosition, IWordAtPosition} from 'vs/editor/common/editorCommon';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';
import {getWordAtText, ensureValidWordDefinition} from 'vs/editor/common/model/wordHelper';

export interface ITextSource {

	_lineIsTokenized(lineNumber:number): boolean;

	getLineContent(lineNumber:number): string;

	getModeId(): string;

	_getLineModeTransitions(lineNumber:number): ModeTransition[];
}

export class WordHelper {

	private static _safeGetWordDefinition(modeId:string): RegExp {
		return LanguageConfigurationRegistry.getWordDefinition(modeId);
	}

	public static massageWordDefinitionOf(modeId:string): RegExp {
		return ensureValidWordDefinition(WordHelper._safeGetWordDefinition(modeId));
	}

	private static _getWordAtColumn(txt:string, column:number, modeIndex: number, modeTransitions:ModeTransition[]): IWordAtPosition {
		let modeStartIndex = modeTransitions[modeIndex].startIndex;
		let modeEndIndex = (modeIndex + 1 < modeTransitions.length ? modeTransitions[modeIndex + 1].startIndex : txt.length);
		let modeId = modeTransitions[modeIndex].modeId;

		return getWordAtText(
			column, WordHelper.massageWordDefinitionOf(modeId),
			txt.substring(modeStartIndex, modeEndIndex), modeStartIndex
		);
	}

	public static getWordAtPosition(textSource:ITextSource, position:IPosition): IWordAtPosition {

		if (!textSource._lineIsTokenized(position.lineNumber)) {
			return getWordAtText(position.column, WordHelper.massageWordDefinitionOf(textSource.getModeId()), textSource.getLineContent(position.lineNumber), 0);
		}

		let result: IWordAtPosition = null;
		let txt = textSource.getLineContent(position.lineNumber);
		let modeTransitions = textSource._getLineModeTransitions(position.lineNumber);
		let columnIndex = position.column - 1;
		let modeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, columnIndex);

		result = WordHelper._getWordAtColumn(txt, position.column, modeIndex, modeTransitions);

		if (!result && modeIndex > 0 && modeTransitions[modeIndex].startIndex === columnIndex) {
			// The position is right at the beginning of `modeIndex`, so try looking at `modeIndex` - 1 too
			result = WordHelper._getWordAtColumn(txt, position.column, modeIndex - 1, modeTransitions);
		}

		return result;
	}
}

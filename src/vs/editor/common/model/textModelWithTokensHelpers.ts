/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IPosition, IWordAtPosition} from 'vs/editor/common/editorCommon';
import {IMode, IModeTransition} from 'vs/editor/common/modes';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';
import {getWordAtText, ensureValidWordDefinition} from 'vs/editor/common/model/wordHelper';

export interface ITextSource {

	_lineIsTokenized(lineNumber:number): boolean;

	getLineContent(lineNumber:number): string;

	getMode(): IMode;

	_getLineModeTransitions(lineNumber:number): ModeTransition[];
}

export interface INonWordTokenMap {
	[key:string]:boolean;
}

export class WordHelper {

	private static _safeGetWordDefinition(mode:IMode): RegExp {
		return LanguageConfigurationRegistry.getWordDefinition(mode.getId());
	}

	public static massageWordDefinitionOf(mode:IMode): RegExp {
		return ensureValidWordDefinition(WordHelper._safeGetWordDefinition(mode));
	}

	private static _getWordAtColumn(txt:string, column:number, modeIndex: number, modeTransitions:IModeTransition[]): IWordAtPosition {
		var modeStartIndex = modeTransitions[modeIndex].startIndex,
			modeEndIndex = (modeIndex + 1 < modeTransitions.length ? modeTransitions[modeIndex + 1].startIndex : txt.length),
			mode = modeTransitions[modeIndex].mode;

		return getWordAtText(
			column, WordHelper.massageWordDefinitionOf(mode),
			txt.substring(modeStartIndex, modeEndIndex), modeStartIndex
		);
	}

	public static getWordAtPosition(textSource:ITextSource, position:IPosition): IWordAtPosition {

		if (!textSource._lineIsTokenized(position.lineNumber)) {
			return getWordAtText(position.column, WordHelper.massageWordDefinitionOf(textSource.getMode()), textSource.getLineContent(position.lineNumber), 0);
		}

		var result: IWordAtPosition = null;
		var txt = textSource.getLineContent(position.lineNumber),
			modeTransitions = textSource._getLineModeTransitions(position.lineNumber),
			columnIndex = position.column - 1,
			modeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, columnIndex);

		result = WordHelper._getWordAtColumn(txt, position.column, modeIndex, modeTransitions);

		if (!result && modeIndex > 0 && modeTransitions[modeIndex].startIndex === columnIndex) {
			// The position is right at the beginning of `modeIndex`, so try looking at `modeIndex` - 1 too
			result = WordHelper._getWordAtColumn(txt, position.column, modeIndex - 1, modeTransitions);
		}

		return result;
	}
}

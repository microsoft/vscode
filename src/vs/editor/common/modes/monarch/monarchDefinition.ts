/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import MonarchCommonTypes = require('vs/editor/common/modes/monarch/monarchCommon');
import {IModelService} from 'vs/editor/common/services/modelService';
import Modes = require('vs/editor/common/modes');
import {CharacterPair, IRichEditConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';
import {TextualAndPredefinedResultSuggestSupport, PredefinedResultSuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';

export function createRichEditSupport(lexer: MonarchCommonTypes.ILexer): IRichEditConfiguration {

	function toBracket(input:Modes.IBracketPair): CharacterPair {
		return [input.open, input.close];
	}

	function toBrackets(input:Modes.IBracketPair[]): CharacterPair[] {
		return input.map(toBracket);
	}

	return {

		wordPattern: lexer.wordDefinition,

		comments: {
			lineComment: lexer.lineComment,
			blockComment: [lexer.blockCommentStart, lexer.blockCommentEnd]
		},

		brackets: toBrackets(lexer.standardBrackets),

		__electricCharacterSupport: {
			brackets: lexer.standardBrackets,
			// regexBrackets: lexer.enhancedBrackets,
			caseInsensitive: lexer.ignoreCase,
			embeddedElectricCharacters: lexer.outdentTriggers.split('')
		},

		__characterPairSupport: {
			autoClosingPairs: lexer.autoClosingPairs
		}
	};
}

export function createSuggestSupport(modelService: IModelService, editorWorkerService: IEditorWorkerService, modeId:string, lexer:MonarchCommonTypes.ILexer): Modes.ISuggestSupport {
	if (lexer.suggestSupport.textualCompletions) {
		return new TextualAndPredefinedResultSuggestSupport(
			modeId,
			modelService,
			editorWorkerService,
			lexer.suggestSupport.snippets,
			lexer.suggestSupport.triggerCharacters,
			lexer.suggestSupport.disableAutoTrigger
		);
	} else {
		return new PredefinedResultSuggestSupport(
			modeId,
			modelService,
			lexer.suggestSupport.snippets,
			lexer.suggestSupport.triggerCharacters,
			lexer.suggestSupport.disableAutoTrigger
		);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import {TPromise} from 'vs/base/common/winjs.base';
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import MonarchCommonTypes = require('vs/editor/common/modes/monarch/monarchCommon');
import EditorCommon = require('vs/editor/common/editorCommon');
import {IModelService} from 'vs/editor/common/services/modelService';
import Modes = require('vs/editor/common/modes');
import {CharacterPair, IRichEditConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';
import {IComposableSuggestContribution} from 'vs/editor/common/modes/supports/suggestSupport';

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

function _addSuggestionsAtPosition(model: EditorCommon.IModel, position:EditorCommon.IPosition, lexer: MonarchCommonTypes.ILexer, superSuggestions:Modes.ISuggestResult[]): Modes.ISuggestResult[] {
	var extra = lexer.suggestSupport.snippets;
	if (!extra || extra.length === 0) {
		return superSuggestions;
	}

	if (!superSuggestions) {
		superSuggestions = [];
	}

	superSuggestions.push({
		currentWord: model.getWordUntilPosition(position).word,
		suggestions: extra.slice(0)
	});

	return superSuggestions;
}

export function createSuggestSupport(modelService: IModelService, mode:Modes.IMode, lexer:MonarchCommonTypes.ILexer): IComposableSuggestContribution {
	if (lexer.suggestSupport.textualCompletions && mode instanceof AbstractMode) {
		return {
			triggerCharacters:lexer.suggestSupport.triggerCharacters,
			disableAutoTrigger: lexer.suggestSupport.disableAutoTrigger,
			excludeTokens: [],
			suggest: (resource, position) => (<AbstractMode<any>>mode).suggest(resource, position),
			composeSuggest: (resource, position, superSuggestions) => {
				return TPromise.as(_addSuggestionsAtPosition(modelService.getModel(resource), position, lexer, superSuggestions));
			}
		};
	} else {
		return {
			triggerCharacters:lexer.suggestSupport.triggerCharacters,
			disableAutoTrigger: lexer.suggestSupport.disableAutoTrigger,
			excludeTokens: [],
			suggest: (resource, position) => {
				return TPromise.as(_addSuggestionsAtPosition(modelService.getModel(resource), position, lexer, null));
			},
			composeSuggest: (resource, position, superSuggestions) => {
				return TPromise.as(superSuggestions);
			}
		};
	}
}

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
import Supports = require('vs/editor/common/modes/supports');
import MonarchCommonTypes = require('vs/editor/common/modes/monarch/monarchCommon');
import EditorCommon = require('vs/editor/common/editorCommon');
import {IModelService} from 'vs/editor/common/services/modelService';
import Modes = require('vs/editor/common/modes');
import {IOnEnterSupportOptions} from 'vs/editor/common/modes/supports/onEnter';

export function createCommentsSupport(lexer: MonarchCommonTypes.ILexer): Supports.ICommentsSupportContribution {
	return {
		commentsConfiguration: {
			lineCommentTokens: [lexer.lineComment],
			blockCommentStartToken: lexer.blockCommentStart,
			blockCommentEndToken: lexer.blockCommentEnd
		}
	};
}

export function createBracketElectricCharacterContribution(lexer: MonarchCommonTypes.ILexer): Supports.IBracketElectricCharacterContribution {
	return {
		brackets: lexer.standardBrackets,
		regexBrackets: lexer.enhancedBrackets,
		caseInsensitive: lexer.ignoreCase,
		embeddedElectricCharacters: lexer.outdentTriggers.split('')
	};
}

export function createTokenTypeClassificationSupportContribution(lexer: MonarchCommonTypes.ILexer): Supports.ITokenTypeClassificationSupportContribution {
	return {
		wordDefinition: lexer.wordDefinition
	};
}

export function createCharacterPairContribution(lexer: MonarchCommonTypes.ILexer): Modes.ICharacterPairContribution {
	return {
		autoClosingPairs: lexer.autoClosingPairs
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

export function createOnEnterSupportOptions(lexer:MonarchCommonTypes.ILexer): IOnEnterSupportOptions {
	return {
		brackets: lexer.standardBrackets
	};
}

export function createSuggestSupport(modelService: IModelService, mode:Modes.IMode, lexer:MonarchCommonTypes.ILexer): Supports.IComposableSuggestContribution {
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

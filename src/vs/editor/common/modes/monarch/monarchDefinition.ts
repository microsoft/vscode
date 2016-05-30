/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import {ILexer} from 'vs/editor/common/modes/monarch/monarchCommon';
import {IRichLanguageConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';

export function createRichEditSupport(lexer: ILexer): IRichLanguageConfiguration {

	return {

		wordPattern: lexer.wordDefinition,

		comments: {
			lineComment: lexer.lineComment,
			blockComment: [lexer.blockCommentStart, lexer.blockCommentEnd]
		},

		brackets: lexer.standardBrackets,

		autoClosingPairs: lexer.autoClosingPairs,

		__electricCharacterSupport: {
			// regexBrackets: lexer.enhancedBrackets,
			caseInsensitive: lexer.ignoreCase,
			embeddedElectricCharacters: lexer.outdentTriggers.split('')
		}
	};
}

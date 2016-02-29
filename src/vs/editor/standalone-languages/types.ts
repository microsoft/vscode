/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface ILanguageDef {
	id: string;
	extensions: string[];
	filenames?: string[];
	firstLine?: string;
	aliases: string[];
	mimetypes?: string[];
	defModule: string;
}

export interface ILanguage {
	// required
	name: string;								// unique name to identify the language
	tokenizer: Object;							// map from string to ILanguageRule[]

	// optional
	displayName?: string;						// nice display name
	ignoreCase?: boolean;							// is the language case insensitive?
	lineComment?: string;						// used to insert/delete line comments in the editor
	blockCommentStart?: string;					// used to insert/delete block comments in the editor
	blockCommentEnd?: string;
	defaultToken?: string;						// if no match in the tokenizer assign this token class (default 'source')
	brackets?: ILanguageBracket[];				// for example [['{','}','delimiter.curly']]

	// advanced
	start?: string;								// start symbol in the tokenizer (by default the first entry is used)
	tokenPostfix?: string;						// attach this to every token class (by default '.' + name)
	autoClosingPairs?: string[][];				// for example [['"','"']]
	wordDefinition?: RegExp;					// word definition regular expression
	outdentTriggers?: string;					// characters that could potentially cause outdentation
	// enhancedBrackets?: IRegexBracketPair[];     // Advanced auto completion, auto indenting, and bracket matching
}

/**
	* This interface can be shortened as an array, ie. ['{','}','delimiter.curly']
	*/
export interface ILanguageBracket {
	open: string;	// open bracket
	close: string;	// closeing bracket
	token: string;	// token class
}

// export interface ILanguageAutoComplete {
// 	triggers: string;				// characters that trigger auto completion rules
// 	match: string|RegExp;			// autocomplete if this matches
// 	complete: string;				// complete with this string
// }

// export interface ILanguageAutoIndent {
// 	match: string|RegExp; 			// auto indent if this matches on enter
// 	matchAfter: string|RegExp;		// and auto-outdent if this matches on the next line
// }

// /**
// 	* Regular expression based brackets. These are always electric.
// 	*/
// export interface IRegexBracketPair {
// 	// openTrigger?: string; // The character that will trigger the evaluation of 'open'.
// 	open: RegExp; // The definition of when an opening brace is detected. This regex is matched against the entire line upto, and including the last typed character (the trigger character).
// 	closeComplete?: string; // How to complete a matching open brace. Matches from 'open' will be expanded, e.g. '</$1>'
// 	matchCase?: boolean; // If set to true, the case of the string captured in 'open' will be detected an applied also to 'closeComplete'.
// 						// This is useful for cases like BEGIN/END or begin/end where the opening and closing phrases are unrelated.
// 						// For identical phrases, use the $1 replacement syntax above directly in closeComplete, as it will
// 						// include the proper casing from the captured string in 'open'.
// 						// Upper/Lower/Camel cases are detected. Camel case dection uses only the first two characters and assumes
// 						// that 'closeComplete' contains wors separated by spaces (e.g. 'End Loop')

// 	// closeTrigger?: string; // The character that will trigger the evaluation of 'close'.
// 	close?: RegExp; // The definition of when a closing brace is detected. This regex is matched against the entire line upto, and including the last typed character (the trigger character).
// 	tokenType?: string; // The type of the token. Matches from 'open' or 'close' will be expanded, e.g. 'keyword.$1'.
// 						// Only used to auto-(un)indent a closing bracket.
// }

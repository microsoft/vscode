/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ISuggestion} from 'vs/editor/common/modes';

/*
 * Interface types for Monarch language definitions
 * These descriptions are really supposed to be JSON values but if using typescript
 * to describe them, these type definitions can help check the validity.
 */

/**
 * A Monarch language definition
 */
export interface ILanguage {
	/**
	 * unique name to identify the language.
	 */
	name: string;
	/**
	 * map from string to ILanguageRule[]
	 */
	tokenizer: Object;

	/**
	 * nice display name
	 */
	displayName?: string;
	/**
	 * is the language case insensitive?
	 */
	ignoreCase?: boolean;
	/**
	 * used to insert/delete line comments in the editor
	 */
	lineComment?: string;
	/**
	 * used to insert/delete block comments in the editor
	 */
	blockCommentStart?: string;
	/**
	 * used to insert/delete block comments in the editor
	 */
	blockCommentEnd?: string;
	/**
	 * if no match in the tokenizer assign this token class (default 'source')
	 */
	defaultToken?: string;
	/**
	 * for example [['{','}','delimiter.curly']]
	 */
	brackets?: ILanguageBracket[];

	// advanced
	/**
	 * start symbol in the tokenizer (by default the first entry is used)
	 */
	start?: string;
	/**
	 * attach this to every token class (by default '.' + name)
	 */
	tokenPostfix?: string;
	/**
	 * for example [['"','"']]
	 */
	autoClosingPairs?: string[][];
	/**
	 * word definition regular expression
	 */
	wordDefinition?: RegExp;
	/**
	 * characters that could potentially cause outdentation
	 */
	outdentTriggers?: string;
	// /**
	//  * Advanced auto completion, auto indenting, and bracket matching
	//  */
	// enhancedBrackets?: IRegexBracketPair[];

	suggestSupport?: {
		textualCompletions?: boolean;
		disableAutoTrigger?: boolean;
		triggerCharacters?: string[];
		snippets?: ISuggestion[];
	};
}

/**
 * A rule is either a regular expression and an action
 * 		shorthands: [reg,act] == { regex: reg, action: act}
 *		and       : [reg,act,nxt] == { regex: reg, action: act{ next: nxt }}
 */
export interface ILanguageRule {
	/**
	 * match tokens
	 */
	regex?: string|RegExp;
	/**
	 * action to take on match
	 */
	action?: ILanguageAction;

	/**
	 * or an include rule. include all rules from the included state
	 */
	include?: string;
}

/**
 * An action is either an array of actions...
 * ... or a case statement with guards...
 * ... or a basic action with a token value.
 */
export interface ILanguageAction {
	/**
	 * array of actions for each parenthesized match group
	 */
	group?: ILanguageAction[];

	/**
	 * map from string to ILanguageAction
	 */
	cases?: Object;

	/**
	 * token class (ie. css class) (or "@brackets" or "@rematch")
	 */
	token?: string;
	/**
	 * the next state to push, or "@push", "@pop", "@popall"
	 */
	next?: string;
	/**
	 * switch to this state
	 */
	switchTo?: string;
	/**
	 * go back n characters in the stream
	 */
	goBack?: number;
	/**
	 * @open or @close
	 */
	bracket?: string;
	/**
	 * switch to embedded language (useing the mimetype) or get out using "@pop"
	 */
	nextEmbedded?: string;
	/**
	 * log a message to the browser console window
	 */
	log?: string;
}

/**
 * This interface can be shortened as an array, ie. ['{','}','delimiter.curly']
 */
export interface ILanguageBracket {
	/**
	 * open bracket
	 */
	open: string;
	/**
	 * closeing bracket
	 */
	close: string;
	/**
	 * token class
	 */
	token: string;
}

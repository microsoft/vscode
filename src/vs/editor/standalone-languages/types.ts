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
	tokenizer: any;							// map from string to ILanguageRule[]
	tokenPostfix: string;						// attach this to every token class (by default '.' + name)

	// optional
	ignoreCase?: boolean;							// is the language case insensitive?
	defaultToken?: string;						// if no match in the tokenizer assign this token class (default 'source')
	brackets?: ILanguageBracket[];				// for example [['{','}','delimiter.curly']]

	// advanced
	start?: string;								// start symbol in the tokenizer (by default the first entry is used)
}

/**
 * This interface can be shortened as an array, ie. ['{','}','delimiter.curly']
 */
export interface ILanguageBracket {
	open: string;	// open bracket
	close: string;	// closeing bracket
	token: string;	// token class
}

export type CharacterPair = [string, string];

export interface CommentRule {
	lineComment?: string;
	blockComment?: CharacterPair;
}

export interface IIndentationRules {
	decreaseIndentPattern: RegExp;
	increaseIndentPattern: RegExp;
	indentNextLinePattern?: RegExp;
	unIndentedLinePattern?: RegExp;
}

export interface IOnEnterRegExpRules {
	beforeText: RegExp;
	afterText?: RegExp;
	action: IEnterAction;
}

export interface IEnterAction {
	indentAction:IndentAction;
	appendText?:string;
	removeText?:number;
}

export enum IndentAction {
	None,
	Indent,
	IndentOutdent,
	Outdent
}
export interface IAutoClosingPair {
	open:string;
	close:string;
}

export interface IAutoClosingPairConditional extends IAutoClosingPair {
	notIn?: string[];
}

export interface IDocComment {
	scope: string; // What tokens should be used to detect a doc comment (e.g. 'comment.documentation').
	open: string; // The string that starts a doc comment (e.g. '/**')
	lineStart: string; // The string that appears at the start of each line, except the first and last (e.g. ' * ').
	close?: string; // The string that appears on the last line and closes the doc comment (e.g. ' */').
}

export interface IBracketElectricCharacterContribution {
	docComment?: IDocComment;
	embeddedElectricCharacters?: string[];
}

export interface IRichLanguageConfiguration {
	comments?: CommentRule;
	brackets?: CharacterPair[];
	wordPattern?: RegExp;
	indentationRules?: IIndentationRules;
	onEnterRules?: IOnEnterRegExpRules[];
	autoClosingPairs?: IAutoClosingPairConditional[];
	surroundingPairs?: IAutoClosingPair[];
	__electricCharacterSupport?: IBracketElectricCharacterContribution;
}

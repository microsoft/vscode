/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { StandardTokenType } from 'vs/editor/common/modes';

/**
 * Describes how comments for a language work.
 */
export interface CommentRule {
	/**
	 * The line comment token, like `// this is a comment`
	 */
	lineComment?: string;
	/**
	 * The block comment character pair, like `/* block comment *&#47;`
	 */
	blockComment?: CharacterPair;
}

/**
 * The language configuration interface defines the contract between extensions and
 * various editor features, like automatic bracket insertion, automatic indentation etc.
 */
export interface LanguageConfiguration {
	/**
	 * The language's comment settings.
	 */
	comments?: CommentRule;
	/**
	 * The language's brackets.
	 * This configuration implicitly affects pressing Enter around these brackets.
	 */
	brackets?: CharacterPair[];
	/**
	 * The language's word definition.
	 * If the language supports Unicode identifiers (e.g. JavaScript), it is preferable
	 * to provide a word definition that uses exclusion of known separators.
	 * e.g.: A regex that matches anything except known separators (and dot is allowed to occur in a floating point number):
	 *   /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	 */
	wordPattern?: RegExp;
	/**
	 * The language's indentation settings.
	 */
	indentationRules?: IndentationRule;
	/**
	 * The language's rules to be evaluated when pressing Enter.
	 */
	onEnterRules?: OnEnterRule[];
	/**
	 * The language's auto closing pairs. The 'close' character is automatically inserted with the
	 * 'open' character is typed. If not set, the configured brackets will be used.
	 */
	autoClosingPairs?: IAutoClosingPairConditional[];
	/**
	 * The language's surrounding pairs. When the 'open' character is typed on a selection, the
	 * selected string is surrounded by the open and close characters. If not set, the autoclosing pairs
	 * settings will be used.
	 */
	surroundingPairs?: IAutoClosingPair[];

	/**
	 * The language's folding rules.
	 */
	folding?: FoldingRules;

	/**
	 * **Deprecated** Do not use.
	 *
	 * @deprecated Will be replaced by a better API soon.
	 */
	__electricCharacterSupport?: IBracketElectricCharacterContribution;
}

/**
 * Describes indentation rules for a language.
 */
export interface IndentationRule {
	/**
	 * If a line matches this pattern, then all the lines after it should be unindendented once (until another rule matches).
	 */
	decreaseIndentPattern: RegExp;
	/**
	 * If a line matches this pattern, then all the lines after it should be indented once (until another rule matches).
	 */
	increaseIndentPattern: RegExp;
	/**
	 * If a line matches this pattern, then **only the next line** after it should be indented once.
	 */
	indentNextLinePattern?: RegExp;
	/**
	 * If a line matches this pattern, then its indentation should not be changed and it should not be evaluated against the other rules.
	 */
	unIndentedLinePattern?: RegExp;

}

/**
 * Describes language specific folding markers such as '#region' and '#endregion'.
 * The start and end regexes will be tested against the contents of all lines and must be designed efficiently:
 * - the regex should start with '^'
 * - regexp flags (i, g) are ignored
 */
export interface FoldingMarkers {
	start: RegExp;
	end: RegExp;
}

/**
 * Describes folding rules for a language.
 */
export interface FoldingRules {
	/**
	 * Used by the indentation based strategy to decide wheter empty lines belong to the previous or the next block.
	 * A language adheres to the off-side rule if blocks in that language are expressed by their indentation.
	 * See [wikipedia](https://en.wikipedia.org/wiki/Off-side_rule) for more information.
	 * If not set, `false` is used and empty lines belong to the previous block.
	 */
	offSide?: boolean;

	/**
	 * Region markers used by the language.
	 */
	markers?: FoldingMarkers;
}

/**
 * Describes a rule to be evaluated when pressing Enter.
 */
export interface OnEnterRule {
	/**
	 * This rule will only execute if the text before the cursor matches this regular expression.
	 */
	beforeText: RegExp;
	/**
	 * This rule will only execute if the text after the cursor matches this regular expression.
	 */
	afterText?: RegExp;
	/**
	 * The action to execute.
	 */
	action: EnterAction;
}

export interface IBracketElectricCharacterContribution {
	docComment?: IDocComment;
}

/**
 * Definition of documentation comments (e.g. Javadoc/JSdoc)
 */
export interface IDocComment {
	/**
	 * The string that starts a doc comment (e.g. '/**')
	 */
	open: string;
	/**
	 * The string that appears on the last line and closes the doc comment (e.g. ' * /').
	 */
	close: string;
}

/**
 * A tuple of two characters, like a pair of
 * opening and closing brackets.
 */
export type CharacterPair = [string, string];

export interface IAutoClosingPair {
	open: string;
	close: string;
}

export interface IAutoClosingPairConditional extends IAutoClosingPair {
	notIn?: string[];
	onlyIn?: string[];
	cursorPosition?: number;
}

/**
 * Describes what to do with the indentation when pressing Enter.
 */
export enum IndentAction {
	/**
	 * Insert new line and copy the previous line's indentation.
	 */
	None = 0,
	/**
	 * Insert new line and indent once (relative to the previous line's indentation).
	 */
	Indent = 1,
	/**
	 * Insert two new lines:
	 *  - the first one indented which will hold the cursor
	 *  - the second one at the same indentation level
	 */
	IndentOutdent = 2,
	/**
	 * Insert new line and outdent once (relative to the previous line's indentation).
	 */
	Outdent = 3
}

/**
 * Describes what to do when pressing Enter.
 */
export interface EnterAction {
	/**
	 * Describe what to do with the indentation.
	 */
	indentAction: IndentAction;
	/**
	 * Describe whether to outdent current line.
	 */
	outdentCurrentLine?: boolean;
	/**
	 * Describes text to be appended after the new line and after the indentation.
	 */
	appendText?: string;
	/**
	 * Describes the number of characters to remove from the new line's indentation.
	 */
	removeText?: number;
}

/**
 * @internal
 */
export class StandardAutoClosingPairConditional {
  _standardAutoClosingPairConditionalBrand: void;

	readonly open: string;
  readonly close: string;
  private readonly _standardTokenMask: number;

  private readonly _cursorPositionOption: number;
  private readonly _onlyInFlag: number;
  private readonly _onlyInOptions: string;
  private readonly _value: number;
  private readonly _optionSum: number;

	constructor(source: IAutoClosingPairConditional) {
		this.open = source.open;
		this.close = source.close;

		// initially allowed in all tokens
		this._standardTokenMask = 0;

		// Check if interger
		if (source.cursorPosition && !isNaN(source.cursorPosition) && (source.cursorPosition % 1 == 0)) {
		  // Make sure the given integer (cursor position) is within the bounds of the close string
		  if (source.cursorPosition >= 0 && source.cursorPosition <= this.close.length) {
			this._cursorPositionOption = source.cursorPosition;
		  }
		}
    
		if (Array.isArray(source.notIn)) {
			for (let i = 0, len = source.notIn.length; i < len; i++) {
				let notIn = source.notIn[i];
				switch (notIn) {
					case 'string':
						this._standardTokenMask |= StandardTokenType.String;
						break;
					case 'comment':
						this._standardTokenMask |= StandardTokenType.Comment;
						break;
					case 'regex':
						this._standardTokenMask |= StandardTokenType.RegEx;
						break;
				}
			}
		  /**
		  * The onlyIn array will define the scopes we only want the autoCompletion to be used for
		  * It is the opposite of the notIn array.
		  */
		} else if (Array.isArray(source.onlyIn)) {
		  	/**
			* Use a string variable (_onlyInOptions) to keep track of which scopes
			* have (already) been listed. The 'other' option is not considered.
			*/
			this._onlyInFlag = 1;
			this._onlyInOptions = '';

			for (let i = 0, len = source.onlyIn.length; i < len; i++) {
				let onlyIn = source.onlyIn[i];
			  	switch (onlyIn) {
					case 'string':
				  	if (this._onlyInOptions.indexOf('2') == -1) {
						this._onlyInOptions += '2';
				  	}
				  	break;
					case 'comment':
				  	if (this._onlyInOptions.indexOf('1') == -1) {
						this._onlyInOptions += '1';
				  	}
				  	break;
					case 'regex':
				  	if (this._onlyInOptions.indexOf('4') == -1) {
						this._onlyInOptions += '4';
				  	}
				  	break;
			  	}
			}

			this._value = +this._onlyInOptions;
			this._optionSum = 0;

			/**
			* Loop through each digit and add them all together to determine the case,
			* i.e. '24' = ['string', 'regex']. Sum = 6, which is case 6. 
			* We want to do this so that the order of the "onlyIn" input doesn't matter
			*/
			while (this._value > 0) {
				this._optionSum += this._value % 10;
				this._value = Math.floor(this._value / 10);
			}

			switch (this._optionSum) {
				case 1: // ['comment']
					// AND result (in isOK) returns 0 only if standardToken = 'comment' (1)
					this._standardTokenMask = 6;
					break;
			  	case 2: // ['string']
					// AND result 0 only if standardToken = 'string' (2)
					this._standardTokenMask = 5;
					break;
			  	case 3: // ['comment', 'string']
					// AND result returns 0 only if standardToken = 'comment' (1) or 'string' (2)
					this._standardTokenMask = 4;
					break;
			  	case 4: // ['regex']
					// AND result returns 0 only if standardToken 'regex' (4)
					this._standardTokenMask = 3;
					break;
			  	case 5: // ['comment', 'regex']
					// AND result returns 0 only if standardToken 'comment' (1) or 'regex' (4)
					this._standardTokenMask = 2;
					break;
			  	case 6: // ['string', 'regex']
					// AND result returns 0 only if standardToken 'string' (2) or 'regex' (4)
					this._standardTokenMask = 1;
					break;
			  	case 7: // ['comment', 'string', 'regex']
					// AND result returns 0 for any given scope
					this._standardTokenMask = 0;
					break; 
			}
		}
	}

  //*** Set a variable to determine if we have a notIn array or an onlyIn array (or neither)
  //*** If the onlyIn array var is set, check if the StandardTokenType of isOK is "other". If so, return 1 (i.e. don't autoclose)
	public isOK(standardToken: StandardTokenType): boolean {
		if (this._onlyInFlag && (standardToken == StandardTokenType.Other)) {
			return false;
		}
	    return (this._standardTokenMask & <number>standardToken) === 0;
	}

	//*** Get the user input for the autoclose cursor position (if it's valid)
	public getCursorPositionOption(): number {
		if (this._cursorPositionOption) {
			return this._cursorPositionOption;
		}
		return null;
	}
}

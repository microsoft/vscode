/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import { CharacterPair, EnterAction, IndentAction, OnEnterRule } from 'vs/editor/common/languages/languageConfiguration';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';

export interface IOnEnterSupportOptions {
	// This is an array of arrays of bracket characters
	brackets?: CharacterPair[];
	onEnterRules?: OnEnterRule[];
}

interface IProcessedBracketPair {
	open: string;
	close: string;
	openRegExp: RegExp;
	closeRegExp: RegExp;
}

export class OnEnterSupport {

	private readonly _brackets: IProcessedBracketPair[];
	private readonly _regExpRules: OnEnterRule[];

	constructor(opts: IOnEnterSupportOptions) {
		opts = opts || {};
		// We have a default for the character brackets which are considered as opening and closing pairs in the editor
		opts.brackets = opts.brackets || [
			['(', ')'],
			['{', '}'],
			['[', ']']
		];

		this._brackets = [];
		opts.brackets.forEach((bracket) => {
			const openRegExp = OnEnterSupport._createOpenBracketRegExp(bracket[0]);
			const closeRegExp = OnEnterSupport._createCloseBracketRegExp(bracket[1]);
			// If the two regexes are valid, we will push the character in that array which is part of the pair as well as the corresponding regex
			if (openRegExp && closeRegExp) {
				this._brackets.push({
					open: bracket[0],
					openRegExp: openRegExp,
					close: bracket[1],
					closeRegExp: closeRegExp,
				});
			}
		});
		// By default we do not have an on enter rules
		this._regExpRules = opts.onEnterRules || [];
	}

	public onEnter(autoIndent: EditorAutoIndentStrategy, previousLineText: string, beforeEnterText: string, afterEnterText: string): EnterAction | null {
		console.log('onEnter of OnEnterSupport');
		// (1): `regExpRules`
		// Here advanced and full are covered by the following code, but not the brackets strategy and the strategies below it
		if (autoIndent >= EditorAutoIndentStrategy.Advanced) {
			// Iterate over all the rules
			for (let i = 0, len = this._regExpRules.length; i < len; i++) {
				const rule = this._regExpRules[i];
				// Create a new array of regex versus text and check that all of the regexes validate the corresponding texts
				const regResult = [{
					reg: rule.beforeText,
					text: beforeEnterText
				}, {
					reg: rule.afterText,
					text: afterEnterText
				}, {
					reg: rule.previousLineText,
					text: previousLineText
				}].every((obj): boolean => {
					if (!obj.reg) {
						return true;
					}

					obj.reg.lastIndex = 0; // To disable the effect of the "g" flag.
					return obj.reg.test(obj.text);
				});

				// Suppose that all the corresponding regexes are validated
				// In that case, need to return the corresponding action
				if (regResult) {
					console.log('return 1');
					return rule.action;
				}
			}
		}

		// (2): Special indent-outdent
		// For the strategies Brackets, Advanced and Full
		if (autoIndent >= EditorAutoIndentStrategy.Brackets) {
			if (beforeEnterText.length > 0 && afterEnterText.length > 0) {
				for (let i = 0, len = this._brackets.length; i < len; i++) {
					const bracket = this._brackets[i];
					// If before the cursor position, the bracket open regexp matches the beforeEnterText, and the closRegExp matches the afterEnterText
					// Then we insert an indented line, followed by a line at the same indentation level (or outdented with respect to previous indented line).
					if (bracket.openRegExp.test(beforeEnterText) && bracket.closeRegExp.test(afterEnterText)) {
						console.log('return 2');
						return { indentAction: IndentAction.IndentOutdent };
					}
				}
			}
		}


		// (4): Open bracket based logic
		// If we previously had not returned yet, we can still return some result in the following code
		if (autoIndent >= EditorAutoIndentStrategy.Brackets) {
			if (beforeEnterText.length > 0) {
				for (let i = 0, len = this._brackets.length; i < len; i++) {
					const bracket = this._brackets[i];
					// Otherwise we just indent the new next line, but do not outdent the line after
					if (bracket.openRegExp.test(beforeEnterText)) {
						console.log('return 3');
						return { indentAction: IndentAction.Indent };
					}
				}
			}
		}

		console.log('return 4');
		return null;
	}

	private static _createOpenBracketRegExp(bracket: string): RegExp | null {
		// The following allows to creat an escaped string
		let str = strings.escapeRegExpCharacters(bracket);
		if (!/\B/.test(str.charAt(0))) {
			str = '\\b' + str;
		}
		// Adding a variable number of whitespace characters
		str += '\\s*$';
		return OnEnterSupport._safeRegExp(str);
	}

	private static _createCloseBracketRegExp(bracket: string): RegExp | null {
		let str = strings.escapeRegExpCharacters(bracket);
		if (!/\B/.test(str.charAt(str.length - 1))) {
			str = str + '\\b';
		}
		str = '^\\s*' + str;
		return OnEnterSupport._safeRegExp(str);
	}

	private static _safeRegExp(def: string): RegExp | null {
		try {
			return new RegExp(def);
		} catch (err) {
			onUnexpectedError(err);
			return null;
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import { CharacterPair, IndentationRule, IndentAction, EnterAction, OnEnterRule } from 'vs/editor/common/modes/languageConfiguration';

export interface IOnEnterSupportOptions {
	brackets?: CharacterPair[];
	indentationRules?: IndentationRule;
	regExpRules?: OnEnterRule[];
}

interface IProcessedBracketPair {
	open: string;
	close: string;
	openRegExp: RegExp;
	closeRegExp: RegExp;
}

export class OnEnterSupport {

	private readonly _brackets: IProcessedBracketPair[];
	private readonly _indentationRules: IndentationRule;
	private readonly _regExpRules: OnEnterRule[];

	constructor(opts?: IOnEnterSupportOptions) {
		opts = opts || {};
		opts.brackets = opts.brackets || [
			['(', ')'],
			['{', '}'],
			['[', ']']
		];

		this._brackets = opts.brackets.map((bracket) => {
			return {
				open: bracket[0],
				openRegExp: OnEnterSupport._createOpenBracketRegExp(bracket[0]),
				close: bracket[1],
				closeRegExp: OnEnterSupport._createCloseBracketRegExp(bracket[1]),
			};
		});
		this._regExpRules = opts.regExpRules || [];
		this._indentationRules = opts.indentationRules;
	}

	public onEnter(oneLineAboveText: string, beforeEnterText: string, afterEnterText: string): EnterAction {
		// (1): `regExpRules`
		for (let i = 0, len = this._regExpRules.length; i < len; i++) {
			let rule = this._regExpRules[i];
			if (rule.beforeText.test(beforeEnterText)) {
				if (rule.afterText) {
					if (rule.afterText.test(afterEnterText)) {
						return rule.action;
					}
				} else {
					return rule.action;
				}
			}
		}

		// (2): Special indent-outdent
		if (beforeEnterText.length > 0 && afterEnterText.length > 0) {
			for (let i = 0, len = this._brackets.length; i < len; i++) {
				let bracket = this._brackets[i];
				if (bracket.openRegExp.test(beforeEnterText) && bracket.closeRegExp.test(afterEnterText)) {
					return { indentAction: IndentAction.IndentOutdent };
				}
			}
		}

		// (3): Indentation Support
		if (this._indentationRules) {
			let indentOffset: null | number = null;
			let outdentCurrentLine = false;

			if (this._indentationRules.increaseIndentPattern && this._indentationRules.increaseIndentPattern.test(beforeEnterText)) {
				indentOffset = 1;
			}
			if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(beforeEnterText)) {
				indentOffset = 1;
			}

			/**
			 * Since the indentation of `beforeEnterText` might not be correct, we still provide the correct indent action
			 * even if there is nothing to outdent from.
			 */
			if (this._indentationRules.decreaseIndentPattern && this._indentationRules.decreaseIndentPattern.test(afterEnterText)) {
				indentOffset = indentOffset ? indentOffset - 1 : -1;
			}
			if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(oneLineAboveText)) {
				indentOffset = indentOffset ? indentOffset - 1 : -1;
			}
			if (this._indentationRules.decreaseIndentPattern && this._indentationRules.decreaseIndentPattern.test(beforeEnterText)) {
				outdentCurrentLine = true;
			}

			if (indentOffset !== null || outdentCurrentLine) {
				// this means at least one indentation rule is matched so we should handle it
				indentOffset = indentOffset || 0;
				switch (indentOffset) {
					case -1:
						return { indentAction: IndentAction.Outdent, outdentCurrentLine: outdentCurrentLine };
					case 0:
						return { indentAction: IndentAction.None, outdentCurrentLine: outdentCurrentLine };
					case 1:
						return { indentAction: IndentAction.Indent, outdentCurrentLine: outdentCurrentLine };
				}
			}
		}

		// (4): Open bracket based logic
		if (beforeEnterText.length > 0) {
			for (let i = 0, len = this._brackets.length; i < len; i++) {
				let bracket = this._brackets[i];
				if (bracket.openRegExp.test(beforeEnterText)) {
					return { indentAction: IndentAction.Indent };
				}
			}
		}

		return null;
	}

	public containNonWhitespace(text: string): boolean {
		// the text doesn't contain any non-whitespace character.
		let nonWhitespaceIdx = strings.lastNonWhitespaceIndex(text);

		if (nonWhitespaceIdx >= 0) {
			return true;
		}

		return false;
	}

	public shouldIgnore(text: string): boolean {
		// the text matches `unIndentedLinePattern`
		if (this._indentationRules && this._indentationRules.unIndentedLinePattern && this._indentationRules.unIndentedLinePattern.test(text)) {
			return true;
		}

		return false;
	}

	private static _createOpenBracketRegExp(bracket: string): RegExp {
		var str = strings.escapeRegExpCharacters(bracket);
		if (!/\B/.test(str.charAt(0))) {
			str = '\\b' + str;
		}
		str += '\\s*$';
		return OnEnterSupport._safeRegExp(str);
	}

	private static _createCloseBracketRegExp(bracket: string): RegExp {
		var str = strings.escapeRegExpCharacters(bracket);
		if (!/\B/.test(str.charAt(str.length - 1))) {
			str = str + '\\b';
		}
		str = '^\\s*' + str;
		return OnEnterSupport._safeRegExp(str);
	}

	private static _safeRegExp(def: string): RegExp {
		try {
			return new RegExp(def);
		} catch (err) {
			onUnexpectedError(err);
			return null;
		}
	}
}


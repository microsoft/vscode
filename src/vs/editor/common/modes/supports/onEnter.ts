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
			let enterAction: EnterAction = null;

			if (this._indentationRules.increaseIndentPattern && this._indentationRules.increaseIndentPattern.test(beforeEnterText)) {
				enterAction = { indentAction: IndentAction.Indent };
			}
			if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(beforeEnterText)) {
				enterAction = { indentAction: IndentAction.Indent };
			}
			if (/^\s/.test(beforeEnterText)) {
				// No reason to run regular expressions if there is nothing to outdent from
				if (this._indentationRules.decreaseIndentPattern && this._indentationRules.decreaseIndentPattern.test(afterEnterText)) {
					enterAction = { indentAction: IndentAction.Outdent };
				}
				if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(oneLineAboveText)) {
					enterAction = { indentAction: IndentAction.Outdent };
				}
			}

			if (enterAction !== null) {
				return enterAction;
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

	public getInheritedIndentationRules(text: string, textOneLineAbove?: string): IndentAction {
		let offset = 0;
		if (this._indentationRules) {
			if (textOneLineAbove && this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(textOneLineAbove)) {
				offset -= 1;
			}

			let indentOffset = 0;

			if (this._indentationRules.increaseIndentPattern && this._indentationRules.increaseIndentPattern.test(text)) {
				indentOffset = 1;
			}

			if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(text)) {
				indentOffset = 1;
			}

			offset += indentOffset;
		}

		switch (offset) {
			case 0:
				return IndentAction.None;
			case 1:
				return IndentAction.Indent;
			case -1:
				return IndentAction.Outdent;
			default:
				break;
		}

		return null;
	}

	public getIndentActionForContent(text: string): IndentAction {
		if (this._indentationRules && /^\s/.test(text)) {
			// No reason to run regular expressions if there is nothing to outdent from
			if (this._indentationRules.decreaseIndentPattern && this._indentationRules.decreaseIndentPattern.test(text)) {
				return IndentAction.Outdent;
			}
		}

		return null;
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


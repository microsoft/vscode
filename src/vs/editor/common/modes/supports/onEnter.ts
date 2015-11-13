/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {handleEvent} from 'vs/editor/common/modes/supports';
import {IEnterAction, IndentAction, IOnEnterSupport, ILineContext, IMode} from 'vs/editor/common/modes';
import EditorCommon = require('vs/editor/common/editorCommon');
import Errors = require('vs/base/common/errors');
import Strings = require('vs/base/common/strings');

export interface IBracketPair {
	open: string;
	close: string;
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

export interface IOnEnterSupportOptions {
	brackets?: IBracketPair[];
	indentationRules?: IIndentationRules;
	regExpRules?: IOnEnterRegExpRules[];
}

interface IProcessedBracketPair extends IBracketPair {
	openRegExp: RegExp;
	closeRegExp: RegExp;
}

export class OnEnterSupport implements IOnEnterSupport {

	private static _INDENT: IEnterAction = { indentAction: IndentAction.Indent };
	private static _INDENT_OUTDENT: IEnterAction = { indentAction: IndentAction.IndentOutdent };
	private static _OUTDENT: IEnterAction = { indentAction: IndentAction.Outdent };

	private _modeId: string;
	private _brackets: IProcessedBracketPair[];
	private _indentationRules: IIndentationRules;
	private _regExpRules: IOnEnterRegExpRules[];

	constructor(modeId: string, opts?:IOnEnterSupportOptions) {
		opts = opts || {};
		opts.brackets = opts.brackets || [
			{ open: '(', close: ')' },
			{ open: '{', close: '}' },
			{ open: '[', close: ']' }
		];

		this._modeId = modeId;
		this._brackets = opts.brackets.map((bracket) => {
			return {
				open: bracket.open,
				openRegExp: OnEnterSupport._createOpenBracketRegExp(bracket.open),
				close: bracket.close,
				closeRegExp: OnEnterSupport._createCloseBracketRegExp(bracket.close),
			};
		});
		this._regExpRules = opts.regExpRules || [];
		this._indentationRules = opts.indentationRules;
	}

	public onEnter(model:EditorCommon.ITokenizedModel, position: EditorCommon.IPosition): IEnterAction {
		var context = model.getLineContext(position.lineNumber);

		return handleEvent(context, position.column - 1, (nestedMode:IMode, context:ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return this._onEnter(model, position);
			} else if (nestedMode.onEnterSupport) {
				return nestedMode.onEnterSupport.onEnter(model, position);
			} else {
				return null;
			}
		});
	}

	private _onEnter(model:EditorCommon.ITextModel, position: EditorCommon.IPosition): IEnterAction {
		let lineText = model.getLineContent(position.lineNumber);
		let beforeEnterText = lineText.substr(0, position.column - 1);
		let afterEnterText = lineText.substr(position.column - 1);

		let oneLineAboveText = position.lineNumber === 1 ? '' : model.getLineContent(position.lineNumber - 1);

		return this._actualOnEnter(oneLineAboveText, beforeEnterText, afterEnterText);
	}

	_actualOnEnter(oneLineAboveText:string, beforeEnterText:string, afterEnterText:string): IEnterAction {
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
					return OnEnterSupport._INDENT_OUTDENT;
				}
			}
		}

		// (3): Indentation Support
		if (this._indentationRules) {
			if (this._indentationRules.increaseIndentPattern && this._indentationRules.increaseIndentPattern.test(beforeEnterText)) {
				return OnEnterSupport._INDENT;
			}
			if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(beforeEnterText)) {
				return OnEnterSupport._INDENT;
			}
			if (/^\s/.test(beforeEnterText)) {
				// No reason to run regular expressions if there is nothing to outdent from
				if (this._indentationRules.decreaseIndentPattern && this._indentationRules.decreaseIndentPattern.test(afterEnterText)) {
					return OnEnterSupport._OUTDENT;
				}
				if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(oneLineAboveText)) {
					return OnEnterSupport._OUTDENT;
				}
			}
		}

		// (4): Open Bracket based logic
		if (beforeEnterText.length > 0) {
			for (let i = 0, len = this._brackets.length; i < len; i++) {
				let bracket = this._brackets[i];
				if (bracket.openRegExp.test(beforeEnterText)) {
					return OnEnterSupport._INDENT;
				}
			}
		}

		return null;
	}

	private static _createOpenBracketRegExp(bracket:string): RegExp {
		var str = Strings.escapeRegExpCharacters(bracket);
		if (!/\B/.test(str.charAt(0))) {
			str = '\\b' + str;
		}
		str += '\\s*$';
		return OnEnterSupport._safeRegExp(str);
	}

	private static _createCloseBracketRegExp(bracket:string): RegExp {
		var str = Strings.escapeRegExpCharacters(bracket);
		if (!/\B/.test(str.charAt(str.length - 1))) {
			str = str + '\\b';
		}
		str = '^\\s*' + str;
		return OnEnterSupport._safeRegExp(str);
	}

	private static _safeRegExp(def:string): RegExp {
		try {
			return new RegExp(def);
		} catch(err) {
			Errors.onUnexpectedError(err);
			return null;
		}
	}
}

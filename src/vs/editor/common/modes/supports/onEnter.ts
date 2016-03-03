/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import {Position} from 'vs/editor/common/core/position';
import {IPosition, ITextModel, ITokenizedModel} from 'vs/editor/common/editorCommon';
import {IEnterAction, ILineContext, IMode, IRichEditOnEnter, IndentAction, CharacterPair} from 'vs/editor/common/modes';
import {handleEvent} from 'vs/editor/common/modes/supports';

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
	brackets?: CharacterPair[];
	indentationRules?: IIndentationRules;
	regExpRules?: IOnEnterRegExpRules[];
}

interface IProcessedBracketPair {
	open: string;
	close: string;
	openRegExp: RegExp;
	closeRegExp: RegExp;
}

export class OnEnterSupport implements IRichEditOnEnter {

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
			['(', ')'],
			['{', '}'],
			['[', ']']
		];

		this._modeId = modeId;
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

	public onEnter(model:ITokenizedModel, position: IPosition): IEnterAction {
		var context = model.getLineContext(position.lineNumber);

		return handleEvent(context, position.column - 1, (nestedMode:IMode, context:ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return this._onEnter(model, position);
			} else if (nestedMode.richEditSupport && nestedMode.richEditSupport.onEnter) {
				return nestedMode.richEditSupport.onEnter.onEnter(model, position);
			} else {
				return null;
			}
		});
	}

	private _onEnter(model:ITextModel, position: IPosition): IEnterAction {
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

		// (4): Open bracket based logic
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
		var str = strings.escapeRegExpCharacters(bracket);
		if (!/\B/.test(str.charAt(0))) {
			str = '\\b' + str;
		}
		str += '\\s*$';
		return OnEnterSupport._safeRegExp(str);
	}

	private static _createCloseBracketRegExp(bracket:string): RegExp {
		var str = strings.escapeRegExpCharacters(bracket);
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
			onUnexpectedError(err);
			return null;
		}
	}
}

export function getRawEnterActionAtPosition(model:ITokenizedModel, lineNumber:number, column:number): IEnterAction {
	let result:IEnterAction;
	let richEditSupport = model.getMode().richEditSupport;

	if (richEditSupport && richEditSupport.onEnter) {
		try {
			result = richEditSupport.onEnter.onEnter(model, new Position(lineNumber, column));
		} catch (e) {
			onUnexpectedError(e);
		}
	}

	return result;
}

export function getEnterActionAtPosition(model:ITokenizedModel, lineNumber:number, column:number): { enterAction: IEnterAction; indentation: string; } {
	let lineText = model.getLineContent(lineNumber);
	let indentation = strings.getLeadingWhitespace(lineText);
	if (indentation.length > column - 1) {
		indentation = indentation.substring(0, column - 1);
	}

	let enterAction = getRawEnterActionAtPosition(model, lineNumber, column);
	if (!enterAction) {
		enterAction = {
			indentAction: IndentAction.None,
			appendText: '',
		};
	} else {
		if(!enterAction.appendText) {
			if (
				(enterAction.indentAction === IndentAction.Indent) ||
				(enterAction.indentAction === IndentAction.IndentOutdent)
			) {
				enterAction.appendText = '\t';
			} else {
				enterAction.appendText = '';
			}
		}
	}

	if (enterAction.removeText) {
		indentation = indentation.substring(0, indentation.length - 1);
	}

	return {
		enterAction: enterAction,
		indentation: indentation
	};
}

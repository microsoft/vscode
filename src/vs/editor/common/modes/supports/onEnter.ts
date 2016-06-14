/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import {IPosition, ITextModel, ITokenizedModel} from 'vs/editor/common/editorCommon';
import {EnterAction, ILineContext, IRichEditOnEnter, IndentAction, CharacterPair} from 'vs/editor/common/modes';
import {handleEvent} from 'vs/editor/common/modes/supports';
import {LanguageConfigurationRegistryImpl} from 'vs/editor/common/modes/languageConfigurationRegistry';

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

export class OnEnterSupport implements IRichEditOnEnter {

	private static _INDENT: EnterAction = { indentAction: IndentAction.Indent };
	private static _INDENT_OUTDENT: EnterAction = { indentAction: IndentAction.IndentOutdent };
	private static _OUTDENT: EnterAction = { indentAction: IndentAction.Outdent };

	private _registry: LanguageConfigurationRegistryImpl;
	private _modeId: string;
	private _brackets: IProcessedBracketPair[];
	private _indentationRules: IndentationRule;
	private _regExpRules: OnEnterRule[];

	constructor(registry: LanguageConfigurationRegistryImpl, modeId: string, opts?:IOnEnterSupportOptions) {
		this._registry = registry;
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

	public onEnter(model:ITokenizedModel, position: IPosition): EnterAction {
		var context = model.getLineContext(position.lineNumber);

		return handleEvent(context, position.column - 1, (nestedModeId:string, context:ILineContext, offset:number) => {
			if (this._modeId === nestedModeId) {
				return this._onEnter(model, position);
			}

			let onEnterSupport = this._registry.getOnEnterSupport(nestedModeId);
			if (onEnterSupport) {
				return onEnterSupport.onEnter(model, position);
			}

			return null;
		});
	}

	private _onEnter(model:ITextModel, position: IPosition): EnterAction {
		let lineText = model.getLineContent(position.lineNumber);
		let beforeEnterText = lineText.substr(0, position.column - 1);
		let afterEnterText = lineText.substr(position.column - 1);

		let oneLineAboveText = position.lineNumber === 1 ? '' : model.getLineContent(position.lineNumber - 1);

		return this._actualOnEnter(oneLineAboveText, beforeEnterText, afterEnterText);
	}

	_actualOnEnter(oneLineAboveText:string, beforeEnterText:string, afterEnterText:string): EnterAction {
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


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorAutoIndentStrategy } from '../../config/editorOptions.js';
import { IndentAction, IndentationRule } from '../languageConfiguration.js';
import { OnEnterSupport } from './onEnter.js';

export const enum IndentConsts {
	INCREASE_MASK = 0b00000001,
	DECREASE_MASK = 0b00000010,
	INDENT_NEXTLINE_MASK = 0b00000100,
	UNINDENT_MASK = 0b00001000,
}

function resetGlobalRegex(reg: RegExp) {
	if (reg.global) {
		reg.lastIndex = 0;
	}

	return true;
}

export class IndentRulesSupport {

	private readonly _indentationRules: IndentationRule;
	private readonly _onEnterSupport: OnEnterSupport | null;

	constructor(indentationRules: IndentationRule, onEnterSupport: OnEnterSupport | null) {
		this._indentationRules = indentationRules;
		this._onEnterSupport = onEnterSupport;
	}

	public shouldIncrease(autoIndent: EditorAutoIndentStrategy, useOnEnterRulesForInheritedIndent: boolean, text: string): boolean {
		if (this._indentationRules) {
			if (this._indentationRules.increaseIndentPattern && resetGlobalRegex(this._indentationRules.increaseIndentPattern) && this._indentationRules.increaseIndentPattern.test(text)) {
				return true;
			}
		}
		if (this._onEnterSupport && useOnEnterRulesForInheritedIndent) {
			const enterResult = this._onEnterSupport.onEnter(autoIndent, '', '', text);
			if (enterResult && enterResult.indentAction === IndentAction.Indent) {
				return true;
			}
		}
		return false;
	}

	public shouldDecrease(autoIndent: EditorAutoIndentStrategy, useOnEnterRulesForInheritedIndent: boolean, text: string): boolean {
		if (this._indentationRules && this._indentationRules.decreaseIndentPattern && resetGlobalRegex(this._indentationRules.decreaseIndentPattern) && this._indentationRules.decreaseIndentPattern.test(text)) {
			return true;
		}
		if (this._onEnterSupport && useOnEnterRulesForInheritedIndent) {
			const enterResult = this._onEnterSupport.onEnter(autoIndent, '', '', text);
			if (enterResult && enterResult.indentAction === IndentAction.Outdent) {
				return true;
			}
		}
		return false;
	}

	public shouldIndentNextLine(autoIndent: EditorAutoIndentStrategy, useOnEnterRulesForInheritedIndent: boolean, text: string): boolean {
		if (this._indentationRules && this._indentationRules.indentNextLinePattern && resetGlobalRegex(this._indentationRules.indentNextLinePattern) && this._indentationRules.indentNextLinePattern.test(text)) {
			return true;
		}
		if (this._onEnterSupport && useOnEnterRulesForInheritedIndent) {
			const enterResult = this._onEnterSupport.onEnter(autoIndent, '', '', text);
			if (enterResult && enterResult.indentAction === IndentAction.IndentOutdent) {
				return true;
			}
		}
		return false;
	}

	public shouldIgnore(autoIndent: EditorAutoIndentStrategy, useOnEnterRulesForInheritedIndent: boolean, text: string): boolean {
		// the text matches `unIndentedLinePattern`
		if (this._indentationRules && this._indentationRules.unIndentedLinePattern && resetGlobalRegex(this._indentationRules.unIndentedLinePattern) && this._indentationRules.unIndentedLinePattern.test(text)) {
			return true;
		}
		if (this._onEnterSupport && useOnEnterRulesForInheritedIndent) {
			const enterResult = this._onEnterSupport.onEnter(autoIndent, '', '', text);
			if (enterResult && enterResult.indentAction === IndentAction.None) {
				return true;
			}
		}
		return false;
	}

	public getIndentMetadata(autoIndent: EditorAutoIndentStrategy, useOnEnterRulesForInheritedIndent: boolean, text: string): number {
		let ret = 0;
		if (this.shouldIncrease(autoIndent, useOnEnterRulesForInheritedIndent, text)) {
			ret += IndentConsts.INCREASE_MASK;
		}
		if (this.shouldDecrease(autoIndent, useOnEnterRulesForInheritedIndent, text)) {
			ret += IndentConsts.DECREASE_MASK;
		}
		if (this.shouldIndentNextLine(autoIndent, useOnEnterRulesForInheritedIndent, text)) {
			ret += IndentConsts.INDENT_NEXTLINE_MASK;
		}
		if (this.shouldIgnore(autoIndent, useOnEnterRulesForInheritedIndent, text)) {
			ret += IndentConsts.UNINDENT_MASK;
		}
		return ret;
	}
}

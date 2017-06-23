/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { IndentationRule, IndentAction } from 'vs/editor/common/modes/languageConfiguration';

export class IndentRulesSupport {

	private readonly _indentationRules: IndentationRule;

	constructor(indentationRules: IndentationRule) {
		this._indentationRules = indentationRules;
	}

	public onType(text: string): IndentAction {
		if (this._indentationRules) {
			if (this._indentationRules.unIndentedLinePattern && this._indentationRules.unIndentedLinePattern.test(text)) {
				return null;
			}

			if (this._indentationRules.decreaseIndentPattern && this._indentationRules.decreaseIndentPattern.test(text)) {
				return IndentAction.Outdent;
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

	public shouldIncrease(text: string): boolean {
		if (this._indentationRules) {
			if (this._indentationRules.increaseIndentPattern && this._indentationRules.increaseIndentPattern.test(text)) {
				return true;
			}
			// if (this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(text)) {
			// 	return true;
			// }
		}
		return false;
	}

	public shouldDecrease(text: string): boolean {
		if (this._indentationRules && this._indentationRules.decreaseIndentPattern && this._indentationRules.decreaseIndentPattern.test(text)) {
			return true;
		}
		return false;
	}

	public shouldIndentNextLine(text: string): boolean {
		if (this._indentationRules && this._indentationRules.indentNextLinePattern && this._indentationRules.indentNextLinePattern.test(text)) {
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
}


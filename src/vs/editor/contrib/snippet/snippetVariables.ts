/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { basename, dirname } from 'vs/base/common/paths';
import { ITextModel } from 'vs/editor/common/model';
import { Selection } from 'vs/editor/common/core/selection';
import { VariableResolver, Variable, Text } from 'vs/editor/contrib/snippet/snippetParser';
import { getLeadingWhitespace, commonPrefixLength, isFalsyOrWhitespace, pad } from 'vs/base/common/strings';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';

export const KnownSnippetVariableNames = Object.freeze({
	'CURRENT_YEAR': true,
	'CURRENT_YEAR_SHORT': true,
	'CURRENT_MONTH': true,
	'CURRENT_DATE': true,
	'CURRENT_HOUR': true,
	'CURRENT_MINUTE': true,
	'CURRENT_SECOND': true,
	'CURRENT_DAY_NAME': true,
	'CURRENT_DAY_NAME_SHORT': true,
	'CURRENT_MONTH_NAME': true,
	'CURRENT_MONTH_NAME_SHORT': true,
	'SELECTION': true,
	'CLIPBOARD': true,
	'TM_SELECTED_TEXT': true,
	'TM_CURRENT_LINE': true,
	'TM_CURRENT_WORD': true,
	'TM_LINE_INDEX': true,
	'TM_LINE_NUMBER': true,
	'TM_FILENAME': true,
	'TM_FILENAME_BASE': true,
	'TM_DIRECTORY': true,
	'TM_FILEPATH': true,
});

export class CompositeSnippetVariableResolver implements VariableResolver {

	constructor(private readonly _delegates: VariableResolver[]) {
		//
	}

	resolve(variable: Variable): string {
		for (const delegate of this._delegates) {
			let value = delegate.resolve(variable);
			if (value !== void 0) {
				return value;
			}
		}
		return undefined;
	}
}

export class SelectionBasedVariableResolver implements VariableResolver {

	constructor(
		private readonly _model: ITextModel,
		private readonly _selection: Selection
	) {
		//
	}

	resolve(variable: Variable): string {

		const { name } = variable;

		if (name === 'SELECTION' || name === 'TM_SELECTED_TEXT') {
			let value = this._model.getValueInRange(this._selection) || undefined;
			if (value && this._selection.startLineNumber !== this._selection.endLineNumber) {
				// Selection is a multiline string which we indentation we now
				// need to adjust. We compare the indentation of this variable
				// with the indentation at the editor position and add potential
				// extra indentation to the value

				const line = this._model.getLineContent(this._selection.startLineNumber);
				const lineLeadingWhitespace = getLeadingWhitespace(line, 0, this._selection.startColumn - 1);

				let varLeadingWhitespace = lineLeadingWhitespace;
				variable.snippet.walk(marker => {
					if (marker === variable) {
						return false;
					}
					if (marker instanceof Text) {
						varLeadingWhitespace = getLeadingWhitespace(marker.value.split(/\r\n|\r|\n/).pop());
					}
					return true;
				});
				const whitespaceCommonLength = commonPrefixLength(varLeadingWhitespace, lineLeadingWhitespace);

				value = value.replace(
					/(\r\n|\r|\n)(.*)/g,
					(m, newline, rest) => `${newline}${varLeadingWhitespace.substr(whitespaceCommonLength)}${rest}`
				);
			}
			return value;

		} else if (name === 'TM_CURRENT_LINE') {
			return this._model.getLineContent(this._selection.positionLineNumber);

		} else if (name === 'TM_CURRENT_WORD') {
			const info = this._model.getWordAtPosition({
				lineNumber: this._selection.positionLineNumber,
				column: this._selection.positionColumn
			});
			return info && info.word || undefined;

		} else if (name === 'TM_LINE_INDEX') {
			return String(this._selection.positionLineNumber - 1);

		} else if (name === 'TM_LINE_NUMBER') {
			return String(this._selection.positionLineNumber);
		}
		return undefined;
	}
}

export class ModelBasedVariableResolver implements VariableResolver {

	constructor(
		private readonly _model: ITextModel
	) {
		//
	}

	resolve(variable: Variable): string {

		const { name } = variable;

		if (name === 'TM_FILENAME') {
			return basename(this._model.uri.fsPath);

		} else if (name === 'TM_FILENAME_BASE') {
			const name = basename(this._model.uri.fsPath);
			const idx = name.lastIndexOf('.');
			if (idx <= 0) {
				return name;
			} else {
				return name.slice(0, idx);
			}

		} else if (name === 'TM_DIRECTORY') {
			const dir = dirname(this._model.uri.fsPath);
			return dir !== '.' ? dir : '';

		} else if (name === 'TM_FILEPATH') {
			return this._model.uri.fsPath;
		}

		return undefined;
	}
}

export class ClipboardBasedVariableResolver implements VariableResolver {

	constructor(
		private readonly _clipboardService: IClipboardService,
		private readonly _selectionIdx: number,
		private readonly _selectionCount: number
	) {
		//
	}

	resolve(variable: Variable): string {
		if (variable.name !== 'CLIPBOARD' || !this._clipboardService) {
			return undefined;
		}

		const text = this._clipboardService.readText();
		if (!text) {
			return undefined;
		}

		const lines = text.split(/\r\n|\n|\r/).filter(s => !isFalsyOrWhitespace(s));
		if (lines.length === this._selectionCount) {
			return lines[this._selectionIdx];
		} else {
			return text;
		}
	}
}

export class TimeBasedVariableResolver implements VariableResolver {

	resolve(variable: Variable): string {
		const { name } = variable;
		const dayNames = [nls.localize('Sunday', "Sunday"), nls.localize('Monday', "Monday"), nls.localize('Tuesday', "Tuesday"), nls.localize('Wednesday', "Wednesday"), nls.localize('Thursday', "Thursday"), nls.localize('Friday', "Friday"), nls.localize('Saturday', "Saturday")];
		const dayNamesShort = [nls.localize('SundayShort', "Sun"), nls.localize('MondayShort', "Mon"), nls.localize('TuesdayShort', "Tue"), nls.localize('WednesdayShort', "Wed"), nls.localize('ThursdayShort', "Thu"), nls.localize('FridayShort', "Fri"), nls.localize('SaturdayShort', "Sat")];
		const monthNames = [nls.localize('January', "January"), nls.localize('February', "February"), nls.localize('March', "March"), nls.localize('April', "April"), nls.localize('May', "May"), nls.localize('June', "June"), nls.localize('July', "July"), nls.localize('August', "August"), nls.localize('September', "September"), nls.localize('October', "October"), nls.localize('November', "November"), nls.localize('December', "December")];
		const monthNamesShort = [nls.localize('JanuaryShort', "Jan"), nls.localize('FebruaryShort', "Feb"), nls.localize('MarchShort', "Mar"), nls.localize('AprilShort', "Apr"), nls.localize('MayShort', "May"), nls.localize('JuneShort', "Jun"), nls.localize('JulyShort', "Jul"), nls.localize('AugustShort', "Aug"), nls.localize('SeptemberShort', "Sep"), nls.localize('OctoberShort', "Oct"), nls.localize('NovemberShort', "Nov"), nls.localize('DecemberShort', "Dec")];

		if (name === 'CURRENT_YEAR') {
			return String(new Date().getFullYear());
		} else if (name === 'CURRENT_YEAR_SHORT') {
			return String(new Date().getFullYear()).slice(-2);
		} else if (name === 'CURRENT_MONTH') {
			return pad((new Date().getMonth().valueOf() + 1), 2);
		} else if (name === 'CURRENT_DATE') {
			return pad(new Date().getDate().valueOf(), 2);
		} else if (name === 'CURRENT_HOUR') {
			return pad(new Date().getHours().valueOf(), 2);
		} else if (name === 'CURRENT_MINUTE') {
			return pad(new Date().getMinutes().valueOf(), 2);
		} else if (name === 'CURRENT_SECOND') {
			return pad(new Date().getSeconds().valueOf(), 2);
		} else if (name === 'CURRENT_DAY_NAME') {
			return dayNames[new Date().getDay()];
		} else if (name === 'CURRENT_DAY_NAME_SHORT') {
			return dayNamesShort[new Date().getDay()];
		} else if (name === 'CURRENT_MONTH_NAME') {
			return monthNames[new Date().getMonth()];
		} else if (name === 'CURRENT_MONTH_NAME_SHORT') {
			return monthNamesShort[new Date().getMonth()];
		}

		return undefined;
	}
}

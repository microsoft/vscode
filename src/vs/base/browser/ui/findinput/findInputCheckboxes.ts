/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./findInputCheckboxes';

import * as nls from 'vs/nls';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';

export interface IFindInputCheckboxOpts {
	appendTitle: string;
	isChecked: boolean;
	onChange: (viaKeyboard: boolean) => void;
	onKeyDown?: (e: IKeyboardEvent) => void;
}

const NLS_CASE_SENSITIVE_CHECKBOX_LABEL = nls.localize('caseDescription', "Match Case");
const NLS_WHOLE_WORD_CHECKBOX_LABEL = nls.localize('wordsDescription', "Match Whole Word");
const NLS_REGEX_CHECKBOX_LABEL = nls.localize('regexDescription', "Use Regular Expression");

export class CaseSensitiveCheckbox extends Checkbox {
	constructor(opts: IFindInputCheckboxOpts) {
		super({
			actionClassName: 'monaco-case-sensitive',
			title: NLS_CASE_SENSITIVE_CHECKBOX_LABEL + opts.appendTitle,
			isChecked: opts.isChecked,
			onChange: opts.onChange,
			onKeyDown: opts.onKeyDown
		});
	}
}

export class WholeWordsCheckbox extends Checkbox {
	constructor(opts: IFindInputCheckboxOpts) {
		super({
			actionClassName: 'monaco-whole-word',
			title: NLS_WHOLE_WORD_CHECKBOX_LABEL + opts.appendTitle,
			isChecked: opts.isChecked,
			onChange: opts.onChange,
			onKeyDown: opts.onKeyDown
		});
	}
}

export class RegexCheckbox extends Checkbox {
	constructor(opts: IFindInputCheckboxOpts) {
		super({
			actionClassName: 'monaco-regex',
			title: NLS_REGEX_CHECKBOX_LABEL + opts.appendTitle,
			isChecked: opts.isChecked,
			onChange: opts.onChange,
			onKeyDown: opts.onKeyDown
		});
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { Toggle } from '../toggle/toggle.js';
import { Codicon } from '../../../common/codicons.js';
import * as nls from '../../../../nls.js';

export interface IFindInputToggleOpts {
	readonly appendTitle: string;
	readonly isChecked: boolean;
	readonly inputActiveOptionBorder: string | undefined;
	readonly inputActiveOptionForeground: string | undefined;
	readonly inputActiveOptionBackground: string | undefined;
	readonly hoverDelegate?: IHoverDelegate;
}

const NLS_CASE_SENSITIVE_TOGGLE_LABEL = nls.localize('caseDescription', "Match Case");
const NLS_WHOLE_WORD_TOGGLE_LABEL = nls.localize('wordsDescription', "Match Whole Word");
const NLS_REGEX_TOGGLE_LABEL = nls.localize('regexDescription', "Use Regular Expression");

export class CaseSensitiveToggle extends Toggle {
	constructor(opts: IFindInputToggleOpts) {
		super({
			icon: Codicon.caseSensitive,
			title: NLS_CASE_SENSITIVE_TOGGLE_LABEL + opts.appendTitle,
			isChecked: opts.isChecked,
			hoverDelegate: opts.hoverDelegate ?? getDefaultHoverDelegate('element'),
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground
		});
	}
}

export class WholeWordsToggle extends Toggle {
	constructor(opts: IFindInputToggleOpts) {
		super({
			icon: Codicon.wholeWord,
			title: NLS_WHOLE_WORD_TOGGLE_LABEL + opts.appendTitle,
			isChecked: opts.isChecked,
			hoverDelegate: opts.hoverDelegate ?? getDefaultHoverDelegate('element'),
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground
		});
	}
}

export class RegexToggle extends Toggle {
	constructor(opts: IFindInputToggleOpts) {
		super({
			icon: Codicon.regex,
			title: NLS_REGEX_TOGGLE_LABEL + opts.appendTitle,
			isChecked: opts.isChecked,
			hoverDelegate: opts.hoverDelegate ?? getDefaultHoverDelegate('element'),
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground
		});
	}
}

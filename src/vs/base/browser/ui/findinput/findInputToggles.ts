/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import { IKeyboardEvent } from '../../keyboardEvent.js';
import { Toggle } from '../toggle/toggle.js';
import { Codicon } from '../../../common/codicons.js';
import { KeyCode } from '../../../common/keyCodes.js';
import * as nls from '../../../../nls.js';
import { type IHoverLifecycleOptions } from '../hover/hover.js';

export interface IFindInputToggleOpts {
	readonly appendTitle: string;
	readonly isChecked: boolean;
	readonly inputActiveOptionBorder: string | undefined;
	readonly inputActiveOptionForeground: string | undefined;
	readonly inputActiveOptionBackground: string | undefined;
	readonly hoverLifecycleOptions?: IHoverLifecycleOptions;
}

/**
 * Arrow-Key support to navigate between the toggles of a find input, with
 * `Escape` moving focus back to the input box.
 *
 * The toggles are resolved through a callback because they are only needed
 * once one of the handled keys is pressed.
 */
export function navigateToggles(event: IKeyboardEvent, domNode: HTMLElement, getToggleDomNodes: () => HTMLElement[], focusInput: () => void): void {
	if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Escape)) {
		const indexes = getToggleDomNodes();
		const index = indexes.indexOf(<HTMLElement>domNode.ownerDocument.activeElement);
		if (index >= 0) {
			let newIndex: number = -1;
			if (event.equals(KeyCode.RightArrow)) {
				newIndex = (index + 1) % indexes.length;
			} else if (event.equals(KeyCode.LeftArrow)) {
				if (index === 0) {
					newIndex = indexes.length - 1;
				} else {
					newIndex = index - 1;
				}
			}

			if (event.equals(KeyCode.Escape)) {
				indexes[index].blur();
				focusInput();
			} else if (newIndex >= 0) {
				indexes[newIndex].focus();
			}

			dom.EventHelper.stop(event, true);
		}
	}
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
			hoverLifecycleOptions: opts.hoverLifecycleOptions,
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
			hoverLifecycleOptions: opts.hoverLifecycleOptions,
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
			hoverLifecycleOptions: opts.hoverLifecycleOptions,
			inputActiveOptionBorder: opts.inputActiveOptionBorder,
			inputActiveOptionForeground: opts.inputActiveOptionForeground,
			inputActiveOptionBackground: opts.inputActiveOptionBackground
		});
	}
}

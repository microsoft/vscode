/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriDto } from 'vs/base/common/uri';
import { ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Categories } from './actionCommonCategories';

export interface ILocalizedString {

	/**
	 * The localized value of the string.
	 */
	value: string;

	/**
	 * The original (non localized value of the string)
	 */
	original: string;
}

export interface ICommandActionTitle extends ILocalizedString {

	/**
	 * The title with a mnemonic designation. && precedes the mnemonic.
	 */
	mnemonicTitle?: string;
}

export type Icon = { dark?: URI; light?: URI } | ThemeIcon;

export interface ICommandActionToggleInfo {

	/**
	 * The condition that marks the action as toggled.
	 */
	condition: ContextKeyExpression;

	icon?: Icon;

	tooltip?: string;

	/**
	 * The title that goes well with a a check mark, e.g "(check) Line Numbers" vs "Toggle Line Numbers"
	 */
	title?: string;

	/**
	 * Like title but with a mnemonic designation.
	 */
	mnemonicTitle?: string;
}

export function isICommandActionToggleInfo(thing: ContextKeyExpression | ICommandActionToggleInfo | undefined): thing is ICommandActionToggleInfo {
	return thing ? (<ICommandActionToggleInfo>thing).condition !== undefined : false;
}

export interface ICommandAction {
	id: string;
	title: string | ICommandActionTitle;
	shortTitle?: string | ICommandActionTitle;
	category?: keyof typeof Categories | ILocalizedString | string;
	tooltip?: string | ILocalizedString;
	icon?: Icon;
	source?: string;
	precondition?: ContextKeyExpression;

	/**
	 * The action is a toggle action. Define the context key expression that reflects its toggle-state
	 * or define toggle-info including an icon and a title that goes well with a checkmark.
	 */
	toggled?: ContextKeyExpression | ICommandActionToggleInfo;
}

export type ISerializableCommandAction = UriDto<ICommandAction>;

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriDto } from '../../../base/common/uri.js';
import { ContextKeyExpression } from '../../contextkey/common/contextkey.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Categories } from './actionCommonCategories.js';
import { ICommandMetadata } from '../../commands/common/commands.js';

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

export function isLocalizedString(thing: unknown): thing is ILocalizedString {
	return !!thing
		&& typeof thing === 'object'
		&& typeof (thing as ILocalizedString).original === 'string'
		&& typeof (thing as ILocalizedString).value === 'string';
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

export interface ICommandActionSource {
	readonly id: string;
	readonly title: string;
}

export interface ICommandAction {
	id: string;
	title: string | ICommandActionTitle;
	shortTitle?: string | ICommandActionTitle;
	/**
	 * Metadata about this command, used for:
	 * - API commands
	 * - when showing keybindings that have no other UX
	 * - when searching for commands in the Command Palette
	 */
	metadata?: ICommandMetadata;
	category?: keyof typeof Categories | ILocalizedString | string;
	tooltip?: string | ILocalizedString;
	icon?: Icon;
	source?: ICommandActionSource;
	/**
	 * Precondition controls enablement (for example for a menu item, show
	 * it in grey or for a command, do not allow to invoke it)
	 */
	precondition?: ContextKeyExpression;

	/**
	 * The action is a toggle action. Define the context key expression that reflects its toggle-state
	 * or define toggle-info including an icon and a title that goes well with a checkmark.
	 */
	toggled?: ContextKeyExpression | ICommandActionToggleInfo;
}

export type ISerializableCommandAction = UriDto<ICommandAction>;

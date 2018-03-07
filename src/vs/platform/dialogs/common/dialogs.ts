/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IConfirmation {
	title?: string;
	type?: 'none' | 'info' | 'error' | 'question' | 'warning';
	message: string;
	detail?: string;
	primaryButton?: string;
	secondaryButton?: string;
	checkbox?: {
		label: string;
		checked?: boolean;
	};
}

export interface IConfirmationResult {

	/**
	 * Will be true if the dialog was confirmed with the primary button
	 * pressed.
	 */
	confirmed: boolean;

	/**
	 * This will only be defined if the confirmation was created
	 * with the checkox option defined.
	 */
	checkboxChecked?: boolean;
}

export const IDialogService = createDecorator<IDialogService>('dialogService');

export interface IDialogService {

	_serviceBrand: any;

	/**
	 * Ask the user for confirmation with a modal dialog.
	 */
	confirm(confirmation: IConfirmation): TPromise<IConfirmationResult>;

	/**
	 * Present a modal dialog to the user.
	 *
	 * @returns A promise with the selected choice index. If the user refused to choose,
	 * then a promise with index of `cancelId` option is returned. If there is no such
	 * option then promise with index `0` is returned.
	 */
	show(severity: Severity, message: string, buttons: string[], cancelId?: number): TPromise<number>;
}

export const IChoiceService = createDecorator<IChoiceService>('choiceService');

/**
 * The choices to present to the user. The `ISecondaryChoice` hint allows to control where
 * choices appear when the `modal` option is set to `false`. In that case, the choices
 * are presented as part of a notification and secondary choices will appear less
 * prominent.
 */
export interface SecondaryChoice {
	label: string;
	keepOpen?: boolean;
}
export type PrimaryChoice = string;
export type Choice = PrimaryChoice | SecondaryChoice;

export interface IChoiceService {

	_serviceBrand: any;

	/**
	 * Prompt the user for a choice between multiple choices.
	 *
	 * @param choices the choices to present to the user. The `isSecondary` hint allows
	 * to control where are presented as part of a notification and secondary choices will
	 * appear less choices appear when the `modal` option is set to `false`. In that case,
	 * the choices prominent.
	 *
	 * @returns A promise with the selected choice index. The promise is cancellable
	 * which hides the message. The promise can return an error, meaning that
	 * the user refused to choose.
	 */
	choose(severity: Severity, message: string, choices: Choice[]): TPromise<number>;
}
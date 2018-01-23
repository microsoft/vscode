/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import { TPromise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Action } from 'vs/base/common/actions';

export interface IMessageWithAction {
	message: string;
	actions: Action[];
	source?: string;
}

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

export const CloseAction = new Action('close.message', nls.localize('close', "Close"), null, true, () => TPromise.as(true));
export const LaterAction = new Action('later.message', nls.localize('later', "Later"), null, true, () => TPromise.as(true));
export const CancelAction = new Action('cancel.message', nls.localize('cancel', "Cancel"), null, true, () => TPromise.as(true));

export const IMessageService = createDecorator<IMessageService>('messageService');

const MAX_CONFIRM_FILES = 10;
export function getConfirmMessage(start: string, resourcesToConfirm: uri[]): string {
	const message = [start];
	message.push('');
	message.push(...resourcesToConfirm.slice(0, MAX_CONFIRM_FILES).map(r => paths.basename(r.fsPath)));

	if (resourcesToConfirm.length > MAX_CONFIRM_FILES) {
		if (resourcesToConfirm.length - MAX_CONFIRM_FILES === 1) {
			message.push(nls.localize('moreFile', "...1 additional file not shown"));
		} else {
			message.push(nls.localize('moreFiles', "...{0} additional files not shown", resourcesToConfirm.length - MAX_CONFIRM_FILES));
		}
	}

	message.push('');
	return message.join('\n');
}

export interface IConfirmationResult {
	confirmed: boolean;
	checkboxChecked?: boolean;
}

export interface IMessageService {

	_serviceBrand: any;

	/**
	 * Tells the service to show a message with a given severity
	 * the returned function can be used to hide the message again
	 */
	show(sev: Severity, message: string): () => void;
	show(sev: Severity, message: Error): () => void;
	show(sev: Severity, message: string[]): () => void;
	show(sev: Severity, message: Error[]): () => void;
	show(sev: Severity, message: IMessageWithAction): () => void;

	/**
	 * Hide any messages showing currently.
	 */
	hideAll(): void;

	/**
	 * Ask the user for confirmation.
	 */
	confirm(confirmation: IConfirmation): TPromise<boolean>;

	/**
	 * Ask the user for confirmation with a checkbox.
	 */
	confirmWithCheckbox(confirmation: IConfirmation): TPromise<IConfirmationResult>;
}

export const IChoiceService = createDecorator<IChoiceService>('choiceService');

export interface IChoiceService {

	_serviceBrand: any;

	/**
	 * Prompt the user for a choice between multiple options.
	 *
	 * @param when `modal` is true, this will block the user until chooses.
	 *
	 * @returns A promise with the selected choice index. The promise is cancellable
	 * which hides the message. The promise can return an error, meaning that
	 * the user refused to choose.
	 *
	 * When `modal` is true and user refused to choose, then promise with index of
	 * `Cancel` option is returned. If there is no such option then promise with
	 * `0` index is returned.
	 */
	choose(severity: Severity, message: string, options: string[], cancelId: number, modal?: boolean): TPromise<number>;
}

export import Severity = Severity;

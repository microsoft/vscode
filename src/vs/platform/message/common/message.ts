/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
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
}

export const CloseAction = new Action('close.message', nls.localize('close', "Close"), null, true, () => TPromise.as(true));
export const LaterAction = new Action('later.message', nls.localize('later', "Later"), null, true, () => TPromise.as(true));
export const CancelAction = new Action('cancel.message', nls.localize('cancel', "Cancel"), null, true, () => TPromise.as(true));

export const IMessageService = createDecorator<IMessageService>('messageService');

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
	confirm(confirmation: IConfirmation): boolean;
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

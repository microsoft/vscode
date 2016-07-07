/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {Action} from 'vs/base/common/actions';

export interface IMessageWithAction {
	message: string;
	actions: Action[];
}

export interface IConfirmation {
	title?: string;
	message: string;
	detail?: string;
	primaryButton?: string;
	secondaryButton?: string;
}

export const CloseAction = new Action('close.message', nls.localize('close', "Close"), null, true, () => TPromise.as(true));
export const CancelAction = new Action('close.message', nls.localize('cancel', "Cancel"), null, true, () => TPromise.as(true));

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

export import Severity = Severity;
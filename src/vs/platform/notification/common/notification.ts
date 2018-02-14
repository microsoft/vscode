/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IAction } from 'vs/base/common/actions';

export const INotificationService = createDecorator<INotificationService>('notificationService');

export interface INotification {
	severity: Severity;
	message: string | IMarkdownString | Error;
	source?: string;
	actions?: IAction[];
}

export interface INotificationHandle extends IDisposable {
}

export interface INotificationService {

	_serviceBrand: any;

	notify(notification: INotification): INotificationHandle;

	notifyError(error: Error): INotificationHandle;
}
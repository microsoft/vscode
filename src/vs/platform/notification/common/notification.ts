/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';

export const INotificationService = createDecorator<INotificationService>('notificationService');

export interface INotification extends IDisposable {

}

export interface INotificationService {

	_serviceBrand: any;

	notify(sev: Severity, message: string): INotification;

	// notify(sev: Severity, message: Error): () => void;
	// notify(sev: Severity, message: string[]): () => void;
	// notify(sev: Severity, message: Error[]): () => void;
	// notify(sev: Severity, message: IMessageWithAction): () => void;
}
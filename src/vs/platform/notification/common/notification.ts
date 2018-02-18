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
	actions?: INotificationActions;
}

export interface INotificationActions {
	primary?: IAction[];
	secondary?: IAction[];
}

export interface INotificationProgress {
	infinite(): void;
	total(value: number): void;
	worked(value: number): void;
	done(): void;
}

export interface INotificationHandle extends IDisposable {
	readonly progress: INotificationProgress;

	updateSeverity(severity: Severity): void;
	updateMessage(message: string | IMarkdownString | Error): void;
	updateActions(actions?: INotificationActions): void;
}

export interface INotificationService {

	_serviceBrand: any;

	notify(notification: INotification): INotificationHandle;

	info(message: string): INotificationHandle;
	warn(message: string): INotificationHandle;
	error(error: string | Error): INotificationHandle;
}

export class NoOpNotification implements INotificationHandle {
	readonly progress = new NoOpProgress();

	updateSeverity(severity: Severity): void { }
	updateMessage(message: string | IMarkdownString | Error): void { }
	updateActions(actions?: INotificationActions): void { }

	dispose(): void { }
}

export class NoOpProgress implements INotificationProgress {
	infinite(): void { }
	done(): void { }
	total(value: number): void { }
	worked(value: number): void { }
}
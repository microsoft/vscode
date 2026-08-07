/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';

export interface MessageOptions {
	modal?: boolean;
	detail?: string;
}

export interface ProgressOptions {
	location: ProgressLocation | {
		viewId: string;
	};
	title?: string;
	cancellable?: boolean;
}

export enum ProgressLocation {
	SourceControl = 1,
	Window = 10,
	Notification = 15
}

export interface Progress<T> {
	report(value: T): void;
}

export interface INotificationService {
	readonly _serviceBrand: undefined;

	showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
	showInformationMessage<T extends string>(message: string, options: MessageOptions, ...items: T[]): Promise<T | undefined>;
	showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
	showQuotaExceededDialog(options: { isNoAuthUser: boolean }): Promise<unknown>;
	withProgress<R>(options: ProgressOptions, task: (progress: Progress<{
		message?: string;
		increment?: number;
	}>, token: CancellationToken) => Thenable<R>): Promise<R>;
}

export class NullNotificationService implements INotificationService {
	declare readonly _serviceBrand: undefined;

	showInformationMessage<T extends string>(message: string, options: MessageOptions, ...items: T[]): Promise<T | undefined>;
	showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
	showInformationMessage<T extends string>(message: string, options: MessageOptions, ...items: T[]): Promise<T | undefined>;
	showInformationMessage(message: string, optionsOrItem?: any, ...items: any[]): Promise<any> {
		return Promise.resolve(undefined);
	}

	showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	showQuotaExceededDialog(options: { isNoAuthUser: boolean }): Promise<unknown> {
		return Promise.resolve();
	}

	withProgress<R>(options: ProgressOptions, task: (progress: Progress<{
		message?: string;
		increment?: number;
	}>, token: CancellationToken) => Thenable<R>): Promise<R> {
		return Promise.resolve(task({ report: () => { } }, CancellationToken.None));
	}
}

export const INotificationService = createServiceIdentifier<INotificationService>('INotificationService');

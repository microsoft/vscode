/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, MessageOptions, Progress, ProgressOptions, window } from 'vscode';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { INotificationService } from '../common/notificationService';

export class NotificationService implements INotificationService {

	declare readonly _serviceBrand: undefined;

	async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
	async showInformationMessage<T extends string>(message: string, options: MessageOptions, ...items: T[]): Promise<T | undefined>;
	async showInformationMessage(message: string, optionsOrItem?: any, ...items: any[]): Promise<any> {
		if (typeof optionsOrItem === 'object' && optionsOrItem !== null && !Array.isArray(optionsOrItem)) {
			return window.showInformationMessage(message, optionsOrItem, ...items);
		}
		return window.showInformationMessage(message, optionsOrItem, ...items);
	}

	async withProgress<R>(options: ProgressOptions, task: (progress: Progress<{
		message?: string;
		increment?: number;
	}>, token: CancellationToken) => Thenable<R>): Promise<R> {
		return window.withProgress(options, task);
	}

	async showWarningMessage(message: string, ...items: string[]) {
		return window.showWarningMessage(message, ...items);
	}

	async showQuotaExceededDialog(options: { isNoAuthUser: boolean }): Promise<unknown> {
		return commands.executeCommand(options.isNoAuthUser ? 'workbench.action.chat.triggerSetup' : 'workbench.action.chat.openQuotaExceededDialog');
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, MessageOptions, Progress, ProgressOptions, window } from 'vscode';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { localize } from '../../../util/vs/nls';
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

	async showByokModelError(options: { errorType: 'quotaExceeded' | 'rateLimited' | 'failed'; reason?: string; providerName?: string }): Promise<unknown> {
		const provider = options.providerName ?? 'language model';
		const messages = {
			quotaExceeded: localize('byok.quotaExceeded', "Your {0} API quota has been exceeded. Please check your API key configuration.", provider),
			rateLimited: localize('byok.rateLimited', "Your {0} API rate limit has been reached. Please try again later.", provider),
			failed: localize('byok.failed', "Failed to generate a response from your {0} API: {1}.", provider, options.reason ?? 'Unknown error')
		};
		return window.showWarningMessage(messages[options.errorType]);
	}
}

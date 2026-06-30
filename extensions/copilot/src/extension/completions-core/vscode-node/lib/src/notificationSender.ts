/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { INotificationService } from '../../../../../platform/notification/common/notificationService';
import { createServiceIdentifier } from '../../../../../util/common/services';

export interface ActionItem {
	title: string;
	[key: string]: string | boolean | object;
}

export const ICompletionsNotificationSender = createServiceIdentifier<ICompletionsNotificationSender>('ICompletionsNotificationSender');
export interface ICompletionsNotificationSender {
	readonly _serviceBrand: undefined;

	showWarningMessage(message: string, ...actions: ActionItem[]): Promise<ActionItem | undefined>;
}

export class ExtensionNotificationSender implements ICompletionsNotificationSender {
	declare _serviceBrand: undefined;

	constructor(@INotificationService private readonly notificationService: INotificationService) {
	}

	async showWarningMessage(message: string, ...actions: ActionItem[]): Promise<ActionItem | undefined> {
		const response = await this.notificationService.showWarningMessage(message, ...actions.map(action => action.title));
		if (response === undefined) { return; }
		return { title: response };
	}
}

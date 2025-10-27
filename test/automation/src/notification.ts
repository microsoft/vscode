/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';

const NOTIFICATION_TOAST = '.notification-toast';

export class Notification {

	constructor(private code: Code) { }

	async isNotificationVisible(): Promise<boolean> {
		try {
			await this.code.waitForElement(NOTIFICATION_TOAST, undefined, 1);
			return true;
		} catch {
			return false;
		}
	}
}

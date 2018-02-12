/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Severity } from 'vs/platform/message/common/message';

export class NotificationList {

	constructor(
		private container: HTMLElement
	) {
	}

	public show(severity: Severity, notification: string): void {
		console.log(this.container);
	}
}
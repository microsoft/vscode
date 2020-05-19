/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWebviewMainService } from 'vs/platform/webview/common/webviewMainService';

export class WebviewChannel implements IServerChannel {

	constructor(
		@IWebviewMainService private readonly webviewMainService: IWebviewMainService,
	) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'setIgnoreMenuShortcuts': this.webviewMainService.setIgnoreMenuShortcuts(arg[0], arg[1]); return;
		}

		throw new Error(`Call not found: ${command}`);
	}
}

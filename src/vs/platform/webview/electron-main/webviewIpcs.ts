/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWebviewManagerService } from 'vs/platform/webview/common/webviewManagerService';

type KeyWithParams<T> = {
	[K in keyof T]: T[K] extends (...args: infer P) => any ? [K, P] : never
}[keyof T];

export class WebviewChannel implements IServerChannel {

	constructor(
		@IWebviewManagerService private readonly webviewMainService: IWebviewManagerService,
	) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, ...commandAndArgs: KeyWithParams<IWebviewManagerService>): Promise<any> {
		switch (commandAndArgs[0]) {
			case 'setIgnoreMenuShortcuts': this.webviewMainService.setIgnoreMenuShortcuts(...commandAndArgs[1]); return;
			case 'registerWebview': this.webviewMainService.registerWebview(...commandAndArgs[1]); return;
			case 'unregisterWebview': this.webviewMainService.unregisterWebview(...commandAndArgs[1]); return;
			case 'updateLocalResourceRoots': this.webviewMainService.updateLocalResourceRoots(...commandAndArgs[1]); return;
		}

		throw new Error(`Call not found: ${commandAndArgs[0]}`);
	}
}

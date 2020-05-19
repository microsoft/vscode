/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { webContents } from 'electron';

export class WebviewChannel implements IServerChannel {

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'setIgnoreMenuShortcuts': this.setIgnoreMenuShortcuts(arg[0], arg[1]); return;
		}

		throw new Error(`Call not found: ${command}`);
	}

	private setIgnoreMenuShortcuts(webContentsId: number, enabled: boolean) {
		const contents = webContents.fromId(webContentsId);
		if (!contents) {
			throw new Error(`Invalid webContentsId: ${webContentsId}`);
		}
		if (!contents.isDestroyed()) {
			contents.setIgnoreMenuShortcuts(enabled);
		}
	}
}

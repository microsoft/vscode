/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';

export class TestSharedProcessService implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	getChannel(channelName: string): any { return undefined; }

	registerChannel(channelName: string, channel: any): void { }

	notifyRestored(): void { }
}

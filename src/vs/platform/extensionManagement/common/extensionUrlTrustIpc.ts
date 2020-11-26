/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IExtensionUrlTrustService } from 'vs/platform/extensionManagement/common/extensionUrlTrust';

export class ExtensionUrlTrustChannel implements IServerChannel {

	constructor(private service: IExtensionUrlTrustService) { }

	listen(): Event<any> {
		throw new Error('No events supported');
	}

	call(_: any, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'isExtensionUrlTrusted': return this.service.isExtensionUrlTrusted(arg[0], arg[1]);
		}

		throw new Error('Invalid call');
	}
}

export class ExtensionUrlTrustChannelClient implements IExtensionUrlTrustService {

	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	isExtensionUrlTrusted(extensionId: string, url: string): Promise<boolean> {
		return this.channel.call('isExtensionUrlTrusted', [extensionId, url]);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the AGPL v3 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IOAuthMainService, IOAuthResult } from './oauth.js';

export class OAuthChannel implements IServerChannel {

	constructor(private service: IOAuthMainService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidCompleteOAuth': return this.service.onDidCompleteOAuth;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'startOAuthFlow': return this.service.startOAuthFlow(arg);
			case 'stopOAuthFlow': return this.service.stopOAuthFlow();
		}
		throw new Error(`Call not found: ${command}`);
	}
}

export class OAuthChannelClient {

	constructor(private channel: IChannel) { }

	get onDidCompleteOAuth(): Event<IOAuthResult> {
		return this.channel.listen('onDidCompleteOAuth');
	}

	startOAuthFlow(authUrl: string): Promise<void> {
		return this.channel.call('startOAuthFlow', authUrl);
	}

	stopOAuthFlow(): Promise<void> {
		return this.channel.call('stopOAuthFlow');
	}
}

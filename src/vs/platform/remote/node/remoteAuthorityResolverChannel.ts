/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, buffer } from 'vs/base/common/event';
import { ResolvedAuthority, IResolvingProgressEvent, IRemoteAuthorityResolverService, IRemoteAuthorityResolver } from 'vs/platform/remote/common/remoteAuthorityResolver';

export class RemoteAuthorityResolverChannel implements IServerChannel {

	onResolvingProgress: Event<IResolvingProgressEvent>;

	constructor(private service: IRemoteAuthorityResolverService) {
		this.onResolvingProgress = buffer(service.onResolvingProgress, true);
	}

	listen(_, event: string): Event<any> {
		switch (event) {
			case 'onResolvingProgress': return this.onResolvingProgress;
		}

		throw new Error('Invalid listen');
	}

	call(_, command: string, args?: any): Thenable<any> {
		switch (command) {
			case 'resolveAuthority': return this.service.resolveAuthority(args[0]);
			case 'getRemoteAuthorityResolver': return this.service.getRemoteAuthorityResolver(args[0]);
		}

		throw new Error('Invalid call');
	}
}

export class RemoteAuthorityResolverChannelClient implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	private _resolveAuthorityCache: { [authority: string]: Thenable<ResolvedAuthority>; };
	get onResolvingProgress(): Event<IResolvingProgressEvent> { return buffer(this.channel.listen('onResolvingProgress'), true); }

	constructor(private channel: IChannel) {
		this._resolveAuthorityCache = Object.create(null);
	}

	resolveAuthority(authority: string): Thenable<ResolvedAuthority> {
		if (!this._resolveAuthorityCache[authority]) {
			this._resolveAuthorityCache[authority] = this._resolveAuthority(authority);
		}
		return this._resolveAuthorityCache[authority];
	}

	getRemoteAuthorityResolver(authority: string): Thenable<IRemoteAuthorityResolver | null> {
		return this.channel.call('getRemoteAuthorityResolver', [authority]);
	}

	private _resolveAuthority(authority: string): Thenable<ResolvedAuthority> {
		if (authority.indexOf('+') >= 0) {
			return this.channel.call('resolveAuthority', [authority]);
		} else {
			const [host, strPort] = authority.split(':');
			const port = parseInt(strPort, 10);
			return Promise.resolve({ authority, host, port });
		}
	}

}

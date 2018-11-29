/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, buffer } from 'vs/base/common/event';
import { ResolvedAuthority, IResolvingProgressEvent, IRemoteAuthorityResolverService, IRemoteAuthorityResolver } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ipcRenderer as ipc } from 'electron';

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
			this._resolveAuthorityCache[authority].then((r) => {
				ipc.send('vscode:remoteAuthorityResolved', {
					authority: authority,
					host: r.host,
					port: r.port
				});
			});
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

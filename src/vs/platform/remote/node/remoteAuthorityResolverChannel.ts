/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, buffer } from 'vs/base/common/event';
import { ResolvedAuthority, IResolvingProgressEvent, IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { CancellationToken } from 'vs/base/common/cancellation';
import { TPromise } from 'vs/base/common/winjs.base';

export interface IRemoteAuthorityResolverChannel extends IChannel {
	listen(event: 'onResolvingProgress'): Event<IResolvingProgressEvent>;
	listen(event: string, arg?: any): Event<any>;

	call(command: 'resolveAuthority', args: [string]): Thenable<ResolvedAuthority>;
	call(command: 'getLabel', args: [string]): Thenable<string | null>;
	call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Thenable<T>;
}

export class RemoteAuthorityResolverChannel implements IRemoteAuthorityResolverChannel {

	onResolvingProgress: Event<IResolvingProgressEvent>;

	constructor(private service: IRemoteAuthorityResolverService) {
		this.onResolvingProgress = buffer(service.onResolvingProgress, true);
	}

	listen(event: string): Event<any> {
		switch (event) {
			case 'onResolvingProgress': return this.onResolvingProgress;
		}

		throw new Error('Invalid listen');
	}

	call(command: string, args?: any): Thenable<any> {
		switch (command) {
			case 'resolveAuthority': return this.service.resolveAuthority(args[0]);
			case 'getLabel': return this.service.getLabel(args[0]);
		}

		throw new Error('Invalid call');
	}
}

export class RemoteAuthorityResolverChannelClient implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	private _resolveAuthorityCache: { [authority: string]: Thenable<ResolvedAuthority>; };
	get onResolvingProgress(): Event<IResolvingProgressEvent> { return buffer(this.channel.listen('onResolvingProgress'), true); }

	constructor(private channel: IRemoteAuthorityResolverChannel) {
		this._resolveAuthorityCache = Object.create(null);
	}

	resolveAuthority(authority: string): Thenable<ResolvedAuthority> {
		if (!this._resolveAuthorityCache[authority]) {
			this._resolveAuthorityCache[authority] = this._resolveAuthority(authority);
		}
		return this._resolveAuthorityCache[authority];
	}

	getLabel(authority: string): Thenable<string | null> {
		return this.channel.call('getLabel', [authority]);
	}

	private _resolveAuthority(authority: string): Thenable<ResolvedAuthority> {
		if (authority.indexOf('+') >= 0) {
			return this.channel.call('resolveAuthority', [authority]);
		} else {
			const [host, strPort] = authority.split(':');
			const port = parseInt(strPort, 10);
			return TPromise.as({ authority, host, port });
		}
	}

}

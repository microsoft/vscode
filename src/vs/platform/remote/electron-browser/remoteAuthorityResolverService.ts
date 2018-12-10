/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedAuthority, IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ipcRenderer as ipc } from 'electron';

class PendingResolveAuthorityRequest {
	constructor(
		public readonly resolve: (value: ResolvedAuthority) => void,
		public readonly reject: (err: any) => void,
		public readonly promise: Promise<ResolvedAuthority>,
	) {
	}
}

export class RemoteAuthorityResolverService implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	private _pendingResolveAuthorityRequests: { [authority: string]: PendingResolveAuthorityRequest; };
	private _resolvedAuthorities: { [authority: string]: ResolvedAuthority; };

	constructor() {
		this._pendingResolveAuthorityRequests = Object.create(null);
		this._resolvedAuthorities = Object.create(null);
	}

	resolveAuthority(authority: string): Thenable<ResolvedAuthority> {
		if (this._resolvedAuthorities[authority]) {
			return Promise.resolve(this._resolvedAuthorities[authority]);
		}
		if (!this._pendingResolveAuthorityRequests[authority]) {
			let resolve: (value: ResolvedAuthority) => void;
			let reject: (err: any) => void;
			let promise = new Promise<ResolvedAuthority>((_resolve, _reject) => {
				resolve = _resolve;
				reject = _reject;
			});
			this._pendingResolveAuthorityRequests[authority] = new PendingResolveAuthorityRequest(resolve!, reject!, promise);
		}
		return this._pendingResolveAuthorityRequests[authority].promise;
	}

	setResolvedAuthority(resolvedAuthority: ResolvedAuthority) {
		this._resolvedAuthorities[resolvedAuthority.authority] = resolvedAuthority;
		if (this._pendingResolveAuthorityRequests[resolvedAuthority.authority]) {
			let request = this._pendingResolveAuthorityRequests[resolvedAuthority.authority];
			delete this._pendingResolveAuthorityRequests[resolvedAuthority.authority];
			ipc.send('vscode:remoteAuthorityResolved', resolvedAuthority);
			request.resolve(resolvedAuthority);
		}
	}
}

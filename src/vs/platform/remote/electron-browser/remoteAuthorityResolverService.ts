/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedAuthority, IRemoteAuthorityResolverService, ResolverResult, ResolvedOptions } from 'vs/platform/remote/common/remoteAuthorityResolver';
import * as errors from 'vs/base/common/errors';
import { RemoteAuthorities } from 'vs/base/common/network';

class PendingResolveAuthorityRequest {
	constructor(
		public readonly resolve: (value: ResolverResult) => void,
		public readonly reject: (err: any) => void,
		public readonly promise: Promise<ResolverResult>,
	) {
	}
}

export class RemoteAuthorityResolverService implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	private _resolveAuthorityRequests: { [authority: string]: PendingResolveAuthorityRequest; };

	constructor() {
		this._resolveAuthorityRequests = Object.create(null);
	}

	resolveAuthority(authority: string): Promise<ResolverResult> {
		if (!this._resolveAuthorityRequests[authority]) {
			let resolve: (value: ResolverResult) => void;
			let reject: (err: any) => void;
			let promise = new Promise<ResolverResult>((_resolve, _reject) => {
				resolve = _resolve;
				reject = _reject;
			});
			this._resolveAuthorityRequests[authority] = new PendingResolveAuthorityRequest(resolve!, reject!, promise);
		}
		return this._resolveAuthorityRequests[authority].promise;
	}

	clearResolvedAuthority(authority: string): void {
		if (this._resolveAuthorityRequests[authority]) {
			this._resolveAuthorityRequests[authority].reject(errors.canceled());
			delete this._resolveAuthorityRequests[authority];
		}
	}

	setResolvedAuthority(resolvedAuthority: ResolvedAuthority, options?: ResolvedOptions) {
		if (this._resolveAuthorityRequests[resolvedAuthority.authority]) {
			let request = this._resolveAuthorityRequests[resolvedAuthority.authority];
			RemoteAuthorities.set(resolvedAuthority.authority, resolvedAuthority.host, resolvedAuthority.port);
			request.resolve({ authority: resolvedAuthority, options });
		}
	}

	setResolvedAuthorityError(authority: string, err: any): void {
		if (this._resolveAuthorityRequests[authority]) {
			let request = this._resolveAuthorityRequests[authority];
			request.reject(err);
		}
	}
}

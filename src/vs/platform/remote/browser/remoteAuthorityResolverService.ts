/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedAuthority, IRemoteAuthorityResolverService, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { RemoteAuthorities } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';

export class RemoteAuthorityResolverService implements IRemoteAuthorityResolverService {

	declare readonly _serviceBrand: undefined;
	private readonly _cache: Map<string, ResolverResult>;

	constructor(
		resourceUriProvider: ((uri: URI) => URI) | undefined
	) {
		this._cache = new Map<string, ResolverResult>();
		if (resourceUriProvider) {
			RemoteAuthorities.setDelegate(resourceUriProvider);
		}
	}

	async resolveAuthority(authority: string): Promise<ResolverResult> {
		if (!this._cache.has(authority)) {
			const result = this._doResolveAuthority(authority);
			RemoteAuthorities.set(authority, result.authority.host, result.authority.port);
			this._cache.set(authority, result);
		}
		return this._cache.get(authority)!;
	}

	private _doResolveAuthority(authority: string): ResolverResult {
		if (authority.indexOf(':') >= 0) {
			const pieces = authority.split(':');
			return { authority: { authority, host: pieces[0], port: parseInt(pieces[1], 10) } };
		}
		return { authority: { authority, host: authority, port: 80 } };
	}

	clearResolvedAuthority(authority: string): void {
	}

	setResolvedAuthority(resolvedAuthority: ResolvedAuthority) {
	}

	setResolvedAuthorityError(authority: string, err: any): void {
	}
}

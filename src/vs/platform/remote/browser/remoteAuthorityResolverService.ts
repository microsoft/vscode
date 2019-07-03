/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedAuthority, IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';

export class RemoteAuthorityResolverService implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	constructor() {
	}

	resolveAuthority(authority: string): Promise<ResolvedAuthority> {
		if (authority.indexOf(':') >= 0) {
			const pieces = authority.split(':');
			return Promise.resolve({ authority, host: pieces[0], port: parseInt(pieces[1], 10) });
		}
		return Promise.resolve({ authority, host: authority, port: 80 });
	}

	clearResolvedAuthority(authority: string): void {
	}

	setResolvedAuthority(resolvedAuthority: ResolvedAuthority) {
	}

	setResolvedAuthorityError(authority: string, err: any): void {
	}
}

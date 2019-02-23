/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAuthorityResolverService, ResolvedAuthority } from 'vs/platform/remote/common/remoteAuthorityResolver';

export class SimpleRemoteAuthorityResolverService implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	resolveAuthority(authority: string): Promise<ResolvedAuthority> {
		return Promise.resolve(undefined);
	}

	setResolvedAuthority(resolvedAuthority: ResolvedAuthority): void { }

	setResolvedAuthorityError(authority: string, err: any): void { }
}
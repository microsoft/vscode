/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

export const REMOTE_HOST_SCHEME = Schemas.vscodeRemote;

export function getRemoteAuthority(uri: URI): string | undefined {
	return uri.scheme === REMOTE_HOST_SCHEME ? uri.authority : undefined;
}

export function getRemoteName(authority: string | undefined): string | undefined {
	if (!authority) {
		return undefined;
	}
	const pos = authority.indexOf('+');
	if (pos < 0) {
		// funky? bad authority?
		return authority;
	}
	return authority.substr(0, pos);
}
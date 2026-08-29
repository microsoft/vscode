/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';

export function isFileResourceRead(method: string, params: unknown): boolean {
	if (method !== 'resourceRead' || !hasUriParam(params)) {
		return false;
	}
	const uri = params.uri;
	if (typeof uri !== 'string') {
		return false;
	}
	try {
		return URI.parse(uri).scheme === Schemas.file;
	} catch {
		return false;
	}
}

function hasUriParam(params: unknown): params is { readonly uri: unknown } {
	return typeof params === 'object' && params !== null && hasKey(params, { uri: true });
}

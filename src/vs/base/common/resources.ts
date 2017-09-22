/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'vs/base/common/paths';
import uri from 'vs/base/common/uri';

export function basenameOrAuthority(resource: uri): string {
	return paths.basename(resource.fsPath) || resource.authority;
}

export function isEqualOrParent(first: uri, second: uri, ignoreCase?: boolean): boolean {
	if (first.scheme === second.scheme && first.authority === second.authority) {
		return paths.isEqualOrParent(first.fsPath, second.fsPath, ignoreCase);
	}

	return false;
}

export function dirname(resource: uri): uri {
	return resource.with({
		path: paths.dirname(resource.path)
	});
}

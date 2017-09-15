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

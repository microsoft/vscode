/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUNC } from '../../../base/common/extpath.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';

export function isWebviewResourceAllowed(resource: URI, roots: readonly URI[], uriIdentityService: IUriIdentityService): boolean {
	const resourceWithoutQuery = resource.with({ query: '' });
	for (const root of roots) {
		if (uriIdentityService.extUri.isEqual(root, resourceWithoutQuery, true)) {
			continue;
		}

		// Compare UNC paths case-insensitively.
		if (root.scheme === Schemas.file && isUNC(root.fsPath)) {
			if (resourceWithoutQuery.scheme === Schemas.file && isUNC(resourceWithoutQuery.fsPath)
				&& uriIdentityService.extUri.isEqualOrParent(
					resourceWithoutQuery.with({ path: resourceWithoutQuery.path.toLowerCase(), authority: resourceWithoutQuery.authority.toLowerCase() }),
					root.with({ path: root.path.toLowerCase(), authority: root.authority.toLowerCase() }),
					true,
				)) {
				return true;
			}
		} else if (uriIdentityService.extUri.isEqualOrParent(resourceWithoutQuery, root, true)) {
			return true;
		}
	}
	return false;
}

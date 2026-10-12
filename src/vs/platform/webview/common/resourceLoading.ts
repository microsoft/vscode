/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUNC } from '../../../base/common/extpath.js';
import { Schemas } from '../../../base/common/network.js';
import { isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';

export function isWebviewResourceAllowed(resource: URI, roots: readonly URI[], uriIdentityService: IUriIdentityService): boolean {
	const resourceWithoutQuery = resource.with({ query: '' });
	if (hasWindowsParentTraversalSegment(resourceWithoutQuery)) {
		return false;
	}
	return roots.some(root => containsResource(root, resourceWithoutQuery, uriIdentityService));
}

function containsResource(root: URI, resource: URI, uriIdentityService: IUriIdentityService): boolean {
	// Normalize backslashes for non-file schemes that may target Windows remotes.
	if (root.scheme !== Schemas.file) {
		const normalizedPath = resource.path.replace(/\\/g, '/');
		if (normalizedPath !== resource.path) {
			resource = resource.with({ path: normalizedPath });
		}
	}

	if (uriIdentityService.extUri.isEqual(root, resource, /* ignoreFragment */ true)) {
		return false;
	}

	// Compare unc paths case-insensitively
	if (root.scheme === Schemas.file && isUNC(root.fsPath)) {
		if (resource.scheme === Schemas.file && isUNC(resource.fsPath)) {
			return uriIdentityService.extUri.isEqualOrParent(
				resource.with({
					path: resource.path.toLowerCase(),
					authority: resource.authority.toLowerCase()
				}),
				root.with({
					path: root.path.toLowerCase(),
					authority: root.authority.toLowerCase()
				}),
				/* ignoreFragment */ true
			);
		}
		return false;
	}

	return uriIdentityService.extUri.isEqualOrParent(resource, root, /* ignoreFragment */ true);
}

const WINDOWS_PARENT_TRAVERSAL_SEGMENT = /(?:^|[\\/])\.\. +(?=$|[\\/])/;

function hasWindowsParentTraversalSegment(resource: URI): boolean {
	return isWindows
		&& resource.scheme === Schemas.file
		&& WINDOWS_PARENT_TRAVERSAL_SEGMENT.test(resource.path);
}

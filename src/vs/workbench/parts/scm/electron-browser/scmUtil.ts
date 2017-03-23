/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';

export function isSCMResource(element: ISCMResourceGroup | ISCMResource): element is ISCMResource {
	return !!(element as ISCMResource).uri;
}

export function getSCMResourceURI(providerId: string, resource: ISCMResourceGroup | ISCMResource): URI {
	if (isSCMResource(resource)) {
		return URI.from({
			scheme: 'scm',
			authority: providerId,
			path: `/${resource.resourceGroupId}/${JSON.stringify(resource.uri)}`
		});
	} else {
		return URI.from({
			scheme: 'scm',
			authority: providerId,
			path: `/${resource.id}`
		});
	}
}

export function getSCMResourceGroupId(resource: ISCMResourceGroup | ISCMResource): string {
	return isSCMResource(resource) ? resource.resourceGroupId : resource.id;
}
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';

export function isSCMResource(element: ISCMResourceGroup | ISCMResource): element is ISCMResource {
	return !!(element as ISCMResource).sourceUri;
}

export function getSCMResourceContextKey(resource: ISCMResourceGroup | ISCMResource): string {
	return isSCMResource(resource) ? resource.resourceGroup.id : resource.id;
}
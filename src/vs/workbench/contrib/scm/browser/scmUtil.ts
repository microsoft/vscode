/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISCMResource, ISCMRepository, ISCMResourceGroup } from 'vs/workbench/contrib/scm/common/scm';

export function isSCMRepository(element: ISCMRepository | ISCMResourceGroup | ISCMResource): element is ISCMRepository {
	return !!(element as ISCMRepository).provider && typeof (element as ISCMRepository).setSelected === 'function';
}

export function isSCMResourceGroup(element: ISCMRepository | ISCMResourceGroup | ISCMResource): element is ISCMRepository {
	return !!(element as ISCMResourceGroup).provider && !!(element as ISCMResourceGroup).elements;
}

export function isSCMResource(element: ISCMRepository | ISCMResourceGroup | ISCMResource): element is ISCMResource {
	return !!(element as ISCMResource).sourceUri;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

export const ADDITIONAL_FOLDER_CONTEXT_ID_PREFIX = 'sessions-additional-folder:';
export const ADDITIONAL_REPOSITORY_CONTEXT_ID_PREFIX = 'sessions-additional-repository:';

export function getAdditionalFolderContextId(uri: URI): string {
	return `${ADDITIONAL_FOLDER_CONTEXT_ID_PREFIX}${uri.toString()}`;
}

export function getAdditionalRepositoryContextId(uri: URI): string {
	return `${ADDITIONAL_REPOSITORY_CONTEXT_ID_PREFIX}${uri.toString()}`;
}

export function isAdditionalWorkspaceContextId(id: string): boolean {
	return id.startsWith(ADDITIONAL_FOLDER_CONTEXT_ID_PREFIX) || id.startsWith(ADDITIONAL_REPOSITORY_CONTEXT_ID_PREFIX);
}

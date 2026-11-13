/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentMetadataSource } from '../metadata.js';

const key = 'vscode.branchCreationSources';

/** Requests reference details for branch creation without changing ordinary branch completions. */
export function branchCreationSourcesRequestMeta(): Record<string, unknown> {
	return { [key]: true };
}

/** Unknown or malformed metadata leaves the standard completion behavior unchanged. */
export function isBranchCreationSourcesRequest(source: IAgentMetadataSource): boolean {
	return source._meta?.[key] === true;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

const WORKSPACE_GROUP_KEY_PREFIX = 'workspace:';

export interface IAICustomizationWorkspaceGroup {
	readonly key: string;
	readonly label: string;
	readonly uri: URI;
}

export function getAICustomizationWorkspaceGroups(workspaceContextService: IWorkspaceContextService): readonly IAICustomizationWorkspaceGroup[] {
	const folders = workspaceContextService.getWorkspace().folders;
	return folders.length > 1
		? folders.map(folder => ({
			key: `${WORKSPACE_GROUP_KEY_PREFIX}${folder.uri.toString()}`,
			label: folder.name,
			uri: folder.uri,
		}))
		: [];
}

export function isAICustomizationWorkspaceGroupKey(groupKey: string): boolean {
	return groupKey.startsWith(WORKSPACE_GROUP_KEY_PREFIX);
}

export function getAICustomizationWorkspaceGroupForResource(resource: URI, workspaceContextService: IWorkspaceContextService): IAICustomizationWorkspaceGroup | undefined {
	const groups = getAICustomizationWorkspaceGroups(workspaceContextService);
	if (groups.length === 0) {
		return undefined;
	}
	const folder = workspaceContextService.getWorkspaceFolder(resource);
	return groups.find(group => folder && isEqual(group.uri, folder.uri)) ?? groups[0];
}

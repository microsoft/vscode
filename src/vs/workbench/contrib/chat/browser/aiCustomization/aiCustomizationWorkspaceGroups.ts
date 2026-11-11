/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { isEqual, isEqualOrParent } from '../../../../../base/common/resources.js';
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

/**
 * Returns the workspace folder group that contains the resource, or
 * `undefined` when the resource is outside every workspace folder. Unlike
 * {@link getAICustomizationWorkspaceGroupForResource}, it never attributes a
 * resource to an arbitrary folder.
 */
export function findAICustomizationWorkspaceGroupContaining(resource: URI, workspaceContextService: IWorkspaceContextService): IAICustomizationWorkspaceGroup | undefined {
	let match: IAICustomizationWorkspaceGroup | undefined;
	for (const group of getAICustomizationWorkspaceGroups(workspaceContextService)) {
		if (isEqualOrParent(resource, group.uri) && (!match || group.uri.path.length > match.uri.path.length)) {
			match = group;
		}
	}
	return match;
}

/**
 * Returns whether the resource lives in any workspace folder of the window.
 */
export function isInAICustomizationWorkspaceFolder(resource: URI, workspaceContextService: IWorkspaceContextService): boolean {
	return workspaceContextService.getWorkspace().folders.some(folder => isEqualOrParent(resource, folder.uri));
}

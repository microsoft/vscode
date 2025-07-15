/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchState, IWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { getRemotes } from '../../../../platform/extensionManagement/common/configRemotes.js';

export type Tags = { [index: string]: boolean | number | string | undefined };

export const IWorkspaceTagsService = createDecorator<IWorkspaceTagsService>('workspaceTagsService');

export interface IWorkspaceTagsService {
	readonly _serviceBrand: undefined;

	getTags(): Promise<Tags>;

	/**
	 * Returns an id for the workspace, different from the id returned by the context service. A hash based
	 * on the folder uri or workspace configuration, not time-based, and undefined for empty workspaces.
	 */
	getTelemetryWorkspaceId(workspace: IWorkspace, state: WorkbenchState): Promise<string | undefined>;

	getHashedRemotesFromUri(workspaceUri: URI, stripEndingDotGit?: boolean): Promise<string[]>;
}

export async function getHashedRemotesFromConfig(text: string, stripEndingDotGit: boolean = false, sha1Hex: (str: string) => Promise<string>): Promise<string[]> {
	return Promise.all(getRemotes(text, stripEndingDotGit).map(remote => sha1Hex(remote)));
}

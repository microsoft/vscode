/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchState, IWorkspace } from '../../../../platform/workspace/common/workspace';
import { URI } from '../../../../base/common/uri';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IWorkspaceTagsService, Tags } from '../common/workspaceTags';

export class NoOpWorkspaceTagsService implements IWorkspaceTagsService {

	declare readonly _serviceBrand: undefined;

	getTags(): Promise<Tags> {
		return Promise.resolve({});
	}

	async getTelemetryWorkspaceId(workspace: IWorkspace, state: WorkbenchState): Promise<string | undefined> {
		return undefined;
	}

	getHashedRemotesFromUri(workspaceUri: URI, stripEndingDotGit?: boolean): Promise<string[]> {
		return Promise.resolve([]);
	}
}

registerSingleton(IWorkspaceTagsService, NoOpWorkspaceTagsService, InstantiationType.Delayed);

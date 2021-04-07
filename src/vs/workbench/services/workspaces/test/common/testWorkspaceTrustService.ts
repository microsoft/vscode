/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustRequestModel, IWorkspaceTrustService, WorkspaceTrustChangeEvent, WorkspaceTrustState, IWorkspaceTrustUriInfo } from 'vs/platform/workspace/common/workspaceTrust';
import { WorkspaceTrustRequestModel } from 'vs/workbench/services/workspaces/common/workspaceTrust';

export class TestWorkspaceTrustService implements IWorkspaceTrustService {
	_serviceBrand: undefined;

	requestModel: IWorkspaceTrustRequestModel = new WorkspaceTrustRequestModel();

	onDidChangeTrustState: WorkspaceTrustChangeEvent = Event.None;

	getWorkspaceTrustState(): WorkspaceTrustState {
		return WorkspaceTrustState.Trusted;
	}

	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustUriInfo {
		throw new Error('Method not implemented.');
	}

	isWorkspaceTrustEnabled(): boolean {
		return true;
	}

	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<WorkspaceTrustState | undefined> {
		return Promise.resolve(WorkspaceTrustState.Trusted);
	}

	setFolderTrustState(folder: URI, trustState: WorkspaceTrustState): void {
		throw new Error('Method not implemented.');
	}
}

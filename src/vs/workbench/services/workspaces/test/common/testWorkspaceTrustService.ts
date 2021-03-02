/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IWorkspaceTrustRequest, IWorkspaceTrustRequestModel, IWorkspaceTrustService, WorkspaceTrustChangeEvent, WorkspaceTrustState } from 'vs/platform/workspace/common/workspaceTrust';
import { WorkspaceTrustRequestModel } from 'vs/workbench/services/workspaces/common/workspaceTrust';

export class TestWorkspaceTrustService implements IWorkspaceTrustService {
	_serviceBrand: undefined;

	requestModel: IWorkspaceTrustRequestModel = new WorkspaceTrustRequestModel();

	onDidChangeTrustState: WorkspaceTrustChangeEvent = Event.None;

	getWorkspaceTrustState(): WorkspaceTrustState {
		return WorkspaceTrustState.Trusted;
	}

	isWorkspaceTrustEnabled(): boolean {
		return true;
	}

	requireWorkspaceTrust(request: IWorkspaceTrustRequest): Promise<WorkspaceTrustState> {
		return Promise.resolve(WorkspaceTrustState.Trusted);
	}
}

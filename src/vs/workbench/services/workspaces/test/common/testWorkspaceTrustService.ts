/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustService, WorkspaceTrustChangeEvent, WorkspaceTrustState, IWorkspaceTrustRequestService, IWorkspaceTrustRequestModel } from 'vs/platform/workspace/common/workspaceTrust';
import { WorkspaceTrustRequestModel } from 'vs/workbench/services/workspaces/common/workspaceTrust';

export class TestWorkspaceTrustService implements IWorkspaceTrustService {
	_serviceBrand: undefined;

	onDidChangeTrustState: WorkspaceTrustChangeEvent = Event.None;

	getWorkspaceTrustState(): WorkspaceTrustState {
		return WorkspaceTrustState.Trusted;
	}

	setWorkspaceTrustState(trustState: WorkspaceTrustState): void {
		throw new Error('Method not implemented.');
	}

	isWorkspaceTrustEnabled(): boolean {
		return true;
	}

	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<WorkspaceTrustState | undefined> {
		return Promise.resolve(WorkspaceTrustState.Trusted);
	}
}

export class TestWorkspaceTrustRequestService implements IWorkspaceTrustRequestService {
	_serviceBrand: undefined;

	requestModel: IWorkspaceTrustRequestModel = new WorkspaceTrustRequestModel();

	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<WorkspaceTrustState | undefined> {
		return Promise.resolve(WorkspaceTrustState.Trusted);
	}
}

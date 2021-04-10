/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustManagementService, WorkspaceTrustChangeEvent, WorkspaceTrustState, IWorkspaceTrustRequestService, IWorkspaceTrustStorageService, IWorkspaceTrustStateInfo, IWorkspaceTrustUriInfo } from 'vs/platform/workspace/common/workspaceTrust';

export class TestWorkspaceTrustStorageService implements IWorkspaceTrustStorageService {
	_serviceBrand: undefined;

	onDidStorageChange: Event<void> = Event.None;

	setFoldersTrustState(folder: URI[], trustState: WorkspaceTrustState): void {
		throw new Error('Method not implemented.');
	}

	getFoldersTrustState(folder: URI[]): WorkspaceTrustState {
		throw new Error('Method not implemented.');
	}

	setTrustedFolders(folders: URI[]): void {
		throw new Error('Method not implemented.');
	}

	setUntrustedFolders(folders: URI[]): void {
		throw new Error('Method not implemented.');
	}

	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustUriInfo {
		throw new Error('Method not implemented.');
	}

	getTrustStateInfo(): IWorkspaceTrustStateInfo {
		throw new Error('Method not implemented.');
	}
}

export class TestWorkspaceTrustManagementService implements IWorkspaceTrustManagementService {
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

	onDidInitiateWorkspaceTrustRequest: Event<WorkspaceTrustRequestOptions> = Event.None;
	onDidCompleteWorkspaceTrustRequest: Event<WorkspaceTrustState> = Event.None;


	cancelRequest(): void {
		throw new Error('Method not implemented.');
	}

	completeRequest(trustState?: WorkspaceTrustState): void {
		throw new Error('Method not implemented.');
	}

	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<WorkspaceTrustState | undefined> {
		return Promise.resolve(WorkspaceTrustState.Trusted);
	}
}

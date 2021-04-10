/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export enum WorkspaceTrustScope {
	Local = 0,
	Remote = 1
}

export enum WorkspaceTrustState {
	Untrusted = 0,
	Trusted = 1,
	Unspecified = 2
}

export function workspaceTrustStateToString(trustState: WorkspaceTrustState) {
	switch (trustState) {
		case WorkspaceTrustState.Trusted:
			return localize('trusted', "Trusted");
		case WorkspaceTrustState.Untrusted:
			return localize('untrusted', "Untrusted");
		case WorkspaceTrustState.Unspecified:
		default:
			return localize('unspecified', "Unspecified");
	}
}

export interface WorkspaceTrustRequestButton {
	readonly label: string;
	readonly type: 'ContinueWithTrust' | 'ContinueWithoutTrust' | 'Manage' | 'Cancel'
}

export interface WorkspaceTrustRequestOptions {
	readonly buttons?: WorkspaceTrustRequestButton[];
	readonly message?: string;
	readonly modal: boolean;
}

export interface WorkspaceTrustStateChangeEvent {
	readonly previousTrustState: WorkspaceTrustState;
	readonly currentTrustState: WorkspaceTrustState;
}

export type WorkspaceTrustChangeEvent = Event<WorkspaceTrustStateChangeEvent>;

export const IWorkspaceTrustStorageService = createDecorator<IWorkspaceTrustStorageService>('workspaceTrustStorageService');

export interface IWorkspaceTrustStorageService {
	_serviceBrand: undefined;

	readonly onDidStorageChange: Event<void>;

	setFoldersTrustState(folder: URI[], trustState: WorkspaceTrustState): void;
	getFoldersTrustState(folder: URI[]): WorkspaceTrustState;

	setTrustedFolders(folders: URI[]): void;
	setUntrustedFolders(folders: URI[]): void;

	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustUriInfo;
	getTrustStateInfo(): IWorkspaceTrustStateInfo;
}

export const IWorkspaceTrustManagementService = createDecorator<IWorkspaceTrustManagementService>('workspaceTrustManagementService');

export interface IWorkspaceTrustManagementService {
	readonly _serviceBrand: undefined;

	onDidChangeTrustState: WorkspaceTrustChangeEvent;
	getWorkspaceTrustState(): WorkspaceTrustState;
	setWorkspaceTrustState(trustState: WorkspaceTrustState): void;
	isWorkspaceTrustEnabled(): boolean;
}

export const IWorkspaceTrustRequestService = createDecorator<IWorkspaceTrustRequestService>('workspaceTrustRequestService');

export interface IWorkspaceTrustRequestService {
	readonly _serviceBrand: undefined;

	readonly onDidInitiateWorkspaceTrustRequest: Event<WorkspaceTrustRequestOptions>;
	readonly onDidCompleteWorkspaceTrustRequest: Event<WorkspaceTrustState>;

	cancelRequest(): void;
	completeRequest(trustState?: WorkspaceTrustState): void;
	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<WorkspaceTrustState | undefined>;
}

export interface IWorkspaceTrustUriInfo {
	uri: URI,
	trustState: WorkspaceTrustState
}

export interface IWorkspaceTrustStateInfo {
	uriTrustInfo: IWorkspaceTrustUriInfo[]
}

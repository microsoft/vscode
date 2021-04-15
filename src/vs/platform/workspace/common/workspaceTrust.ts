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

export function workspaceTrustToString(trustState: boolean) {
	if (trustState) {
		return localize('trusted', "Trusted");
	} else {
		return localize('untrusted', "Untrusted");
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

export type WorkspaceTrustChangeEvent = Event<boolean>;
export const IWorkspaceTrustStorageService = createDecorator<IWorkspaceTrustStorageService>('workspaceTrustStorageService');

export interface IWorkspaceTrustStorageService {
	_serviceBrand: undefined;

	readonly onDidStorageChange: Event<void>;

	setFoldersTrust(folders: URI[], trusted: boolean): void;
	getFoldersTrust(folders: URI[]): boolean;

	setTrustedFolders(folders: URI[]): void;

	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustUriInfo;
	getTrustStateInfo(): IWorkspaceTrustStateInfo;
}

export const IWorkspaceTrustManagementService = createDecorator<IWorkspaceTrustManagementService>('workspaceTrustManagementService');

export interface IWorkspaceTrustManagementService {
	readonly _serviceBrand: undefined;

	onDidChangeTrust: WorkspaceTrustChangeEvent;
	isWorkpaceTrusted(): boolean;
	setWorkspaceTrust(trusted: boolean): void;
}

export const IWorkspaceTrustRequestService = createDecorator<IWorkspaceTrustRequestService>('workspaceTrustRequestService');

export interface IWorkspaceTrustRequestService {
	readonly _serviceBrand: undefined;

	readonly onDidInitiateWorkspaceTrustRequest: Event<WorkspaceTrustRequestOptions>;
	readonly onDidCompleteWorkspaceTrustRequest: Event<boolean>;

	cancelRequest(): void;
	completeRequest(trusted?: boolean): void;
	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean>;
}

export interface IWorkspaceTrustUriInfo {
	uri: URI,
	trusted: boolean
}

export interface IWorkspaceTrustStateInfo {
	uriTrustInfo: IWorkspaceTrustUriInfo[]
}

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

export interface IWorkspaceTrustModel {

	readonly onDidChangeTrustState: Event<void>;

	setFolderTrustState(folder: URI, trustState: WorkspaceTrustState): void;
	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustUriInfo;

	setTrustedFolders(folders: URI[]): void;
	setUntrustedFolders(folders: URI[]): void;

	getTrustStateInfo(): IWorkspaceTrustStateInfo;
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

export interface IWorkspaceTrustRequestModel {
	readonly trustRequestOptions: WorkspaceTrustRequestOptions | undefined;

	readonly onDidInitiateRequest: Event<void>;
	readonly onDidCompleteRequest: Event<WorkspaceTrustState | undefined>;
	readonly onDidCancelRequest: Event<void>;

	initiateRequest(options?: WorkspaceTrustRequestOptions): void;
	completeRequest(trustState?: WorkspaceTrustState): void;
	cancelRequest(): void;
}

export interface WorkspaceTrustStateChangeEvent {
	readonly previousTrustState: WorkspaceTrustState;
	readonly currentTrustState: WorkspaceTrustState;
}

export type WorkspaceTrustChangeEvent = Event<WorkspaceTrustStateChangeEvent>;

export const IWorkspaceTrustService = createDecorator<IWorkspaceTrustService>('workspaceTrustService');

export interface IWorkspaceTrustService {
	readonly _serviceBrand: undefined;

	readonly requestModel: IWorkspaceTrustRequestModel;

	onDidChangeTrustState: WorkspaceTrustChangeEvent;
	getWorkspaceTrustState(): WorkspaceTrustState;
	isWorkspaceTrustEnabled(): boolean;
	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<WorkspaceTrustState | undefined>;
}

export interface IWorkspaceTrustUriInfo {
	uri: URI,
	trustState: WorkspaceTrustState
}

export interface IWorkspaceTrustStateInfo {
	uriTrustInfo: IWorkspaceTrustUriInfo[]
}

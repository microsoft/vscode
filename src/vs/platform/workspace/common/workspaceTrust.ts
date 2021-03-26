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
	Unknown = 2
}

export function workspaceTrustStateToString(trustState: WorkspaceTrustState) {
	switch (trustState) {
		case WorkspaceTrustState.Trusted:
			return localize('trusted', "Trusted");
		case WorkspaceTrustState.Untrusted:
			return localize('untrusted', "Untrusted");
		case WorkspaceTrustState.Unknown:
		default:
			return localize('unknown', "Unknown");
	}
}

export interface IWorkspaceTrustModel {

	readonly onDidChangeTrustState: Event<void>;

	setFolderTrustState(folder: URI, trustState: WorkspaceTrustState): void;
	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustFolderInfo;

	setTrustedFolders(folders: URI[]): void;
	setUntrustedFolders(folders: URI[]): void;

	getTrustStateInfo(): IWorkspaceTrustStateInfo;
}

export interface WorkspaceTrustRequestButton {
	label: string;
	type: 'ContinueWithTrust' | 'ContinueWithoutTrust' | 'Manage' | 'Cancel'
}

export interface WorkspaceTrustRequestOptions {
	buttons?: WorkspaceTrustRequestButton[];
	message?: string;
	modal: boolean;
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
	previousTrustState: WorkspaceTrustState;
	currentTrustState: WorkspaceTrustState;
}

export type WorkspaceTrustChangeEvent = Event<WorkspaceTrustStateChangeEvent>;

export const IWorkspaceTrustService = createDecorator<IWorkspaceTrustService>('workspaceTrustService');

export interface IWorkspaceTrustService {
	readonly _serviceBrand: undefined;

	readonly requestModel: IWorkspaceTrustRequestModel;

	onDidChangeTrustState: WorkspaceTrustChangeEvent;
	getWorkspaceTrustState(): WorkspaceTrustState;
	isWorkspaceTrustEnabled(): boolean;
	requireWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<WorkspaceTrustState>;
}

export interface IWorkspaceTrustFolderInfo {
	uri: string,
	trustState: WorkspaceTrustState
}

export interface IWorkspaceTrustStateInfo {
	localFolders: IWorkspaceTrustFolderInfo[]

	// Removing complexity of remote items
	//trustedRemoteItems: { uri: string }[]
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export enum WorkspaceTrustScope {
	Local = 0,
	Remote = 1
}

export interface WorkspaceTrustRequestButton {
	readonly label: string;
	readonly type: 'ContinueWithTrust' | 'ContinueWithoutTrust' | 'Manage' | 'Cancel';
}

export interface WorkspaceTrustRequestOptions {
	readonly buttons?: WorkspaceTrustRequestButton[];
	readonly message?: string;
}

export const IWorkspaceTrustEnablementService = createDecorator<IWorkspaceTrustEnablementService>('workspaceTrustEnablementService');

export interface IWorkspaceTrustEnablementService {
	readonly _serviceBrand: undefined;

	isWorkspaceTrustEnabled(): boolean;
}

export const IWorkspaceTrustManagementService = createDecorator<IWorkspaceTrustManagementService>('workspaceTrustManagementService');

export interface IWorkspaceTrustManagementService {
	readonly _serviceBrand: undefined;

	onDidChangeTrust: Event<boolean>;
	onDidChangeTrustedFolders: Event<void>;

	readonly workspaceResolved: Promise<void>;
	readonly workspaceTrustInitialized: Promise<void>;
	acceptsOutOfWorkspaceFiles: boolean;

	isWorkspaceTrusted(): boolean;
	isWorkspaceTrustForced(): boolean;

	canSetParentFolderTrust(): boolean;
	setParentFolderTrust(trusted: boolean): Promise<void>;

	canSetWorkspaceTrust(): boolean;
	setWorkspaceTrust(trusted: boolean): Promise<void>;

	getUriTrustInfo(uri: URI): Promise<IWorkspaceTrustUriInfo>;
	setUrisTrust(uri: URI[], trusted: boolean): Promise<void>;

	getTrustedUris(): URI[];
	setTrustedUris(uris: URI[]): Promise<void>;

	addWorkspaceTrustTransitionParticipant(participant: IWorkspaceTrustTransitionParticipant): IDisposable;
}

export const enum WorkspaceTrustUriResponse {
	Open = 1,
	OpenInNewWindow = 2,
	Cancel = 3
}

export const IWorkspaceTrustRequestService = createDecorator<IWorkspaceTrustRequestService>('workspaceTrustRequestService');

export interface IWorkspaceTrustRequestService {
	readonly _serviceBrand: undefined;

	readonly onDidInitiateOpenFilesTrustRequest: Event<void>;
	readonly onDidInitiateWorkspaceTrustRequest: Event<WorkspaceTrustRequestOptions | undefined>;
	readonly onDidInitiateWorkspaceTrustRequestOnStartup: Event<void>;

	completeOpenFilesTrustRequest(result: WorkspaceTrustUriResponse, saveResponse?: boolean): Promise<void>;
	requestOpenFilesTrust(openFiles: URI[]): Promise<WorkspaceTrustUriResponse>;

	cancelWorkspaceTrustRequest(): void;
	completeWorkspaceTrustRequest(trusted?: boolean): Promise<void>;
	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean | undefined>;
	requestWorkspaceTrustOnStartup(): void;
}

export interface IWorkspaceTrustTransitionParticipant {
	participate(trusted: boolean): Promise<void>;
}

export interface IWorkspaceTrustUriInfo {
	uri: URI;
	trusted: boolean;
}

export interface IWorkspaceTrustInfo {
	uriTrustInfo: IWorkspaceTrustUriInfo[];
}

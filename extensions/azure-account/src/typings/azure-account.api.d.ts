/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vscode';
import { ServiceClientCredentials } from 'ms-rest';
import { AzureEnvironment } from 'ms-rest-azure';
import { SubscriptionModels, ResourceModels } from 'azure-arm-resource';

export type AzureLoginStatus = 'Initializing' | 'LoggingIn' | 'LoggedIn' | 'LoggedOut';

export interface AzureLogin {
	readonly status: AzureLoginStatus;
	readonly onStatusChanged: Event<AzureLoginStatus>;
	readonly sessions: AzureSession[];
	readonly onSessionsChanged: Event<void>;
	readonly filters: AzureResourceFilter[];
	readonly onFiltersChanged: Event<void>;
}

export interface AzureSession {
	readonly environment: AzureEnvironment;
	readonly userId: string;
	readonly tenantId: string;
	readonly credentials: ServiceClientCredentials;
}

export interface AzureResourceFilter {
	readonly session: AzureSession;
	readonly subscription: SubscriptionModels.Subscription;
	readonly allResourceGroups: boolean;
	readonly resourceGroups: ResourceModels.ResourceGroup[];
}
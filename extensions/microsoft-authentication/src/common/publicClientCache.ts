/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { AccountInfo, AuthenticationResult, InteractiveRequest, SilentFlowRequest } from '@azure/msal-node';
import type { Disposable, Event } from 'vscode';

export interface ICachedPublicClientApplication extends Disposable {
	initialize(): Promise<void>;
	onDidAccountsChange: Event<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>;
	onDidRemoveLastAccount: Event<void>;
	acquireTokenSilent(request: SilentFlowRequest): Promise<AuthenticationResult>;
	acquireTokenInteractive(request: InteractiveRequest): Promise<AuthenticationResult>;
	removeAccount(account: AccountInfo): Promise<void>;
	accounts: AccountInfo[];
	clientId: string;
	authority: string;
}

export interface ICachedPublicClientApplicationManager {
	onDidAccountsChange: Event<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>;
	getOrCreate(clientId: string, authority: string): Promise<ICachedPublicClientApplication>;
	getAll(): ICachedPublicClientApplication[];
}

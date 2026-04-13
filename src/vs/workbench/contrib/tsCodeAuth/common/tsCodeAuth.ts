/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

// --- Constants ---

export const TSCODE_BASE_URL = 'https://testhub-dev.paas.cmbchina.cn';
export const TSCODE_GATEWAY_BASE_URL = 'https://testhub-gateway-dev.paas.cmbchina.cn'; // test-workbench_change
export const TSCODE_SECRET_STORAGE_KEY = 'tscode-oauth.accessToken';

// test-workbench_change start
// Set to true to skip real API calls and use mock data for local development
export const TSCODE_AUTH_MOCK_ENABLED = false;
export const TSCODE_AUTH_MOCK_TOKEN: StoredToken = {
	token: 'mock-access-token-for-dev',
	userName: 'Mock User',
	employeeId: 'mock-001',
};
// test-workbench_change end

// --- Data Models ---

// test-workbench_change start
export interface StoredToken {
	token: string;
	refreshToken?: string;
	idToken?: string;
	userName?: string;
	employeeId?: string;
	rtcId?: string;
	pathId?: string;
	pathName?: string;
}
// test-workbench_change end

export interface UserInfo {
	id: string;
	displayName: string;
}

export interface OAuthState {
	value: string;           // crypto.randomUUID() generated random value
	createdAt: number;       // creation timestamp for timeout detection
}

// test-workbench_change start
export interface TokenResponse {
	returnCode: string;
	body?: {
		token: string;
		refreshToken?: string;
		idToken?: string;
		userName?: string;
		employeeId?: string;
		rtcId?: string;
		pathId?: string;
		pathName?: string;
	};
}
// test-workbench_change end

// --- Service Interfaces ---

export const ITsCodeAuthService = createDecorator<ITsCodeAuthService>('tsCodeAuthService');
export interface ITsCodeAuthService {
	readonly _serviceBrand: undefined;

	checkAndHandleAuth(): Promise<void>;
	startOAuthFlow(): Promise<void>;
	stopPolling(): void; // test-workbench_change
	buildAuthorizationUrl(): string;
	reportSecurityError(message: string): void;
	signOut(): Promise<void>; // test-workbench_change

	readonly onDidLogin: Event<void>;
	readonly onDidLogout: Event<void>;

	// Events for WelcomePage
	readonly onDidNeedLogin: Event<void>;
	readonly onDidStartOAuth: Event<void>;
	readonly onDidLoginError: Event<string>;
	readonly onDidSecurityError: Event<string>;
}

export const ITsCodeTokenStore = createDecorator<ITsCodeTokenStore>('tsCodeTokenStore');
export interface ITsCodeTokenStore {
	readonly _serviceBrand: undefined;

	getToken(): Promise<StoredToken | undefined>; // test-workbench_change
	saveToken(token: StoredToken): Promise<void>;
	clearToken(): Promise<void>;
}

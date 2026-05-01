/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A token record persisted per provider. */
export interface TokenRecord {
	token: string;
	refreshToken?: string;
	expiresAt: number;
	/** Extra headers the adapter must attach to every request (e.g. Copilot session headers). */
	headers?: Record<string, string>;
}

/** Per-provider status surfaced by broker.status(). */
export interface ProviderStatus {
	id: string;
	connected: boolean;
	expiresAt?: number;
	displayName: string;
}

/** OAuth provider configuration registered at broker startup. */
export interface ProviderConfig {
	id: string;
	displayName: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	clientId: string;
	scopes: string[];
}

// ── Wire types ────────────────────────────────────────────────────────────────

export interface GetTokenRequest {
	method: 'getToken';
	providerId: string;
	requestId: string;
}

export interface InvalidateRequest {
	method: 'invalidate';
	providerId: string;
	requestId: string;
}

export interface RefreshRequest {
	method: 'refresh';
	providerId: string;
	requestId: string;
}

export interface StatusRequest {
	method: 'status';
	requestId: string;
}

export interface ConnectRequest {
	method: 'connect';
	providerId: string;
	requestId: string;
}

export interface DisconnectRequest {
	method: 'disconnect';
	providerId: string;
	requestId: string;
}

export type BrokerRequest =
	| GetTokenRequest
	| InvalidateRequest
	| RefreshRequest
	| StatusRequest
	| ConnectRequest
	| DisconnectRequest;

export type BrokerResponse =
	| { requestId: string; result: TokenRecord }
	| { requestId: string; result: { ok: true } }
	| { requestId: string; result: { providers: ProviderStatus[] } }
	| { requestId: string; error: string };

/**
 * Minimal secret-storage interface satisfied by both vscode.SecretStorage and
 * the in-memory fake used in tests.
 */
export interface SecretStore {
	get(key: string): Thenable<string | undefined>;
	store(key: string, value: string): Thenable<void>;
	delete(key: string): Thenable<void>;
}

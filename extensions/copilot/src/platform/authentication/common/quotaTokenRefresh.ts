/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationSession } from 'vscode';
import type { IAuthenticationService } from './authentication';

const quotaTokenRefreshIntervalMs = 5 * 60 * 1000;

interface QuotaTokenRefreshState {
	readonly sessionKey: string | undefined;
	username: string | undefined;
	readonly scopes: Map<string, {
		latched: boolean;
		lastSuccessfulRequestId: number;
		lastQuotaRequestId: number;
		refreshAfter: number;
		pending: Promise<void> | undefined;
	}>;
}

const quotaTokenRefreshStates = new WeakMap<IAuthenticationService, QuotaTokenRefreshState>();
let lastRequestId = 0;

/**
 * Captures the account and quota scope before sending a request. Refreshes once per
 * quota episode, rearming only after a successful response for the same scope.
 * The cooldown bounds failed refreshes and rapid success/failure cycles.
 */
export class QuotaTokenRefreshRequest {
	private readonly requestId = ++lastRequestId;
	private readonly state: QuotaTokenRefreshState;
	private readonly scope;

	constructor(scopeKey: string, private readonly authenticationService: IAuthenticationService) {
		let state = quotaTokenRefreshStates.get(authenticationService);
		if (!state || !isSameAccount(authenticationService, state)) {
			state = { sessionKey: getSessionKey(authenticationService.anyGitHubSession), username: undefined, scopes: new Map() };
			quotaTokenRefreshStates.set(authenticationService, state);
		}
		state.username ??= authenticationService.copilotToken?.username;
		this.state = state;

		let scope = state.scopes.get(scopeKey);
		if (!scope) {
			scope = { latched: false, lastSuccessfulRequestId: 0, lastQuotaRequestId: 0, refreshAfter: 0, pending: undefined };
			state.scopes.set(scopeKey, scope);
		}
		this.scope = scope;
	}

	onSuccess(): void {
		if (this.isCurrentAccount()) {
			this.scope.lastSuccessfulRequestId = Math.max(this.scope.lastSuccessfulRequestId, this.requestId);
			if (this.requestId > this.scope.lastQuotaRequestId) {
				this.scope.latched = false;
			}
		}
	}

	async onQuotaExceeded(knownQuotaExceeded: boolean): Promise<void> {
		const scope = this.scope;
		if (!this.isCurrentAccount() || this.requestId <= scope.lastSuccessfulRequestId) {
			return;
		}
		scope.lastQuotaRequestId = Math.max(scope.lastQuotaRequestId, this.requestId);
		const shouldRefresh = !scope.pending && !scope.latched && !knownQuotaExceeded;
		if (shouldRefresh && Date.now() < scope.refreshAfter) {
			return;
		}

		scope.latched = true;
		if (shouldRefresh) {
			scope.pending = this.refresh().finally(() => { scope.pending = undefined; });
		}
		return scope.pending;
	}

	private async refresh(): Promise<void> {
		const scope = this.scope;
		try {
			// Publish the shared promise first and let a newer success supersede this refresh.
			await Promise.resolve();
			if (!this.isCurrentAccount() || scope.lastQuotaRequestId <= scope.lastSuccessfulRequestId) {
				return;
			}
			scope.refreshAfter = Date.now() + quotaTokenRefreshIntervalMs;
			this.authenticationService.resetCopilotToken(402);
			await this.authenticationService.getCopilotToken();
		} catch (error) {
			scope.latched = false;
			throw error;
		}
	}

	private isCurrentAccount(): boolean {
		return quotaTokenRefreshStates.get(this.authenticationService) === this.state
			&& isSameAccount(this.authenticationService, this.state);
	}
}

function isSameAccount(authenticationService: IAuthenticationService, state: QuotaTokenRefreshState): boolean {
	const session = authenticationService.anyGitHubSession;
	// Token-only clients retain their username while the token is missing during refresh.
	const username = session ? undefined : authenticationService.copilotToken?.username;
	return state.sessionKey === getSessionKey(session)
		&& (username === undefined || state.username === undefined || username === state.username);
}

function getSessionKey(session: AuthenticationSession | undefined): string | undefined {
	// OAuth sessions use account + issuer; static sessions need a snapshot of their live id.
	return session && JSON.stringify([session.account.id, session.authorizationServer?.toString() ?? ['static', session.id]]);
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationSession } from 'vscode';
import type { IAuthenticationService } from './authentication';
import { authenticationSessionIdentityEquals } from './enterprise';

const quotaTokenRefreshIntervalMs = 5 * 60 * 1000;

interface QuotaTokenRefreshState {
	readonly session: AuthenticationSession | undefined;
	tokenAccountId: string | undefined;
	readonly scopes: Map<string, QuotaRefreshScope>;
}

interface QuotaRefreshScope {
	handled: boolean;
	nextRequestId: number;
	lastSuccessfulRequestId: number;
	lastQuotaRequestId: number;
	refreshAfter: number;
	pending: Promise<void> | undefined;
}

const quotaTokenRefreshStates = new WeakMap<IAuthenticationService, QuotaTokenRefreshState>();

/**
 * Captures the account and quota scope before sending a request. Refreshes once per
 * quota episode, rearming only after a successful response for the same scope.
 * The cooldown bounds failed refreshes and rapid success/failure cycles.
 */
export class QuotaTokenRefreshRequest {
	private readonly state: QuotaTokenRefreshState;
	private readonly scope: QuotaRefreshScope;
	private readonly requestId: number;

	constructor(
		scopeKey: string,
		private readonly authenticationService: IAuthenticationService,
	) {
		let state = quotaTokenRefreshStates.get(authenticationService);
		if (!state || !isSameAccount(authenticationService, state)) {
			state = {
				session: authenticationService.anyGitHubSession,
				tokenAccountId: getTokenAccountId(authenticationService),
				scopes: new Map(),
			};
			quotaTokenRefreshStates.set(authenticationService, state);
		}
		state.tokenAccountId ??= getTokenAccountId(authenticationService);
		this.state = state;

		let scope = state.scopes.get(scopeKey);
		if (!scope) {
			scope = { handled: false, nextRequestId: 0, lastSuccessfulRequestId: 0, lastQuotaRequestId: 0, refreshAfter: 0, pending: undefined };
			state.scopes.set(scopeKey, scope);
		}
		this.scope = scope;
		this.requestId = ++scope.nextRequestId;
	}

	onSuccess(): void {
		if (this.isCurrentAccount()) {
			this.scope.lastSuccessfulRequestId = Math.max(this.scope.lastSuccessfulRequestId, this.requestId);
			if (this.requestId > this.scope.lastQuotaRequestId) {
				this.scope.handled = false;
			}
		}
	}

	async onQuotaExceeded(knownQuotaExceeded: boolean): Promise<void> {
		const scope = this.scope;
		if (!this.isCurrentAccount() || this.requestId <= scope.lastSuccessfulRequestId) {
			return;
		}
		scope.lastQuotaRequestId = Math.max(scope.lastQuotaRequestId, this.requestId);
		if (scope.pending) {
			scope.handled = true;
			return scope.pending;
		}
		if (knownQuotaExceeded) {
			scope.handled = true;
			return;
		}
		if (scope.handled || Date.now() < scope.refreshAfter) {
			return;
		}

		scope.handled = true;
		try {
			// Publish the promise before resetting the token can notify other consumers.
			scope.pending = Promise.resolve().then(async () => {
				if (this.isCurrentAccount() && scope.lastQuotaRequestId > scope.lastSuccessfulRequestId) {
					scope.refreshAfter = Date.now() + quotaTokenRefreshIntervalMs;
					this.authenticationService.resetCopilotToken(402);
					await this.authenticationService.getCopilotToken();
				}
			});
			await scope.pending;
		} catch (error) {
			scope.handled = false;
			throw error;
		} finally {
			scope.pending = undefined;
		}
	}

	private isCurrentAccount(): boolean {
		return quotaTokenRefreshStates.get(this.authenticationService) === this.state
			&& isSameAccount(this.authenticationService, this.state);
	}
}

function getTokenAccountId(authenticationService: IAuthenticationService): string | undefined {
	const token = authenticationService.copilotToken;
	return token?.getTokenValue('tid') ?? token?.username;
}

function isSameAccount(authenticationService: IAuthenticationService, state: QuotaTokenRefreshState): boolean {
	if (!authenticationSessionIdentityEquals(state.session, authenticationService.anyGitHubSession)) {
		return false;
	}
	// Static GitHub sessions can share a placeholder account ID, so also compare
	// token identities. A missing token during refresh must not discard the latch.
	const tokenAccountId = getTokenAccountId(authenticationService);
	return tokenAccountId === undefined || state.tokenAccountId === undefined || tokenAccountId === state.tokenAccountId;
}

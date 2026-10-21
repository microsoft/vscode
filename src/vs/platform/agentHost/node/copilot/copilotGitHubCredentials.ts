/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTokenProvider } from '@github/copilot-sdk';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { getExpirationTime, getRemainingTimeInSeconds } from '../../../../base/common/date.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isScopedCredentialUsable, type IAgentHostScopedCredential } from '../../common/agentHostCredentials.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';

const COPILOT_GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS = 60 * 60;
const COPILOT_GITHUB_TOKEN_REFRESH_TIMEOUT_MS = 30_000;

type CopilotGitHubSdkSessionOptions =
	| { readonly gitHubToken: string | undefined; readonly gitHubTokenProvider?: never }
	| { readonly gitHubToken?: never; readonly gitHubTokenProvider: GitHubTokenProvider };

/**
 * The GitHub credential configuration captured when an SDK session launches.
 */
export class CopilotGitHubSessionCredentials {
	private constructor(
		private _staticToken: string | undefined,
		private readonly _provider: CopilotGitHubCredentials | undefined,
		private readonly _useClientAuthentication: boolean,
		private readonly _capturedCredential?: IAgentHostScopedCredential,
	) { }

	static fromToken(token: string | undefined): CopilotGitHubSessionCredentials {
		return new CopilotGitHubSessionCredentials(token, undefined, false);
	}

	static fromClientAuthentication(token: string | undefined): CopilotGitHubSessionCredentials {
		return new CopilotGitHubSessionCredentials(token, undefined, true);
	}

	static fromProvider(provider: CopilotGitHubCredentials): CopilotGitHubSessionCredentials {
		return new CopilotGitHubSessionCredentials(undefined, provider, false);
	}

	static fromCredential(credential: IAgentHostScopedCredential): CopilotGitHubSessionCredentials {
		return new CopilotGitHubSessionCredentials(undefined, undefined, false, { ...credential });
	}

	get usesStaticToken(): boolean {
		return this._provider === undefined && this._capturedCredential === undefined;
	}

	get usesScopedCredential(): boolean {
		return this._capturedCredential !== undefined;
	}

	get token(): string | undefined {
		if (this._capturedCredential) {
			return isScopedCredentialUsable(this._capturedCredential) ? this._capturedCredential.token : undefined;
		}
		return this._provider?.token ?? this._staticToken;
	}

	get sdkSessionOptions(): CopilotGitHubSdkSessionOptions {
		if (this._capturedCredential) {
			const credential = this._capturedCredential;
			if (!isScopedCredentialUsable(credential)) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The captured Copilot credential has expired or been revoked');
			}
			return { gitHubToken: credential.token };
		}
		return this._provider
			? { gitHubTokenProvider: this._provider.tokenProvider }
			: { gitHubToken: this._useClientAuthentication ? undefined : this._staticToken };
	}

	isCurrentToken(token: string): boolean {
		return this.token === token;
	}

	isCurrentCredential(credential: IAgentHostScopedCredential): boolean {
		const captured = this._capturedCredential;
		return captured !== undefined && isScopedCredentialUsable(captured) && captured.resource === credential.resource && captured.token === credential.token
			&& captured.expiresAt === credential.expiresAt && captured.revision === credential.revision;
	}

	updateStaticToken(token: string): void {
		if (!this.usesStaticToken) {
			throw new Error('Cannot update provider-backed GitHub credentials as a static token');
		}
		this._staticToken = token;
	}

}

/**
 * Owns the current GitHub credential mode and supplies refreshable credentials to SDK sessions.
 */
export class CopilotGitHubCredentials extends Disposable {
	private _token: string | undefined;
	private _expiresAt: number | undefined;
	private _usesTokenProvider = false;
	private _pendingRefresh: DeferredPromise<void> | undefined;
	private _isShutdown = false;

	constructor(
		private readonly _now = Date.now,
		private readonly _refreshTimeoutMs = COPILOT_GITHUB_TOKEN_REFRESH_TIMEOUT_MS,
	) {
		super();
	}

	private readonly _onDidRequestRefresh = this._register(new Emitter<void>());
	readonly onDidRequestRefresh: Event<void> = this._onDidRequestRefresh.event;

	get token(): string | undefined {
		return this._token;
	}

	readonly tokenProvider: GitHubTokenProvider = async ({ reason }) => {
		let expiresIn = getRemainingTimeInSeconds(this._expiresAt, this._now());
		if (!this._isShutdown && this._usesTokenProvider && (reason === 'refresh' || expiresIn === undefined || expiresIn <= COPILOT_GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS)) {
			await this._requestRefresh();
			expiresIn = getRemainingTimeInSeconds(this._expiresAt, this._now());
		}
		if (this._isShutdown || !this._usesTokenProvider || !this._token || expiresIn === undefined || expiresIn <= COPILOT_GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS) {
			return { kind: 'cancelled' };
		}
		return { kind: 'token', accessToken: this._token, expiresIn };
	};

	forSession(): CopilotGitHubSessionCredentials {
		return this._usesTokenProvider
			? CopilotGitHubSessionCredentials.fromProvider(this)
			: CopilotGitHubSessionCredentials.fromToken(this._token);
	}

	update(token: string | undefined, expiresIn: number | undefined): { readonly tokenChanged: boolean; readonly modeChanged: boolean } {
		const tokenChanged = this._token !== token;
		const usesTokenProvider = token !== undefined && expiresIn !== undefined;
		const modeChanged = this._usesTokenProvider !== usesTokenProvider;
		this._token = token;
		this._expiresAt = usesTokenProvider ? getExpirationTime(expiresIn, this._now()) : undefined;
		this._usesTokenProvider = usesTokenProvider;
		this._completePendingRefresh();
		return { tokenChanged, modeChanged };
	}

	shutdown(): void {
		this._isShutdown = true;
		this.update(undefined, undefined);
	}

	private async _requestRefresh(): Promise<void> {
		let pending = this._pendingRefresh;
		if (!pending) {
			pending = new DeferredPromise<void>();
			this._pendingRefresh = pending;
			this._onDidRequestRefresh.fire();
		}
		const refreshTimeout = timeout(this._refreshTimeoutMs);
		try {
			await Promise.race([pending.p, refreshTimeout]);
		} finally {
			refreshTimeout.cancel();
		}
	}

	private _completePendingRefresh(): void {
		const pending = this._pendingRefresh;
		this._pendingRefresh = undefined;
		pending?.complete();
	}

	override dispose(): void {
		this.shutdown();
		super.dispose();
	}
}

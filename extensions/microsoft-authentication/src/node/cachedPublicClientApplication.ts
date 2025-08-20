/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PublicClientApplication, AccountInfo, SilentFlowRequest, AuthenticationResult, InteractiveRequest, LogLevel, RefreshTokenRequest } from '@azure/msal-node';
import { NativeBrokerPlugin } from '@azure/msal-node-extensions';
import { Disposable, SecretStorage, LogOutputChannel, window, ProgressLocation, l10n, EventEmitter } from 'vscode';
import { raceCancellationAndTimeoutError } from '../common/async';
import { SecretStorageCachePlugin } from '../common/cachePlugin';
import { MsalLoggerOptions } from '../common/loggerOptions';
import { ICachedPublicClientApplication } from '../common/publicClientCache';
import { IAccountAccess } from '../common/accountAccess';
import { MicrosoftAuthenticationTelemetryReporter } from '../common/telemetryReporter';

export class CachedPublicClientApplication implements ICachedPublicClientApplication {
	// Core properties
	private _pca: PublicClientApplication;
	private _accounts: AccountInfo[] = [];
	private _sequencer = new Sequencer();
	private readonly _disposable: Disposable;

	// Cache properties
	private readonly _secretStorageCachePlugin: SecretStorageCachePlugin;

	// Broker properties
	private readonly _isBrokerAvailable: boolean;

	//#region Events

	private readonly _onDidAccountsChangeEmitter = new EventEmitter<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>;
	readonly onDidAccountsChange = this._onDidAccountsChangeEmitter.event;

	private readonly _onDidRemoveLastAccountEmitter = new EventEmitter<void>();
	readonly onDidRemoveLastAccount = this._onDidRemoveLastAccountEmitter.event;

	//#endregion

	private constructor(
		private readonly _clientId: string,
		private readonly _secretStorage: SecretStorage,
		private readonly _accountAccess: IAccountAccess,
		private readonly _logger: LogOutputChannel,
		telemetryReporter: MicrosoftAuthenticationTelemetryReporter
	) {
		this._secretStorageCachePlugin = new SecretStorageCachePlugin(
			this._secretStorage,
			// Include the prefix as a differentiator to other secrets
			`pca:${this._clientId}`
		);

		const loggerOptions = new MsalLoggerOptions(_logger, telemetryReporter);
		const nativeBrokerPlugin = new NativeBrokerPlugin();
		this._isBrokerAvailable = nativeBrokerPlugin.isBrokerAvailable;
		this._pca = new PublicClientApplication({
			auth: { clientId: _clientId },
			system: {
				loggerOptions: {
					correlationId: _clientId,
					loggerCallback: (level, message, containsPii) => loggerOptions.loggerCallback(level, message, containsPii),
					logLevel: LogLevel.Trace
				}
			},
			broker: { nativeBrokerPlugin },
			cache: { cachePlugin: this._secretStorageCachePlugin }
		});
		this._disposable = Disposable.from(
			this._registerOnSecretStorageChanged(),
			this._onDidAccountsChangeEmitter,
			this._onDidRemoveLastAccountEmitter,
			this._secretStorageCachePlugin
		);
	}

	get accounts(): AccountInfo[] { return this._accounts; }
	get clientId(): string { return this._clientId; }

	static async create(
		clientId: string,
		secretStorage: SecretStorage,
		accountAccess: IAccountAccess,
		logger: LogOutputChannel,
		telemetryReporter: MicrosoftAuthenticationTelemetryReporter
	): Promise<CachedPublicClientApplication> {
		const app = new CachedPublicClientApplication(clientId, secretStorage, accountAccess, logger, telemetryReporter);
		await app.initialize();
		return app;
	}

	private async initialize(): Promise<void> {
		await this._sequencer.queue(() => this._update());
	}

	dispose(): void {
		this._disposable.dispose();
	}

	async acquireTokenSilent(request: SilentFlowRequest): Promise<AuthenticationResult> {
		this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] starting...`);
		let result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(request));
		this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] got result`);
		// Check expiration of id token and if it's 5min before expiration, force a refresh.
		// this is what MSAL does for access tokens already so we're just adding it for id tokens since we care about those.
		// NOTE: Once we stop depending on id tokens for some things we can remove all of this.
		const idTokenExpirationInSecs = (result.idTokenClaims as { exp?: number }).exp;
		if (idTokenExpirationInSecs) {
			const fiveMinutesBefore = new Date(
				(idTokenExpirationInSecs - 5 * 60) // subtract 5 minutes
				* 1000 // convert to milliseconds
			);
			if (fiveMinutesBefore < new Date()) {
				this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] id token is expired or about to expire. Forcing refresh...`);
				const newRequest = this._isBrokerAvailable
					// HACK: Broker doesn't support forceRefresh so we need to pass in claims which will force a refresh
					? { ...request, claims: request.claims ?? '{ "id_token": {}}' }
					: { ...request, forceRefresh: true };
				result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(newRequest));
				this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] got forced result`);
			}
			const newIdTokenExpirationInSecs = (result.idTokenClaims as { exp?: number }).exp;
			if (newIdTokenExpirationInSecs) {
				const fiveMinutesBefore = new Date(
					(newIdTokenExpirationInSecs - 5 * 60) // subtract 5 minutes
					* 1000 // convert to milliseconds
				);
				if (fiveMinutesBefore < new Date()) {
					this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] id token is still expired.`);

					// HACK: Only for the Broker we try one more time with different claims to force a refresh. Why? We've seen the Broker caching tokens by the claims requested, thus
					// there has been a situation where both tokens are expired.
					if (this._isBrokerAvailable) {
						this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] forcing refresh with different claims...`);
						const newRequest = { ...request, claims: request.claims ?? '{ "access_token": {}}' };
						result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(newRequest));
						this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] got forced result with different claims`);
						const newIdTokenExpirationInSecs = (result.idTokenClaims as { exp?: number }).exp;
						if (newIdTokenExpirationInSecs) {
							const fiveMinutesBefore = new Date(
								(newIdTokenExpirationInSecs - 5 * 60) // subtract 5 minutes
								* 1000 // convert to milliseconds
							);
							if (fiveMinutesBefore < new Date()) {
								this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] id token is still expired.`);
							}
						}
					}
				}
			}
		}

		if (!result.account) {
			this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] no account found in result`);
		} else if (!result.fromCache && this._verifyIfUsingBroker(result)) {
			this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] firing event due to change`);
			this._onDidAccountsChangeEmitter.fire({ added: [], changed: [result.account], deleted: [] });
		}
		return result;
	}

	async acquireTokenInteractive(request: InteractiveRequest): Promise<AuthenticationResult> {
		this._logger.debug(`[acquireTokenInteractive] [${this._clientId}] [${request.authority}] [${request.scopes?.join(' ')}] loopbackClientOverride: ${request.loopbackClient ? 'true' : 'false'}`);
		return await window.withProgress(
			{
				location: ProgressLocation.Notification,
				cancellable: true,
				title: l10n.t('Signing in to Microsoft...')
			},
			(_process, token) => this._sequencer.queue(async () => {
				const result = await raceCancellationAndTimeoutError(
					this._pca.acquireTokenInteractive(request),
					token,
					1000 * 60 * 5
				);
				if (this._isBrokerAvailable) {
					await this._accountAccess.setAllowedAccess(result.account!, true);
				}
				// Force an update so that the account cache is updated.
				// TODO:@TylerLeonhardt The problem is, we use the sequencer for
				// change events but we _don't_ use it for the accounts cache.
				// We should probably use it for the accounts cache as well.
				await this._update();
				return result;
			})
		);
	}

	/**
	 * Allows for passing in a refresh token to get a new access token. This is the migration scenario.
	 * TODO: MSAL Migration. Remove this when we remove the old flow.
	 * @param request a {@link RefreshTokenRequest} object that contains the refresh token and other parameters.
	 * @returns an {@link AuthenticationResult} object that contains the result of the token acquisition operation.
	 */
	async acquireTokenByRefreshToken(request: RefreshTokenRequest): Promise<AuthenticationResult | null> {
		this._logger.debug(`[acquireTokenByRefreshToken] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}]`);
		const result = await this._sequencer.queue(async () => {
			const result = await this._pca.acquireTokenByRefreshToken(request);
			// Force an update so that the account cache is updated.
			// TODO:@TylerLeonhardt The problem is, we use the sequencer for
			// change events but we _don't_ use it for the accounts cache.
			// We should probably use it for the accounts cache as well.
			await this._update();
			return result;
		});
		if (result) {
			// this._setupRefresh(result);
			if (this._isBrokerAvailable && result.account) {
				await this._accountAccess.setAllowedAccess(result.account, true);
			}
		}
		return result;
	}

	removeAccount(account: AccountInfo): Promise<void> {
		if (this._isBrokerAvailable) {
			return this._accountAccess.setAllowedAccess(account, false);
		}
		return this._sequencer.queue(() => this._pca.getTokenCache().removeAccount(account));
	}

	private _registerOnSecretStorageChanged() {
		if (this._isBrokerAvailable) {
			return this._accountAccess.onDidAccountAccessChange(() => this._sequencer.queue(() => this._update()));
		}
		return this._secretStorageCachePlugin.onDidChange(() => this._sequencer.queue(() => this._update()));
	}

	private _lastSeen = new Map<string, number>();
	private _verifyIfUsingBroker(result: AuthenticationResult): boolean {
		// If we're not brokering, we don't need to verify the date
		// the cache check will be sufficient
		if (!result.fromNativeBroker) {
			return true;
		}
		// The nativeAccountId is what the broker uses to differenciate all
		// types of accounts. Even if the "account" is a duplicate of another because
		// it's actaully a guest account in another tenant.
		let key = result.account!.nativeAccountId;
		if (!key) {
			this._logger.error(`[verifyIfUsingBroker] [${this._clientId}] [${result.account!.username}] no nativeAccountId found. Using homeAccountId instead.`);
			key = result.account!.homeAccountId;
		}
		const lastSeen = this._lastSeen.get(key);
		const lastTimeAuthed = result.account!.idTokenClaims!.iat!;
		if (!lastSeen) {
			this._lastSeen.set(key, lastTimeAuthed);
			return true;
		}
		if (lastSeen === lastTimeAuthed) {
			return false;
		}
		this._lastSeen.set(key, lastTimeAuthed);
		return true;
	}

	private async _update() {
		const before = this._accounts;
		this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication update before: ${before.length}`);
		// Clear in-memory cache so we know we're getting account data from the SecretStorage
		this._pca.clearCache();
		let after = await this._pca.getAllAccounts();
		if (this._isBrokerAvailable) {
			after = after.filter(a => this._accountAccess.isAllowedAccess(a));
		}
		this._accounts = after;
		this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication update after: ${after.length}`);

		const beforeSet = new Set(before.map(b => b.homeAccountId));
		const afterSet = new Set(after.map(a => a.homeAccountId));

		const added = after.filter(a => !beforeSet.has(a.homeAccountId));
		const deleted = before.filter(b => !afterSet.has(b.homeAccountId));
		if (added.length > 0 || deleted.length > 0) {
			this._onDidAccountsChangeEmitter.fire({ added, changed: [], deleted });
			this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication accounts changed. added: ${added.length}, deleted: ${deleted.length}`);
			if (!after.length) {
				this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication final account deleted. Firing event.`);
				this._onDidRemoveLastAccountEmitter.fire();
			}
		}
		this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication update complete`);
	}
}

export class Sequencer {

	private current: Promise<unknown> = Promise.resolve(null);

	queue<T>(promiseTask: () => Promise<T>): Promise<T> {
		return this.current = this.current.then(() => promiseTask(), () => promiseTask());
	}
}

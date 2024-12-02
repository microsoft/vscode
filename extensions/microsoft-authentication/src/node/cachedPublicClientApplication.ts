/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PublicClientApplication, AccountInfo, Configuration, SilentFlowRequest, AuthenticationResult, InteractiveRequest, LogLevel, RefreshTokenRequest } from '@azure/msal-node';
import { NativeBrokerPlugin } from '@azure/msal-node-extensions';
import { Disposable, Memento, SecretStorage, LogOutputChannel, window, ProgressLocation, l10n, EventEmitter } from 'vscode';
import { Delayer, raceCancellationAndTimeoutError } from '../common/async';
import { SecretStorageCachePlugin } from '../common/cachePlugin';
import { MsalLoggerOptions } from '../common/loggerOptions';
import { ICachedPublicClientApplication } from '../common/publicClientCache';
import { ScopedAccountAccess } from '../common/accountAccess';

export class CachedPublicClientApplication implements ICachedPublicClientApplication {
	private _pca: PublicClientApplication;
	private _sequencer = new Sequencer();
	private readonly _refreshDelayer = new DelayerByKey<AuthenticationResult>();

	private _accounts: AccountInfo[] = [];
	private readonly _disposable: Disposable;

	private readonly _loggerOptions = new MsalLoggerOptions(this._logger);
	private readonly _secretStorageCachePlugin = new SecretStorageCachePlugin(
		this._secretStorage,
		// Include the prefix as a differentiator to other secrets
		`pca:${JSON.stringify({ clientId: this._clientId, authority: this._authority })}`
	);
	private readonly _accountAccess = new ScopedAccountAccess(this._secretStorage, this._cloudName, this._clientId, this._authority);
	private readonly _config: Configuration = {
		auth: { clientId: this._clientId, authority: this._authority },
		system: {
			loggerOptions: {
				correlationId: `${this._clientId}] [${this._authority}`,
				loggerCallback: (level, message, containsPii) => this._loggerOptions.loggerCallback(level, message, containsPii),
				logLevel: LogLevel.Trace
			}
		},
		broker: {
			nativeBrokerPlugin: new NativeBrokerPlugin()
		},
		cache: {
			cachePlugin: this._secretStorageCachePlugin
		}
	};
	private readonly _isBrokerAvailable = this._config.broker?.nativeBrokerPlugin?.isBrokerAvailable ?? false;

	//#region Events

	private readonly _onDidAccountsChangeEmitter = new EventEmitter<{ added: AccountInfo[]; changed: AccountInfo[]; deleted: AccountInfo[] }>;
	readonly onDidAccountsChange = this._onDidAccountsChangeEmitter.event;

	private readonly _onDidRemoveLastAccountEmitter = new EventEmitter<void>();
	readonly onDidRemoveLastAccount = this._onDidRemoveLastAccountEmitter.event;

	//#endregion

	constructor(
		private readonly _clientId: string,
		private readonly _authority: string,
		private readonly _cloudName: string,
		private readonly _globalMemento: Memento,
		private readonly _secretStorage: SecretStorage,
		private readonly _logger: LogOutputChannel
	) {
		// TODO:@TylerLeonhardt clean up old use of memento. Remove this in an iteration
		this._globalMemento.update(`lastRemoval:${this._clientId}:${this._authority}`, undefined);
		this._pca = new PublicClientApplication(this._config);
		this._disposable = Disposable.from(
			this._registerOnSecretStorageChanged(),
			this._onDidAccountsChangeEmitter,
			this._onDidRemoveLastAccountEmitter
		);
	}

	get accounts(): AccountInfo[] { return this._accounts; }
	get clientId(): string { return this._clientId; }
	get authority(): string { return this._authority; }

	async initialize(): Promise<void> {
		if (this._isBrokerAvailable) {
			await this._accountAccess.initialize();
		}
		await this._sequencer.queue(() => this._update());
	}

	dispose(): void {
		this._disposable.dispose();
	}

	async acquireTokenSilent(request: SilentFlowRequest): Promise<AuthenticationResult> {
		this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}] [${request.account.username}] starting...`);
		const result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(request));
		this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}] [${request.account.username}] got result`);
		this._setupRefresh(result);
		if (result.account && !result.fromCache && this._verifyIfUsingBroker(result)) {
			this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}] [${request.account.username}] firing event due to change`);
			this._onDidAccountsChangeEmitter.fire({ added: [], changed: [result.account], deleted: [] });
		}
		return result;
	}

	async acquireTokenInteractive(request: InteractiveRequest): Promise<AuthenticationResult> {
		this._logger.debug(`[acquireTokenInteractive] [${this._clientId}] [${this._authority}] [${request.scopes?.join(' ')}] loopbackClientOverride: ${request.loopbackClient ? 'true' : 'false'}`);
		const result = await window.withProgress(
			{
				location: ProgressLocation.Notification,
				cancellable: true,
				title: l10n.t('Signing in to Microsoft...')
			},
			(_process, token) => raceCancellationAndTimeoutError(
				this._sequencer.queue(() => this._pca.acquireTokenInteractive(request)),
				token,
				1000 * 60 * 5
			)
		);
		this._setupRefresh(result);
		if (this._isBrokerAvailable) {
			await this._accountAccess.setAllowedAccess(result.account!, true);
		}
		return result;
	}

	/**
	 * Allows for passing in a refresh token to get a new access token. This is the migration scenario.
	 * TODO: MSAL Migration. Remove this when we remove the old flow.
	 * @param request a {@link RefreshTokenRequest} object that contains the refresh token and other parameters.
	 * @returns an {@link AuthenticationResult} object that contains the result of the token acquisition operation.
	 */
	async acquireTokenByRefreshToken(request: RefreshTokenRequest) {
		this._logger.debug(`[acquireTokenByRefreshToken] [${this._clientId}] [${this._authority}] [${request.scopes.join(' ')}]`);
		const result = await this._sequencer.queue(() => this._pca.acquireTokenByRefreshToken(request));
		if (result) {
			this._setupRefresh(result);
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
		const key = result.account!.homeAccountId;
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
		this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication update before: ${before.length}`);
		// Clear in-memory cache so we know we're getting account data from the SecretStorage
		this._pca.clearCache();
		let after = await this._pca.getAllAccounts();
		if (this._isBrokerAvailable) {
			after = after.filter(a => this._accountAccess.isAllowedAccess(a));
		}
		this._accounts = after;
		this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication update after: ${after.length}`);

		const beforeSet = new Set(before.map(b => b.homeAccountId));
		const afterSet = new Set(after.map(a => a.homeAccountId));

		const added = after.filter(a => !beforeSet.has(a.homeAccountId));
		const deleted = before.filter(b => !afterSet.has(b.homeAccountId));
		if (added.length > 0 || deleted.length > 0) {
			this._onDidAccountsChangeEmitter.fire({ added, changed: [], deleted });
			this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication accounts changed. added: ${added.length}, deleted: ${deleted.length}`);
			if (!after.length) {
				this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication final account deleted. Firing event.`);
				this._onDidRemoveLastAccountEmitter.fire();
			}
		}
		this._logger.debug(`[update] [${this._clientId}] [${this._authority}] CachedPublicClientApplication update complete`);
	}

	private _setupRefresh(result: AuthenticationResult) {
		const on = result.refreshOn || result.expiresOn;
		if (!result.account || !on) {
			return;
		}

		const account = result.account;
		const scopes = result.scopes;
		const timeToRefresh = on.getTime() - Date.now() - 5 * 60 * 1000; // 5 minutes before expiry
		const key = JSON.stringify({ accountId: account.homeAccountId, scopes });
		this._logger.debug(`[_setupRefresh] [${this._clientId}] [${this._authority}] [${scopes.join(' ')}] [${account.username}] timeToRefresh: ${timeToRefresh}`);
		this._refreshDelayer.trigger(
			key,
			() => this.acquireTokenSilent({ account, scopes, redirectUri: 'https://vscode.dev/redirect', forceRefresh: true }),
			timeToRefresh > 0 ? timeToRefresh : 0
		);
	}
}

export class Sequencer {

	private current: Promise<unknown> = Promise.resolve(null);

	queue<T>(promiseTask: () => Promise<T>): Promise<T> {
		return this.current = this.current.then(() => promiseTask(), () => promiseTask());
	}
}

class DelayerByKey<T> {
	private _delayers = new Map<string, Delayer<T>>();

	trigger(key: string, fn: () => Promise<T>, delay: number): Promise<T> {
		let delayer = this._delayers.get(key);
		if (!delayer) {
			delayer = new Delayer<T>(delay);
			this._delayers.set(key, delayer);
		}

		return delayer.trigger(fn, delay);
	}
}

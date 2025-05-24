/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { Keychain } from './common/keychain';
import { GitHubServer, IGitHubServer } from './githubServer';
import { PromiseAdapter, arrayEquals, promiseFromEvent } from './common/utils';
import { ExperimentationTelemetry } from './common/experimentationService';
import { Log } from './common/logger';
import { crypto } from './node/crypto';
import { TIMED_OUT_ERROR, USER_CANCELLATION_ERROR } from './common/errors';

interface SessionData {
	id: string;
	account?: {
		label?: string;
		displayName?: string;
		// Unfortunately, for some time the id was a number, so we need to support both.
		// This can be removed once we are confident that all users have migrated to the new id.
		id: string | number;
	};
	scopes: string[];
	accessToken: string;
}

export enum AuthProviderType {
	github = 'github',
	githubEnterprise = 'github-enterprise'
}

export class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	private readonly _pendingNonces = new Map<string, string[]>();
	private readonly _codeExchangePromises = new Map<string, { promise: Promise<string>; cancel: vscode.EventEmitter<void> }>();

	public handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}

	public async waitForCode(logger: Log, scopes: string, nonce: string, token: vscode.CancellationToken) {
		const existingNonces = this._pendingNonces.get(scopes) || [];
		this._pendingNonces.set(scopes, [...existingNonces, nonce]);

		let codeExchangePromise = this._codeExchangePromises.get(scopes);
		if (!codeExchangePromise) {
			codeExchangePromise = promiseFromEvent(this.event, this.handleEvent(logger, scopes));
			this._codeExchangePromises.set(scopes, codeExchangePromise);
		}

		try {
			return await Promise.race([
				codeExchangePromise.promise,
				new Promise<string>((_, reject) => setTimeout(() => reject(TIMED_OUT_ERROR), 300_000)), // 5min timeout
				promiseFromEvent<void, string>(token.onCancellationRequested, (_, __, reject) => { reject(USER_CANCELLATION_ERROR); }).promise
			]);
		} finally {
			this._pendingNonces.delete(scopes);
			codeExchangePromise?.cancel.fire();
			this._codeExchangePromises.delete(scopes);
		}
	}

	private handleEvent: (logger: Log, scopes: string) => PromiseAdapter<vscode.Uri, string> =
		(logger: Log, scopes) => (uri, resolve, reject) => {
			const query = new URLSearchParams(uri.query);
			const code = query.get('code');
			const nonce = query.get('nonce');
			if (!code) {
				reject(new Error('No code'));
				return;
			}
			if (!nonce) {
				reject(new Error('No nonce'));
				return;
			}

			const acceptedNonces = this._pendingNonces.get(scopes) || [];
			if (!acceptedNonces.includes(nonce)) {
				// A common scenario of this happening is if you:
				// 1. Trigger a sign in with one set of scopes
				// 2. Before finishing 1, you trigger a sign in with a different set of scopes
				// In this scenario we should just return and wait for the next UriHandler event
				// to run as we are probably still waiting on the user to hit 'Continue'
				logger.info('Nonce not found in accepted nonces. Skipping this execution...');
				return;
			}

			resolve(code);
		};
}

export class GitHubAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private readonly _logger: Log;
	private readonly _githubServer: IGitHubServer;
	private readonly _telemetryReporter: ExperimentationTelemetry;
	private readonly _keychain: Keychain;
	private readonly _accountsSeen = new Set<string>();
	private readonly _disposable: vscode.Disposable | undefined;

	private _sessionsPromise: Promise<vscode.AuthenticationSession[]>;

	constructor(
		private readonly context: vscode.ExtensionContext,
		uriHandler: UriEventHandler,
		ghesUri?: vscode.Uri
	) {
		const { aiKey } = context.extension.packageJSON as { name: string; version: string; aiKey: string };
		this._telemetryReporter = new ExperimentationTelemetry(context, new TelemetryReporter(aiKey));

		const type = ghesUri ? AuthProviderType.githubEnterprise : AuthProviderType.github;

		this._logger = new Log(type);

		this._keychain = new Keychain(
			this.context,
			type === AuthProviderType.github
				? `${type}.auth`
				: `${ghesUri?.authority}${ghesUri?.path}.ghes.auth`,
			this._logger);

		this._githubServer = new GitHubServer(
			this._logger,
			this._telemetryReporter,
			uriHandler,
			context.extension.extensionKind,
			ghesUri);

		// Contains the current state of the sessions we have available.
		this._sessionsPromise = this.readSessions().then((sessions) => {
			// fire telemetry after a second to allow the workbench to focus on loading
			setTimeout(() => sessions.forEach(s => this.afterSessionLoad(s)), 1000);
			return sessions;
		});

		this._disposable = vscode.Disposable.from(
			this._telemetryReporter,
			vscode.authentication.registerAuthenticationProvider(
				type,
				this._githubServer.friendlyName,
				this,
				{
					supportsMultipleAccounts: true,
					supportedIssuers: [
						ghesUri ?? vscode.Uri.parse('https://github.com/login/oauth')
					]
				}
			),
			this.context.secrets.onDidChange(() => this.checkForUpdates())
		);
	}

	dispose() {
		this._disposable?.dispose();
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event;
	}

	async getSessions(scopes: string[] | undefined, options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
		// For GitHub scope list, order doesn't matter so we immediately sort the scopes
		const sortedScopes = scopes?.sort() || [];
		this._logger.info(`Getting sessions for ${sortedScopes.length ? sortedScopes.join(',') : 'all scopes'}...`);
		const sessions = await this._sessionsPromise;
		const accountFilteredSessions = options?.account
			? sessions.filter(session => session.account.label === options.account?.label)
			: sessions;
		const finalSessions = sortedScopes.length
			? accountFilteredSessions.filter(session => arrayEquals([...session.scopes].sort(), sortedScopes))
			: accountFilteredSessions;

		this._logger.info(`Got ${finalSessions.length} sessions for ${sortedScopes?.join(',') ?? 'all scopes'}...`);
		return finalSessions;
	}

	private async afterSessionLoad(session: vscode.AuthenticationSession): Promise<void> {
		// We only want to fire a telemetry if we haven't seen this account yet in this session.
		if (!this._accountsSeen.has(session.account.id)) {
			this._accountsSeen.add(session.account.id);
			this._githubServer.sendAdditionalTelemetryInfo(session);
		}
	}

	private async checkForUpdates() {
		const previousSessions = await this._sessionsPromise;
		this._sessionsPromise = this.readSessions();
		const storedSessions = await this._sessionsPromise;

		const added: vscode.AuthenticationSession[] = [];
		const removed: vscode.AuthenticationSession[] = [];

		storedSessions.forEach(session => {
			const matchesExisting = previousSessions.some(s => s.id === session.id);
			// Another window added a session to the keychain, add it to our state as well
			if (!matchesExisting) {
				this._logger.info('Adding session found in keychain');
				added.push(session);
			}
		});

		previousSessions.forEach(session => {
			const matchesExisting = storedSessions.some(s => s.id === session.id);
			// Another window has logged out, remove from our state
			if (!matchesExisting) {
				this._logger.info('Removing session no longer found in keychain');
				removed.push(session);
			}
		});

		if (added.length || removed.length) {
			this._sessionChangeEmitter.fire({ added, removed, changed: [] });
		}
	}

	private async readSessions(): Promise<vscode.AuthenticationSession[]> {
		let sessionData: SessionData[];
		try {
			this._logger.info('Reading sessions from keychain...');
			const storedSessions = await this._keychain.getToken();
			if (!storedSessions) {
				return [];
			}
			this._logger.info('Got stored sessions!');

			try {
				sessionData = JSON.parse(storedSessions);
			} catch (e) {
				await this._keychain.deleteToken();
				throw e;
			}
		} catch (e) {
			this._logger.error(`Error reading token: ${e}`);
			return [];
		}

		// Unfortunately, we were using a number secretly for the account id for some time... this is due to a bad `any`.
		// AuthenticationSession's account id is a string, so we need to detect when there is a number accountId and re-store
		// the sessions to migrate away from the bad number usage.
		// TODO@TylerLeonhardt: Remove this after we are confident that all users have migrated to the new id.
		let seenNumberAccountId: boolean = false;
		// TODO: eventually remove this Set because we should only have one session per set of scopes.
		const scopesSeen = new Set<string>();
		const sessionPromises = sessionData.map(async (session: SessionData): Promise<vscode.AuthenticationSession | undefined> => {
			// For GitHub scope list, order doesn't matter so we immediately sort the scopes
			const scopesStr = [...session.scopes].sort().join(' ');
			let userInfo: { id: string; accountName: string } | undefined;
			if (!session.account) {
				try {
					userInfo = await this._githubServer.getUserInfo(session.accessToken);
					this._logger.info(`Verified session with the following scopes: ${scopesStr}`);
				} catch (e) {
					// Remove sessions that return unauthorized response
					if (e.message === 'Unauthorized') {
						return undefined;
					}
				}
			}

			this._logger.trace(`Read the following session from the keychain with the following scopes: ${scopesStr}`);
			scopesSeen.add(scopesStr);

			let accountId: string;
			if (session.account?.id) {
				if (typeof session.account.id === 'number') {
					seenNumberAccountId = true;
				}
				accountId = `${session.account.id}`;
			} else {
				accountId = userInfo?.id ?? '<unknown>';
			}
			return {
				id: session.id,
				account: {
					label: session.account
						? session.account.label ?? session.account.displayName ?? '<unknown>'
						: userInfo?.accountName ?? '<unknown>',
					id: accountId
				},
				// we set this to session.scopes to maintain the original order of the scopes requested
				// by the extension that called getSession()
				scopes: session.scopes,
				accessToken: session.accessToken
			};
		});

		const verifiedSessions = (await Promise.allSettled(sessionPromises))
			.filter(p => p.status === 'fulfilled')
			.map(p => (p as PromiseFulfilledResult<vscode.AuthenticationSession | undefined>).value)
			.filter(<T>(p?: T): p is T => Boolean(p));

		this._logger.info(`Got ${verifiedSessions.length} verified sessions.`);
		if (seenNumberAccountId || verifiedSessions.length !== sessionData.length) {
			await this.storeSessions(verifiedSessions);
		}

		return verifiedSessions;
	}

	private async storeSessions(sessions: vscode.AuthenticationSession[]): Promise<void> {
		this._logger.info(`Storing ${sessions.length} sessions...`);
		this._sessionsPromise = Promise.resolve(sessions);
		await this._keychain.setToken(JSON.stringify(sessions));
		this._logger.info(`Stored ${sessions.length} sessions!`);
	}

	public async createSession(scopes: string[], options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
		try {
			// For GitHub scope list, order doesn't matter so we use a sorted scope to determine
			// if we've got a session already.
			const sortedScopes = [...scopes].sort();

			/* __GDPR__
				"login" : {
					"owner": "TylerLeonhardt",
					"comment": "Used to determine how much usage the GitHub Auth Provider gets.",
					"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
				}
			*/
			this._telemetryReporter?.sendTelemetryEvent('login', {
				scopes: JSON.stringify(scopes),
			});

			const sessions = await this._sessionsPromise;
			const loginWith = options?.account?.label;
			this._logger.info(`Logging in with '${loginWith ? loginWith : 'any'}' account...`);
			const scopeString = sortedScopes.join(' ');
			const token = await this._githubServer.login(scopeString, loginWith);
			const session = await this.tokenToSession(token, scopes);
			this.afterSessionLoad(session);

			const sessionIndex = sessions.findIndex(s => s.account.id === session.account.id && arrayEquals([...s.scopes].sort(), sortedScopes));
			const removed = new Array<vscode.AuthenticationSession>();
			if (sessionIndex > -1) {
				removed.push(...sessions.splice(sessionIndex, 1, session));
			} else {
				sessions.push(session);
			}
			await this.storeSessions(sessions);

			this._sessionChangeEmitter.fire({ added: [session], removed, changed: [] });

			this._logger.info('Login success!');

			return session;
		} catch (e) {
			// If login was cancelled, do not notify user.
			if (e === 'Cancelled' || e.message === 'Cancelled') {
				/* __GDPR__
					"loginCancelled" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users cancel the login flow." }
				*/
				this._telemetryReporter?.sendTelemetryEvent('loginCancelled');
				throw e;
			}

			/* __GDPR__
				"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into an error login flow." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('loginFailed');

			vscode.window.showErrorMessage(vscode.l10n.t('Sign in failed: {0}', `${e}`));
			this._logger.error(e);
			throw e;
		}
	}

	private async tokenToSession(token: string, scopes: string[]): Promise<vscode.AuthenticationSession> {
		const userInfo = await this._githubServer.getUserInfo(token);
		return {
			id: crypto.getRandomValues(new Uint32Array(2)).reduce((prev, curr) => prev += curr.toString(16), ''),
			accessToken: token,
			account: { label: userInfo.accountName, id: userInfo.id },
			scopes
		};
	}

	public async removeSession(id: string) {
		try {
			/* __GDPR__
				"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out of an account." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logout');

			this._logger.info(`Logging out of ${id}`);

			const sessions = await this._sessionsPromise;
			const sessionIndex = sessions.findIndex(session => session.id === id);
			if (sessionIndex > -1) {
				const session = sessions[sessionIndex];
				sessions.splice(sessionIndex, 1);

				await this.storeSessions(sessions);
				await this._githubServer.logout(session);

				this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
			} else {
				this._logger.error('Session not found');
			}
		} catch (e) {
			/* __GDPR__
				"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often logging out of an account fails." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logoutFailed');

			vscode.window.showErrorMessage(vscode.l10n.t('Sign out failed: {0}', `${e}`));
			this._logger.error(e);
			throw e;
		}
	}
}
